---
name: forensic-accounting
description: Institutional-grade forensic accounting analysis for Indian listed companies — the 9-section Forensic Master Prompt, Piotroski F-Score, DuPont decomposition, and pattern-matching against the 4 documented Indian fraud cases (Gensol, Brightcom, Manpasand, IndusInd). Use this skill whenever the user wants to detect accounting red flags, asks for a "forensic check", "fraud detection", "accounting quality review", "is this company cooking the books", "Piotroski score", "DuPont analysis", or uploads an annual report and asks "what could be wrong with this". Also trigger when another skill (deepdive, master, growth-triggers) needs §11 financial-quality analysis. Auto-fetches annual reports from Stockscans when given only a ticker. Output is a multi-page institutional PDF with a Green/Yellow/Red checklist, quantified red flags with page citations, and an overall accounting-quality rating.
---

# Forensic Accounting

> "If the auditor resigns without explanation — that alone is a sell signal. True in every major Indian fraud case." — *AI for the Intelligent Investor*, Day 1, p.61

This skill encodes the single most important prompt from the SOIC course: a brutal, evidence-grounded forensic check on a company's annual report. Every claim must cite a page number. Every red flag must quantify the impact. The output is read by a fund manager who is one quarter away from sizing a position — accuracy and pessimism beat hedge.

## When to use this skill

- User uploads an annual report and asks for a forensic / red-flag / accounting-quality review
- User provides a Stockscans ticker and asks "is the accounting clean", "any red flags", "forensic check on X"
- User wants Piotroski F-Score or DuPont decomposition (these come bundled here, not in a separate skill)
- Another skill (`equity-research-deepdive` §11, `equity-research-master` Tab 7) delegates to this for the financial-quality analysis
- After a fraud disclosure on a peer, user asks "could this happen at companies I hold?"

## Conventions

This skill follows the equity-research library conventions in [`_shared/conventions.md`](../_shared/conventions.md) — currency, fiscal year, citation format, anti-hallucination protocol, and **the forensic thresholds table** (CFO/PAT < 0.8 → YELLOW, etc.). Apply those thresholds; don't redefine them here.

## Workflow — 4 phases

### Phase 1 — Document acquisition

Forensic analysis needs **3 consecutive annual reports** (last 3 FYs) — single-year analysis can't see DSO drift, RPT growth, or auditor-change patterns. If the user has uploaded ARs, use them. Otherwise auto-fetch:

```bash
TICKER="NSE:SWARAJENG"            # replace with actual
SAFE=$(echo "$TICKER" | tr ':' '_')
DOCS_DIR="/tmp/${SAFE}_forensic_docs"

python3 /tmp/fetch_documents.py "$TICKER" \
    -t "Annual Report" --last-n 3 -o "$DOCS_DIR"
```

Read `$DOCS_DIR/manifest.json` to confirm. If only 1–2 ARs are available (e.g., recent IPO), proceed but flag in the output that trend analysis is limited.

### Phase 2 — Extraction (use the right tool for each section)

For each AR, extract these sections targeted-ly. Don't `pdftotext` 250 pages and hope grep finds it:

| Section needed | Extraction approach |
|---|---|
| P&L, Balance Sheet, Cash Flow | `pdftotext -layout` then `grep -A 30 "Statement of Profit"`, `"Balance Sheet"`, `"Cash Flow Statement"` |
| Notes to accounts (RPTs, contingent liabs, accounting policies) | Find Notes section table of contents, extract specific note-number ranges |
| Auditor's Report + CARO + KAMs | Always near front; usually pp.50–80 in larger ARs |
| MDA | Front section, use grep for "Management Discussion" |
| Director's Report / Corporate Governance | Front section |

Reference the [extraction patterns in `references/forensic_extraction.md`](references/forensic_extraction.md) for grep templates per section.

### Phase 3 — Run the 9-section forensic check

Apply [`references/forensic_master_prompt.md`](references/forensic_master_prompt.md) — the full nine-section framework with thresholds, evidence requirements, and the Gensol/Brightcom/Manpasand/IndusInd pattern-matchers.

Sections:
1. **Brief summary** — Green/Yellow/Red checklist with one-line evidence per item
2. **Revenue recognition** — Aggressive practices, channel stuffing, capitalisation policies (Brightcom pattern)
3. **Cash flow discrepancies** — CFO vs PAT vs EBITDA bridge (Gensol pattern)
4. **Related party transactions** — Quantum, growth vs revenue, circular schemes (Gensol/Manpasand pattern)
5. **Balance sheet** — Receivables aging, inventory days, intangibles, write-offs
6. **Contingent liabilities** — As % of net worth; unusual movements
7. **Misc expenses** — As % of sales (>3% = RED)
8. **MDA consistency** — Numbers vs commentary; what's NOT being said
9. **Auditor's report** — CARO observations, KAMs, qualified opinion, auditor changes (Manpasand pattern)

