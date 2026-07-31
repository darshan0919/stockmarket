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
WI="$RUNTIME/watchlistInsights.js"   # used in Step 4 for read-pdf + insight-template
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

- `category_derived` — the same 14 categories `watchlist-insights` uses (one shared
  module, so the two jobs cannot drift apart the way they had)
- `strength` — **STRONG** (results, order_book, acquisition/merger/demerger, capacity
  commencement, fundraise/QIP/preferential/warrants, SAST) · **SUPPORTING** (rating
  action, regulatory/USFDA/PLI, buyback, investor meet, management change) ·
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
- **`novelty`** — unchanged in spirit. News that merely restates a prior disclosure
  loses a point; a mix of new and repeat is left alone. It nudges, it doesn't dominate.

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

1. **Lead (2-3 sentences).** The single most important thing first. If there's a
   SUPER_STRONG sector cluster, that is the lead. Otherwise the strongest ACT name, or
   plainly "no actionable signals today — N names moved on price action alone", which is
   a perfectly good outcome and should not be dressed up.

2. **🔴 ACT** — full detail, one block per name. `Company (TICKER) +X.X%` with the tier
   badge, then: the trigger in one sentence (from Step 4's research, quantified — "₹512
   Cr order from NTPC, ~18% of FY26 revenue", never "received an order"), then delivery
   as `62% · ₹80 Cr delivered of ₹129 Cr traded`, streak if >1, then the remaining
   `evidence[]` lines. Link the PDF.

3. **🟡 WATCH** — one row per name in a compact table: Ticker · +% · Streak · Deliv % ·
   Deliv ₹Cr · Driver · a short "why" cell. No prose blocks. If Step 4 researched the
   name, the "why" cell carries the one-line trigger; otherwise state the driver plainly.

4. **⚪ NOTED** — a single line listing tickers with returns, nothing more. These are
   logged, not recommended.

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
2. **Use the category template** for the extraction checklist:
   `node "$WI" insight-template "<category>"`. Same templates `watchlist-insights` uses,
   so an order-book trigger here is extracted to the same standard as there.
3. **If `announcements_to_read[]` is empty** — do NOT go hunting for a narrative. Write
   the short "unexplained delivery-backed move" note: the delivery facts, the streak, the
   sector context, and what would confirm or kill the thesis. Two or three sentences is
   the right length. Fabricated causation is worse than an honest blank.
4. **Weigh the context bundle** (`context` from `buildCompanyContext()` — identity,
   thesis, prior reports, notes, events) per Convention §8, and the `novelty` field. A
   move that lines up with an already-flagged growth catalyst is "known", not a surprise,
   and should be said so.
5. **Save the DTO:**
   ```
   db.saveReport({ creator: 'gainers-signal', type: 'gainers-trigger-research',
     date: market_date, companyId, modelUsed: '<the model writing this>',
     summary, research_axis, tier, trigger, trigger_quantified, linkage,
     contextUsed: [ids actually referenced], ...narrative })
   ```
   - `linkage` must be one of `explained` / `unexplained` / `mismatched` (same
     discipline as the email).
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
node "$RUNTIME/scripts/data.js" push
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
- Detail scales with tier: ACT gets prose, WATCH gets a table row, NOTED gets a ticker.
- All outputs go under `data/` (the scripts do this by default) — never write data files
  to the repo root, and always finish with Step 5.
