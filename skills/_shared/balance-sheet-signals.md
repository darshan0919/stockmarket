# Balance Sheet Signal Scan — shared reference

Any skill that judges the QUALITY of a company's balance sheet — not just quotes debt-to-equity
— MUST run this scan. It is the sibling of
[`income-statement-signals.md`](income-statement-signals.md) and follows the identical
Extraction-First / Analysis-Second split, the identical materiality-bar discipline, and the
identical cache contract.

It exists because a P&L can be right while the balance sheet is the thing going wrong. The
recurring accident in Indian mid- and small-caps is not a fake revenue line; it is profit that
never becomes cash because it is parked on the asset side. Since the balance sheet must
balance, an overstated P&L has to come to rest somewhere, and there are only four realistic
places for it to land: **receivables, inventory, CWIP/fixed assets, and goodwill or
loans-and-advances**. Reading those four against revenue growth _together_ — rather than
reading debt-to-equity in isolation and declaring the balance sheet "strong" — is what this
scan mechanises.

> SOIC, _How to detect Accounting Frauds (Part 1)_, Level 2 Intensive Course @ 00:04:48 —
> "If you are inflating your profits, then you need to inflate your assets as well, because a
> balance sheet always has to balance. So what can you inflate on the asset side? You can
> inflate 4 things."

## Extraction First, Analysis Second (mandatory)

Every ratio, day-count, turn, gearing figure and reconciliation below is arithmetic. It is
implemented deterministically in
[`stock-api/src/analyzers/balanceSheetSignals.js`](../../stock-api/src/analyzers/balanceSheetSignals.js).
Calling skills MUST call `getOrCompute(companyId, period, current, prior, context)` rather than
having a model eyeball percentage moves. The model's job begins _after_ the script returns,
reasoning only over the short list that already cleared the bar: what it means for business
quality, whether it is structural or a one-period swing, and which one sentence is worth
writing.

`getOrCompute` caches per `(companyId, period)` under
`data/cache/balance-sheet-signals/<safeCompanyId>/<period>.json` via `db.cachePath()`. Key
`period` by the **balance sheet date** (`2026H1`, `2026FY`), never by the quarter being
discussed — the same statement is legitimately re-read from a later quarter's filing, and
keying by date is what makes that a cache hit instead of a second, differently-keyed scan of
identical numbers.

## Availability and staleness — read this before anything else (India-specific)

SEBI LODR Regulation 33(3) requires a listed entity to submit a statement of assets and
liabilities **only "as at the end of the half-year"**, by way of a note to the half-yearly
results. There is no quarterly requirement. Three consequences that govern every use of this
scan:

1. **Q1 and Q3 result filings normally contain no balance sheet at all.** Its absence is
   compliance-normal, not a red flag, and must be reported as "not disclosed this quarter",
   never inferred or reconstructed.
2. **An investor PPT in Q1/Q3 that shows a balance sheet is usually repeating the last
   published one** (H1 or FY). Analysing it as if it were new produces a confident write-up
   about a statement that has not changed — the worst failure mode available here.
3. **The only honest comparison bases are H1 vs H1 (YoY) and H1 vs the preceding FY** (a
   half-year of movement). There is no such thing as a QoQ balance sheet move for an Indian
   listed company outside the half-year cadence, so never phrase one.

