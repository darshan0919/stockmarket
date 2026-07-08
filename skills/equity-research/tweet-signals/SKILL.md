---
name: tweet-signals
description: Daily high-conviction signal extraction from an X (Twitter) list of Indian market accounts — browser-capture tweets from the last 24h (no paid API, no stored session secrets), resolve companies via the shared company-master DB (NSE ticker / BSE scrip / keywords), deterministically classify each into ORDER_WIN / CORPORATE_ACTION / EARNINGS_RESULTS / RATING_CREDIT / REGULATORY_POLICY / GEOPOLITICAL_MACRO / BULK_BLOCK_DEAL / OPINION_COMMENTARY with a content-only conviction score, then compose and email a signals briefing. Invoke with defaults for the daily run, or on demand to re-process a capture.
---

# Tweet Signals (X List → Conviction Briefing)

Script-first, browser-second: a Chrome-driven capture step gathers the raw tweets (no
credentials stored, no paid API), a deterministic classifier script does 100% of the
categorization, and your only job is the briefing synthesis over its output. Do NOT
re-classify tweets yourself — the script already did that.

## Why browser capture, not the raw GraphQL API

X's ToS prohibits automated scraping outside its official (paid) API, and the internal
`ListLatestTweetsTimeline` GraphQL endpoint is not public. Rather than store session
cookies/`auth_token`/`ct0` in `.env` (fragile — tokens rotate every few weeks, and storing
live session secrets is a security liability), this skill drives the user's **already
logged-in Chrome session** via the Claude in Chrome extension. This requires Chrome to be
open with the extension connected at run time — it will not wake or launch the browser.

### Two capture methods — use the extension one; DOM-read is the fallback

**Primary: `tools/tweet-signal-capture-extension/` (real JSON, use this).** A normal
Chrome extension content script runs in an *isolated* JS world — separate from the page's
own JS — so a `window.fetch` override placed there does NOT see the page's real network
calls. This was tried first and silently captured nothing. The fix: the extension's
`inject.js` declares `"world": "MAIN"` in its manifest, which injects it into the page's
actual JS realm. A `fetch`/XHR override there genuinely intercepts
`ListLatestTweetsTimeline` responses and logs the full JSON body to the console (tagged
`[TWEET_SIGNAL_CAPTURE]`), with no cookies/tokens ever touched or stored. Load it once via
`chrome://extensions` → Developer Mode → Load unpacked (manual, one-time, human step — not
something to automate). Read it back with the Chrome MCP's console-reading tool, filtered
to the tag; results are large, so read them from the tool's saved output file with
targeted `grep`/regex rather than loading the whole thing into context.

**Fallback: DOM read via `read_page`.** If the extension isn't loaded, `read_page` (filter
`all`, depth ~6) against the virtualized `<article>` cards still works, but only returns
whatever's currently rendered — X unmounts off-screen tweets as you scroll, so this method
loses data unless you capture at every scroll stop and dedupe by status ID as you go. It
also only has UI-rendered fields (relative timestamps like "16h", formatted counts like
"44K"), not the exact ISO timestamps / full figures the JSON has.

## Step 1 — Browser capture (Claude in Chrome, your judgment)

1. Confirm the extension is loaded (console should show `HOOK_INSTALLED` on any x.com
   page load — check once at the start of a session, not every run).
2. Navigate to the list URL: `https://x.com/i/lists/<listId>`.
3. Scroll the timeline to accumulate the last 24h of tweets. Use short wheel-scroll
   bursts (`scroll_amount: 8-10`) with a **1 second** wait between bursts. (A keyboard
   `End`-key jump was tried and is faster in principle, but reliably stalls after the
   first press once focus leaves the scroll container — stick to wheel-scroll.)
4. Stop once relative timestamps cross into absolute dates (e.g. "Jul 7" while today is
   Jul 8) — that is the 24h boundary. No need to read anything mid-scroll — the extension
   is capturing every paginated response in the background regardless of what's rendered.
