---
name: watchlist-catalyst-scanner
description: >
  Scans Darshan's Stockscans watchlist for SIGNIFICANT structural catalysts in
  corporate announcements — order wins (book-to-bill above 0.3x or marquee/MAG7
  counterparty), preferential issues/warrants/QIP, smart-money SAST stake
  changes, rating upgrades, deleveraging, USFDA/PLI approvals, capacity
  commissioning, buybacks, M&A/demergers, plus price/volume spikes — and emits
  a focused HTML alert briefing. Use when the user says "scan my watchlist",
  "any catalysts today", "catalyst alerts", "what's moving in my watchlist",
  "check announcements", "daily catalyst scan", or wants notification-style
  monitoring of significant news across their watchlist companies. Suppresses
  routine compliance noise (AGM, record dates, ESOP, Reg 57/74(5)).
---

# Watchlist Catalyst Scanner

One-command scan of a Stockscans saved/shared scan (default: Darshan's
"Watchlist Announcements", scan id `a2c1ff012cf2f0690754f9e2`, ~51 companies,
Mcap >= Rs 1,000 cr) for **significant, structural** catalysts only.

## Quick start

```bash
python3 /tmp/scan_catalysts.py \
    [--days 7] [--scan-id <24hex>] [--authtoken-file <path>]
```

Outputs to `/mnt/user-data/outputs/`:
- `catalyst_alerts_YYYYMMDD.html` — self-contained dark/light briefing with
  HIGH/MEDIUM/RISK filter buttons, value chips, links to filing PDFs on the
  Stockscans S3 bucket. Present via `present_files`.
- `catalyst_alerts_YYYYMMDD.json` — machine-readable alerts for downstream
  skills (e.g. feed a HIGH order-win into `growth-triggers-1pager`).

## Auth

Token resolution order: `--authtoken-file` → `STOCKSCANS_AUTHTOKEN` env →
`/mnt/project/Stockscans_authtoken` → `/tmp/catalyst/authtoken.txt` →
`/tmp/pead/authtoken.txt`. JWT expiry is decoded locally and warned at <7 days.
The scan-definition GET goes through `curl` (urllib trips the WAF); the
announcements POST works via urllib with cookie auth + referer.

## Pipeline

1. **Universe** — `GET /api/user/saved-scans/{id}` (works for shared ids too)
   then `POST /api/company/scans/run`, paginated past 50 rows via `offset`.
   Scan columns carried per company: TTM `Revenue` (significance denominator),
   `Market Capitalization`, `Returns 1D/1W`, `CRS Vs Nifty 500 25D`.
2. **Announcements** — `POST /api/company/announcements` with
   `{"companyIds": [≤5 tickers], "offset": N}`; 30 rows/page, date-sorted desc
   across companies; paginate until dates < window start. NSE+BSE duplicate
   filings de-duped on (company, date, title, desc-prefix).
3. **Classification** — `catalyst_rules.classify()` (see
   `references/catalyst_taxonomy.md` for the full taxonomy, severity rules,
   marquee counterparty / investor lists, and noise suppression list).
4. **Price/volume channel** — straight from scan columns: 1D >= +7% or
   1W >= +12% flags momentum even with no filing.
5. **Render** — grouped, severity-sorted cards; repetitive same-event updates
   collapsed with a `(+N similar)` note.

## Significance bars (THRESHOLDS in catalyst_rules.py)

- Order win HIGH: single-order value / TTM revenue >= 0.30 (user-specified),
  or marquee counterparty (MAG7/global leader/Indian anchor). MEDIUM: 0.10-0.30
  or trending-tech theme or undisclosed value. Below 0.10 disclosed: suppressed.
- Earnings jump HIGH: filing text references >= 50% growth (route to
  quarterly-result-analysis for clean-vs-reported verification).
- SAST Reg 29: HIGH for known marquee investors; MEDIUM for institutional
  entities (entity name parsed from "...Regulations 2011 for <X>"); individual
  names suppressed. **Direction (buy/sell) is NOT in the summary — alerts say
  so explicitly; always open the filing PDF.**
- RISK channel (forensic lens): pledge creation/encumbrance, auditor/CFO exit,
  raids, downgrades, defaults. Pledge *release* is a positive DELEVERAGING HIGH.

## Known limitations (read before trusting output)

- Value extraction is regex best-effort; the Stockscans API strips the rupee
  glyph to `?`, so a bare `N crore` fallback is used — can rarely catch a
  share-count. Treat values as ranking aids, not gospel; verify in the PDF.
- Reg 29(2) disclosures do not state direction; a "SMART MONEY" alert can be a
  SELL. The card says this; do not skip the PDF.
- Earnings surprises are only flagged if the filing text itself mentions
  growth %; the scanner does not parse result PDFs. Pair with
  `pre-pead-scanner` / `quarterly-result-analysis` around result season.
- No background execution exists: this is a pull scanner. Run it at session
  start (or via a scheduled Claude API job hitting this skill) for a
  notification-like cadence.
- Bulk/block deals are NOT in the Stockscans announcements feed; for those,
  check NSE bulk-deal archives separately.

## Tuning

All bars live in `THRESHOLDS`; marquee lists in `MARQUEE_GLOBAL`,
`MARQUEE_INDIA`, `MARQUEE_INVESTORS`, `TRENDING_TECH`; noise in `NOISE_PAT`.
When the user says "too noisy" → raise bars / extend NOISE_PAT; "missed X" →
inspect the raw JSON (`n_raw` announcements) and add a pattern.
