# Quarterly macro context — dated event log & sector read-through (shared)

**Shared reference** (moved here 2026-10-14 from `pre-pead-scanner/references/quarterly_macro_context.md`,
which is now a pointer). Read by `pre-pead-scanner` (Step 3d) and `growth-predictor` (macro overlay).
One `## Q_FY__` section per fiscal quarter, newest at the TOP once more than one exists; each event carries
inline source links. Companion files: `commodity-basket.json` (industry → live TradingView instruments for
the numeric QoQ move) and `../sector-playbooks/` (how a sector's economics work).

**Maintenance rule (both consumers):** the first run that needs a quarter not yet logged here researches
it with WebSearch (oil/FX/rates/monsoon/tariffs/policy/sector-specific shocks; cite every claim) and adds the
section — never answer from memory for a live quarter. Mark a section "partial (as of <date>)" when the
quarter is still running, and refresh it on the next run after the quarter closes.

### How to use this file

For every company, check the row for its primary sector(s) in the sector tables and record a **Macro
overlay** line: which events are a tailwind, headwind or non-factor, and — critically — whether
management's own guidance already accounts for it (a rural NBFC guiding growth without mentioning monsoon
risk is a flag; an exporter citing a rupee tailwind management has already banked is corroboration, not
new information). Never let a macro tailwind substitute for company-specific evidence (order book,
capacity, utilisation) — macro sets the backdrop and sanity-checks the guidance; it does not replace the
bottom-up case. Quantify only through an explicit channel (input cost → margin bps with a stated
pass-through lag; rate → interest/NIM; FX → translated revenue), never as a free-floating "macro haircut".

## Q2FY27 — detailed event log & sector read-through

