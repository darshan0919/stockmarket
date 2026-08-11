---
name: gainers-signal
description: Daily gainers ACTIONABILITY signal — pre-compute gainers + quality filters + dual-axis delivery (% and ₹ Cr) + bulk announcements (scanner), deterministically tier each into ACT / WATCH / NOTED with streaks and delivery-confirmed sector clusters (classifier), research the top-20 triggers from announcement PDFs, then email a tiered briefing. Invoke with defaults for the 8 AM run, or pass a specific market date on demand.
---

# Daily Gainers Signal

**The goal is actionability, not information.** A gainer is only worth the reader's
attention when a real-world CAUSE (a strong filing, or a sector-wide move) coincides
with EVIDENCE OF CONVICTION (delivery-backed buying, ideally sustained across
sessions). Either alone is merely interesting: an order win the market shrugged at is
not tradeable, and delivery with no discoverable cause is unexplained rather than
necessarily good. Everything below exists to make that distinction and to put the
short list at the top.

Script-first: two deterministic companion steps resolve every fact. Your judgment is
spent on exactly two things — reading announcement PDFs to identify the actual trigger
(Step 4), and composing the email (Step 3). Do NOT re-fetch or re-compute anything the
scripts already produced.

## Parameters (optional)

| Param     | Default          | Meaning                                                       |
| --------- | ---------------- | ------------------------------------------------------------- |
| `date`    | last trading day | market date (`--date YYYY-MM-DD`) for the scanner             |
| `email`   | on               | set off to build the briefing without sending                 |
| `--top-n` | `50`             | size of the gainers universe pulled by the scanner            |

## Setup

```bash
SCAN=$(find /sessions -path '*packages/jobs-runtime/gainersScanner.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
RUNTIME=$(dirname "$SCAN")   # …/packages/jobs-runtime
WI="$RUNTIME/watchlistInsights.js"   # shared I/O runtime for the announcement-insights skill (Step 4: read-pdf + insight-template)
```

Do NOT export `GAINERS_OUTPUT_DIR` / `WI_DATA_DIR` / `COWORK_ENV` — the scripts resolve
everything themselves: data root defaults to `<repo>/data/` and secrets to `<repo>/.env`.
Exporting paths derived from fragile `find`s is what previously scattered
`daily_gainers/`, `delivery_cache/` etc. at the repo root.

## Step 1 — Scanner (Node, deterministic)

```bash
node "$SCAN"                          # add `--date YYYY-MM-DD` to override the market date
node "$SCAN" --top-n 100              # one-off wider pull (default is 50)
```

Writes `data/runs/gainers_raw_{YYYYMMDD}.json`. If it yields 0 gainers (holiday / API
issue), send a "no signals today" email and stop.

