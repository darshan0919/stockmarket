# Demerger / Merger / Acquisition / Management-Change Playbook

Source: SOIC "Demystifying Special Situation Investing" webinar (Ishmohit Arora +
Dhruv, Aug 2026) and the attached Special Situations Investing PDF. This is the
shared reasoning backbone for the `demerger`, `merger`, `acquisition`, and
`management_change` deep templates — read it once per category, not once per
announcement, then apply the checklist in the category-specific template file.

## Why these four categories get the deep treatment

Base rates matter more than most single-idea conviction. Turnarounds "seldom
turn," cyclicals are hard to time, but spin-offs (demergers) and clean
management changes have empirically produced disproportionate wealth creation
both in India and globally — precisely because retail investors have NO
structural disadvantage here (small-cap demergers routinely fall below
institutional market-cap mandates, creating forced selling that is a pure
liquidity discount, not a fundamental one). That is the retail edge this
playbook exists to protect.

## Part 1 — Demergers / Spin-offs

### The core mechanism: conglomerate discount

A single entity housing 2-3 segments with different risk/return/growth
profiles gets valued at a blended, depressed multiple because (a) the market
dislikes complexity and cannot cleanly attribute capital-allocation decisions
across segments, and (b) a loss-making or low-multiple segment drags down
consolidated ROCE/ROE even when the core segment is excellent. Listing
segments separately lets each get its own natural multiple — that's the
whole trade.

### How to identify one

Screen `scheme of arrangement`, `demerger`, `spin-off` announcement keywords
(this is exactly what `demerger` maps to in `announcementTaxonomy.js`).
Consistency matters more than sophistication — screen every day/week.

### How to value each resulting entity — Sum-of-the-Parts (SOTP)

Pick the RIGHT multiple per segment based on what's actually knowable about
its earnings:
- **P/E** — when earnings are normalized, no exceptional items. Growth is the
  key driver of the multiple (high growth → high P/E, all else equal).
- **P/B (price-to-book)** — for cyclicals whose asset base is stable across
  the cycle but earnings swing (e.g. sugar). Anchor to the segment's own
  historical median P/B range across a full cycle; ROE is the companion
  variable (better sustained ROE → higher justified P/B).
- **EV/Sales (price-to-sales)** — for segments with depressed or negative
  margins today where P/E or P/B would be distorted (loss-making divisions,
  emerging/high-capex businesses, deep-cyclicals mid-trough). Anchor: a
  segment doing ~10-12% steady-state EBITDA margin roughly justifies ~1x
  EV/Sales (inverse of a 10-12% "normal" cost of capital); scale up/down with
  the margin profile, or better, that segment's own peak/trough EV/Sales
  range across a cycle.
- **EV/EBITDA** — for capital-intensive but structurally sound businesses.

ALWAYS value each segment conservatively and independently, then sum. If, even
after conservative per-segment values, the SOTP total exceeds today's
combined market cap by a wide margin (multi-bagger-sized demergers in the
case studies were rarely "one bag or two bag" — they were often 2-4x on
SOTP re-rating alone with zero fundamental change), that is the actionable
signal. Do this valuation yourself — brokerage SOTP models sometimes miss
overheads/losses embedded in a "bad" segment (Quess Corp's founded/Monster.com
losses being underestimated in Street models was cited as a live example);
never treat a purchased research note's SOTP as gospel.

### Four recurring value-creation archetypes (pattern-match the announcement to these)

1. **Pre-shaped P&L**: a profitable division's earnings are being dragged
   down by a loss-making division in consolidated PAT/ROCE. Demerging lets
   the profitable business get its natural multiple and the loss-making one
   get valued on P/B (asset-backed) rather than zero. Watch for management
   language about the loss-making division scaling independently under
   focused management.
2. **Hidden asset base**: one segment is operationally fine but the market
   assigns zero/low value to a large asset (land bank, investments,
   subsidiary stakes) sitting inside it. Separating the asset-holding entity
   from the operating entity unlocks that asset's standalone value. Classic
   tell: enterprise value ≈ (or below) the value of ONE identifiable asset
   inside the company.
