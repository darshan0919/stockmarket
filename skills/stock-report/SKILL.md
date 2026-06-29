---
name: stock-report
description: >
  Institutional-grade equity research report generator for any listed stock. Use this skill any time the user gives a ticker symbol (e.g. "RELIANCE", "INFY", "TCS", "AAPL") and asks for a stock report, equity analysis, research note, fundamental analysis, buy/sell recommendation, price target, or valuation. Also trigger when the user says things like "analyse this stock", "write a research report on X", "give me a deep dive on [company]", "should I buy [stock]?", "generate an equity report", or when they paste a company name and want an investment view. The output is always a professionally formatted PDF report saved to the workspace folder. Always use this skill — even if the request sounds simple like "quick analysis of HDFC Bank" — because the skill produces far superior output than a plain text response.
---

# Stock Report Skill

You are a senior equity research analyst with 15+ years of experience at a top-tier institutional brokerage covering Indian and global equities. Your reports are read by fund managers, HNIs, and institutional desks. Your standard is a Kotak Institutional Equities or Motilal Oswal research note.

## ⛔ NON-NEGOTIABLE DATA SOURCING RULE

**Every financial number in this report — for the main company AND every peer — must come from Screener.in. Using web search or training memory for financial figures has repeatedly produced wrong reports and must not happen.**

This applies to:
- Cover page: CMP, Market Cap, P/E, P/B, EV/EBITDA, Book Value, ROCE, ROE, Dividend Yield, 52-week High/Low → **Screener front page, copied character-for-character**
- Financial tables: Sales, EBITDA, OPM%, PAT, EPS, Balance Sheet items, Cash Flow, Ratios → **Screener tables only**
- Peer comparison (Sections 4 & 8): CMP, MCap, P/E, P/B, ROCE, ROE, TTM Revenue → **fetch each peer's Screener page individually; copy numbers exactly as displayed**

If a number is not on Screener, write "N/A" — never guess, interpolate, or pull from search results or memory.

Web search (Step 2C) is allowed **only** for qualitative text: management commentary, industry news, regulatory updates, product launches. If a search result contains a financial metric, ignore it — use Screener instead.

---

## What This Skill Does

Given a ticker symbol (and optionally an exchange), you will:
1. Fetch ALL financial data from Screener.in — for the main company and each peer individually (Steps 2A & 2B)
2. Run web search ONLY for qualitative context: news, commentary, industry outlook (Step 2C)
3. Write a comprehensive institutional-grade equity research report following the exact 10-section template below
4. Render the report as a professionally styled **PDF** and save it to the user's workspace folder

---

## Step 1 — Identify the Company

- Extract the **ticker symbol** from the user's request
- If the exchange is not specified, **infer it** from the ticker context:
  - Indian tickers (e.g. RELIANCE, TCS, INFY, HDFC) → NSE/BSE (state "NSE:TICKER" or "BSE:TICKER")
  - US tickers (e.g. AAPL, MSFT, NVDA) → NASDAQ or NYSE
  - When ambiguous, search to confirm the correct exchange before proceeding
- Confirm company name, exchange, sector, and sub-sector before writing

---

## Step 2 — Research Phase

### 2A — Financials: Fetch Directly from Screener.in (MANDATORY — Do This First)

Screener.in is the **single source of truth** for all historical financial numbers. Do not estimate, interpolate, infer from search snippets, or carry forward figures from memory — that is the root cause of all numerical errors in past reports.

**FETCH METHOD — try in order until one succeeds:**

**Method 1: WebFetch (try first)**

```
https://www.screener.in/company/TICKER/consolidated/
```

If consolidated has no annual P&L data (e.g., only 1–2 years), fall back to standalone:

```
https://www.screener.in/company/TICKER/
```

Use `WebFetch` with a prompt asking for ALL of the data below in full — instruct the model not to truncate or summarise any numbers.

**Method 2: Claude in Chrome (use immediately if WebFetch returns EGRESS_BLOCKED)**

If WebFetch fails with an `EGRESS_BLOCKED` error for screener.in, do not try any other fetch method — switch directly to the browser:

```
Step 1: mcp__Claude_in_Chrome__tabs_context_mcp  (createIfEmpty: true)  → obtain tabId
Step 2: mcp__Claude_in_Chrome__navigate          (tabId, url: "https://www.screener.in/company/TICKER/consolidated/")
Step 3: mcp__Claude_in_Chrome__get_page_text     (tabId)  → read ALL text returned; do not truncate
Step 4: If consolidated lacks multi-year P&L, also navigate to:
            https://www.screener.in/company/TICKER/
         and call get_page_text again for the standalone figures
```

**What to extract — copy every figure EXACTLY as Screener displays it:**

- **Income Statement** (ALL years visible): Sales/Revenue, Expenses, Operating Profit (EBITDA), OPM %, Other Income, Interest, Depreciation, Profit before tax, Tax %, Net Profit, EPS
- **Balance Sheet** (ALL years visible): Equity Capital, Reserves, Borrowings, Other Liabilities, Fixed Assets, CWIP, Investments, Other Assets, Total Assets
- **Cash Flow Statement** (ALL years visible): Cash from Operations, Cash from Investing, Cash from Financing, Net Cash Flow, Free Cash Flow, CFO/OP %
- **Key Ratios** (ALL years visible): Debtor Days, Inventory Days, Days Payable, Cash Conversion Cycle, Working Capital Days, ROCE %
- **Shareholding Pattern** (latest quarter): Promoter %, FII %, DII %, Public %, Promoter pledge %
- **Market data at top of page**: CMP, Market Cap, 52-week high/low, P/E, Forward PE, P/B, EV/EBITDA, Enterprise Value, Dividend Yield, Book Value per share, Face Value, ROCE, ROE, Debt, Debt-to-equity, Interest Coverage, Current ratio

**CRITICAL DATA INTEGRITY RULES — these exist because past reports had wrong numbers:**

1. **No rounding.** Screener shows 0.54 → write 0.54. Never write 0.5 or 1.
2. **No recomputing.** Use Screener's displayed number, not your own calculation. If Screener shows PAT = 9 and EPS = 0.54, transcribe both exactly — do not re-derive one from the other.
3. **No substitution.** Never replace a Screener figure with one from a web search snippet, annual report headline, news article, or training memory — even if they look close.
4. **No omission.** If Screener shows 10 or 12 years of data, record every year in your staging notes before deciding which 3 actuals to display. Dropping years during extraction causes range errors.
5. **Mark gaps honestly.** If a year or line item is absent from Screener, write "N/A" in the report — never guess or interpolate.
6. **Consolidated vs Standalone — be explicit.** If consolidated history is short (< 3 years), use standalone data and label every table "Standalone Figures." Never silently mix the two views.

**MANDATORY DATA STAGING — complete this before writing a single line of Python:**

After fetching, write a plain-text staging block (in your thinking, not in the PDF) that lists every number you intend to place in every table cell, keyed by year and line item. This one-to-one transcription check is the most reliable way to catch copy errors before they reach the PDF.

```
P&L STAGING — STANDALONE (from Screener, fetched DD-MMM-YYYY):
FY21: Sales=303, EBITDA=16, OPM%=5%, OtherInc=2, Interest=11, DA=3, PBT=5,  Tax%=12%, PAT=4,  EPS=0.25
FY22: Sales=526, EBITDA=24, OPM%=5%, OtherInc=2, Interest=12, DA=3, PBT=10, Tax%=6%,  PAT=9,  EPS=0.58
FY23: Sales=544, EBITDA=26, OPM%=5%, OtherInc=2, Interest=14, DA=4, PBT=11, Tax%=6%,  PAT=10, EPS=0.65
FY24: Sales=535, EBITDA=30, OPM%=6%, OtherInc=2, Interest=19, DA=4, PBT=10, Tax%=15%, PAT=8,  EPS=0.52
FY25: Sales=616, EBITDA=36, OPM%=6%, OtherInc=2, Interest=20, DA=4, PBT=14, Tax%=36%, PAT=9,  EPS=0.54

BALANCE SHEET STAGING — STANDALONE:
FY23: EquityCap=16, Reserves=72,  Borrowings=112, OthLiab=67, Total=267, FA=65, CWIP=1, Inv=0, OthAss=201
FY24: EquityCap=16, Reserves=80,  Borrowings=120, OthLiab=69, Total=285, FA=66, CWIP=0, Inv=0, OthAss=220
FY25: EquityCap=17, Reserves=140, Borrowings=117, OthLiab=71, Total=344, FA=64, CWIP=4, Inv=0, OthAss=277

CASH FLOW STAGING — STANDALONE:
FY23: OCF=29,  Inv=-8,  Fin=-14, Net=7,  FCF=21
FY24: OCF=5,   Inv=-4,  Fin=-8,  Net=-7, FCF=1
FY25: OCF=-21, Inv=-9,  Fin=30,  Net=0,  FCF=-27

RATIOS STAGING — STANDALONE:
FY23: DebtorDays=38, InvDays=89,  DaysPay=49, CCC=78,  ROCE=13%
FY24: DebtorDays=36, InvDays=124, DaysPay=55, CCC=105, ROCE=14%
FY25: DebtorDays=31, InvDays=130, DaysPay=45, CCC=116, ROCE=14%

MARKET DATA: CMP=76.2, MCap=1285, High=85.0, Low=23.1, PE=151, FwdPE=65.6, BV=9.47, FV=1.00,
             Promoter=69.8%, Pledge=0%, Debt=149, D/E=0.93, IntCov=1.73x
```

