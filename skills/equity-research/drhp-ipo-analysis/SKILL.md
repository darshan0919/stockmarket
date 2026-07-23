---
name: drhp-ipo-analysis
description: Institutional-grade analysis of Draft Red Herring Prospectus (DRHP) and Red Herring Prospectus (RHP) documents for upcoming Indian IPOs. Extracts and analyses 10 critical sections — business overview, industry, objects of issue, 3-year financials, cash flow, risk factors, promoter & management, related party transactions, peer comparison & valuation, and red flags. Use whenever the user uploads a DRHP / RHP PDF, asks "should I subscribe to X IPO", "analyse this DRHP", "is this IPO fairly priced", or provides a SEBI / NSE / BSE link to a prospectus document. Outputs a multi-page institutional PDF flagging governance concerns, fraud risks, and valuation justification — designed for an IPO subscription decision.
---

# DRHP / IPO Analysis

The DRHP is a one-time information bonanza — it contains **more disclosure about a company than any future annual report ever will**. Promoter compensation history, related party transactions, conflicts of interest, legal proceedings, customer concentration, capital raise rationale — all here, all once.

This skill extracts a structured 10-section view from a DRHP and produces a subscription-decision PDF that explicitly flags red flags before the user puts money in.

## When to use this skill

- User uploads a DRHP or RHP PDF
- User says: "analyse this DRHP", "should I subscribe to [X IPO]", "is this IPO fairly priced", "DRHP red flags"
- User provides a SEBI prospectus URL or NSE/BSE filing link
- Pre-IPO due diligence

## Conventions

Follow [`_shared/conventions.md`](../_shared/conventions.md). Especially: anti-hallucination protocol §3 (DRHPs are LONG and dense — anchor strictly to the document), citation format §2 (every claim gets a page number).

## Required input

- DRHP PDF (typically 400-1000+ pages — some are 1500+)
- OR RHP PDF (similar size) — the final pricing version
- OR a public link to either

Note: DRHPs are **public documents** filed with SEBI. Extracting and analysing them is fully legal and intended.

## Workflow — 4 phases

### Phase 1 — Document inventory (DRHPs are massive)

```bash
DRHP=/path/to/CompanyXYZ_DRHP.pdf
pdfinfo "$DRHP"                              # page count, file size
pdftotext -f 1 -l 5 "$DRHP" -                # first 5 pages: cover + ToC
pdftotext -layout "$DRHP" /tmp/drhp_full.txt # full extract for grep
wc -l /tmp/drhp_full.txt
```

Identify the major sections via the Table of Contents — DRHP structure is highly standardised:

```bash
grep -n -i -E "(table of contents|index of contents)" /tmp/drhp_full.txt | head -3
# Then the standard sections (page numbers vary):
grep -n -i -E "(business|our business|about our company)" /tmp/drhp_full.txt | head -5
grep -n -i -E "(industry overview)" /tmp/drhp_full.txt | head -3
grep -n -i -E "(objects of the (offer|issue))" /tmp/drhp_full.txt | head -3
grep -n -i -E "(financial information|restated financial)" /tmp/drhp_full.txt | head -3
grep -n -i -E "(risk factors)" /tmp/drhp_full.txt | head -3
grep -n -i -E "(our promoters|promoter group)" /tmp/drhp_full.txt | head -3
grep -n -i -E "(related party)" /tmp/drhp_full.txt | head -3
grep -n -i -E "(litigation|outstanding litigation)" /tmp/drhp_full.txt | head -3
```

Then extract each section to a separate file with `pdftotext -f X -l Y` for that page range. **Don't dump the whole DRHP into context at once.**

### Phase 2 — 10-section extraction

Apply the framework in [`references/drhp_10section.md`](references/drhp_10section.md). Sections:

1. **Business Overview** — Core activities, products/services, revenue streams, geography
2. **Industry & Market** — Trends, growth potential, competition, market size, claimed market share
3. **Objects of the Issue** — How proceeds will be used (debt repayment, expansion, working capital, OFS share)
4. **Financial Highlights (3 years)** — Revenue, EBITDA, EBITDA margin, Net profit & margin, CFO, EPS, ROE, ROCE
5. **Cash Flow Analysis** — Operating, investing, financing trends; flag profit/cash mismatches
6. **Risk Factors** — Most critical and specific risks (skip generic boilerplate)
7. **Promoter & Management** — Names, background, holding (pre/post IPO), controversies, legal actions
8. **Related Party Transactions** — Major RPTs, comment if abnormal or conflict-prone
9. **Peer Comparison & Valuation** — Revenue/margins/multiples vs listed peers; is the IPO pricing fair?
10. **Red Flags** — explicit checklist (see below)

