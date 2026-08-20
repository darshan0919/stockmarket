---
name: drhp-ipo-analysis
description: Institutional-grade DRHP/RHP analysis for Indian IPOs. Pulls straightforward public facts (GMP, subscription, 3-year financials, KPIs, peer comparison, objects of issue, lock-in schedule, key dates, anchor investors) from investorgain.com / chittorgarh.com / ipoplatform.com by link-citation, not by re-deriving them from the document. Then reads the RHP (DRHP only if no RHP exists yet) for what those platforms don't carry — non-obvious, dot-connecting analysis: capex-vs-CWIP reconciliation, RPT-vs-promoter-compensation patterns, litigation, customer-concentration trend, moat quality, lock-in-vs-valuation supply overhang, red flags. Use when the user uploads a DRHP/RHP PDF, asks "should I subscribe to X IPO", "analyse this DRHP", "is this IPO fairly priced", or gives a SEBI/NSE/BSE/IPO-platform link. Outputs a multi-page institutional PDF flagging governance concerns, fraud risks, and valuation — for a subscription or post-listing entry decision.
---

# DRHP / IPO Analysis

The RHP/DRHP is a one-time information bonanza — it contains **more disclosure about a company than any future annual report ever will**. Promoter compensation history, related party transactions, conflicts of interest, legal proceedings, customer concentration, capital raise rationale — all here, all once.

But most of an IPO's _straightforward_ facts (GMP, subscription multiples, the 3-year financial snapshot, standard KPIs, a peer table, the objects-of-issue split, lock-in dates, key dates) are already assembled, maintained, and free on IPOPlatform / Chittorgarh / Investorgain — the same underlying data pipeline wearing three skins (`ipoplatform.com`'s own page metadata states `"parentOrganization": "Chittorgarh.com"`; Chittorgarh's footer lists Investorgain and IPO Platform as sibling sites — see [`../ipo-subscription-ranker/references/ipo_data_sources.md`](../ipo-subscription-ranker/references/ipo_data_sources.md)). Re-deriving those facts by grepping a 500-1000 page PDF is pure token waste on information a reader can pull up on their phone in five seconds. **This skill's job is the other half: what a naked-eye read of the RHP, or a glance at an IPO tracker, will NOT hand you** — the numbers that only surface by cross-checking one section against another, the disclosures buried in a footnote, the pattern that only shows up across all three fiscal years instead of the latest one.

This skill produces a subscription/entry-decision PDF built in two passes — a cheap, link-cited platform harvest (Phase 0), then an RHP-anchored dot-connecting analysis (Phases 1-3) — that explicitly flags red flags and non-obvious signal before the user puts money in.

## When to use this skill

- User uploads a DRHP or RHP PDF
- User says: "analyse this DRHP", "should I subscribe to [X IPO]", "is this IPO fairly priced", "DRHP red flags"
- User provides a SEBI prospectus URL, NSE/BSE filing link, or an investorgain/chittorgarh/ipoplatform IPO page URL
- Pre-IPO due diligence

## Conventions

Follow [`_shared/conventions.md`](../_shared/conventions.md). Especially: anti-hallucination protocol §3 (RHPs are LONG and dense — anchor strictly to the document for anything not sourced from a platform), citation format §2 (every claim gets a page number, or a `citation_url` for a platform-sourced fact).

## Required input

Any ONE of:

- A DRHP or RHP PDF
- An investorgain.com / chittorgarh.com / ipoplatform.com IPO page URL (or just the company name — Phase 0 resolves the page)
- A SEBI/NSE/BSE prospectus link

Note: DRHPs/RHPs are **public documents** filed with SEBI. Extracting and analysing them is fully legal and intended.

## Workflow — 5 phases

### Phase 0 — Platform-first harvest (cheap, link-cited, do this BEFORE opening the RHP)

**Purpose:** get every fact a human could read off an IPO tracker page without spending a single token re-deriving it from the RHP. This phase never renders the sourced fact as long prose — it stores `{value, citation_url}` and moves on. See "Link-only citation, not rendering" below for the exact convention.

