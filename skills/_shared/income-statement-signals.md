# Income Statement Signal Scan — shared reference

Any skill that generates insights, verdicts, or commentary from a company's quarterly/annual
P&L MUST run this scan before writing margin/PBT/PAT commentary. It exists because reading
one line in isolation (e.g. "PAT grew 40% YoY") routinely misattributes a result — a headline
beat or miss is almost always the net of several P&L lines moving together, some offsetting,
some reinforcing, and the true driver only becomes visible when every line is read against
**both** a QoQ and a YoY baseline and checked in combination with its neighbours.

This scan supersedes and subsumes any skill's earlier single-line check (e.g. the
"Inventory Gains check" some skills carried before this existed — that check is now item 4
below, folded into the full framework rather than run standalone).

## Extraction First, Analysis Second (mandatory — this is how tokens get saved)

Computing QoQ/YoY deltas and checking them against a materiality bar is arithmetic, not
judgment — it belongs in a script, not in an LLM reasoning pass. Every line/combination
check in this document is implemented deterministically in
`stock-api/src/analyzers/incomeStatementSignals.js`. Calling skills MUST call
`getOrCompute(companyId, period, lineData, context)` from that module rather than asking
the model to compute or eyeball percentage moves — the model's job starts _after_ the
script returns, reasoning only over the short list of lines/combinations that already
cleared the materiality bar (what they mean, how to phrase them, which verdict tag they
earn), never re-deriving whether or by how much a line moved.

`getOrCompute` is also the de-duplication point: it caches its result per
`(companyId, period)` under `data/cache/income-statement-signals/<safeCompanyId>/<period>.json`
via `db.cachePath()`. If two different skills — or two runs of the same skill — analyse the
same company's same quarter (a realistic scenario: `equity-research-master` or a watchlist
run can invoke `quarterly-result-analysis`, `concall-analysis`, and `announcement-insights`
for the same company on the same day), the second and third calls are cache hits: zero
recomputation, zero re-spent tokens, and — just as importantly — identical numbers across
all three outputs instead of three independently-reasoned-to answers that might disagree on
whether a line was material. Pass `force: true` only when the filing itself was revised or
restated after the first computation.

## Sourcing rule (mandatory)

Pull every P&L line item from the actual quarterly/annual Result filing via
`stock-documents-fetcher` (`documentsFetcher.js` / `StockscansClient.documents()`) — never
from a news summary, Screener's collapsed multi-year table, or a concall/PPT paraphrase.
Several of the lines below (Changes in inventories, the Other Income break-up, the tax-rate
reconciliation, Exceptional items) are routinely dropped, netted, or rounded away in every
secondary source.

## Baselines: read every line against both

- **QoQ (sequential quarter)** — catches abrupt, event-driven shifts: one-offs, seasonality
  inflections, a trend starting or reversing.
- **YoY (same quarter last year)** — catches structural drift and cancels out seasonality;
  the primary baseline for any margin/cost-structure conclusion.

Compute both before deciding what to report. A QoQ-only read can miss a YoY margin decay
that a seasonal QoQ uptick is masking; a YoY-only read can miss an emerging sequential
inflection that hasn't shown up in the YoY comp yet. When the two disagree, say so
explicitly rather than picking one (see the worked example at the end).

## Line-by-line checklist

Each entry: what to ask, and the materiality bar below which the line is noise and must
NOT be reported.

1. **Revenue / Net Sales** — decompose volume vs. price/mix where disclosed or inferable
   from segment data. _Bar: >5% deviation from the trailing-4Q growth trend, either
   direction._
2. **Other Income** — classify the composition: treasury/interest income (recurring),
   fair-value/mark-to-market gains, forex gains, or a genuine one-off (asset sale, insurance
   claim, government grant, tax refund). _Bar: >10% of PBT, or a QoQ/YoY jump >50%._ When it
   clears the bar, always state its Rs Cr contribution to PBT growth explicitly — this is
   the single most common way a "beat" gets manufactured.
3. **Cost of materials consumed / Purchases of stock-in-trade** — RM cost as % of sales,
   checked against the input-price/commodity trend and against revenue growth (volume vs.
   price effect). _Bar: >150bps swing in RM-cost-as-%-of-sales, QoQ or YoY._
4. **Changes in inventories of finished goods, WIP and stock-in-trade** — negative value =
   inventory build-up = a cost tailwind (margin-inflating, non-recurring); positive value =
   drawdown = a cost headwind. _Bar: the QoQ/YoY swing in this line explains >30-40%
   (directionally) of the period's PBT growth._ When it clears the bar, tag the associated
   margin strength `TEMPORARY`/inventory-gain-driven, never `SUSTAINABLE`.
5. **Employee benefit expense** — growth vs. revenue growth (operating leverage vs. cost
   creep); watch for one-off ESOP charges, severance, or wage-hike step-ups. _Bar: employee
   cost growth diverging from revenue growth by >10 percentage points._
6. **Other expenses** — the residual "everything else" bucket; check filing notes for
   disclosed one-offs (litigation, write-offs, forex loss/gain, provisions written back/up).
   _Bar: >15% QoQ/YoY move with no corresponding revenue/scale explanation._
7. **EBITDA / Operating Profit and OPM%** — sanity-check the margin move against lines 3–6:
   does the sum of RM/inventory/employee/other-expense moves actually explain the OPM delta?
   If not, something is misclassified, hidden in a sub-line, or a segment mix-shift is at
   play. _Bar: >100bps OPM move, QoQ or YoY._
