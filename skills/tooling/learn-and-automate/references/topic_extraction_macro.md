# Topic extraction contract - macro, liquidity, policy & news (cheap tier, recall only)

Input: a chunk from `data/runs/learn-and-automate/<slug>/topics/macro/chunks/<chunkId>.txt`
(doc format: `<<D docId | date | kind | Tn | likes | url>>`; `Q (@x):` = follower framing, NOT his words; `A:`/plain text = his words;
`REPOSTED from @x` = THEIR words; `[IMAGE] ...` = OCR text of an image he posted: treat as his words only if it is a framework/checklist he shared,
set `fromMedia: true`; never quote garbled OCR as `verbatim`).
Output: JSONL at the chunk's `out` path (`topics/macro/units-raw/<chunkId>.jsonl`), one unit per line. Empty file if nothing.

Extract ONLY reusable rules/observations about TOP-DOWN drivers: market liquidity (FII/DII/MF/SIP flows, RBI/Fed policy, rates, yields, dollar, rupee),
macro indicators and how he reads them (inflation, crude, gold, copper, VIX, breadth, market-cap-to-GDP, earnings cycle, Nifty valuation),
policy and regulatory tailwinds/headwinds (budget, PLI, duties, tariffs, anti-dumping, GST, SEBI/RBI rules, government capex), geopolitical or news shocks and
HOW he says markets/sectors react or should be traded, transmission from a macro driver to specific sectors/stocks, and what to monitor.
SKIP position sizing, stop-loss, portfolio allocation, psychology, jokes, bare tickers, price targets, pure chart/price-action rules (another topic), single-stock news with no macro/policy link.
A dated market call ("market will fall") is a `case` with explicitness `explicit` only if he states reasoning; otherwise skip.

```json
{
  "kind": "liquidity_signal|rates_fx_signal|commodity_signal|policy_tailwind|news_reaction|regime_rule|indicator|transmission|sector_beneficiary|risk_event|definition|case|pitfall|monitor|checklist_item",
  "statement": "one generalised, self-contained sentence",
  "verbatim": "exact substring of HIS words in the FIRST docId (never the Q line)",
  "docIds": ["first docId the verbatim comes from", "other docIds saying the same (optional)"],
  "driver": "liquidity|rates|fx|inflation|crude|metals|geopolitics|policy|news|valuation|earnings-cycle|breadth|other",
  "direction": "bullish|bearish|neutral|conditional|n/a",
  "sectors": "sectors named as affected or null",
  "indicator": "metric/series to watch (e.g. 'US 10Y', 'FII net flow', 'Brent') or null",
  "metrics": "numbers/thresholds quoted or null",
  "horizon": "time frame quoted or null",
  "conditions": "when it applies, short, or null",
  "explicitness": "explicit|inferred",
  "fromMedia": false
}
```

## Hard rules (a script rejects violations)

1. `verbatim` copied EXACTLY from his words in the first docId; typos stay; key clause only (>= 3 words).
2. Tier-3 reposts: `explicitness: "inferred"`, kinds `case`, `policy_tailwind`, `risk_event`, `news_reaction` only.
3. One idea per unit; every unit needs `kind`, `statement`, `verbatim`, `docIds`.
4. One unit per doc even if the idea repeats (chronology matters later).
5. Sarcasm / unclear -> skip. Missing a weak unit is cheaper than a wrong one.
6. Do not rank, adopt or criticise. Do not add ids/dates.
