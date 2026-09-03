# Cash Flow Signal Scan — shared reference

Any skill that judges the QUALITY of a company's cash generation MUST run this scan. Third
sibling of [`income-statement-signals.md`](income-statement-signals.md) and
[`balance-sheet-signals.md`](balance-sheet-signals.md), same Extraction-First split, same
materiality discipline, same cache contract.

It exists because the cash flow statement is the only one of the three that cannot be accrued
into existence. Revenue recognition is a policy choice; cash received is a fact. Everything
the P&L can flatter — a sale on 250-day credit, a margin built on an inventory build, a profit
that is really a deferred-tax entry — shows up here as the gap between reported profit and
operating cash.

> SOIC, _Spot Frauds Before They Come Out_, SOIC Market Signals @ 00:16:24 — "minimum CFO to
> EBITDA in this industry has to be 50% or above and CFO to PAT has to be above 80 to 90%
> because it's a B2B business."
>
> SOIC, _Class 6 | Joining the Financial Statements_, Crash Course @ 02:02:36 — on booking a
> credit sale: "there is some part of cash that is stuck under the trade receivables, so cash
> flows help us to bridge the gap between the accrual system of accounting" and reality.

## Extraction First, Analysis Second (mandatory)

Every conversion ratio, funding identity and reconciliation below is arithmetic, implemented in
[`stock-api/src/analyzers/cashflowSignals.js`](../../stock-api/src/analyzers/cashflowSignals.js).
Call `getOrCompute(companyId, period, current, prior, context)`; reason only over what it
returns. Cached under `data/cache/cashflow-signals/<safeCompanyId>/<period>.json`, keyed by the
**cumulative window** the statement covers (`2026H1`, `2026FY`), not by the quarter being
discussed.

## Availability, cumulativeness and staleness (India-specific — read first)

SEBI LODR Regulation 33(3) requires a statement of cash flows **only for the half-year**, as a
note to the half-yearly results. Three consequences:

1. **Q1 and Q3 filings normally carry no cash flow statement.** Absence is compliance-normal.
   Report it as not disclosed; never reconstruct it.
2. **The figures are CUMULATIVE — H1 year-to-date or full-year, never a single quarter.** A
   "quarterly CFO" does not exist in Indian filings unless the company voluntarily derives one.
   Deriving H2 as FY minus H1 is legitimate and often revealing, but it must be labelled as a
   derived figure.
3. **The only valid comparison is like window against like window** — H1 vs H1, FY vs FY. Never
   compare an H1 cash flow against a full-year one, and never annualise a half-year cash flow to
   set against a full-year P&L. Every context figure passed to the analyzer
   (`ebitdaForPeriod`, `patForPeriod`, `revenueForPeriod`, `taxChargeForPeriod`,
   `financeCostForPeriod`) must cover **exactly** the same window as the cash-flow statement, or
   every conversion ratio below is silently wrong.

Availability and staleness are resolved before the analyzer runs, by
`quarterly-result-extractor/scripts/extract_statements.js`, which returns `fresh`,
`stale-repeat`, `stale-asof` or `absent`. On anything but `fresh`, say so in one line and stop.

## Line-by-line checklist

1. **CFO — sign and level.** _Bar: negative, a sign flip, or a >30% move._ Negative operating
   cash flow in a profitable company is always reportable whatever explanation is offered. A sign
   flip in either direction is the single highest-information fact on this statement.
2. **CFO / EBITDA.** _Bar: below 50%, or a >20pp fall._ The working floor. Below it, operating
   profit is not becoming cash and the gap must be found in working capital. Judge the LEVEL
   against the sector (project and EPC businesses run structurally lower than consumer ones) but
   judge the TREND against the company's own history.
3. **CFO / PAT.** _Bar: below 80%, or a >20pp fall._ SOIC's working bar for a B2B business is
   80-90%+. Persistent under-conversion across periods is the accrual-quality signal that
   precedes most Indian small-cap accidents; one weak period during a genuine growth spurt is
   usually working capital funding real volume — the difference is whether it repeats.
4. **Working-capital movement as a share of operating profit before WC changes.** _Bar: >30%._
   Always name WHICH line did it — receivables, inventory, or payables unwinding. The three have
   completely different implications, and the answer must agree with the balance-sheet days scan.
5. **Cash taxes paid vs the P&L tax charge.** _Bar: ratio outside 0.7-1.3._ A large gap means
   deferred tax is doing the work — timing differences, MAT credit, carried-forward losses. Cash
   tax is what actually leaves the business.
6. **Capex vs depreciation, and capex vs CFO.** _Bar: capex >2x depreciation, <0.8x
   depreciation, or exceeding CFO._ Above ~2x depreciation is expansion, not maintenance, and
   should trace to a named project and to the balance sheet's CWIP. Persistently below
   depreciation is a business being harvested. Capex exceeding CFO is not a problem in itself —
   it is a question about who funds the gap, answered by the financing section.
7. **Free cash flow (CFO − capex).** _Bar: negative, or a sign flip._ Negative FCF is **not**
   automatically negative: a company reinvesting every rupee at a high incremental return is
   doing exactly what it should. The question is what the reinvestment earns, not whether FCF is
   positive. What is unambiguously bad is negative FCF with no identifiable project behind it.
