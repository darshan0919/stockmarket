# Equity Research Deep Dive — 19-Section Template

Analytical framework. Adapt depth to data; skip only when genuinely unavailable.

## Dashboard mapping (for master skill routing)

| §      | Section                                | Dashboard tab                      |
| ------ | -------------------------------------- | ---------------------------------- |
| 1      | Business Deep Dive                     | 1 Overview, 2 Business             |
| 2      | Industry & Competitive                 | 3 Industry                         |
| 3      | Peer Comparison                        | 3 Industry, 4 Financials           |
| 4      | Product & Revenue Concentration        | 2 Business                         |
| 5      | Pipeline & Future Growth               | 5 Growth                           |
| 6      | Business Performance                   | 4 Financials                       |
| 7      | Analyst Q&A                            | 11 Concall                         |
| 8      | Management Commentary                  | 11 Concall, 0 Exec Summary         |
| **9**  | **Management & Promoter Track Record** | _no tab — memo only_               |
| 10     | Capital Allocation                     | 12 Cap. Alloc.                     |
| 11     | Financial Quality & Red Flags          | 7 Forensics                        |
| 12     | Shareholding Pattern                   | 13 Ownership                       |
| 13     | Guidance & Outlook                     | 4 Financials, 5 Growth, 11 Concall |
| **14** | **Variant Perception**                 | _no tab — memo only_               |
| 15     | Scenario Building                      | 6 Estimates, 8 Valuation           |
| 16     | Valuation Analysis                     | 8 Valuation                        |
| 17     | Investment Verdict                     | 0, 9 Thesis                        |
| 18     | Key Quotes                             | 11 Concall                         |
| **19** | **Technical Analysis**                 | _no tab — memo only_               |

Master skill: run §1–18 (minus 9, 14) feeding tabs; include 9, 14, 19 only in the standalone PDF.

## Research searches (Phase 1)

Adapt company name and sector:

1. `<Company> business overview products segments`
2. `<Company> latest quarterly results revenue profit FY26`
3. `<Company> annual report FY25 FY26 revenue EBITDA PAT`
4. `<Company> management team promoter background`
5. `<Company> competitors peer comparison industry`
6. `<Company> capacity expansion capex growth plans`
7. `<Company> concall transcript latest quarter`
8. `<Company> shareholding pattern FII DII mutual fund`
9. `<Company> risks challenges concerns`
10. `<Company> valuation PE EV/EBITDA historical`
11. `<Industry> market size India growth rate TAM`
12. `<Company> stock price technical analysis 52 week`

Also: `site:screener.in <Company>`, Trendlyne, Tickertape, MoneyControl.

---

## §1 Business Deep Dive

Business model in plain English; value-chain position; revenue by segment (table); key products & end-uses; GTM (B2B/B2C, direct/distributor/licensing); critical dependencies (customer/supplier concentration, regulatory approvals).

## §2 Industry & Competitive Positioning

Porter's 5 Forces (brief, specific); industry trends (pricing, demand, regulation, tech); company position (leader/challenger/niche); pricing power vs commoditization; barriers & moat; TAM/SAM/SOM if available.

## §3 Peer Comparison (CRITICAL)

Table with 4–6 closest listed peers across: Market Cap, Revenue, 3Y Rev CAGR, EBITDA Mgn, PAT Mgn, ROE, ROCE, D/E, plus the **sector-appropriate valuation column(s)** — look up the company's sector in `_shared/sector-valuation-kpis.md` first (e.g. P/B + ROE/ROA for a bank, EV/ton for cement, Market Cap/Pre-sales or EV/Imputed-EBITDA for real estate — not P/E, which is structurally misleading for a real-estate developer). Report P/E and EV/EBITDA as secondary/context columns only when the sector table doesn't call for them as primary. Then: where better/worse; premium/discount justified?

For a conglomerate or holding company, don't force a single blended multiple onto the peer table — see the "How to classify a company" section at the top of `_shared/sector-valuation-kpis.md` (SOTP for conglomerates, NAV+discount for holdcos).

## §4 Product & Revenue Concentration

Top 5–10 products by revenue; top-3 product concentration (%); per-product risks (patent, regulatory, customer); highest vs lowest margin SKUs; lifecycle stage; partnerships/licensing.

## §5 Pipeline & Future Growth

R&D / NPD pipeline by stage (early → filed → approved → launched); launch timelines + addressable market; R&D % of revenue vs peers; first-to-market opportunities.

## §6 Business Performance

Key KPIs; performance by segment/geo/product; structural vs cyclical growth; margin bridge (gross, EBITDA, PAT); working-capital cycle (debtor/inventory/payable days, CCC). Tables: KPIs, margin trend, WC.

## §7 Analyst Q&A Goldmine