Only once this staging block is complete and cross-checked against the raw Screener page text should you write the Python PDF script. Any number in the PDF that is not in the staging block is a red flag — stop and verify.

**For US/global tickers**, use `https://stockanalysis.com/stocks/TICKER/financials/` as the equivalent primary source, and also fetch the `/balance-sheet/` and `/cash-flow-statement/` sub-pages. Apply the same Chrome fallback and staging discipline.

### 2B — Peer Data: Fetch Each Peer from Screener.in (NOT from web search)

For the peer comparison tables in Sections 4 and 8, identify 3–4 listed competitors and fetch each one's Screener page individually using the same WebFetch / Chrome method as Step 2A:

```
https://www.screener.in/company/PEER_TICKER/consolidated/
```

From each peer's Screener front page, extract and stage exactly:
- CMP, Market Cap, Stock P/E, Book Value, P/B, ROCE %, ROE %, Dividend Yield, Face Value
- TTM Sales (from P&L table, most recent 12 months)
- TTM Operating Profit and OPM% (from P&L table)
- TTM Net Profit and EPS

Stage these numbers for every peer exactly as you did for the main company. Do NOT use web search, memory, or any source other than Screener for these figures. If a peer's page returns no data, drop that peer and choose another.

### 2C — Qualitative Research (Use WebSearch — text only, no financial numbers)

After locking in all Screener numbers (main company + all peers), run web searches to gather:
- Management commentary from recent earnings calls or investor presentations
- Industry size and growth forecasts
- Recent news (last 6–12 months): capex plans, acquisitions, regulatory changes, new product launches

Web search is for words and context only. If a search result contains a financial number (revenue, market cap, P/E, etc.), ignore it and use the Screener figure instead.

**Important:** Do not fabricate numbers. If a specific data point is unavailable, state "data not available". Forward estimates must be clearly labelled "(E)" and must be grounded in Screener actuals — never invent a base from which to project.

### 2D — Concall Data: Fetch Latest Transcript from Screener.in

After completing Steps 2A–2C, fetch the latest concall transcript for the same company. This data powers the **Concall Appendix** at the end of the PDF report.

**Fetch the Documents section:**
```
https://www.screener.in/company/TICKER/
```
Locate the Documents section and identify the most recent concall transcript link.

**Fetch the transcript — try in order:**
```
Step 1: Try WebFetch on the transcript PDF URL directly
Step 2: If EGRESS_BLOCKED, use Chrome:
        mcp__Claude_in_Chrome__navigate (tabId, transcript_pdf_url)
        mcp__Claude_in_Chrome__get_page_text (tabId)
Step 3: If the BSE/NSE PDF is inaccessible, search AlphaStreet:
        Search: "[COMPANY NAME] Q[N] FY[YY] earnings call transcript site:alphastreet.com"
        Navigate and use get_page_text (tabId, depth=4, max_chars=50000)
Step 4: If genuinely inaccessible after all attempts, note clearly in the PDF:
        "Transcript not accessible — Sections 3, 4, 5, 8 will show N/A."
```

**Extract from the transcript (if accessible):**
- Quarter and concall date
- Management's opening remarks: top themes, tone, any surprises
- All numerical guidance given (margins, revenue, capex, volume)
- Full Q&A: every question asked, management's answer, quality of the answer
- Any language that sounds evasive, vague, or contradicts the financials

