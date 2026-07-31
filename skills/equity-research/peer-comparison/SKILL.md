---
name: peer-comparison
description: Institutional-grade peer comparison report for 2-6 Indian listed companies in the same sector or sub-sector. Compares them across demand & order book health, forward earnings projections from management commentary, cash flow & balance sheet quality, valuation, and management credibility. Use whenever the user uploads a Stockscans peer-comparison URL like `https://www.stockscans.in/peer-comparison?companies=NSE:X,NSE:Y`, says "compare these companies", "peer report on X vs Y", "side-by-side analysis", "which of these to buy", or asks to assess relative valuation between 2-6 NSE/BSE companies. Auto-fetches the latest annual reports, concalls, and investor presentations for each company. Outputs a multi-page institutional PDF or HTML widget with side-by-side tables for every key dimension and a final relative-value verdict.
---

# Peer Comparison Report

Institutional-grade side-by-side analysis of 2-6 listed companies in the same sector. The output answers a fund manager's three core questions: _which company is best at execution, which is most attractively priced, and where is the relative-value setup right now_.

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

    python3 stock-api/python/fetchers/fetch_documents.py "$T" \
        -t "Annual Report" --last-n 2 -o "$DOCS_DIR" &
    python3 stock-api/python/fetchers/fetch_documents.py "$T" \
        -t Transcript --last-n 2 -o "$DOCS_DIR" &
    python3 stock-api/python/fetchers/fetch_documents.py "$T" \
        -t PPT --last-n 2 -o "$DOCS_DIR" &
done
wait
```

After fetching, read `manifest.json` per company. If the Transcript type came
back with fewer than 2 entries for a company, or the newest one isn't
actually the just-completed quarter, resolve the latest-quarter Transcript
URL for the whole peer set directly rather than silently comparing companies
on different-aged transcript data:

```bash
node stock-api/bin/get-concall-transcript-url.js --companies "$(IFS=,; echo "${TICKERS[*]}")"
```

For each company, if the resolver returns `ssUrl`/`documentUrl`, fetch and
read that document. If it returns `error`, that company's transcript
genuinely isn't filed yet — surface that explicitly rather than silently
producing a gap in the comparison.

### Phase 2 — Live market data

For each ticker, fetch live valuation snapshots via Screener.in:

Write the following JSON to a temporary file (e.g. `data.json`). This `data.json` is the canonical DTO — render-pdf's PDF output is a reproducible rendering of it, not a separate source of truth, so the four envelope fields below must be present at the top level. This is a multi-company report, so `companyId` holds the comma-joined ticker list (same `EXCH:SYMBOL` convention as `TICKERS` in Phase 1) rather than a single symbol:

```json
data = {
    "companyId": "NSE:STLTECH,NSE:HFCL",      # comma-joined tickers, same convention as $TICKERS in Phase 1
    "creationTime": "2026-07-07T10:00:00+05:30",   # ISO 8601, set on first write
    "modifiedTime": "2026-07-07T10:00:00+05:30",   # equals creationTime on first write
    "creator": "peer-comparison",
    "model_used": "claude-sonnet-5",  # the model you're running as — required per
                                        # output-dto-standard/SKILL.md's modelUsed rule,
                                        # since the winner/verdict calls here are LLM judgment
    "title": "Telecom Equipment Peer Comparison: STL Tech vs HFCL",
    "date": "May 2026",
    "companies": [
        {"name": "STL Tech", "ticker": "NSE:STLTECH", "cmp": "Rs 165",
         "market_cap_cr": 6800, "sector": "Telecom equipment"}
```

Then execute the two-step HTML-to-PDF pipeline:

```bash
# 1. Generate HTML (Bundle Mode)
bash ./skills/_shared/resolve.sh $(basename $(dirname skills/peer-comparison/SKILL.md)) --input data.json --output report.html

# 2. Render PDF (Clone Mode)
mkdir -p data/peer-comparison
bash ./skills/_shared/resolve.sh render-pdf --html report.html --pdf "data/peer-comparison/<Company>_Output.pdf"
```

See [`stock-api/src/generators/generatePeerPdf.js`](stock-api/src/generators/generatePeerPdf.js).

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
