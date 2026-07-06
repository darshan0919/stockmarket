# Market Share Analysis — Full 9-Part Framework

Expansion of the framework with extraction guidance, evidence requirements, and rendering format for each part. Read this top-to-bottom before doing the analysis.

---

## Part 0 — Mandatory Data Verification Protocol

**This is non-negotiable. The output of this part is a visible block at the top of the report — readers see your data hygiene before they see your conclusions.**

### Checklist (run in this exact order)

**0.1 Industry size triangulation**
- Pull TAM from at least **2 independent primary sources**:
  - Industry association reports (FICCI, CII, sector bodies like JISA, SIAM, IBA, AMFI, IBEF, etc.)
  - Government statistics (MoSPI, Ministry data, regulatory body annual reports — SEBI, IRDAI, TRAI)
  - Top listed player's annual report / latest investor presentation (they cite industry size to justify their share)
  - Regulatory filings (DGFT for trade, CCI for sector studies, PIB notifications)
- If the two sources disagree by >15%:
  - Document the gap as a verification note
  - Pick the **more recent and more granular** number
  - State the rejection rationale
- **Forbidden sources for TAM** (cite-but-don't-rely): Substack posts, aggregator blogs, Wikipedia, generic Statista headline numbers without methodology

**0.2 Player revenue verification**
- For every player named in the table, pull latest segment revenue from:
  - **Listed:** BSE/NSE annual report (preferred), latest quarterly result + investor presentation
  - **Unlisted:** MCA filings (via Tofler / Zauba / Probe42), KPO databases, news reports
- For each player, note **which source** the revenue came from in the schema's `players[].notes` field
- Never rely solely on Substack, aggregator blogs, or Wikipedia for player revenues

**0.3 Segment definition lock**
- Before any number gets compared, define what's IN and what's OUT in one paragraph:
  - Product/service types included
  - Product/service types excluded
  - Captive consumption: in or out?
  - Exports: in or out?
  - Imports: counted on the demand side?
  - Geographic boundary: matches `<<GEOGRAPHY>>` variable
- If the definition cannot be locked without user input, **stop and ask the user** before proceeding. Many "market share" disputes are definition disputes.

**0.4 Currency & period normalization**
- All players must be on the same fiscal-year basis (typically March year-end for India). Flag any company on a different calendar (e.g., Dec year-end for some MNC India subs) — calendarise their figure using quarterly data or footnote the mismatch.
- All revenues in the same currency unit (`<<CURRENCY & UNIT>>`). Convert at the period's average FX rate, not spot. Footnote the rate used.

**0.5 R/D/E source tag — for every share number**
- `[R]` = **Reported** by the player itself (e.g., "We hold 18% of the urban credit card market" — in their IP or annual report). Use with caution; companies overstate.
- `[D]` = **Derived** (player segment revenue ÷ industry size, both verified). The cleanest tag.
- `[D-segment]` = Derived after carving out a segment from a multi-business company (less clean than `[D]`; mandates a footnote).
- `[E]` = **Analyst estimate** (no hard source — triangulated from indirect signals).
- `[E-floor]` = Estimate that is almost certainly the minimum (e.g., "at least 5% based on capacity").

If `[E]` count exceeds 40% of the player table, **downgrade overall confidence to LOW** and say so in the verification block.

### Output of Part 0 — the visible block

The HTML widget renders this at the top, before the executive summary:

```
[VERIFICATION BLOCK]
TAM Sources                : [Source A, Source B]
TAM Range Across Sources   : Rs X–Y Cr (gap %)
Player Revenue Sources     : <count> from AR, <count> from MCA, <count> from web/news
Definition Scope           : <one-line confirmation>
R/D/E Mix (across N players): R=<x>, D=<y>, E=<z>
Confidence Rating          : HIGH / MEDIUM / LOW
Open Definition Questions  : <list — these block proceeding>
```

---

## Part 1 — Industry Definition & Sizing

### 1.1 Industry boundary (one paragraph)
- One paragraph: what's included, what's excluded, and **why this scope**.
- Reference NIC code or relevant classification standard if applicable (NIC 2008 for India).
- Distinguish "the industry" from "the supply chain" — the framework is built on serviceable revenue, not gross output.

### 1.2 TAM / SAM / SOM
- **TAM** (total addressable, full universe — global if applicable)
- **SAM** (serviceable — players in `<<GEOGRAPHY>>` can realistically reach with current capability + reasonable expansion)
- **SOM** (currently served — actual revenue pool of named players combined)
- All three in `<<CURRENCY & UNIT>>` for the latest completed fiscal year
- **Show methodology explicitly** — for SAM: "TAM minus exports-only regions, minus segments where no Indian player is BIS-certified, etc."

### 1.3 Historical industry growth
Table with one row per year for `<<HISTORICAL HORIZON>>`:

| Year | Industry Size | YoY % | Notes (macro distorters) |
|---|---|---|---|
| FY20 | Rs X Cr | - | Pre-Covid |
| FY21 | Rs Y Cr | -8% | Covid demand shock |
| FY22 | Rs Z Cr | +24% | Pent-up rebound + restocking |
| ... | ... | ... | ... |

End with **5Y CAGR** and a one-line interpretation: cyclical recovery / secular growth / structurally declining.

Note distorters explicitly: Covid, demonetisation, China+1 onset, war/sanctions, sector regulation changes, GST transition.

### 1.4 Sub-segment split
Break the industry into 3-6 sub-segments that **a buyer/seller would actually transact in**:
- Product type (commodity vs specialty)
- End-use (industrial vs consumer)
- Channel (B2B vs B2C)
- Customer tier (mass vs premium)
- Geography (urban vs rural — if relevant)

Pick the one dimension that is most decision-relevant. Show share of total industry by sub-segment for the latest year. Note where players differ in sub-segment mix.

---

## Part 2 — Market Structure

### 2.1 Concentration metrics
Compute using `scripts/compute_concentration.py`:

| Metric | Formula | Interpretation |
|---|---|---|
| CR3 | Sum of top 3 player shares | Quick read on oligopoly tendency |
| CR5 | Sum of top 5 player shares | Standard "consolidation" measure |
| CR10 | Sum of top 10 player shares | How long the tail is |
| HHI | Sum of squared % shares (e.g., 25% = 25² = 625) | Sensitive to dominance, not just count |

HHI classification (US DoJ):
- HHI < 1,500 = competitive / fragmented
- 1,500–2,500 = moderately concentrated
- HHI ≥ 2,500 = highly concentrated

**What HHI misses (always discuss):**
- Regional monopolies hidden inside a fragmented national market (e.g., cement, where each region is a 4-5 player oligopoly but the national HHI is moderate)
- Captive consumption (not on the market at all — distorts share calculations downward for non-captive players)
- Technology / regulatory gating (HHI looks low but only 3 players have BIS/USFDA/CE — effective concentration is much higher)
- Buying syndicates / customer captivity (consumer side dominance limits seller-side pricing power despite low seller HHI)

### 2.2 Tiering
Group players into tiers based on **scale + capability + strategic positioning** (not just revenue):

| Tier | Definition | Typical Behaviour |
|---|---|---|
| Tier 1 — Scale leaders | >10% share, full product range, multi-region | Set pricing; capex-led growth; M&A active |
| Tier 2 — Specialists | 3-10% share, focused but defensible niche | Premium pricing in their niche; capital-efficient |
| Tier 3 — Regional / commodity | <3% share, price takers | Operate on thin margins; first to exit in downturns |
| Tier 4 — Unorganized / imports | Below MCA disclosure threshold or below DGFT tracking | Largest hidden bucket in Indian industries (textiles, footwear, kitchenware, etc.) |

State **which tier you put each named player in** and the cutoff thresholds used.

### 2.3 Organized vs unorganized split
**Critical for most Indian industrial sectors.**
- Quantify the split for the latest year (organized %, unorganized %, imports % — three buckets)
- Show the shift over `<<HISTORICAL HORIZON>>` (typically organised has gained 5-15pp post-GST)
- Identify the structural drivers:
  - **GST** — single tax made unorganized cost advantage smaller
  - **BIS / quality standards** — mandatory certification kills sub-scale players
  - **Energy / fuel costs** — capital-intensive players have efficiency edge
  - **Customer formalisation** — large customers prefer GST-registered suppliers
  - **Compliance burden** — EPF, ESI, labour codes hurt small unorganized players
  - **Bank credit access** — formal players get cheaper credit
  - **E-commerce** — branded consumer products win share from local unbranded

---

## Part 3 — Player-by-Player Market Share Table

**This is the centrepiece. Render it as the primary sortable table in the widget.**

Schema per player:

| Field | Type | Notes |
|---|---|---|
| rank | int | Latest year ranking |
| name | str | Player name |
| listed | str | "Listed" / "Unlisted" / "Captive of <Parent>" |
| ticker | str | If listed, NSE:XXX / BSE:XXX |
| revenue_cr_latest | float | Latest segment revenue in Rs Cr |
| share_latest | float | Latest year share % |
| share_t5 | float or None | Share % 5 years ago (or earliest year available) |
| delta_bps | float | (share_latest - share_t5) × 100 |
| source | str | One of: R, D, D-segment, E, E-floor |
| notes | str | Footnote — carve-out methodology, anomalies, dating mismatches |

### Rules
- Order by `share_latest` descending
- **Include "Others" as the residual row** (share % = 100 - sum of named players)
- For "Others," footnote whether it contains:
  - Identified small players (<2% each) — list them
  - Unorganized sector — quantify
  - Imports — quantify
  - "Genuinely unidentified" — flag this
- For multi-segment companies, **footnote the carve-out methodology** (e.g., "FY25 segment revenue from Note 32, Segmental Reporting, p.187"). Mark with `[D-segment]` not `[R]`.
- For listed companies, prefer audited annual report numbers over investor presentation claims (which can be loose)

### The 5-year share change is where the alpha lives
A player gaining 500 bps over 5 years is doing something structurally different. Diagnose this in Part 4.

A player losing 500+ bps is either disrupted, mismanaging, or in transition. Diagnose this in Part 4 too.

### Anti-pattern: false precision
- If underlying segment revenues are rounded to Rs 100 Cr, do NOT quote share to 1 decimal place. Round to 0.5% intervals.
- Specific case: don't write "22.4%" when the underlying is "Rs 3,300 Cr ± Rs 200 Cr / Rs 14,500 Cr industry."

---

## Part 4 — Market Share Dynamics (The Why)

For each of the **top 5 share gainers** and **top 3 share losers** over `<<HISTORICAL HORIZON>>`, write a 2-3 sentence diagnosis covering:

1. **What they did right / wrong** — pick the dominant lever:
   - Capacity addition (capex timing)
   - Product mix shift (commodity → specialty, or vice versa)
   - Pricing discipline (held price vs cut to fill capacity)
   - Distribution expansion (channel adds, geographic spread)
   - M&A (bought share, integration outcome)
   - Customer wins / losses (named accounts)
   - Cost position (raw material backwards integration, locational advantage)
   - Brand / positioning shift
2. **Structural vs cyclical** — is the share gain durable past one cycle, or a cycle artifact (e.g., cement company gaining share in a regional shortage that will normalise)?
3. **Next 3 years** — extends, stalls, or reverses? Tie to specific catalysts (capex coming online, contract expiries, regulatory deadlines).

### Synthesis paragraph: "The structural winner"

After the per-player diagnoses, write ONE paragraph: who is the structural winner of this industry by `<<FORWARD HORIZON>>`, and why? Reason from:
- Capex pipeline alignment with demand
- Moat durability (see Part 5)
- Cost position vs peers
- Customer captivity

Mark this paragraph clearly as `[Analyst View]`.

---

## Part 5 — Competitive Moat Mapping (Porter + Greenwald)

For each **Tier 1 player only** (typically 3-5 names), score 1-5 across four dimensions, each with an **evidence column** (not opinion):

| Dimension | What it measures | Evidence required |
|---|---|---|
| Barrier to entry | What stops a well-funded new entrant in 2-3 years? | Specific: BIS license count, plant gestation period, IP holdings, dealer network depth, regulatory licenses, scale economies threshold |
| Pricing power | Can they pass through input cost increases without volume loss? | 3-year gross margin trend during input cost volatility; pricing vs index; concall commentary on price discipline |
| Customer switching cost | What does a customer give up by switching? | Qualified vendor list depth (e.g., L&T approved supplier), re-certification timeline, integration complexity, custody risk (asset management) |
| Cost advantage | Structural, not cyclical | Cost/tonne vs peer median, backward integration (captive raw material), energy advantage (captive power, locational), labour productivity |

### Output: a heatmap

```
                  | Barrier | Pricing | Switching | Cost      | Overall |
                  | to Entry| Power   | Cost      | Advantage | (avg)   |
------------------|---------|---------|-----------|-----------|---------|
Player A          |    5    |    4    |    4      |    5      |   4.5   |
Player B          |    3    |    3    |    4      |    3      |   3.25  |
Player C          |    4    |    4    |    3      |    2      |   3.25  |
Player D          |    2    |    2    |    2      |    3      |   2.25  |
```

Color-code the cells: 5 = dark green, 4 = green, 3 = neutral, 2 = amber, 1 = red.

### Anti-pattern: "strong moat" without evidence
- Never write "Player X has a strong moat" without naming the mechanism.
- Never write "leader in fragmented industry" without showing pricing power. In a fragmented industry, the leader often has NO moat — they're just the biggest of many price-takers.

---

## Part 6 — Supply-Demand & Pricing

### 6.1 Capacity vs demand
- **Industry installed capacity** (units / tonnes / MW / branches / dealerships — match the unit to the industry)
- **Latest utilization %**
- **Announced capex pipeline by player** for next 3 years (table)
- **Capex-to-demand ratio:**
  - Capacity coming online over next 3 years ÷ demand growth over next 3 years
  - Ratio >1.2 = over-building risk (margin compression coming)
  - Ratio 0.8-1.2 = balanced
  - Ratio <0.8 = supply-tight (pricing power for current players)

### 6.2 Pricing dynamics
- **Realisation trend** (₹/tonne, ₹/unit, ₹/policy, ₹/transaction — pick the natural unit)
- **Spread vs key input cost** — the spread that matters:
  - Steel: coking coal, iron ore
  - Stainless steel: nickel, chrome
  - Sugar: cane price, ethanol
  - Pharma APIs: KSM costs
  - Cement: power & fuel, slag/fly ash
  - Banks: NIM
- **Import parity vs domestic price** — if relevant, landed cost calculation
- **Pricing discipline** — are top 3 holding price, or breaking ranks?

### 6.3 Raw material concentration
- Commoditised inputs (steel, energy, cotton) → pricing power upstream of you, margin volatility
- Concentrated inputs (specific catalyst, single supplier, geographically concentrated mining) → supplier pricing power
- Captive integration → moat for the integrated player

---

## Part 7 — Disruption & Threat Map

Identify and rank threats by **probability × impact**:

| Threat Category | What to look for | Example |
|---|---|---|
| New entrants | Announced greenfield by player not currently in industry; MNC entry; conglomerate diversification | Adani entering cement; Reliance into renewables |
| Substitution | Alternative product/technology — be specific, not "AI will disrupt everything" | EVs displacing ICE → 7.5x increase in MLCC content per vehicle |
| Imports | Country source (China / Vietnam / Korea / EU) + penetration trend + tariff structure | Chinese SS tubes at landed cost 8% below domestic |
| Regulation | Anti-dumping, BIS standards, environmental norms, tariff changes, GST rate moves | BIS mandatory standard exiting unorganized share holder |
| Customer consolidation / insourcing | Concentration of buyers; vertical integration by customers | Auto OEMs going JV for batteries |
| Technology shift | Process / product technology that flips the cost curve | Continuous casting in steel; AI-driven underwriting in insurance |

Each threat gets:

| Field | Values |
|---|---|
| Probability | Low / Medium / High |
| Impact | Estimated bps of share at risk over `<<FORWARD HORIZON>>` |
| Time horizon | When the threat materialises |
| Early-warning signal | The single most-watchable indicator (one that the analyst can monitor quarterly) |
| Mitigant | What can incumbents do; whether they are doing it |

Sort by `probability × impact_bps` descending.

---

## Part 8 — Forward Market Share Projection

Build **Bear / Base / Bull** projections of player share at the end of `<<FORWARD HORIZON>>`:

For each scenario:
1. State the **2-3 key assumptions** that drive it (be specific — not "favourable conditions"; instead, "anti-dumping duty extended, domestic capex on schedule, no new MNC entry")
2. Show **ending share %** per player AND **bps change vs latest**
3. **Implied revenue CAGR** per player — and **cross-check against announced capex and stated guidance** (if a player needs 25% revenue CAGR for the bull case but has zero capex announced, the bull case is mathematically broken — flag this)
4. **Flag asymmetric bets:** any player whose Bear vs Bull share differs by **>500 bps** is an asymmetric bet — that's where the alpha sits

### Output: a per-player table

| Player | Latest | Bear (Δ bps) | Base (Δ bps) | Bull (Δ bps) | Bear-Bull spread | Asymmetric? |
|---|---|---|---|---|---|---|
| Player A | 22.5 | 21.0 (-150) | 25.5 (+300) | 31.0 (+850) | 1,000 bps | YES |
| Player B | 18.3 | 16.0 (-230) | 18.5 (+20) | 21.0 (+270) | 500 bps | YES |
| Player C | 14.1 | 13.5 (-60) | 14.5 (+40) | 15.5 (+140) | 200 bps | No |
| ... | | | | | | |

### Self-check questions before publishing
- Does the **base case** sum to ≤ 100% (including Others residual)?
- Does the **bull case for any one player** require the bear case of multiple others to materialise — i.e., is it internally consistent?
- Does the **bear case** assume something that's already shown signs of happening, or is it pure tail risk?

---

## Part 9 — Data Quality Disclosure

End the report with:

### 9.1 Confidence rating
Based on the [R/D/E] mix from Part 0:
- **HIGH** — ≥70% of player table is [R] or [D]; TAM triangulated within 10%; no segment definition ambiguity
- **MEDIUM** — 50-70% [R]/[D]; TAM within 15%; some segment definition compromise
- **LOW** — <50% [R]/[D] or >40% [E]; TAM gap >15%; significant unorganized estimation; carve-out heavy

### 9.2 Three biggest data gaps
List the three gaps where, if resolved, the conclusion might change:
- Example: "Unorganised SS tube share — currently [E] at 15% based on GST formalisation pace. If actually 5% or 30%, the organised player share table is materially restated."

### 9.3 Sources used
Tabular list:

| Source | Type | URL / Reference | Pull Date |
|---|---|---|---|
| JISA Industry Report FY25 | Association | jisaindia.in/.../report.pdf | 17-May-2026 |
| Jindal Stainless FY25 AR | Listed AR | BSE | 17-May-2026 |
| MCA filings — Bhandari Group | MCA | tofler.in/.../ | 16-May-2026 |
| ... | | | |

Pull dates are mandatory — they enable re-running the analysis later and they document data staleness.

---

## Closing principle

The reader's question is: "Can I bet money based on this report?" Every section is designed to answer that:

- Part 0 says: *here's how confident you should be*
- Parts 1-3 say: *here's the structure*
- Parts 4-5 say: *here's why it's the way it is*
- Parts 6-7 say: *here's what could change it*
- Part 8 says: *here's how to size the bet*
- Part 9 says: *here's where I might be wrong*

If any of those answers is missing, the report isn't done.
