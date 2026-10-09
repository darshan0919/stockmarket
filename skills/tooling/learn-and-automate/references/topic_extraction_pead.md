# Topic extraction contract — PEAD / result quality / post-result triggers / concall guidance (cheap tier, recall only)

Input: a chunk from `data/runs/learn-and-automate/<slug>/topics/pead/chunks/<chunkId>.txt`
(same doc format as `recall_extraction.md`: `<<D docId | date | kind | Tn | likes | url>>`, `Q (@x):` = follower
framing (NOT his words), `A:` / plain text = his words; `REPOSTED from @x` = THEIR words).
Output: JSONL at the chunk's `out` path (`topics/pead/units-raw/<chunkId>.jsonl`), one unit per line. Empty file if nothing.

Extract ONLY ideas about how to read and act on a **quarterly result**: Post-Earnings-Announcement Drift (PEAD) and
episodic pivots; judging result QUALITY (operating vs non-operating, base effect, margins, one-offs, cash flow); how the
stock/market reaction tells you if it was priced in; what NEW triggers appear after the result (orders, capex, guidance,
segment shifts); how to read concall guidance and management tone/credibility; Q+1 confirmation; when to enter/add/exit
around results. Skip generic trading talk, jokes, bare tickers, pure price-target chatter.

```json
{
  "kind": "definition|result_quality|reaction_signal|post_result_trigger|guidance_signal|expectation|timing|case|pitfall|checklist_item|entry_exit|monitor",
  "statement": "one generalised, self-contained sentence (imperative/declarative)",
  "verbatim": "exact substring of HIS words in the FIRST docId (never the Q line)",
  "docIds": ["first docId the verbatim comes from", "other docIds saying the same (optional)"],
  "stage": "pre-result|result-day|post-result|q+1|n/a",
  "triggerType": "orders|capacity|margin|guidance|management|policy|demand|segment|corporate-action|other|n/a",
  "company": "ticker or name if the unit is about one stock, else null",
  "metrics": "numbers/thresholds quoted (e.g. 'PAT +40%', 'margin 18%') or null",
  "horizon": "time frame quoted (e.g. 'next 2 quarters') or null",
  "conditions": "when it applies / the Q framing, short, or null",
  "explicitness": "explicit|inferred",
  "fromMedia": false
}
```

Kinds: **definition** what PEAD / EP / a good result is · **result_quality** how to judge if the print is real (operating vs
other income, base, margin, cash, one-offs) · **reaction_signal** what the price/volume reaction after results tells (gap up on
low P/E, ignored good result, sell-the-news) · **post_result_trigger** a NEW fact that appears after/with the result and
extends the story (order, capex, guidance raise) · **guidance_signal** reading concall guidance, tone, walk-the-talk ·
**expectation** what was priced in / expected vs delivered · **timing** how long drift lasts, when to act (days/quarters) ·
**case** a named stock result with the lesson · **pitfall** how result-chasing fails · **checklist_item** a question to ask
after a result · **entry_exit** buy/add/trim/exit around results · **monitor** what to track next quarter.

## Hard rules (a script rejects violations)

1. `verbatim` copied EXACTLY from his words in the first docId; typos stay. Keep it to the key clause (≥ 3 words).
2. For tier-3 reposts (`REPOSTED from`), set `explicitness: "inferred"` and use kind `case`, `reaction_signal` or `expectation` only.
3. One idea per unit; every unit needs `kind`, `statement`, `verbatim`, `docIds`.
4. Chronology matters later (newest view wins), so never merge across docs — emit one unit per doc even if the idea repeats.
5. Sarcasm / unclear → skip. Missing a weak unit is cheaper than a wrong one.
6. Do not rank, adopt or criticise. Do not add ids/dates (the script adds them).
