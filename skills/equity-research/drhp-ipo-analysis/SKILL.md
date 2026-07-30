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
4. **Financial Highlights (3 years)** — Revenue, EBITDA, EBITDA margin, Net profit & margin, CFO, EPS, ROE, ROCE, Debt/Equity
5. **Cash Flow Analysis** — Operating, investing, financing trends; flag profit/cash mismatches
6. **Risk Factors** — Most critical and specific risks (skip generic boilerplate)
7. **Promoter & Management** — Names, background, holding (pre/post IPO), controversies, legal actions
8. **Related Party Transactions** — Major RPTs, comment if abnormal or conflict-prone
9. **Peer Comparison & Valuation** — Revenue/margins/multiples vs listed peers; is the IPO pricing fair?
10. **Red Flags** — explicit checklist (see below)
11. **Lock-in / Share Release Schedule** — Every distinct lock-in tranche disclosed under "Capital Structure" (Minimum Promoter's Contribution, excess promoter shareholding, entire pre-Offer capital, Anchor Investor lock-in) with its release date. **Mandatory whenever disclosed — always surfaced on page 1 of the output**, not buried in an appendix; see Phase 4 schema and the renderer's dedicated page-1 section.
12. **Order Book** — Value as of the most recent practicable date disclosed, composition (Government/PSU vs private, direct vs subcontracted), bid-to-win ratio if given, and the company's own caveats about conversion certainty (order books frequently overstate realizable revenue — the DRHP itself usually says so in a risk factor, quote it). Search `order book|order backlog|unexecuted order`.
13. **Forward Strategy — Capex & Product Roadmap** — DRHPs never contain numeric earnings guidance (there's no post-listing concall yet to have generated one), but the "Business Strategies"/"Our Strategy" section describes capex intent, new product/platform plans, and geographic or vertical expansion. Cross-check stated capex intent against the CWIP trend in the balance sheet and the capex line in Objects of the Issue — do the numbers agree with the narrative? Label this section clearly as *strategy*, never as *guidance*, so it isn't mistaken for a number the company committed to.
14. **Moat & Competitive Strengths** — Pull from "Our Strengths"/"Competitive Strengths," but grade critically and say so in the output: regulatory licenses, certifications, or registrations a competitor can't quickly replicate are a real (if often narrow) moat; claims like "experienced management" or "customer-centric approach" are marketing filler, not a moat, and should be named as such rather than repeated at face value.
15. **Niche Products / Platforms** — Any named proprietary platform, product, or IP in the business section (not generic service-line descriptions). List each by name with a one-line description of what it does and why it's differentiated from a plain-vanilla service offering.
16. **Customer Disclosure** — State explicitly whether customer names are disclosed or anonymized (common in DRHPs — check footnotes on concentration tables carefully, they sometimes mislabel "customers" as "suppliers"). Report customer count and repeat/retention stats if given, and track the concentration trend across all disclosed fiscals, not just the latest one — a rising concentration trend is a materially different risk than a flat one at the same level.
17. **Anchor Investors** — The DRHP/Prospectus itself rarely names anchor allottees (published separately by the exchanges after the Anchor Investor Bid Date, sometimes after this document was filed). Note the Anchor Investor Allocation Price and bidding date from the document, then use `WebSearch` to find the published allottee list. Judge investor quality explicitly — established, recognizable domestic MFs/FPIs vs smaller or boutique AIFs — and say which it is; this is a genuine quality signal that's easy to skip if you stop at the DRHP text alone.
18. **Post-Listing Trading Activity** — If `post_listing_status.already_listed` is true, check for bulk/block deals since listing and who the counterparties are. **Do not reach for `WebSearch` first** — same-day bulk/block deal data is rarely indexed by search engines yet, which is why a search-based attempt can come back empty even when a deal happened. Instead hit the exchanges directly, the same way `packages/jobs-runtime/dealsDigest.js` (the daily-deals-digest job) does: `nse.getLargeDeals()` and `bse.getBulkBlockDeals(type, fromDmy, toDmy)` from the `@stock/api` package, which wrap NSE's `/api/snapshot-capital-market-largedeal` and BSE's `BulkDealData_ng` endpoints — both public, no auth needed. Filter the returned rows to the target symbol and date range. Only fall back to `WebSearch` (financial press, Chittorgarh-style trackers) if the direct API call fails or the company isn't found in the response, and say explicitly which path was used so a "nothing found via API" isn't mistaken for "nothing found at all." If nothing is retrievable through either path, say so explicitly in the output — a stated "could not verify" is honest; a silently omitted section reads as "nothing happened," which may not be true.

Sections 12-18 are **not optional add-ons** — treat them as part of the core framework, extracted in the same pass as 1-11, not as follow-up work triggered only when a user asks a second time.

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
_from_, only a single hand-written document that was both the data and the layout at once.

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
   `"drhp-ipo-analysis"`), `date`, `type` (=`"drhp-ipo-analysis"`), `summary`. This DTO is
   entirely LLM-authored analysis (red-flag ratings, subscription view, narrative fields),
   so per `output-dto-standard/SKILL.md`'s `modelUsed` rule it must also carry
   `modelUsed`: the exact model string you are running as right now (e.g.
   `"claude-sonnet-5"`) — set it yourself in the DTO before calling `saveReport`, it is
   never inferred by `db.js`. Domain fields
   (non-exhaustive — extend as the DRHP demands, never remove to save space):

   ```json
   {
     "type": "drhp-ipo-analysis", "creator": "drhp-ipo-analysis", "companyId": "BSE:...",
     "date": "...", "summary": "...", "modelUsed": "claude-sonnet-5",
     "source_documents": [{"label": "DRHP", "url": "...", "filed": "...", "pages": 449}],
     "company_name": "...", "cin": "...", "issue_type": "Mainboard IPO|SME IPO|FPO",
     "filing_date": "...", "listing": "...",
     "post_listing_status": {"already_listed": bool, "cmp_inr": num, "market_cap_cr": num, "trailing_pe": num, "note": "..."},
     "subscription_view": "BUY|ACCUMULATE|HOLD|REDUCE|AVOID",
     "verdict_rationale": "...",
     "lock_in_schedule": [{"category": "Anchor Investors — 50%", "shares_or_pct": "...", "lock_in_period": "30 days from Allotment", "release_date": "YYYY-MM-DD", "note": "..."}],
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
     "additional": {
       "order_book_composition": {"govt_psu_pct": num, "private_pct": num, "bid_to_win_pct": num, "citation": "..."},
       "forward_strategy": {"capex_plans": "...", "capex_vs_cwip_check": "...", "product_roadmap": ["..."], "geographic_expansion": "...", "citation": "..."},
       "moat": [{"strength": "...", "type": "REAL_MOAT|MARKETING_CLAIM", "rationale": "..."}],
       "niche_products": [{"name": "...", "description": "...", "differentiation": "..."}],
       "customer_disclosure": {"names_disclosed": bool, "customer_count": num, "repeat_customer_pct": num, "concentration_trend": "RISING|FLAT|FALLING", "citation": "..."},
       "anchor_investors": {"allocation_price_inr": num, "bidding_date": "...", "total_raised_inr_cr": num, "allottees": [{"name": "...", "pct_of_anchor_book": num}], "quality_assessment": "MARQUEE|MIXED|BOUTIQUE_LESSER_KNOWN", "source": "web-search, not DRHP-native", "citation_url": "..."},
       "post_listing_trading": {"checked": bool, "source": "nse-bse-api|websearch-fallback|unverifiable", "bulk_block_deals": [{"date": "...", "exchange": "NSE|BSE", "buyer": "...", "seller": "...", "qty": num, "price_inr": num}], "note": "state explicitly if unverifiable rather than omitting"}
     }
   }
   ```

   Note: fields 12(partial)-18 (order book composition, forward strategy, moat, niche products,
   customer disclosure, anchor investors, post-listing trading) are nested under `additional`
   rather than as new top-level keys. `render_drhp.py` only has hand-written sections for the
   original top-level fields — anything outside those falls through to the generic shape-sniffing
   renderer via `additional`, which already knows how to lay out arbitrary nested JSON. This means
   these fields render correctly **today**, with zero script changes and zero risk of silently
   dropping data because a renderer section wasn't written yet. `order_book_inr_cr` /
   `order_book_as_of` stay top-level since the renderer already has a dedicated slot for them.
   If these sections earn dedicated, better-laid-out treatment later, that's a `render_drhp.py`
   enhancement to do deliberately — not a reason to skip populating them now.

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

**The PDF is mandatory output, not a stretch goal.** A run of this skill is not complete until
`data/drhp-ipo-analysis/<Company>_Output.pdf` exists on disk and has been verified against the
DTO. Do not substitute a chat-only summary for the PDF because the DTO/render pipeline "seems
unavailable," "seems out of scope for this turn," or "would take too long" — those are usually
wrong assumptions, not real blockers. Before concluding the pipeline is unavailable:

1. Check whether the connected workspace actually contains the `stockmarket` repo (it does for
   this user) and whether `skills/equity-research/drhp-ipo-analysis/scripts/render_drhp.py` and
   `packages/jobs-runtime/lib/db.js` exist at the expected paths — a quick `find`/`ls`, not a
   guess from memory of a previous session.
2. If the repo genuinely isn't reachable (e.g. running in a context with no workspace connected
   at all), say so explicitly to the user and explain exactly what's missing — don't quietly
   drop the PDF step and only mention it if asked.
