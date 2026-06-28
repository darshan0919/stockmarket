---
name: peer-comparison
description: Institutional-grade peer comparison report for 2-6 Indian listed companies in the same sector or sub-sector. Compares them across demand & order book health, forward earnings projections from management commentary, cash flow & balance sheet quality, valuation, and management credibility. Use whenever the user uploads a Stockscans peer-comparison URL like `https://www.stockscans.in/peer-comparison?companies=NSE:X,NSE:Y`, says "compare these companies", "peer report on X vs Y", "side-by-side analysis", "which of these to buy", or asks to assess relative valuation between 2-6 NSE/BSE companies. Auto-fetches the latest annual reports, concalls, and investor presentations for each company. Outputs a multi-page institutional PDF or HTML widget with side-by-side tables for every key dimension and a final relative-value verdict.
---

# Peer Comparison Report

Institutional-grade side-by-side analysis of 2-6 listed companies in the same sector. The output answers a fund manager's three core questions: *which company is best at execution, which is most attractively priced, and where is the relative-value setup right now*.

## When to use this skill

- User pastes a Stockscans peer-comparison URL: `https://www.stockscans.in/peer-comparison?companies=NSE:X,NSE:Y[,NSE:Z]`
- User says: "compare X and Y", "peer report on these companies", "which of these to buy", "relative value setup", "side-by-side analysis"
- User wants a sector-rotation thesis backed by side-by-side numbers
- Other skills delegate here:
  - `equity-research-deepdive` §3 (Peer Comparison) — when the deepdive needs a fuller peer treatment than its single section can hold
  - `equity-research-master` Tab 3 — Industry tab consumes the peer table

## Conventions

Follow [`_shared/conventions.md`](../_shared/conventions.md). Especially the citation discipline (every number in a peer table needs a source) and FY26 = April 2025–March 2026.

## Required input

Either:
- A Stockscans peer-comparison URL with 2-6 tickers, OR
- A list of 2-6 tickers in `EXCH:SYMBOL` format

The user's "Key Pointers" (in their `Peer_Comparison_Prompt` project file) define the four mandatory dimensions:
1. Demand, Order Book, Book-to-Bill
2. Forward Earnings Projections based on Management Commentary
3. Cash Flow & Balance Sheet Health
4. Valuation (relative)

These four dimensions are the **non-negotiable spine** of every peer comparison report. Skills called by the user with a peer-comparison URL must address all four.

## Workflow — 5 phases

### Phase 1 — Document acquisition (per company)

For each ticker, fetch the latest AR, latest concall transcript, latest investor presentation, and latest result. This is parallel-safe — kick off all fetches simultaneously.

```bash
TICKERS=("NSE:STLTECH" "NSE:HFCL")  # the user's example
ROOT="/tmp/peer_compare_$$"
mkdir -p "$ROOT"

for T in "${TICKERS[@]}"; do
    SAFE=$(echo "$T" | tr ':' '_')
    DOCS_DIR="$ROOT/$SAFE"
    mkdir -p "$DOCS_DIR"
    
    python3 /tmp/fetch_documents.py "$T" \
        -t "Annual Report" --last-n 2 -o "$DOCS_DIR" &
    python3 /tmp/fetch_documents.py "$T" \
        -t Transcript --last-n 2 -o "$DOCS_DIR" &
    python3 /tmp/fetch_documents.py "$T" \
        -t PPT --last-n 2 -o "$DOCS_DIR" &
done
wait
```

After fetching, read `manifest.json` per company. If a critical type is missing for any company, surface that — don't silently produce gaps in the comparison.

### Phase 2 — Live market data

For each ticker, fetch live valuation snapshots via Screener.in:

```python
# CMP, P/E (TTM and forward), Market Cap, ROCE, ROE, D/E, Promoter holding
# These come from the screener data — never calculated, always extracted
```

This step is mandatory — historical AR data alone gives you 6-12 month-old valuation. The peer comparison must be at live CMP.

### Phase 3 — Per-company extraction

For each company, extract the data needed for the four spine dimensions. See [`references/comparison_dimensions.md`](references/comparison_dimensions.md) for the full extraction list. Summary:

**Dimension 1 — Demand, Order Book, Book-to-Bill:**
- Latest reported revenue (TTM)
- Order book in Rs Cr from investor presentation / concall
- Book-to-bill ratio = Order book / TTM revenue
- Capacity utilisation %
- Concall management commentary on demand environment

**Dimension 2 — Forward earnings projections:**
- Latest concall guidance for revenue, EBITDA, margin, capex
- Confidence level of the guidance (HIGH / MEDIUM / LOW per `concall-analysis` framework)
- Analyst consensus FY+1 / FY+2 EPS (from MoneyControl / Trendlyne)
- Implied 2-year forward EPS CAGR

**Dimension 3 — CF & BS health:**
- 3-year CFO/PAT (from AR cash flow statement)
- Debt/Equity (latest)
- Net debt / EBITDA
- Working capital cycle (DSO + Inventory days − Payable days)
- Contingent liabilities as % of net worth
- Promoter pledge %

**Dimension 4 — Valuation (relative):**
- Live P/E (TTM) and forward
- EV/EBITDA
- P/B
- 5-year P/E historical median + percentile (where current sits)
- Implied PEG (forward P/E / forward EPS CAGR)

**Dimension 5 (optional) — Management Credibility Overlay:**
- Run `management-credibility-tracker` per company; feeds credibility scores into synthesis
- See Phase 4 below

**Dimension 6 — Shareholding Trends & Verdict:**
- Promoter holding % (latest quarter + 4-quarter trend)
- FII holding % (latest + 4-quarter trend)
- DII holding % (latest + 4-quarter trend)
- Retail / public holding %
- Promoter pledge % trend
- Trend verdict: Accumulating / Distributing / Stable — separately for FII, DII, Promoter
- Fetch from: Screener.in shareholding tab OR BSE bulk/block deal announcements
- Source: Screener.in `https://www.screener.in/company/<SYMBOL>/` → Shareholding tab