**Trust the API's list as-is.** The scan is server-sorted (`orderBy: 'Returns 1D',
order: 'desc'`) and this scanner never locally re-sorts or re-derives membership —
Steps 1-2 only *layer analysis* on top of whatever the API returns (quality filters,
delivery, announcements, tiering), they don't second-guess which names belong on it.
Two fetches minutes apart can legitimately return different names — that's live data
moving, not a bug to chase. The one thing genuinely worth trusting less is the market
*date* label the scanner stamps on that list — see the `resolveMarketDate` note next.

**API efficiency.** The announcements endpoint **ignores `scan.companyIds`** — verified
live, a request naming two tickers returns unrelated ones. So the scanner creates a
throwaway watchlist holding the whole universe and scans by `watchlistIds`, which DOES
filter server-side and has no 10-company cap (unlike `companyFilters`). That took the
announcement step from thousands of pages to **4-5**. The scratch watchlist is a REAL
object in the account and is deleted in a `finally` — if you see `_gainers_scan_*`
watchlists accumulating, the cleanup is failing and should be investigated. If creation
fails the job falls back to the old market-wide sweep with a page cap, and marks
`announcements_meta.truncated` so the email can say "incomplete" rather than "none
found".

Retail holdings are a single batched scan. Delivery and price history are per-symbol
(no batch endpoint exists) but run at concurrency 8, with a disk-cached BSE scrip map.
Price history uses `ohlcv(tf='1h')` aggregated to daily — the older `prices()` endpoint
now 404s for every ticker, and `tf='1d'` is rejected with HTTP 400.

**Step ordering matters.** Price history is fetched BEFORE the quality filter, because
the gainers scan table has no `Close` column and BSE delivery *value* is derived from a
close price. Without it, BSE names had a null delivery value that sailed straight
through the ₹5 Cr `min_delivery_value_cr` floor — micro-caps delivering ₹0.08 Cr were
passing a ₹5 Cr filter and consuming top-20 research slots. Don't reorder these.

Each announcement is stamped by `lib/announcementTaxonomy.js` with:

- `category_derived` — the same 16 categories the `announcement-insights` skill's
  template library covers (one shared taxonomy module + one shared template library,
  so `watchlist-insights`, `gainers-signal`, and any future caller cannot drift apart
  the way they had). `demerger`, `merger`, `acquisition`, and `management_change` are
  additionally `HIGH_CONVICTION_CATEGORIES` — see `announcement-insights`' SKILL.md for
  why and Step 4 below for how that changes the research treatment here.
- `strength` — **STRONG** (results, order_book, acquisition, merger, demerger, capacity
  commencement, fundraise/QIP/preferential/warrants, SAST, management change) ·
  **SUPPORTING** (rating action, regulatory/USFDA/PLI, buyback, investor meet) ·
  **ROUTINE** (everything else, plus paperwork that merely wraps a real event —
  "newspaper publication of results" and "board meeting intimation to consider results"
  are not results)
- **scheduled vs unscheduled** — `results` and `dividend` are STRONG but *calendar-
  driven*: in results season nearly every gainer has filed one, so they earn less
  automatic credit than an unscheduled surprise (order win, SAST, QIP, M&A, capacity).
  Observed live: without this split, 14 of 38 names reached the top tier essentially
  because they had filed Q1 results. What makes an earnings move actionable is the
  surprise and the delivery behind it — the first is established by Step 4's PDF read,
  the second by the delivery data.
- `pdfUrl` — resolved S3 link, so Step 4 reads PDFs with zero extra API calls

## Step 1f — Concall sentiment enrichment (Node, non-fatal)

Runs automatically as part of Step 1 (`[2b/7]` in the scanner's log) —
`fetchConcallSentiment()` in `gainersScanner.js` scopes
`StockscansClient.concallScan()` to the quality-filtered gainer set via the
standard throwaway-watchlist pattern and attaches the result to each
gainer as `.concall`.

Why this exists: a bullish or optimistic concall filed in the days before a
gainer's move is a real, quantifiable reason for delivery-backed buying — the
same spirit as a STRONG announcement, but sentiment-shaped rather than a
discrete event. `resultQualityScore` (0-100) and `highlights` ride along so
Step 4 doesn't need a second call to explain WHY the sentiment landed where
it did.

Schema confirmed live 2026-08-01 (see `docs/stockscans-api-schemas.md` →
"POST /api/company/concall-scan" for the full row layout). Response envelope
is `{rows, next, quarter, subscription}`; `next` is a plain offset cursor
(not offset/total). `concall.recentWithinDays` is computed from row index 4
(the concall/result date) at fetch time, so the classifier's 7-day gate (Step
2) is live and real, not a stub. Indices 0, 5, 6, 7, 11 are read but not yet
load-bearing anywhere — confirm their meaning against a second live
company/quarter before a future change starts relying on one of them.

## Step 2 — Classifier (Node, deterministic, no API)

```bash
node "$RUNTIME/lib/gainersClassifier.js"
```

Writes classified signals into the events collection (`data/events-YYYY-MM.json`,
type=`gainer`) plus the DTO `data/runs/gainers_insights_{YYYYMMDD}.json`. Each signal
carries the envelope required by `skills/tooling/output-dto-standard/SKILL.md`
(`companyId`, `creationTime`, `modifiedTime`, `creator: "gainers-signal"`).

What it computes, and why each exists:

- **`tier`** — `ACT` (known cause + decent delivery + HIGH conviction) · `WATCH` (HIGH
  conviction, or MEDIUM with a cause, a streak, or decent delivery) · `NOTED`
  (everything else). This is what the email is organised by.
- **`conviction_score` + `conviction_reasons[]`** — the additive score and the
  human-readable reasons that produced it. Inspectable on purpose: `insight-validation`
  can only tell us a threshold is miscalibrated if it can see which rule fired.
- **`delivery_pct` AND `delivery_value_cr`** — both axes, always together. Percentage
  alone misleads at both ends of the market-cap range: it flatters illiquid micro-caps
  and understates large-caps where 22% delivery can still be ₹150 Cr of real buying.
  "Decent delivery" is satisfied by EITHER a high percentage or a large rupee amount.
- **`streak` + `streak_prior_dates`** — consecutive sessions this name has appeared,
  derived from past `gainer` events (no extra API calls). A gap resets it. Days the job
  never ran can't break a streak — we can't observe absence on a day we didn't look.
- **`sector_cluster`** — `STRONG` at ≥3, `SUPER_STRONG` at ≥4 same-industry names up
  **with delivery behind them**. The delivery condition matters: four names co-moving on
  intraday churn is a sector-wide pop or an index rebalance, not accumulation.
- **`concall` sentiment credit** — +1.5 conviction for a Bullish concall, +1
  for Optimistic, -1 for Bearish, ONLY when `recentWithinDays <= 7` (computed
  live from the concall date — see Step 1f). `null` (no concall data found)
  is left uncredited and unpenalised — absence of a concall is not evidence
  of anything.
- **`novelty`** — unchanged in spirit. News that merely restates a prior disclosure
  loses a point; a mix of new and repeat is left alone. It nudges, it doesn't dominate.
- **`volumeRocketing`** — boolean, always present. True when this same name ALSO
  clears the `volume-rocketing` skill's filter that day (`Volume >= 2.5 * Volume SMA
  5D` AND `Market Capitalization >= 300` Cr AND `Returns 1D >= 1`). Computed by the scanner
  (`gainersScanner.js` Step 1f) via a live membership check against the Volume
  Rocketing scan — not by re-deriving the 5D SMA locally, so the badge can never
  drift from what `volume-rocketing` itself would select. This does not run
  `volume-rocketing`'s downstream pipeline (quality filters/announcements/classifier)
  against these names; it is a same-day filter cross-check only, deliberately cheap.

Also writes `data/runs/gainers_research_seed_{YYYYMMDD}.json` — the top-20 selection for
Step 4, each entry carrying its STRONG announcements with resolved `pdfUrl`s and
`buildCompanyContext()`.

Downstream: `insight-validation`'s nightly run performs a D+2 follow-up on this file's
ACT/HIGH picks. No action needed here.

## Step 3 — Compose & send the email (your judgment)

Read `gainers_insights_{YYYYMMDD}.json`. Gmail-safe, inline-CSS, dark-theme (`#0f1117`)
HTML. Subject: `Daily Gainers Signal — {market_date}`.