5. Read the console log (pattern `[TWEET_SIGNAL_CAPTURE]` or a narrower field-level regex
   like `full_text\\":\\"[^\\\\]{1,300}` to keep the pulled text small), extract tweet
   text from the captured JSON bodies, dedupe (X's data model repeats a retweet's
   underlying text under both the wrapper and the quoted tweet), and write to
   `jobs/data/tweet_signals/{date}_tweets_raw.json`:
   `{ listId, listName, capturedAt, captureMethod: "extension-network-interception", tweets: [{id, author, text}] }`.

**Known gap (TODO, not yet solved):** the field-extraction regex above pulls `full_text`
cleanly but author handle / exact timestamp per tweet still need a matching extraction
pass (`screen_name`, `created_at` fields exist in the same JSON, same approach). This no
longer blocks HIGH-conviction output (conviction is content-only now, see Step 2), but it
does mean the briefing can't yet show "via @account" attribution or exact post time.

## Step 2 — Company master DB (shared infra, run before/alongside the classifier)

This solves the NSE-ticker ↔ BSE-scrip-code ↔ company-name mapping problem that several
skills in this repo have hit independently. **One shared JSON file** is now the source of
truth: `packages/jobs-runtime/data/company-master.json`, each record —
`{ companyId, nseTicker, bseTicker, companyName, keywords[] }` — `companyId` is
`NSE:<TICKER>` when NSE-listed, else `BSE:<SCRIPCODE>`. Any skill needing ticker↔scrip
resolution should use `packages/jobs-runtime/lib/companyMaster.js`
(`loadCompanyMaster` / `findByTicker` / `findByScripCode` / `findInText`) instead of
re-deriving its own mapping.

```bash
RUNTIME=packages/jobs-runtime
node "$RUNTIME/companyMasterSync.js"              # daily: refresh from Kite instruments
node "$RUNTIME/companyKeywordEnricher.js" jobs/data/tweet_signals/{date}_tweets_raw.json
```

