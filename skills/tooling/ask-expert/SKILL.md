---
name: ask-expert
description: Orchestrate financial, business, and investing questions by consulting both Dr. Anil Lamba (author of 'Romancing the Balance Sheet' — corporate finance, balance sheet literacy, working capital, marginal costing, leverage) and SOIC (School of Intrinsic Compounding — equity research, stock valuation, sector analysis, growth catalysts, public market compounding). Use whenever the user asks broad investing or business questions, asks "what do the experts say about X", "how should I think about debt/cash/growth/profit", "compare Anil Lamba and SOIC on Y", or asks questions spanning operational financial management and public equity investing. Synthesizes harmonious learnings into a cohesive operational + investment framework, and explicitly isolates, contrasts, and explains conflicting or diverging viewpoints with citations and timestamped deep links.
---

# Ask Expert

Orchestrates multi-expert answers across two distinct, complementary financial corpora cached in this repository:

1. **Dr. Anil Lamba** (`ask-anil-lamba`): 197 YouTube video transcripts from `@AnilLamba` — corporate finance, balance sheet literacy, working capital cycles, profit vs cash, marginal costing, and operating/financial leverage.
2. **SOIC** (`ask-soic`): ~1,100 teaching transcripts (545+ Learnyst course lessons + 573+ SOIC YouTube videos) — fundamental equity research, company valuation, competitive moats, concall commentary, sector deep dives, and public market compounding.

This skill synthesizes their perspectives: where they agree, it combines internal business mechanics with public market compounding into a unified framework; where their philosophies diverge or conflict, it presents both views separately and explains the root difference.

## Expert Profiles & Domain Matrix

| Dimension               | Dr. Anil Lamba                                                                                                                                                                                                                                                                      | SOIC (Ishmohit Arora)                                                                                                                                                                                                                                                    |
| :---------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Primary Stance**      | **Internal Business Operator / Banker / CA**                                                                                                                                                                                                                                        | **Public Market Equity Investor / Compounder**                                                                                                                                                                                                                           |
| **Focus**               | Solvency, liquidity, margin control, risk containment                                                                                                                                                                                                                               | Growth, reinvestment runway, EPS compounding, re-rating                                                                                                                                                                                                                  |
| **Core Domains**        | • Balance sheet construction & reading in 60s<br>• Working capital cycle (debtors/inventory)<br>• _Profit ≠ Cash_ ("Profit can destroy business")<br>• Marginal costing & break-even contribution<br>• Operating & Financial Leverage formulas<br>• Project IRR and capex proposals | • Equity valuation multiples (P/E, P/B, EV/EBITDA)<br>• Industry deep dives & value chains<br>• Competitive moats & capital allocation<br>• Concall analysis & management credibility<br>• Growth catalysts & J-Curve inflections<br>• Technical Stage 2 breakout timing |
| **Key Overlaps**        | Balance sheet health, ROE/ROCE, debt hazards, accounting fraud/scam autopsies (Satyam, etc.), cash flow importance                                                                                                                                                                  |
| **Potential Conflicts** | • "Timing beats stock picking" vs "Quality compounders trump macro timing"<br>• "Hefty bank balance causes cash drag" vs "War chest of net cash enables counter-cyclical growth"<br>• Strict mathematical leverage limits vs business-cycle debt expansion                          |

## Division of Labour (Logic vs Reasoning, per conventions.md rule 17)

- **Logic → script (deterministic):** searching both corpora, scoring hits, and extracting timestamped excerpts and deep links from each expert is handled by `scripts/search_expert.py`.
- **Reasoning → you:** evaluating whether the query is best answered by one expert or both, synthesizing common ground, isolating conflicting stances, and providing reconciled practical guidance.

## Steps

### 1. Resolve the Local Repo

Ensure the local `stockmarket` checkout has populated data in `data/learnyst-lessons.json` and `data/youtube-transcripts.json`.

### 2. Run the Multi-Expert Search Script

Run the companion orchestrator script:

```bash
yarn ask-expert:search --query "<the user's question, verbatim or lightly cleaned up>" --expert auto --data-root data --top 6
```

_(or `python3 skills/tooling/ask-expert/scripts/search_expert.py --query "..." --expert auto --data-root data --top 6`)_

- `--expert auto` (default): queries both corpora and automatically determines whether one or both experts have substantive coverage.
- Use `--expert both` when the user explicitly asks for comparison, conflicting viewpoints, or when the query spans both operational finance and equity investing.
- Use `--expert anil-lamba` or `--expert soic` to focus on a specific expert.

### 3. Analyze Results & Routing

Examine the JSON output:

- **`mode: "both"`**: Both experts have relevant teachings. Proceed to **Dual-Expert Synthesis & Conflict Analysis**.
- **`mode: "anil-lamba"`**: Query is primarily operational/corporate finance. Deliver Dr. Anil Lamba's teachings with citations, noting that this is an internal business management framework.
- **`mode: "soic"`**: Query is primarily public equity research / stock market investing. Deliver SOIC's teachings with citations, noting that this is an equity compounding framework.
- **`mode: "none"`**: No strong matches. Inform the user directly and offer rephrasing options.

### 4. Synthesize the Answer (Dual-Expert Queries)

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
3. **Conflict & Reconciled Synthesis**:
   - Explain _why_ their viewpoints differ:
     - **Operator/Lender vs Investor**: Dr. Lamba focuses on capital preservation, debt safety margins, and avoiding insolvency in an operating business. SOIC focuses on equity upside, capital allocation into growth runways, and multi-year compounding.
     - **Cash Drag vs War Chest**: Lamba sees excess idle bank balances as capital inefficiency/mismanagement; SOIC sees net cash as strategic option value for capex during industry downcycles.
     - **Market Timing vs Stock Selection**: Lamba highlights macroeconomic cycle timing; SOIC emphasizes that high-quality businesses with pricing power outgrow macro cycles.
   - Provide clear guidance on when the user should apply which mental model (e.g. running a business vs investing in a listed stock).

### 5. Token-Optimization Note (conventions.md rule 11)

Conclude with a brief token-optimization note summarizing the number of excerpts consulted across the two indices and search efficiency.
