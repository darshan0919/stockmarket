---
name: monthly-sales-tracker
description: >
  Tracks monthly unit sales (PV Domestic, PV Exports, EV, Total) for Indian
  auto OEMs listed on NSE/BSE whose monthly figures are disclosed via SEBI Reg-30
  press releases. Downloads and parses press-release PDFs from Stockscans,
  extracts the 4 unit series, correlates them to quarterly consolidated financials
  via OLS regression, and produces a standalone monthly revenue / OP / PAT
  estimate for the latest reported month. Renders a self-contained dark-mode
  HTML report with Chart.js line charts and KPI cards.

  Use when the user says "show me TMPV sales trend", "predict July revenue for
  Tata Motors PV", "monthly sales chart for TMCV", "what do July volumes imply
  for financials", or asks to run the monthly-sales-tracker skill.

  Designed for:
    - NSE:TMPV  (Tata Motors Passenger Vehicles)
    - NSE:TMCV  (Tata Motors Commercial Vehicles)
    - Any OEM with Reg-30 monthly press releases on Stockscans
---

# Monthly Sales Tracker

## Purpose

Correlates **monthly unit sales volumes** (from SEBI Reg-30 press releases) to
**quarterly consolidated financials** (Revenue / Operating Profit / PAT) using
OLS linear regression, and predicts the latest month's financials.

---

## When to invoke

- User asks for a monthly sales chart / trend for an auto OEM
- User asks "what does July volume imply for revenue / OP / PAT"
- A new monthly sales press release has been filed (usually on the 1st of each month)
- User asks to extend the analysis to TMCV or another OEM

---

## Script-first architecture

All deterministic work is done by companion scripts; this skill only
orchestrates and synthesizes.

| Step | Script | What it does |
|------|--------|-------------|
| 1 | `download-sales-pdfs.js` | Fetch press-release PDFs from Stockscans |
| 2 | `extract-sales-data.py`  | Extract PV Dom / PV Exp / EV / Total per month |
| 3 | `predict-financials.js`  | OLS regression + monthly financial estimate |
| 4 | `render-report.js`       | Self-contained HTML report with Chart.js |

All scripts live in: `scripts/skills/monthly-sales-tracker/`

---

## Invocation

### From chat (via this skill)

```
Run the monthly-sales-tracker for NSE:TMPV
```

### Direct CLI

```bash
# Full pipeline (download + extract + predict + render + open)
yarn monthly-sales-tracker --ticker NSE:TMPV --open

# Pre-supply announcement list (faster, avoids API fetch)
yarn monthly-sales-tracker \
  --ticker NSE:TMPV \
  --announcements /path/to/announcements.json \
  --open

# Skip download if PDFs already present
yarn monthly-sales-tracker \
  --ticker NSE:TMPV \
  --skip-download

# Exclude outlier quarters from regression
yarn monthly-sales-tracker \
  --ticker NSE:TMPV \
  --exclude-outliers

# Commercial vehicles
yarn monthly-sales-tracker --ticker NSE:TMCV
```

---

## Output files

| File | Description |
|------|-------------|
| `data/runs/monthly-sales-tracker/<ticker>/pdfs/*.pdf` | Downloaded press-release PDFs |
| `data/runs/monthly-sales-tracker/<ticker>/sales_data.json` | Extracted monthly unit series |
| `data/runs/monthly-sales-tracker/<ticker>/prediction.json` | Regression models + monthly predictions |
| `data/assets/monthly-sales-tracker/<ticker>_sales_report_<date>.html` | Final interactive report |

---

## Regression model

```
Quarterly model:   Y_quarter = intercept + slope × Q_units
Monthly estimate:  Y_month   = (intercept / 3) + slope × M_units
```

Financials are **TMPV consolidated** (includes JLR). The intercept represents
quarterly fixed overhead (JLR overheads, D&A etc) → divided by 3 for monthly.
The slope (revenue-per-unit) is applied directly to the monthly sales figure.

**Outliers**: The Sep-25 quarter contains an exceptional PAT item (₹76,248 Cr
demerger-related). Use `--exclude-outliers` to exclude it from the PAT regression.

---

## Adding a new ticker (TMCV or others)

1. Add financial history to `FINANCIAL_HISTORY` in `predict-financials.js`
2. Run `node run.js --ticker NSE:TMCV`
3. The extraction patterns in `extract-sales-data.py` auto-switch for TMCV
   (look for CV Domestic / CV Exports labels)

---

## Dependencies

- Node.js 18+
- Python 3.9+ with `pdfplumber` (`pip install pdfplumber`)
- Stockscans auth token in `.env` (`STOCKSCANS_AUTH_TOKEN`)

---

## Agent instructions

When invoked from chat:

1. Check if `sales_data.json` already exists for the ticker
   - If YES and < 7 days old: skip download + extract, go to step 3
   - If NO or stale: run full pipeline

2. Run the pipeline:
   ```bash
   yarn monthly-sales-tracker --ticker <TICKER> --open
   ```

3. Read `prediction.json` and summarize:
   - Latest month's units (PV Dom / PV Exp / EV / Total)
   - Predicted monthly Revenue / OP / PAT with R² confidence note
   - Highlight the regression formula and its R² for each metric
   - Flag any extraction issues (missing months, low R²)

4. Show path to the HTML report

5. Token-optimization note: which quarters could be cached, whether a smaller
   model could handle the extraction step.
