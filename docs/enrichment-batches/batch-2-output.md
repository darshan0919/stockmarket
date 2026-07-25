# Conversation Enrichment — Batch 2 output

Stored in DB collections (data/prompts.json, data/notes.json, data/reports.json) and pushed to Drive (StockMarket/data/v2). Rendered 2026-07-16.

## Prompt library (6)

### Map listed beneficiaries of a policy/theme by revenue & margin exposure

- **id:** `prompt_conversation-capture_sector-research-deepdive_2026-06-12_d92a7643`
- **intent:** sector-beneficiary-mapping | **linkedSkill:** sector-research-deepdive | **status:** approved
- **prompt:** /sector-research-deepdive — If India moves toward higher <policy/theme>, which listed/unlisted companies benefit most? Give company names with highest revenue & margins from this newly expanded TAM. Starting points: <segments>.
- **improvedVersion:** /sector-research-deepdive <theme>. Segment the value chain (producers, EPC, OMCs, OEMs, components, enzymes...), name listed players per segment, rank by % revenue & margin exposure to the incremental TAM, and separate confirmed policy from proposed.
- **tags:** sector, thematic, tam, beneficiaries | **source:** `conv_cloud_0fd9e7e6`

### Analyze a pasted/linked concall transcript

- **id:** `prompt_conversation-capture_concall-analysis_2026-06-01_a87db38a`
- **intent:** concall-analysis | **linkedSkill:** concall-analysis | **status:** approved
- **prompt:** /concall-analysis <stockscans URL or pasted transcript>
- **improvedVersion:** /concall-analysis <url>. Extract order book, capacity, revenue & margin guidance with per-call citations; flag management tone shifts vs prior calls.
- **tags:** concall, earnings, analysis | **source:** `conv_cloud_d24b55ba`

### Track institutional buying + growth-trigger timeline for a stock

- **id:** `prompt_conversation-capture_growth-triggers-1pager_2026-06-01_7323bc58`
- **intent:** institutional-flow-tracking | **linkedSkill:** growth-triggers-1pager | **status:** approved
- **prompt:** <company URL> Over the last 6 months track all major deals and institution buyouts of this company. Why are mutual funds buying it so much? Show a timeline of events (from corporate announcements) that are the growth triggers for institutional interest at such high valuation.
- **improvedVersion:** For <company>: build a dated timeline of institutional deals (bulk/block/QIP/pref/MF filings) over the last 6 months, each linked to the corporate announcement that triggered it; conclude with the thesis MFs appear to be underwriting and the valuation they are paying.
- **tags:** institutional, deals, growth-triggers, timeline | **source:** `conv_cloud_0102a92e`

### Preferential issue mechanics vs QIP (SEBI) — investor Q&A

- **id:** `prompt_conversation-capture_general_2026-06-01_5d1a8aab`
- **intent:** concept-learning | **linkedSkill:** (none) | **status:** approved
- **prompt:** What are the core differences between a preferential issue and a QIP? Price & size? Who can participate / who are the allottees? Lock-in period? How can I apply to preferential issues in future?
- **improvedVersion:** Explain preferential issue vs QIP under SEBI ICDR: eligible investors, pricing floor, allottee-naming, voting abstention, max allottees, and promoter vs non-promoter lock-in — with a live example.
- **tags:** sebi, preferential-issue, qip, capital-markets, concept | **source:** `conv_cloud_d24b55ba`

### Generate institutional stock report from a Stockscans URL

- **id:** `prompt_conversation-capture_stock-report_2026-05-24_e1618061`
- **intent:** company-report | **linkedSkill:** stock-report | **status:** approved
- **prompt:** /stock-report <stockscans company URL>
- **improvedVersion:** /stock-report <url>. Then: "Finish the report" and "here is the latest quarterly result <url> — include it." Ask for institutional-grade output with a clear rating, forward estimates, and a risks section.
- **tags:** stock-report, equity, pdf | **source:** `conv_cloud_48224d82`

### Forward P/E thesis with FY27E/FY28E from concalls

- **id:** `prompt_conversation-capture_financial-model_2026-05-24_e1a98d7b`
- **intent:** valuation-thesis | **linkedSkill:** financial-model | **status:** approved
- **prompt:** Create an institutional-grade honest forward PE thesis for <company>. Fetch & study last 5 concalls + investor presentations. Extract order-book, capacity, revenue & margin guidance. Extrapolate & calculate FY27E, FY28E based on these inputs.
- **improvedVersion:** For <company>: build a forward P/E thesis. Pull last 5 concalls + decks; extract order book, capacity, revenue & margin guidance with per-call citations; project FY27E/FY28E, state each assumption explicitly, and list what would break the thesis.
- **tags:** thesis, valuation, concall, forward-estimates | **source:** `conv_cloud_5dd8b2c1`

