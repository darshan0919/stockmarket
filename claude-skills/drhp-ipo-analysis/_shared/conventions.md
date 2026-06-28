# Equity Research Conventions

Single source of truth for naming, units, citation, and anti-hallucination patterns shared across **all** equity-research skills (`forensic-accounting`, `concall-analysis`, `management-credibility-tracker`, `peer-comparison`, `drhp-ipo-analysis`, `growth-triggers-1pager`, `consecutive-filings-diff`, `equity-research-deepdive`, `equity-research-master`).

Skills should **reference**, not redefine, what's here. Edit this file once and every skill picks up the change.

---

## 1. Indian-market conventions

| Concept | Convention | Example |
|---|---|---|
| Currency | `Rs` or `INR` (never `$`, `₹` symbol acceptable in PDF output but `Rs` in code/text) | `Rs 1,234 Cr` |
| Magnitude | `Cr` (crores = 10 million), `L` (lakhs = 100,000) | `Rs 4,500 Cr` |
| Fiscal year | `FY26` = April 2025–March 2026. Always state "FY" not "F" | `FY26 EBITDA was Rs 8 Cr` |
| Quarters | `Q1 FY26` = Apr–Jun 2025; `Q4 FY26` = Jan–Mar 2026 | `Q3 FY26 results` |
| Trailing 12-month | `TTM` (always uppercase) | `TTM revenue Rs 12 Cr` |
| Tickers | Stockscans format `EXCH:SYMBOL` | `NSE:SWARAJENG`, `BSE:500325` |
| Decimals | 2 decimals for percentages and ratios; 0 for absolute Rs Cr | `EBITDA margin 18.40%`, `Rev Rs 234 Cr` |
| Negative | ASCII hyphen-minus `-`, never Unicode minus `−` | `-12.5%` (correct), `−12.5%` (wrong) |

Common errors to avoid: writing `FY 26`, using `INR Cr` (redundant), confusing `Cr` with `Cr.` (period), writing `Rs.` instead of `Rs`.

---

## 2. Source citation discipline

Every numeric claim, every direct quote, every red flag must have a source tag at the end of the sentence or in a footnote. Pattern:

```
[Source: <doc-type> <quarter-or-year>, p.<page>]
```

Examples:
- `[Source: Q3 FY26 Concall, p.7]`
- `[Source: FY25 AR, MD&A p.42]`
- `[Source: BSE filing 14-Feb-2026]`
- `[Source: Screener.in, accessed 06-May-2026]`

When citing **management quotes** verbatim, format as:
```
"<exact quote>" — <Speaker name + role>, <Q FYxx Concall>
```

Example:
> "We expect 15% revenue growth in FY26 driven by capacity addition." — Mr Sharma, MD, Q4 FY25 Concall

Never invent attributions. If a fact has no source in the documents at hand, mark it `[Source: not in provided material]` and either web-search to verify or omit the claim.

---

## 3. The anti-hallucination protocol

Distilled from "AI for the Intelligent Investor" Day 2, pp.57-58. **Apply in every skill.**

### Source → Extract → Verify → Interpret