1. **Resolve the pages.** If given a URL, use it. If given only a company name, search `investorgain.com/ipo/<slug>` and `chittorgarh.com/ipo/<slug>`. IPOPlatform is the trusted primary for subscription figures specifically (validated byte-for-byte against Chittorgarh's published methodology in `ipo_data_sources.md`) but is not always the fastest page to resolve by name — try Investorgain/Chittorgarh first for everything else, IPOPlatform for subscription/scoring.

2. **Pull these fields, each stored as `{value, citation_url}` (or `{value, as_of, citation_url}` where the figure moves), never as rendered prose:**
   - GMP (current + trend), estimated listing price — Investorgain (`#gmp`)
   - Subscription by category (QIB/sHNI/bHNI/NII/RII/Total) — via `ipoSubscriptionScanner.js`'s `parseClosedIpos`/`parseSubscriptionStatus` (`packages/jobs-runtime/ipoSubscriptionScanner.js`) against IPOPlatform, exactly as `ipo-subscription-ranker` and old §19 already do — **do not hand-scrape this one, the parser exists and is validated**
   - 3-year restated financials snapshot (Revenue, PAT, EBITDA, net worth, borrowings) — Investorgain (`#financials`) / Chittorgarh
   - Standard KPIs (ROE, ROCE, D/E, P/E pre- and post-issue, NAV) — Investorgain (`#kpi`) / Chittorgarh
   - Peer comparison table as published — Investorgain (`#peers`) / Chittorgarh's "Recently Listed Peers" or IPO-specific peer table
   - Objects of issue, top-level split (fresh issue vs OFS, capex/debt-repay/GCP amounts) — Investorgain (`#objectives`) / Chittorgarh
   - Promoter names + pre/post-issue shareholding % — Investorgain (`#about-company`) / Chittorgarh
   - Lot size, price band, issue size — Investorgain (`#lotsize`, `#details`)
   - Key dates (open/close/allotment/listing) — Investorgain (`#timeline`) / Chittorgarh's IPO Timetable
   - Reservation by category (QIB/NII/RII %) — Investorgain (`#reservation`)
   - Anchor investor bid date, allocation price, total raised, and (once published) allottee list — Chittorgarh's "Anchor Investors" section carries this more reliably than Investorgain; still confirm the allottee list with `WebSearch` if Chittorgarh hasn't posted it yet (exchanges publish it separately, sometimes with a lag)
   - Registrar + lead manager names — either site
   - The RHP/DRHP PDF download link itself — Chittorgarh reliably surfaces this near the top of the IPO-details section (labelled "Refer to `<Company>` IPO RHP/DRHP for detailed Information"); use this link to fetch the document for Phases 1-3 rather than searching SEBI/NSE/BSE separately. **Only fall back to the DRHP if no RHP is linked yet** (i.e. the issue hasn't priced) — the RHP is the final, priced version and should always be preferred once it exists.

3. **Compute the two IPO scores** via `computeDualScores()` in `packages/jobs-runtime/lib/ipoScoring.js` (`listingScore`/`listingTier`, `cagrScore`/`cagrTier`) — never re-derive the formula inline, same as old §19.

4. **Note what's missing.** Not every field above exists for every IPO (SME issues, especially, sometimes lack a peer table or a KPI block on these sites). Anything genuinely absent from all three platforms becomes a Phase 1-3 task instead — don't silently skip it, and don't treat "not on the tracker page" as "not important."

**Why this matters for token cost:** a platform page condenses ~15-40k tokens of RHP financial-statement prose into a handful of numbers a script or one WebFetch call retrieves in a few hundred tokens (see the repo-wide audit note on JSON-vs-PDF token savings). Skipping this phase and re-deriving KPI-table numbers from the RHP is the single most avoidable cost in this skill.

### Phase 1 — Document inventory (RHPs are massive — only for what Phase 0 didn't already cover)

Fetch the RHP (or DRHP, per the fallback rule above) via the link Phase 0 found. **This phase's job has shrunk deliberately: skip straight past anything Phase 0 already sourced with a citation_url — re-reading the financial-statements section to re-confirm a number the tracker page already gave you is waste, not rigor.** What's left to inventory here is precisely the sections no platform surfaces: risk factors, related-party transactions, litigation, promoter background/controversies, contingent liabilities, auditor notes, the full "Our Strengths"/"Business Strategies" prose, and the fine-grained financial line items (CFO, debtor days, segment mix) beyond the headline KPI block.

```bash
RHP=/path/to/CompanyXYZ_RHP.pdf   # RHP preferred; fall back to DRHP only if no RHP is linked yet
pdfinfo "$RHP"                              # page count, file size
pdftotext -f 1 -l 5 "$RHP" -                # first 5 pages: cover + ToC
pdftotext -layout "$RHP" /tmp/rhp_full.txt  # full extract for grep
wc -l /tmp/rhp_full.txt
```

Identify the major sections via the Table of Contents — RHP/DRHP structure is highly standardised. Skip greps for anything Phase 0 already sourced (objects-of-issue totals, headline financial ratios) — only inventory what's left:

```bash
grep -n -i -E "(table of contents|index of contents)" /tmp/rhp_full.txt | head -3
grep -n -i -E "(risk factors)" /tmp/rhp_full.txt | head -3
grep -n -i -E "(our promoters|promoter group)" /tmp/rhp_full.txt | head -3
grep -n -i -E "(related party)" /tmp/rhp_full.txt | head -3
grep -n -i -E "(litigation|outstanding litigation)" /tmp/rhp_full.txt | head -3
grep -n -i -E "(our strengths|competitive strengths)" /tmp/rhp_full.txt | head -3
grep -n -i -E "(business strategies|our strategy)" /tmp/rhp_full.txt | head -3
grep -n -i -E "(contingent liabilit)" /tmp/rhp_full.txt | head -3
grep -n -i -E "(auditor|statutory auditor)" /tmp/rhp_full.txt | head -3
grep -n -i -E "(capital structure|lock-in)" /tmp/rhp_full.txt | head -3
```

Then extract each section to a separate file with `pdftotext -f X -l Y` for that page range. **Don't dump the whole RHP into context at once, and don't re-extract a section Phase 0 already sourced with a citation_url.**

### Phase 2 — Non-obvious extraction (what platforms don't give you)

Apply the framework in [`references/drhp_10section.md`](references/drhp_10section.md), reading it as a floor, not a ceiling — the goal of this phase is never to restate what Phase 0 already surfaced with a link. Where a section below overlaps a Phase 0 field (financials, objects-of-issue split, peer table), this phase's job is the analysis ON TOP of that number — the reconciliation, the trend across all three fiscals instead of the latest one, the footnote a platform table wouldn't carry — not re-copying the figure itself:

1. **Business Overview** — Core activities, products/services, revenue streams, geography. Read critically, not as a restatement — see Pitfalls.
2. **Industry & Market** — Trends, growth potential, competition, market size, claimed market share. Verify the claimed TAM/market-share figure independently where possible; note whose report it's from.
3. **Objects of the Issue — the analysis layer.** Phase 0 already has the headline split (fresh issue vs OFS, capex/debt/GCP amounts). This section's job: does GCP exceed 25% of fresh issue (vague usage)? Is an "acquisition" line unspecified (blank cheque)? Is debt being repaid despite an already-low D/E (insiders being paid off via the IPO)?
4. **Financial Highlights — the analysis layer.** Phase 0 has the headline 3-year snapshot. This section's job: CFO/PAT trend across all three years (not just the latest), debtor-days trend, and whether the KPI-table margin expansion is genuine operating leverage or a one-off (compare against the RHP's own MD&A commentary).
5. **Cash Flow Analysis** — Operating, investing, financing trends; flag profit/cash mismatches the headline KPIs wouldn't surface.
6. **Risk Factors** — Most critical and specific risks (skip generic boilerplate) — this section exists ONLY in the RHP, no platform carries it.
7. **Promoter & Management** — Names, background, holding (pre/post IPO — Phase 0 has the headline %), controversies, legal actions. The controversy/legal-action layer is RHP-only.
8. **Related Party Transactions** — Major RPTs, comment if abnormal or conflict-prone — RHP-only, cross-reference against promoter compensation (§ below).
9. **Peer Comparison & Valuation — the analysis layer.** Phase 0 has the published peer table. This section's job: is the pricing actually justified given growth-rate and margin differentials vs those peers, not just the raw multiple — a premium multiple next to superior ROCE/growth is a different story than the same premium next to inferior fundamentals.
10. **Red Flags** — explicit checklist (see below)
11. **Lock-in / Share Release Schedule** — Every distinct lock-in tranche disclosed under "Capital Structure" (Minimum Promoter's Contribution, excess promoter shareholding, entire pre-Offer capital, Anchor Investor lock-in) with its release date — RHP-only, no platform tabulates this. **Mandatory whenever disclosed — always surfaced on page 1 of the output**, not buried in an appendix; see Phase 4 schema and the renderer's dedicated page-1 section.
12. **Order Book** — Value as of the most recent practicable date disclosed, composition (Government/PSU vs private, direct vs subcontracted), bid-to-win ratio if given, and the company's own caveats about conversion certainty (order books frequently overstate realizable revenue — the DRHP itself usually says so in a risk factor, quote it). Search `order book|order backlog|unexecuted order`.
13. **Forward Strategy — Capex & Product Roadmap** — DRHPs never contain numeric earnings guidance (there's no post-listing concall yet to have generated one), but the "Business Strategies"/"Our Strategy" section describes capex intent, new product/platform plans, and geographic or vertical expansion. Cross-check stated capex intent against the CWIP trend in the balance sheet and the capex line in Objects of the Issue — do the numbers agree with the narrative? Label this section clearly as _strategy_, never as _guidance_, so it isn't mistaken for a number the company committed to.
14. **Moat & Competitive Strengths** — Pull from "Our Strengths"/"Competitive Strengths," but grade critically and say so in the output: regulatory licenses, certifications, or registrations a competitor can't quickly replicate are a real (if often narrow) moat; claims like "experienced management" or "customer-centric approach" are marketing filler, not a moat, and should be named as such rather than repeated at face value.
15. **Niche Products / Platforms** — Any named proprietary platform, product, or IP in the business section (not generic service-line descriptions). List each by name with a one-line description of what it does and why it's differentiated from a plain-vanilla service offering.
16. **Customer Disclosure** — State explicitly whether customer names are disclosed or anonymized (common in DRHPs — check footnotes on concentration tables carefully, they sometimes mislabel "customers" as "suppliers"). Report customer count and repeat/retention stats if given, and track the concentration trend across all disclosed fiscals, not just the latest one — a rising concentration trend is a materially different risk than a flat one at the same level.
17. **Anchor Investors** — Phase 0 should already have the allocation price, bidding date, and total raised from Chittorgarh; if the allottee list wasn't posted there yet (exchanges publish it separately after the Anchor Investor Bid Date, sometimes with a lag), use `WebSearch` to find it now — don't wait for the user to ask a second time. Judge investor quality explicitly — established, recognizable domestic MFs/FPIs vs smaller or boutique AIFs — and say which it is; this is a genuine quality signal that's easy to skip if you stop at the headline number alone.
18. **Post-Listing Trading Activity** — If `post_listing_status.already_listed` is true, check for bulk/block deals since listing and who the counterparties are. **Do not reach for `WebSearch` first** — same-day bulk/block deal data is rarely indexed by search engines yet, which is why a search-based attempt can come back empty even when a deal happened. Instead hit the exchanges directly, the same way `packages/jobs-runtime/dealsDigest.js` (the daily-deals-digest job) does: `nse.getLargeDeals()` and `bse.getBulkBlockDeals(type, fromDmy, toDmy)` from the `@stock/api` package, which wrap NSE's `/api/snapshot-capital-market-largedeal` and BSE's `BulkDealData_ng` endpoints — both public, no auth needed. Filter the returned rows to the target symbol and date range. Only fall back to `WebSearch` (financial press, Chittorgarh-style trackers) if the direct API call fails or the company isn't found in the response, and say explicitly which path was used so a "nothing found via API" isn't mistaken for "nothing found at all." If nothing is retrievable through either path, say so explicitly in the output — a stated "could not verify" is honest; a silently omitted section reads as "nothing happened," which may not be true.

19. **Subscription Status & Score** — Phase 0 already fetched the raw category-wise figures and computed both scores. This section's job is the **insight**, not the numbers: which category led (QIB-led = institutional conviction, RII-led = retail/GMP-driven hype, often the weaker signal), whether Anchor participation happened and by whom if notable, and what the STRONG/MODERATE/WEAK/POOR tier implies for near-term listing-day behavior vs whether it says anything about longer-run holding (per `ipo_ranking_framework.md`'s "Dual-score system" section — the CAGR score is intentionally noisier and less discriminating than the listing score, say so rather than overstating confidence in it). 2-4 sentences, never a restatement of the raw multiples.

Sections 1-19 together are **not optional add-ons** — treat every one of them as part of the core framework, extracted in the same pass, not as follow-up work triggered only when a user asks a second time. What changed is not _whether_ each section gets covered but _where the effort goes_: Phase 0 supplies the raw fact with a link, Phases 1-2 supply the reconciliation/pattern/red-flag that only a full RHP read can surface. Section 19's insight layer is naturally skipped only when the IPO genuinely hasn't closed yet (say so explicitly — "not yet applicable, IPO still open" — rather than silently omitting the section).

## Link-only citation, not rendering (the core token-saving discipline)

Every fact sourced in Phase 0 gets stored in the DTO as `{value, as_of, citation_url}` (or the field-specific shape already used for `additional.subscription` — see Phase 4) and is **never re-narrated in prose**. Concretely:

- **Do**: `"kpi_headline": [{"label": "ROCE", "value": "27.11%", "sub": "FY26", "citation_url": "https://www.investorgain.com/ipo/<slug>/<id>/#kpi"}]`
- **Don't**: write a paragraph explaining that ROCE is 27.11% and what ROCE means — that's exactly the kind of naked-eye-visible fact this skill exists to get past, not linger on.
- The renderer (`render_drhp.py` / `render_additional.py`) displays the value compactly (a KPI card, a table cell) with the source noted, the same pattern already proven by `additional.subscription`'s `source`/`as_of` fields. Extend that pattern to every Phase 0 field rather than inventing a new rendering convention per field.
- This is a hard trigger for the "don't compute/narrate what a script or a link already gives you" principle: if the fact exists on a tracker page and Phase 0 captured it with a URL, spending a paragraph restating it is exactly the token waste this phase exists to eliminate.
- The one thing link-only citation must NOT do is hide a genuine finding. If a Phase 0 number is itself the signal (e.g. GMP is negative, or QIB subscription is <1x), say so explicitly in the verdict rationale — the value being link-cited doesn't mean it's exempt from judgment, only that its _provenance_ doesn't need re-explaining.

### Phase 3 — Red Flag Scan and dot-connecting

This is the differentiator vs a generic DRHP summary or an IPO tracker page — and it is the part of this skill that actually justifies reading the RHP instead of just glancing at a tracker. Run the explicit red-flag checklist from [`references/drhp_red_flags.md`](references/drhp_red_flags.md):

- Negative cash flows with positive profits
- Sudden profit spike in the year before IPO (window dressing)
- Large OFS component (promoters cashing out >30% of issue)
- Auditor qualifications or change in last 3 years
- Heavy dependence on few clients (top 3 = >40% of revenue)
- Significant pending legal proceedings against promoter or company
- Promoter compensation extreme as % of PAT
- Related party transactions that look like value extraction
- Working capital cycle stretched in IPO year
- Industry section relies heavily on a single paid market-research report

Each red flag rated **GREEN / YELLOW / RED** with verbatim evidence and page citation.

**Beyond the checklist — this is where "elite" actually happens.** A checklist run mechanically produces the same output any competent junior analyst (or another skill) would produce. The differentiated value of this skill is in explicitly connecting facts that live in _different_ sections of the RHP and were never going to be compared by a reader skimming section-by-section:

- **Promoter compensation vs RPTs vs OFS size** — is the promoter extracting value through three separate channels at once (a high salary, a related-party transaction, and now cashing out via OFS), each individually defensible but collectively a pattern?
- **Capex narrative (§13/Business Strategies) vs CWIP trend vs the capex line in Objects of Issue** — do all three tell the same story, or does the prose promise more than the balance sheet and the fund-use table actually commit capital to?
- **Customer concentration trend (§16) vs the specific customer named in a top-line risk factor** — if the #1 customer disclosed in the concentration table is the same one named in a risk factor about contract renewal risk, that's a materially sharper read than either fact alone.
- **Lock-in schedule (§11) vs the IPO's valuation vs the OFS sellers** — a stock priced at a premium multiple with a large non-promoter (PE/VC) lock-in expiring in 2-3 quarters is a specific, dated supply-overhang thesis, not a generic caution.
- **Litigation against promoters (§7) vs their role/compensation** — a promoter facing a pending proceeding who is ALSO drawing outsized compensation and selling shares via OFS reads differently than any one of those facts alone.
- **Auditor change timing vs the profit trajectory** — an auditor change in the 1-2 years immediately before an IPO, layered against a profit spike in the same window, is a materially different signal than either fact in isolation (see the red-flag checklist's "sudden profit spike" and "auditor qualifications" items — treat them as one investigation when both are present, not two separate checklist ticks).

Write these as explicit "connecting the dots" callouts in the DTO (`additional.dot_connections: [{claim, evidence: [{section, fact, citation}], why_it_matters}]`) — each one names which sections it's drawing from and why the combination matters more than the parts. This is the section a reader cannot get from a tracker page or a naked-eye RHP skim, and it should read that way.

### Phase 4 — Data layer vs UI layer (hard boundary, do not blur)

**This phase has two strictly separate steps. Never let one script or one pass of edits do
both.** The failure mode this guards against: an analyst "compresses for readability" and, in
doing so, silently drops facts — because there was no persisted canonical record to compress
_from_, only a single hand-written document that was both the data and the layout at once.

1. **Data layer (extraction + processing) → persist the full DTO, no compression decisions here.**
   Everything gathered in Phases 1-3 — every number, every named entity, every citation — goes
   into a JSON DTO. This step's only job is completeness and accuracy; it never asks "is this
   worth including," only "is this true and cited." Persist it via
   `require('packages/jobs-runtime/lib/db.js').saveReport(dto)` (per
   [`skills/tooling/output-dto-standard/SKILL.md`](../../tooling/output-dto-standard/SKILL.md)) —
   this writes `data/reports/<id>.json` (the full body, the source of truth) and links it into
   `data/companies.json`. The DTO is a **superset schema**: every section the 10-section framework
   produces gets a structured field (arrays of objects for repeatable data — RPTs, litigation,
   red flags, promoters, objects of issue — not prose paragraphs), so the render step never has
   to parse free text to find a fact.

   Required envelope fields (enforced by `ensureEnvelope`): `companyId`, `creator` (=
   `"drhp-ipo-analysis"`), `date`, `type` (=`"drhp-ipo-analysis"`), `summary`. This DTO is
   entirely LLM-authored analysis (red-flag ratings, subscription view, narrative fields),
   so per `output-dto-standard/SKILL.md`'s `modelUsed` rule it must also carry
   `modelUsed`: the exact model string you are running as right now (e.g.
   `"claude-sonnet-5"`) — set it yourself in the DTO before calling `saveReport`, it is
   never inferred by `db.js`. Domain fields
   (non-exhaustive — extend as the DRHP demands, never remove to save space):

   ```json
   {
     "type": "drhp-ipo-analysis", "creator": "drhp-ipo-analysis", "companyId": "BSE:...",
     "date": "...", "summary": "...", "modelUsed": "claude-sonnet-5",
     "source_documents": [{"label": "RHP", "url": "...", "filed": "...", "pages": 449, "note": "RHP preferred; DRHP only if RHP not yet linked"}],
     "platform_sources": [{"site": "investorgain|chittorgarh|ipoplatform", "url": "..."}],
     "company_name": "...", "cin": "...", "issue_type": "Mainboard IPO|SME IPO|FPO",
     "filing_date": "...", "listing": "...",
     "post_listing_status": {"already_listed": bool, "cmp_inr": num, "market_cap_cr": num, "trailing_pe": num, "note": "..."},
     "subscription_view": "BUY|ACCUMULATE|HOLD|REDUCE|AVOID",
     "verdict_rationale": "...",
     "lock_in_schedule": [{"category": "Anchor Investors — 50%", "shares_or_pct": "...", "lock_in_period": "30 days from Allotment", "release_date": "YYYY-MM-DD", "note": "..."}],
     "kpi_headline": [{"label": "...", "value": "...", "sub": "...", "citation_url": "...", "citation_note": "citation_url for Phase-0-sourced cards; omit and use a page-number citation instead for RHP-derived ones"}],
     "business_overview": {"text": "...", "citation": "...", "product_mix_fy25_pct": {}, "customer_mix_fy25_pct": {}},
     "promoters": [{"name": "...", "role": "...", "pre_issue_pct": num}],
     "objects_of_issue": [{"object": "...", "amount_inr_lakh": num, "fy27_lakh": num, "fy28_lakh": num}],
     "financials_restated_inr_lakh": {"periods": [...], "revenue": [...], "ebitda_margin_pct": [...], "pat": [...], "ronw_pct": [...], "roce_pct": [...], "debt_equity": [...], "cfo_inr_lakh": [...], "debtor_days": [...], "top10_customer_concentration_pct": [...], "citation": "..."},
     "cash_flow_commentary": "...",
     "related_party_transactions": [{"party": "...", "relationship": "...", "nature": "...", "fy25_amount_inr_lakh": num, "pct_of_revenue": num, "note": "..."}],
     "litigation": {"against_company": [...], "against_promoters": [...], "against_directors": [...], "criminal_against_company_promoters_kmp": int, "notes": "...", "citation": "..."},
     "contingent_liabilities_inr_lakh": [{"item": "...", "as_at_...": num}],
     "auditor": {"current": "...", "appointed": "...", "predecessor": "...", "qualifications": "...", "citation": "..."},
     "industry": {"source": "...", "commentary": "...", "citation": "..."},
     "peer_valuation": {"listed_peers_in_india": "...", "weighted_avg_eps_inr": num, "citation": "..."},
     "red_flags": [{"flag": "...", "rating": "GREEN|YELLOW|RED", "evidence": "..."}],
     "limitations": ["..."],
     "order_book_inr_cr": num, "order_book_as_of": "...",
     "additional": {
       "dot_connections": [{"claim": "...", "evidence": [{"section": "Promoter Compensation|RPTs|OFS|Capex Strategy|CWIP|Customer Concentration|Lock-in|Litigation|Auditor|...", "fact": "...", "citation": "page N or citation_url"}], "why_it_matters": "..."}],
       "platform_snapshot": {"gmp_inr": {"value": num, "as_of": "...", "citation_url": "..."}, "estimated_listing_price_inr": {"value": num, "citation_url": "..."}, "peer_table": {"citation_url": "...", "note": "table itself lives at the link; only cite/summarize the pricing-relevant conclusion here, don't re-render the table"}},
       "order_book_composition": {"govt_psu_pct": num, "private_pct": num, "bid_to_win_pct": num, "citation": "..."},
       "forward_strategy": {"capex_plans": "...", "capex_vs_cwip_check": "...", "product_roadmap": ["..."], "geographic_expansion": "...", "citation": "..."},
       "moat": [{"strength": "...", "type": "REAL_MOAT|MARKETING_CLAIM", "rationale": "..."}],
       "niche_products": [{"name": "...", "description": "...", "differentiation": "..."}],
       "customer_disclosure": {"names_disclosed": bool, "customer_count": num, "repeat_customer_pct": num, "concentration_trend": "RISING|FLAT|FALLING", "citation": "..."},
       "anchor_investors": {"allocation_price_inr": num, "bidding_date": "...", "total_raised_inr_cr": num, "allottees": [{"name": "...", "pct_of_anchor_book": num}], "quality_assessment": "MARQUEE|MIXED|BOUTIQUE_LESSER_KNOWN", "source": "web-search, not DRHP-native", "citation_url": "..."},
       "post_listing_trading": {"checked": bool, "source": "nse-bse-api|websearch-fallback|unverifiable", "bulk_block_deals": [{"date": "...", "exchange": "NSE|BSE", "buyer": "...", "seller": "...", "qty": num, "price_inr": num}], "note": "state explicitly if unverifiable rather than omitting"},
       "subscription": {
         "type": "ipo_subscription",
         "checked": true, "source": "ipoplatform", "as_of": "...",
         "anchor_participated": bool, "total_x": num, "qib_x": num, "s_hni_x": num, "b_hni_x": num, "nii_x": num, "rii_x": num,
         "listing_score": num, "listing_tier": "STRONG|MODERATE|WEAK|POOR",
         "cagr_score": num, "cagr_tier": "STRONG|MODERATE|WEAK|POOR",
         "insight": "2-4 sentences: which category led and what that implies, anchor quality if notable, listing-day vs longer-run read — never just restate the raw multiples",
         "citation_url": "https://www.ipoplatform.com/ipo/subscription-status"
       }
     }
   }
   ```

   Note: fields 12(partial)-18 (order book composition, forward strategy, moat, niche products,
   customer disclosure, anchor investors, post-listing trading) are nested under `additional`
   rather than as new top-level keys. `render_drhp.py` only has hand-written sections for the
   original top-level fields — anything outside those falls through to the generic shape-sniffing
   renderer via `additional`, which already knows how to lay out arbitrary nested JSON. This means
   these fields render correctly **today**, with zero script changes and zero risk of silently
   dropping data because a renderer section wasn't written yet. `order_book_inr_cr` /
   `order_book_as_of` stay top-level since the renderer already has a dedicated slot for them.
   If these sections earn dedicated, better-laid-out treatment later, that's a `render_drhp.py`
   enhancement to do deliberately — not a reason to skip populating them now.

   `additional.subscription` is the one exception with a hand-written layout:
   `skills/_shared/render_additional.py`'s `_render_subscription()` (triggered by
   `"type": "ipo_subscription"`, with a shape-based fallback if that key is ever omitted)
   renders it as a two-column split — left half a compact category table (QIB / Non-
   Institutional Buyers with bNII/sNII sub-rows / RII / Total, each value `x`-suffixed, e.g.
   `164.56x`, never the field name), right half the judgment fields (Insight, Listing Score,
   Cagr Score, Source). `citation_url` stays in the DTO (never delete a fact) but is
   intentionally not rendered — `source`/`as_of` already say where the numbers came from, so
   repeating the URL wastes space the generic kv-table layout was burning through before this
   dedicated renderer existed.

   `additional` (any JSON shape — see
   [`skills/tooling/output-dto-standard/SKILL.md`](../../tooling/output-dto-standard/SKILL.md))
   is where stock/sector/scenario-specific nuance goes when it doesn't fit any field above —
   e.g. a bear/base/bull scenario, a smart-city-capex dependency note, an export-geography
   split unique to this issuer. Don't distort another field to fit the insight in; don't drop
   the insight because there's no field for it. The renderer (below) lays it out automatically.

   See `skills/equity-research/drhp-ipo-analysis/scripts/render_drhp.py`'s docstring for the
   complete field list this render step consumes — treat that as the living schema reference.

2. **UI layer (rendering) → pure function of the DTO, zero content decisions.**
   Run `python3 skills/equity-research/drhp-ipo-analysis/scripts/render_drhp.py data/reports/<id>.json data/drhp-ipo-analysis/<Company>_Output.pdf`.
   This script (or the JS-generator path via `stock-api/src/generators/generateDrhpPdf.js` if
   wired for the run) may choose layout, component (table/vmatrix/kpi-grid/chip), typography, and
   color per `skills/_shared/pdf-design-guide.md` — but it must never omit a field that exists in
   the DTO, never summarize a sentence down to fewer facts, and never invent a fact not in the
   DTO. If the render script needs a DTO field that doesn't exist yet, that's a signal to go back
   to step 1 and extend the DTO — never to work around it by writing the fact directly into the
   render script.

**Verification before shipping the PDF:** diff the rendered PDF's content against the DTO's
field list — every top-level object/array in the DTO should be visibly represented somewhere in
the output. This is the concrete check for the "no information loss" requirement.

**The PDF is mandatory output, not a stretch goal.** A run of this skill is not complete until
`data/drhp-ipo-analysis/<Company>_Output.pdf` exists on disk and has been verified against the
DTO. Do not substitute a chat-only summary for the PDF because the DTO/render pipeline "seems
unavailable," "seems out of scope for this turn," or "would take too long" — those are usually
wrong assumptions, not real blockers. Before concluding the pipeline is unavailable:

1. Check whether the connected workspace actually contains the `stockmarket` repo (it does for
   this user) and whether `skills/equity-research/drhp-ipo-analysis/scripts/render_drhp.py` and
   `packages/jobs-runtime/lib/db.js` exist at the expected paths — a quick `find`/`ls`, not a
   guess from memory of a previous session.
2. If the repo genuinely isn't reachable (e.g. running in a context with no workspace connected
   at all), say so explicitly to the user and explain exactly what's missing — don't quietly
   drop the PDF step and only mention it if asked.
3. If time/effort feels tight, that's a reason to work more efficiently (e.g. batch the greps,
   skip re-reading files you already extracted), never a reason to skip the deliverable the
   skill exists to produce.

