# Topic extraction contract — J-curve / re-rating / inflection / catalyst (cheap tier, recall only)

Input: a chunk from `data/runs/learn-and-automate/<slug>/topics/jcurve/chunks/<chunkId>.txt`
(same doc format as `recall_extraction.md`: `<<D docId | date | kind | Tn | likes | url>>`, `Q (@x):` = follower
framing (NOT his words), `A:` / plain text = his words; `REPOSTED from @x` = THEIR words).
Output: JSONL at the chunk's `out` path (`topics/jcurve/units-raw/<chunkId>.jsonl`), one unit per line. Empty file if nothing.

Extract ONLY ideas about how an earnings/price **inflection** works: the J-curve shape (loss/low-profit
→ ramp → profit/EPS jump), what triggers it, how the market re-rates it, how to spot it early, how
long it takes, how to size/enter/exit, and what makes it fail. Skip generic trading talk, jokes, bare tickers.

```json
{
  "kind": "definition|stage_signal|trigger|metric|rerating_mechanic|timing|case|pitfall|checklist_item|entry_exit|monitor",
  "statement": "one generalised, self-contained sentence (imperative/declarative)",
  "verbatim": "exact substring of HIS words in the FIRST docId (never the Q line)",
  "docIds": ["first docId the verbatim comes from", "other docIds saying the same (optional)"],
  "stage": "pre|early|inflection|acceleration|mature|failed|n/a",
  "triggerType": "capacity|order-book|new-product|margin|deleveraging|turnaround|management|corporate-action|policy|demand|other|n/a",
  "company": "ticker or name if the unit is about one stock, else null",
  "metrics": "numbers/thresholds quoted (e.g. 'EBITDA margin 5-6%', 'FY28 EPS', '35-45x P/E') or null",
  "horizon": "time frame quoted (e.g. 'FY27-FY29', '12-18 months') or null",
  "conditions": "when it applies / the Q framing, short, or null",
  "explicitness": "explicit|inferred",
  "fromMedia": false
}
```

Kinds: **definition** what a J-curve / inflection / re-rating is · **stage_signal** how to tell which phase a company is in ·
**trigger** what starts it · **metric** a number or threshold that matters · **rerating_mechanic** why/when the multiple changes
(e.g. market prices FY28 early) · **timing** how long / which year · **case** a named stock with its stage and reason (the reason is
the learning) · **pitfall** how it fails / false J-curve / trap · **checklist_item** a question to ask · **entry_exit** when to
buy/add/trim/exit within a J-curve · **monitor** what to track next quarter.

## Hard rules (a script rejects violations)

1. `verbatim` copied EXACTLY from his words in the first docId; typos stay. Keep it to the key clause (≥ 3 words).
2. For tier-3 reposts (`REPOSTED from`), set `explicitness: "inferred"` and use kind `case`, `metric` or `rerating_mechanic` only.
3. One idea per unit; every unit needs `kind`, `statement`, `verbatim`, `docIds`.
4. Chronology matters later (newest view wins), so never merge across docs — emit one unit per doc even if the idea repeats.
5. Sarcasm / unclear → skip. Missing a weak unit is cheaper than a wrong one.
6. Do not rank, adopt or criticise. Do not add ids/dates (the script adds them).