8. **Non-core investing outflows — purchase of investments, loans given, acquisitions.** \_Bar:
   > 25% of total investing outflow, or any non-trivial "loans given".\_ Cash going out to loans
   > and investments while the core is short of capital is the cash-flow view of the balance
   > sheet's loans-and-advances question. Any material loans-given line deserves a named
   > counterparty from the related-party note.
9. **Funding identity** — capex + dividends/buyback − CFO = external funding needed; compare
   against net borrowings + equity raised. _Bar: any positive funding need._ Naming WHICH source
   closed the gap, in one sentence, is usually the most useful line in a cash-flow write-up, and
   it is what connects this statement to gearing and dilution on the balance sheet.
10. **Dividend and buyback vs free cash flow.** _Bar: payout ≥80% of FCF, or FCF negative._ A
    payout above FCF is funded from the balance sheet — either a deliberate return of surplus by a
    business with nothing to reinvest in (often the right call) or a payout the company cannot
    afford. The cash balance and the debt trend decide which.
11. **Financing mix.** _Bar: any equity raised, net repayment, or a >50% swing in net
    borrowings._ Net repayment out of operating cash is the deleveraging signature that shows up
    on the balance sheet a period later. A fresh equity raise is neutral until end-use and
    expected return are known.
12. **Interest paid (cash) vs the P&L finance cost.** _Bar: ratio outside 0.8-1.25._ Cash
    interest materially above the charge usually means interest is being capitalised into CWIP —
    a real cash cost invisible in reported margins. Materially below can mean accrued-but-unpaid
    interest.
13. **Interest received vs cash and investments held.** _Bar: implied yield outside 3-12%._ A
    large reported cash pile earning almost no interest is the standard test for cash that is
    encumbered, pledged, or absent. Run it whenever the balance sheet shows cash and debt side by
    side.
14. **Cash bridge** — CFO + CFI + CFF must reconcile to the movement in cash. _Bar: >2% gap._ A
    gap is an extraction error (forex translation lines are the usual cause); fix the parse before
    concluding anything.

## Combination reads

- **ACCRUAL_HEAVY_PROFIT** — weak conversion driven by receivables. The same finding the
  balance sheet reports as rising receivable days: one phenomenon, two statements. Report it
  once, with both numbers.
- **INVENTORY_ABSORBING_CASH** — weak conversion driven by inventory. Ask whether it is a
  pre-build against a named order or season, and watch later periods for sales returns, which is
  how channel stuffing eventually surfaces.
- **DEBT_FUNDED_EXPANSION** — capex outrunning CFO with debt closing the gap. Sustainable only
  while the project return clears the cost of that debt and the commissioning schedule holds.
- **CASH_BALANCE_SUSPECT** — reported cash not producing a plausible yield. Escalate to
  `forensic-accounting`.
- **CASH_LEAKING_TO_NON_CORE** — the core is short of cash while cash goes out to loans,
  investments or acquisitions. Identify counterparties before anything else in the note.
- **SELF_FUNDED_AND_DELEVERAGING** _(constructive)_ — operating cash covers capex and
  shareholder returns and still repays debt, with healthy conversion. This is the cash-flow
  signature that precedes a re-rating; state it explicitly rather than leaving it as an absence
  of red flags. Multi-period improvement in CFO is what the market actually re-rates.
- **EXTRACTION_SUSPECT** — the bridge does not tie; everything else is unverified.

## Cross-statement discipline (do not double-report)

Weak CFO/PAT conversion and rising receivable days are one finding. The cash-flow
working-capital line, the balance-sheet days, and the P&L "changes in inventories" line are
three views of the same inventory. Debt appears as balance-sheet gearing, P&L finance cost, and
financing cash flows. Write each finding once, cite the statements it draws on, and move on —
`conventions.md` §17.

## Noise-filtering rule

Compute everything; write only what cleared its bar and would change a reader's view. Lead with
the one or two items that explain most of the gap between reported profit and cash. If nothing
clears the bar, say so in one line ("cash conversion in line — CFO/EBITDA 68%, CFO/PAT 94%, no
working-capital or funding anomalies this half-year") rather than omitting the check.

## How to cite this scan from a calling skill

> **Cash Flow Signal Scan (mandatory).** Before writing any commentary on cash generation,
> working capital, capex funding, or capital allocation, resolve availability/staleness (SEBI
> requires this statement only half-yearly, and its figures are cumulative), then call
> `getOrCompute(companyId, period, current, prior, context)` from
> `stock-api/src/analyzers/cashflowSignals.js` — cache-checked first, with context figures
> covering exactly the statement's own window. **Sourcing rule:** lines come from the actual
> filing's cash flow statement or the investor PPT when it carries a fresher one, never from a
> collapsed summary. Reason only over `material`/`combinations`, and state the window
> (H1 FY27 vs H1 FY26) in the write-up.

## What NOT to do

Do not call a half-year cash flow a quarterly one. Do not compare H1 against FY. Do not
annualise a half-year cash flow to compare against full-year P&L figures. Do not treat negative
free cash flow as a red flag without asking what it bought. Do not analyse a statement flagged
`stale-repeat` or `stale-asof`. Do not report the same cash-conversion finding twice because it
also appears on the balance sheet.
