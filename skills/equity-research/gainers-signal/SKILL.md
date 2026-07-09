---
name: gainers-signal
description: Daily top-50 gainers signal — pre-compute gainers + quality filters + delivery + announcements (scanner), deterministically classify each into FUNDAMENTAL / SECTOR_CATALYST / PRICE_ACTION / VOLATILITY with conviction (classifier), then compose and email a conviction-signals briefing. Invoke with defaults for the 8 AM run, or pass a specific market date on demand.
---

# Daily Gainers Signal

Script-first: two deterministic companion steps resolve every fact; your only job is the
email synthesis over their output. Do NOT re-fetch or re-compute anything.

## Parameters (optional)

| Param | Default | Meaning |
|---|---|---|
| `date` | last trading day | market date (`--date YYYY-MM-DD`) for the scanner |
| `email` | on | set off to build the briefing without sending |

## Setup

```bash
SCAN=$(find /sessions -path '*packages/jobs-runtime/gainersScanner.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
RUNTIME=$(dirname "$SCAN")   # …/packages/jobs-runtime
```

Do NOT export `GAINERS_OUTPUT_DIR` / `WI_DATA_DIR` / `COWORK_ENV` — the scripts resolve
everything themselves: data root defaults to `<repo>/data/` and secrets to
`<repo>/.env`. Exporting paths derived from fragile `find`s is what previously scattered
`daily_gainers/`, `delivery_cache/` etc. at the repo root.

## Step 1 — Scanner (Node, deterministic)

```bash
node "$SCAN"            # add `--date YYYY-MM-DD` to override the market date
```
Writes `data/runs/gainers_raw_{YYYYMMDD}.json` (top-50 gainers, quality
filters, per-symbol NSE/BSE delivery, announcements, price-action signals, sector
breadth). If it yields 0 gainers (holiday / API issue), send a "no signals today" email
and stop.

## Step 2 — Classifier (Node, deterministic, no API)

```bash
node "$RUNTIME/lib/gainersClassifier.js"
```
Reads the raw JSON and writes the classified signals into the events collection (`data/events-YYYY-MM.json`, type=`gainer`) via `lib/db.js`, plus the full DTO `data/runs/gainers_insights_{YYYYMMDD}.json` with
`signals[]` — each has `primary_driver`, `conviction`, `in_email`, and a pre-built
`evidence[]` (announcement subjects 📋 material / 📄 routine, delivery %, vol spike,
breakout flags). Each signal record also carries the DTO envelope required by
`skills/tooling/output-dto-standard/SKILL.md`: `companyId`, `creationTime`,
`modifiedTime`, `creator: "gainers-signal"`.

**Novelty check (deterministic, folded into conviction).** For any gainer with a
material announcement, the classifier asks "is this new?" — it looks back 90 days
across this company's own past `gainer` events and its `watchlist-insights` notes
(`data/notes.json`) for a near-duplicate subject (text similarity, or explicit
follow-up phrasing like "further to our intimation dated…"/"corrigendum"). Each
signal carries a `novelty` field (`null` = no history to compare against, i.e.
unassessed — NOT the same as "repeat"; otherwise `{assessed, total, newCount,
followUpCount, matches}`). **Light touch, by design:** conviction is downgraded one
notch (HIGH → MEDIUM) only when the driver is `FUNDAMENTAL` AND *every* material
announcement reads as a reiteration of prior disclosure — a mix of new + repeat, or a
HIGH that also independently rests on delivery/price action, is left alone. This
nudges stale "news" down; it does not dominate the read.

Also writes `data/runs/gainers_top3_context_{YYYYMMDD}.json` — a context seed
(top-3-by-conviction companies, each paired with `buildCompanyContext()`) consumed by
Step 3.5 below.

Downstream: `insight-validation`'s nightly run performs a D+2 follow-up validation on
this file's HIGH-conviction picks (positive, substantial D+2 return; delivery% as a
secondary signal) and writes records into the validation collection (`data/validation.json`, type=`gainers-followup`) — see
`skills/equity-research/insight-validation/SKILL.md`. No action needed here; just be
aware today's HIGH picks get checked automatically two trading days out.

## Step 3 — Compose & send the email (your judgment)

Read the insights JSON. Build a Gmail-safe, inline-CSS, dark-theme (`#0f1117`) HTML email.
Subject: `Daily Gainers Signal — {market_date}`.