## Output discipline

- **Subscription/entry view is the headline.** A fund manager reading this will look at the verdict box first, then read justification.
- **The dot-connections section (Phase 3) is what makes this "elite" rather than a summary** — it should be the part of the output a reader couldn't have assembled themselves from a five-minute tracker-page skim. If it reads like a restatement of individually-obvious facts, it hasn't done its job.
- **Quote verbatim** for: auditor qualifications, risk factors, RPT line items, promoter legal proceedings.
- **Page-cite everything sourced from the RHP** — RHPs are 500-1000 pages, finding the exact source matters. **Link-cite everything sourced from a platform** (`citation_url`) — never re-derive or re-narrate a fact a tracker page already carries; see "Link-only citation" above.
- **Flag the OFS-heavy issues prominently.** If >50% of issue size is OFS (promoters cashing out), highlight on page 1.
- **Do not skip generic risk factors entirely** — pull the SPECIFIC ones (those mentioning a named customer, a specific lawsuit, a real geographic concentration). Generic boilerplate gets a single line.

## The verdict vocabulary — always post-listing action guidance

Every RHP/DRHP this skill is asked to analyse arrives after the company is already listed
and trading (this is how the user works). The verdict is therefore never framed as a subscription
decision ("should I apply for this IPO") — it is framed as an entry/hold/exit call at the current
market price, exactly like `investment-thesis-engine`'s signal vocabulary, so the two stay
consistent for a company that later gets a full thesis. Do not use "WATCH-POST-LISTING" or any
other pre-listing-uncertainty phrasing — the listing has already happened.

