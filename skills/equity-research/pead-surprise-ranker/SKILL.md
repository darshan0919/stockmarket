---
name: pead-surprise-ranker
description: >
  Stage 3 (final, optional) of the guidance/PEAD pipeline: turns a batch of
  forward-guidance report DTOs (from forward-guidance-extractor, which now
  fetches Stockscans' own concall-notes/growth-catalysts reports directly --
  see that skill's SKILL.md) into
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
  extractions. Since 2026-09-20 the ranking is ordered by GUIDED GROWTH vs
  REPORTED HISTORY -- projected next-quarter and full-FY Revenue, EBITDA /
  Operating Profit and PAT compared with the latest quarter (QoQ), the year-ago
  quarter (YoY) and the previous full FY (FYoFY), bottom line weighted highest,
  every delta its own sortable column -- so "who is promising the most growth"
  is one sort away. Always tags every input [guided]/[estimate]/[assumption] and
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

## Ranking basis: guided growth vs. reported history (added 2026-09-20)

The default sort answers "who is promising the most growth, measured against
what they actually delivered" -- not merely "who has the most visible guide".
For every company with quantified guidance, script-project the NEXT
unreported quarter and the guided FY (Step 1b), and compare each of Revenue,
EBITDA / Operating Profit (one series on Stockscans -- one column pair, not
two) and PAT against three reported comparators:

| Delta     | Projected figure        | Compared with                    |
| --------- | ----------------------- | -------------------------------- |
| **QoQ**   | next unreported quarter | latest reported quarter          |
| **YoY**   | next unreported quarter | same quarter last year           |
| **FYoFY** | guided full FY          | previous full FY (guided FY - 1) |

Worked example (the user's own): guidance "revenue +20%, OPM 15%" ->
FY Operating Profit = 1.20 x base revenue x 15%, compared with the previous
FY's _actual_ Operating Profit -> FYoFY OP growth; the same margin applied to
the phased quarter gives the QoQ / YoY OP growth. A margin step-up therefore
shows up as bottom-line growth far above the revenue growth -- which is the
point.

`growth_score` (0-100, sorting aid only) weights the bottom line highest
(PAT .40 / Operating Profit .35 / Revenue .25) and FYoFY/YoY over QoQ (.40 /
.40 / .20; QoQ is seasonal), then shrinks it when few cells are computable
(`growth_coverage`) so a top-line-only story can't outrank a real bottom-line
one. Every delta is ALSO its own numeric column in the
workbook (autofilter on) so the reader can sort by any single comparator; the
old visibility composite stays as a separate column and the tie-break. See
`scripts/compute_growth_deltas.py`'s docstring for the exact rules -- don't
restate them from memory.

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

Add a `growth_inputs` object to the annotation when the guidance is
quantified enough to project (revenue growth/level, and/or a margin, OP or PAT
figure) -- Step 1b explains exactly what goes in it. Omit it for
qualitative-only guidance (the company is still ranked, after every scored
one, by the visibility composite).

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

## Step 1b — Reported history + growth deltas (script; LLM only for phasing)

**1. Fetch actuals (script, cached).** Stockscans has no JSON API for
historical P&L -- the numbers are in the server-rendered company page, which
`company-financials` fetches and parses (12 quarters, ~7 FYs, TTM; consolidated;
whole-Cr precision):

```bash
yarn workspace @stock/api company-financials \
  --companies NSE:A,NSE:B,... --out /tmp/pead_actuals.json     # or --companies-file
# add --force right after a company files new results (24h cache otherwise)
```

**2. Write `growth_inputs` per company (LLM judgment -- the ONLY LLM step here).**
Schema in `compute_growth_deltas.py`'s docstring. Rules:

- Put in only what management said: `guided_fy`; `revenue` (`growth_pct` -- the
  midpoint of a range -- or `fy_abs_cr`); `operating_profit` (`opm_pct`,
  `opm_delta_bps`, or EBITDA/OP `growth_pct`/`fy_abs_cr`) and `pat` if guided.
  If margin was NOT guided, omit `operating_profit`: the script holds the
  latest reported quarter's OPM and tags it `[assumption]`. Never fill a gap
  with your own margin number.
- **Multi-year guidance: distribute across YEARS first, then quarters.**
  Year split (`revenue.year_path.cumulative_share`) follows when the capacity
  goes live / the ramp or order book supports it -- back-ended if the plant
  commissions late, front-loaded if capacity already exists. Quarter split
  (`quarter_weights`, share of the REMAINING FY revenue) follows capacity
  go-live dates first, then the company's own past seasonality (the default
  the script uses if you give no weights is `baselines.seasonality` in the
  actuals file -- look at it before overriding). State the reason in
  `phasing_basis`.
- **The more specific the guidance, the more it anchors the numbers:** a
  quarter-specific guide (`target_quarter.revenue_cr` / `opm_pct` / `pat_cr`)
  pins that quarter directly; an FY guide is phased; a vague multi-year
  ambition is phased last and gets `basis: "derived"`.
- Mark `basis: "derived"` on anything you phased or inferred; `"explicit"`
  only when it is management's own figure for that FY.

**3. Compute (script):**

```bash
python3 skills/equity-research/pead-surprise-ranker/scripts/compute_growth_deltas.py \
  --annotations /tmp/pead_annotations.json --actuals /tmp/pead_actuals.json \
  --out /tmp/pead_annotations_growth.json
```

Writes a `growth` block per company: projected next-quarter and FY figures,
the nine deltas (Revenue / OP / PAT x QoQ / YoY / FYoFY), `growth_score`,
`growth_coverage`, `basis_quality`, and every `[assumption]`/`[estimate]`/flag.
Growth off a non-positive base is null + flagged, never a huge %.

**4. Read the flags, then the `context` block (brief LLM check).** Any flag
(stale guide, guidance already met, implausible implied OPM, small PAT base,
missing year-ago quarter) belongs in that company's thesis/assumptions text.
`context.implied_remaining_revenue_yoy_pct` vs `latest_revenue_yoy_pct` tells
you whether the guide is a deceleration (possible sandbag) or a stretch.

## Step 2 — Score (script, no LLM)

```bash
python3 skills/equity-research/pead-surprise-ranker/scripts/compute_pead_score.py \
  --in /tmp/pead_annotations_growth.json --out /tmp/pead_ranked.json   # --sort composite for the old order
```

Default order: `growth_score` descending (companies without one -- qualitative
guidance only, or actuals unavailable -- come after every scored company),
composite as tie-break.

Alongside the growth score, the deterministic visibility composite is kept
(0-100, sorting aid only — the reader should always
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

(This limitation is the visibility composite's, not the growth score's: an
absolute-currency guide is passed to Step 1b as `revenue.fy_abs_cr` /
`target_quarter.revenue_cr` and IS converted to growth against reported
actuals there.)

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
- **Growth deltas (added 2026-09-20):** how many companies' top growth cells
  are `basis_quality: "derived"` (our phasing/assumed margin) rather than
  management's own numbers; that PAT is always an `[estimate]` unless PAT was
  guided; that actuals are whole-Cr rounded (small-company profit growth can
  be off by several points), consolidated, and for banks/NBFCs only Revenue and
  PAT are compared; that QoQ is seasonal (a Q4->Q1 dip is normal, hence its
  low weight); that a strong YoY can be a weak-base effect; and that the
  score's caps/weights are fixed constants, not calibrated on outcomes.

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

Produces three sheets: **PEAD Ranking** (Growth Score + Coverage, then the
nine numeric delta columns -- Revenue / EBITDA-Op. Profit / PAT x QoQ / YoY /
FYoFY -- projected quarter and FY figures, delivered-vs-implied context,
growth basis, phasing and assumptions/flags, then the visibility columns;
autofilter on, Rank/Ticker/Company/Sector frozen so any column is sortable),
**No Visibility (Excluded)**, **Methodology & Caveats**. This is a pure template render of the JSON from
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

Final step (conventions.md §24 -- self-reported token usage; there is no
automatic LLM-token instrumentation in this repo):

```bash
python3 scripts/metrics/track_invocation.py --name pead-surprise-ranker --type skill \
  --model <exact model that ran Step 1/1b reasoning> --files <guidance DTO / actuals files read> --output-words <approx>
```

## Dependencies

- `forward-guidance-extractor` — this skill consumes its `forward-guidance`
  DTOs, never re-extracts guidance itself. If a candidate ticker has no
  `forward-guidance` DTO for the target quarter at all, run
  `forward-guidance-extractor` first (it fetches directly from Stockscans'
  concall-notes/growth-catalysts endpoints now -- no separate fetch skill
  needed) rather than annotating from nothing. This skill is most commonly
  invoked automatically
  from inside `forward-guidance-extractor`'s optional Phase 6 — but only when
  the user explicitly asked for a ranking in the same request; it remains
  fully callable standalone too. (`guidance-document-fetcher`,
  `guidance-relevance-filter`, `transcript-availability-scanner`, and
  `guidance-ppt-fallback` were earlier, now-deprecated designs for parts of
  that same upstream pipeline — if you land on any by an old reference, the
  current 2-skill pipeline superseded them.)
- `stock-api/bin/company-financials.js` (+ `src/analyzers/companyFinancials.js`)
  -- the historical-actuals fetch/parse behind Step 1b; documented in
  `docs/stockscans-api-schemas.md` ("GET /company/{companyId}").
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
    ├── compute_growth_deltas.py (Step 1b) + test_compute_growth_deltas.py
    ├── compute_pead_score.py   (Step 2) + test_compute_pead_score.py
    ├── build_pead_workbook.py  (Step 4)
    └── save_pead_ranking.js    (Step 5)
```