Most important questions from recent concalls; repeated analyst concerns; how mgmt handles pressure; questions dodged or answered vaguely; most bullish/bearish analyst views.

## §8 Management Commentary (MOST IMPORTANT)

Tone (optimism/caution/defensiveness); what mgmt is NOT saying; hedging/vague/overconfident language; forward-looking statement credibility; **would you give them capital?** Justify.

## §9 Management & Promoter Track Record (CRITICAL)

Backgrounds, education, tenure; past successes/failures/controversies; comp vs company size; recent departures/additions; professional vs promoter-run; **3Y promoter holding trend**; pledging % and trend; related-party transactions (nature, quantum, arms-length); SEBI / legal actions.

## §10 Capital Allocation & Strategy

Capex plans (scale, timing, returns); IRR / asset turns / payback; M&A history and track record; capital discipline vs empire-building; dividend and buyback history; historical capital-allocation returns.

## §11 Financial Quality & Red Flags (BRUTAL)

Number–commentary inconsistencies; aggressive accounting (rev recognition, capitalization, provisions); WC stress / debt issues / cash-flow mismatch; one-off adjustments; **CFO vs PAT bridge (table required)**; contingent liabilities & off-BS items; auditor qualifications; unusual RPT; tax-rate gap. Output: red-flag checklist + CFO-vs-PAT table.

## §12 Shareholding Pattern

Current split (Promoter/FII/DII/MF/Retail — table); 4-quarter change (table); prominent institutional holders; recent bulk/block deals; pledging status and trend.

## §13 Guidance & Outlook

Explicit guidance from mgmt; implicit guidance (between the lines); assumptions; risks to guidance (internal + external); conservative vs aggressive; what must go right/wrong.

## §14 Variant Perception (EDGE)

What the market is likely misunderstanding; upside not fully priced; downside the market ignores; consensus vs reality; what would change the narrative. Without this, the report adds no value over a terminal.

## §15 Scenario Building

Three scenarios with EXPLICIT assumptions — Bull / Base / Bear. Each: growth rate, margin, catalyst assumptions; Revenue / EBITDA / PAT projections (table); exit multiple; target price; what triggers this scenario.

## §16 Valuation Analysis

**Look up the company's sector in `_shared/sector-valuation-kpis.md` first** and lead with the sector-appropriate primary metric(s) — not a fixed P/E/EV-EBITDA/P-B/P-S set for every company. Examples: banks lead on P/B + ROE/ROA/credit-cost; real estate on Market Cap/Pre-sales and EV/Imputed-EBITDA (P&L-based multiples are structurally misleading here — see the file for why); cement on EV/ton (never P/E); hospitals on EV/EBITDA + ARPOB/occupancy, with SOTP by segment for multi-format chains; platforms on volume/churn ahead of trailing PAT; pharma split by CDMO-vs-generic hierarchy; agrochemicals checked for regulated-vs-spot-market export mix, not just P/E level.

Report the fixed P/E/EV-EBITDA/P/B/P/S set as secondary/context columns when the sector table calls for a different primary metric, rather than dropping them — they're still useful cross-checks, just not the lead.

Before trusting any point-in-time multiple, run the file's "over-earning/cycle check" (8–10yr margin history — is the current margin near a multi-year high or low?) and, for growth/high-multiple names, the "rate sensitivity" note (terminal value is disproportionately rate-sensitive).

Then: 5Y historical range of the sector-appropriate metric (high/low/median — table); peer comp (ref §3); DCF if data permits (state assumptions — note `_shared/sector-valuation-kpis.md` also carries Samit Vartak's stated view that duration-of-growth and the investor's own required-return are more sensitive valuation levers than the DCF's precision suggests, worth a sanity-check line); what's priced in at CMP; margin of safety.

Apply the general cross-sector diagnostics from the same file where relevant: strip one-off P&L items before computing any multiple; check for a mid-capex operating-leverage distortion (rebuild forward P/E off guided capacity ramp rather than trailing earnings); check public float before trusting an apparently stable multiple; and don't mistake a cheap headline multiple for a value opportunity without a specific catalyst ("value remains value indefinitely until a genuine catalyst appears").

## §17 Investment Verdict

Clear view: **BUY / HOLD / AVOID**; time horizon; key triggers to track next 2–4 quarters; what would change the thesis (bull + bear); position sizing (high conviction vs tracking); specific target price with methodology.

## §18 Key Quotes

Important analyst questions; key mgmt quotes supporting conclusions; both bullish and cautionary quotes; use as evidence for the thesis.

## §19 Technical Analysis

Primary (weekly) & secondary (daily) trend; 3+ support and 3+ resistance levels with rationale; 50/100/200 DMA vs price (golden/death cross?); RSI reading and zone; volume confirmation / divergences; chart patterns forming; **technical verdict + risk-reward**.