**Extract from Screener quarterly P&L (always required, even if transcript missing):**
- Last 4–5 quarters of Revenue, EBITDA, OPM%, PAT, EPS
- These are quarterly figures, distinct from the annual figures in Section 6

Stage these concall figures in a separate staging block before writing any Python.

---

## Step 3 — Write the Report (Follow This Template Exactly)

### ⚡ FORMATTING RULE — BULLET POINTS OVER PROSE

**All narrative sections (Sections 2–10) must be rendered as bullet-point lists, not prose paragraphs.**

**⛔ NEVER use `ListFlowable` or `ListItem` — they print the literal word "bullet" on the page. Hard ban, no exceptions.**

The only approved method for bullet points is a `Paragraph` with a dedicated indented style and a `•` character at the start of the text:

```python
from reportlab.lib.styles import ParagraphStyle

bullet_style = ParagraphStyle(
    'Bullet',
    parent=styles['Normal'],
    fontSize=10,
    leading=14,
    leftIndent=16,
    firstLineIndent=0,
    spaceAfter=4,
)

# Each bullet point:
Paragraph('• This is a bullet point sentence.', bullet_style)

# Bold lead-in with detail:
Paragraph('<b>Key theme:</b> Supporting detail here.', bullet_style)
```

Never use `ListFlowable`, `ListItem`, or any other ReportLab list construct anywhere in the script.

- Each bullet should be a complete, informative sentence — not a stub.
- Financial data tables (P&L, Balance Sheet, Cash Flow, Ratios, Peer comparison, Scenario analysis, Earnings Quality Checklist) remain as tables. Everything else that was previously a prose paragraph becomes bullets.
- Aim for 4–8 bullets per section; more is fine if the content warrants it.
- Never write a wall-of-text paragraph in the body of Sections 2–10.

---

### SECTION 1 — COVER PAGE SUMMARY
- Company name, ticker, exchange, sector, sub-sector
- Market cap (Rs. Cr or $ Bn), CMP, 52-week high/low
- Rating: BUY / ACCUMULATE / HOLD / REDUCE / SELL
- 12-month price target with upside/downside % from CMP
- Investment horizon
- One-line investment thesis (max 20 words — sharp and specific)
- Report date and analyst persona

### SECTION 2 — INVESTMENT THESIS
Render as **bullet points** (not prose paragraphs):
- **Reason 1 to own**: specific to this company, with a quantifiable opportunity and a timeline
- **Reason 2 to own**: specific to this company, with a quantifiable opportunity and a timeline
- **Reason 3 to own**: specific to this company, with a quantifiable opportunity and a timeline
- **Near-term catalyst (6–12 months)**: single most important upcoming trigger
- **Biggest structural risk**: single most important long-term risk

### SECTION 3 — BUSINESS OVERVIEW
Render as **bullet points** covering:
- What the company does and its core business model
- Revenue segmentation by product line and geography (use % splits where available)
- Key customers and nature of relationships (recurring vs project-based)
- Order book size and revenue visibility
- Recent strategic developments (last 12 months)
- Promoter background and current ownership stake

### SECTION 4 — INDUSTRY & COMPETITIVE LANDSCAPE
Render as **bullet points** covering:
- Industry size (Rs. Cr or $ Bn) and growth CAGR with source/timeframe
- Key policy tailwinds (e.g. PLI, capex super-cycle, import substitution) and headwinds
- Competitive moat: Pricing power / Switching costs / Scale / IP / Distribution — each rated Strong / Moderate / Weak with one-line rationale
- Top 3 competitors table: Name, CMP, MCap, TTM Revenue, ROCE (Screener data only)
- Company's positioning in the value chain (upstream / midstream / OEM / solutions)

### SECTION 5 — MANAGEMENT QUALITY & CAPITAL ALLOCATION
Render as **bullet points** covering:
- Promoter and senior management background (relevant experience, tenure)
- Capital allocation track record: how has FCF been deployed historically?
- Dividend policy: payout ratio trend, consistency
- Promoter pledging: current % pledged and direction of change
- ESOP grants and buyback history
- Any corporate governance concerns (RPTs, auditor changes, qualified opinions)

### SECTION 6 — FINANCIAL DEEP-DIVE
Last 3 actuals + 2 forward estimates. Keep the financial tables as tables: Income Statement, Balance Sheet, Cash Flow, Returns.

