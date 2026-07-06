# 3-Basket Framework — Single-Quarter Result Interpretation

The framework is industry-agnostic. Apply every sub-section to every quarter, even if some return "not applicable" — the discipline of running the full sweep is what surfaces silent flags.

## Anti-hallucination guardrail (apply at the top of Phase 2)

> Answer only from the provided documents (PPT, Transcript, Result). Do not use outside knowledge. For every observation, cite the document + page. If the answer is not explicitly available, say "not found in provided material". Separate facts (Layer 1) from interpretation (Layer 2). Never invent management quotes.

If a topic appears in only one of the three primary documents (e.g., capacity mentioned in PPT but not concall), flag it — silence in the concall about a deck disclosure is itself a signal.

---

# BASKET 1 — BUSINESS

**Question:** *What is improving inside the business?*

Include only the most important triggers. Rank by potential earnings impact, not by length of disclosure.

## 1A. Growth Drivers

Identify any of the following, but only with quarter-specific evidence:
- demand trends (volume vs price split)
- premiumisation / mix shift
- capacity expansion (committed vs commissioned vs operational)
- market share gains (volume or revenue, vs named peers)
- exports (geography, customer concentration)
- pricing power (ability to pass through inputs)
- operating leverage (incremental margin)
- utilization improvement (% utilization disclosed)
- order book strength (book-to-bill, execution period)
- industry tailwinds (specific regulation / standard / programme)
- technology / AI integration (revenue contribution if material)
- distribution expansion (counters / touchpoints / digital reach)
- recurring revenue trends (% of total revenue from subscriptions / AMC / annuity)
- regulatory tailwinds (named policy, expected effective date)
- sector upcycle (where in the cycle the industry sits)

For each driver, write 3 lines:

**Why it matters** — one sentence explaining the mechanism (e.g., "shift to premium variants lifts ASP without proportionate cost").

**Earnings impact** — quantified if disclosed (revenue Rs Cr, margin bps, volume %); estimated if not (label "est.").

**Tag** — `STRUCTURAL` / `CYCLICAL` / `TEMPORARY`. (See decision rules at the bottom.)

## 1B. Margin & Profitability Triggers

Focus only on items that *change the future margin trajectory*. Pure quarterly noise (FX, one-off provisions) goes in the Risk basket.

- gross margin trend (direction + magnitude vs trailing 4Q avg)
- cost optimization programme (named: e.g., procurement, automation)
- product mix evolution
- backward integration (cost saved per unit, or % of input now in-house)
- scale benefits (fixed cost absorption as volumes rise)
- raw material movement (key inputs + % of COGS)
- operating leverage (revenue growth vs fixed cost growth)
- efficiency improvements (productivity per unit / per employee)

For each margin trigger, label sustainability:
- `SUSTAINABLE` — driven by mix / process / scale, persists at higher revenue
- `CYCLICAL` — driven by commodity cycle, will reverse
- `TEMPORARY` — driven by one-off (e.g., inventory gains during input price drop)

## 1C. Capex, Balance Sheet & Cash Flow

Analyse only items that affect future earnings power. Do *not* duplicate a forensic-accounting scan.

- capex plans (Rs Cr committed, FY split, projects named)
- utilization (current % vs target % at full ramp)
- deleveraging (gross debt trajectory, net debt/EBITDA target)
- working capital (DSO / inventory days vs trailing trend)
- free cash flow (FCF/EBITDA conversion if available)
- receivables / inventory (any management commentary on quality)
- interest cost trend (effective rate vs prior, headroom from rate cuts)
- ROCE improvement potential (driver: margin, asset turn, or leverage)

**The single most important question in this sub-section:** *Can capital allocation accelerate future earnings, and is management's stated plan internally consistent with the cash flow capability?*

Examples of inconsistency to flag:
- Capex Rs 500 Cr announced; trailing FCF Rs 80 Cr/year; no fund-raise discussed → debt-funded capex (state it)
- Buyback announced while net debt rising → financial engineering signal
- "Asset-light" claim while gross block rising > revenue → claim contradicts disclosure

## 1D. Future Earnings Triggers

Hidden triggers that don't show up in this quarter's numbers but are visible in disclosures:

- upcoming product launches (with timeline if disclosed)
- regulatory approvals (e.g., ANDA, type approval, BIS certification)
- commissioning of plants in pipeline (capex → P&L lag)
- margin normalization (e.g., legacy contract repricing in 6 months)
- sector recovery (lead indicators from upstream/downstream peers)
- export scale-up (orders in book vs current revenue)
- large deal wins (named customers, contract value)
- formalization trend (organised sector share gain — quantified if possible)
- operating leverage (next leg of revenue with no new capex)
- digital / platform scaling (DAU/MAU growth, take rates)