Resolve availability and staleness BEFORE calling the analyzer — that is
`quarterly-result-extractor/scripts/extract_statements.js`'s job. It returns a status per
statement: `fresh`, `stale-repeat` (numerically identical to the previously-seen statement),
`stale-asof` (an `as at` date older than this quarter's end), or `absent`. On anything other
than `fresh`, say so in one line and stop — do not analyse, and do not pad the gap with annual
report figures or a web summary.

## The comparison basis must be stated

Because the cadence is half-yearly, every reading this scan produces carries an implicit
window. State it. `context.priorLabel` (e.g. `"H1 FY27 vs H1 FY26"`) exists for exactly this,
and a write-up that says "receivable days rose 22 days this quarter" when the underlying move
is a half-year one is wrong even when the number is right.

## Line-by-line checklist

Each entry: what to ask, and the materiality bar below which it is noise and must not be
reported. The bars are encoded in the analyzer's `CHECKS` array — this document explains the
_why_; the script owns the _whether_.

1. **Gross debt, net debt, gearing** — gross debt = long-term borrowings + current maturities
   of long-term debt + short-term borrowings; net debt subtracts cash, bank balances and
   current investments. _Bar: net-debt/equity moving more than 0.15x, or above 1.0x, or gross
   debt moving >15%._ Falling debt against flat-or-rising net worth is the deleveraging setup
   that re-rates; rising debt is acceptable only when it funds assets that will earn above its
   cost, which is a CWIP and cash-flow question, not a balance-sheet one.
2. **Cash held alongside comparable borrowings** — _Bar: cash+current investments >10% of total
   assets AND gross debt >10%._ Either a deliberate war chest with a stated use, or cash that
   is encumbered, pledged, or not there. The tie-breaker is interest received in the cash-flow
   scan.
3. **Trade receivable days** = receivables ÷ annualised revenue × 365. _Bar: ±10 days move, or
   an absolute level above 90 days._ A sustained climb is the most-cited pre-fraud signal there
   is: sales booked that the customer has not paid for.
4. **Inventory days** = inventories ÷ annualised COGS × 365. _Bar: ±10 days._ Separate a
   deliberate build (ahead of a season or a commodity move — temporary, often margin-positive)
   from stock that is not selling (structural, heading for a write-down). This must agree with
   the P&L's "changes in inventories" line and the cash-flow working-capital line.
5. **Trade payable days.** _Bar: ±10 days._ Stretching payables flatters cash flow for a period
   or two and is not a durable improvement; shrinking payables can mean suppliers have tightened
   terms, which is a credit-stress tell.
6. **Net working capital days** = receivable days + inventory days − payable days. _Bar: ±15
   days._ The highest-value constructive reading on this statement: falling working-capital days
   mean the same sales need less capital, so capital-employed turnover — and therefore ROCE —
   rises with no margin help at all.
7. **Receivables growth vs revenue growth.** _Bar: >15pp divergence._ Receivables outgrowing
   revenue means the incremental sale was made on progressively looser credit: growth bought,
   not earned.
8. **Inventory growth vs revenue growth.** _Bar: >15pp divergence._
9. **Capital work in progress.** _Bar: CWIP >15% of net block, or a >25% move._ High and
   _rising_ CWIP is future capacity — the earnings the market has not seen yet, and frequently
   the entire re-rating thesis. High and _flat_ CWIP across periods is the opposite: capital
   parked in something not being commissioned, earning nothing while it sits. A single snapshot
   cannot tell these apart, which is why the change matters more than the level.
10. **Gross block / fixed-asset turnover** = annualised revenue ÷ gross block. _Bar: >10%
    move._ The other half of ROCE (EBIT margin × capital-employed turnover). Turns falling in a
    commissioning year is normal; turns falling with no capex is demand weakness.
11. **Goodwill and intangibles.** _Bar: >10% of net worth, or a >20% move._ Goodwill is the
    accounting record of having overpaid for an acquisition and is one of the four asset lines an
    inflated P&L can be parked in. A large block is a standing impairment risk; a sudden increase
    is an acquisition that needs its own scrutiny.
12. **Loans and advances (current + non-current).** _Bar: >5% of net worth, or a >25% move._
    Growing faster than the business is the classic route for cash to leave a listed entity for a
    promoter-owned unlisted one. Read alongside the related-party note.
13. **Other current / non-current assets — the residual bucket.** _Bar: >25% move._ The unnamed
    residual is where an asset nobody wants to label ends up.
14. **Net worth bridge** — opening net worth + PAT for the period − dividend ± issuance should
    reconcile to closing net worth. _Bar: unexplained gap >3% of opening._ A gap means something
    moved through reserves or OCI without passing through the P&L: a write-off, a restatement, or
    a revaluation. Find it before trusting reported book value.
15. **Balance check** — total assets must equal total equity and liabilities. _Bar: >0.5%
    gap._ A failure here is an extraction error, not a company finding; re-parse before reporting
    anything else from the statement.
16. **Deferred tax assets.** _Bar: >5% of net worth, or a >25% move._ A DTA is a claim on future
    taxable profit, typically capitalised carried-forward losses — worth only what future profits
    make it worth.
17. **Contingent liabilities (off balance sheet).** _Bar: >25% of net worth, or a >30% move._
    The question is never the number alone; it is whether the worst case threatens survival or
    dents one year of profit.
18. **Equity share capital.** _Bar: any change >1%._ A QIP, preferential issue or warrant
    conversion is neither good nor bad on its own — it is good if the money is deployed above the
    cost of the equity issued. Judge the end-use, not the dilution percentage.
19. **Current ratio and near-term liquidity.** _Bar: below 1.0, or a >0.25x move._ Below 1 with
    meaningful current maturities of long-term debt is a refinancing question, not a ratio.
20. **Implied cost of debt** = annualised P&L interest ÷ average gross debt. _Bar: outside
    5-15%._ Far below the market cost of borrowing suggests debt that is not on the balance sheet,
    or interest being capitalised into CWIP; far above suggests distressed or undisclosed
    short-term borrowing.
21. **Promoter pledge.** _Bar: any non-zero value._ A rising pledge alongside rising company
    borrowings and rising financing inflows transmits price risk directly into the business.

## Combination reads (check together, never line-by-line)

- **ASSET_SIDE_INFLATION_PATTERN** — three or more of receivables / inventory / CWIP / goodwill
  / loans-and-advances stretching at once. This is the forensic pattern; no single line carries
  it. Escalate to `forensic-accounting` rather than resolving it inside a quarterly note.
- **DEBT_FUNDED_CAPEX** — borrowings and CWIP rising together. Acceptable only if the project
  return clears the cost of debt; check the guided project ROCE and the commissioning timeline.
- **CWIP_STAGNANT** — a large CWIP block that is not moving. Ask for the revised commissioning
  date and compare it against what was said last time.
- **CASH_AND_DEBT_COEXIST** — verify against interest received before accepting the cash as
  real and unencumbered.
- **BALANCE_SHEET_LIGHTENING** _(constructive)_ — working-capital days falling AND debt falling
  together. Capital-employed turnover and ROCE rise without margin help. Check whether it is
  durable or one period of payables stretch.
- **EQUITY_FUNDED_EXPANSION** — fresh equity alongside rising CWIP. Judge by expected project
  return versus the price at which equity was issued.
- **CONTINGENT_LIABILITY_THREAT** — off-balance-sheet claims above half of net worth. Size the
  worst case against equity and say plainly which kind of problem it is.
- **PROMOTER_LEVERAGE_PATTERN** — pledge plus rising company borrowings. Income statement,
  balance sheet and financing cash flows are one story here, not three.
- **EXTRACTION_SUSPECT** — totals do not tie; everything else from this statement is unverified.

## Cross-statement discipline (do not double-report)

Rising receivable days on the balance sheet and weak CFO-to-PAT conversion in the cash-flow
statement are **one phenomenon seen from two angles**, not two findings. Report it once, with
both numbers, and say which statement each came from. The same applies to the inventory line
(P&L "changes in inventories" ↔ balance-sheet inventory days ↔ cash-flow working-capital
movement) and to debt (balance-sheet gearing ↔ P&L finance cost ↔ financing cash flows). Per
`conventions.md` §17, never write the same finding twice in different words.

## Noise-filtering rule (applies to the written output, not the scan)

Compute everything, every time. Write only what (a) cleared its bar and (b) would change a
reader's view of the business. Rank what is reported by its effect on capital efficiency and
solvency — lead with the one or two items that would change a holding decision. If nothing
clears the bar, say so in one line ("no material balance-sheet composition change this
half-year — working capital, gearing and asset quality all within trend") rather than omitting
the check silently.

## How to cite this scan from a calling skill

> **Balance Sheet Signal Scan (mandatory).** Before writing any commentary on working capital,
> gearing, asset quality or capital allocation, resolve availability/staleness (SEBI requires
> this statement only half-yearly), then call
> `getOrCompute(companyId, period, current, prior, context)` from
> `stock-api/src/analyzers/balanceSheetSignals.js` — cache-checked first. **Sourcing rule:**
> every line comes from the actual Result filing's statement of assets and liabilities, or the
> investor PPT when it carries a fresher one, never from Screener's collapsed table or a news
> summary. Reason only over the returned `material`/`combinations`, and state the comparison
> basis (H1 vs H1, H1 vs FY) in the write-up.

## What NOT to do

Do not quote debt-to-equity and call the balance sheet analysed. Do not analyse a statement
the extractor flagged `stale-repeat` or `stale-asof`. Do not describe a half-yearly movement
as a quarterly one. Do not reconstruct an absent balance sheet from the annual report and
present it as this quarter's. Do not report a line that moved but changes nothing.
