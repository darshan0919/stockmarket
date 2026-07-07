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
everything themselves: data root defaults to `<repo>/jobs/data/` and secrets to
`<repo>/.env`. Exporting paths derived from fragile `find`s is what previously scattered
`daily_gainers/`, `delivery_cache/` etc. at the repo root.

## Step 1 — Scanner (Node, deterministic)

```bash
node "$SCAN"            # add `--date YYYY-MM-DD` to override the market date
```
Writes `jobs/data/daily_gainers/{market_date}_gainers_raw.json` (top-50 gainers, quality
filters, per-symbol NSE/BSE delivery, announcements, price-action signals, sector
breadth). If it yields 0 gainers (holiday / API issue), send a "no signals today" email
and stop.

## Step 2 — Classifier (Node, deterministic, no API)

```bash
node "$RUNTIME/lib/gainersClassifier.js"
```
Reads the raw JSON and writes `jobs/data/daily_gainers/{market_date}_insights.json` with
`signals[]` — each has `primary_driver`, `conviction`, `in_email`, and a pre-built
`evidence[]` (announcement subjects 📋 material / 📄 routine, delivery %, vol spike,
breakout flags). Each signal record also carries the DTO envelope required by
`skills/tooling/output-dto-standard/SKILL.md`: `companyId`, `creationTime`,
`modifiedTime`, `creator: "gainers-signal"`.

Downstream: `insight-validation`'s nightly run performs a D+2 follow-up validation on
this file's HIGH-conviction picks (positive, substantial D+2 return; delivery% as a
secondary signal) and writes `jobs/data/validation/gainers_ledger.json` — see
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

## Step 4 — Offload & cleanup (MANDATORY, even on failure)

```bash
node "$RUNTIME/scripts/offloadToDrive.js"
```
Syncs everything under `jobs/data/` to Google Drive (`StockMarket/jobs/v1`) and wipes the
local cache. The skill is NOT complete until this has run. Never leave generated data
files in the repo (root or `jobs/data/`) or in the session workspace; if the sync fails,
report it — the script deliberately keeps the local cache in that case.

## Rules
- Do NOT re-fetch or re-compute — both scripts did that.
- Show ALL `evidence[]` lines per stock; don't truncate. Cite actual numbers.
- Tag delivery `[NSE]`/`[BSE]` next to the %; show routine announcement subjects as context.
- All outputs go under `jobs/data/` (the scripts do this by default) — never write data
  files to the repo root, and always finish with Step 4.