3. If time/effort feels tight, that's a reason to work more efficiently (e.g. batch the greps,
   skip re-reading files you already extracted), never a reason to skip the deliverable the
   skill exists to produce.

## Output discipline

- **Subscription view is the headline.** A fund manager reading this will look at the verdict box first, then read justification.
- **Quote verbatim** for: auditor qualifications, risk factors, RPT line items, promoter legal proceedings.
- **Page-cite everything** — DRHPs are 500-1000 pages, finding the exact source matters.
- **Flag the OFS-heavy issues prominently.** If >50% of issue size is OFS (promoters cashing out), highlight on page 1.
- **Do not skip generic risk factors entirely** — pull the SPECIFIC ones (those mentioning a named customer, a specific lawsuit, a real geographic concentration). Generic boilerplate gets a single line.

## The verdict vocabulary — always post-listing action guidance

Every DRHP/Prospectus this skill is asked to analyse arrives after the company is already listed
and trading (this is how the user works). The verdict is therefore never framed as a subscription
decision ("should I apply for this IPO") — it is framed as an entry/hold/exit call at the current
market price, exactly like `investment-thesis-engine`'s signal vocabulary, so the two stay
consistent for a company that later gets a full thesis. Do not use "WATCH-POST-LISTING" or any
other pre-listing-uncertainty phrasing — the listing has already happened.

