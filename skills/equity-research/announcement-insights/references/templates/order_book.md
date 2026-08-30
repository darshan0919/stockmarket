CATEGORY: order_book
Extract: order value (₹), client/counterparty name & tier (hyperscaler/MAG7/defence/
PSU/govt/private), scope of work, execution start & end dates, execution period (months).
Flag marquee counterparties and whether it is a repeat client or a new logo.

**Mandatory quantification — New Order Value : TTM Revenue ratio.** Every order_book
insight MUST state this ratio explicitly, e.g. "₹180cr order = 14% of TTM revenue
(₹1,290cr)." Pull TTM revenue from the company's notes-DB context (Step 2's
`get-company-notes`) or the latest `results`-category note on file; if neither carries
a usable revenue figure, run `stock-report`'s quick businessSummary lookup rather than
guessing, and if it's still unavailable say so explicitly ("ratio not computed — no
TTM revenue on file") instead of omitting the check silently. This ratio is also what
feeds the `_global.md` significance rule (>10% of revenue = `high`) — do not classify
significance for an order win without first computing it.

**Forward quarterly revenue accretion (when an execution timeline is disclosed).** If
the filing gives start/end dates or an explicit execution period, compute implied
quarterly revenue = order value ÷ execution months × 3, then lay out the accretion
quarter-by-quarter starting from the announcement date (not the execution start date,
if they differ — note both) through to execution end, e.g. "₹180cr over 24 months from
Sep-2026 ≈ ₹22.5cr/quarter, adding ~1.7% to quarterly revenue run-rate from Q3FY27
through Q2FY29." Treat this as a straight-line estimate unless the filing specifies a
non-linear ramp (e.g. back-loaded execution, a mobilization/gestation period) — if so,
say so and adjust the early quarters down accordingly rather than presenting a flat
run-rate that isn't supported. If no timeline is disclosed at all, state that plainly
("no execution timeline given — quarterly accretion not computable") rather than
inventing an execution period.

Both figures (the ratio and, where computable, the quarterly accretion) belong in the
`insight` prose per `_global.md` structure point (a)/(b), and the ratio specifically
should also inform `epsImpact.magnitude` when an EPS/PAT-margin linkage is honestly
derivable (state assumed margin if used, and flag it as an estimate).