- **Header (2–3 sentences):** count analysed vs signals in email; the dominant theme
  (e.g. "Textiles saw broad-based buying" / "No material announcements — all moves are
  price-action"); note if announcements were API-unavailable vs genuinely absent.
- **FUNDAMENTAL MOVERS** (if any HIGH/MEDIUM): `Company (TICKER) +X.X% — [HIGH/MEDIUM]`,
  show ALL `evidence[]` lines, 📋 announcement lines prominent; delivery % + vol spike as
  corroboration.
- **SECTOR CATALYST** (if `sector_catalysts` non-empty): one block per sector — thesis +
  affected tickers/returns.
- **PRICE ACTION BREAKOUTS** (HIGH then MEDIUM): show ALL evidence; ⚠️ caveat where
  delivery is unavailable; group BSE-unavailable under "confirm on bseindia.com".
- **Footer:** `{total_analyzed} analyzed · {in_email} signals · {noise_excluded} noise`.

Send by writing the HTML to a temp file and using the shared mailer:
```bash
MAILER=$(find /sessions -path '*cloud-utils/src/emailService.js' 2>/dev/null | head -1)
node -e "const{sendHtmlEmail}=require('$MAILER');const fs=require('fs');sendHtmlEmail({subject:process.argv[1],htmlBody:fs.readFileSync(process.argv[2],'utf8')}).then(r=>console.log(JSON.stringify(r)))" \
  "Daily Gainers Signal — $MARKET_DATE" /tmp/gainers_email.html
```
If email status is `skipped`/`error`, print a warning but do not fail.

## Step 3.5 — Top-3 conviction briefing reports (MANDATORY, your judgment)

Every run, write one analyst briefing report per company for the **top 3 signals by
conviction** (`HIGH` > `MEDIUM` > `LOW`, tie-broken by `|return_1d|` desc, `in_email`
signals only) — this is what feeds better novelty checks and context on the *next*
run for these companies, not just today's email.

1. Read `data/runs/gainers_top3_context_{YYYYMMDD}.json` (written by Step 2) — it
   already has the ranked top 3 paired with `buildCompanyContext(companyId)` (identity,
   thesis, prior reports, notes, events, insights). Per Convention §8, weigh what's in
   there before writing.
2. For each of the 3, write a short DTO — no fixed schema beyond the envelope, but
   cover: what happened (the move + evidence), what's already known vs. genuinely new
   (tie back to the `novelty` field from Step 2), key watch items going forward, and
   any data gaps (e.g. no company-master identity, no thesis on file — say so plainly,
   don't fabricate sector narrative to fill the gap; ground every claim in
   `evidence[]`/`buildCompanyContext()`, not general knowledge).
3. Save via `db.saveReport({ creator: 'gainers-signal', type: 'gainers-top3-briefing', date: market_date, companyId, summary, contextUsed: [ids actually referenced], ...narrative })`.
   `contextUsed` should be the ids from `buildCompanyContext()`'s `availableIds` that
   the write-up actually drew on (empty array if the context bundle was empty).
4. These reports link into `companies.json` automatically (`db.saveReport` →
   `linkToCompanies`) — including creating a lazy company stub for tickers with no
   prior `companies.json` entry, which is itself a useful signal (flag it: "no
   company-master coverage yet" is worth knowing).

## Step 4 — Offload & cleanup (MANDATORY, even on failure)

```bash
node "$RUNTIME/scripts/data.js" push
```
Idempotent push of everything under `data/` to Google Drive (`StockMarket/data/v2`).
Push-only: local files are KEPT (full mirror), nothing is deleted. The skill is NOT complete until this has run. Generated data belongs ONLY under `data/`; if the sync fails, report it and retry later.

## Rules
- **Files-touched manifest (docs/DATA_RULES.md §7):** end the run by listing every file created/modified — collections with record counts (db.js helper stats / `db.touchedFiles()`), plus `runs/`/`cache/`/`assets/` files (`StorageService.touchedFiles()`), plus the `data:push` `↑ <file>` lines. A run that stored data without reporting what it touched is incomplete.

- Do NOT re-fetch or re-compute — both scripts did that.
- Show ALL `evidence[]` lines per stock; don't truncate. Cite actual numbers.
- Tag delivery `[NSE]`/`[BSE]` next to the %; show routine announcement subjects as context.
- All outputs go under `data/` (the scripts do this by default) — never write data
  files to the repo root, and always finish with Step 4.
