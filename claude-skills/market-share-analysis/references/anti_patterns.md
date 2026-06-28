# Anti-Patterns — The Things You Will Not Do

These are absolute rules. The original prompt is opinionated about what NOT to do because each anti-pattern represents a class of error that has cratered an investment thesis somewhere. Each one below has the rule, why it matters, and an example.

---

## 1. Do not cite "industry sources estimate" without naming the source

**Why it matters:** An unnamed source is an unverifiable claim. The reader cannot re-validate it, and you have no defence if it turns out wrong.

**Bad:**
> "Industry sources estimate the SS tubes market at Rs 14,000 Cr."

**Good:**
> "Jindal Stainless Q4 FY25 IP slide 12 puts the addressable Indian SS tubes market at Rs 14,500 Cr; JISA's FY25 industry report puts it at Rs 13,200 Cr (gap: 9%, no resolution rationale; we use Jindal's higher figure for upper-bound conservatism). [Sources: Jindal IP Q4 FY25 p.12, accessed 17-May-2026; JISA FY25 report p.8, accessed 17-May-2026]"

---

## 2. Do not quote market share to 1 decimal place when underlying revenue is rounded to Rs 100 Cr

**Why it matters:** False precision creates the illusion of analytical rigour where none exists. If you can't measure the input to ±10 Cr, you can't deliver share to ±0.1%.

**Bad:**
> "Player A holds 22.4% market share."
> (Underlying: Player A revenue Rs 3,300 Cr ± Rs 200 Cr; industry size Rs 14,500 Cr ± Rs 1,000 Cr.)

**Good:**
> "Player A holds ~22-23% market share (best estimate 22.5%, range 20-25% given Rs 200 Cr precision band on the revenue and Rs 1,000 Cr precision band on industry size)."

**Rule of thumb:** Round share to the nearest 0.5% unless your inputs are individually accurate to ±2%. Round to the nearest 1% if inputs are rougher.

---

## 3. Do not use TAM numbers from a >2-year-old consulting deck without flagging staleness

**Why it matters:** Market sizes move 5-15% per year. A 3-year-old TAM is a different industry from today's.

**Bad:**
> "The Indian QSR market is Rs 26,000 Cr [source: BCG report 2022]."

**Good:**
> "BCG's 2022 estimate put the Indian QSR market at Rs 26,000 Cr; extrapolating at the post-Covid 14% CAGR (Westlife and Devyani concall guidance) gives ~Rs 38,000 Cr for FY25, which aligns with NRAI's FY24 estimate of Rs 35,000 Cr (FY24 → FY25 at 14% = Rs 40,000 Cr). We use Rs 38,000 Cr as the base." [Source: BCG 2022, NRAI FY24, accessed 17-May-2026]

---

## 4. Do not describe a fragmented industry's leader as having a "moat" without evidence of pricing power

**Why it matters:** In a fragmented industry, the largest player is often just "the biggest of many price-takers." That's not a moat — that's a scale claim. The moat test is **pricing power**.

**Bad:**
> "Player A, with 12% share, enjoys a clear moat in this industry."

**Good:**
> "Player A's 12% share has not translated into pricing power: gross margin has compressed from 28% to 22% over FY20-FY25 against a flat input-cost environment, suggesting they price-followed Tier-3 players down. Scale ≠ moat in this industry."

OR (where there is a moat):
> "Player A's 12% share is backed by pricing power: gross margin held at 28% through the FY22-FY23 nickel volatility while smaller players compressed by 400-700 bps, evidencing pass-through ability from contractual customer captivity. This is a moat."

---

## 5. Do not project a player gaining >500 bps of share over 3 years without a capex / contract story to back it

**Why it matters:** A 500 bps share gain requires either substantial capacity addition or a contracted shift in customer flow. If neither exists, the projection is wishful.

**Bad:**
> "Player A gains 800 bps to reach 30% share by FY28."

**Good:**
> "Player A gains 800 bps to 30% share by FY28, contingent on: (a) the Rs 1,200 Cr brownfield capex announced in Q4 FY25 commissioning by Q3 FY27 (+30% capacity); (b) the L&T defence contract worth Rs 800 Cr realising over FY26-FY28; (c) Player X's continued absence in the seamless segment due to BIS de-certification of two plants. If any of these slip, share gain compresses to +300 bps. [Source: Player A IP Q4 FY25 p.18; L&T announcement 12-Mar-2026]"

---

## 6. Do not compare market shares across players using different fiscal years without normalization

**Why it matters:** Comparing FY25 (Mar-end) data of Player A with CY24 (Dec-end) data of Player B is comparing different 12-month windows in different macro conditions.

**Bad:**
> "Player A FY25 share 22.5%; Player B CY24 share 18.3%."

**Good:**
> "Player A FY25 share 22.5%; Player B CY24 share normalised to FY25 = 18.0% (using Q1 CY25 ≈ Q4 FY25; +1.5% calendar adjustment based on quarterly revenue). Footnote: Player B reports on calendar year. [Source: Player B Q1 CY25 result, accessed 17-May-2026]"

---

## 7. Do not treat "Others" as a homogeneous block when it contains the next disruptor