### Phase 3 — Red Flag Scan

This is the differentiator vs a generic DRHP summary. Run the explicit red-flag checklist from [`references/drhp_red_flags.md`](references/drhp_red_flags.md):

- Negative cash flows with positive profits
- Sudden profit spike in the year before IPO (window dressing)
- Large OFS component (promoters cashing out >30% of issue)
- Auditor qualifications or change in last 3 years
- Heavy dependence on few clients (top 3 = >40% of revenue)
- Significant pending legal proceedings against promoter or company
- Promoter compensation extreme as % of PAT
- Related party transactions that look like value extraction
- Working capital cycle stretched in IPO year
- Industry section relies heavily on a single paid market-research report

Each red flag rated **GREEN / YELLOW / RED** with verbatim evidence and page citation.

### Phase 4 — Data layer vs UI layer (hard boundary, do not blur)

**This phase has two strictly separate steps. Never let one script or one pass of edits do
both.** The failure mode this guards against: an analyst "compresses for readability" and, in
doing so, silently drops facts — because there was no persisted canonical record to compress
*from*, only a single hand-written document that was both the data and the layout at once.

1. **Data layer (extraction + processing) → persist the full DTO, no compression decisions here.**
   Everything gathered in Phases 1-3 — every number, every named entity, every citation — goes
   into a JSON DTO. This step's only job is completeness and accuracy; it never asks "is this
   worth including," only "is this true and cited." Persist it via
   `require('packages/jobs-runtime/lib/db.js').saveReport(dto)` (per
   [`skills/tooling/output-dto-standard/SKILL.md`](../../tooling/output-dto-standard/SKILL.md)) —
   this writes `data/reports/<id>.json` (the full body, the source of truth) and links it into
   `data/companies.json`. The DTO is a **superset schema**: every section the 10-section framework
   produces gets a structured field (arrays of objects for repeatable data — RPTs, litigation,
   red flags, promoters, objects of issue — not prose paragraphs), so the render step never has
   to parse free text to find a fact.

   Required envelope fields (enforced by `ensureEnvelope`): `companyId`, `creator` (=
   `"drhp-ipo-analysis"`), `date`, `type` (=`"drhp-ipo-analysis"`), `summary`. Domain fields
   (non-exhaustive — extend as the DRHP demands, never remove to save space):

   ```json
   {
     "type": "drhp-ipo-analysis", "creator": "drhp-ipo-analysis", "companyId": "BSE:...",
     "date": "...", "summary": "...",
     "source_documents": [{"label": "DRHP", "url": "...", "filed": "...", "pages": 449}],
     "company_name": "...", "cin": "...", "issue_type": "Mainboard IPO|SME IPO|FPO",
     "filing_date": "...", "listing": "...",
     "post_listing_status": {"already_listed": bool, "cmp_inr": num, "market_cap_cr": num, "trailing_pe": num, "note": "..."},
     "subscription_view": "SUBSCRIBE|SUBSCRIBE-FOR-LISTING-GAINS-ONLY|WATCH-POST-LISTING|AVOID",
     "verdict_rationale": "...",
     "kpi_headline": [{"label": "...", "value": "...", "sub": "..."}],
     "business_overview": {"text": "...", "citation": "...", "product_mix_fy25_pct": {}, "customer_mix_fy25_pct": {}},
     "promoters": [{"name": "...", "role": "...", "pre_issue_pct": num}],
     "objects_of_issue": [{"object": "...", "amount_inr_lakh": num, "fy27_lakh": num, "fy28_lakh": num}],
     "financials_restated_inr_lakh": {"periods": [...], "revenue": [...], "ebitda_margin_pct": [...], "pat": [...], "ronw_pct": [...], "roce_pct": [...], "debt_equity": [...], "cfo_inr_lakh": [...], "debtor_days": [...], "top10_customer_concentration_pct": [...], "citation": "..."},
     "cash_flow_commentary": "...",
     "related_party_transactions": [{"party": "...", "relationship": "...", "nature": "...", "fy25_amount_inr_lakh": num, "pct_of_revenue": num, "note": "..."}],
     "litigation": {"against_company": [...], "against_promoters": [...], "against_directors": [...], "criminal_against_company_promoters_kmp": int, "notes": "...", "citation": "..."},
     "contingent_liabilities_inr_lakh": [{"item": "...", "as_at_...": num}],
     "auditor": {"current": "...", "appointed": "...", "predecessor": "...", "qualifications": "...", "citation": "..."},
     "industry": {"source": "...", "commentary": "...", "citation": "..."},
     "peer_valuation": {"listed_peers_in_india": "...", "weighted_avg_eps_inr": num, "citation": "..."},
     "red_flags": [{"flag": "...", "rating": "GREEN|YELLOW|RED", "evidence": "..."}],
     "limitations": ["..."],
     "order_book_inr_cr": num, "order_book_as_of": "...",
     "additional": { }
   }
   ```

   `additional` (any JSON shape — see
   [`skills/tooling/output-dto-standard/SKILL.md`](../../tooling/output-dto-standard/SKILL.md))
   is where stock/sector/scenario-specific nuance goes when it doesn't fit any field above —
   e.g. a bear/base/bull scenario, a smart-city-capex dependency note, an export-geography
   split unique to this issuer. Don't distort another field to fit the insight in; don't drop
   the insight because there's no field for it. The renderer (below) lays it out automatically.

   See `skills/equity-research/drhp-ipo-analysis/scripts/render_drhp.py`'s docstring for the
   complete field list this render step consumes — treat that as the living schema reference.

