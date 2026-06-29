---
name: tweet-investor-playbook
description: Distil a public investor's tweet corpus into an institutional-grade investment playbook. Use whenever the user uploads a tweet dump (JSON, CSV, NDJSON, or raw text) of an investor / fund manager / market commentator and asks to "analyse their tweets", "extract their investment style", "build a playbook from their tweets", "what does X tweet about stocks", "distil their thinking", "rate their stock picks", or "what's their hit rate". Also trigger when the user provides a folder of tweet exports from any handle and asks for actionable investment insights, recurring themes, quoted heuristics, or a track-record audit. Output is a self-contained interactive HTML widget with five tabs — Insights, Quotes, Playbook, Track Record (with live price cross-verification), and What Could Be Wrong — plus a Markdown source for archival.
---

# Tweet Investor Playbook

Turn a public investor's tweet history into a tight, citation-anchored playbook for institutional consumption. The skill produces **one self-contained HTML widget** with five tabs and a parallel **Markdown source file**. No fluff, no extrapolation, every claim back-cited to a tweet ID/date.

## When this skill runs

Trigger phrases include: "analyse these tweets", "extract investor style", "build a playbook from this tweet dump", "rate their stock picks", "what's their hit rate", "distil their thinking", "what does X tweet about markets".

Inputs accepted (auto-detect via `packages/stock-api/python/analyzers/parse_tweet_dump.py`):

- **Twitter API v2 JSON** — `{data: [{id, text, created_at, ...}]}` shape
- **NDJSON** — one tweet per line
- **CSV** — columns like `tweet_id, date, text, in_reply_to_id, reply_to_user, like_count, retweet_count`
- **Raw text dump** — fallback; one tweet per blank-line-separated block
- **Folder of any of the above** — concatenate all files

If the input format is none of the above, stop and ask the user for a re-export rather than guessing. **Never fabricate tweet IDs or dates.**

## Workflow

Run these phases in order. Don't skip phases even if the corpus is small.

### Phase 1 — Ingestion & sanity check

1. Run `packages/stock-api/python/analyzers/parse_tweet_dump.py <input-path>` to produce a normalised JSON at `/home/claude/_tweets_normalised.json`.
2. Read the normalised file and confirm to the user:
   - Handle (best-effort from author field; if absent, ask)
   - Total tweets parsed
   - Date range covered (earliest → latest)
   - % of corpus that are replies vs original tweets vs retweets
3. If corpus is < 50 tweets, warn the user that conclusions will be weak. If > 5,000 tweets, ask whether to scope to a date range to keep the analysis sharp.

### Phase 2 — Classification pass

For every tweet, assign one or more tags. Do this in a single pass through the corpus, writing a tagged JSON to `/home/claude/_tweets_tagged.json`. Read `references/classification_taxonomy.md` for the exact tag list and decision rules. Tag categories:

- **pick** — explicit stock mention with action verb (bought, sold, holding, top pick, recommend, like, exited, trimmed)
- **profit_claim** — claims a realised or unrealised gain/loss, with or without a stock named
- **process** — describes a screening criterion, a rule, a checklist, a SOP, a sell trigger
- **macro_view** — opinion on rates, sectors, cycles, currencies, geopolitics
- **concept** — investing principle, philosophy, mental model
- **anti_pattern** — what they avoid, mistakes they call out
- **off_topic** — personal, jokes, retweets without commentary, politics — exclude from the playbook
- **uncertain** — sarcasm flag, ambiguous, low confidence

A tweet can carry multiple tags. **Read replies in conjunction with the parent tweet** — a reply by the investor often clarifies or qualifies the original. Use the parent's text (`in_reply_to_text` field) to disambiguate.

### Phase 3 — Synthesis

Now build the five tab payloads. Strict rules:

- **Every assertion needs at least one tweet ID citation** in the form `[#1234567890]` or `[2024-08-12]` if ID is unavailable.
- **No extrapolation.** If the investor never tweeted about X, the playbook does not have a view on X.
- **Group, don't repeat.** If 8 tweets express the same idea, that's one insight with 8 citations, not 8 insights.
- **Distinguish explicit vs inferred.** Tag any inferred conclusion as `(inferred)`. Keep these to a minimum.
- **Flag sarcasm.** If a tweet looks like a joke / sarcasm, don't promote it to a serious insight.

Build each tab using the schemas below. Read `references/synthesis_rules.md` for detailed grouping logic and quote-handling rules.

#### Tab 1: Insights (Share Market Investment Insights)

5–15 themes, each with:
- `theme` — 4–8 word headline
- `summary` — 1–3 sentence description in neutral analyst voice
- `category` — one of: Philosophy / Stock-Selection / Sector-View / Macro / Risk-Mgmt / Position-Sizing / Sell-Discipline
- `frequency` — how many tweets support it
- `citations` — list of tweet IDs / dates
- `confidence` — High / Medium / Low (based on consistency across tweets)

Order tabs by frequency × confidence.

#### Tab 2: Quotes

Direct quotables. Apply this hierarchy:

1. **Well-known concept** → just name it (e.g. "Cigar-butt investing — Graham/Buffett"). Don't quote.
2. **Investor's unique formulation** → reword in own analyst voice, attribute via citation. Keep under 15 words per quote.
3. **Cluster duplicates** → if 5 tweets express the same heuristic, render ONE re-worded card with all citations.

Each quote card has:
- `quote_or_concept` — the re-worded line or named concept
- `kind` — "Concept" (well-known) or "Original" (their formulation)
- `cluster_size` — how many tweets feed this card
- `citations`