Below the tables, add a **bullet-point commentary** covering:
- Key revenue drivers and growth trajectory
- Margin direction: what is expanding or compressing and why
- Working capital trends (debtor days, inventory days, CCC)
- Debt level and direction (net debt / net cash, D/E ratio)
- FCF quality: OCF vs PAT conversion, capex intensity

### SECTION 7 — EARNINGS QUALITY CHECKLIST
Keep the checklist table (Green/Amber/Red ratings for: revenue recognition, receivables growth vs revenue, CCC trend, contingent liabilities, auditor tenure, RPTs as % of revenue, other income as % of PBT, tax rate consistency).

Below the table, add a **bullet-point summary** (3–4 bullets) calling out the most important signals — especially any Amber or Red items that an investor must watch.

### SECTION 8 — VALUATION
- Peer comparison table (Screener data only, labelled with fetch date) — keep as table
- Scenario analysis table (Bull / Base / Bear with key assumptions, PAT, multiple, target price) — keep as table
- **Valuation methodology** — render as bullet points:
  - DCF assumptions (WACC, terminal growth rate) and implied value per share
  - Earnings-based multiple assumption (forward P/E or EV/EBITDA) and implied value per share
  - Average of the two methods → base-case 12-month target price
  - Upside/downside % from CMP and investment horizon

### SECTION 9 — KEY RISKS
Render as **bullet points**, one bullet per risk (5–7 risks total). Each bullet format:
**[Risk Name]** — Description in 1–2 sentences. Probability: H/M/L. Impact: H/M/L. Monitor via: [specific indicator].

### SECTION 10 — RECOMMENDATION
Render as **bullet points**:
- **Rating**: BUY / ACCUMULATE / HOLD / REDUCE / SELL — with conviction level (High / Medium / Low)
- **12-month price target**: Rs. X (upside/downside % from CMP)
- **Suggested entry zone**: Rs. X–Y
- **Investment horizon**: X months / years
- **Thesis invalidation triggers** (3 specific, measurable conditions that would make this call wrong):
  1. …
  2. …
  3. …
- **Ideal investor profile**: who this stock is and isn't for

---

### SECTION 11 — LATEST CONCALL BRIEF (APPENDIX)

Start on a new page with `PageBreak()`. Title: **"APPENDIX — Latest Concall Brief: [Quarter] FY[YY]"**

The appendix has three parts rendered in this order: CALL GRADE block → TO MY BOSS box → 10-section concall body.

---

#### PART A — CALL GRADE BLOCK

Render a prominently styled grade card. Pick exactly one grade:

- **STRONGLY POSITIVE** — beat + raised guidance + bullish tone + no red flags
- **POSITIVE** — beat or in-line + constructive tone + thesis intact
- **NEUTRAL** — mixed signals; guidance maintained; no major surprises
- **CAUTIOUS** — miss or guidance cut, or evasive tone on key metrics
- **NEGATIVE** — material miss + guidance cut + broken thesis elements

Below the grade, render a 3-row signal table:
| Signal | Status | Implication |
|--------|--------|-------------|
| Result quality | Strong / Medium / Weak | Beat/In-line/Miss vs street |
| Management tone | Bullish / Balanced / Hedged / Evasive | Confidence level |
| Guidance delta | Raised / Maintained / Cut / Withdrawn | Forward direction |

Below the signal table, show a grade scale legend:
`STRONGLY POSITIVE  |  POSITIVE  |  NEUTRAL  |  CAUTIOUS  |  NEGATIVE`

**Styling:** Grade header background `#1A3A5C` (dark navy) white text. Signal rows alternating `#D6E4F0` / white. Legend row background `#F5F5F5`.

---

#### PART B — TO MY BOSS

Render this box immediately after the CALL GRADE block, before any numbered section.

**Styling:** Dark navy (`#1A3A5C`) header labelled "TO MY BOSS" in white. Body background `#EAF0F7`. Border: 1.2pt navy.

Write a single tight paragraph (8–10 sentences) in the voice of a research analyst briefing a senior CFA multi-bagger picker. The paragraph must cover:
1. The headline result — and whether it is misleading or clean
2. Any exceptional/one-time items distorting reported PAT or EPS, and the clean underlying number
3. Underlying operational performance: EBITDA growth, margin direction
4. Key structural growth drivers that support a multi-bagger thesis
5. Most important near-term catalyst (regulatory, product cycle, capex monetisation, etc.)
6. Single biggest risk or watch-point for the next quarter
7. A clear, specific action with a price level: HOLD / ACCUMULATE / REDUCE / EXIT

