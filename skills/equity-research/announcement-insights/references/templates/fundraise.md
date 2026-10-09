CATEGORY: fundraise
Extract: instrument (QIP / preferential / warrants / NCD / rights / private placement),
quantum (₹ and number of securities), issue/conversion price, allottee names & type
(promoter / institutional / strategic / retail), resulting dilution %, and the stated
use of funds. Flag promoter-skin-in-the-game vs pure dilution.

Dilution test (deterministic — do NOT hand-calculate): run
`node packages/jobs-runtime/lib/dilutionCheck.js <existingShares> <newShares> <epsNow> <epsGuidedPostIssue> [debtAddedCr]`.
Report its `verdict` (GROWTH_FUEL / SHAREHOLDER_PAIN, `+DEBT_ADDED` when the raise adds debt) and
`dilutionPct`. Then add ONE judgment line: is the guided EPS credible (order book, capacity,
margins)? Also state the stated use of funds: capex with fast execution and deleveraging are the
strongest uses; unused proceeds or a raise made while growth is slowing are negatives.
(Source: kbf_x-sureshkbn_earnings-horizon-valuation-gate; draft pending Darshan's G3 review.)

**Further filing checks.** (a) Use of funds: growth capex at high ROCE and debt retirement are positive; balance-sheet repair is negative. (b) Does the raise size match the stated need? Undersized raises invite another one. (c) Warrants: the conversion price is not a target price; warrants issued repeatedly without EPS growth signal dilution. (d) A QIP/pref announced but not yet executed is a pending item — track it. (e) After an IPO: track proceeds vs utilisation and check for incremental growth in the next reporting periods. Judge on EPS, not PAT.
(Source: SureshKBN filings consolidation, data/assets/filings-framework-sureshkbn.md; kbf_x-sureshkbn_filing-read, draft pending Darshan's review.)