Aim for 10–25 cards. Cull anything that doesn't add operational signal.

#### Tab 3: Playbook (Actionable Ideas / Triggers / Processes / SOPs)

This is the operational core. Each entry has:
- `rule` — imperative phrasing ("Screen for RoCE > 18% over 5 years")
- `type` — Screen / Entry-Trigger / Exit-Trigger / Position-Sizing / Risk-Check / Allocation-SOP / Diligence-Step
- `derived_from` — direct quote citation or "synthesised from N tweets"
- `confidence` — High / Medium / Low
- `citations`

Group into three columns: **Screens & Filters**, **Entry/Exit Triggers**, **Process & Risk SOPs**. Aim for 10–25 entries total.

#### Tab 4: Track Record

The most rigour-demanding tab. Read `references/track_record_methodology.md` for the full scoring methodology. Steps:

1. From `pick` tagged tweets, extract every distinct stock mentioned with a clear action. Build a candidate table with columns: `ticker_or_name`, `action` (Buy/Sell/Hold/Recommend), `claim_date`, `claimed_entry_price` (if stated), `claimed_pnl` (if stated), `citations`.

2. **De-duplicate by stock**: if same stock mentioned in 5 tweets, collapse to one row but keep all citations and the earliest claim date as the entry date.

3. **Cross-verify with live data** (mandatory in this skill since the user opted in):
   - Use `web_search` to fetch current price for each ticker. Search queries like `"<TICKER> stock price"` or `"<COMPANY> share price NSE"`.
   - Compute return from `claim_date` close to current price.
   - If ticker is ambiguous or unverifiable, mark as `Unverifiable` and explain why.
   - For Indian stocks, prefer NSE tickers. For US, NYSE/NASDAQ. For others, search by company name.

4. **Categorise each pick**:
   - `WIN` — return > +20% (or beats Nifty/S&P over the same window by > 10%, whichever you can verify)
   - `NEUTRAL` — return between -10% and +20%
   - `LOSS` — return < -10%
   - `TOO_EARLY` — claim_date within last 90 days
   - `UNVERIFIABLE` — ticker not found, name too ambiguous, or company delisted/acquired

5. **Compute headline rating**:
   - Hit rate = WINs ÷ (WINs + NEUTRALs + LOSSes)
   - Average return (simple, equal-weighted)
   - Biggest winner, biggest loser
   - Median return
   - Number of unverifiable claims (this matters — high count weakens credibility)

6. **Profit claims without picks**: separate sub-section. Tweets like "made 3x on a pharma play" with no stock named → list them as `Unverifiable Profit Claims` with citations. **Do not** include in hit rate.

7. **Overall Verdict** (1–5 stars):
   - 5★ = Hit rate > 65%, > 20 verifiable picks, low unverifiable-claim ratio
   - 4★ = Hit rate 50–65%, > 15 verifiable picks
   - 3★ = Hit rate 40–50%, or small sample
   - 2★ = Hit rate 30–40%, or high unverifiable-claim ratio
   - 1★ = Hit rate < 30% or mostly unverifiable
   - **N/A** = fewer than 5 verifiable picks (state this explicitly, don't force a rating)

#### Tab 5: What Could Be Wrong

Mandatory self-critique, in this exact order:

1. **Selection bias in the corpus** — date range, missing tweets, deleted tweets we can't see
2. **Survivorship bias in claims** — investors tweet wins more than losses
3. **Hindsight rationalisation** — claims of having "called it" before an event
4. **Verification gaps** — how many picks were Unverifiable and why
5. **Sample-size weakness** — if N < 20 picks, the hit rate is noise
6. **Sarcasm / ambiguity risk** — tweets that might have been misread
7. **External validity** — markets/regime today may not match their past calls

End the section with a one-line **Confidence in this playbook**: High / Medium / Low.

### Phase 4 — Render

Use `assets/widget_template.html` as the shell. Populate the `<script id="playbook-data" type="application/json">` block with the synthesised JSON. The widget is self-contained — no external scripts, no fetch calls. Vanilla JS only.

Save the widget to `/mnt/project/packages/cowork-jobs/data/agent-outputs/<handle>_investor_playbook.html` and the Markdown source to `/mnt/project/packages/cowork-jobs/data/agent-outputs/<handle>_investor_playbook.md`. Call `present_files` with the HTML first.

## Strict methodological rules

These are non-negotiable. Apply them throughout:

1. **Citations or it didn't happen.** Every insight, quote, rule, and pick must back-cite at least one tweet.
2. **No copyright violations.** Reword tweets in your own voice; under 15 words verbatim; never quote a full tweet.
3. **Distinguish explicit from inferred.** Tag every inferred conclusion.
4. **Don't moralise.** Neutral analyst voice. No "this is a great philosophy".
5. **No extrapolation beyond the corpus.** Skill output is bounded by what's actually in the tweets.
6. **Unverifiable ≠ false.** Mark unverifiable claims as such; don't dismiss them, don't promote them.
7. **Time-stamp everything.** When the user reads this six months later, they should see when the analysis was done and what the cutoff is.

## References

- `references/classification_taxonomy.md` — tag definitions and decision rules
- `references/synthesis_rules.md` — grouping logic, quote handling, copyright safety
- `references/track_record_methodology.md` — full scoring methodology, edge cases
- `assets/widget_template.html` — the HTML widget shell

## Scripts

- `packages/stock-api/python/analyzers/parse_tweet_dump.py` — format-agnostic tweet parser; outputs normalised JSON
