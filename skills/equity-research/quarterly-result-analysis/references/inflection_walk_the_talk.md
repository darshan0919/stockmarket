# Inflection Point · Walk the Talk · Next Inflection

Three result-day questions, answered with a script/agent split. The script
(`stock-api/src/analyzers/resultInflection.js`) does the period maths, the actual
look-ups, the tolerance scoring, the verdict rules and the sorting. You do only what a
script can't: fill in actuals that aren't in the headline numbers, decide which
strategic items are genuinely **new**, and name the forward triggers.

```bash
# 1. Prepare (already part of Phase 1 — read context.inflectionPrep)
yarn workspace @stock/api quarterly-result-analysis --companyId NSE:X [--date YYYY-MM-DD] --prepare

# 2. Score (after you write the agent-input JSON below to the session scratchpad)
yarn workspace @stock/api quarterly-result-analysis --companyId NSE:X [--date YYYY-MM-DD] \
  --score-inflection <scratchpad>/NSE_X_inflection_input.json
# → { walkTheTalk, inflectionPoint, nextInflection } — paste these into the Phase 2.5 DTO as-is
```

Agent-input JSON:

```json
{
  "walkTheTalkLedger": ["...context.inflectionPrep.walkTheTalkLedger with actuals filled..."],
  "newCatalysts": [
    {
      "letter": "C",
      "title": "...",
      "number": "₹150 Cr capex, +190% capacity",
      "timeline": "Q3FY27",
      "conviction": "HIGH CONVICTION",
      "isNew": true,
      "source": "concall p1"
    }
  ],
  "nextTriggers": [
    {
      "type": "CAPACITY",
      "what": "...",
      "expectedBy": "Q3FY27",
      "conviction": "HIGH",
      "magnitude": {
        "currentCapacity": 12000,
        "addedCapacity": 23000,
        "capacityUnit": "MVA",
        "capexCr": 150,
        "assetTurn": 1.5
      },
      "source": "concall p1",
      "quote": "..."
    }
  ],
  "marginLegOverride": null
}
```

---

## 1. Walk the Talk — every measurable guide, not just sales and profit

**Source of prior guidance (tiered, script-collected).** `forward-guidance` DTOs and
earlier `quarterly-result` DTOs' `guidanceTable` whose quarter is strictly before this
one. The newest statement of a metric+period wins; an older different value is kept as
`revision: RAISED|CUT` — a raised guide is a signal in its own right.

**Measurability (script).** `FINAL` = due this quarter (a Q guide for this quarter, H1 at
Q2, FY at Q4). `INTERIM` = an in-flight FY/H guide or a standing guide ("WC days ~125") —
scored `AHEAD / ON_TRACK / BEHIND`, never `MET/MISSED`. `OVERDUE` = due earlier: numeric rows
are `EXPIRED` (judged in their own quarter), milestones still get scored (was the plant
commissioned or not?). `NOT_YET` = later FY, listed but excluded.

**Your job on the ledger:**

1. Rows with `actual: null` and `measurability` ≠ `NOT_YET`: fill `actual` (a number in
   the row's `unit`) and `actualBasis` (where it came from — page-anchored excerpt) from
   `kpiExcerpts`, `strategicExcerpts`, `toneExcerpts` or the result filing. This is where
   capacity, utilisation, order book, order inflow, ROCE, NIM, credit cost, WC days, debt,
   capex spent, volume, export share, segment growth get measured. Never estimate — if the
   quarter did not disclose it, leave `actual: null` (`NEEDS_ACTUAL` is a finding: management
   guided a metric and then stopped reporting it).
2. Milestone rows (`kind: "milestone"`, e.g. "plant commissioning by Q2"): set
   `milestoneOutcome` to `DELIVERED` / `DELAYED` / `PENDING` / `WITHDRAWN` with the quote.
3. Auto-filled rows (`actualSource: "auto:headlineFinancials"`): for an `INTERIM` FY growth
   guide the actual is the quarter's YoY as a run-rate proxy. If H1/9M YTD growth is
   disclosed, overwrite `actual` with it and change `actualBasis` — seasonality makes one
   quarter a weak proxy.
4. Bad rows: two contradictory guides for the same metric+period from one source (e.g.
   blended vs segment margin), a misread period, or a row that is not actually a guide —
   set `exclude: true` + `excludeReason`. Do not delete rows.

**Scoring (script).** Tolerances follow
`management-credibility-tracker/references/credibility_framework.md`: MET = within 10% of
the guided floor; BEAT = above the ceiling by ≥5% (growth/level) or ≥50 bps (margin/ratio);
direction inverts for lower-is-better metrics (credit cost, cost-to-income, NPA, WC days,
debt, tax rate). Verdict: `CONFIRMED_AND_BEAT` (no misses, ≥1 beat) · `DELIVERED` (no misses)
· `MIXED` · `MISSED` · `INSUFFICIENT_DATA`. `consecutiveCleanQuarters` chains through prior
`quarterly-result` DTOs.

**Prior guidance comes from the history pack, never from a runtime transcript read.** The
ledger is built from the pack's `priorGuidance`: `forward-guidance` DTOs, earlier
`quarterly-result` guidance tables, and the verified `concall-digest` guidance of every prior
call that has no forward-guidance DTO (`sourceType: concall-digest`). **When `INSUFFICIENT_DATA`
because nothing prior is on file**, the cause is a missing or incomplete pack
(`historyPackMissing` / `digestCoverage.pending`): run `quarterly-result-extractor` Step 0 and
re-run `--prepare` (SKILL.md Phase 0 check 5) — do not read old transcripts here.

Feeds PEAD **G4** — quote `walkTheTalk.summary` there, do not re-judge it.

## 2. Inflection Point — three legs

| Leg                                  | Who decides                | PASS                                                                    | PARTIAL                                                                                   | FAIL               |
| ------------------------------------ | -------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------ |
| **Margins expanding significantly**  | script (`marginLeg`)       | EBITDA margin ≥ +200 bps YoY, QoQ ≥ 0, no inventory-gain flag           | ≥200 bps but fading QoQ or inventory-gain flagged; or +100–200 bps and rising ≥50 bps QoQ | below              |
| **Past guidance confirmed & beaten** | script, from Walk the Talk | `CONFIRMED_AND_BEAT`                                                    | `DELIVERED`, or `MIXED` with ≥75% delivery and a beat                                     | `MIXED`/`MISSED`   |
| **New C-A-T-A-L-Y-S-T trigger**      | you (`newCatalysts`)       | ≥1 `isNew` trigger with HIGH/MEDIUM conviction, a number and a timeline | new but optionality-only or missing number/timeline                                       | confirmations only |

**newCatalysts — how to judge.** Start from `inflectionPrep.catalystCandidates`
(strategic excerpts + the latest `rerating-catalysts` DTO if it is newer than the last
result). `isNew` is a diff against `historyContext.knownCatalysts` (every catalyst disclosed on
the prior calls, with the quarter it was first seen) — a candidate already there with the same
number and timeline is a confirmation; a changed number/timeline is a revision worth stating. Tag each with its C-A-T-A-L-Y-S-T letter
(`rerating-catalysts/references/growth_catalyst_framework.md` §4: **C**apex/capacity,
**A**cquisition/alliance, **T**urnaround, **A**pprovals/policy, **L**arge orders, **Y**ear-zero
new product/business, **S**witch in strategy/management, **T**heme). `isNew: true` only if it
was not in the previous quarter's disclosures (§2–3 "new vs confirmation" discipline —
a capex re-stated with the same timeline is a confirmation). `announcement-info-classifier`
answers this rigorously for a single filing if a candidate is borderline. Don't run the
full `rerating-catalysts` report from here.