## Notes (4)

- **NSE:DEEDEV** (chat-insight, 2026-06-01, `note_conversation-capture_NSE:DEEDEV_2026-06-01_b8d187c3`): Development Engineers (DEEDEV) preferential issue: Rs 502/share (FV 10 + premium 492); 59,76,096 shares ≈ Rs 300 Cr. Promoter Krishan Lalit Bansal 3,98,008 sh (~Rs 20 Cr, 18-month lock-in); 23 non-promoter institutional allottees 55,78,088 sh (~Rs 280 Cr, 12-month lock-in). Named allottees incl. Kotak MF, WhiteOak Capital, ValueQuest India GIFT, 360 ONE PIPE, Finavenue, Ashoka WhiteOak ICAV. 24 allottees total (within SEBI 49 cap).
  - source: `conv_cloud_d24b55ba`

- **NSE:STLTECH** (chat-insight, 2026-05-24, `note_conversation-capture_NSE:STLTECH_2026-05-24_640ef3f3`): Sterlite Technologies (STLTECH) — forward-PE thesis chat (2026-05-24), figures read from last 5 concalls/IPs. FY26 actuals: revenue INR 4,745 cr; EBITDA INR 628 cr (~+39%); returned to profitability. Q4 FY26: revenue INR 1,441 cr (+37% YoY), EBITDA margin 15.1%. Order book: FY26 inflows INR 7,687 cr (>2x YoY); open order book INR 7,309 cr (+67% YoY); Q1 FY27 scheduled execution INR 1,468 cr. Balance sheet: net debt INR 1,128 cr; D/E 0.5x; net debt/EBITDA 1.3x (target <1.2x). Mix: North America 39% of revenue (vs 25% PY); Europe 40%; connectivity attach rate 15% (from 22%); Enterprise & Data Center 19% (copper-price pressure), mgmt targets 30% in FY27. Guidance: 20% EBITDA margin by end-FY27; INR 500 cr capex; 800 patents. User also asked why the stock is falling and how a QIP works. Source chat: conv_cloud_5dd8b2c1.
  - source: `conv_cloud_5dd8b2c1`

- **NSE:SRM** (chat-insight, 2026-05-24, `note_conversation-capture_NSE:SRM_2026-05-24_089c2692`): SRM Contractors (NSE:SRM) — engineering & construction firm focused on infrastructure (roads, bridges, tunnels) in Jammu & Kashmir and Ladakh; IPO in 2024. Subject of a full stock-report generation.
  - source: `conv_cloud_48224d82`

- **NSE:LENSKART** (chat-insight, 2025-11-10, `note_conversation-capture_NSE:LENSKART_2025-11-10_6cd94e75`): Lenskart Solutions listed on 10-Nov-2025 (NSE:LENSKART, BSE:544600) — a recently-IPO’d company, not a long-standing listed stock; any "institutional deal history" starts at IPO. Flagged high valuation with strong MF interest post-listing.
  - source: `conv_cloud_0102a92e`

## Reports (2)

- **sector-note** (2026-06-12, `rpt_conversation-capture_global_2026-06-12_46882e5a`): India ethanol-blending beneficiaries by segment (sector-research chat, 2026-06-12). E20 ~20% penetration by late-Jan-2026 (ahead of 2025-26 target); E27/E30 targeted 2028-2030 per NITI Aayog, not yet mandated; BIS notified higher-blend standards; sector in overcapacity (~1,990 cr L capacity vs ~1,050 cr L demand).
  - source: `undefined` | body: `data/reports/rpt_conversation-capture_global_2026-06-12_46882e5a.json`

- **framework** (2026-06-01, `rpt_conversation-capture_global_2026-06-01_06a61df0`): Preferential issue vs QIP under SEBI ICDR Chapter V (from DEEDEV Q&A). Pref issue: open to any named allottee incl. promoters/MFs/AIFs/FPIs/HNIs; allottees named upfront in EGM notice; interested allottees abstain from voting; max 49 allottees; price >= SEBI floor (higher of 2-week/26-week avg). Lock-in: promoter 18 months, non-promoter 12 months; allotment within 15 days of EGM. QIP: QIBs only, no promoters.
  - source: `undefined` | body: `data/reports/rpt_conversation-capture_global_2026-06-01_06a61df0.json`
