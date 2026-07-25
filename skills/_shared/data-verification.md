# Data Verification & Anti-Hallucination Protocol

Shared protocol for ALL stockmarket research skills. Source: SOIC "AI for the Intelligent
Investor" (Day 1/2, 2026), SOIC prompt library, and the Dashboard Extraction Guide (Apr 2026).
Every skill that asserts a number, quote, or date MUST follow this.

## The framework: Source → Extract → Verify → Interpret

1. Get the original document (filing, transcript, Screener page).
2. Pull only the relevant facts.
3. Check numbers and quotes against the source before asserting them.
4. Only then form a view — and label it as interpretation, not fact.

## Market-data anchor rules (NON-NEGOTIABLE)

| Data point            | Source of truth              | Never do                                      |
| --------------------- | ---------------------------- | --------------------------------------------- |
| P/E                   | Screener.in / Stockscans     | Calculate from quarterly PAT                  |
| CMP                   | Latest live quote            | Use prices from old articles or training data |
| Market Cap            | Screener.in / Stockscans     | Derive from a wrong/stale CMP                 |
| Peer metrics          | Fetch each peer individually | Assume or estimate                            |
| Shareholding / pledge | Latest exchange disclosure   | Carry forward stale quarters                  |

## Additional context sources (supplement, never override primary filings)

On top of the market-data anchors above, pull additional stock/sector context from:

1. Stockscans DD reports: https://stockscans-dd-reports.netlify.app/
2. Drive research folder: https://drive.google.com/drive/folders/17jpBv_1pzmWN4qHNUKjk7L_NW33JlPHx

Cite these like any other source; they supplement primary filings/financials, they don't replace them.

- Sanity check: `CMP × shares outstanding ≈ Market Cap` (within 3%). If not, stop and flag.
- Model-EPS sanity check: projected Year-0 EPS must be within 10% of `CMP ÷ Screener P/E`.
- If a calculated value differs from Screener's by >10%, use Screener's and note the gap.

## Source tagging

Mark every share/size/market number as one of:

- **[R]** reported by the company/player,
- **[D]** derived (e.g., player revenue ÷ industry size),
- **[E]** analyst estimate.

If an analysis is built on >40% [E] numbers, downgrade its stated confidence and say so.

## The 10 anti-hallucination techniques

1. **Ground in documents first** — answer from uploaded/fetched filings, not memory.
2. **Stay inside the documents** — "Answer only from the material provided. If not present,
   say 'not found in provided material'."
3. **Evidence with every claim** — quote, page number, or source line beside each conclusion.
4. **Separate facts from interpretation** — extract verbatim first, interpret in a separate section.
5. **Admit uncertainty** — "If confidence is low, say so. Do not fill gaps."
6. **Structured outputs** — tables with a Source column leave less room for invention.
7. **Small questions over giant vague ones.**
8. **Verify numbers separately** — dates, %, multiples, market shares, legal claims are the
   highest-risk categories.
9. **Retrieval, not memory** — fetch the source, extract, then summarize.
10. **Red-flag zones** — extra caution on: future projections, competitor market share, TAM,
    promoter commentary, regulation, "latest" developments, reasons for stock moves.

## Strict citation & dating rules (from the Stage-2 protocol)

1. **DATE EVERYTHING** — "recently won order" is rejected; "won ₹450 Cr order from Adani
   Green on 22-Jan-2026" is accepted.
2. **QUANTIFY OR DELETE** — "strong order book" → rejected; "order book ₹3,200 Cr (up 42% YoY)" → accepted.
3. **ANNOUNCED ≠ EXECUTED** — "planning capex" is not "capex commissioned". Label clearly.
4. **Skepticism on generic narratives** — "China+1 beneficiary" must be backed by actual
   order wins / customer additions.
5. **Cite sources** — `[Source: Q3 FY26 concall / BSE filing dated X / Screener.in]`.
6. **Acknowledge gaps** — "Limited recent newsflow — trigger unclear" beats inventing.
7. **Date-stamp every report** — "Data current as of [date]"; flag figures older than 2 quarters.

## Verbatim-preservation rules (extraction contexts)

Preserve VERBATIM: auditor qualifications and KAMs, guidance statements, accounting policy
changes, restatements, and management phrasing with analytical weight. Paraphrase everything
else. All numbers carry units (₹ Cr, %, x, MW, MT).

## Self-challenge

Before finalising any analysis, always answer: **"What could be wrong with this analysis?"**
— and include the answer in the output.