**Dimension 7 — Solvency & Liquidity Ratios:**
- Current Ratio = Current Assets / Current Liabilities (latest quarterly balance sheet)
- Quick Ratio = (Current Assets − Inventories) / Current Liabilities
- Interest Coverage Ratio (ICR) = EBIT / Interest Expense (TTM)
- Debt Service Coverage Ratio (DSCR) = (EBITDA − Taxes) / (Interest + Principal repayments)
- Net Debt / Equity
- Fetch latest quarterly result (P&L + BS) via stock-documents-fetcher if not already in context
- Calculate from the BS and P&L directly — never lift these from aggregator sites without cross-checking the raw filing

### Phase 4 — Synthesis

Build the comparison around the seven dimensions, then add a final cross-cutting verdict.

For each dimension, produce:
- A **side-by-side table** with all companies' values
- A **winner row** declaring which company is best on this dimension and why
- A **risk row** flagging the company most at risk on this dimension

Then a final **relative-value verdict** that synthesises across all seven:
- Which company is the best business?
- Which company is most attractively priced?
- Are these the same company? (If yes, easy call; if no, it's the relative-value setup.)
- What's the catalyst that closes the gap?

Optionally include `management-credibility-tracker` results for each company — adds an 8th dimension that informs how to weight the management commentary.

### Phase 5 — Render

Two formats, same schema:
- **PDF** (default for 2-3 companies): cleanest for printing / sharing in committee
- **HTML widget** (default for 4-6 companies): interactive sortable tables better suit larger comparisons

```python
import sys
sys.path.insert(0, '<skill_path>/scripts')
sys.path.insert(0, '<skill_path>/_shared')
from generate_peer_pdf import create_peer_comparison_pdf

data = {
    "title": "Telecom Equipment Peer Comparison: STL Tech vs HFCL",
    "date": "May 2026",
    "companies": [
        {"name": "STL Tech", "ticker": "NSE:STLTECH", "cmp": "Rs 165",
         "market_cap_cr": 6800, "sector": "Telecom equipment"},
        {"name": "HFCL", "ticker": "NSE:HFCL", "cmp": "Rs 105",
         "market_cap_cr": 14500, "sector": "Telecom equipment"},
    ],
    "executive_summary": "...",
    "demand_table": [...],            # Dimension 1
    "demand_winner": "...",
    "earnings_table": [...],          # Dimension 2
    "earnings_winner": "...",
    "cash_bs_table": [...],           # Dimension 3
    "cash_bs_winner": "...",
    "valuation_table": [...],         # Dimension 4
    "valuation_winner": "...",
    "shareholding_table": [...],      # Dimension 6 — shareholding trends
    "shareholding_winner": "...",
    "solvency_liquidity_table": [...],# Dimension 7 — solvency & liquidity ratios
    "solvency_liquidity_winner": "...",
    "credibility_table": [...],       # Optional Dimension 8 (was 5)
    "verdict": {
        "best_business": "...",
        "best_priced": "...",
        "relative_value_setup": "...",
        "preferred_pick": "...",
        "key_catalyst": "...",
        "biggest_risk": "...",
    },
    "sources": "...",
    "output_path": "/mnt/user-data/outputs/Peer_<Sector>_<DD-MMM-YYYY>.pdf",
}
create_peer_comparison_pdf(data)
```

See [`scripts/generate_peer_pdf.py`](scripts/generate_peer_pdf.py).

## Output discipline

- **Same metric, same definition** across all companies. If two companies report EBITDA differently, normalise. Note the normalisation in a footnote.
- **Live valuation only.** Never use stale (>30 day) prices.
- **Source every number.** Live CMP from Screener.in dated; order book from latest IP dated; concall guidance from quarter dated.
- **Don't pick a winner before doing the analysis.** The framework leads to the verdict, not the other way around.
- **Acknowledge cyclicality.** Peer comparison at the bottom of a sector cycle is fundamentally different from at the top.

## Pitfalls to avoid

- **Apples vs oranges.** Companies in the same broad sector but different sub-segments give misleading comparisons. STL Tech and HFCL both serve telecom infrastructure but their revenue mixes (STL: optical fibre + cables; HFCL: cables + defence + 5G equipment) differ — spell out the mix difference at the top.
- **Single-quarter snapshots.** A peer comparison based on a single quarter's results swings wildly with one-time items. Use TTM and 3-year averages.
- **Ignoring management credibility.** A company with great metrics but a -2 credibility score is a different bet than the same metrics + +2 credibility. Bring credibility in (see Phase 4 optional Dimension 5).
- **Premium = bad framing.** Premium valuations often reflect superior fundamentals. Don't reflexively favour the cheaper company; the question is whether the premium is justified.
- **Skipping the catalyst.** A relative-value setup without a catalyst can persist for years. The verdict must specify what closes the gap and on what timeline.

## Cross-skill integration

When called by `equity-research-deepdive` for §3:
- Schema-only mode (no PDF rendered separately); deepdive integrates the table inline

When called by `equity-research-master`:
- Schema fed into Tab 3 (Industry); tabs render

When `management-credibility-tracker` is run for each company first, the credibility scores feed into Phase 4 Dimension 5.

## File tree

```
peer-comparison/
├── SKILL.md                                 (this file)
├── _shared/
│   ├── conventions.md                       (linked)
│   └── pdf_utils.py                         (shared)
├── references/
│   └── comparison_dimensions.md             (full extraction list per dimension)
└── scripts/
    └── generate_peer_pdf.py                 (PDF generator)
```