- **`companyMasterSync.js`** fetches `https://api.kite.trade/instruments` — Kite Connect's
  public instruments CSV, confirmed unauthenticated (same endpoint already used in
  `dealsDigest.js`'s `isAvailableOnNSE()`, no API key needed) — and rebuilds
  `nseTicker`/`bseTicker`/`companyName` for ~12k companies, joining NSE and BSE listings by
  normalized company name. It preserves `keywords[]` already on file across syncs — it
  never wipes accumulated keyword learning.
- **`companyKeywordEnricher.js`** reads a day's raw tweet dump and adds high-confidence
  keyword aliases: a candidate phrase (e.g. `"CEIGALL INDIA LTD"` from a tweet reading
  `"CEIGALL INDIA LTD: CO. EMERGES AS L1 BIDDER..."`) is only added as a keyword when it
  can be tied to an already-known company via an exact `#TICKER` hashtag match or a
  normalized-name match **within that same tweet** — no cross-tweet or fuzzy guessing, to
  avoid polluting shared infra with wrong aliases. Run this AFTER Step 1's capture and
  BEFORE Step 3's classification, so same-day aliases are available immediately.

This file lives outside `jobs/data/` and is NOT offloaded/wiped by `offloadToDrive.js` in
Step 5 — it's reference infrastructure other skills depend on synchronously, not a report
artifact, so it should persist locally (and be committed) like code.

## Step 3 — Classifier (Node, deterministic, no API)

```bash
CLS=$(find /sessions -path '*packages/jobs-runtime/lib/tweetSignalsClassifier.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
node "$CLS" jobs/data/tweet_signals/{date}_tweets_raw.json
```

Reads the raw JSON, applies keyword-rule categorization, and writes
`jobs/data/tweet_signals/{date}_insights.json` with `signals[]` — each carries the DTO
envelope (`companyId`, `creationTime`, `modifiedTime`, `creator: "tweet-signals"`) per
`skills/tooling/output-dto-standard/SKILL.md`, plus `category`, `conviction`
(HIGH/MEDIUM/LOW/NOISE), `nseTicker`, `bseTicker`, `evidence[]`, `inDigest`.

**Conviction is content-only** (per feedback — source/author verification is not a
signal of whether an announcement is material, so it's not used):
- `HIGH`: material category (ORDER_WIN / CORPORATE_ACTION / EARNINGS_RESULTS /
  RATING_CREDIT) + a quantified figure + that figure is materially sized (≥₹100cr or
  ≥10%).
- `MEDIUM`: material category + any quantified figure (below the large-figure threshold).
- `LOW`: material category with no quantified figure, or a non-material but relevant
  category (REGULATORY_POLICY, GEOPOLITICAL_MACRO, BULK_BLOCK_DEAL) with a figure.
- `NOISE`: OPINION_COMMENTARY or uncategorized.

Company resolution goes through `companyMaster.findInText()` (ticker hashtag → known
keyword → normalized name substring, in that priority order) instead of a bare `#TICKER`
regex, so prose-only announcements without a hashtag still resolve.

**Known limitations to disclose in the briefing, not silently paper over:**
- Not every tweet resolves to a company even with the master DB + enricher (e.g. macro
  news like "SMP KOLKATA..." or abbreviations like "RCF" that don't exactly match Kite's
  `tradingsymbol`/`name` fields) — `companyId` falls back to `UNKNOWN:<author>` and the
  briefing should say so rather than guess.
- The same company reported by two different accounts is not yet deduped into one signal
  (e.g. an order-win reported both as a headline tweet and a separate hashtag-only tweet
  currently produce two records with the same `companyId` — that's arguably fine for now
  since they corroborate each other, but don't double-count them as two data points).
- Conviction is keyword/heuristic-based, not a language-model read of the announcement —
  treat HIGH as "worth a human look," not as a trading recommendation.
- A ~50-tweet single-list prototype is a small sample; before trusting this for daily
  decisions, validate classification accuracy against a few days of manually-checked
  output.

## Step 4 — Compose & send the briefing (your judgment)

Read the insights JSON. Build a Gmail-safe, inline-CSS HTML email, subject
`Tweet Signals — {listName} — {date}`.

- **Header:** total tweets captured vs. signals surfaced; note the capture method
  limitation (DOM-derived, not raw API) so the reader knows the provenance.
- **HIGH conviction:** one line per signal — `Company/Ticker — category — evidence`.
- **MEDIUM conviction:** condensed list.
- **Footer:** counts by conviction tier (`byConviction` from the JSON) and a reminder
  this is a heuristic filter, not verified research — cross-check before acting.

Use the same shared mailer pattern as `gainers-signal` (see that skill's Step 3).

## Step 5 — Offload & cleanup (MANDATORY, even on failure)

```bash
node "$RUNTIME/scripts/offloadToDrive.js"
```
Same as every other job in this repo — syncs `jobs/data/` to Drive and wipes the local
cache. Never leave `tweet_signals/*.json` sitting in the repo. This does NOT touch
`packages/jobs-runtime/data/company-master.json` — that file is outside `jobs/data/` on
purpose and should NOT be offloaded/wiped; it's shared reference infrastructure other
skills read directly.

## Rules
- Never store X session cookies, `auth_token`, or `ct0` anywhere (`.env`, files, or
  otherwise) — this skill only ever rides the user's live, already-authenticated browser
  session for the duration of the run.
- Do not attempt the raw GraphQL cURL replay approach — it requires storing live session
  secrets and is significantly more fragile (token rotation every few weeks) than the
  browser-capture approach for no real benefit at this volume.
- All outputs go under `jobs/data/tweet_signals/` — never the repo root — and always
  finish with Step 4.