**NBFC/banks:** EBITDA margin does not apply — the margin leg returns `NOT_APPLICABLE`.
Pass `marginLegOverride: {status, reason}` judged from NIM / RoA (same bars in bps).

**Verdict (script).** `INFLECTION_CONFIRMED` = margin PASS + one other PASS ·
`INFLECTION_EMERGING` = any PASS or two PARTIALs · `NO_INFLECTION`. J-curve stage:
confirmed → Stage 2, upgraded to Stage 3 when PAT > EBITDA > Revenue growth with Revenue
≥ 20% and PAT ≥ 40%; emerging without margin → Stage 1. A first-time confirmation always
adds `Q+1 CONFIRMATION PENDING`. Put `inflectionPoint.chips` into the verdict chips.

Margin PASS in a quarter with no fresh balance sheet carries
`CONDITIONAL ON H1 WORKING CAPITAL AUDIT` — the Q1/Q3 structural-cap rule still applies.

## 3. Next Inflection — when is the next step-up?

Name 1–6 dated triggers, three types only:

- `CAPACITY` — new capacity going live: `currentCapacity`, `addedCapacity`, `capacityUnit`,
  optional `capexCr` + `assetTurn` (guided or historical) for peak revenue.
- `MARGIN` — the next margin step: `currentMarginPct`, `targetMarginPct`, and in `what` the
  driver (backward integration, mix, operating leverage, price hike).
- `ORDER_BOOK` — order-book step-change: `orderBookCr`, `quarterInflowCr`, optional
  `ttmRevenueCr`, `guidedOrderBookCr`.

Seeds: `inflectionPrep.nextInflectionSeeds` (this quarter's forward-guidance capacity /
utilisation / margin / order-book rows, guidance excerpts, KPI excerpts). `expectedBy` must
be a quarter, half, FY or month-year from the source — no date, no trigger (put it in
Basket 1D as optionality instead). The script computes quarters-away, Train
(C = live now, B = ≤2 quarters, A = further / undated), the magnitude text, the nearest
trigger per type and `checklistSeeds`. Every HIGH/MEDIUM trigger becomes a monitoring
checklist row (copy `checklistSeeds`) — that is how next quarter's run tests it.

## What could be wrong (read before trusting the verdict)

- **Proxy actuals.** An FY guide judged on one quarter's YoY can flip with seasonality —
  prefer YTD when disclosed.
- **Extraction noise in prior guidance.** forward-guidance rows are LLM-extracted;
  contradictory rows from one source are usually a segment/blended mix-up → `exclude`.
- **Survivorship in the guide set.** Management drops guides it is going to miss. Compare
  against `forward-guidance` `qoq_status: dropped` and `possiblyDropped`; a quietly dropped
  guide counts against trust in the write-up even though the script cannot score it.
- **Sandbagged guides.** Beating a deliberately low guide every quarter is a pattern, not an
  inflection — say so when the guide was never raised despite repeated beats.
- **Margin from mix, not operations.** A margin PASS driven by a one-time product/segment
  mix or a commodity tailwind is CYCLICAL in Basket 1B even if the leg passes.