Tag each as `HIGH CONVICTION` (in book / contracted), `MEDIUM CONVICTION` (guided not contracted), or `OPTIONALITY` (asymmetric upside not in consensus). This taxonomy is shared with `growth-triggers-1pager`.

---

# BASKET 2 — RISK

**Question:** *What can go wrong?*

Do NOT mention generic risks. Only risks specifically visible from management commentary, financials, industry trends, or competitive dynamics this quarter.

## 2A. Business Risks

Examples (only include if observed in this quarter's documents):
- weak demand (volume decline, dealer destocking, channel inventory)
- customer concentration (top-5 or top-10 % of revenue)
- pricing pressure (price cuts disclosed, competitor pricing actions)
- raw material inflation (key inputs rising faster than ability to pass through)
- weak utilization (% utilization that suggests overcapacity)
- debt-heavy capex (gearing post-capex vs current)
- cash flow stress (CFO declining despite revenue growth)
- execution delays (project deferral, capex push-out)
- competition (named competitor entry, capacity expansion, M&A)
- AI disruption (specific threat to product / pricing)
- regulatory risk (proposed change with quantified P&L impact)
- forex exposure (revenue / cost FX mix, hedge status)
- tariff / geopolitical risk (named country, named product)

For each risk, three short labels:

**Severity** — `HIGH` / `MED` / `LOW` (impact on next-12-month earnings)

**Temporary vs Structural** — same taxonomy as growth drivers

**Watch indicator** — the specific data point that would confirm or deny the risk

## 2B. Management Commentary Risks

The highest-signal section. Track:

- **Cautious tone change** — calls 1-2 quarters back were confident, this one isn't (cite quote pair)
- **Weaker guidance** — explicit downgrade, or implicit (range narrowed at the low end)
- **Uncertainty** — phrases like "depends on", "subject to", "we are watching" replacing prior commitments
- **Muted margin commentary** — when prior quarters discussed margin expansion specifically
- **Delayed capex** — phasing shifted, commissioning pushed
- **Softer demand outlook** — sector-level qualifiers replacing company-specific confidence
- **Contradiction in statements** — within the same call, or between PPT + Concall

**Three high-signal questions to ask explicitly:**

1. **What did management *avoid* answering?** Note specific analyst questions where the response was vague or pivoted. Quote both Q and A.
2. **What did they stop discussing?** Topics that dominated 2-3 prior calls and are absent now. Requires prior transcript context.
3. **Where did confidence reduce?** Language ladder: "will" → "expect" → "endeavour to" → "depends on" is a tell.

## 2C. Industry & Macro Risks

Connect macro directly to the company — do not list generic risks.

- tariff risk (specific tariff, specific product line, % of revenue exposed)
- inflation (input cost component, % of COGS)
- interest rates (debt servicing impact at current rate vs management's plan)
- slowdown (lead indicator from upstream or downstream)
- oversupply (industry capacity addition vs demand growth)
- regulatory changes (specific notification expected)
- currency movement (functional currency vs reporting currency mismatch)
- commodity volatility (key commodity + sensitivity if disclosed)
- technology disruption (specific incumbent threat)

Format each as: `<macro factor> → <company exposure> → <P&L impact direction + magnitude>`.

---

# BASKET 3 — MANAGEMENT

**Question:** *What is management signalling between the lines?*

Interpret management behaviour — don't just quote them. Every statement here needs a verbatim evidence quote (1-2 short lines) attached as a citation.

## 3A. Management Tone

Classify against the six tone labels in [`tone_taxonomy.md`](tone_taxonomy.md):

- `AGGRESSIVE` — Growth-first, capex-forward, market-share-grabbing
- `CONFIDENT` — Specific commitments, concrete numbers, range-narrowed guidance
- `CAUTIOUS` — Qualifiers, range-widened, "watching" language
- `DEFENSIVE` — Justifying past decisions, explaining shortfalls
- `OPPORTUNISTIC` — Optionality language, "if X happens we will Y"
- `CONSERVATIVE` — Under-promising deliberately, sandbagging

The tone may be a *blend* (e.g., "confident on margins, cautious on volumes"). State the blend if so. Track confidence specifically on four axes:

- growth confidence (revenue trajectory)
- margin visibility (gross / EBITDA / PAT)
- demand outlook (industry-level)
- capital allocation discipline (capex framing)

## 3B. Change vs Previous Quarters

This requires the prior transcript. The narrative arc is more informative than any single quarter's snapshot. Identify shifts in commentary:

- **survival → expansion** (deleveraging done, now growth capex)
- **debt reduction → growth capex** (capital allocation pivot)
- **weak demand → recovery** (volume green shoots)
- **domestic focus → exports** (channel diversification)
- **commodity → premium products** (mix shift)
- **cyclical → recurring revenue** (business model evolution)
- **expansion → consolidation** (caution flag — was the prior expansion wrong?)
- **buyback → preservation** (cash flow stress signal)

For each shift, write:
- What changed
- One evidence quote from this call
- One contrast quote from a prior call (1-3 quarters back)
- Why it matters for the thesis

## 3C. Strategic Direction (3-5 year)

What is management *building* over the medium term? This sub-section is forward-looking. Pick the 1-2 most credible directional bets from:

- branded play (consumer-facing brand investment)
- platform business (network effects, take rate)
- export-led growth (target geography, target % of revenue)
- premiumisation (target mix at maturity)
- recurring revenue (target ARR / AMC % of revenue)
- solutions business (product → service evolution)
- digital transformation (target digital revenue % or productivity gain)
- asset-light transition (CWIP plateauing, ROCE rising)

For each direction, ask: *Is the disclosure backed by capex + headcount + customer evidence, or is it slideware?*

## 3D. Capital Allocation Quality

Evaluate management's capital discipline using only this quarter's disclosures:

- **capex discipline** — IRR thresholds stated, projects ranked, prior capex outcomes referenced
- **acquisitions** — strategic fit, valuation paid, dilution / accretion
- **debt strategy** — refinancing plan, maturity wall, rate visibility
- **shareholder friendliness** — dividend payout %, buyback execution
- **dividend / buyback policy** — explicit policy vs ad-hoc
- **expansion aggressiveness** — pace vs balance sheet capacity vs market opportunity

Grade as `HIGH` / `MED` / `LOW` and explain why in one line.

---

# FINAL — Investor Monitoring Checklist

A concise list of 6 to 10 items for an investor to track over the next 2 to 8 quarters. Every item must be **falsifiable**: KPI + threshold + horizon + source.

Open [`monitoring_checklist_patterns.md`](monitoring_checklist_patterns.md) for examples and the standard template.

Required columns:

| # | KPI | Threshold | Horizon | Source |
|---|---|---|---|---|
| 1 | Gross margin | ≥ 28% | Q1 FY27 | Result PDF, profitability section |
| 2 | Capex ramp | ≥ Rs 200 Cr spent | H2 FY26 | Quarterly cash flow |
| 3 | Order book | ≥ 1.5× annual revenue | Q4 FY26 | PPT order book slide |

Cover at minimum:
- one KPI from each of: revenue/volume, margin, cash flow, capital allocation
- one indicator the company stopped discussing this quarter
- one industry / external lead indicator

---

# Tag decision rules

When deciding `STRUCTURAL` vs `CYCLICAL` vs `TEMPORARY` for a development:

**Structural** if:
- It changes the company's product mix permanently
- It results from a one-way industry change (regulation, technology shift)
- The driver is internal capability (new plant, new capability, new geography that won't reverse)
- It would persist even if the broad cycle turned

**Cyclical** if:
- The driver is commodity price, interest rate, exchange rate, or industry pricing
- It depends on volume or price cycles that historically oscillate
- Peers in the same industry would show the same pattern

**Temporary** if:
- The driver is a specific one-off (one-time order, inventory destock, FX gain, demerger income, insurance settlement)
- It will not repeat next quarter

When in doubt, ask: *if the macro / commodity / sector cycle turned, would this still be true?* If yes — structural. If no — cyclical.

---

# Output style rules

- Keep output concise but insight-dense
- Avoid long paragraphs — use bullet points heavily
- Every point must add analytical value
- No generic commentary
- No unnecessary number repetition
- Focus on "what changes future earnings power"
- Think like a hedge fund analyst, not a result summarizer
- Use industry-specific reasoning
- Distinguish facts (Layer 1) from interpretation (Layer 2)

**Forbidden phrases:**
- "India is a growing economy"
- "The company is well-positioned"
- "Management is confident about future prospects"
- "Healthy growth in revenue"
- "Margins remain strong"

If you find yourself writing any of these, rewrite the sentence with a specific number and a specific source.