_(Jul–Sep 2026; **partial as of 2026-10-14** — September SIAM data not yet released. Compiled by growth-predictor's first run for this quarter from public sources cited inline. Directional overlay, not a substitute for company evidence.)_

### Event 1 — Oil re-shock: Hormuz shipping attacks push Brent back above $100

Brent settled at **$107.63 (+6.3%) on 10 Sep 2026** after Iran said it attacked 10 ships near the Strait of Hormuz following US strikes on Iranian tankers; WTI closed at $102.48 ([Nation Thailand](https://www.nationthailand.com/news/40070894)). It touched **$110** on 11 Sep on Red Sea / Hormuz disruption ([Free Press Journal](https://www.freepressjournal.in/business/brent-crude-jumps-to-110-amid-depleting-strategic-oil-reserves)) and was still **above $101–102 in early October** ([PSU Connect](https://www.psuconnect.in/news/rupee-falls-after-rbi-rate-hike-further-losses-likely-as-oil-climbs-above-102)). TradingView 14 Oct: Brent 105.8, **+24% over 3 months**, spot 9% above its 50-day average.

**Read-through:** Suresh's rule — oil above ~$100 for weeks is a sustained margin headwind that slides 1–2 quarters (kb:1821fc75, kb:4b0ec780). Q2 absorbs part of it; Q3FY27 carries more, because pass-through clauses lag a quarter.

### Event 2 — Rupee near record low; RBI hikes 25 bp after the quarter

The rupee closed near **₹96.78/USD on 7 Oct 2026**, weakest since mid-May and a few paise from the ~₹96.96 low ([PSU Connect](https://www.psuconnect.in/news/rupee-falls-after-rbi-rate-hike-further-losses-likely-as-oil-climbs-above-102)). The October MPC **raised the repo rate 25 bp to 5.50%** (first hike since Feb 2023), shifted the stance to "calibrated tightening", raised FY27 GDP to 7.1% and CPI to 5.2%, citing crude ([TaxCorp](https://thetaxcorp.in/article/rbi-mpc-october-2026-repo-rate-raised-to-550-stance-shifts-to-calibrated)). India 10Y ~7.40% (+9.5% over 3M, TradingView).

**Read-through:** a funding-cost headwind for wholesale-funded NBFCs from Q3; a translation tailwind for USD billers; costlier imports for importers.

### Event 3 — Auto volumes strong on a low base

Domestic **PV +34.3% in July 2026 (4,57,810 units)** and **+36.5% in August (4,39,309)**. **Two-wheelers +22.6% in July (19,23,483)** and **+10.5% in August (20,34,698)** ([Autocar Pro](https://www.autocarpro.in/news/india-auto-sales-rise-in-july-2026-as-pvs-2ws-3ws-grow-134076), [DD India](https://ddindia.co.in/2026/09/passenger-vehicle-sales-rise-36-5-in-august-two-wheelers-up-10-5-siam/)). The base is soft: Q2FY26 PV fell 1.5% YoY ahead of the Sep-2025 GST cut ([SIAM](https://www.siam.in/pressrelease-details.aspx?mpgid=48&pgidtrail=50&pid=591)).

| Sector                                        | Impact                            | Why                                                                                                                                                       |
| --------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto OEMs & ancillaries                       | Revenue tailwind; margin headwind | Volume strength on a low base; crude-linked polymers/rubber and metals up (copper +7%, HRC +11%, rubber +18% over 3M) with a 1–2 quarter pass-through lag |
| Paints, chemicals, plastics, packaging, tyres | Negative                          | Crude-linked RM up sharply in Sep; pricing catches up a quarter later                                                                                     |
| OMCs, aviation, logistics                     | Negative                          | Fuel cost                                                                                                                                                 |
| IT / ER&D, export pharma, textile exporters   | Positive                          | INR near record low                                                                                                                                       |
| NBFCs (wholesale-funded)                      | Negative from Q3                  | Repo hike + 10Y up                                                                                                                                        |
| Upstream oil                                  | Positive                          | Realisation                                                                                                                                               |

## Q1FY27 — detailed event log & sector read-through

_(Apr–Jun 2026. Compiled 2026-07-09 from public news sources — see citations at end of each event. Treat as directional macro overlay, not a substitute for company-specific evidence from the concall/PPT.)_

### Event 1 — Iran war / Strait of Hormuz closure → oil price shock and unwind

The US-Israel-Iran war (started 28 Feb 2026) led to the Strait of Hormuz being closed on 4 Mar 2026, cutting an estimated ~14 million bpd of global oil supply and sending Brent above $120/bbl at the peak. The Indian crude basket averaged **~$110/bbl through April–May 2026**. By late June/early July the conflict de-escalated (Iran agreeing to reopen the Strait in exchange for the US lifting its port blockade) and Brent fell back to **~$70–71/bbl by early July 2026** — essentially pre-war levels. [Al Jazeera](https://www.aljazeera.com/economy/2026/7/2/oil-prices-fall-to-levels-not-seen-since-start-of-us-israel-war-on-iran), [CNBC](https://www.cnbc.com/2026/04/21/oil-price-iran-war-middle-east.html), [World Bank](https://www.worldbank.org/en/news/press-release/2026/04/28/commodity-markets-outlook-april-2026-press-release)

**Read-through:** Most of Q1FY27 (Apr–May) was lived at elevated crude ($100–120/bbl); the relief only arrived in the last few weeks of the quarter (June) and into Q2. So Q1 results should show the cost pressure in the P&L even though spot crude has normalised by the time results are being read/discussed on the July calls — **don't extrapolate the June-end spot price into FY27 guidance without checking whether management is doing the same.**

| Sector                                                        | Impact                     | Why                                                                                                                                                          |
| ------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Oil marketing companies (OMCs), aviation, logistics/transport | Negative                   | Direct fuel/ATF cost pass-through lag; marketing margins compressed through Apr–May                                                                          |
| Paints, tyres, chemicals, fertilizers, plastics/packaging     | Negative                   | Crude-linked raw material (VAM, TiO2, natural rubber substitutes, ammonia feedstock) cost inflation through the quarter, margin lag until pricing catches up |
| Upstream E&P (ONGC, Oil India)                                | Positive                   | Higher realisations on crude sold, though partly offset by windfall-tax risk in a genuine supply-shock scenario                                              |
| NBFCs/auto financiers with rural/semi-urban vehicle books     | Mildly negative (indirect) | Higher fuel cost pressures rural household budgets and used/new-vehicle affordability                                                                        |
| Broking/capital markets (Angel One and peers)                 | Mixed-to-positive          | War-driven volatility spikes F&O and cash-market volumes/turnover in the affected weeks — a volatility tailwind to trading revenue even as macro is worse    |

### Event 2 — Rupee depreciation to a record low, partial recovery

The rupee hit a record low near **₹96.6/USD on 19 May 2026**, driven by the oil import bill (India imports ~70% of crude in USD) widening the trade deficit, sustained FII equity/debt outflows, and a structurally strong dollar. It partially recovered to **~₹94–95/USD by late June 2026** as the oil shock unwound. Full FY-to-date depreciation versus a year earlier is running above 10%. [Anand Rathi](https://anandrathi.com/blog/why-is-inr-falling-in-2026), [Cambridge Currencies](https://cambridgecurrencies.com/usd-inr-forecast-2026/), [Nirji Ventures](https://nirji.com/insights/inr-usd-depreciation-2026-data-driven-analysis)

**Read-through:** A tailwind for USD/EUR-revenue exporters on translation (IT/ER&D services, export-oriented pharma, auto-component and engineering exporters, textiles/gems & jewellery), and a headwind for importers and USD-debt-heavy borrowers.

| Sector                                                                        | Impact   | Why                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IT services / ER&D (e.g., Tata Technologies)                                  | Positive | Revenue largely USD/EUR-denominated; a weaker rupee lifts INR-reported revenue and margin on translation, even with flat constant-currency growth                                                        |
| Pharma exporters, auto-component exporters, textiles                          | Positive | Same translation tailwind, though largely offset if input/API costs are import-linked                                                                                                                    |
| Companies with material USD-denominated debt or ECBs                          | Negative | Higher INR cost of servicing/refinancing foreign debt — RBI extended concessional forex swap windows and full ECB hedging-cost coverage for PSUs/AD banks until 30 Sep 2026 specifically to cushion this |
| Electronics/component importers, oil marketing, aviation (fuel is USD-linked) | Negative | Costlier imports in INR terms, compounding the crude spike above                                                                                                                                         |

### Event 3 — RBI MPC (5 June 2026): repo hold, growth cut, inflation raised

The RBI kept the repo rate unchanged at **5.25%**, retaining a **'Neutral' stance**. It cut the FY27 GDP growth forecast to **6.6% from 6.9%** (April estimate) and raised the inflation forecast to **5.1% from 4.6%**, with quarterly CPI estimates of 4.2% (Q1), 5.1% (Q2), 5.9% (Q3), 5.4% (Q4) — i.e., inflation is expected to worsen through the year, not improve. [Forbes India](https://www.forbesindia.com/article/forbesindiablogs/rbi-mpc-june-2026-live-repo-rate-decision-governor-sanjay-malhotra-gdp-data-updates-liveblog/2994645/1), [Bajaj Broking](https://www.bajajbroking.in/share-market-news/rbi-holds-repo-rate-at-5-25percentage-cuts-fy27-gdp-to-6-6percentage-raises-cpi-to-5-1percentage)

**Read-through:** No near-term rate-cut relief for borrowers — a name whose FY27 guidance leans on falling funding costs now has a data point working against it. A downward GDP revision is also a systemic, not company-specific, headwind to factor into "is the guide credible" reads for growth-sensitive names.

| Sector                                                                            | Impact                                | Why                                                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| NBFCs/banks with wholesale/market-linked borrowing (e.g., M&M Finance, D/E ~4.8x) | Negative                              | No repo relief means funding costs stay elevated for longer than a rate-cut scenario would imply            |
| Banks with sticky low-cost CASA funding                                           | Neutral-to-positive relative to NBFCs | Less dependent on repo-linked wholesale funding, so a hold is less painful than for leveraged NBFCs         |
| Rate-sensitive consumer durables/housing/auto (via financing cost)                | Negative                              | Higher-for-longer EMIs dampen big-ticket discretionary demand                                               |
| GDP-growth-linked cyclicals (industrials, capex-heavy names)                      | Negative (directional)                | A downward GDP revision is a systemic demand-growth headwind, independent of any single company's execution |

### Event 4 — Sub-normal monsoon forecast / El Niño risk

Weather forecasters flagged a **sub-normal Southwest Monsoon with emergent El Niño conditions** for the 2026 season, raising structural risk to agricultural output and rural demand — cited explicitly by the RBI as a factor behind its more cautious growth/inflation outlook. [Drishti IAS](https://www.drishtiias.com/daily-updates/daily-news-analysis/rbi-holds-repo-rate-and-lowers-gdp-growth-forecast)

**Read-through:** A live risk to any FY27 guidance that assumes rural demand recovery — should be an explicit checklist item when a company's management cites "rural recovery" or "monsoon-led demand" as a growth driver without acknowledging the El Niño risk.

| Sector                                                                 | Impact   | Why                                                                                        |
| ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------ |
| Rural-focused NBFCs / tractor & 2W financiers (e.g., M&M Finance)      | Negative | Weak monsoon directly pressures rural household income and vehicle/asset-purchase capacity |
| Agri-inputs, crop protection, fertilizers                              | Negative | Lower sowing/yield expectations hit input demand                                           |
| Rural-skewed FMCG, 2-wheelers                                          | Negative | Rural volume growth is the swing factor for these categories                               |
| Companies calling out "rural recovery" in FY27 guidance without caveat | Flag     | Cross-check the guidance against this risk explicitly in the capability-validation step    |

### Event 5 — US tariffs: base rate cut 18% → 10%, but legally unsettled; sectoral tariffs unchanged

Effective 24 Feb 2026 the blanket US "reciprocal"/Section 122 tariff on Indian goods stepped down to **10% from 18%**, and importers who paid the higher 18% rate between Apr 2025–Feb 2026 may be **eligible for refunds**. However, a US Court of International Trade ruling in May 2026 found the tariff unlawful; a Federal Circuit stay is keeping it in force pending appeal, and absent further action it is **set to expire around 24 Jul 2026** — i.e., the position is legally live and could move again just after this quarter's results season. Sectoral Section 232 tariffs are **unchanged**: 50% on steel/aluminium/copper, 25% on certain auto components, 100% on patented pharma. [Business Standard](https://www.business-standard.com/economy/news/chronology-of-us-tariffs-and-penalties-on-indian-goods-since-april-2025-126050800718_1.html), [Deccan Herald](https://www.deccanherald.com/india/from-26-to-50-how-us-tariffs-on-indian-goods-evolved-from-april-2025-to-may-2026-explained-3995562), [Dimerco](https://dimerco.com/us-tariff-update-2026/)

**Read-through:** Net directional positive for general goods exporters to the US versus the 18% regime they operated under for most of FY26, plus a potential one-time refund tailwind for names that overpaid — but this is not resolved law, so treat any FY27 guidance that assumes the 10% rate (or refunds) as booked/permanent with caution; it could reverse by late July 2026. Metals and auto-component exporters to the US get **no relief** — they remain under the higher sectoral rates.

| Sector                                                                                               | Impact                    | Why                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| General goods exporters to the US (textiles, gems & jewellery, engineering goods, consumer products) | Positive, but provisional | Base tariff down to 10% from 18%; refund eligibility for FY26 overpayments is a potential one-time cash tailwind                                           |
| Steel/aluminium/copper exporters to the US (e.g., Shyam Metalics' export ambitions)                  | Negative — unchanged      | Section 232 50% tariff untouched by this de-escalation                                                                                                     |
| Auto-component exporters to the US                                                                   | Negative — unchanged      | Section 232 25% tariff untouched                                                                                                                           |
| Patented pharma exporters to the US                                                                  | Negative — unchanged      | Section 232 100% tariff untouched                                                                                                                          |
| IT/ER&D services (largely services, not goods)                                                       | Neutral                   | Goods tariffs don't directly apply, though clients' (e.g., US auto OEMs) own tariff cost pressure can indirectly affect discretionary IT/engineering spend |
