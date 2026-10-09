# Thesis Record Schema

## `{TICKER}_thesis.json`

```json
{
  "ticker": "NSE:XYZ",
  "company": "XYZ Ltd",
  "version": 7,
  "created": "2026-07-04",
  "updated": "2026-07-04",
  "companyId": "NSE:XYZ",
  "creationTime": "2026-01-10T09:30:00.000Z",
  "modifiedTime": "2026-07-04T11:05:00.000Z",
  "creator": "investment-thesis-engine",
  "sync_pending": false,
  "signal": "ACCUMULATE",
  "prev_signal": "HOLD",
  "conviction": 7,
  "position_bucket": "Standard",
  "pillars": {
    "theme": {
      "score": 8,
      "summary": "",
      "evidence_refs": ["e12", "e15"],
      "last_scored": "2026-07-04"
    },
    "growth": { "score": 7, "summary": "", "evidence_refs": [], "last_scored": "" },
    "valuation": { "score": 5, "summary": "", "evidence_refs": [], "last_scored": "" },
    "promoter": { "score": 8, "summary": "", "evidence_refs": [], "last_scored": "" }
  },
  "gates": {
    "forensic": { "status": "CLEAN|AMBER|RED", "source": "forensic-accounting vN, 2026-05-12" },
    "credibility": {
      "score": 2,
      "quarters": 6,
      "source": "management-credibility-tracker, 2026-06-20"
    },
    "pledge_debt": { "pledge_pct": 0, "d_e": 0.3, "lethal": false }
  },
  "technical": {
    "stage": "2",
    "cmp_vs_30wema": "above",
    "crs_vs_nifty": "outperforming",
    "as_of": "2026-07-01"
  },
  "valuation_anchor": {
    "cmp": 0,
    "pe": 0,
    "mcap_cr": 0,
    "as_of": "2026-07-04",
    "hist_pe_band": "18-42x",
    "peer_median_pe": 0,
    "base_target": 0,
    "bull_target": 0,
    "bear_target": 0,
    "base_irr_pct": 0,
    "source": "Screener.in 2026-07-04"
  },
  "triggers": [
    {
      "name": "",
      "impact": "₹X Cr / bps",
      "timeline": "H2 FY27",
      "conviction": "HIGH|MEDIUM|OPTIONALITY",
      "status": "pending|flowing|done|derailed",
      "evidence_ref": "e12"
    }
  ],
  "risks": [{ "risk": "", "severity": "HIGH|MED|LOW", "early_warning": "" }],
  "monitorables": [
    {
      "metric": "EBITDA margin",
      "threshold": ">=24%",
      "frequency": "quarterly",
      "last_check": "Q3FY26",
      "status": "PASS|BREACH|UNCHECKED"
    }
  ],
  "exit_plan": {
    "what_must_go_right": ["order inflow continues", "EBITDA margin >= 12%"],
    "price_stop": 0,
    "entry_date": "2026-07-04",
    "entry_price": 0,
    "time_stop_days": 90,
    "meaningful_move_pct": 0,
    "peak_price": 0,
    "giveback_pct": 10,
    "max_hold_days": 730,
    "horizon_override_reason": "",
    "confirmation_status": "pending|confirmed|failed"
  },
  "what_would_change_thesis": {
    "upgrade": ["contribution margin > 4% for 2 consecutive quarters"],
    "downgrade": ["2 consecutive guidance misses", "auditor resignation (instant AVOID)"]
  },
  "evidence_log": [
    {
      "id": "e12",
      "date": "2026-06-15",
      "pillar": "growth",
      "fact": "Won ₹850 Cr order from NTPC (BSE filing 14-Jun-2026), execution 18 months",
      "source": "BSE filing 14-Jun-2026",
      "tag": "R",
      "produced_by": "fundamental-shift-scanner"
    }
  ],
  "overrides": [{ "date": "", "rule": "", "action": "", "reason": "" }],
  "disclaimer": "Research aid, not investment advice."
}
```

Notes:

- `exit_plan` (added 2026-10-09 from `kbf_x-sureshkbn_exit-plan-before-entry`): written BEFORE entry. `time_stop_days` / `meaningful_move_pct` are the user's own numbers — never invent defaults. `scripts/exit_checks.js` flags `PRICE_STOP_BREACH`, `TIME_STOP_REVIEW`, `PROFIT_GIVEBACK` (share of the peak gain given back; `peak_price` = max CMP since entry, updated by the weekly review) and `HORIZON_EXCEEDED` (held > `max_hold_days`, silenced by a written `horizon_override_reason`). No numeric position sizing lives here (sizing language stays High conviction / Standard / Tracking).

- `evidence_log` is append-only; ids are stable (`e1, e2, ...`). Every pillar score must
  reference at least one evidence id. Every evidence entry carries an [R]/[D]/[E] `tag`.
- Per the [output-dto-standard](../../../tooling/output-dto-standard/SKILL.md), the
  `{TICKER}_thesis.json` object (a single-entity file — one thesis per company) carries the
  DTO envelope at the top level: `companyId` (= `ticker`, e.g. `"NSE:XYZ"`), `creationTime`
  (set once on `init`, never changed by later `update`s), `modifiedTime` (bumped on every
  `update`/`signal` write), `creator` (always `"investment-thesis-engine"`). These sit
  alongside the existing `created`/`updated` date-only fields — don't remove those, they're
  human-facing date strings used in the memo header; `creationTime`/`modifiedTime` are the
  full ISO 8601 machine timestamps the standard requires.
- `history.jsonl`: one line per version, append-only, never rewritten. Each line is its own
  record and therefore carries its own envelope: `{version, date, signal, conviction,
pillar_scores, changed_pillars, reason, evidence_added, companyId, creationTime,
modifiedTime, creator}`. `companyId` = the ticker (same value on every line for a given
  company). `creationTime` is fixed to the thesis's original `init` timestamp on every line
  (it describes when the _thesis_ was created, not when that particular line was appended).
  `modifiedTime` is unique per line — set to the timestamp of that specific append, i.e. it
  advances with each new version. `creator` is always `"investment-thesis-engine"`. Example
  line: `{"version":2,"date":"2026-07-04","signal":"ACCUMULATE","conviction":7,
"pillar_scores":{"theme":8,"growth":7,"valuation":5,"promoter":8},
"changed_pillars":["growth"],"reason":"New ₹850 Cr NTPC order, evidence e12",
"evidence_added":["e12"],"companyId":"NSE:XYZ",
"creationTime":"2026-01-10T09:30:00.000Z","modifiedTime":"2026-07-04T11:05:00.000Z",
"creator":"investment-thesis-engine"}`.

## `{TICKER}_thesis.md` layout

1. Header: company, ticker, signal badge, conviction /10, version, date, CMP/PE anchor.
2. Signal-change block (only when signal moved): old → new, rule fired, trigger evidence.
3. One-line thesis (what has structurally changed in the business, not the stock).
4. Pillar scoreboard table (score, one-line why, last scored).
5. Top triggers table (name, quantified impact, timeline, conviction, status).
6. Risks & early warnings.
7. Monitorables table with PASS/BREACH status.
8. What would change this thesis (upgrade / downgrade).
9. "What could be wrong with this analysis?" (mandatory).
10. Evidence log (dated, cited, tagged) + disclaimer.