Then run **two bonus analyses** every time:

- **Piotroski F-Score** (9-component quality score) — see [`references/piotroski_dupont.md`](references/piotroski_dupont.md)
- **DuPont decomposition** (ROE = NPM × AT × EM) — see [`references/piotroski_dupont.md`](references/piotroski_dupont.md)

### Phase 4 — PDF generation

```python
import sys
sys.path.insert(0, '<skill_path>/scripts')
from generate_forensic_pdf import create_forensic_pdf

data = {
    "company_name": "...", "ticker": "NSE: ...", "date": "Month Year",
    "fy_range": "FY23–FY25",
    "snapshot": "Brief paragraph on the business + why this forensic was done.",
    "kpi_headers": [...8 labels...], "kpi_values": [...8 values...],
    "overall_rating": "GREEN" | "YELLOW" | "RED",
    "rating_rationale": "One paragraph.",
    "checklist": [   # the GREEN/YELLOW/RED summary table
        {"area": "CFO/PAT", "flag": "GREEN", "evidence": "...", "page": "FY25 AR p.142"},
        ...
    ],
    "sections": [   # the 9 forensic sections
        {"title": "1. Revenue recognition", "flag": "GREEN", "body": "...", "evidence": [...]},
        ...
    ],
    "piotroski": {"score": 7, "components": [...9 items...]},
    "dupont": {"years": [...], "roe": [...], "npm": [...], "at": [...], "em": [...], "interpretation": "..."},
    "fraud_pattern_check": [
        {"pattern": "Gensol — diversion via shells", "match": "NO", "evidence": "..."},
        ...
    ],
    "output_path": "/mnt/project/packages/cowork-jobs/data/agent-outputs/<Company>_Forensic.pdf",
}
create_forensic_pdf(data)
```

The PDF is typically 4–8 pages: 1 page summary + checklist, 1 page per major section (sometimes combined), plus Piotroski/DuPont and fraud-pattern-match table at the end.

## Output discipline

- **Quote, don't paraphrase** for auditor qualifications, KAMs, accounting policy changes — exact language matters.
- **Quantify** every flag: "DSO rose from 31 to 53 days FY24→FY25 = Rs 24 Cr blocked" beats "receivables stretching".
- **Page-cite** every claim. No claim without a page.
- **Captive supplier exception** — When the user has flagged the company as a captive supplier (per memory: e.g., Swaraj Engines → M&M), revenue concentration and high RPT-with-parent are structurally normal; flag with **YELLOW + context** rather than RED.
- **Don't soften** for relationship reasons. If the auditor resigned, say so plainly.

## Cross-skill integration

This skill is invoked by:
- `equity-research-deepdive` (delegates §11 Financial Quality & Red Flags entirely to this skill — no duplication)
- `equity-research-master` (Tab 7 Forensics consumes the schema this skill produces)
- `consecutive-filings-diff` Phase 1 forensic backbone references the same threshold table

When called from another skill, set `output_format="schema"` instead of `"pdf"` — the calling skill will render. See [`scripts/generate_forensic_pdf.py`](scripts/generate_forensic_pdf.py) for the schema definition.

## Pitfalls to avoid

1. **One AR is not enough.** DSO drift, RPT growth, auditor changes — all need ≥2 years.
2. **Don't average suspicious numbers away.** If FY24 RPT was 8% of revenue and FY25 was 22%, that's a flag. Don't report "average 15%".
3. **Don't credit "explanation" without verification.** If management says the RPT increase was "one-time", check FY26 H1 data — is it really one-time?
4. **Auditor change without explanation = RED.** Don't accept "routine rotation" as cover. Per Day 1: in every documented Indian fraud case, the auditor change preceded the disclosure.
5. **Piotroski alone is not enough.** A score of 9/9 doesn't override a RED on RPTs.

## File tree

```
forensic-accounting/
├── SKILL.md                                 (this file)
├── _shared/
│   ├── conventions.md                       (linked from library)
│   └── pdf_utils.py                         (shared)
├── references/
│   ├── forensic_master_prompt.md            (the 9-section framework, full text)
│   ├── forensic_extraction.md               (grep/sed patterns for AR section extraction)
│   ├── piotroski_dupont.md                  (Piotroski F-Score + DuPont, with prompts)
│   └── fraud_patterns.md                    (Gensol/Brightcom/Manpasand/IndusInd patterns)
└── scripts/
    └── generate_forensic_pdf.py             (PDF generator with schema definition)
```
