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
SCAN=$(find /sessions -path '*cowork-jobs/gainersScanner.js' 2>/dev/null | head -1)
DATA=$(find /sessions -name 'gainers_classifier.py' 2>/dev/null | head -1 | xargs -0 dirname 2>/dev/null \
        || find /sessions -path '*Company Research*' -name '.env' 2>/dev/null | head -1 | xargs dirname)
export GAINERS_OUTPUT_DIR="$DATA/daily_gainers" BSE_SCRIP_CACHE="$DATA/delivery_cache/bse_scrip_codes.json" \
       COWORK_ENV="$DATA/.env"
```

## Step 1 — Scanner (Node, deterministic)

```bash
node "$SCAN"            # add `--date YYYY-MM-DD` to override the market date
```
Writes `daily_gainers/{market_date}_gainers_raw.json` (top-50 gainers, quality filters,
per-symbol NSE/BSE delivery, announcements, price-action signals, sector breadth). If it
yields 0 gainers (holiday / API issue), send a "no signals today" email and stop.

## Step 2 — Classifier (Python, deterministic, no API)

```bash
cd "$DATA" && python3 gainers_classifier.py
```
Reads the raw JSON and writes `daily_gainers/{market_date}_insights.json` with `signals[]`
— each has `primary_driver`, `conviction`, `in_email`, and a pre-built `evidence[]`
(announcement subjects 📋 material / 📄 routine, delivery %, vol spike, breakout flags).
(This classifier carries no Stockscans/NSE/BSE calls, so it stays Python — nothing to
centralize. Port to Node later only for stack uniformity.)

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
MAILER=$(find /sessions -path '*cowork-jobs/lib/emailService.js' 2>/dev/null | head -1)
node -e "const{sendHtmlEmail}=require('$MAILER');const fs=require('fs');sendHtmlEmail({subject:process.argv[1],htmlBody:fs.readFileSync(process.argv[2],'utf8')}).then(r=>console.log(JSON.stringify(r)))" \
  "Daily Gainers Signal — $MARKET_DATE" /tmp/gainers_email.html
```
If email status is `skipped`/`error`, print a warning but do not fail.

## Rules
- Do NOT re-fetch or re-compute — both scripts did that.
- Show ALL `evidence[]` lines per stock; don't truncate. Cite actual numbers.
- Tag delivery `[NSE]`/`[BSE]` next to the %; show routine announcement subjects as context.
