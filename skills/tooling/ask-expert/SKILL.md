---
name: ask-expert
description: Orchestrate financial, business, and investing questions by consulting Dr. Anil Lamba (author of 'Romancing the Balance Sheet' — corporate finance, balance sheet literacy, working capital, marginal costing, leverage), SOIC (School of Intrinsic Compounding — equity research, stock valuation, sector analysis, growth catalysts, public market compounding), and StockScans (official tutorials on screening tools, Research AI, concall & interview scans, order book tracking, and result season prep). Use whenever the user asks broad investing or business questions, asks "what do the experts say about X", "how should I think about debt/cash/growth/profit", "compare Anil Lamba and SOIC on Y", "how to screen for high-compounder stocks on StockScans", or asks questions spanning operational financial management, public equity investing, and screening platform execution. Synthesizes harmonious learnings into a cohesive operational + investment framework, and explicitly isolates, contrasts, and explains conflicting or diverging viewpoints with citations and timestamped deep links.
---

# Ask Expert

Orchestrates multi-expert answers across three distinct, complementary financial corpora cached in this repository:

1. **Dr. Anil Lamba** (`ask-anil-lamba`): 197 YouTube video transcripts from `@AnilLamba` — corporate finance, balance sheet literacy, working capital cycles, profit vs cash, marginal costing, and operating/financial leverage.
2. **SOIC** (`ask-soic`): ~1,100 teaching transcripts (545+ Learnyst course lessons + 573+ SOIC YouTube videos) — fundamental equity research, company valuation, competitive moats, concall commentary, sector deep dives, and public market compounding.
3. **StockScans** (`ask-stockscans`): Official YouTube video tutorials from `@StockScans` — screening mechanics, Research AI synthesis, concall scans, management interview tracking, order book tracking, custom index creation, and platform capabilities.

This skill synthesizes their perspectives: where they agree, it combines internal business mechanics with public market compounding and practical screening workflows into a unified framework; where their philosophies diverge or conflict, it presents both views separately and explains the root difference.

## Expert Profiles & Domain Matrix

| Dimension               | Dr. Anil Lamba                                                                                                                                                                                                                                                                      | SOIC (Ishmohit Arora)                                                                                                                                                                                                                                                    | StockScans                                                                                                                                                                   |
| :---------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primary Stance**      | **Internal Business Operator / Banker / CA**                                                                                                                                                                                                                                        | **Public Market Equity Investor / Compounder**                                                                                                                                                                                                                           | **Research Platform & Quantitative/Qualitative Scanner**                                                                                                                     |
| **Focus**               | Solvency, liquidity, margin control, risk containment                                                                                                                                                                                                                               | Growth, reinvestment runway, EPS compounding, re-rating                                                                                                                                                                                                                  | Actionable discovery, screening filters, automated filing alerts, concall/interview tracking, Research AI                                                                    |
| **Core Domains**        | • Balance sheet construction & reading in 60s<br>• Working capital cycle (debtors/inventory)<br>• _Profit ≠ Cash_ ("Profit can destroy business")<br>• Marginal costing & break-even contribution<br>• Operating & Financial Leverage formulas<br>• Project IRR and capex proposals | • Equity valuation multiples (P/E, P/B, EV/EBITDA)<br>• Industry deep dives & value chains<br>• Competitive moats & capital allocation<br>• Concall analysis & management credibility<br>• Growth catalysts & J-Curve inflections<br>• Technical Stage 2 breakout timing | • Custom StockScans queries & filters<br>• Research AI synthesis<br>• Concall & interview scans<br>• Order book & first-concall scans<br>• IPO scans & custom index tracking |
| **Key Overlaps**        | Balance sheet health, ROE/ROCE, debt hazards, accounting fraud/scam autopsies (Satyam, etc.), cash flow importance                                                                                                                                                                  | Concall analysis, corporate announcements, growth triggers                                                                                                                                                                                                               | Automated concall discovery, management tone scans, forensic flags                                                                                                           |
| **Potential Conflicts** | • "Timing beats stock picking" vs "Quality compounders trump macro timing"<br>• "Hefty bank balance causes cash drag" vs "War chest of net cash enables counter-cyclical growth"<br>• Strict mathematical leverage limits vs business-cycle debt expansion                          |                                                                                                                                                                                                                                                                          |                                                                                                                                                                              |

## Division of Labour (Logic vs Reasoning, per conventions.md rule 17)

