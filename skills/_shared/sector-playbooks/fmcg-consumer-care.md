# Sector Playbook — FMCG / Consumer Care (Personal Care)

**Purpose:** a reusable, standing reference for tracking and predicting quarterly results in the FMCG–Personal/Consumer Care space (hair oil, soap, shampoo, oral care, talc, grooming). Built while doing a pre-results deep dive on **Bajaj Consumer Care (NSE:BAJAJCON)**, but the sector-level framework below applies to any name in the category (Marico, Dabur, Emami, Godrej Consumer, etc.) — only the company-specific section is Bajaj-only. Update this file rather than re-researching the sector from scratch each time it comes up in `pre-pead-scanner`, `quarterly-result-analysis`, `growth-triggers-1pager`, or `equity-research-deepdive`.

**How this was built:** company section sourced from Bajaj Consumer Care's Q1–Q4 FY26 concall transcripts and investor PPTs (fetched live via `stock-documents-fetcher`, 2026-07-09). Sector section sourced from public web research (GST Council, industry commentary) — see citations inline. Cross-reference `quarterly_macro_context.md` in `pre-pead-scanner/references/` for the live macro backdrop of the quarter being scanned; this file is the _sector_ lens, that file is the _quarter_ lens — use both together.

---

## Part A — Sector tracking framework (reusable for any FMCG–Personal Care name)

### 1. What to check every quarter, in order

1. **Volume vs. value growth split.** FMCG revenue growth is a mix of volume (units sold) and price/mix. A quarter with strong value growth but flat/declining volume is a price-hike-driven quarter, not genuine demand strength — check the COGS line too (if COGS falls faster than revenue, margin expansion is coming from RM cost relief or mix, not volume).
2. **Rural vs. urban growth differential.** This flips periodically — rural outperformed urban through most of FY25/early FY26 on a low base and government transfers; by Q4 FY26 several names (including Bajaj) reported **urban outperforming rural** by 700–800bps, driven by wholesale/modern-trade/e-commerce strength. Don't assume the "rural recovery" narrative is still live without checking the latest quarter's actual channel-wise commentary.
3. **General Trade (GT) vs. Organized Trade (OT: modern trade + e-commerce/quick-commerce + CSD/CPC) mix.** OT is growing share economy-wide (~30% salience and rising for several names) and typically grows faster than GT — a name gaining OT mix is structurally re-rating its growth algorithm, not just having a good quarter.
4. **Raw material (RM) basket and where it sits in the price cycle.** See §3 below — this is the single biggest swing factor for margin in any given quarter.
5. **Pricing actions taken (or not) in the quarter** — MRP/grammage changes, "MLH" (maximum retail price / label) adjustments. Management teams in this sector overwhelmingly avoid giving forward margin guidance (see §5) so the pricing action itself, disclosed after the fact, is often the best forward indicator.
6. **International/export business performance**, if any — typically small (mid-single-digit % of revenue) for mid-cap personal-care names, more volatile than the domestic business, and disproportionately exposed to specific-country political/logistics disruption (Bangladesh, GCC/Middle East, etc.).

### 2. GST 2.0 — the standing tailwind for this category (effective 22 Sep 2025)

India's GST Council rate rationalisation, effective **22 September 2025**, moved the entire "bathroom essentials" basket — **hair oil, toilet soap bars, shampoo, toothpaste, toothbrushes, shaving cream** — from the 18%/12% slabs down to a **5% merit rate**. [Business Standard](https://www.business-standard.com/economy/news/fmcg-sector-benefits-from-gst-as-shampoo-noodles-move-to-5-percent-slab-125090301741_1.html), [PIB — 56th GST Council meeting](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2163555), [News on Air](https://www.newsonair.gov.in/gst-council-approves-major-rate-cuts-effective-september-22/)

This is a **structural, category-wide tailwind still working through the base** as of Q1FY27, not a one-off — industry commentary pegs FMCG sector acceleration of **2–3 percentage points** from the reform. Read-through by quarter:

- **Q2 FY26 (the transition quarter):** channel destocking/restocking noise, GST-transition pipeline effects — several companies flagged this as distorting the underlying growth read.
- **Q3 FY26:** the first full quarter at the new rate — companies that passed the tax saving through as **grammage increases** (more product for the same price point, e.g. Bajaj's ₹1 sachet) saw a genuine volume bump on top of the structural tailwind. This is confirmed in Bajaj's own Q3 FY26 call: management explicitly attributed part of the quarter's outperformance to a sachet grammage increase enabled by the GST cut.
- **Q4 FY26 onward:** the base normalises — a name still citing "GST tailwind" without adjusting for the fact that the comparison base itself now includes the benefit is double-counting it. Always check whether YoY comparisons are GST-adjusted.

**Sector read:** anything in this category (hair oil, soap, shampoo, oral care) has had an unusually favourable structural tax backdrop through FY26 into Q1FY27. When evaluating a "beat," separate the GST-driven structural lift from genuine share gain/distribution execution — the skill's evidence-over-tone principle applies here too.

### 3. Raw material basket — what actually drives margin

The category's RM basket is overwhelmingly **crude/vegetable-oil-index-linked**, which is exactly why this sector interacts so directly with the macro events logged in `quarterly_macro_context.md` (the Iran-war oil shock, in particular):

| RM                                                                     | What it's linked to                                                  | Typical role                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LLP (Light Liquid Paraffin)**                                        | Direct crude-oil derivative                                          | Base oil for mineral-oil-based hair oils; the most crude-sensitive line item in the basket                                                                                                                                        |
| **Plastic packaging (bottles/sachets)**                                | Crude/polymer prices                                                 | Moves with the same cycle as LLP, compounding the effect                                                                                                                                                                          |
| **Seed/vegetable oils** — mustard (RMO), almond, coconut/copra, sesame | Global edible/seed oil index, monsoon-dependent domestic crop output | "Natural" oil bases; almond and mustard have been observed trading in close lockstep with the broader oil index even though they're not literal crude derivatives — don't assume "natural oil" means insulated from a crude shock |

**Pass-through mechanics, per Bajaj Consumer Care's own Q4 FY26 disclosure** (directly transferable framework for any name in this category):

- Management stated **"nearly 100% of our cost base is under inflation"** during the Q1FY27 crude spike — i.e. there is no RM line that's naturally hedged; the entire basket moves together in a shock, just at different intensities (some lines saw 50–60% inflation, others 20–30%, in the same event).
- The near-term buffer is **inventory position**, not pricing power — companies that have pre-bought RM at pre-shock prices can hold retail pricing "in a narrow band" for a quarter or two while "monitoring daily," buying time before a shock has to be passed through.
- When a pass-through does happen, it tends to arrive as **MRP/MLH adjustments or grammage changes** at the SKU level rather than a blanket price hike — check the PPT/concall for specific SKU-level actions, not just a stated "we took pricing."
- **Full pass-through is rarely instant or complete** — margin aspiration is typically expressed as a _band_ ("low to mid-20s [gross/EBITDA] margin," in Bajaj's case) that management tries to defend through the cycle via a mix of inventory buffering, grammage/pricing tweaks, and product mix shift (more accretive brands/SKUs), not a single lever.

**How to use this in a pre-results prediction:** cross-reference the RM-price event in `quarterly_macro_context.md` (Event 1, Iran war oil shock) against the quarter being predicted. If the shock quarter is Q1FY27 (Apr–Jun 2026, when crude averaged ~$110/bbl), expect margin pressure in FMCG-personal-care names' Q1FY27 results **even though spot crude has since fallen back to ~$70/bbl** — the P&L will show the quarter as it was lived, not as it looks today. This is the single most important macro-to-fundamental linkage for this sector this quarter.

### 4. Guidance-giving culture in this sector

Several names in this space (Bajaj Consumer Care explicitly, and this is common across the sub-sector) **do not give forward margin or growth guidance as a matter of stated policy** — "We don't give guidances" is a recurring, near-verbatim line across multiple quarters of Bajaj's calls. What they will typically share instead:

- A **qualitative margin "aspiration band"** (e.g., "low to mid-20s") rather than a point guide.
- Backward-looking colour on what drove the last quarter (mix, channel, RM).
- Directional commentary on strategy (brand investment, distribution expansion) without quantifying the expected payoff.

**Implication for the pre-PEAD workflow:** for a "no guidance" name in this sector, the capability-validation case has to be built almost entirely from (a) the RM pass-through analysis above, (b) channel-mix momentum (OT salience, GT urban/rural split), and (c) the margin-aspiration band as a soft anchor — not a hard guided number. Don't force a numeric "surprise vs. guidance" score where none exists; say so explicitly, as the skill's Core Principles require.

### 5. Seasonality

- Hair-oil-led personal care names have historically been described (by sell-side, echoed without correction by management on Bajaj's Q4 FY26 call) as having **relatively low seasonality in Q4 (Jan–Mar)** versus other quarters — a Q4 beat is more likely to be genuine share/execution rather than a seasonal high.
- **Q3 (Oct–Dec)** carries festive-season and wedding-season demand for grooming/personal-care in general, plus (in FY26 specifically) the GST-transition pipeline-fill effect noted in §2 — treat Q3 growth rates with more scrutiny for one-off inflation.
- Company-specific seasonal claims should always be checked against at least 2–3 years of the same quarter's growth rate before being treated as a structural pattern — this file will be updated with a firmer seasonality read once more quarters of history are analysed.

### 6. Competitive backdrop (context, not exhaustive)

Category leaders are Marico (Parachute/Saffola), Dabur, Emami, and Godrej Consumer, with Bajaj Consumer Care a **sub-10% share player** in its core hair-oil category by its own admission (Q4 FY26 call: _"we have a less than 10% market share in our category... we just have to execute and win our space and gain more share"_). A sub-scale share player's growth algorithm leans more heavily on distribution expansion and brand-building execution (its own stated strategy) than on category tailwinds alone — useful context when reading its results against category-level data from a market leader.

---

## Part B — Company note: Bajaj Consumer Care (NSE:BAJAJCON)

_Built 2026-07-09 from Q1–Q4 FY26 concall transcripts + investor PPTs (Stockscans, fetched live). All figures IGAAP, consolidated unless stated._

### Business mix

- Core brand: **Bajaj Almond Drops** hair oil ("ADHO") — explicitly still management's stated focus brand.
- Channel split (as stated on the Q4 FY26 call): **~70% General Trade (GT)**, split roughly half urban / half rural; within the urban GT half, roughly half is wholesale. **Organized Trade (OT) — modern trade, e-commerce/quick-commerce, CSD/CPC — is ~30% and rising**, growing faster than overall OT/GT blend.
- Under new ownership as of the FY26 fiscal year (management referenced "first year under Bajaj ownership" — worth clarifying/verifying the corporate-actions timeline before citing externally, as concall phrasing was ambiguous on whether this refers to a group restructuring rather than a change of ultimate promoter).

### Export / international business share

- **International Business (IB) is small and has been in a multi-quarter decline.** Q4 FY26 IB revenue across all geographies (GCC & Africa, Nepal, Bangladesh, RoW) totalled **~₹16.3 Cr** against consolidated net sales of **~₹326.5 Cr** for the quarter — i.e. **international/export revenue is roughly 5% of consolidated quarterly revenue**, and this share has been falling (IB registered a "weak double-digit decline" for full-year FY26).
- Within IB, **Nepal and Bangladesh are the two markets management called out as "focus markets" and the only ones growing** (with Bangladesh reaching breakeven profitability and Nepal improving); **RoW and GCC & Africa have been consistently weak/declining** across FY26.
- Company also exports to the **US**, described on an earlier call (Q1 FY26) as "under [pressure/review]" amid tariff and geopolitical headwinds — cross-reference against the US tariff status in `quarterly_macro_context.md` (Event 5) for the quarter being analysed, since Bajaj's own US export commentary predates the most recent tariff step-down.
- Management's explicit strategic stance: **"our bull's eye focus is and will continue to remain India"** — international is a secondary, not primary, growth lever for this name. Do not build a China/export-recovery-style thesis on this stock; the domestic GT/OT mix shift is the real driver.

### Raw material / pass-through — company-specific detail

- Direct confirmation of the sector-wide framework in §3: on the Q4 FY26 call (results for the quarter ended Mar 2026, reported Apr 2026 — i.e. just before the Iran-war oil shock hit its peak), management flagged that **"the war in the Gulf has created extreme volatility in the prices of LLP and packaging material"** and that mustard/copra prices had **not fallen as expected** and were holding at pre-war levels.
- **~100% of the cost base was described as under inflation**, at varying intensities (50–60% for some lines, 20–30% for others).
- Buffer strategy through Q4 FY26: **inventory position** (bought before the shock) + **cautious/delayed purchasing** + **narrow-band pricing management**, rather than an immediate blanket price hike.
- Pricing action taken: management confirmed **MLH (MRP/label) adjustments already taken in Q4 FY26**, with further "pricing and cost optimization across the lines" flagged as necessary going into Q1 FY27 if the RM shock persisted.
- **This directly maps onto `quarterly_macro_context.md` Event 1 (Iran war / oil shock, $110/bbl average Apr–May 2026):** Bajaj's Q1 FY27 (Apr–Jun 2026) results — the quarter this company note is meant to support predicting — sit squarely inside the RM-shock window flagged by management itself on the immediately preceding call. Expect the margin conversation on the Q1 FY27 call to center on how much of the LLP/packaging/mustard spike had to be passed through versus absorbed via the inventory buffer, and whether the "low to mid-20s" margin aspiration band held.

### Guidance stance

- Explicit, repeated, near-verbatim across multiple quarters: **"We don't give guidances"** (CEO Naveen Pandey, multiple Q&A exchanges, Q4 FY26 call).
- The closest thing to a forward anchor: an **aspirational margin band of "low to mid-20s"** (an EBITDA/gross-margin range management says it targets to defend through the RM cycle), reiterated when pressed but explicitly declined as a formal "guidance."
- Management also declined to confirm a specific quarterly revenue run-rate (an analyst floated ~₹315–320 Cr/quarter as a "new base" post the Q4 FY26 outperformance) — treat any such run-rate extrapolation as an analyst construct, not company guidance, per the skill's tagging convention (`[estimate]` vs `[guided]`).

### Seasonality — company-specific

- An analyst explicitly noted that **Q4 (Jan–Mar) is typically a lower-seasonality quarter for hair oils**, and management did not dispute this framing while explaining the quarter's outperformance as mix-driven rather than seasonal. Use this as a starting prior, not a confirmed multi-year pattern — verify against 2–3 years of Q4 QoQ prints before treating it as structural.
- **GST-transition effects (§2) contaminate the Q2–Q3 FY26 comparison base** — a name-specific reminder to control for this when computing "normal" seasonality from FY26 data alone.

### What could be wrong with this note

- Only four quarters (Q1–Q4 FY26) of transcripts were reviewed — not enough history to firmly establish a multi-year seasonality pattern; treat the seasonality read as provisional.
- The exact international/export revenue % (~5%) is derived from a PPT table with some OCR/formatting ambiguity in the underlying extracted text (column headers were garbled in extraction) — the ₹16.3 Cr IB and ₹326.5 Cr consolidated net sales figures for Q4 FY26 were cross-checked against two separate table blocks in the PPT and are consistent, but a re-verification against the original PDF (not just the extracted text) is recommended before using this figure in a published output.
- No sell-side/consensus estimates were sourced for this note — it is built entirely from primary-source concall/PPT material and public sector-level news, consistent with the scope caveats already flagged in the pre-PEAD scan for this quarter.
- GST-driven volume tailwind (§2) and RM cost headwind (§3) are pulling in opposite directions for Q1 FY27 — the net effect on margin is genuinely ambiguous from the available evidence and should not be resolved into a single directional call without the actual Q1 FY27 print.
