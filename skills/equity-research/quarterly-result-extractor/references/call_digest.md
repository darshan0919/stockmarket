# Concall digest — the once-per-transcript reading

A `concall-digest` is the frontier-model reading of ONE earnings call, done once and reused by
every later history pack (and by `quarterly-result-analysis`, `pead-predictor` and
`growth-predictor` through the pack). It holds the four history inputs Darshan classified as
**Mission-Critical Alpha** (grill-skill review, 2026-10-22): prior guidance, tone/topic
baseline, one-off excuses, catalysts disclosed. Because one digest feeds four quarters of
analysis, an error here propagates — run it on a frontier model and quote exactly.

Script side (zero LLM): `prepare_call_digests.js` lists pending transcripts and writes their
full text; `save_call_digest.js` validates the shape, checks every `quote` verbatim against the
transcript (verifyExtract L1) and refuses to save on any miss.

## Output schema (write to `<out-dir>/<YYYYMM>_digest.json`)

```json
{
  "tone": { "label": "confident", "quote": "<verbatim>", "rationale": "<one line>" },
  "guidance": [
    {
      "metric": "Revenue growth",
      "metric_category": "revenue",
      "period_guided": "FY27",
      "relative_pct": 20,
      "absolute_value": null,
      "absolute_unit": null,
      "milestone": false,
      "display": "~20% YoY",
      "conditional": false,
      "quote": "<verbatim>"
    }
  ],
  "topics": [
    { "topic": "Export scale-up", "keywords": ["export", "us market"], "quote": "<verbatim>" }
  ],
  "oneOffs": [
    { "costHead": "power", "quantifiedCr": 12, "quarterAffected": "Q1FY27", "quote": "<verbatim>" }
  ],
  "catalysts": [
    {
      "letter": "CAPEX",
      "title": "Dahej plant phase 2",
      "number": "Rs 400 Cr, 50 ktpa",
      "timeline": "Q4FY27",
      "quote": "<verbatim>"
    }
  ]
}
```

Arrays may be empty (`[]`), never omitted.

## How to read the call

1. **Tone** — one of `aggressive · confident · cautious · defensive · opportunistic ·
conservative`, judged per
   [`quarterly-result-analysis/references/tone_taxonomy.md`](../../quarterly-result-analysis/references/tone_taxonomy.md).
   One verbatim quote that best carries the label. `conservative` only with evidence of
   deliberate sandbagging in this call ("we are guiding below the order book").
2. **Guidance** — every forward number or dated milestone management commits to (revenue,
   margin, volume, capacity, utilisation, order book/inflow, capex, debt, WC days, ROCE, tax
   rate, segment targets, plant commissioning). Same item schema as `forward-guidance-extractor`
   (`relative_pct` for growth, `absolute_value` + `absolute_unit` for levels/ratios,
   `milestone: true` for dated events with no number). `period_guided` uses FY/H/Q labels
   (`FY27`, `H2FY27`, `Q3FY27`) or a month (`June 2027`). Mark `conditional: true` when hedged
   ("subject to", "if demand sustains"). Analyst guesses that management did not endorse are
   not guidance.
3. **Topics** — the 5-12 themes management spent time on, each with 1-4 lowercase keywords that
   would appear in a later call if the theme were still alive (`possiblyDropped` diffs on these
   keywords, so pick distinctive words: `"dahej"`, not `"plant"`).
4. **One-offs** — every cost, margin hit or miss management attributed to a temporary cause
   (power, water, freight, FX, shutdown, RM spike, inventory loss, "exceptional"). Record the
   cost head and the amount if stated. This is the evidence base for the One-Off Recurrence
   Audit (2 of 4 quarters ⇒ `RECURRENT OPERATIONAL DRAG`), so do not skip small ones.
5. **Catalysts** — every C-A-T-A-L-Y-S-T trigger disclosed or re-stated on the call
   (`CAPEX · ACQUISITION · TURNAROUND · APPROVALS · LARGE_ORDERS · YEAR_ZERO · SWITCH · THEME`,
   per `rerating-catalysts/references/growth_catalyst_framework.md` §4), with its number and
   timeline when given. Next quarter's `isNew` judgment diffs against this list.

## Quote rules (enforced by `save_call_digest.js`)

- Copy quotes verbatim from the staged transcript text — whitespace and curly quotes are
  normalised, nothing else is. Do not paraphrase, merge sentences or fix grammar.
- Keep quotes short (one or two sentences) — long quotes fail on PDF line-break artefacts.
- Exit 3 lists the failing quotes: fix those quotes, never drop the item to make it pass.

## Save

```bash
yarn quarterly-result-extractor:save-digest --companyId <id> --quarter <YYYYMM> \
  --digest <out-dir>/<YYYYMM>_digest.json --model <exact model id>
```

`--model` is mandatory (`modelUsed`, conventions §24). Run digests on the frontier tier; a
cheap-tier session should leave them pending (the pack lists them) rather than write them.
