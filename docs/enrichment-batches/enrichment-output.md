# Conversation Enrichment — cumulative output

Stored in DB (data/prompts.json, notes.json, reports.json) → Drive. Rendered 2026-07-16.

**Totals:** 12 prompts, 9 notes, 2 reports. Conversations enriched: see data/\_meta/conversation-enrichment.json.

## Prompt library (12)

| title                                                                            | intent                      | linkedSkill              | source                |
| -------------------------------------------------------------------------------- | --------------------------- | ------------------------ | --------------------- |
| Map listed beneficiaries of a policy/theme by revenue & margin exposure          | sector-beneficiary-mapping  | sector-research-deepdive | `conv_cloud_0fd9e7e6` |
| Analyze a pasted/linked concall transcript                                       | concall-analysis            | concall-analysis         | `conv_cloud_d24b55ba` |
| Track institutional buying + growth-trigger timeline for a stock                 | institutional-flow-tracking | growth-triggers-1pager   | `conv_cloud_0102a92e` |
| Preferential issue mechanics vs QIP (SEBI) — investor Q&A                        | concept-learning            | (none)                   | `conv_cloud_d24b55ba` |
| DRHP / IPO analysis from company IR + SEBI                                       | ipo-analysis                | drhp-ipo-analysis        | `conv_cloud_21317037` |
| Growth-Triggers 1-pager (institutional analyst persona)                          | growth-triggers             | growth-triggers-1pager   | `conv_cloud_01b3b933` |
| Forensic accounting / earnings-manipulation review                               | forensic-review             | forensic-accounting      | `conv_cloud_01b3b933` |
| Equity deep-dive + forward EPS/PE model to FY30                                  | deepdive-forward-model      | equity-research-deepdive | `conv_cloud_1b2c6a74` |
| Compare consecutive PPTs/concalls for guidance drift + walk-the-talk             | filings-diff                | consecutive-filings-diff | `conv_cloud_127470be` |
| Capital-markets concepts: divestment funding, circuit filters, lot size, lock-in | concept-learning            | (none)                   | `conv_cloud_1b2c6a74` |
| Generate institutional stock report from a Stockscans URL                        | company-report              | stock-report             | `conv_cloud_48224d82` |
| Forward P/E thesis with FY27E/FY28E from concalls                                | valuation-thesis            | financial-model          | `conv_cloud_5dd8b2c1` |

## Notes (9)

- **NSE:DEEDEV** (2026-06-01): Development Engineers (DEEDEV) preferential issue: Rs 502/share (FV 10 + premium 492); 59,76,096 shares ≈ Rs 300 Cr. Promoter Krishan Lalit Bansal 3,98,008 sh (~Rs 20 Cr, 18-month … `conv_cloud_d24b55ba`
- **NSE:BAJAJCON** (2026-06-01): Bajaj Consumer Care (BAJAJCON) — from Q3/Q4 FY26 PPT+concall diff: Q3 FY26 consolidated topline Rs 306.1 Cr (+32.7% YoY); Q4 FY26 Rs 326.5 Cr (+32.3% YoY), gross margin 63.6%, EBIT… `conv_cloud_127470be`
- **NSE:AXISCADES** (2026-06-01): AXISCADES Technologies (AXISCADES) — deep-dive + management-credibility chat: management guided ~Rs 960 Cr PAT for FY30; built forward EPS & PE model to FY30; discussed business di… `conv_cloud_1b2c6a74`
- **BSE:544773** (2026-06-01): Merritronix (BSE:544773, referred to as MRTX) — DRHP/IPO analysis chat (recently listed SME/IPO). Trading mechanics noted: 5% price circuit and a minimum lot of 1000 shares; user a… `conv_cloud_21317037`
- **NSE:WAAREERTL** (2026-06-01): Waaree Renewable Technologies (WAAREERTL) — solar renewable EPC. Chat produced a Growth-Triggers 1-pager and a forensic-accounting review from concalls/IPs/annual report. Note: sev… `conv_cloud_01b3b933`
- **NSE:SANSERA** (2026-06-01): Sansera Engineering (SANSERA) — auto/aerospace precision components. Chat generated a full stock-report and a concall-analysis from the provided transcript.… `conv_cloud_dd3ad5e4`
- **NSE:STLTECH** (2026-05-24): Sterlite Technologies (STLTECH) — forward-PE thesis chat (2026-05-24), figures read from last 5 concalls/IPs. FY26 actuals: revenue INR 4,745 cr; EBITDA INR 628 cr (~+39%); returne… `conv_cloud_5dd8b2c1`
- **NSE:SRM** (2026-05-24): SRM Contractors (NSE:SRM) — engineering & construction firm focused on infrastructure (roads, bridges, tunnels) in Jammu & Kashmir and Ladakh; IPO in 2024. Subject of a full stock-… `conv_cloud_48224d82`
- **NSE:LENSKART** (2025-11-10): Lenskart Solutions listed on 10-Nov-2025 (NSE:LENSKART, BSE:544600) — a recently-IPO’d company, not a long-standing listed stock; any "institutional deal history" starts at IPO. Fl… `conv_cloud_0102a92e`

## Reports (2)

- **sector-note** (2026-06-12): India ethanol-blending beneficiaries by segment (sector-research chat, 2026-06-12). E20 ~20% penetration by late-Jan-2026 (ahead of 2025-26 target); E27/E30 tar… `undefined`
- **framework** (2026-06-01): Preferential issue vs QIP under SEBI ICDR Chapter V (from DEEDEV Q&A). Pref issue: open to any named allottee incl. promoters/MFs/AIFs/FPIs/HNIs; allottees name… `undefined`
