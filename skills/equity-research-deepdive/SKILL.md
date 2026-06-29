---
name: equity-research-deepdive
description: Produces a multi-page institutional equity research PDF (15–40 pages) covering business, competition, financials, management, valuation, scenarios, and investment verdict. Use for "deep dive", "research report", "investment memo", "fundamental analysis", "should I invest in X", "analyze this company", "tell me everything about X", or when user provides a Screener.in / Stockscans / Trendlyne / Tickertape link with a request for detailed analysis. **NOT** for 1-pagers or catalyst notes — those route to `growth-triggers-1pager`.
---

# Equity Research Deep Dive

Output: 15–40 page institutional PDF. Tone = senior analyst briefing a CIO. Quality > length.

## Workflow — 4 phases

### Phase 1 — Research & data gathering (CRITICAL)

Report quality is 100% gated on research depth.

#### Phase 1a — Document acquisition (ticker-only input)

If the user provides a Stockscans ticker and has NOT uploaded PDFs, fetch all primary-source documents first. This is mandatory — do not proceed to analysis on web data alone.

```bash
TICKER="NSE:SWARAJENG"            # replace with actual ticker
SAFE=$(echo "$TICKER" | tr ':' '_')
DOCS_DIR="/tmp/${SAFE}_deepdive_docs"

# 5 ARs + 4 quarters each of concalls, presentations, results
python3 packages/stock-api/python/fetchers/fetch_documents.py "$TICKER" \
    -t "Annual Report" Transcript PPT Result \
    --last-n 4 \
    -o "$DOCS_DIR"
```

One pass fetches all four types (4 each = up to 16 PDFs). Then treat every file in `$DOCS_DIR` identically to an uploaded PDF. Use `$DOCS_DIR/manifest.json` to identify documents by `documentType` and `date` for targeted `grep`/`sed` extraction — this avoids running `pdftotext` blindly on 16 files.

For annual reports specifically, run `--last-n 5` separately (5 years > 4 quarters of depth):
```bash
python3 packages/stock-api/python/fetchers/fetch_documents.py "$TICKER" \
    -t "Annual Report" --last-n 5 -o "$DOCS_DIR"
```

#### Phase 1b — PDF text extraction

- **Uploaded or auto-fetched PDFs:** `pdftotext -f 1 -l 999 <file>.pdf out.txt`, then `grep`/`sed` for sections.
- **Web research (always):** follow the 12-search framework in [`references/research_template.md`](references/research_template.md) §Research Searches.
- **Financial portals:** Screener.in → tables/peers/shareholding. MoneyControl → broker estimates. Trendlyne/Tickertape → additional data points.
- **Concalls + decks:** latest quarter is the richest source.

### Phase 2 — Analysis & structuring

Use the 19-section framework in [`references/research_template.md`](references/research_template.md). Effort allocation:

| Priority | Sections |
|---|---|
| CRITICAL | Business Deep Dive, Management Commentary, Management Track Record, Variant Perception |
| HIGH | Peer Comparison, Financial Quality, Scenario Building, Valuation |
| IMPORTANT | Industry, Pipeline, Capital Allocation, Guidance |
| SUPPORTING | Product, Performance, Shareholding, Q&A, Technical, Key Quotes |

**Principles:** quantify everything (ban "could grow"); label facts vs opinion; challenge management claims with data; use INR/Cr/FY26 conventions.

### Phase 3 — Writing

Skip sections where data is genuinely unavailable. Surface red flags prominently. Verdict must be actionable: Buy/Hold/Avoid + time horizon + key triggers + sizing guidance + what would invalidate the thesis. Include both bull and bear arguments.

### Phase 4 — PDF generation

```python
import sys; sys.path.insert(0, '<skill_path>/scripts')
from generate_report import create_research_report
create_research_report(company_name, ticker, report_markdown, output_path)
```

Script at [`packages/stock-api/python/generators/generate_report.py`](packages/stock-api/python/generators/generate_report.py). Uses shared palette/helpers from `../packages/stock-api/python/utils/pdf_utils.py`. Fallback: `pandoc report.md -o report.pdf --pdf-engine=weasyprint`.

## Pitfalls to avoid

- Restating financials without explaining WHY numbers moved.
- No peer context (metrics are meaningless without comparison).
- Being polite about red flags (CFO<<PAT, high RPT, rising pledge).
- Generic industry commentary ("India is growing" ≠ analysis).
- No variant perception → report adds no value over a terminal.
- Vague scenarios without explicit revenue/margin/multiple assumptions.
