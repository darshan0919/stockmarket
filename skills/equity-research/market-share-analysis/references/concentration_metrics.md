# Concentration Metrics — Formulas, Thresholds & Interpretation

The math and the thresholds. Pair with `scripts/compute_concentration.py` for the actual computation.

---

## CR_n (Concentration Ratio)

**Formula:**
```
CR_n = sum of top-n players' market share percentages
```

Examples:
- CR3 = share% of #1 + #2 + #3
- CR5 = share% of top 5
- CR10 = share% of top 10

**Interpretation:**

| CR3 | Reading |
|---|---|
| > 70% | Tight oligopoly — typical of capital-intensive industries with high entry barriers (cement regional, telecom, airlines) |
| 50-70% | Loose oligopoly — top players coordinate behaviour but face price competition (paint, two-wheelers, AMCs) |
| 30-50% | Competitive — meaningful #4-10 players (steel, FMCG categories) |
| < 30% | Fragmented — no clear pricing power at top (textiles, kitchenware, regional cement nationally) |

**CR3 vs CR5 vs CR10 reading:**
- CR3 ≈ CR5: indicates a steep drop after top 3 — classic oligopoly with a long tail
- CR3 << CR5: indicates a more even spread across top 5 — "competitive top"
- CR5 ≈ CR10: indicates a very long tail with many small players — "fragmented tail"

**Where CR_n fails:**
- Regional / sub-segment markets where the national CR_n understates concentration
- Captive consumption distorts the denominator
- Imports — must clarify whether CR_n uses domestic-only or total demand

---

## HHI (Herfindahl-Hirschman Index)

**Formula:**
```
HHI = sum of (each player's % share) squared

Player A 25% → 25² = 625
Player B 20% → 20² = 400
Player C 15% → 15² = 225
Others   40% (split: 10/10/10/10) → 4 × 10² = 400
HHI = 625 + 400 + 225 + 400 = 1,650
```

**HHI is more informative than CR_n** because it's sensitive to the **distribution** of shares, not just the count of leaders.

**HHI classification (US DoJ standard, widely used in India too):**

| HHI Range | Classification | What It Means For Investors |
|---|---|---|
| < 1,500 | Competitive / Fragmented | No single player has pricing power; gross margins under constant pressure; share gains require operational outperformance, not luck |
| 1,500 - 2,500 | Moderately concentrated | Top 3-4 set pricing; share is sticky once acquired; M&A typically drives consolidation |
| 2,500 - 5,000 | Highly concentrated | Tight oligopoly; pricing discipline matters more than volume; regulator may scrutinise |
| > 5,000 | Near-monopoly | Single player dominates; antitrust risk; durability of moat is the key question |

**HHI back-of-envelope reference points:**
- 4 equal-share players (25% each) → HHI = 2,500
- 5 equal-share players (20% each) → HHI = 2,000
- 10 equal-share players (10% each) → HHI = 1,000
- 1 player at 50% + 5 at 10% → HHI = 3,000
- 1 player at 80% + 4 at 5% → HHI = 6,500

**HHI limitations (always disclose):**
1. **Regional aggregation problem** — cement national HHI ~800 (fragmented), but each region is ~2,500-3,500 (oligopoly). Always state whether HHI is computed at the relevant competitive geography.
2. **Sub-segment aggregation problem** — pharma overall is fragmented, but each therapy area / patent cluster can be near-monopolistic.
3. **Captive consumption** — if 30% of "production" is captive, exclude it from the denominator. Or compute HHI for "addressable" and "total" both and discuss the gap.
4. **Imports** — for import-exposed industries, include imports as a "player" or be explicit you're computing domestic-only.
5. **Regulatory gating** — HHI looks low, but only 3 players have BIS/USFDA approval. Effective HHI for "approvable supply" is much higher.

---

## Tiering — defining the cuts

The framework's default tiers (in `framework_9parts.md` §2.2):

| Tier | Share threshold | Other criteria | Typical Behaviour |
|---|---|---|---|
| Tier 1 — Scale leaders | > 10% share | Full product range, multi-region, named in industry reports | Set pricing; capex-led growth; M&A active |
| Tier 2 — Specialists | 3-10% share | Focused niche, defensible | Premium pricing in niche; capital-efficient |
| Tier 3 — Regional / commodity | < 3% share | Price takers, limited geography | Thin margins; first to exit downturns |
| Tier 4 — Unorganised / imports | Below MCA threshold or below DGFT tracking | No public disclosure | Largest hidden bucket in many Indian sectors |

**Adapting the cuts** by industry:
- Highly fragmented industries (textiles, footwear): use 5% / 1% / <1% cuts; Tier 1 may be <10%
- Highly concentrated (cement national, telecom): use 20% / 10% / <10% cuts
- Always state the cuts you used in the tier section so they're not arbitrary

---

## Δ bps (basis points share change) — the alpha indicator

```
Δ bps = (share_latest_year - share_T-5) × 100
```

Example: share moved from 18.0% to 22.5% → Δ = 450 bps.

**Reading the bps change:**

| Δ bps over 5 years | Interpretation |
|---|---|
| > +300 bps | Material structural share gain; trigger Part 4 diagnosis |
| +100 to +300 bps | Outperformance; worth understanding |
| -100 to +100 bps | Steady state |
| -100 to -300 bps | Underperformance; trigger Part 4 diagnosis |
| < -300 bps | Material structural share loss; trigger Part 4 diagnosis |

**The "300 bps rule":** Any single player gaining or losing >300 bps over 5 years is doing or experiencing something structurally important. Diagnose it; don't bury it in a "miscellaneous" comment.

**The "500 bps rule":** Any projected Bear-vs-Bull spread >500 bps over the forward horizon is an asymmetric bet — that's where alpha lives in the projection. Flag in Part 8.

---

## Organised vs unorganised — quantification heuristics

For Indian industrial / consumer sectors:

| Approach | When to use | Accuracy |
|---|---|---|
| GST formalisation data (CBIC registered taxpayers in HS code) | Sectors with HS-mapped goods | High for traded goods |
| Top listed player's AR estimate | When they call out unorganised share | Medium — directional |
| Industry association estimate | When association tracks it | Variable |
| Tax data minus identified organised revenue | Where commodity tax data is granular | High |
| Survey-based (NSSO, MoSPI) | Sectors with NSSO coverage (textiles, food processing, services) | Medium — lagging |

**Default assumption to challenge:** organised share has structurally risen 5-15pp in most Indian sectors over the last 5-7 years (post-GST + post-Covid formalisation). If your data suggests otherwise, double-check.

---

## Quick reference — "What do I report?"

For a typical Indian listed-equity-investment-purpose market share analysis, report:

```
Industry Size FY25      : Rs X,XXX Cr
Growth (FY20-FY25 CAGR) : XX.X%
Organised Share         : XX% (vs YY% in FY20)
CR3                     : XX.X%
CR5                     : XX.X%
CR10                    : XX.X%
HHI                     : X,XXX → [Classification badge]
Top Player              : <Name> @ XX.X% share, +/- XXX bps (5Y)
Most Disrupted Player   : <Name> @ XX.X%, -XXX bps
Asymmetric Bet          : <Name> — Bear XX% / Bull XX% / Spread XXX bps
Confidence              : HIGH / MEDIUM / LOW
```

This 10-line block is what the fund manager actually wants to see in the first 30 seconds.
