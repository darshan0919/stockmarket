---
name: market-share-analysis
description: Institutional-grade 9-part market share analysis for an Indian or global industry/sector — data verification protocol with [R/D/E] tagging, TAM/SAM/SOM sizing, concentration metrics (CR3/CR5/CR10/HHI with classification badge), tiering & organised-vs-unorganised split, player-by-player share table with 5-year bps change, share dynamics, Porter+Greenwald moat heatmap, supply-demand & pricing, disruption map, and Bear/Base/Bull forward projection. Use whenever the user names an industry and asks about "market share", "competitive structure", "competitive landscape", "who dominates X", "industry concentration", "how fragmented is X", "CR3 / CR5 / HHI", "organised vs unorganised", "top players in X", "share gainers / losers", "consolidation in X", or wants a sector primer / IPO comparable / competitive benchmarking framed around market share. Outputs an interactive HTML widget with sortable tables. NOT for single-stock analysis (use equity-research-deepdive) or 2-6 named-company comparison (use peer-comparison).
---

# Market Share Analysis

Industry-level competitive structure analysis. The output answers: *who has what share, why they have it, whether it's durable, and what could change it in the next 3-5 years* — defensible to a sell-side review committee, with every number sourced and every estimate flagged.

The deliverable is an interactive HTML widget with sortable tables and a confidence badge driven by the [R/D/E] mix from Part 0.

## When to use this skill