The organising principle is **front-load the decision**. A reader skimming on a phone
should get the whole actionable picture before scrolling. Detail decreases sharply with
tier — that asymmetry IS the design, so resist padding the lower tiers.

**Every company name/ticker in the email is a hyperlink to its Stockscans page**, same
as every other digest email this repo sends (`watchlistInsights`, `dealsDigest`, etc.) —
use the shared `stockscansLink(name, symbol, exchange, color)` helper from
`@stock/cloud-utils` (`cloud-utils/src/emailService.js`) rather than hand-building an
`<a href>`. It already HTML-escapes the name and resolves the URL via `stockscansUrl()`,
which sanitizes the symbol (strips a "-BE"/"-SM"/etc series suffix — see
`stock-api/src/utils/companyId.js`) before building the link, so a suffixed companyId in
the signals JSON can never produce a dead/wrong stockscans.in URL:

```js
const { stockscansLink } = require('@stock/cloud-utils');
// e.g. inside the ACT block, WATCH table row, or NOTED line:
stockscansLink(s.name, s.ticker) // -> <a href="https://www.stockscans.in/company/NSE:XYZ" ...>Company Name</a>
```

1. **Lead (2-3 sentences).** The single most important thing first. If there's a
   SUPER_STRONG sector cluster, that is the lead. Otherwise the strongest ACT name, or
   plainly "no actionable signals today — N names moved on price action alone", which is
   a perfectly good outcome and should not be dressed up.

