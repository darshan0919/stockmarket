---
name: growth-triggers-1pager
description: >-
  Produces a single-page institutional-quality growth triggers PDF for Indian
  listed companies. Use for "growth triggers", "1-pager", "catalyst note",
  "re-rating triggers", "conviction note", "why will this stock re-rate", or
  when user provides a Screener.in / Stockscans ticker and asks for a concise
  analysis with triggers, timelines, and conviction tags. Auto-fetches documents
  from Stockscans when only a ticker is provided. Full pipeline: research,
  5-section analysis, 1-page PDF.
---

# Growth Triggers 1-Pager

Output: 1-page A4 PDF. Tone = conviction note briefing a PM before position sizing. Every word earns its place.

## Workflow — 3 phases

### Phase 1 — Research

#### Phase 1a — Document acquisition (ticker-only input)

If the user provides a Stockscans ticker and has NOT uploaded PDFs, fetch primary-source documents before beginning analysis. Growth triggers analysis requires at minimum the latest 2 ARs + 2 concall transcripts + 2 investor decks.

```bash
TICKER="NSE:SWARAJENG"            # replace with actual ticker
SAFE=$(echo "$TICKER" | tr ':' '_')
DOCS_DIR="/tmp/${SAFE}_triggers_docs"

python3 stock-api/python/fetchers/fetch_documents.py "$TICKER" \
    -t "Annual Report" Transcript PPT Result \
    --last-n 2 \
    -o "$DOCS_DIR"

# The most recent Transcript above is the primary source for current
# guidance — but it's only there if Stockscans has officially filed it.
# Check whether concall-transcript-extractor can do better for that quarter:
node stock-api/bin/get-latest-concall-transcript.js "$TICKER"
```

Use `$DOCS_DIR/manifest.json` to identify which files are which type before
running `pdftotext`. The most recent `Transcript` (highest `date` value) is
the primary source for current guidance; the most recent `PPT` is the primary
source for capacity/capex disclosures. If `get-latest-concall-transcript.js`
returned `status: "saved"`, its `id` points at `data/reports/<id>.json` —
read `fullText` from there as the current-guidance source instead of (or
alongside, for the prior quarter) the bulk-fetched Transcript PDFs; if it
returned `official-transcript-exists`, the bulk fetch above already has what
you need.

#### Phase 1b — PDF extraction and web research

- **Uploaded or auto-fetched PDFs:** `pdftotext -f 1 -l <PAGES> <file>.pdf out.txt`; then grep for `capacity|capex|revenue|EBITDA|margin|new product|order book|guidance|promoter` and read MDA / Directors' Report / financial highlights with `sed`.
- **Web (always):** CMP + market cap + PE + PB (current year), latest Q results, capacity/capex plans, industry TAM, sector-specific catalysts (PLI, tariffs, emission norms).
- **Screener.in:** fetch for financial tables, peer comp, shareholding, quarterly trends.

### Phase 2 — Analyze into 5 sections

**1. Company snapshot** — 3–4 lines plain English (business, value-chain position, moat or commodity, promoter %). Then the 8-column KPI table: `FY Rev | FY PAT | EBITDA Mgn | ROE | ROCE | Debt | PE (TTM) | Div Yield` (TTM if annuals not out).

**2. Core growth triggers (5–7)** — each with:
- Name (5–7 words)
- Body (2–3 sentences — specific event / capex / policy / order)
- Quantified impact (revenue Rs Cr, margin bps, volume %, TAM)
- Timeline (e.g. "H2 FY27", "FY28–30")
- Conviction tag: `HIGH CONVICTION` (in book / contracted / notified) / `MEDIUM CONVICTION` (guided, not contracted) / `OPTIONALITY` (asymmetric, not in consensus)

Trigger ranking order: capacity → new product/geo → margin expansion → policy → industry structure → balance sheet → governance.

Rules: company-specific and verifiable only (concall / deck / AR / order-book disclosure). No generic tailwinds. Cite primary sources. Flag undisclosed data as "awaiting disclosure" — don't guess.

**3. What's in the price** — 2–3 lines: consensus view + where the incremental surprise is vs street.

**4. Key risks (3–4)** — execution / regulatory / commodity / demand / balance-sheet / concentration. Each with mitigant or probability qualifier.

**5. Trigger scoreboard** — compact table `# | Trigger | Impact | Timeline | Conviction`, color-coded (GREEN/ORANGE/RED).

### Phase 3 — PDF generation

Write the following JSON to a temporary file (e.g. `data.json`). This `data.json` is the canonical DTO — render-pdf's PDF output is a reproducible rendering of it, not a separate source of truth, so the four envelope fields below must be present at the top level:

```json
data = {
    "companyId": ticker,                      # e.g. "NSE:SWARAJENG" — same value as $TICKER in Phase 1a
    "creationTime": "2026-07-07T10:00:00+05:30",   # ISO 8601, set on first write
    "modifiedTime": "2026-07-07T10:00:00+05:30",   # equals creationTime on first write
    "creator": "growth-triggers-1pager",
    "company_name": "...", "ticker": "NSE: ...", "date": "Month Year",
    "cmp": "Rs ...", "market_cap": "Rs ... Cr", "cap_category": "Small/Mid/Large Cap",
    "sector": "...",
    "snapshot": "Business paragraph with <b>bold</b> for key numbers.",
    "kpi_headers": [...8 labels...], "kpi_values": [...8 values...],
    "triggers": [{"name": ..., "body": ..., "impact": ..., "timeline": ..., "conviction": ...}
```

Then execute the two-step HTML-to-PDF pipeline:

```bash
# 1. Generate HTML (Bundle Mode)
bash ./skills/_shared/resolve.sh $(basename $(dirname skills/growth-triggers-1pager/SKILL.md)) --input data.json --output report.html

# 2. Render PDF (Clone Mode)
mkdir -p data/growth-triggers-1pager
bash ./skills/_shared/resolve.sh render-pdf --html report.html --pdf "data/growth-triggers-1pager/<Company>_Output.pdf"
```

Script at [`stock-api/src/generators/generatePdf.js`](stock-api/src/generators/generatePdf.js). Shares palette/helpers with `../stock-api/python/utils/pdf_utils.py`. **PDF must fit on 1 page.** If it spills: cut trigger body text, not triggers. Drop to 5 triggers if still tight.

## Conventions & pitfalls

- Rs/INR and Cr (crores) only. FY26 = Apr 2025–Mar 2026.
- Every trigger must have a number AND a timeline. "In the future" is not a timeline.
- "India GDP growing" is not a trigger. Cite policy/norm/contract/capex with quantified impact.
- "What's in the price" is what makes this useful to a PM — don't skip it.