1. **Source.** Get the original document — annual report, concall transcript, BSE filing — into context. Don't rely on training data.
2. **Extract.** Pull only the relevant sentences/numbers verbatim. Mark page numbers.
3. **Verify.** Cross-check important numbers against a second source (Screener.in, BSE, the company's own filings). Numbers that disagree by >10% must be flagged, not silently averaged.
4. **Interpret.** *Only after* extract + verify. Keep facts and interpretation in **separate paragraphs** in the output.

### The 10 anti-hallucination techniques

1. **Anchor to documents.** "Answer only from this annual report and concall — do not use outside knowledge."
2. **Stay inside.** "If the answer is not available in the provided material, say `not found in provided material`."
3. **Evidence with every claim.** Every conclusion gets a quote, page number, or source line.
4. **Separate facts from interpretation.** Layer 1 = facts; Layer 2 = interpretation. Never mix.
5. **Admit uncertainty.** "If confidence is low, say so. Do not fill gaps."
6. **Use structured outputs.** Tables and JSON schemas leave less room for fantasy than prose.
7. **Ask smaller questions.** Break "tell me everything" into 5 specific sub-questions.
8. **Verify numbers separately.** Especially: dates, percentages, valuation multiples, market shares, legal claims.
9. **Use retrieval, not memory.** Fetch source → extract → summarize. Don't ask the model to remember.
10. **Keep a red-flag list.** Be extra cautious about: future projections, competitor market share, TAM, regulation, "latest" developments, reasons for stock moves.

The master anti-hallucination phrase that goes at the top of any extractive prompt:

> Answer only from the provided documents. Do not use outside knowledge. For every key claim, provide supporting evidence from the source. If the answer is not explicitly available, say "not found in provided material". Separate facts, assumptions, and interpretations.

---

## 4. Document acquisition pattern (uniform across skills)

When a user provides only a Stockscans ticker (e.g., `NSE:SWARAJENG`), every skill that needs primary documents should auto-fetch via `stock-documents-fetcher` rather than asking the user to upload PDFs.

Standard pattern:

```bash
TICKER="NSE:SWARAJENG"          # replace with actual
SAFE=$(echo "$TICKER" | tr ':' '_')
DOCS_DIR="/tmp/${SAFE}_<skill-name>_docs"

python3 /tmp/fetch_documents.py "$TICKER" \
    -t <doc-types> --last-n <N> -o "$DOCS_DIR"
```

After fetching, **always** read `$DOCS_DIR/manifest.json` to confirm what arrived before downstream extraction. The manifest gives `documentType`, `date`, and `path` — use it to route documents to the right `pdftotext` extraction.

If a critical document type returned 0 results (e.g., no transcripts for a small-cap), surface this in the output rather than silently producing an empty section.

How many to fetch (recommended defaults per skill):

| Skill | AR | Transcript | PPT | Result |
|---|---|---|---|---|
| `forensic-accounting` | 3 | 0 | 0 | 0 |
| `concall-analysis` (deep) | 0 | 1 | 0 | 0 |
| `concall-analysis` (multi-Q) | 0 | 4–8 | 0 | 0 |
| `concall-analysis` (multi-peer) | 0 | 1 per peer × 3–6 peers | 0 | 0 |
| `management-credibility-tracker` | 1 | 6–8 | 0 | 0 |
| `peer-comparison` | 1 per company | 1 per company | 1 per company | 1 per company |
| `drhp-ipo-analysis` | DRHP only (special case) | — | — | — |
| `growth-triggers-1pager` | 2 | 2 | 2 | 0 |
| `equity-research-deepdive` | 5 | 4 | 4 | 4 |
| `consecutive-filings-diff` | 0 | 1 | 2 | 0 |

---

## 5. Output presentation rules

### When a skill produces a PDF
- Use ReportLab via `_shared/pdf_utils.py` — palettes (`INSTITUTIONAL_DARK`, `INSTITUTIONAL_LIGHT`), `parse_markdown_table()`, `format_inline_markdown()`, `styled_table()`. Do not re-implement.
- Save to `/mnt/project/packages/cowork-jobs/data/agent-outputs/<Company>_<Skill>.pdf`.
- Always call `present_files` so the user can see and download.

### When a skill produces an HTML widget
- Single self-contained file: one `<style>` in `<head>`, one `<script>` before `</body>`, Chart.js 4.4.1 from CDN if needed. No other external assets.
- ASCII hyphen-minus `-` for negative numbers in JS arrays.
- CSS variables defined in **both** `:root` and `[data-theme="dark"]`.
- Missing data → `---------`, never `NaN` or blank.
- Save to `/mnt/project/packages/cowork-jobs/data/agent-outputs/<Company>_<Skill>.html`.

### When a skill produces a research note (markdown / inline)
- Lead with a 3-line **TL;DR** at the top: rating + key thesis + one risk.
- Tables for any comparison (peer, multi-quarter, scenario).
- Facts and interpretation in separate sections.
- End with a **Source list** if web search was used.

---

## 6. Conviction / rating taxonomies (use the same words everywhere)

### Trigger conviction (growth-triggers, peer-comparison)
- **HIGH CONVICTION** — Visible in order book / contract / notification / capex committed
- **MEDIUM CONVICTION** — Management guided but not yet contracted
- **OPTIONALITY** — Asymmetric upside, not in consensus

### Forensic flags (forensic-accounting, deepdive)
- **GREEN** — No issue; metric within healthy range
- **YELLOW** — Worth monitoring; trend deterioration but not yet a red flag
- **RED** — Active concern; quantified impact and management-not-saying-it

### Walk-the-talk credibility (management-credibility-tracker)
- **+1** — Beat or on-track on a guided metric
- **0** — Mixed (e.g., one of two sub-targets met)
- **-1** — Missed materially (>10% gap)

Aggregate over 4–8 quarters; +5 to +8 = high credibility, -3 or worse = red flag.

### Investment verdict (deepdive, master)
- **BUY** — Conviction position; specify size guidance (high conviction vs tracking)
- **HOLD** — Watch position; track specific triggers
- **AVOID** — Active red flags or valuation extreme

---

## 7. Forensic thresholds (numerical guardrails)

These are the threshold values used across `forensic-accounting`, `consecutive-filings-diff`, and `equity-research-deepdive` §11. When a metric crosses the threshold, flag it.

| Metric | YELLOW threshold | RED threshold |
|---|---|---|
| CFO/PAT (3-yr avg) | <0.8 | <0.5 or negative for 2+ years |
| DSO drift YoY | +5 to +10 days | >+10 days |
| Inventory days drift YoY | +10 to +20 days | >+20 days |
| Receivables growth vs revenue growth | 1.2× to 1.5× | >1.5× |
| Contingent liabilities / Net worth | 5% to 10% | >10% |
| Misc expenses / Revenue | 2% to 3% | >3% |
| Related-party-transactions / Revenue | 10% to 25% | >25% (unless captive supplier) |
| Promoter pledge | 10% to 30% | >30% |
| Debt/Equity (non-financials) | 0.7 to 1.5 | >1.5 |
| Goodwill / Total assets | 15% to 25% | >25% |
| Auditor change in last 3 yrs | 1 change | 2+ changes (any reason) |
| CFO/CEO changes in last 5 yrs | 2 changes | 3+ changes |

Captive supplier exception: For companies with a single dominant customer by business design (e.g., Swaraj Engines selling almost exclusively to M&M tractors), revenue concentration is structurally normal and should be flagged with context, not penalised. Same with RPT % when the related party IS the customer/parent.

---

## 8. Cross-skill referencing format

When one skill refers to another, use this format:

```markdown
See [`<skill-name>`](../<skill-name>/SKILL.md) for the full framework.
```

When a skill's output is consumed by another skill, name it explicitly:

```
This produces [TICKER]_<artifact>.<ext> which is consumed by:
- equity-research-master (orchestrates into Tab N)
- equity-research-dashboard (reads via `_cache/schemas.json`)
```

Skills should **never** copy-paste another skill's framework verbatim. Reference it. If the framework needs to evolve, update one place.

---

## Maintenance

When you change something here, scan all skill SKILL.md files for the old convention and update them:

```bash
grep -rn "<old-pattern>" ./claude-skills/
```

Last updated: May 2026. Owner: equity-research skill library.
