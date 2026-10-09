# Topic extraction contract — Filings, announcements & disclosures (cheap tier, recall only)

Input: a chunk from `data/runs/learn-and-automate/<slug>/topics/filings/chunks/<chunkId>.txt`
(same doc format as `recall_extraction.md`: `<<D docId | date | kind | Tn | likes | url>>`, `Q (@x):` = follower
framing (NOT his words), `A:` / plain text = his words; `REPOSTED from @x` = THEIR words).
Output: JSONL at the chunk's `out` path (`topics/filings/units-raw/<chunkId>.jsonl`), one unit per line. Empty file if nothing.

Extract ONLY ideas about **corporate filings and announcements** (exchange disclosures, order wins, fundraises/dilution,
preferential/QIP/warrants, buybacks, demerger/merger/acquisition, SAST/bulk/block deals, promoter buying/pledge, investor
presentations, annual reports, DRHP/IPO docs, credit ratings, auditor/KMP changes, capex announcements): how to read them,
which are signal vs noise, what is NEW vs already known/priced in, red flags, where to find them, how to verify, and what to
do after one. Skip generic trading talk, jokes, bare tickers.

```json
{
  "kind": "definition|filing_signal|trigger_read|red_flag|source_howto|expectation|timing|case|pitfall|checklist_item|entry_exit|monitor",
  "statement": "one generalised, self-contained sentence (imperative/declarative)",
  "verbatim": "exact substring of HIS words in the FIRST docId (never the Q line)",
  "docIds": ["first docId the verbatim comes from", "other docIds saying the same (optional)"],
  "filingType": "order|fundraise|buyback|corporate-action|deal|promoter|presentation|annual-report|ipo|rating|management-change|capex|result|other|n/a",
  "stage": "rumour|announced|executed|reflected-in-results|n/a",
  "company": "ticker or name if the unit is about one stock, else null",
  "metrics": "numbers/thresholds quoted (e.g. 'order = 40% of revenue', 'dilution 5%') or null",
  "horizon": "time frame quoted or null",
  "conditions": "when it applies / the Q framing, short, or null",
  "explicitness": "explicit|inferred",
  "fromMedia": false
}
```

Kinds: **definition** what a filing type means · **filing_signal** how to judge a filing's significance (size vs revenue, counterparty,
margin, terms) · **trigger_read** how a filing becomes a re-rating/earnings trigger · **red_flag** warning signs in filings
(dilution, pledge, related-party, auditor exit) · **source_howto** where/how to find, scan or verify filings (platforms, keywords,
alerts) · **expectation** new vs known, already priced in, market reaction to the filing · **timing** when it flows into
earnings / how long till impact · **case** a named stock filing with the lesson · **pitfall** how announcement-chasing fails ·
**checklist_item** a question to ask on reading a filing · **entry_exit** buy/add/trim/exit on a filing · **monitor** what to track next.

## Hard rules (a script rejects violations)

1. `verbatim` copied EXACTLY from his words in the first docId; typos stay. Keep it to the key clause (≥ 3 words).
2. For tier-3 reposts (`REPOSTED from`), set `explicitness: "inferred"` and use kind `case`, `filing_signal` or `expectation` only.
3. One idea per unit; every unit needs `kind`, `statement`, `verbatim`, `docIds`.
4. Chronology matters later (newest view wins), so never merge across docs — emit one unit per doc even if the idea repeats.
5. Sarcasm / unclear → skip. Missing a weak unit is cheaper than a wrong one.
6. Do not rank, adopt or criticise. Do not add ids/dates (the script adds them).
