---
name: quarterly-result-analysis
description: Industry-agnostic single-quarter result interpretation for Indian listed companies — applies the 3-basket framework (Business / Risk / Management) plus a forward 2-8 quarter monitoring checklist. Use whenever the user uploads a quarterly investor presentation, concall, or result PDF and asks "analyse this quarter", "what changed this quarter", "is the business getting better", "what's management signalling", "result analysis", "quarterly snapshot", "post-result note", or provides a Stockscans ticker with result-day intent. Auto-fetches the latest PPT + Transcript + Result from Stockscans when given only a ticker. Output is an interactive briefing widget tagging every observation Structural / Cyclical / Temporary, classifying management tone, tracking narrative shift vs prior quarters, ending with a forward checklist. NOT for two-quarter forensic diffs (use consecutive-filings-diff), transcript-only dives (use concall-analysis), or multi-year deep dives (use equity-research-deepdive).
---

# Quarterly Result Analysis

> Your job is NOT to summarize quarterly numbers. Your job is to identify what is improving inside the business, what can accelerate future earnings, what can rerate valuation, what risks are emerging, and how management commentary is evolving.

A focused single-quarter interpretive note built around three baskets — **Business** (what is improving), **Risk** (what can go wrong), **Management** (what they signal between the lines) — and a forward-looking monitoring checklist. Industry-agnostic. Works for FMCG, capital goods, financials, IT, pharma, infra, anything.

## When to use this skill

- User uploads any combination of: quarterly investor presentation, concall transcript, results PDF, and asks for interpretation
- User says any variant of: "analyse this quarter", "what changed", "post-result note", "result interpretation", "quarterly snapshot", "what's improving / what can go wrong", "what is management signalling"
- User provides only a Stockscans ticker plus result-day intent — the skill auto-fetches the latest PPT + Transcript + Result
- Another skill needs a single-quarter interpretive layer (e.g., to bolt onto a multi-quarter analysis)

## How this differs from neighbouring skills

| If you need... | Route to |
|---|---|
| Two-quarter forensic diff with repricing | `consecutive-filings-diff` |
| Concall transcript-only deep / brief / multi-Q | `concall-analysis` |
| Full 15-40 page deep dive across years | `equity-research-deepdive` |
| 1-page conviction note with growth triggers | `growth-triggers-1pager` |
| 3-year fraud / accounting quality scan | `forensic-accounting` |
| Walk-the-talk credibility scoring (4-8 calls) | `management-credibility-tracker` |
| **"What does THIS quarter mean for the thesis?" interpretive note** | **THIS SKILL** |

The defining feature: this skill produces an *interpretation*, not an extraction. It looks at one quarter of disclosures and answers "so what?" If the user is asking for a forensic diff, a transcript deep dive, or a multi-year report, route there instead.

## Conventions

Follow [`_shared/conventions.md`](../_shared/conventions.md). Particularly:
- §1 Indian-market conventions — Rs Cr, FY26, Q3 FY26
- §2 Citation discipline — every claim sourced
- §3 Anti-hallucination protocol — Source → Extract → Verify → Interpret
- §6 Conviction taxonomy — Structural / Cyclical / Temporary applied to every observation here

## Workflow — 3 phases

### Phase 1 — Document acquisition

If the user uploaded files directly, use those. If the user provided only a ticker, auto-fetch:

```bash
TICKER="NSE:SWARAJENG"            # replace with the actual ticker
SAFE=$(echo "$TICKER" | tr ':' '_')
DOCS_DIR="/tmp/${SAFE}_qra_docs"

# Latest quarter's PPT + Transcript + Result
python3 packages/stock-api/python/fetchers/fetch_documents.py "$TICKER" \
    -t PPT Transcript Result \
    --last-n 1 \
    -o "$DOCS_DIR"
```

For the **"change vs prior quarters"** sub-section in the Management basket, the prior quarter's transcript is essential. Fetch one extra Transcript:

```bash
python3 packages/stock-api/python/fetchers/fetch_documents.py "$TICKER" \
    -t Transcript --last-n 2 -o "$DOCS_DIR"
```

Read `$DOCS_DIR/manifest.json` to confirm what arrived. If any of the three primary documents is missing for the latest quarter, surface this explicitly — do not paper over the gap with annual report data or web summaries.

### Phase 2 — 3-basket analysis

Open [`references/basket_framework.md`](references/basket_framework.md) and run the full framework. The three baskets and a final checklist:

| Basket | Theme | Sub-sections |
|---|---|---|
| 1. **BUSINESS** | What is improving? | Growth drivers · Margin & profitability triggers · Capex, BS & cash flow · Future earnings triggers |
| 2. **RISK** | What can go wrong? | Business risks · Management commentary risks · Industry & macro risks |
| 3. **MANAGEMENT** | Between the lines | Tone · Change vs prior quarters · Strategic direction (3-5 yr) · Capital allocation quality |
| **Final** | What to monitor | Investor monitoring checklist — 6-10 items over 2-8 quarters |

