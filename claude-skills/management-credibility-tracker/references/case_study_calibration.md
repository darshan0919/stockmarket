# Case Study Calibration

The 4 reference patterns from "AI for the Intelligent Investor" Day 2. Use these as anchors when interpreting a new company's credibility score.

For each case study below: source data, score, what the language pattern looked like, and the action implied.

---

## Pattern A — Mayur Uniquoters (Score: +2, "Under-promise / Over-deliver")

**Business:** Manufactures artificial leather and synthetic leather products for automotive, footwear, and furnishing.

**What management guided:**
- Export growth: 35–36%
- 15% revenue growth over next 2 years
- EBITDA margins: ~24–25%
- Operating margins to 22% by FY27

**What actually happened (Q3 FY26):**
- PAT: Rs 50.73 Cr, up 66% YoY
- EBITDA margins: 24–25% ✓ (matched guidance)
- 9M FY26: 9% revenue, 15% EBITDA, 32% PAT
- Margins already at 23.4% — well ahead of FY27 timeline ✓

**Language pattern:** Conservative HIGH-commitment language across the board ("we will achieve", "guidance is", "target is"). Numbers tend to be the lower end of realistic ranges.

**Implication:** This is the rarest and most valuable management quality. Conservative guidance creates upside surprise potential — the stock tends to re-rate as actuals consistently beat expectations. **Action: HOLD; accumulate on dips.**

**Detection signature:** Beat rate 70%+ over 4-8 quarters; HIGH-commitment language stable; analyst questions tend to be answered with quantitative responses.

---

## Pattern B — Navin Fluorine (Score: +3, "Multi-driver outperformance")

**Business:** Specialty fluorochemicals manufacturer — High-performance Products (HPP), refrigerants, and CDMO services.

**What management guided (Q2 FY26):**
- HPP: continue strong growth trajectory
- 15,000 MTPA R32 capacity by Q3 FY27
- AHF plant (Rs 4.5 B capex) commenced

**What actually happened:**
- HPP: 38% YoY growth ✓
- CDMO: 97% YoY growth ✓ (massive outperformance)
- Revenue: Rs 8.9 B, up 47.2% YoY
- EBITDA: up 129% YoY ✓
- 3 of 3 sub-targets beat

**Language pattern:** HIGH-commitment language with quantitative anchors. Capex guidance comes with board approvals attached ("Rs 4.5 B capex commenced"). Multiple growth drivers all firing simultaneously.

**Implication:** Premium-quality compounder with execution capability across multiple business lines. Score of +3 (3/3 beats) signals an accumulation opportunity. **Action: HOLD/BUY.**

**Detection signature:** Beat rate 90%+ over 4-8 quarters; multiple business lines all delivering; capacity commissioning on or ahead of schedule.

---

## Pattern C — Hikal (Score: -1, "Over-optimistic, deteriorating language")

**Business:** Pharmaceutical and crop protection chemicals manufacturer with CDMO operations.

**What management guided (Q4 FY25):**
- Pharma business: 12–15% revenue growth
- Growth driven by CDMO business
- Expected better H2 performance

**What actually happened:**
- Revenues grew only ~7% YoY — below guidance
- Pharma growth: only 4% YoY (vs guided 12-15%) — **MISSED**
- CDMO grew 21% but API de-grew 8%

**Language pattern (Q3 FY26):** Shifted from HIGH-commitment to "gradual recovery" — the tone deterioration is observable even before the next miss. This is the leading indicator from confidence-language trajectory analysis.

**Implication:** Management was overly optimistic. The shift in language suggests FY26 guidance may also be at risk. **Action: WATCH / RED — reduce position, downgrade thesis confidence.**

**Detection signature:** Beat rate <40% over 4 quarters; HIGH-commitment language declining; "we expect" replacing "we will"; new caveats introduced ("subject to recovery", "depends on demand").

---

## Pattern D — Gravita India (Score: 0, "Mixed delivery")

**Business:** Recycling — primarily lead recycling from batteries, aluminum, plastics; expanding into rubber, copper, lithium-ion batteries.

**Vision 2028 guidance:**
- Revenue CAGR: 25%+ FY24–FY28
- PAT CAGR: 35%+
- Capacity: 3.34 → 7 lakh MTPA by FY28
- New verticals: Lithium-ion + rubber by H1 FY26

**What actually happened (Q3 FY26):**
- Revenue: only 9% in 9M ⚠ (vs 25%+ CAGR target)
- Capacity: 3.40 lakh MTPA — only 1.8% increase from base
- New verticals: **DELIVERED** ✓
- PAT CAGR 32%: **ON TRACK** ✓

**The nuance management language often hides:** "Some delays" was actually significant delays. To reach 7 lakh MTPA by FY28, they need ~1.22 lakh MTPA addition per year. Actual addition: 0.06 lakh MTPA. At current run rate, target is essentially impossible.

**Language pattern:** Mix of HIGH-commitment on PAT (which is on track) with vaguer "some delays" framing on capacity (which is materially behind). When language gets selective like this, it's a flag.

**Implication:** Mixed signals. Some metrics deliver, some miss. Net score 0 — neither a buy nor a sell signal, but downgrades the original Vision 2028 thesis. **Action: MONITOR; reset price targets to base-case (not Vision 2028 case).**

**Detection signature:** Beat rate around 50%; selective language quality (specific on what's working, vague on what isn't); aggressive long-term targets that the run-rate doesn't support.

---

## How to use these patterns

When scoring a new company:

1. Compute the actual score (-X to +X)
2. Look at confidence-language trajectory
3. Examine which metric types are missing vs delivering
4. Match against the closest reference pattern based on:
   - Beat rate
   - Language pattern
   - Specific delivery profile (single-driver vs multi-driver)
   - Capacity / strategic targets vs run-rate gap

If multiple patterns partially fit, the company is its own pattern. Note this in the interpretation but anchor to the closest single pattern for the case_study_match field.

## What's NOT a pattern match

- A score of +2 alone doesn't mean Mayur — Mayur's signature is also the *language conservatism* and the *under-promise / over-deliver structure*. A company that hit guidance but management was using HIGH-commitment language and aggressive numbers isn't Mayur.
- A score of -1 alone doesn't mean Hikal — Hikal's signature is also the language deterioration. A company that missed once but is using stable language might be a one-time event.
- Always read the *texture* of the misses, not just the count.

## Adding new reference patterns

When a new pattern emerges (especially regulatory-driven, sector-specific, or pandemic-driven misses with clear external causes), add a Pattern E, F, etc. here. Don't force every company into the original 4.
