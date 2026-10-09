# Topic extraction contract - technical entries, exits, market regime, sector rotation (cheap tier, recall only)

Input: a chunk from `data/runs/learn-and-automate/<slug>/topics/technical/chunks/<chunkId>.txt`
(doc format: `<<D docId | date | kind | Tn | likes | url>>`; `Q (@x):` = follower framing, NOT his words; `A:`/plain text = his words;
`REPOSTED from @x` = THEIR words; `[IMAGE] ...` = OCR text of an image he posted: treat as his words only if it is a framework/checklist he shared,
and set `fromMedia: true`; OCR is noisy, never quote garbled OCR as `verbatim`).
Output: JSONL at the chunk's `out` path (`topics/technical/units-raw/<chunkId>.jsonl`), one unit per line. Empty file if nothing.

Extract ONLY reusable rules about: how to recognise a technically buyable stock (bases, breakouts, consolidations, pullbacks, shakeouts,
gap entries, 52-week-high/ATH, IPO bases, top-gainer persistence), levels and moving averages, volume/delivery confirmation, relative strength and
sector/industry-group rotation, market regime (breadth, scan counts, follow-through, when to be aggressive or sit out), and EXIT signals
(lower highs, double/rounding tops, failed breakouts, wicks, distribution, loss of 20/50-DMA, sector RS rolling over, trailing, profit taking, thesis-based exits).
SKIP position sizing, risk-per-trade percentages, stop-loss sizing, portfolio allocation, trading psychology, jokes, bare tickers, price targets.
A structural invalidation level (e.g. "below the line on the chart") IS in scope; the sizing of the loss is not.

```json
{
  "kind": "definition|setup|entry_trigger|confirmation|exit_signal|regime_signal|sector_rotation|volume_signal|level_rule|timing|case|pitfall|checklist_item|monitor",
  "statement": "one generalised, self-contained sentence",
  "verbatim": "exact substring of HIS words in the FIRST docId (never the Q line)",
  "docIds": ["first docId the verbatim comes from", "other docIds saying the same (optional)"],
  "stage": "regime|sector|setup|entry|hold|exit|n/a",
  "triggerType": "base-breakout|pullback|gap|ipo-base|top-gainer|ma-reclaim|volume|rs|rotation|distribution|other|n/a",
  "company": "ticker or name if about one stock, else null",
  "metrics": "numbers/thresholds quoted (e.g. 'range < 5-6%', 'base >= 2 months', '50 EMA') or null",
  "horizon": "time frame quoted or null",
  "conditions": "when it applies, short, or null",
  "explicitness": "explicit|inferred",
  "fromMedia": false
}
```

## Hard rules (a script rejects violations)

1. `verbatim` copied EXACTLY from his words in the first docId; typos stay; key clause only (>= 3 words).
2. Tier-3 reposts: `explicitness: "inferred"`, kinds `case`, `setup`, `regime_signal`, `sector_rotation` only.
3. One idea per unit; every unit needs `kind`, `statement`, `verbatim`, `docIds`.
4. One unit per doc even if the idea repeats (chronology matters later).
5. Sarcasm / unclear -> skip. Missing a weak unit is cheaper than a wrong one.
6. Do not rank, adopt or criticise. Do not add ids/dates.