3. **Conglomerate / serial spin-off houses**: large groups (Adani, Aditya
   Birla, Jubilant, Arti, Tata) demerging a division. Track these groups'
   announcement flow proactively — they have a repeat track record of value
   creation via demergers, so a fresh one from a known "serial spin-off"
   promoter deserves extra attention even pre-announcement.
4. **Growth-vertical carve-out for fresh capital**: a fast-growing,
   capital-hungry vertical (often loss-making today) is being demerged so it
   can raise dedicated growth capital from investors who specifically want
   THAT exposure, without diluting/complicating the mature parent. Tell:
   pre-listing fundraise rounds into the yet-to-be-listed entity (e.g. Strides
   Pharma/One Source, Good Luck Defense) — an outside investor paying up for
   a private round is itself a signal.

### Corporate-governance overhang can reverse post-demerger

Cases exist (Meghmani → Epigral, Mirza International → Redtape) where a
group had real corporate-governance red flags (related-party dealing,
promoter self-enrichment) that suppressed the multiple for years, but a
demerger — forcing cleaner, independently reported financials in the
resulting entity — caused the market to re-rate sharply even though the
overhang was never formally "resolved," simply because the demerger act
itself signaled intent to clean up. Do not dismiss a demerger from a
governance-flagged group; flag the overhang explicitly but weigh the SOTP
math on its own merits, and note if promoters are increasing skin-in-the-game
in the resulting entity.

### Timing: pre-demerger vs post-demerger, and the "2-week window"

- Timeline from announcement → NCLT/SEBI/creditor/shareholder approvals →
  record date → listing of resulting entity typically runs **12-18 months**
  (can extend to 2.5-3 years for multi-step schemes, e.g. Orient
  Refractories/RHI Magnesita).
- **Pre-demerger buying** = a pure fundamental bet (you're buying the
  combined entity on its current SOTP-implied discount; there is no forced
  catalyst before the corporate action completes). Only do this with high
  conviction on fundamentals AND clear SOTP-implied margin of safety — the
  jubilant-industries-style setup (~5x EV/EBITDA combined vs a conservative
  SOTP of 3x that).
- **The discount closes FAST once announced**: empirically, most of the
  SOTP re-rating happens within **1-2 weeks of the announcement** — well
  before the actual listing/record date. (Jubilant Industries roughly
  doubled within a week of the demerger announcement with zero fundamental
  change.) This means: after ~2 weeks post-announcement, you are no longer
  trading a "special situation" — you are making a fundamental call on
  the business, full stop. Say this explicitly in the insight if the
  announcement is >2 weeks old.
