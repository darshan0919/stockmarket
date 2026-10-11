# Topic extraction contract - research process, screening & routines (cheap tier, recall only)

Input: a chunk from `data/runs/learn-and-automate/<slug>/topics/process/chunks/<chunkId>.txt`
(doc format: `<<D docId | date | kind | Tn | likes | url>>`; `Q (@x):` = follower framing, NOT his words; `A:`/plain text = his words;
`REPOSTED from @x` = THEIR words; `[IMAGE] ...` = OCR text of an image: his words only if it is a framework/checklist he shared, set `fromMedia: true`; never quote garbled OCR as `verbatim`).
Output: JSONL at the chunk's `out` path (`topics/process/units-raw/<chunkId>.jsonl`), one unit per line. Empty file if nothing.

Extract ONLY reusable rules about HOW he finds, filters, researches, tracks and reviews ideas: screening criteria and funnels (what filters, in what order, universe), the checklist he runs before acting,
his research routine (daily/weekly/results-season cadence), which sources he reads and how (concalls, ARs, investor decks, exchange filings, screeners, scanners) and what he looks for in each,
how he keeps a watchlist or tracker and what triggers a re-look, review/journal rules, and process mistakes he warns against.
SKIP position sizing, stop-loss, portfolio allocation, pure psychology/emotion talk, jokes, bare tickers, price targets, chart rules (another topic), tool praise with no workflow, single-stock news.

```json
{
  "kind": "definition|screen_rule|checklist_item|routine|source_howto|tool_workflow|idea_funnel|review_rule|pitfall|case|monitor",
  "statement": "one generalised, self-contained sentence",
  "verbatim": "exact substring of HIS words in the FIRST docId (never the Q line)",
  "docIds": ["first docId the verbatim comes from", "other docIds saying the same (optional)"],
  "tool": "screener.in|stockscans|trendlyne|concall|annual-report|exchange-filing|excel|other|null",
  "metrics": "thresholds quoted (e.g. 'ROCE>20%') or null",
  "cadence": "daily|weekly|quarterly|event|null",
  "conditions": "when it applies, short, or null",
  "explicitness": "explicit|inferred",
  "fromMedia": false
}
```

## Hard rules (a script rejects violations)

1. `verbatim` copied EXACTLY from his words in the first docId; typos stay; key clause only (>= 3 words).
2. Tier-3 reposts: `explicitness: "inferred"`, only the repost kinds listed in `topic_keywords.json`.
3. One idea per unit; every unit needs `kind`, `statement`, `verbatim`, `docIds`.
4. One unit per doc even if the idea repeats (chronology matters later).
5. Sarcasm / unclear -> skip. Missing a weak unit is cheaper than a wrong one.
6. Do not rank, adopt or criticise. Do not add ids/dates.
