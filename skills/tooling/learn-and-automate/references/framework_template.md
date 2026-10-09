# Framework & automation records (Phase 7-9)

A framework is a **question checklist with answer rules**, derived ONLY from units Darshan adopted or
adapted. Draft it from the module's answered L1/L5/L8/L9/L10 questions — they already hold the
thresholds, data sources and actions.

## kb-framework

```json
{
  "id": "kbf_x-sureshkbn_low-float-gate",
  "type": "kb-framework",
  "sourceKey": "x:sureshkbn",
  "name": "Low-float verification gate",
  "topic": "liquidity-float",
  "derivedFrom": ["kbu_…", "kbu_…"],
  "trigger": "A watchlist/scan candidate with free float below threshold",
  "inputs": [{ "field": "free float %", "source": "Stockscans shareholding" }],
  "checks": [
    {
      "question": "Is free float < 15%?",
      "type": "deterministic",
      "dataSource": "Stockscans shareholding",
      "passRule": "flag if < 15"
    },
    {
      "question": "Do we have concalls/PPT or a plant visit?",
      "type": "judgment",
      "dataSource": "Stockscans documents",
      "passRule": "else avoid"
    }
  ],
  "action": "Avoid unless verified; if held, pre-define exit before entry",
  "cadence": "on-candidate",
  "validation": { "metric": "drawdown of flagged vs unflagged names", "period": "6m" },
  "platformReuse": { "checked": true, "native": "Stockscans shareholding scan filter" },
  "modelUsed": "<model>"
}
```

Rules: every check is typed `deterministic` (→ script/scan) or `judgment` (→ skill prompt); every
threshold cites the question/answer it came from; check platform-reuse-first (conventions §26) before
proposing any new code.

## kb-automation (one per proposed change; Darshan approves at gate G4)

```json
{
  "id": "kba_x-sureshkbn_low-float-gate_watchlist-sync",
  "type": "kb-automation",
  "sourceKey": "x:sureshkbn",
  "frameworkId": "kbf_…",
  "bucket": "enhance-skill | new-skill | new-routine",
  "target": "watchlist-sync | <new-skill-name> | daily|weekly|quarterly routine",
  "change": "<one paragraph: what changes and why>",
  "approval": "proposed | approved | rejected | applied",
  "appliedFiles": []
}
```

`lna map --file frameworks.jsonl` returns candidate skills/jobs by keyword overlap — a starting list,
not a decision. Apply approved items only: existing skills → edit the repo SKILL.md (cite `kbf_` ids);
new skills → `skill-manager`; routines/jobs → `cowork-task-architect` (script-first). Then patch the
automation record to `approval: applied` with `appliedFiles`.
