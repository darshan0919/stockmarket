---
name: ask-anil-lamba
description: Answer a free-text corporate finance, business management, or accounting question by searching Dr. Anil Lamba's teaching corpus — YouTube video transcripts from the @AnilLamba channel (author of 'Romancing the Balance Sheet') — and synthesizing a direct answer with citations back to the specific video and timestamped watch URL. Use whenever the user asks "what does Anil Lamba say about X", "how does Anil Lamba explain Y", "ask Anil Lamba about Z", "Romancing the Balance Sheet concepts", or asks about reading balance sheets, working capital cycles, profit vs cash flow ("why more profit equals less cash" / "profit can destroy business"), marginal costing and contribution margin, break-even analysis, operating and financial leverage, debt traps and borrowing decisions, capex and IRR, or corporate finance literacy for non-finance executives. NOT for public equity stock picking or sector deep dives (that's ask-soic / equity-research skills) — ask-anil-lamba is a lookup-and-answer tool for Dr. Anil Lamba's operational and corporate finance frameworks.
---

# Ask Anil Lamba

Answers a free-text question by searching Dr. Anil Lamba's teaching corpus cached in this repo — 197 YouTube video transcripts from `@AnilLamba` (`data/youtube-transcripts.json` + `data/youtube-transcripts/<id>.json`) — and synthesizing a direct answer grounded in what Dr. Anil Lamba has taught, with a citation (channel video title plus timestamp and deep link) for every claim.

This is a **lookup-and-answer** tool focused on corporate finance, financial literacy for non-finance managers, balance sheet health, working capital, marginal costing, and leverage dynamics.

## Core Expertise & Signature Frameworks

Dr. Anil Lamba is a Chartered Accountant, corporate trainer, and bestselling author (_Romancing the Balance Sheet_, _Eye on the Bottom Line_). His core teachings center on:

1. **Balance Sheet Construction & Literacy**:
   - Understanding why the Balance Sheet balances (the fundamental duality).
   - "Reading a Balance Sheet in 60 Seconds": instantly gauging liquidity, solvency, and operational health.
   - Personal Balance Sheets and eliminating non-performing / non-essential assets.
2. **Working Capital Management & Cash Flow vs Profit**:
   - The Working Capital Cycle (operating cycle): inventory holding, receivable collection vs vendor credit traps.
   - _Profit ≠ Cash_: "Why more profit = less cash" and "Profit can destroy your business" (overtrading, cash starvation during rapid sales expansion).
   - "Why a hefty bank balance should make you lose sleep" (cash drag, idle capital, inefficiency).
3. **Marginal Costing & Contribution Analysis**:
   - Fixed vs Variable costs, Contribution Margin, and Break-Even Point.
   - Decision-making: "How selling at a loss can increase overall profit", avoiding sales commission blunders.
4. **Leverages & Risk Profiling**:
   - Operating Leverage (fixed operating expenses), Financial Leverage (fixed debt interest), and Combined Leverage.
   - Mathematical rule for borrowing: Return on Investment (ROI) vs Cost of Borrowing.
   - Debt traps and avoiding insolvency.
5. **Capex & Capital Budgeting**:
   - Internal Rate of Return (IRR), evaluating capital expenditure proposals, structuring project reports.
6. **Governance, Scams & Macro Case Studies**:
   - Satyam scam (accounting fraud), Harshad Mehta, Rajat Gupta insider trading, George Soros crashing the Bank of England (Black Wednesday), reserve currency / dollar hegemony, Laffer curve, tax planning vs tax evasion.

## Division of Labour (Logic vs Reasoning, per conventions.md rule 17)

- **Logic → script (deterministic):** finding which of Dr. Anil Lamba's transcripts are relevant to the query, and pulling the single best-matching excerpt with its timestamp and deep link, is pure lexical scoring — no judgment involved. This is `scripts/search_anil_lamba.py`.
- **Reasoning → you:** reading the returned excerpts, deciding what they actually say, resolving nuance across multiple videos, and writing the synthesized answer is the only part that should spend LLM tokens on this task.

Never grep or read raw transcript files yourself to answer a query — always go through the script.

## Steps

### 1. Resolve the Local Repo

Locate the local `stockmarket` checkout. This skill needs the local `data/` directory to exist with `data/youtube-transcripts.json` containing `@anillamba` records. If no local checkout with populated data is available, inform the user and stop.

### 2. Run the Search Script

Run the companion search script via yarn or python3:

```bash
yarn ask-anil-lamba:search --query "<the user's question, verbatim or lightly cleaned up>" --data-root data --top 8
```

_(or `python3 skills/tooling/ask-anil-lamba/scripts/search_anil_lamba.py --query "..." --data-root data --top 8`)_

- Use the user's question close to verbatim — the script performs stopword removal and TF-IDF scoring.
- The first run after a corpus refresh builds and caches the index to `data/cache/ask-anil-lamba/index.json` (sub-second queries on cache hits). Only pass `--reindex` if you need to force a rebuild.
- If the topic could reasonably be phrased multiple ways (e.g. "marginal costing" vs "contribution margin" vs "break even point"), run the script with alternative phrasings and combine results by `id`.

### 3. Handle No Matches or a Thin Corpus

- `"results": []` — tell the user directly that nothing in the current Dr. Anil Lamba corpus matches, rather than guessing from general knowledge. Offer to rephrase or check if the topic is covered by SOIC via `/ask-soic` or `/ask-expert`.
- If results come back with low relevance scores, state explicitly that Dr. Anil Lamba does not have a dedicated video on this exact phrase, but cite the closest related principles.
- If a recent video by Dr. Anil Lamba is missing from the corpus, suggest running `yarn youtube-transcript-refresh`.

### 4. Synthesize the Answer

Read the returned excerpts and synthesize a structured, direct answer:

- **Lead with the core principle**: Explain Dr. Anil Lamba's perspective in clear, accessible terms (his signature "Finance for Non-Finance" style).
- **Highlight the practical business rule / mantra**: E.g. "Rule 1: Don't buy fixed assets with short-term funds", "Rule 2: Profit is not cash", "Contribution must cover fixed costs".
- **Cite every substantive claim**: Use the `citation` field (`Dr. Anil Lamba YouTube · <videoTitle>`) and include the `timestamp` (e.g. "around 04:37").
- **Surface the video URL**: Provide the exact deep link (`https://www.youtube.com/watch?v=...&t=...s`) so the user can watch the specific clip.
- **Differentiate from equity investing**: Dr. Anil Lamba teaches business financial management and operational solvency. If the user's question is about evaluating a listed stock for investment or valuation multiples (P/E, P/B), answer the financial statement mechanics part, and refer them to `ask-soic` or `ask-expert` for equity valuation.

### 5. Token-Optimization Note (conventions.md rule 11)

End with a short, evidence-based note on what could be cheaper next time (e.g. cache hit efficiency, number of excerpts consulted vs returned).

## Scope Notes

- **Transcripts only**: 119 of the 197 videos currently have full transcribed captions. Videos with `captionKind: none` are recorded in the index and skipped without runtime cost.
- **Lexical (TF-IDF)**: Matches on spoken terminology. Rephrasing queries with accounting terms (e.g., "contribution" instead of "gross profit", "working capital" instead of "short term money") helps recall.
- **Read-only**: Does not persist any database entities; only updates its derived search cache in `data/cache/ask-anil-lamba/index.json`.