2. **UI layer (rendering) → pure function of the DTO, zero content decisions.**
   Run `python3 skills/equity-research/drhp-ipo-analysis/scripts/render_drhp.py data/reports/<id>.json data/drhp-ipo-analysis/<Company>_Output.pdf`.
   This script (or the JS-generator path via `stock-api/src/generators/generateDrhpPdf.js` if
   wired for the run) may choose layout, component (table/vmatrix/kpi-grid/chip), typography, and
   color per `skills/_shared/pdf-design-guide.md` — but it must never omit a field that exists in
   the DTO, never summarize a sentence down to fewer facts, and never invent a fact not in the
   DTO. If the render script needs a DTO field that doesn't exist yet, that's a signal to go back
   to step 1 and extend the DTO — never to work around it by writing the fact directly into the
   render script.

**Verification before shipping the PDF:** diff the rendered PDF's content against the DTO's
field list — every top-level object/array in the DTO should be visibly represented somewhere in
the output. This is the concrete check for the "no information loss" requirement.

## Output discipline

- **Subscription view is the headline.** A fund manager reading this will look at the verdict box first, then read justification.
- **Quote verbatim** for: auditor qualifications, risk factors, RPT line items, promoter legal proceedings.
- **Page-cite everything** — DRHPs are 500-1000 pages, finding the exact source matters.
- **Flag the OFS-heavy issues prominently.** If >50% of issue size is OFS (promoters cashing out), highlight on page 1.
- **Do not skip generic risk factors entirely** — pull the SPECIFIC ones (those mentioning a named customer, a specific lawsuit, a real geographic concentration). Generic boilerplate gets a single line.

## The 4 subscription-view options

| View | When to use |
|---|---|
| **SUBSCRIBE** | All 10 sections clean; valuation reasonable vs peers; no RED red flags; IPO-grade Quality category |
| **SUBSCRIBE-FOR-LISTING-GAINS-ONLY** | Hot sector / high subscription expected, but post-listing fundamentals don't justify hold |
| **WATCH-POST-LISTING** | Worth following but valuation or red flags suggest waiting for better entry |
| **AVOID** | Any RED red flag; OR issue is dominated by OFS with no growth funding; OR valuation extreme; OR pending material litigation |

## Pitfalls to avoid

- **Trusting the "About Us" section.** It's marketing. Anchor on financial restated statements and risk factors.
- **Skipping the litigation section.** Often boring but the most actionable — pending criminal proceedings against promoters are not common but show up in DRHPs.
- **Over-weighting the auditor.** A clean opinion in a DRHP is the minimum bar; the auditor doesn't catch governance issues.
- **Ignoring the industry consultant report.** The "Industry" section in DRHPs is often paid for by the issuer (CRISIL, Frost & Sullivan reports). Treat with skepticism — verify market share / TAM claims independently.
- **Anchoring on the price band.** The price band reflects what the issuer wants to receive, not what the company is worth.

## File tree

```
drhp-ipo-analysis/
├── SKILL.md                                 (this file)
├── _shared/
│   ├── conventions.md                       (linked)
│   └── pdf_utils.py                         (shared)
├── references/
│   ├── drhp_10section.md                    (full 10-section framework)
│   └── drhp_red_flags.md                    (explicit red-flag checklist)
└── scripts/
    ├── generate_drhp_pdf.py                 (PDF generator, JS-generator-path alternative)
    └── render_drhp.py                       (UI-layer renderer — pure function of the DTO;
                                                see its module docstring for the full field
                                                list it consumes. Data layer writes the DTO via
                                                db.saveReport(); this script only lays it out.)
```