2. **🔴 ACT** — full detail, one block per name. `Company (TICKER) +X.X%` — the company
   name hyperlinked via `stockscansLink()` — with the tier badge, then: the trigger in
   one sentence (from Step 4's research, quantified — "₹512
   Cr order from NTPC, ~18% of FY26 revenue", never "received an order"), then delivery
   as `62% · ₹80 Cr delivered of ₹129 Cr traded`, streak if >1, then the remaining
   `evidence[]` lines. Link the PDF. If Step 3b ran for this name, add one line —
   e.g. `Concall: Bullish (quality 82/100), filed 3d ago — guided 18-20% FY27
   revenue growth` — after the trigger, not instead of it. If `volumeRocketing` is
   true, append a small `⚡ Vol 2.5x` badge next to the tier badge — it tells the
   reader this name is independently confirmed by a volume-surge filter, not just
   price and delivery.

3. **🟡 WATCH** — one row per name in a compact table: Ticker (hyperlinked) · +% · Streak ·
   Deliv % · Deliv ₹Cr · Driver · a short "why" cell · ⚡ if `volumeRocketing` is true. No
   prose blocks. If Step 4 researched the name, the "why" cell carries the one-line
   trigger; otherwise state the driver plainly.

4. **⚪ NOTED** — a single line listing hyperlinked tickers with returns, nothing more.
   These are logged, not recommended.

5. **🏭 Sector clusters** — one block per cluster, SUPER_STRONG first: the industry, how
   many qualified names, aggregate delivery value, the member tickers with returns, and
   your read on whether this looks like a common driver or coincidence. Say which if you
   can't tell.

6. **🔥 Streak board** — names on a 2nd+ consecutive session, from `insights.streaks`,
   sorted by streak length. This is the cheapest high-signal read in the report; give it
   its own small table even when those names appear above.

7. **Footer** — `{total_analyzed} analysed · ACT {n} · WATCH {n} · NOTED {n}` plus any
   data-availability caveats (announcements API down vs genuinely no filings — these are
   very different and must not be conflated).

**Connecting announcements to price action — the part that must not be fudged.** For
every ACT and WATCH name, state explicitly which of the three applies:

- **Explained** — a STRONG filing plausibly accounts for the move (say which, with
  numbers from the PDF).
- **Unexplained** — delivery-backed buying with no filing. Label it as such. This is
  often early accumulation ahead of news and is genuinely interesting, but calling it
  explained when it isn't is how a signal report becomes untrustworthy.
- **Mismatched** — a filing exists but doesn't fit the move (a routine disclosure
  alongside +15%, or a strong filing with weak delivery). Flag the mismatch rather than
  reaching for the nearest available narrative.

Never assert a causal link the evidence doesn't support. "No discoverable trigger" is a
legitimate, useful finding.

