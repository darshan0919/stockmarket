# Surprise scoring — two benchmarks and the composite score

This is Steps 5 and 8: turn your independent next-quarter estimate (Step 4) into a *surprise*, and combine the surprise with the valuation and tradeability reads into a single rankable score. The discipline throughout: a surprise is a **difference from an expectation**, so it is only as good as the expectation you measure it against — and there are two expectations that matter, not one.

## Why two benchmarks

The market forms its expectation for a company from two places, and they don't always agree:

- **The street** — sell-side research estimates and the consensus they aggregate to. This is the "official" bar a result is judged against on the day.
- **Management guidance** — what the company itself has told the market to expect. Many investors anchor here directly, especially for names with thin analyst coverage.

Scoring against only one hides the most valuable setups. The four combinations:

| vs Street | vs Guidance | Read |
|---|---|---|
| Beat | Beat | **Cleanest long setup** — you're ahead of everyone. Highest-quality positive surprise. |
| Beat | In line | Street is lowballing a name that's merely doing what it guided. Positive surprise *relative to consensus* — still tradeable. |
| In line | Beat | Street already expects the beat management implies; the "surprise" is priced. Low edge despite a good quarter. |
| Miss | Beat | You think they miss their own guide even though street is soft — a **short/avoid** flag; guidance credibility is breaking. |

Report both surprises for every name and **name the quadrant**. Divergence between the two is signal, not noise.

## Computing each surprise

Let `E` = your Step-4 estimate for the line (Revenue or, preferably, PAT/EPS — the market trades earnings surprise most on the bottom line, so lead with PAT/EPS and show Revenue alongside).

**Surprise vs street:**
```
Surprise_street = (E − Street_est) / |Street_est|
```
Tag `Street_est` `[consensus]`. Source, in order of preference:
1. **Broker/research PDFs the user supplies** — extract the analyst's quarter or FY estimate verbatim (number, broker, date). This is the gold standard; quote it.
2. **A stated consensus figure** if the user or a supplied doc gives one.
3. **Proxy consensus** when nothing better exists: the trailing-four-quarter run-rate grown at the scan's `Revenue Growth TTM` / analyst-implied growth. Flag any proxy explicitly as `[consensus-proxy]` — it is weaker than a real estimate and the reader must know.

**Surprise vs guidance:**
```
Surprise_guidance = (E − Guidance_implied) / |Guidance_implied|
```
`Guidance_implied` is the naive number the market reads straight off the guide — `FY guide − YTD actual`, taken at face value, *without* your capability adjustments. Tag `[market]`. The gap between `Guidance_implied` and your `E` is precisely the value your concall validation added: if management guided ₹X but the order book/utilisation says they land ₹X+Δ, that Δ is your guidance surprise.

Carry ranges through both (your estimate is often a band); report the surprise as a band, not false precision.

## Direction and magnitude labels

Collapse each surprise to a direction + magnitude for the table, but keep the number in the card:

- **Direction:** Beat / In-line / Miss. "In-line" = within ±3% (earnings) or ±2% (revenue) — inside the noise of your own estimate.
- **Magnitude:** small (3–8%), moderate (8–15%), large (>15%). A "large" surprise on a proxy consensus is worth less than a "moderate" one on a real broker estimate — magnitude is only as trustworthy as the benchmark.

## The composite surprise score

The rank is not the raw surprise — it's the surprise adjusted for what's priced and weighted by what's tradeable, gated by whether the company can actually deliver. Think of it as:

```
Composite = SurpriseCore × Deliverability × (1 + Tradeability) × Pricing
```

Kept qualitative on purpose — this is a ranking aid, not a black box. The legs:

