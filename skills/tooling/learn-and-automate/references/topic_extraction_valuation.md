# Topic extraction contract - valuation, earnings horizon & 'priced in' (cheap tier, recall only)

Input: a chunk from `data/runs/learn-and-automate/<slug>/topics/valuation/chunks/<chunkId>.txt`
(doc format: `<<D docId | date | kind | Tn | likes | url>>`; `Q (@x):` = follower framing, NOT his words; `A:`/plain text = his words;
`REPOSTED from @x` = THEIR words; `[IMAGE] ...` = OCR text of an image: his words only if it is a framework/checklist he shared, set `fromMedia: true`; never quote garbled OCR as `verbatim`).
Output: JSONL at the chunk's `out` path (`topics/valuation/units-raw/<chunkId>.jsonl`), one unit per line. Empty file if nothing.

Extract ONLY reusable rules about HOW he judges valuation: multiples he uses and the ranges he considers cheap/expensive (by sector or growth profile),
tests for whether news/growth is already priced in (expectations vs delivery, price run-up before the event, consensus, sentiment), the earnings horizon he underwrites
(2-3 year visibility, forward EPS growth vs multiple, peak vs normalised margins), re-rating/de-rating mechanics (what moves the multiple), sector-specific valuation KPIs (mcap per capacity/order/AUM etc.), SOTP logic, and valuation pitfalls (cheap for a reason, peak-earnings PE, value traps).
SKIP position sizing, stop-loss, portfolio allocation, psychology, jokes, bare tickers, price targets with no reasoning, pure chart rules, macro rules (other topics), single-stock opinion with no reusable test.
"Stock X at PE 20 is cheap" with no why is not a unit; "capex-heavy cycle names deserve lower PE at peak margins" is.

```json
{
  "kind": "definition|valuation_rule|multiple_range|priced_in_test|horizon_rule|earnings_visibility|rerating_derating|sector_kpi|pitfall|case|checklist_item|monitor",
  "statement": "one generalised, self-contained sentence",
  "verbatim": "exact substring of HIS words in the FIRST docId (never the Q line)",
  "docIds": ["first docId the verbatim comes from", "other docIds saying the same (optional)"],
  "metric": "PE|EV/EBITDA|PEG|P/B|P/S|mcap-to-X|earnings-yield|other|null",
  "sectors": "sectors named or null",
  "metrics": "numbers/thresholds quoted or null",
  "horizon": "time frame quoted or null",
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