Send via the shared mailer. `emailService.js` reads `GOOGLE_APP_PASSWORD` from
`process.env` but does **not** load `.env` itself — call `loadEnv()` first or the send
always reports `skipped: GOOGLE_APP_PASSWORD not set` even though the key is present:

```bash
MAILER=$(find /sessions -path '*cloud-utils/src/emailService.js' 2>/dev/null | head -1)
node -e "require('$RUNTIME/lib/env').loadEnv();const{sendHtmlEmail}=require('$MAILER');const fs=require('fs');sendHtmlEmail({subject:process.argv[1],htmlBody:fs.readFileSync(process.argv[2],'utf8')}).then(r=>console.log(JSON.stringify(r)))" \
  "Daily Gainers Signal — $MARKET_DATE" /tmp/gainers_email.html
```

If email status is `skipped`/`error`, print a warning but do not fail.

## Step 4 — Top-20 trigger research (MANDATORY, your judgment)

Read `data/runs/gainers_research_seed_{YYYYMMDD}.json`. It holds 20 companies: the top
10 by delivery **%** and the top 10 by delivery **value (₹ Cr)** with the first list
excluded. The two axes surface different things on purpose — percentage finds
high-conviction accumulation in small/mid caps, absolute value finds where the real
money went, which in large caps is substantial even at an unremarkable percentage.
Companies with no delivery data are excluded rather than ranked as zero.

Run this BEFORE Step 3 if you want the triggers in the email (preferred), or after if
time-boxed — but it always runs.

For each of the 20:

1. **Read the PDFs — only for `announcements_to_read[]`** (the STRONG filings; typically
   0-3 per company). `node "$WI" read-pdf "<pdfUrl>"`. Never write a trigger from a
   title alone — the title says "Award of Order", the PDF says ₹512 Cr from NTPC over 30
   months, and only the second is actionable. Skip `supporting_announcements[]` PDFs
   unless the strong list is empty and the move is otherwise unexplained.
2. **Use the category template** for the extraction checklist — this is the
   `announcement-insights` skill's library, shared verbatim with `watchlist-insights`:
   `node "$WI" insight-template "<category>" --depth quick`. Default to `--depth quick`
   here since this step is a time-boxed batch pass over 20 companies — EXCEPT if
   `category` is one of the four HIGH_CONVICTION_CATEGORIES
   (`demerger`/`merger`/`acquisition`/`management_change`), in which case use `--depth
   standard` (not `quick`) even in this batch context: per `announcement-insights`'
   playbook, these categories are disproportionately alpha-dense relative to their
   frequency and are exactly the kind of thing this scan should not shortcut. Reserve
   full `--depth deep` for when the user asks you to follow up on one of these 20
   individually after the briefing goes out.
3. **If `announcements_to_read[]` is empty** — do NOT go hunting for a narrative. Write
   the short "unexplained delivery-backed move" note: the delivery facts, the streak, the
   sector context, and what would confirm or kill the thesis. Two or three sentences is
   the right length. Fabricated causation is worse than an honest blank.
3b. **If `needs_transcript_research` is true** (Step 1f flagged a Bullish/Optimistic
   concall) — pull the transcript and extract its forward guidance, since a bullish
   concall filed the same week as the move is corroborating evidence a title-only
   announcement scan can't see:
   - Resolve the latest transcript via `stock-api/bin/get-latest-concall-transcript.js
     --bulk '[{"ticker":"<companyId>"}]'` (DB-first; only downloads if not already in
     `data/reports/`) — do NOT use the retired `concall-transcript-extractor` skill
     (superseded, see `skills/_shared/conventions.md` §12).
   - Run `forward-guidance-extractor`'s Phase 2 extraction reasoning (or the full
     skill if you want its Phase 3-5 workbook too) against that transcript, scoped to
     just this one company — the "one company, one reasoning pass" rule from that
     skill's Pitfalls section applies here too.
   - Fold the strongest 1-2 forward-guidance line items into `trigger_quantified`
     alongside the announcement-derived numbers, and note the concall's
     `sentiment` + `resultQualityScore` in the summary. If the transcript's tone
     contradicts the sentiment label (rare, but check — `highlights` from Step 1f
     is a cheap sanity check before trusting the enum blindly), say so; don't paper
     over a mismatch between the API's sentiment tag and what the transcript
     actually says.
   - This adds real cost (a transcript read + an extraction pass) on top of the PDF
     budget in "Cost control" below — apply the same ACT-tier-first prioritisation
     if a run would otherwise exceed budget.