**Why it matters:** The "Others" residual often hides 1-2 fast-growing players that will become Tier-2 in the next horizon. Lumping them as "Others — fragmented" misses the disruption.

**Bad:**
> "Others: 11% — fragmented, no individual player >2%."

**Good:**
> "Others: 11%, comprising:
> - Identified small players: Player K (1.8%, growing 35% YoY — emerging Tier-2 candidate), Player L (1.5%, declining)
> - Unorganised sector: ~4% [E] (regional decorative tube fabricators, formalising under BIS pressure)
> - Imports: ~3.5% (mostly Chinese seamless, anti-dumping under review)
> - Unidentified: ~0.2% (likely tiny captive feeders)
> 
> [Analyst note: Player K is the most-watched name in Tier 4 — at current growth and capacity addition, plausibly 4% by FY28.]"

---

## 8. Do not decorate `[E]` estimates with false precision

**Why it matters:** If you don't know it, write it like you don't know it. False precision on an estimate misleads the reader about confidence.

**Bad:**
> "Player M unorganised share estimate: 4.27% [E]"

**Good:**
> "Player M unorganised share estimate: ~4-5% [E] — derived from GST registration count in HS-code 7306 minus organised players' revenue; range reflects 20% uncertainty on the GST-formalisation methodology."

---

## 9. Do not call something a "moat" before doing Part 5

**Why it matters:** Part 5 forces evidence per dimension. Until that work is done, "moat" is just a word.

**Bad (in Part 4 narrative):**
> "Player A is gaining share thanks to its strong moat in decorative tubes."

**Good:**
> "Player A is gaining share — likely driven by what looks like distribution depth (60% of decorative tube dealer network vs 35-40% for #2-3). Whether this is a durable moat or a temporary lead is examined in Part 5."

Then in Part 5, with evidence:
> "Player A barrier-to-entry score: 4/5. Evidence: 8,500 dealer network depth (1.6x #2), with average dealer tenure 7 years; replicating this requires 4-5 years of incentive spend. Pricing power 3/5: gross margin held within ±100 bps over FY20-FY25, indicates price-discipline ability but no pricing leadership."

---

## 10. Do not write the Verdict before doing the Analysis

**Why it matters:** Confirmation bias. If you decide who wins before doing the work, the analysis becomes window-dressing.

**Bad (mental model):**
> "Player A is obviously the winner. Let me build the report to support that."

**Good (mental model):**
> "I'll build Parts 0-8 from primary sources. The verdict in §4 'Structural winner' and §8 'Forward projection' must follow from that data. If the data points elsewhere, my prior is wrong."

---

## 11. Do not skip Part 0

**Why it matters:** The verification block is what makes the report defensible. Skip it and the entire report becomes "trust me, bro."

The verification block is visible at the **top** of the output specifically so readers see the data hygiene before they see the conclusions. This forces the analyst to do the work in the right order.

---

## 12. Do not present `[E]`-heavy tables without downgrading confidence

**Why it matters:** A pretty table populated with estimates LOOKS like a fact table. Readers will treat it as one unless you flag it explicitly.

**Rule:** If `[E]` count exceeds 40% of the player table, the verification block must show **Confidence: LOW** and the executive summary must lead with "Estimate-heavy — directional only."

---

## 13. Do not generate forward share projections without internal consistency checks

**Why it matters:** Per-player projections that don't sum to ≤100% in the base case are mathematically broken. Bull cases for everyone are logically impossible.

**Self-check before publishing:**
- Sum of base-case shares (including "Others") ≤ 100%? (Equality preferred.)
- Sum of bull-case shares of all named players ≤ 100% minus the floor for "Others"? Otherwise it implies "Others" goes negative.
- Bull case for any one player — is it conditional on bear cases for specific competitors? State the conditional.

---

## 14. Do not let analyst opinion sneak into fact statements

**Why it matters:** Facts vs opinion are different epistemic categories. Mixing them is how reports become unreliable.

**Bad:**
> "Player A is the obvious leader, holding 22.5% share."

**Good (separated):**
> "Fact: Player A holds 22.5% share [Source: AR Segmental Note, FY25].
> [Analyst View]: This share position appears defensible given (a) capacity utilisation at 87%, (b) ARR commentary suggesting price discipline, (c) dealer network depth. The 'obvious leader' framing is editorial and should be tested in Parts 4-5."

---

## 15. Do not use industry boilerplate language

**Why it matters:** "Indian X market is growing rapidly driven by favourable demographics and rising urbanisation" is a sentence that fits any industry and adds zero information.

**Bad:**
> "The Indian air conditioner market is growing rapidly driven by favourable demographics and rising urbanisation."

**Good:**
> "Indian residential AC volume grew at 13.8% CAGR FY20-FY25 (industry size FY25: 9.5m units, FY20: 5.1m units), driven by: (a) rural electrification reaching 99% (vs 92% in FY20), (b) inverter mix going from 23% to 65% (lower running cost), and (c) BEE star-rating tightening killing low-end window AC share from 22% to 11%. [Source: CEAMA FY25 report; CMIE energy database; BEE notification database]"

---

These 15 anti-patterns are not aesthetic preferences. They are the difference between an institutional-grade report and a Substack post.