- User says: "market share analysis of X", "competitive structure of X", "who dominates X industry", "CR5 of Y", "HHI of Z", "how fragmented is X", "consolidation in X", "top players in X with their share"
- User wants a sector primer framed around competitive structure (not business model — that's `sector-research`)
- IPO subscription decisions where comparable share needs to be mapped
- Pre-investment industry maps before sizing a position in a sub-sector
- Another skill delegates here for the share-table component of a larger deliverable

## When NOT to use this skill

- Single-stock fundamental analysis → `equity-research-deepdive`
- 2-6 specific listed companies side-by-side → `peer-comparison`
- Pure business-model / unit-economics deep dive on a sector → `sector-research` (different skill, in progress)
- Quarterly result interpretation → `quarterly-result-analysis`

## Conventions

Follow [`_shared/conventions.md`](../_shared/conventions.md). Especially:
- Citation discipline — every market share number, every TAM figure, every capacity number needs a source tag with pull date
- FY26 = April 2025–March 2026
- `Rs Cr` for Indian context, `USD Bn` for global; never mix currencies in one table without normalisation
- Anti-hallucination: never invent a market share number. If a player's segment revenue cannot be carved out cleanly, mark `[D-poor]` (derived but weak basis) rather than fabricate

## Required input

**Mandatory:**
- `INDUSTRY` — e.g., "Indian Stainless Steel Tubes & Pipes", "Indian AMC", "Global Lithography Equipment"

**Strongly recommended (defaults below if omitted):**
- `GEOGRAPHY` — default: `India` (most user requests). Other valid: `Global`, `India ex-captive`, specific state.
- `DEFINITION SCOPE` — what's in / out (sub-segments). If omitted, the skill must propose a scope in Part 0 and ask for confirmation before proceeding.
- `CURRENCY & UNIT` — default: `Rs Cr` for India, `USD Bn` for global.
- `HISTORICAL HORIZON` — default: `FY20–FY25` actual.
- `FORWARD HORIZON` — default: `FY26E–FY30E`.
- `DEPTH` — default: `Tier 2 — Top 10 + tail`. Tier 1 = top 5; Tier 3 = full census.
- `PURPOSE` — default: `Sector primer / investment memo prep`.

When the user provides only an industry name, run with the defaults and surface them in the Part 0 block.

## Workflow — 6 phases

### Phase 1 — Player discovery & document acquisition

Resolve the universe of named players, then pull their segment revenue from primary sources.

**Step 1.1 — Discover the player set (web + screener)**

```bash
# Use web search to find: industry association reports, sector roundups, "top players in <industry>"
# Use screener.in sector tabs: https://www.screener.in/screens/ — search by industry tag
# Goal: a list of 10-20 candidate players before narrowing to top 10
```

For Indian sectors, screener.in's sector pages and the latest industry-leader's investor presentation (often contains a "competitive landscape" slide) are the fastest seed sources. For global, IEA / IBEF / industry-association reports.

**Step 1.2 — Fetch ARs for confirmed listed players via stockscans**

```bash
# For each listed top-10 player you've identified:
TICKER="NSE:<SYMBOL>"
SAFE=$(echo "$TICKER" | tr ':' '_')
DOCS_DIR="/tmp/${SAFE}_msa_docs"

python3 stock-api/python/fetchers/fetch_documents.py "$TICKER" \
    -t "Annual Report" PPT --last-n 2 -o "$DOCS_DIR"
```

Parallelise across all players (run all fetches in one turn, then `wait`). After fetching, read `manifest.json` per ticker. ARs give audited segment revenue; investor presentations sometimes give market share claims (always `[R]`-tagged with caution — companies overstate).

**Step 1.3 — Unlisted players via MCA / news**

For unlisted players in the top 10, MCA filings (via Tofler / Zauba) give the latest audited revenue. Web-search for `"<player name>" revenue FY24 site:moneycontrol.com OR site:livemint.com` works well.

**Step 1.4 — If gaps remain, ask the user**

If after web + screener + AR fetch you still cannot identify the player set or get segment revenue for ≥70% of estimated industry size, surface the gap and ask the user for guidance (e.g., "Should I include captive consumption?" or "Do you have a starting list of players?"). Do not fabricate.

### Phase 2 — Data verification protocol (Part 0)

This phase is non-negotiable. The output of this phase becomes the visible block at the top of the report.

Run [`references/framework_9parts.md`](references/framework_9parts.md) §Part 0:

1. **TAM triangulation** — pull industry size from ≥2 independent primary sources (industry association, government statistics, top-listed-player AR/IP, regulatory filing). If they disagree by >15%, document the gap and pick the more recent/granular with justification.
2. **Per-player revenue verification** — never aggregator-only. BSE/NSE AR for listed, MCA for unlisted.
3. **Segment definition lock** — confirm what's in and what's out. Many "market share" disputes are definition disputes (e.g., does "tubes & pipes" include line pipes? captive consumption? exports?).
4. **Currency & period normalization** — all players on the same fiscal-year basis; flag any company on a different calendar.
5. **R/D/E tag for every share number:**
   - `[R]` = Reported by the player (with source)
   - `[D]` = Derived (player segment revenue ÷ industry size)
   - `[E]` = Analyst estimate (no hard source)
   - If `[E]` mix exceeds 40% of the table, **downgrade overall confidence to LOW** and say so explicitly.

### Phase 3 — Build the 9-part analysis

Follow the full framework in [`references/framework_9parts.md`](references/framework_9parts.md). Summary of what each part must produce:

| Part | What it produces | Key deliverable |
|---|---|---|
| 0 | Data verification block | Visible top-of-report panel with [R/D/E] mix + confidence rating |
| 1 | Industry definition & sizing | Boundary paragraph, TAM/SAM/SOM, historical growth table, sub-segment split |
| 2 | Market structure | CR3 / CR5 / CR10 / HHI with badge + tier table + organized vs unorganized |
| 3 | Player-by-player share table | THE centrepiece — rank, player, listed/unlisted, latest revenue, share latest, share T-5, Δ bps, source tag |
| 4 | Share dynamics (the why) | Top 5 gainers + top 3 losers, each diagnosed (what they did right/wrong, structural vs cyclical, next 3 years) |
| 5 | Competitive moat mapping | Porter + Greenwald 4-dimension 1-5 scoring per Tier-1 player, with evidence column |
| 6 | Supply-demand & pricing | Installed capacity, utilisation, capex pipeline, realisation trends, spread vs key input, import parity |
| 7 | Disruption & threat map | 6-category threat matrix with probability × impact × early-warning signal |
| 8 | Forward Bear/Base/Bull projection | Share by player at end of forward horizon, 2-3 assumptions per scenario, flag >500 bps Bear-Bull spread |
| 9 | Data quality disclosure | Confidence rating, 3 biggest data gaps, sources with pull dates |

**Compute concentration metrics with the helper script:**

Write the following JSON to a temporary file (e.g. `data.json`):

```json
data = {
    "industry": "Indian Stainless Steel Tubes & Pipes",
    "geography": "India",
    "definition_scope": "Welded + seamless SS tubes; excludes carbon-steel tubes and SS sheets",
    "currency_unit": "Rs Cr",
    "historical_horizon": "FY20-FY25",
    "forward_horizon": "FY26E-FY30E",
    "depth": "Tier 2 (Top 10 + tail)",
    "purpose": "Sector primer / investment memo prep",
    "date": "May 2026",

    # Part 0 — Verification block
    "verification": {
        "tam_sources": ["JISA industry report FY25", "Jindal Stainless IP Q4 FY25"],
        "tam_gap": "No gap >15%; both anchor industry size to Rs ~14,500 Cr FY25.",
        "rde_mix": {"R": 3, "D": 7, "E": 1}
```

Then execute the two-step HTML-to-PDF pipeline:

```bash
# 1. Generate HTML (Bundle Mode)
bash ./skills/_shared/resolve.sh $(basename $(dirname skills/market-share-analysis/SKILL.md)) --input data.json --output report.html

# 2. Render PDF (Clone Mode)
bash ./skills/_shared/resolve.sh render-pdf --html report.html --pdf "<Company>_Output.pdf"
```

See [`stock-api/src/generators/generateMarketShareHtml.js`](stock-api/src/generators/generateMarketShareHtml.js).

The HTML widget is the only shipped renderer. If a printed committee version is later needed, the same `data` dict can be adapted into `peer-comparison`'s ReportLab pipeline (`../stock-api/python/utils/pdf_utils.py` carries the same palette) — that's a one-off adaptation, not a built-in path.

### Phase 6 — Present

After generating the HTML, present it via `present_files`. The user sees the widget directly in chat (sortable tables, color-coded HHI badge, expandable rows for moat evidence).

## Output discipline (the anti-patterns from Part 0)

The framework's anti-patterns are absolute rules. They appear in [`references/anti_patterns.md`](references/anti_patterns.md). Highlights:

- **Never** cite "industry sources estimate" without naming the source.
- **Never** quote market share to 1 decimal when underlying revenue is rounded to nearest Rs 100 Cr — keep precision consistent with input.
- **Never** use TAM numbers from a >2 year old consulting deck without flagging staleness.
- **Never** call a fragmented industry leader's position a "moat" without pricing-power evidence (3-year gross margin trend).
- **Never** project a player gaining >500 bps over 3 years without a capex / contract story to back it.
- **Never** compare market shares across players on different fiscal years without normalisation footnoted.
- **Never** treat "Others" as homogeneous — flag whether it contains the next disruptor.
- **Never** decorate `[E]` estimates with false precision (`22.4%` when the underlying is "roughly a fifth").

## Pitfalls specific to Indian sectors

- **Captive consumption** — for cement, steel, chemicals: 20-30% of "production" doesn't show up as third-party sales. The skill must declare upfront whether captive is in scope (default for "India ex-captive": OUT).
- **Conglomerate carve-out** — Jindal Stainless tubes ≠ Jindal Stainless total. Always footnote the segment carve-out methodology, and flag carve-outs with `[D-segment]` instead of `[R]`.
- **Unorganized sector invisibility** — for textiles, footwear, kitchenware, the unorganized sector is often the largest single "player" but does not appear in any database. Quantify (even if `[E]`) rather than ignoring.
- **Multi-year revenue mix shift** — Indian small-caps often shift mix dramatically (e.g., a casting maker becoming a defence supplier). Latest-year segment revenue may not reflect 5-year trend. Use 3-year average where mix is volatile.
- **GST formalisation** — Indian organized share has structurally risen post-GST. Track the trajectory.

## Cross-skill integration

- When called by `equity-research-deepdive`: pass the player table + concentration metrics back to §3 of the deepdive
- When called by `drhp-ipo-analysis`: feeds §9 (Peer Comparison & Valuation) with industry context
- When called by future `sector-research` skill: provides the share map; sector-research adds business-model layer on top
- Output is consumed by `equity-research-master` Tab 3 (Industry tab) when run pre-dashboard

## File tree

```
market-share-analysis/
├── SKILL.md                                  (this file)
├── _shared/
│   ├── conventions.md                        (linked — citation, FY, R/D/E discipline)
│   └── pdf_utils.py                          (shared institutional palette)
├── references/
│   ├── framework_9parts.md                   (the full 9-part framework, expanded)
│   ├── data_sources.md                       (where to find TAM, MCA, BSE data by sector type)
│   ├── concentration_metrics.md              (HHI, CR3/5/10, tiering definitions + thresholds)
│   └── anti_patterns.md                      (the prompt's anti-pattern rules, expanded with examples)
└── scripts/
    ├── compute_concentration.py              (HHI / CR3 / CR5 / CR10 from a list of shares)
    └── generate_market_share_html.py         (sortable HTML widget — the default and only renderer)
```