- **SurpriseCore** — the blended expected surprise. Weight the two benchmarks by benchmark quality: if you have a real broker estimate, lean on `Surprise_street`; if street is only a proxy, lean on `Surprise_guidance`. Sign it (positive = beat, negative = miss).
- **Deliverability (0–1, from Step 3)** — the capability tier. A large surprise with no order-book/capacity support is *not* credible; multiply it down. This is the credibility gate: a HIGH-capability name keeps its surprise, a LOW-capability name has its surprise heavily discounted because the "beat" rests on tone, not evidence. **Weight up beats driven by the two structural PAT levers** — capex-live operating leverage and balance-sheet deleverage (Step 4): a beat you can attribute to incremental high-margin volume on newly-commissioned capacity, or to a quantified interest saving from lower debt, is far more bankable than one resting on a hopeful revenue number, because both are close to arithmetic once the inputs are known.
- **Tradeability (from Step 7)** — the historical drift signature. `strong-positive-drift` amplifies a positive surprise (the market reliably rewards beats here); `fade` shrinks it (good results get sold).
- **Screener cross-check (from Step 3c)** — a conviction modifier, not a weighted leg. Independent Screener insights that *agree* with your thesis (`good-quarter-expected`, `debt-reduced`) nudge the composite up; ones that *contradict* it (`poor-quarter-expected`, `debt-increased`, `working-capital-stretch`) must be resolved before ranking, and if unresolved they cap conviction; governance flags (`promoter-pledge`/`promoter-selling`) cap it regardless of the numbers. See `screener_insights.md`.
- **Pricing (from Step 6)** — the expectations modifier. Clear discount to research target amplifies; at/above target discounts, because the beat is likelier already in the price.

## Rank rubric — the tiers

Assign each name a tier from the *composite*, not from any single leg. Use as a guide, not a rigid formula:

**TOP (high-conviction positive surprise)** — all of:
- Positive surprise versus *both* benchmarks, or a large positive versus street with at least in-line versus guidance.
- Deliverability HIGH: order-book coverage ≥ guided number, or commissioned capacity with utilisation headroom, or a run-rate that already lands the number.
- Not richly priced: clear upside to research targets.
- Tradeable: `positive-drift` or `strong-positive-drift` after results.

**MIDDLE** — a positive surprise exists but one leg is weak: it beats only one benchmark, or deliverability is MEDIUM (aggressive-but-plausible jump), or the stock is already priced for it (at target), or drift history is `noisy`. Real but with a named catch.

**BOTTOM / AVOID** — miss versus one or both benchmarks, *or* the surprise rests on LOW-deliverability tone with no evidence, *or* it's richly priced into a `fade` name (good result likely sold), *or* guidance was walked back. Include for completeness; often belongs in honourable mentions rather than the ranked longs.

Sort the master table by composite, TOP → BOTTOM.

## What to record per company (feeds table + card)

- Your estimate `E` (Revenue, PAT, EPS) with the Step-4 maths.
- `Street_est` (with broker + date, or `[consensus-proxy]` and how derived) and `Surprise_street` + quadrant.
- `Guidance_implied` and `Surprise_guidance`.
- The blended direction/magnitude label and the composite tier.
- One line on **which benchmark you trust more here and why** (real broker estimate vs proxy; fresh guide vs stale).
- A **PAT-surprise decomposition** — how much of the beat is topline vs capex-live operating leverage vs deleverage interest saving. A beat concentrated in the two structural levers is higher-confidence; say so, and carry the ₹-per-lever figures from Step 4.

## What could be wrong here

- **Stale or thin consensus** — a single old broker note is not "the street". If coverage is thin, say so and lean on the guidance benchmark; don't dress a proxy up as consensus.
- **Anchoring your own estimate to the guide** — if `E` is just `FY guide − YTD` with no independent validation, then `Surprise_guidance` is mechanically ~zero and you've added nothing. The surprise vs guidance is only meaningful when your capability work moved `E` away from the naive guide.
- **Revenue beat, earnings miss** — a company can beat on the top line and miss on PAT (margin, one-offs, tax). Always carry the surprise down to PAT/EPS; that's what the market trades.
- **Sign errors** on a miss — double-check the direction label against the arithmetic; a negative surprise mislabelled "Beat" is the worst failure this skill can make.
