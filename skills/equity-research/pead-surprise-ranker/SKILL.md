---
name: pead-surprise-ranker
description: >
  Stage 3 (final, optional) of the guidance/PEAD pipeline: turns a batch of
  forward-guidance report DTOs (from forward-guidance-extractor, Stage 2 of
  the now-2-skill pipeline, itself fed by guidance-document-extractor) into
  a ranked PEAD (post-earnings-announcement-drift) surprise screen. Only run
  when the user explicitly asks for a ranking -- most often chained
  automatically from forward-guidance-extractor's optional Phase 6, never
  invoked by default. Identifies which
  companies have the best near-term (ideally Q1/quarter-specific, else
  FY-specific) revenue and EBITDA-margin visibility, factoring in guided
  margin expansion/operating leverage and any disclosed PAT lever (cost
  program, deleverage, utilisation ramp), with sector-specific modelling
  where direct P&L guidance is thin (finance: AUM x NIM; volume/commodity
  businesses: volume x EBITDA-per-unit). This is the REASONING half of the
  pipeline -- it reads guidance DTOs an earlier stage already extracted and
  makes the judgment calls (visibility tier, margin direction, PAT-lever
  type, evidence strength) that a cheap extraction model should NOT be
  trusted with; run it on the flagship model. Use when the user wants to
  rank pre-results companies by likely EPS surprise, asks "who might beat
  this quarter", "best PEAD bets", "rank these by earnings surprise
  potential", "which of these has the best visibility into next quarter", or
  wants a ranked table/workbook from a set of guidance
  extractions. Always tags every input [guided]/[estimate]/[assumption] and
  states explicit assumptions per company -- never silently invents a number
  to fill a modelling gap.
---

# PEAD Surprise Ranker

The reasoning half of a two-skill pipeline. `forward-guidance-extractor`
(transcript) and `guidance-ppt-fallback` (PPT, cheap-model) do the mechanical
extraction: read a primary document, pull out explicit numbers, save them as
`forward-guidance` DTOs. Neither of those skills makes a judgment call about
which company is MORE likely to beat -- that comparative, cross-company
reasoning is what this skill exists for, and it is exactly the kind of task
that should stay on the flagship model: it requires weighing tier vs. margin
story vs. evidence quality vs. sector context all at once, in a way a shallow
extraction pass cannot reliably approximate.

Follow [`skills/_shared/conventions.md`](../../_shared/conventions.md) — §3
(persistence via `db.js`, `save_pead_ranking.js` is the only write path for
this DTO type), §8 (context-first — this skill's `contextUsed` is the list of
`forward-guidance` report ids it read, not a generic company-history pull),
§9 (files-touched manifest), §11 (token-optimization suggestion).

## The framework (what the user is actually asking for)

For each company, near-term EPS-surprise visibility ranks in this priority
order — always use the BEST available, never skip straight to a weaker proxy
if a stronger one exists:

1. **Direct quarter-specific guidance** (e.g. "Q1FY27 revenue run-rate of
   ₹X-Y cr") — rare, but the single best signal when present.
2. **FY-specific revenue AND margin/absolute-EBITDA guidance** — the most
   common tier; a company that guided BOTH a growth number and a margin
   number is more actionable than one that guided only one of the two.
3. **Sector-specific unit-economics model** when direct P&L guidance is thin
   but management gave the RAW INPUTS a sector model needs:
   - **Finance/NBFC/Bank:** Revenue (NII) ≈ AUM × NIM. Use guided AUM growth
     and guided NIM (or credit-cost target as a PAT-side lever) — never
     invent an AUM or NIM figure management didn't state.
   - **Volume/commodity/unit-economics businesses (gas distribution, mining,
     cement, chemicals, engineering with per-unit metrics):** Revenue/EBITDA
     ≈ Volume × realised-price-or-EBITDA-per-unit. Use guided volume AND a
     guided per-unit economic (₹/SCM, EBITDA/tonne, etc.) if both exist. If
     only volume is guided and price/realisation is NOT, do not invent a
     price assumption from external sources — flag the company as
     "volume-visible, price-blind" and say explicitly what external input
     WOULD be needed (without fetching or assuming it yourself unless the
     user asks for that follow-up explicitly).
4. **No usable visibility** — no transcript, no PPT, or management explicitly
   declined to guide. These companies go in the "No Visibility (Excluded)"
   sheet, not the ranked table. Never backfill a Tier-4 company with a made-up
   number derived from historical CSV momentum (Revenue Growth TTM etc.) and
   present it as if it were forward visibility — if the user's source data
   (e.g. a watchlist CSV) has those historical columns, they may be shown as
   a clearly-labelled "base fundamentals, not a forecast" footnote only.

**Margin expansion / operating leverage is weighted explicitly, not folded
into the revenue number.** A company guiding modest revenue growth but a
disclosed +100-400bps margin improvement (with a stated FY-base and FY-target,
not just "margins will improve") is a materially different — often better —
surprise setup than one guiding fast revenue with no margin colour at all.
Likewise a PAT lever independent of revenue/margin (a quantified cost-saving
program, a stated path to debt-zero, utilisation ramp on already-commissioned
capacity) is real, bankable upside the market may be under-pricing — surface
it as its own scored component, not buried inside a revenue estimate.

**Show the maths, tag every input.** Every number in the output must be
traceable to either a direct quote `[guided]` or an explicitly-labelled
`[estimate]` (your own arithmetic over two guided inputs, e.g. Volume ×
EBITDA/unit) or `[assumption]` (something you had to infer because management
didn't state it explicitly — always name what the assumption is). Never
present your own estimate as if it were management's number.

## Step 1 — Read guidance DTOs and annotate (LLM reasoning, one company at a time)

Input: a list of tickers (or "every company that has a `forward-guidance`
report for quarter Q") plus, for context, the same batch's underlying source
data if the user supplied it (e.g. a watchlist CSV with sector/industry
columns).

```bash
node -e "
const db = require('/absolute/path/to/stockmarket/packages/jobs-runtime/lib/db.js');
const slim = db.find('reports', { type: 'forward-guidance' });
for (const r of slim) {
  const full = db.readReport(r.id);
  if (full.quarter === '<QUARTER>') console.log(JSON.stringify(full));
}
" > /tmp/guidance_dtos.jsonl
```

For each company's DTO (its `guidance` array of extracted items), read every
item's `quote`/`display`/`period_guided` and produce ONE annotation object —
this is the reasoning step, do it per-company, don't try to hold the whole
batch in one pass the way forward-guidance-extractor's Phase 2 warns against
for the same reason (cross-company hallucination risk at scale):

```json
{
  "ticker": "NSE:X",
  "name": "Company Name",
  "sector": "Auto Ancillary",
  "tier": 2,
  "rev_guided": "+15-20% FY27",
  "inorganic_flag": false,
  "margin_guided": "EBITDA margin +100bps FY27 (management '90%+ confident')",
  "margin_dir": "expansion",
  "pat_lever": "opex_leverage",
  "evidence": "medium-high",
  "thesis": "One or two sentences: why this setup could beat, citing the strongest evidence (order book coverage, capacity commissioning, a quantified cost lever).",
  "assumptions": [
    "Any gap you had to work around, stated explicitly, e.g. 'FY26 base margin not given, expansion direction confirmed but bps delta not computable'"
  ]
}
```

Field vocabulary (the scoring script in Step 2 only recognises these):

- `tier`: `1` (quarter-specific) / `2` (FY-specific) / `3` (sector-model or
  partial guidance) / `4` (no usable guidance — but if truly Tier 4, put the
  company in the excluded list instead of annotating it here).
- `margin_dir`: `expansion` / `sandbag` (management flags own guide as
  conservative) / `leverage_signal` (operating-leverage language/evidence
  without a quantified margin number) / `flat` / `declined` / `unclear`.
- `pat_lever`: `cost_program_direct` / `deleverage_direct` / `opex_leverage` /
  `volume_leverage` / `deleverage_signal` / `cash_turn_positive` /
  `capex_ramp` (near-term DRAG, scored negative) / `none_stated`.
- `evidence`: `very_high` / `high` / `medium-high` / `medium` / `low-medium` /
  `low` — order-book coverage, commissioned-capacity utilisation trajectory,
  a stated base number to compute a delta from, vs. tone-only claims.

Write all annotations to `/tmp/pead_annotations.json` (array), and a separate
`/tmp/pead_excluded.json` array of `{ticker, reason, note}` for genuine Tier-4
names (no transcript AND no PPT guidance, or management explicitly declined —
`note` may carry a clearly-labelled historical-fundamentals footnote if the
user's source data had one, but never present it as a forecast).

## Step 2 — Score (script, no LLM)

```bash
python3 skills/equity-research/pead-surprise-ranker/scripts/compute_pead_score.py \
  --in /tmp/pead_annotations.json --out /tmp/pead_ranked.json
```

Deterministic composite (0-100, sorting aid only — the reader should always
be pointed to the thesis/assumptions columns, not asked to trust the number
blind): visibility tier (0-40) + margin direction (0-25) + PAT lever (-5 to
+18) + revenue-growth magnitude (0-17, halved if `inorganic_flag`) + evidence
strength (0-15). Read the script's docstring for the exact rule table before
explaining it to the user — don't restate it from memory, it's fixed there.

**Known limitation to call out to the user every run:** a company with the
single best near-term (quarter-specific) visibility can still score mid-table
if its guided figure is in absolute currency terms rather than a %% (the
revenue-growth-magnitude component can't parse it) — spot-check the Tier-1
company specifically and flag this explicitly if it happens, don't let the
mechanical score silently misrank the best-evidenced name.

## Step 3 — Methodology & caveats text (LLM, once per run)

Write a plain-text file (one line per row) covering: universe size, how many
had guidance vs. were excluded, the scoring rule summary, any sector models
applied (name which companies, what inputs were used, what was NOT available
and therefore not modelled), and a **self-audit** — per `conventions.md`
"what could be wrong with this" is not optional here:

- How stale is the guidance relative to today (a Q4 concall read months after
  the call missed intervening events)?
- Does this ranking include street/consensus estimates or historical
  post-event drift? (By default, no — this is a guidance-visibility screen
  only. If the user wants the full street-vs-guidance surprise scoring and
  drift analysis, that's `pre-pead-scanner`, a heavier sibling skill — say so
  rather than silently doing a partial version of it.)
- Any headline number that's inflated by something other than organic
  performance (M&A, one-offs) — restate it here even if already flagged in
  Step 1, so it's visible without reading every row.
- Which high scorers rely on a bps-margin calculation where the base figure
  wasn't independently re-confirmed against an actual Result filing.

Save to `/tmp/pead_methodology.txt`.

## Step 4 — Build the workbook (script, no LLM)

```bash
python3 skills/equity-research/pead-surprise-ranker/scripts/build_pead_workbook.py \
  --ranked /tmp/pead_ranked.json \
  --excluded /tmp/pead_excluded.json \
  --methodology /tmp/pead_methodology.txt \
  --out /tmp/PEAD_Ranking_<batch>_<date>.xlsx \
  --guidance-dtos /tmp/pead_guidance_dtos.json
```

Produces three sheets: **PEAD Ranking**, **No Visibility (Excluded)**,
**Methodology & Caveats**. This is a pure template render of the JSON from
Steps 1-3 — never hand-edit the xlsx or add a row that isn't in the source
JSON.

**Always pass `--guidance-dtos`** (added 2026-08-09) when this run was chained
from `forward-guidance-extractor` — assemble `/tmp/pead_guidance_dtos.json` as
the array of full `forward-guidance` DTOs read in Step 1 (the same objects
`db.readReport(id)` returned; `[{...db.readReport(r.id)} for r in fg_reports]`).
With it, the workbook gains a 4th tab, **"Forward Guidance"** — built by
reusing `forward-guidance-extractor`'s own `build_guidance_sheet()`, so it's
byte-identical in structure to that skill's standalone output. **"PEAD
Ranking" itself always stays one row per company** — an earlier version of
this flag exploded it to one row per guidance metric (company columns
repeated down every row), which read as duplicate company rows and was
reverted the same day after user feedback; don't reintroduce that shape. The
one-sheet-only ask is satisfied by putting Forward Guidance a tab away in the
SAME FILE, not by merging the two tables into one. Omit the flag and the
workbook is just the original three sheets (PEAD Ranking / No Visibility /
Methodology).

## Step 5 — Persist + finish

```bash
node skills/equity-research/pead-surprise-ranker/scripts/save_pead_ranking.js \
  --date <today YYYY-MM-DD> --batch-name "<name>" \
  --ranked-file /tmp/pead_ranked.json --excluded-file /tmp/pead_excluded.json \
  --guidance-report-ids <comma-separated ids read in Step 1> \
  --xlsx-path /tmp/PEAD_Ranking_<batch>_<date>.xlsx \
  --model <the model that ran Step 1's reasoning>
```

Then: copy the xlsx to the user's workspace folder and present it; run
`yarn data:push`; report **Files touched**
(the saved report id, record count, xlsx path, `data:push` output lines);
close with the mandatory **token-optimization note** — e.g. how many
companies' guidance DTOs were re-read vs. newly extracted this run, and
whether the annotation step (Step 1) is the dominant cost driver (it usually
is, since it's the one step requiring the flagship model) — call out that
Steps 2, 4, 5 are already fully scripted and add negligible cost regardless
of batch size.

## Dependencies

- `forward-guidance-extractor` (Stage 2 of the now-2-skill pipeline) — this
  skill consumes its `forward-guidance` DTOs, never re-extracts guidance
  itself. If a candidate ticker has no `forward-guidance` DTO for the target
  quarter at all, run the full upstream pipeline first
  (`guidance-document-extractor` → `forward-guidance-extractor`) rather than
  annotating from nothing. This skill is most commonly invoked automatically
  from inside `forward-guidance-extractor`'s optional Phase 6 — but only when
  the user explicitly asked for a ranking in the same request; it remains
  fully callable standalone too. (`guidance-document-fetcher`,
  `guidance-relevance-filter`, `transcript-availability-scanner`, and
  `guidance-ppt-fallback` were earlier, now-deprecated designs for parts of
  that same upstream pipeline — if you land on any by an old reference, the
  current 2-skill pipeline superseded them.)
- `pre-pead-scanner` (sibling, heavier) — has the full street-consensus +
  historical-drift + Screener-cross-check machinery this skill deliberately
  does NOT replicate. Point the user there if they ask for that level of
  rigor on a single scan universe; this skill is the lighter, guidance-only
  screen for when the user has already built (or wants) a specific batch of
  `forward-guidance` DTOs to rank.

## File tree

```
pead-surprise-ranker/
├── SKILL.md
└── scripts/
    ├── compute_pead_score.py   (Step 2)
    ├── build_pead_workbook.py  (Step 4)
    └── save_pead_ranking.js    (Step 5)
```
