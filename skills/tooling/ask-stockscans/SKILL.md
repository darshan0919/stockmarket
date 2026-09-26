---
name: ask-stockscans
description: Answer questions about StockScans tools, scanners, screeners, Research AI, concall & management interview scans, result tracking, order book scans, custom indexes, and platform workflows by searching StockScans' official YouTube channel (@StockScans) video transcripts and synthesizing answers with timestamped video citations and deep links. Use whenever the user asks "how to use StockScans for X", "what does StockScans video say about Y", "how to screen for Z on StockScans", "StockScans Research AI tutorial", "how to scan concalls / management interviews / IPOs / order books on StockScans", or asks for official StockScans platform methodologies.
---

# Ask StockScans

Answers a free-text question by searching StockScans' official YouTube tutorial corpus cached in this repo — video transcripts from `@StockScans` (`data/youtube-transcripts.json` + `data/youtube-transcripts/*.jsonl`) — and synthesizing a direct answer grounded in what StockScans has demonstrated, with a citation (channel video title plus timestamp and deep link) for every claim.

This is a **lookup-and-answer** tool focused on StockScans platform capabilities, screening mechanics, Research AI workflows, concall scans, management interview tracking, order book scans, and result season preparation.

## Core Platform Workflows & Features Covered

StockScans publishes weekly tutorials and feature deep dives on YouTube (`@StockScans`). Core topics include:

1. **Research AI & Automated Document Synthesis**:
   - Synthesizing conference calls, investor presentations, and annual reports using Research AI.
   - Extracting key themes, management sentiment, guidance changes, and industry triggers.
2. **Concall & Management Interview Scans**:
   - Scanning for first-time concall disclosures (inflection points).
   - Tracking TV/media interviews of promoters and management commentary across sectors.
   - Result quality and guidance tracking across quarterly earnings seasons.
3. **Screening Mechanics & Custom Queries**:
   - Creating custom scans (e.g. Order Book wins, capex commercialization, volume rocketing).
   - Building Custom Indices to identify industry leadership before broader market rallies.
   - Filtering corporate filings, announcements, and bulk/block deals.
4. **IPO Scans & Valuation Checks**:
   - Evaluating newly listed companies and IPO filings using IPO scans.
   - Spotting red flags and key annual report sections before investing.

## Division of Labour (Logic vs Reasoning, per conventions.md rule 17)

- **Logic → script (deterministic):** finding which StockScans transcripts are relevant to the query, and pulling the single best-matching excerpt with its timestamp and deep link, is pure lexical scoring — no judgment involved. This is `scripts/search_stockscans.py`.
- **Reasoning → you:** reading the returned excerpts, explaining the feature workflow, resolving nuances across multiple tutorials, and writing the synthesized answer is the only part that should spend LLM tokens on this task.

Never grep or read raw transcript files yourself to answer a query — always go through the script.

## Steps

### 1. Resolve the Local Repo

Locate the local `stockmarket` checkout. This skill needs the local `data/` directory to exist with `data/youtube-transcripts.json` containing `@StockScans` records. If no local checkout with populated data is available, inform the user and stop.

### 2. Run the Search Script

Run the companion search script via yarn or python3:

```bash
yarn ask-stockscans:search --query "<the user's question, verbatim or lightly cleaned up>" --data-root data --top 8
```

_(or `python3 skills/tooling/ask-stockscans/scripts/search_stockscans.py --query "..." --data-root data --top 8`)_

- Use the user's question close to verbatim — the script performs stopword removal and TF-IDF scoring.
- The first run after a corpus refresh builds and caches the index to `data/cache/ask-stockscans/index.json` (sub-second queries on cache hits). Only pass `--reindex` if you need to force a rebuild.
- If the topic could reasonably be phrased multiple ways (e.g. "order book scan" vs "order win query"), run the script with alternative phrasings and combine results by `id`.

### 3. Handle No Matches or a Thin Corpus

- `"results": []` — tell the user directly that nothing in the current StockScans corpus matches, rather than guessing from general knowledge. Offer to rephrase or check if the topic is covered by SOIC via `/ask-soic` or Dr. Anil Lamba via `/ask-anil-lamba` or `/ask-expert`.
- If results come back with low relevance scores, state explicitly that StockScans does not have a dedicated video on this exact query, but cite the closest related tutorials.
- If a recent video by StockScans is missing from the corpus, suggest running `yarn youtube-transcript-refresh`.

### 4. Synthesize the Answer

Read the returned excerpts and synthesize a structured, direct answer:

- **Lead with the workflow/tool**: Explain how StockScans solves the task or which feature/scan achieves the goal.
- **Provide step-by-step navigation**: Where to click or what filter to set on StockScans based on the video instructions.
- **Cite every substantive claim**: Use the `citation` field (`StockScans YouTube · <videoTitle>`) and include the `timestamp` (e.g. "around 03:15").
- **Surface the video URL**: Provide the exact deep link (`https://www.youtube.com/watch?v=...&t=...s`) so the user can watch the video tutorial directly.

### 5. Token-Optimization Note (conventions.md rule 11)

End with a short, evidence-based note on search efficiency (cache hit status, number of excerpts consulted vs returned).

## Scope Notes

- **Platform-focused**: StockScans videos focus on using the StockScans platform, screening tools, and Research AI. For broader corporate finance frameworks, consult `ask-anil-lamba`; for deep stock-picking and valuation pedagogy, consult `ask-soic`.
- **Lexical (TF-IDF)**: Matches on spoken terminology in the video transcripts. Using platform keywords (e.g. "Research AI", "Concall Scan", "Custom Index", "IPO Scans") yields optimal results.
- **Read-only**: Does not persist any database entities; only updates its derived search cache in `data/cache/ask-stockscans/index.json`.