- **Post-demerger forced-selling window**: once the resulting entity lists,
  institutions with market-cap mandates that no longer fit (or index funds
  that must exit a component that's not in the index) create genuine,
  non-fundamental selling pressure — sometimes violent (lower-circuit runs)
  in small-cap resulting entities. This is a SEPARATE, later entry
  opportunity from the announcement-day re-rating. Track: has volume
  indicated the forced-selling is being absorbed (reversal candle / volume
  spike / bulk deals from known special-situations investors)? If reversal
  hasn't happened within ~2-3 weeks of listing, reassess whether your thesis
  was technical (mean-reversion) or fundamental — don't keep holding a
  technical trade that failed to revert.
- Insider/promoter buying alongside the listing (bulk deals, stake increases)
  materially raises the odds of success — always check bulk/block deal data
  and SAST filings for the resulting entity in the weeks after listing.

### What can go WRONG (don't just pattern-match to the wins)

- If the underlying INDUSTRY itself is structurally weak/cyclical-down (e.g.
  Raymond Lifestyle in a depressed consumer/textile cycle), a demerger alone
  does not create value — peers' multiples are depressed too, so there is
  nothing to re-rate TO. Always sanity-check peer multiples in the CURRENT
  cycle, not a historical average.
- A well-known/large/widely-tracked company's demerger may already be fully
  priced by the time you can act — the retail edge is strongest in
  small/under-covered names, not headline conglomerate demergers everyone is
  already discussing.
- Sometimes the post-demerger SOTP simply never gets recognized for years
  (Geodesic case in the reference material: 3x within a year on the
  announcement, then flat for a decade because underlying growth/ROIC never
  materialized). A demerger is a catalyst, not a fundamental substitute —
  ALWAYS end the insight with what would need to be true fundamentally for
  the re-rating to hold.

## Part 2 — Mergers / Acquisitions (control-change, not spin-off)

Distinct dynamics from a demerger: you're evaluating value TRANSFER/CREATION
via combination or control change, not value UNLOCK via separation.

- **Merger arbitrage lens** (Mario Gabelli style): if it's a cash/share swap
  merger with a defined ratio and expected close date, compute the implied
  arbitrage spread (deal terms vs current price) and annualize it against the
  expected timeline — this is a defined-risk, defined-return trade distinct
  from a directional bet. Flag major deal-completion risks explicitly:
  competition/CCI approval, shareholder/creditor dissent, financing
  contingency.
- **Fundamental-value lens** (Joel Greenblatt style): once the arbitrage
  spread closes or was never the point (e.g. a strategic all-stock merger
  with no defined ratio-driven spread), the risk shifts to genuinely
  fundamental — does the combined entity have a better moat, market share,
  or cost structure than either did alone? Value-accretive or dilutive to
  existing shareholders?
- For a straight **acquisition** (one company buying a stake/business, no
  reciprocal demerger): extract stake %, deal value, EV/revenue or
  EV/EBITDA multiple paid (compare to the acquirer's own trading multiple —
  is this accretive or expensive?), funding source (cash/debt/equity —
  dilutive?), strategic rationale, and expected consolidation date. Flag
  related-party acquisitions (self-dealing risk) explicitly.
- Same 2-week-decay logic as demergers applies to the immediate
  price reaction — after that, you're back to fundamentals.

## Part 3 — Management Change

Not just a compliance filing — treat every CEO/CFO/MD/independent-director
change or auditor resignation as a governance-quality checkpoint:

- WHO left, WHO replaced them (or is a successor not yet named — bigger red
  flag), effective date, and the STATED reason (resignation / retirement /
  removal / term completion / "personal reasons").
- RED FLAGS to call out explicitly: abrupt exit before term end with no
  successor named; auditor resignation (especially mid-year, especially
  citing "information/cooperation" issues — this is one of the highest-signal
  governance red flags in Indian markets); a pattern of KMP departures within
  a short window (one exit is noise, three in two quarters is a pattern);
  divergence between the company's stated reason and any market
  chatter/exchange query.
- POSITIVE signal: a credible, experienced external hire into a growth role
  (e.g. a new CEO brought in specifically to professionalize/scale a
  business, as in the Hindware Home Innovation case) — this often PRECEDES a
  demerger or strategic simplification; treat it as a leading indicator worth
  flagging for future-catalyst tracking, not just a standalone event.
  "First turn around, seldom turn" applies here too — a new management team
  alone does not guarantee a turnaround; look for concrete early execution
  evidence (market-share stabilization, margin trajectory) in subsequent
  notes/concalls before upgrading conviction.
- Cross-reference: does this company also have demerger/reorg activity
  in its notes history? Management changes and corporate simplification
  frequently arrive together (per Part 1's serial-spin-off-house pattern).

## Depth guide (applies across all three parts)

- **quick** — 1-2 sentences: what happened, the hard numbers, significance
  tag. No SOTP math, no timing analysis. Use when time-boxed (e.g.
  `gainers-signal`'s top-20 scan) or when the event is clearly minor within
  the category (e.g. a single independent director's routine term
  completion with a named successor).
- **standard** — the global 3-6 sentence structure (what/why/trend/watch),
  informed by this playbook's checklist but not walking through the full
  valuation math in prose.
- **deep** — full treatment: SOTP/arbitrage/governance math shown, explicit
  base-rate/timing call-out (pre- vs post-event, how many weeks since
  announcement), explicit bear case (what would make this NOT work), and a
  concrete "what to watch next" tied to a dated future catalyst (record
  date, NCLT hearing, listing date, next concall). This is the default for
  any `demerger`/`merger`/`acquisition`/`management_change` note unless the
  caller explicitly asks for `quick`.