Tone: crisp, opinionated, no hedging. Written as if the analyst is accountable for the call.

---

#### PART C — 10-SECTION CONCALL BODY

Each section = titled band (dark navy `#1A3A5C`, white text) + **bullet-point list** below it. No tables in Part C — use `Paragraph` with `• ` prefix and the bullet_style defined in the Formatting Rule above. Never use `ListFlowable` or `ListItem`. Clean white background, standard body font.

**Section 1 — Financial Performance Snapshot**
One bullet per metric. Format: `• [Metric]: Actual Rs. X Cr | YoY +/-Y% | QoQ +/-Z% | [Beat / In-line / Miss]`
Metrics: Revenue, EBITDA, EBITDA Margin %, PAT, EPS.
If any line is distorted by an exceptional item, add: `• NOTE: Reported PAT includes one-time [item] of Rs. X Cr; clean underlying PAT = Rs. Y Cr`
Colour-code verdict text: green = Beat, grey = In-line, red = Miss.

**Section 2 — Segment / Geography Breakdown**
One bullet per segment or geography. Format: `• [Segment / Region]: Rs. X Cr | YoY +/-Y% | QoQ +/-Z% | [brief commentary]`

**Section 3 — Management Commentary Themes**
One bullet per theme (pull 4–6 most significant themes). Format:
`• [Theme]: "[key quote or paraphrase]" — Our read: [interpretation]. Tag: [GUIDANCE / EST / EVASIVE]. Tone: Transparent / Hedged / Evasive.`

**Section 4 — Operating & Business Metrics**
One bullet per KPI (volumes, realisations, order book, utilisation, etc.). Format:
`• [Metric]: Q(n) = X | Q(n-1) = Y | Q(n-4) = Z | Trend: [improving / stable / deteriorating]`

**Section 5 — Margin Drivers**
One bullet per driver. Format: `• [Driver]: [+/-X bps impact] | Recurring: Yes / No | [Comment]`
Flag non-recurring items explicitly — do not extrapolate them into forward estimates.

**Section 6 — Guidance & Forward Signals**
One bullet per guided metric. Format:
`• [Metric] [GUIDANCE]: Prior = X | New/Reiterated = Y | Delta = [raised / maintained / cut] | Credibility: High / Medium / Low`

**Section 7 — Capital Allocation**
One bullet per item. Format: `• [Item]: Rs. X Cr | vs prior year: +/-Y% | [Comment]`
Items: Capex, Dividends, Buybacks, Working Capital change, Net Debt movement.

**Section 8 — Q&A Heat Map**
One bullet per Q&A exchange. Format:
`• [Analyst / Firm]: Q: "[question summary]" → A: "[answer summary]" | Tone: Transparent / Hedged / Evasive`
End with: `• Dodged / watch-list questions for next quarter: [list]`

**Section 9 — Risks Flagged**
One bullet per risk. Format:
`• [Risk]: [description] | Flagged by: [mgmt / analyst] | Probability: H/M/L | Impact: H/M/L | Timeline: [near / medium / long-term]`

**Section 10 — Analyst Verdict**
Six scorecard bullets followed by conviction call and valuation snapshot:
- `• Revenue visibility: Intact / Weakened / Broken / Cannot assess — [one-line rationale]`
- `• Margin trajectory: Intact / Weakened / Broken / Cannot assess — [one-line rationale]`
- `• Capital allocation quality: Intact / Weakened / Broken / Cannot assess — [one-line rationale]`
- `• Competitive moat: Intact / Weakened / Broken / Cannot assess — [one-line rationale]`
- `• Management credibility: Intact / Weakened / Broken / Cannot assess — [one-line rationale]`
- `• Valuation comfort: Intact / Weakened / Broken / Cannot assess — [one-line rationale]`
- `• Conviction call: Increased / Unchanged / Decreased / Exit Watch / Insufficient Data`
- `• Valuation snapshot: P/E = X (5Y avg Y) | EV/EBITDA = X (5Y avg Y) | RoCE = X% (5Y avg Y%)`
---

#### COLOUR CONVENTIONS

