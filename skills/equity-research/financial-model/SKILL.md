---
name: financial-model
description: >
  Builds a 3-year forward financial model (Excel) for an Indian listed company with
  concall-driven assumptions, Bear/Base/Bull exit valuations and IRR from today's market
  cap. Use whenever the user says "financial model", "3-year forecast", "project the
  P&L", "build a model for X", "what's the IRR from here", "bear base bull targets",
  "valuation model", or when investment-thesis-engine needs a valuation anchor, or when
  company-research hands off structured modelling. Inputs: latest concall transcript +
  financial snapshot (Screener export, screenshots, or corpus extracts) — auto-fetched
  via stock-documents-fetcher when only a ticker is given. Output is a plug-and-play
  .xlsx with editable assumption cells, rationale for every assumption, and an EPS
  sanity check against Screener P/E.
---

# Financial Model (3-Year Forecast, Bear/Base/Bull)

Source prompts: SOIC financial-modelling prompts 1 & 2 (Google Doc prompt library).
Mandatory reading: `skills/_shared/data-verification.md` — especially the market-data
anchor rules. Build the workbook with the `xlsx` skill conventions.

## Part 0 — Data verification (DO THIS FIRST)

1. Fetch `https://www.screener.in/company/[TICKER]/consolidated/` (and each peer if peer
   comparison requested). Extract DIRECTLY (do not calculate): CMP, P/E, Market Cap, Book
   Value, ROCE, ROE, D/E.
2. Sanity check: CMP × shares ≈ Market Cap (within 3%).
3. Confirm with the user before modelling: "Using [TICKER]: CMP ₹X, P/E Yx, MCap ₹Z Cr.
   Confirm or correct."

## Inputs

- Year-0 (latest FY) financials + TTM: Revenue, COGS/expenses, EBITDA, D&A, Interest, Tax, PAT.
- Latest concall transcript (and prior one if available) for: growth guidance, margin
  outlook, capex/initiatives, risk factors.
- Reuse existing artifacts (corpus extracts, `[TICKER]_Concall.txt`, MasterData.xlsx) before
  fetching anything.

**Transcript fetch protocol (DB-first):** When you need to fetch a concall transcript
rather than using an already-uploaded artifact, always check the DB first:

```bash
TICKER="NSE:TICKER"
SAFE=$(echo "$TICKER" | tr ':' '_')

# Latest quarter — DB-first waterfall
node stock-api/bin/get-latest-concall-transcript.js "$TICKER"
# "db-hit"/"saved" → read fullText from data/reports/<id>.json (no download needed)
# "official-transcript-exists" → download via fetch_documents.py, then save to DB:
#   python3 stock-api/python/fetchers/fetch_documents.py "$TICKER" -t Transcript --last-n 1 -o /tmp/${SAFE}_docs
#   <read the PDF, write verbatim text to /tmp/${SAFE}_<yyyymm>_transcript.txt>
#   node stock-api/bin/save-concall-transcript.js "$TICKER" "$YYYYMM" /tmp/${SAFE}_${YYYYMM}_transcript.txt
# "results-not-out" → use prior quarter instead (run again with --quarter <prior>)

# Prior quarter (if needed) — same pattern with explicit quarter
node stock-api/bin/get-latest-concall-transcript.js "$TICKER" --quarter "$PRIOR_QUARTER"
```

Save every downloaded transcript text to DB immediately after reading — the financial
model will be re-run after every results season and DB hits eliminate repeated PDF downloads.

## Persist the JSON DTO before building the workbook

This skill produces genuine novel synthesis (assumptions, 3-year projections,
Bear/Base/Bull valuation, IRR) — not just a re-display of other skills' artifacts — so
before building the `.xlsx`, write `data/agent-outputs/{TICKER}_financial_model.json`
capturing: Year-0/TTM actuals, the concall-derived assumptions (each with its rationale
and `[R]/[D]/[E]` source tag), the Y0→Y3 P&L line items, the Bear/Base/Bull exit
valuation and IRR, the probability-weighted expected value, and the "what could be wrong"
bullets. The object MUST carry the standard envelope from
`skills/tooling/output-dto-standard/SKILL.md` — `companyId` (canonical `EXCH:SYMBOL`),
`creationTime`, `modifiedTime`, `creator: "financial-model"`, and (per that standard's
`modelUsed` rule, since assumptions/valuation/IRR here are genuine LLM synthesis, not
scripted arithmetic over given inputs) `modelUsed`: the exact model you're running as
(e.g. `"claude-sonnet-5"`). The `.xlsx` workbook below
is then built FROM this JSON (its cells populate from the same assumptions/figures) —
never derive the workbook and the JSON independently, or the two drift apart. On re-runs
after a results season (see Handoffs), update `modifiedTime` and keep `creationTime`
from the first write.

## Workbook structure (sheets)

1. **Executive Summary** — verdict-ready: CMP, MCap, 3-yr revenue/PAT CAGR (base), Bear/Base/
   Bull FY+3 targets, IRR from today's MCap, key assumptions in 5 lines.
2. **Data Inputs** — Year-0 + TTM actuals (₹ Cr), source references. Light-blue fill.
3. **Concall Insights** — management guidance on growth, margin trend expectations, key
   initiatives and impact, industry outlook — each with a verbatim quote + date.
4. **Assumptions** (editable, BLUE font, yellow-highlighted section):
   Revenue growth Y1/Y2/Y3, COGS %, OpEx %, D&A %, tax rate, Bear/Base/Bull exit P/E.
   Each assumption gets a one-line rationale, e.g. "Growth Y1 30%: management guided
   25–30% (Q4 FY26 concall), order book +42% YoY". Include an AI-vs-Custom toggle cell.
5. **Income Statement** — Y0→Y3 full P&L (Revenue → COGS → GP → OpEx → EBITDA → D&A →
   EBIT → Interest → PBT → Tax → PAT), formulas wired to the blue cells. Black = formula,
   green = cross-reference. Zero formula errors.
6. **Margins** — gross/EBITDA/EBIT/PAT margins across years.
7. **Valuation** — FY+3 EPS × exit P/E per scenario; IRR from today's MCap; probability
   weights per scenario → expected value. Anchor current P/E to Screener (never calculated).
8. **Peer Comparison** (when peers given) — P/E, ROCE, ROE, margins FROM SCREENER,
   valuation gap vs peers, growth comparison.
9. **Investment Thesis** — bull catalysts (probability + timeline), bear risks (impact),
   key monitorables to track quarterly. This sheet feeds `investment-thesis-engine`
   (valuation pillar + monitorables) — keep the monitorables machine-readable
   (Metric | Threshold | Frequency).

## Sanity checks (hard requirements)

- Model Year-0 EPS within 10% of (CMP ÷ Screener P/E); if not, use Screener's and flag.
- All growth/margin assumptions must trace to a concall quote, order-book fact, or
  historical average — no unexplained numbers.
- Mark every assumption cell's source tag [R]/[D]/[E].
- End the Executive Summary with "What could be wrong with this model?" (3 bullets:
  most fragile assumption, cyclicality risk, valuation-regime risk).

## Handoffs

- After delivery, offer to update the company's thesis (`investment-thesis-engine` mode
  `update`, valuation pillar) with base-case IRR and targets.
- Refresh cadence: re-run after each results season — only the Assumptions and Data Inputs
  sheets change; keep prior versions as `{TICKER}_model_FYxxQx.xlsx` for audit trail.