Two reference files support this phase:
- [`references/tone_taxonomy.md`](references/tone_taxonomy.md) — the six tone labels (aggressive / confident / cautious / defensive / opportunistic / conservative) with evidence patterns
- [`references/monitoring_checklist_patterns.md`](references/monitoring_checklist_patterns.md) — how to build a falsifiable forward checklist (KPI + threshold + horizon)

### Phase 3 — Render the briefing widget

The primary output is an interactive HTML widget rendered via `visualize:show_widget`. Use [`assets/result_widget_template.html`](assets/result_widget_template.html) as the structural reference — copy the `<style>` block and section skeletons, populate with the Phase 2 findings.

Widget structure (top to bottom):

1. **Header band** — company + ticker + quarter + result date + CMP + market cap
2. **Verdict chips** — 5 to 8 single-word tags summarising the quarter (e.g. `MARGIN INFLECTION`, `EXPORT SCALE-UP`, `CAUTIOUS TONE`, `CAPEX HEAVY`)
3. **Basket 1 — BUSINESS** — growth drivers, margins, capex/BS/CF, future triggers; each item tagged `STRUCTURAL` / `CYCLICAL` / `TEMPORARY`
4. **Basket 2 — RISK** — business, commentary, macro; each item with severity (`HIGH` / `MED` / `LOW`)
5. **Basket 3 — MANAGEMENT** — tone label + evidence quote · narrative shift vs prior · 3-5yr strategic build · capital allocation grade
6. **Monitoring checklist** — table with `# | KPI | Threshold | Horizon | Source`

After the widget renders, write 2-3 short paragraphs outside it. Lead each with a bolded takeaway. These are the analytically-significant observations that need full-sentence treatment — *not* a rehash of widget content. End with a falsifiable prediction or the specific next catalyst to watch (e.g., "Q1 FY27 result will test whether margin expansion is structural — gross margin must stay above 28% even if commodity prices reverse").

## Core principles

**Tag every observation Structural / Cyclical / Temporary.** This is the most important taxonomy in this skill — it determines whether a development affects fair value (structural) or only the next 1-2 quarters (cyclical/temporary). Never leave an observation untagged.

| Tag | Meaning | Example |
|---|---|---|
| `STRUCTURAL` | Changes the company's earnings power permanently | Premium-product mix shifting from 20% → 40% of revenue, ROCE ceiling rising |
| `CYCLICAL` | Tied to industry / commodity / interest-rate cycle | Steel margin expanding because HRC prices are rising |
| `TEMPORARY` | One-off; will reverse within 1-2 quarters | Inventory de-stocking by distributors before GST rate change |

**Interpret tone, don't quote it.** Phase 2 expects you to *classify* management as one of six tone labels — with one short evidence quote per label. Reproducing five paragraphs of management commentary is not analysis.

**Avoid number-repetition.** The investor presentation already contains the numbers. This skill is for interpretation, not summary. If you find yourself listing "revenue Rs X Cr, EBITDA Rs Y Cr, PAT Rs Z Cr" — stop. State only the numbers that change the thesis.

**Track what management *stopped* saying.** If a topic that dominated three prior calls (e.g., "exports will scale to 20%") is silent this quarter — that is a yellow flag. The Management basket's "Change vs prior quarters" sub-section is where this lives, and it's why the prior transcript should be fetched.

**Specific over generic.** "India GDP growth" is not a tailwind. "BS-VI emission norms forcing Tier-1 OEMs to replace legacy ICE platforms, of which 60% of our order book is for new platforms" is a tailwind. No textbook explanations.

**Falsifiable monitoring items only.** Every item in the forward checklist must have a number threshold and a quarter horizon. "Watch margins" is not a checklist item. "Gross margin staying above 28% in Q1 FY27" is.

## Pitfalls

- **Don't reflow the concall.** This skill is *not* `concall-analysis`. If the user wants a transcript deep dive, route there. Here, the concall is *one* of three input sources, used for tone, guidance, and dodged-question signals — not for sentence-by-sentence extraction.
- **Don't build a forensic accounting view.** That's `forensic-accounting`'s job. Here, balance sheet & cash flow appear inside Basket 1 only when they affect future earnings power (e.g., deleveraging unlocking ROCE), not as a red-flag scan.
- **Don't skip the monitoring checklist.** It is the most valuable section for a PM who reads the note today and needs to know what data points to check next quarter. 6-10 items, every one with a number threshold and horizon.
- **Don't let "tone" become editorialising.** "Management seemed nervous" without quotation evidence is hallucination. Every tone label needs one short verbatim quote.
- **Don't conflate cyclical recovery with structural improvement.** A steel company's margin expanding because HRC prices rose is *cyclical*. The same company shifting 30% of volumes to value-added speciality grades is *structural*. Tag carefully.

## Output file naming

The widget renders inline via `visualize:show_widget`. If the user explicitly asks for a saved file or attachment:

`/mnt/project/packages/cowork-jobs/data/agent-outputs/<Company>_Q<X>_FY<YY>_ResultAnalysis.html` (standalone — replace CSS variables with literal colours)

If the user wants a PDF instead, suggest routing to `equity-research-deepdive` for a full report, or use the inline widget as the deliverable. This skill's natural medium is the interactive briefing.