- **Logic → script (deterministic):** searching all three corpora, scoring hits, and extracting timestamped excerpts and deep links from each expert is handled by `scripts/search_expert.py`.
- **Reasoning → you:** evaluating whether the query is best answered by one expert, two, or all three, synthesizing common ground, isolating conflicting stances, and providing reconciled practical guidance.

## Steps

### 1. Resolve the Local Repo

Ensure the local `stockmarket` checkout has populated data in `data/learnyst-lessons.json` and `data/youtube-transcripts.json`.

### 2. Run the Multi-Expert Search Script

Run the companion orchestrator script:

```bash
yarn ask-expert:search --query "<the user's question, verbatim or lightly cleaned up>" --expert auto --data-root data --top 6
```

_(or `python3 skills/tooling/ask-expert/scripts/search_expert.py --query "..." --expert auto --data-root data --top 6`)_

- `--expert auto` (default): queries all corpora and automatically determines which expert(s) have substantive coverage.
- Use `--expert all` or `--expert both` when the user explicitly asks for comparison, conflicting viewpoints, or when the query spans multiple domains.
- Use `--expert anil-lamba`, `--expert soic`, or `--expert stockscans` to focus on a specific expert.

### 3. Analyze Results & Routing

Examine the JSON output:

- **`mode: "all"` or `"both"`**: Multiple experts have relevant teachings. Proceed to **Multi-Expert Synthesis & Practical Application**.
- **`mode: "anil-lamba"`**: Query is primarily operational/corporate finance. Deliver Dr. Anil Lamba's teachings with citations, noting that this is an internal business management framework.
- **`mode: "soic"`**: Query is primarily public equity research / stock market investing. Deliver SOIC's teachings with citations, noting that this is an equity compounding framework.
- **`mode: "stockscans"`**: Query is primarily about StockScans tools, screening queries, or Research AI. Deliver StockScans' tutorial instructions with citations and video deep links.
- **`mode: "none"`**: No strong matches. Inform the user directly and offer rephrasing options.

### 4. Synthesize the Answer (Multi-Expert Queries)

When both experts contribute, structure the response with clarity:

#### A. Executive Summary

A concise synthesis (2-3 sentences) answering the core question by bridging the operational operator's view and the public investor's view.

#### B. Harmonious Ground (Shared Principles)

Detail concepts where Dr. Anil Lamba and SOIC share the same mental model, synthesizing how internal mechanics translate to market value:

- E.g., both agree that reported accounting profit without operating cash flow is an illusion and an early warning sign of business distress.
- E.g., both emphasize that debt must be strictly serviced by operational cash flows and that leverage amplifies risk in cyclical downturns.
- Cite specific videos/lessons for each claim with inline timestamps.

#### C. Divergent Views & Conflict Analysis (When Stances Differ)

When the two experts differ in philosophy, do NOT force an artificial consensus. Present each perspective clearly, then explain the structural reason:

1. **Dr. Anil Lamba's Stance (Corporate Operator / Solvency View)**:
   - What Dr. Lamba argues, his specific reasoning, and citation (`Dr. Anil Lamba YouTube · <title>` with timestamp & URL).
2. **SOIC's Stance (Public Equity Investor / Growth Compounder View)**:
   - What SOIC argues, their specific reasoning, and citation (`SOIC Learnyst` / `SOIC YouTube · <title>` with timestamp & URL).
3. **StockScans' Stance (Screening Execution & Tooling View)** (when applicable):
   - How StockScans demonstrates screening, filtering, or tracking this phenomenon in practice (`StockScans YouTube · <title>` with timestamp & URL).
4. **Conflict & Reconciled Synthesis**:
   - Explain _why_ viewpoints differ and how they connect:
     - **Operator/Lender vs Investor**: Dr. Lamba focuses on capital preservation, debt safety margins, and avoiding insolvency in an operating business. SOIC focuses on equity upside, capital allocation into growth runways, and multi-year compounding. StockScans provides the actionable screener rules and AI synthesis to filter and monitor these businesses.
     - **Cash Drag vs War Chest**: Lamba sees excess idle bank balances as capital inefficiency/mismanagement; SOIC sees net cash as strategic option value for capex during industry downcycles.
     - **Market Timing vs Stock Selection**: Lamba highlights macroeconomic cycle timing; SOIC emphasizes that high-quality businesses with pricing power outgrow macro cycles.
   - Provide clear guidance on when the user should apply which mental model (e.g. running a business vs investing in a listed stock vs screening on the platform).

### 5. Token-Optimization Note (conventions.md rule 11)

Conclude with a brief token-optimization note summarizing the number of excerpts consulted across the indices and search efficiency.