| View           | When to use                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BUY**        | All 10 sections clean; valuation at/below fair value vs disclosed peers or pre-listing NAV; no RED red flags — a straightforward entry at CMP                                                                   |
| **ACCUMULATE** | Strong fundamentals with 1-2 monitorable (non-fraud) YELLOW flags and/or a real but not extreme valuation discount to peers — worth building a position, ideally on dips, while tracking the flagged items      |
| **HOLD**       | Fundamentals intact but the stock has already re-rated to fair value or beyond, or unresolved red flags create meaningful uncertainty — don't chase, don't need to exit an existing position                    |
| **REDUCE**     | Red flags are emerging/worsening or valuation is materially stretched relative to fundamentals — trim exposure                                                                                                  |
| **AVOID**      | Any RED red flag on fraud/governance grounds; OR valuation extreme with no offsetting quality; OR pending material litigation against the company itself (not just promoters in an unrelated personal capacity) |

Always cross-check the verdict against the **lock-in / release schedule** (§11): a stock that looks
cheap now but has a large promoter or pre-IPO-investor lock-in expiry within the next 2-3 quarters
carries real supply-overhang risk that the verdict rationale must name explicitly.

## Pitfalls to avoid

- **Trusting the "About Us" section.** It's marketing. Anchor on financial restated statements and risk factors.
- **Skipping the litigation section.** Often boring but the most actionable — pending criminal proceedings against promoters are not common but show up in DRHPs.
- **Over-weighting the auditor.** A clean opinion in a DRHP is the minimum bar; the auditor doesn't catch governance issues.
- **Ignoring the industry consultant report.** The "Industry" section in DRHPs is often paid for by the issuer (CRISIL, Frost & Sullivan reports). Treat with skepticism — verify market share / TAM claims independently.
- **Anchoring on the price band.** The price band reflects what the issuer wants to receive, not what the company is worth.
- **Mistaking strategy prose for guidance.** "Business Strategies" sections read like forward guidance but are aspirational — never quote them as if they were numeric management commitments.
- **Skipping the anchor investor list because it's not in the DRHP text.** It requires a follow-up web search; do it in the same pass rather than waiting for the user to ask.
- **Confusing "no order book conversion risk disclosure" with "no risk."** If the company doesn't caveat its order book, that's still worth noting as a gap, not a clean bill of health.
- **Reaching for `WebSearch` for same-day bulk/block deal data.** It's frequently not indexed yet. Go straight to `nse.getLargeDeals()` / `bse.getBulkBlockDeals()` (see §18) — same source `dealsDigest.js` uses.

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