| Element | Hex | Usage |
|---|---|---|
| Section header band | `#1A3A5C` | Background, white text |
| Beat / intact / transparent | `#1A6B3A` | Green cell highlight |
| Miss / broken / evasive | `#C0392B` | Red cell highlight |
| Partial / watch / hedged | `#E67E22` | Amber cell highlight |
| Alternating rows | `#D6E4F0` | Every other table row |
| TO MY BOSS body | `#EAF0F7` | Box background |

---

## Step 4 — Generate the PDF

Write a Python script at `/sessions/$SESSION_ID/generate_stock_report.py` and run it. The script uses ReportLab Platypus to build a **single PDF** saved to `/sessions/$SESSION_ID/mnt/[WORKSPACE_NAME]/[TICKER]_equity_report_[DATE].pdf`.

Sections 1–10 flow first, then the Concall Appendix (Section 11) after a `PageBreak()`. One file, never two.

---

### CRITICAL RULE 1 — Page width and column widths

A4 = 595 pt wide. Margins 50pt each side → usable content width = **495 pt**. Every table's column widths MUST sum to exactly 495. Never use `inch` units.

```python
PAGE_W, PAGE_H = A4        # 595 x 842 pt
MARGIN = 50
CONTENT_W = PAGE_W - 2 * MARGIN   # 495 pt
```

---

### CRITICAL RULE 2 — All table cells must be Paragraph objects

Plain strings overflow cells and break layout. **Every cell must be `Paragraph(str(value), style)`.**

```python
def p(text, style):
    return Paragraph(str(text), style)

# WRONG
row = ["Revenue", "145,800", "148,800"]

# CORRECT
row = [p("Revenue", cell_label), p("145,800", cell_num), p("148,800", cell_num)]
```

This rule applies to every table in the report — financial, peer, concall, scorecard. No exceptions.

---

### CRITICAL RULE 3 — No Unicode currency symbols

ReportLab's built-in Helvetica does not include the Rs. glyph (U+20B9). It renders as a solid black box. **Never write `₹` anywhere in the Python script.** Use `Rs.` instead in all strings.

If you have already written code with the symbol, fix it before running:
```bash
sed -i "s/₹/Rs./g" generate_stock_report.py
```

---

### CRITICAL RULE 4 — Verify output path before running

```python
import os
output_path = f"/sessions/{SESSION_ID}/mnt/{WORKSPACE_NAME}/{TICKER}_equity_report_{DATE}.pdf"
os.makedirs(os.path.dirname(output_path), exist_ok=True)
```

If the output PDF already exists and is open, rename it (append `_v2`, `_v3`) to avoid permission errors.

---

### CRITICAL RULE 5 — Nested table width validation

ReportLab does **not** clip nested tables — they silently overflow the page boundary, making content unreadable off the right edge. This has happened in production and must be prevented.

**The rule:** `sum(inner_col_widths) <= outer_col_width - outer_left_pad - outer_right_pad`

**Mandatory steps when placing any table inside another table:**

1. **Zero out all padding on the outer wrapper table** so the inner table gets the full declared column width:
```python
outer_tbl.setStyle(TableStyle([
    ('LEFTPADDING',   (0,0), (-1,-1), 0),
    ('RIGHTPADDING',  (0,0), (-1,-1), 0),
    ('TOPPADDING',    (0,0), (-1,-1), 0),
    ('BOTTOMPADDING', (0,0), (-1,-1), 0),
]))
```

2. **Verify the arithmetic explicitly** before writing each nested table:
   - Outer column width = X pt
   - Inner table cell padding (left + right) = P pt per cell
   - Therefore: `sum(inner_col_widths)` must be <= `X - P`

3. **Cover page rule:** The side-by-side rating/metrics layout is the most common failure point. Outer `colWidths` must sum to `CONTENT_W = 495`. Inner table widths must each fit inside their respective outer column with padding accounted for. When in doubt, use one flat table spanning the full 495 pt instead of nesting.

---

### CRITICAL RULE 6 — Visual inspection of page 1 before declaring complete

After generating the PDF, always render page 1 as an image and visually inspect it before telling the user the report is ready. Do not skip this step.

```bash
pdftoppm -r 200 -png -f 1 -l 1 /path/to/report.pdf /path/to/preview
```

Then use the `Read` tool on the resulting `.png` to view it. Confirm:
- No table content is clipped at the right or bottom page boundary
- All column headers and values are fully visible
- The cover page rating box and metrics table are both fully readable

If anything is clipped, fix the column widths before delivering the report.