8. **Depreciation & Amortisation** — a step-change signals fresh capex being capitalized;
   cross-check against known capex/capacity-commissioning commentary. _Bar: >15% QoQ/YoY
   jump not explained by the known capex timeline._
9. **Finance costs / Interest** — direction should track the gross-debt trend and the rate
   cycle. A decline despite flat/rising debt implies refinancing or a rate benefit; a rise
   despite falling debt implies a rate reset or new working-capital borrowing. _Bar: >10%
   move inconsistent with the balance-sheet debt trend._
10. **Exceptional / Extraordinary items** — always restate PAT ex-exceptional and state
    explicitly whether the headline PAT figure being discussed includes or excludes it.
    _Bar: any non-zero value is reportable — this line exists specifically to be called
    out, it is never noise._
11. **Profit Before Tax (PBT) — bridge check** — does Revenue + Other Income −
    (COGS + Inventory-line + Employee + Other Expenses + D&A + Interest) ± Exceptional
    reconcile to reported PBT within rounding? A mismatch flags an undisclosed
    reclassification or missing line.
12. **Tax expense / effective tax rate** — swings from deferred-tax reversals, MAT credit
    utilization, a new tax-regime election, or a one-off settlement move PAT without any
    operating change. _Bar: >300bps effective-rate swing, QoQ or YoY._
13. **Profit After Tax (PAT) / Net Profit** — the headline number, but never read in
    isolation: state which 2–3 lines above explain the bulk (>60–70%) of the YoY/QoQ PAT
    delta before citing the PAT growth figure as a standalone fact.
14. **EPS** — check basic vs. diluted divergence; recent equity dilution (QIP, warrants,
    ESOP conversion) can shrink per-share earnings even when PAT is flat or growing. _Bar:
    diluted/basic gap wider than 3%._
15. **Minority interest / share of profit from associates** (consolidated statements only) —
    a swing here can move consolidated PAT with no change at the core/standalone business
    level. _Bar: >15% QoQ/YoY move._

## Combination reads (holistic — check together, not line-by-line)

- **Other Income up + Operating Profit flat/down** → the PBT/PAT move is non-operating.
  State this plainly; it is the most common disguise for a weak operating quarter.
- **RM-cost-% down + inventory line strongly negative + no volume/pricing story** →
  inventory-gain-driven margin (item 4 above) — the classic "cooking the books via input
  price cycle" pattern. Tag `TEMPORARY`.
- **Employee cost flat/down while revenue grows** → genuine operating leverage
  (constructive) — UNLESS Other Expenses simultaneously absorbed a cost that was merely
  reclassified out of employee cost; check both lines together before concluding leverage.
- **D&A step-up + Interest step-up + Revenue flat** → new capacity has been commissioned but
  isn't contributing to revenue yet — a near-term margin drag to flag, not a standalone red
  flag.
- **Tax-rate swing + PAT growth outpacing PBT growth** → the "beat" is a tax-line effect.
  Always net this out before citing PAT growth as an operating/business signal.
- **Exceptional item present + management commentary silent on it** → a potential
  understatement of the one-off's impact; call out the gap explicitly rather than assuming
  it's immaterial.

## Noise-filtering rule (mandatory — applies to the written output, not the scan itself)

Compute every applicable line and combination above every time. The **written** insight
includes only the items that (a) clear their materiality bar, and (b) would change a
reader's interpretation of the quarter. A line that moved but changes nothing about the
conclusion is not mentioned. Rank what IS reported by contribution to the PBT/PAT delta —
lead with the 1–3 items that explain most of the swing; do not produce a line-by-line
recitation of all 15 items regardless of materiality. If nothing clears the bar, say so in
one line ("no material P&L composition effects this period — the reported growth reads as
broad-based/operating") rather than omitting the check silently.

## QoQ vs. YoY: which is decisive, and when they disagree

- Default to **YoY** for margin and cost-structure conclusions — it removes seasonality.
- Default to **QoQ** for detecting an inflection (a trend starting, accelerating, or
  reversing) and for exceptional/one-off items, which are inherently sequential events.
- When QoQ and YoY tell different stories, report both and say so explicitly rather than
  picking one — e.g.: _"YoY OPM is flat, but QoQ margin fell 180bps sequentially on RM cost
  pressure — worth flagging as an emerging headwind not yet visible in the YoY comparison."_

## How to cite this scan from a calling skill

A calling skill's own mandatory-check paragraph should be short — point here rather than
re-deriving the framework:

> **Income Statement Signal Scan (mandatory).** Before writing any margin/PBT/PAT
> commentary, call `getOrCompute(companyId, period, lineData, context)` from
> `stock-api/src/analyzers/incomeStatementSignals.js` (cache-checked first — do not
> recompute if this company/period was already scanned this session or on a prior run).
> **Sourcing rule:** pull every P&L line from the actual Result filing via
> `stock-documents-fetcher`, never a collapsed summary — that's the `lineData` the script
> consumes. Reason only over the script's `material`/`combinations` output, ranked by
> contribution to the PBT/PAT delta — if both arrays come back empty, say so in one line
> rather than falling back to reasoning the deltas out by hand.

## What NOT to do (the failure mode this replaces)

Do not read the P&L, eyeball a few lines, and write a paragraph guessing at which moves
"feel" material — that is slower, costs more tokens than one script call, and produces a
different materiality judgment every time it's run. Do not re-run the scan for a
company/period that a cache file already exists for in this same task unless the filing was
restated. Do not write the same "no material P&L effects this quarter" sentence twice for
two different sections of the same report — compute it once, reuse the verdict.
