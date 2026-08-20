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
python3 stock-api/python/fetchers/fetch_documents.py "$TICKER" \
    -t "Annual Report" Transcript PPT Result \
    --last-n 4 \
    -o "$DOCS_DIR"
```

One pass fetches all four types (4 each = up to 16 PDFs). Then treat every file in `$DOCS_DIR` identically to an uploaded PDF. Use `$DOCS_DIR/manifest.json` to identify documents by `documentType` and `date` for targeted `grep`/`sed` extraction — this avoids running `pdftotext` blindly on 16 files.

If the newest of the 4 Transcript entries isn't actually the most recently
completed quarter (Stockscans hasn't officially filed it yet), backfill with
`yarn workspace @stock/api get-latest-concall-transcript "$TICKER"` — read
`fullText` from `data/reports/<id>.json` if it returns `status: "saved"`.
A deep dive missing the freshest quarter's commentary is a real gap, not a
minor one.

For annual reports specifically, run `--last-n 5` separately (5 years > 4 quarters of depth):

```bash
python3 stock-api/python/fetchers/fetch_documents.py "$TICKER" \
    -t "Annual Report" --last-n 5 -o "$DOCS_DIR"
```

#### Phase 1b — PDF text extraction

- **Uploaded or auto-fetched PDFs:** `pdftotext -f 1 -l 999 <file>.pdf out.txt`, then `grep`/`sed` for sections.
- **Web research (always):** follow the 12-search framework in [`references/research_template.md`](references/research_template.md) §Research Searches.
- **Financial portals:** Screener.in → tables/peers/shareholding. MoneyControl → broker estimates. Trendlyne/Tickertape → additional data points.
- **Concalls + decks:** latest quarter is the richest source.

### Phase 2 — Analysis & structuring

Use the 19-section framework in [`references/research_template.md`](references/research_template.md). Effort allocation:

| Priority   | Sections                                                                               |
| ---------- | -------------------------------------------------------------------------------------- |
| CRITICAL   | Business Deep Dive, Management Commentary, Management Track Record, Variant Perception |
| HIGH       | Peer Comparison, Financial Quality, Scenario Building, Valuation                       |
| IMPORTANT  | Industry, Pipeline, Capital Allocation, Guidance                                       |
| SUPPORTING | Product, Performance, Shareholding, Q&A, Technical, Key Quotes                         |

**Principles:** quantify everything (ban "could grow"); label facts vs opinion; challenge management claims with data; use INR/Cr/FY26 conventions.

### Phase 3 — Writing

Skip sections where data is genuinely unavailable. Surface red flags prominently. Verdict must be actionable: Buy/Hold/Avoid + time horizon + key triggers + sizing guidance + what would invalidate the thesis. Include both bull and bear arguments.

### Phase 4 — Write the DTO, then generate the PDF

Per `skills/tooling/output-dto-standard/SKILL.md`, the PDF must be reproducible FROM a
persisted JSON DTO — never generated directly from `report_markdown` with no
intermediate artifact. `stock-api/src/generators/generateReport.js` implements this as
two explicit steps:

1. **Write the DTO** — `writeReportDto(companyId, companyName, ticker, reportMarkdown, dtoPath, modelUsed)`
   persists `{TICKER}_deepdive.json` (e.g. `data/agent-outputs/{TICKER}_deepdive.json`)
   with the required envelope fields (`companyId`, `creationTime`, `modifiedTime`,
   `creator: "equity-research-deepdive"`) alongside the full `reportMarkdown` (the 19-section
   write-up from Phase 3). If the JSON already exists for this ticker, it preserves the
   original `creationTime` and only bumps `modifiedTime`. `reportMarkdown` is entirely
   LLM-authored analysis, so per `output-dto-standard/SKILL.md`'s `modelUsed` rule pass
   the model you're running as (e.g. `"claude-sonnet-5"`) as the last arg — never omit it.
2. **Render from the DTO** — `createResearchReportFromDto(dtoPath, outputPath)` reads
   that JSON back and is the ONLY step that touches the PDF/HTML rendering — it is a pure
   function of the DTO, never a second independent pass over the analysis. It also stamps
   `dto.modelUsed` into the rendered disclaimer footer automatically.

```js
const { createResearchReport } = require('<repo_root>/stock-api/src/generators/generateReport.js');
// Convenience wrapper: writes the DTO then renders from it in one call.
await createResearchReport(companyName, ticker, reportMarkdown, outputPath, {
  companyId: ticker,
  modelUsed: 'claude-sonnet-5',
});
```

Or call the two steps explicitly if you want to inspect/edit the DTO between writing and
rendering:

```js
const {
  writeReportDto,
  createResearchReportFromDto,
} = require('<repo_root>/stock-api/src/generators/generateReport.js');
const dtoPath = outputPath.replace(/\.[^./]+$/, '') + '.json';
writeReportDto(ticker, companyName, ticker, reportMarkdown, dtoPath);
// ... inspect/edit dtoPath here if needed ...
await createResearchReportFromDto(dtoPath, outputPath);
```

Uses shared palette/helpers from `../stock-api/python/utils/pdf_utils.py`. Fallback:
`pandoc report.md -o report.pdf --pdf-engine=weasyprint` (in the fallback path, still
write `{TICKER}_deepdive.json` first with the same envelope fields before invoking pandoc).

## Pitfalls to avoid

- Restating financials without explaining WHY numbers moved.
- No peer context (metrics are meaningless without comparison).
- Being polite about red flags (CFO<<PAT, high RPT, rising pledge).
- Generic industry commentary ("India is growing" ≠ analysis).
- No variant perception → report adds no value over a terminal.
- Vague scenarios without explicit revenue/margin/multiple assumptions.