| View           | When to use                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BUY**        | All 19 sections clean; valuation at/below fair value vs disclosed peers or pre-listing NAV; no RED red flags — a straightforward entry at CMP                                                                   |
| **ACCUMULATE** | Strong fundamentals with 1-2 monitorable (non-fraud) YELLOW flags and/or a real but not extreme valuation discount to peers — worth building a position, ideally on dips, while tracking the flagged items      |
| **HOLD**       | Fundamentals intact but the stock has already re-rated to fair value or beyond, or unresolved red flags create meaningful uncertainty — don't chase, don't need to exit an existing position                    |
| **REDUCE**     | Red flags are emerging/worsening or valuation is materially stretched relative to fundamentals — trim exposure                                                                                                  |
| **AVOID**      | Any RED red flag on fraud/governance grounds; OR valuation extreme with no offsetting quality; OR pending material litigation against the company itself (not just promoters in an unrelated personal capacity) |

Always cross-check the verdict against the **lock-in / release schedule** (§11): a stock that looks
cheap now but has a large promoter or pre-IPO-investor lock-in expiry within the next 2-3 quarters
carries real supply-overhang risk that the verdict rationale must name explicitly.

## Pitfalls to avoid

- **Re-deriving a fact from the RHP that a platform page already carries with a link.** This is the single biggest waste this version of the skill was rewritten to eliminate — if Investorgain/Chittorgarh has a KPI, financial snapshot, peer table, or subscription number, cite it, don't re-parse the RHP's financial statements to reconfirm it.
- **Producing a summary instead of an analysis.** A list of the 19 sections' facts, however complete, is not what this skill is for if it stops at restating each fact in isolation — Phase 3's dot-connections are mandatory, not optional color.
- **Trusting the "About Us" section.** It's marketing. Anchor on financial restated statements and risk factors.
- **Skipping the litigation section.** Often boring but the most actionable — pending criminal proceedings against promoters are not common but show up in RHPs.
- **Over-weighting the auditor.** A clean opinion in an RHP is the minimum bar; the auditor doesn't catch governance issues.
- **Ignoring the industry consultant report.** The "Industry" section in RHPs is often paid for by the issuer (CRISIL, Frost & Sullivan reports). Treat with skepticism — verify market share / TAM claims independently.
- **Anchoring on the price band.** The price band reflects what the issuer wants to receive, not what the company is worth.
- **Mistaking strategy prose for guidance.** "Business Strategies" sections read like forward guidance but are aspirational — never quote them as if they were numeric management commitments.
- **Skipping the anchor investor allottee list because it's not fully posted yet.** Chittorgarh's anchor section usually has the allocation price/date; the allottee names sometimes need a follow-up web search — do it in the same pass rather than waiting for the user to ask.
- **Confusing "no order book conversion risk disclosure" with "no risk."** If the company doesn't caveat its order book, that's still worth noting as a gap, not a clean bill of health.
- **Reaching for `WebSearch` for same-day bulk/block deal data.** It's frequently not indexed yet. Go straight to `nse.getLargeDeals()` / `bse.getBulkBlockDeals()` (see §18) — same source `dealsDigest.js` uses.
- **Defaulting to the DRHP when an RHP already exists.** The RHP is the final, priced version and supersedes the DRHP — Phase 0 should surface the RHP link directly from Chittorgarh; only fall back to the DRHP if the issue hasn't priced yet.
- **Using ipoplatform.com as if it were independent verification of chittorgarh.com (or vice versa).** They share a parent organization — see the note at the top of this file. Treat agreement between them as one source, not two; NSE/BSE direct APIs are the only genuinely independent cross-check (see `ipo_data_sources.md`).

## File tree

```
drhp-ipo-analysis/
├── SKILL.md                                 (this file)
├── _shared/
│   ├── conventions.md                       (linked)
│   └── pdf_utils.py                         (shared)
├── references/
│   ├── drhp_10section.md                    (full 19-section framework — filename kept for
│                                                git-history continuity; content covers all 19)
│   └── drhp_red_flags.md                    (explicit red-flag checklist)
└── scripts/
    ├── generate_drhp_pdf.py                 (PDF generator, JS-generator-path alternative)
    └── render_drhp.py                       (UI-layer renderer — pure function of the DTO;
                                                see its module docstring for the full field
                                                list it consumes. Data layer writes the DTO via
                                                db.saveReport(); this script only lays it out.)
```

## Related skills

- `ipo-subscription-ranker` — the batch/daily counterpart; scans IPOPlatform for tomorrow's
  listings and runs this skill's full analysis on the top 3 by subscription quality. Shares
  the same `ipoSubscriptionScanner.js` parsers and `ipoScoring.js` scoring functions this
  skill's Phase 0 uses — never fork a second copy of either.
- `investment-thesis-engine` — the verdict vocabulary here is deliberately identical to this
  skill's signal taxonomy, so a company that later gets a full thesis carries a consistent
  signal across both.
