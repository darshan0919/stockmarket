# Topic extraction contract - sector & theme selection, cycles, value chain, rotation (cheap tier, recall only)

Input: a chunk from `data/runs/learn-and-automate/<slug>/topics/sector/chunks/<chunkId>.txt`
(doc format: `<<D docId | date | kind | Tn | likes | url>>`; `Q (@x):` = follower framing, NOT his words; `A:`/plain text = his words;
`REPOSTED from @x` = THEIR words; `[IMAGE] ...` = OCR text of an image: his words only if it is a framework/checklist he shared, set `fromMedia: true`; never quote garbled OCR as `verbatim`).
Output: JSONL at the chunk's `out` path (`topics/sector/units-raw/<chunkId>.jsonl`), one unit per line. Empty file if nothing.

Extract ONLY reusable rules about HOW he picks and judges sectors/themes: tests for a tailwind vs headwind, structural vs transient, cycle phase (early/mid/late, trough/peak) and the data he reads for it,
value-chain reasoning (who benefits second-order, bottlenecks, proxies, pricing power, capacity/utilisation, market share, TAM), sector rotation rules (how many sectors, when to leave, how to follow money),
how a sector story turns into stock choices (leaders vs laggards, ranking inside a sector), and pitfalls (hype without orders, peak margins, cycle-late entries).
SKIP position sizing, stop-loss, portfolio allocation, psychology, jokes, bare tickers, price targets, pure chart rules (another topic), macro-level liquidity/rates (another topic), single-stock news with no sector logic.
A named sector as the example of a rule is fine; "X is a good sector" with no reason is not a unit.

```json
{
  "kind": "selection_rule|rotation_rule|cycle_phase|value_chain_link|beneficiary|tailwind_test|headwind_test|pitfall|checklist_item|definition|case|monitor",
  "statement": "one generalised, self-contained sentence",
  "verbatim": "exact substring of HIS words in the FIRST docId (never the Q line)",
  "docIds": ["first docId the verbatim comes from", "other docIds saying the same (optional)"],
  "sector": "sector/theme/industry named or null",
  "cyclePhase": "early|mid|late|trough|peak|structural|transient|n/a",
  "indicator": "data series or evidence he watches (e.g. 'monthly OEM sales', 'order book') or null",
  "metrics": "numbers/thresholds quoted or null",
  "horizon": "time frame quoted or null",
  "conditions": "when it applies, short, or null",
  "explicitness": "explicit|inferred",
  "fromMedia": false
}
```

## Hard rules (a script rejects violations)

1. `verbatim` copied EXACTLY from his words in the first docId; typos stay; key clause only (>= 3 words).
2. Tier-3 reposts: `explicitness: "inferred"`, kinds `case`, `beneficiary` only.
3. One idea per unit; every unit needs `kind`, `statement`, `verbatim`, `docIds`.
4. One unit per doc even if the idea repeats (chronology matters later).
5. Sarcasm / unclear -> skip. Missing a weak unit is cheaper than a wrong one.
6. Do not rank, adopt or criticise. Do not add ids/dates.