4. **Weigh the context bundle** (`context` from `buildCompanyContext()` — identity,
   thesis, prior reports, notes, events) per Convention §8, and the `novelty` field. A
   move that lines up with an already-flagged growth catalyst is "known", not a surprise,
   and should be said so.
5. **Save the DTO:**
   ```
   db.saveReport({ creator: 'gainers-signal', type: 'gainers-trigger-research',
     date: market_date, companyId, modelUsed: '<the model writing this>',
     summary, research_axis, tier, trigger, trigger_quantified, linkage,
     contextUsed: [ids actually referenced],
     concallCorroboration: needs_transcript_research
       ? { sentiment, resultQualityScore, guidanceHighlights: [...] }
       : null,
     ...narrative })
   ```
   - `linkage` must be one of `explained` / `unexplained` / `mismatched` (same
     discipline as the email).
   - `concallCorroboration` is only populated when Step 3b actually ran (i.e. only
     for `needs_transcript_research: true` companies) — leave it `null` rather than
     an empty object for everyone else, so downstream readers can distinguish "we
     checked and found nothing extra" from "we didn't check."
   - `modelUsed` is required — this is LLM-written narrative, unlike the classifier's
     script-only `gainer` events.
   - `contextUsed` = ids from `buildCompanyContext()`'s `availableIds` the write-up
     actually drew on (empty array if the bundle was empty).
6. These link into `companies.json` automatically via `db.saveReport` → `linkToCompanies`,
   creating a lazy stub for tickers with no prior entry — itself worth flagging ("no
   company-master coverage yet").

**Cost control.** The expensive part is PDF reads, not the 20 companies. Names with no
STRONG filing cost almost nothing. If a run would exceed ~30 PDFs, prioritise ACT tier,
then SUPER_STRONG cluster members, then the rest — and say in the report which were
deferred rather than silently dropping them.

## Step 5 — Offload & cleanup (MANDATORY, even on failure)

```bash
yarn data:push
```

Idempotent push of everything under `data/` to Google Drive (`StockMarket/data/v2`).
Push-only: local files are KEPT, nothing is deleted. The skill is NOT complete until this
has run. Generated data belongs ONLY under `data/`; if the sync fails, report it and
retry later.

## Rules

- **Files-touched manifest (docs/DATA_RULES.md §7):** end the run by listing every file
  created/modified — collections with record counts (db.js helper stats /
  `db.touchedFiles()`), plus `runs/`/`cache/`/`assets/` files
  (`StorageService.touchedFiles()`), plus the `data:push` `↑ <file>` lines. A run that
  stored data without reporting what it touched is incomplete.
- Do NOT re-fetch or re-compute — both scripts did that.
- Cite actual numbers everywhere. Delivery is always reported as **% AND ₹ Cr together**,
  tagged `[NSE]`/`[BSE]`.
- Announcement→price-action linkage is always stated as explained / unexplained /
  mismatched. Never imply causation the evidence doesn't support.
- Concall sentiment is corroborating evidence, not a standalone trigger — never cite
  "Bullish concall" alone as the reason for a move without either an announcement or
  a concrete forward-guidance number from Step 3b backing it up.
- Detail scales with tier: ACT gets prose, WATCH gets a table row, NOTED gets a ticker.
- All outputs go under `data/` (the scripts do this by default) — never write data files
  to the repo root, and always finish with Step 5.
