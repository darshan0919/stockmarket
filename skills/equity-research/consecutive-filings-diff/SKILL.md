---
name: consecutive-filings-diff
description: Institutional-grade forensic diff across consecutive quarterly investor presentations (Q-1 vs Q), reconciled with the latest concall transcript, cross-checked against explicit forward guidance extracted from that same concall, and repriced with live market data for any listed company. Use this skill whenever the user uploads two or more consecutive investor presentations, uploads a concall transcript alongside a presentation, says "diff these decks", "compare Q3 vs Q4 presentation", "update the thesis with the latest concall", "reprice this stock after results", or provides back-to-back quarterly filings. Also trigger when the user has an existing research thesis and new quarterly data arrives, or says "update it with the latest results". Produces a single institutional briefing covering P&L diff, balance sheet & cash flow quality, operational KPIs, positive/negative surprises, new growth triggers, growth-hampering events, new products/verticals, capacity additions, concall reconciliation, forward guidance (always extracted via forward-guidance-extractor and folded into this same report), and valuation reset at live CMP — rendered as a single interactive HTML widget.
---

# Consecutive Filings Diff & Thesis Repricing

A three-phase workflow for extracting maximum alpha from consecutive quarterly filings + concall + live price, packaged as an institutional research deliverable.

This skill is designed for equity research analysts who already have a working thesis on a stock and need to refresh it with each new quarterly data drop. The workflow is brutally disciplined: diff the primary documents first, layer in the concall commentary second, reprice with live market data third — in that order, no shortcuts.

## When to use this skill

- User uploads two quarterly investor presentations (e.g., Q3 FY26 deck + Q4 FY26 deck)
- User uploads a concall transcript alongside one or more presentations
- **User provides only a Stockscans ticker** — the skill auto-fetches the two most recent investor presentations (`stock-documents-fetcher`) and the latest concall transcript (`concall-transcript-extractor`)
- User says any variant of: "diff these decks", "compare the two presentations", "update the thesis", "reprice with the latest numbers", "run the concall through", "what changed between these two quarters"
- User has an existing sector thesis (e.g., from prior conversation context) and new quarterly data becomes available
- User asks "is management on track for guidance?" with filings in hand

## Phase 0 — Document acquisition (ticker-only input)

If the user provides a Stockscans ticker but has NOT uploaded any files, auto-fetch the two most recent investor presentations and the latest concall transcript before proceeding to Phase 1.

```bash
TICKER="NSE:BSE"                  # replace with actual ticker
SAFE=$(echo "$TICKER" | tr ':' '_')
DOCS_DIR="/tmp/${SAFE}_diff_docs"

# Two most recent investor presentations (prior quarter + latest quarter)
python3 stock-api/python/fetchers/fetch_documents.py "$TICKER" \
    -t PPT --last-n 2 -o "$DOCS_DIR"

# Latest concall transcript — this skill's core trigger ("update the thesis
# with the latest concall") fires right after a results drop, exactly when
# the official Transcript is most likely NOT filed yet. Use
# concall-transcript-extractor, not a direct fetch:
node stock-api/bin/get-latest-concall-transcript.js "$TICKER"
```

After fetching, read `$DOCS_DIR/manifest.json` to confirm what was downloaded. The two PPT entries will be sorted newest-first by `date` — the one with the **higher** `date` value is "Q" (latest quarter) and the **lower** date is "Q-1" (prior quarter). This is the correct orientation for the Phase 1 diff.

Handle the transcript call's `status`: `official-transcript-exists` → run
`fetch_documents.py -t Transcript --last-n 1 -o "$DOCS_DIR"` to actually
download it; `saved` → read `fullText` from `data/reports/<id>.json` (the
`id` in the output) for Phase 2, no PDF needed; `results-not-out` → the PPT
fetch above almost certainly returned nothing new either — confirm with the
user before proceeding, this diff may not be ready yet; `needs-recording-pipeline`
→ follow `concall-transcript-extractor`'s tier 3 if a recording exists, else
proceed to Phase 1/3 without a concall and skip Phase 2 (note the gap rather
than fabricating reconciliation).

If the company does not publish investor presentations (manifest returns 0 PPT documents), use the two most recent `Result` filings as a substitute:

```bash
python3 stock-api/python/fetchers/fetch_documents.py "$TICKER" \
    -t Result --last-n 2 -o "$DOCS_DIR"
```

Confirm with the user which documents will be used as the two comparison points before starting Phase 1.

## The three phases

The skill follows a strict three-phase sequence. Each phase has a deliverable. Do not skip ahead.

### Phase 1 — Document Diff

Extract structured data from both presentations and produce a line-by-line diff across 9 dimensions. See `references/phase1_diff_framework.md` for the full framework.

### Phase 2 — Concall Reconciliation

Read the concall transcript line by line. Map management commentary onto the Phase 1 findings. Every flag raised in Phase 1 must be explicitly checked: did the concall address it, and how? See `references/phase2_concall_reconciliation.md` for the reconciliation framework.

### Phase 3 — Live Repricing

Pull live CMP and market cap from at least two independent sources (screener.in is often cached — use dhan.co, kotakneo.com, tickertape.in as fallbacks). Recompute TTM P/E, FY+1 forward P/E, and discount/premium to the framework fair value. Rebuild the risk-reward ladder. See `references/phase3_live_repricing.md` for the pricing and scenario framework.

### Phase 4 — Forward guidance extraction (always run, no exceptions)

Every consecutive-filings-diff run has a concall transcript in hand by this point (from Phase 0/2), which is exactly the input `forward-guidance-extractor` needs — so always invoke that skill's Phase 1–3 for the current ticker/quarter rather than re-deriving guidance ad hoc inside this skill. Two things this buys you: the zero-assumption discipline (explicit, quantified guidance only — no "we expect to grow" rows) already lives in that skill's script pipeline, and a company that gets diffed today has its guidance persisted for the next quarter's walk-the-talk comparison for free.

Concretely:
1. Run `forward-guidance-extractor`'s Phase 1 (`classify_transcript_status.py`) against the same ticker/quarter — it will be an instant `available` hit since the transcript is already in `data/reports/` from this skill's own Phase 0/2.
2. Run that skill's Phase 2 (reasoning — read the transcript once, reuse the same read from Phase 2 above rather than re-reading it) to produce the guidance items, then its Phase 3 script (`compute_guidance_value.py`) to resolve absolute/relative values.
3. Persist via that skill's Phase 4 (`save_forward_guidance.js`) exactly as `forward-guidance-extractor/SKILL.md` specifies — this skill does not invent its own persistence path for guidance data.
4. Take the resulting enriched guidance array and fold it into this skill's own output DTO (see the `forwardGuidance` field below) so it renders as a section inside the SAME widget — do not produce a second, separate guidance workbook for a single-company diff run. The workbook builder (`build_guidance_workbook.py`) is for multi-company batch runs of `forward-guidance-extractor` on its own; a consecutive-filings-diff run is already scoped to one company and one quarter, so skip that step here.

If the transcript resolves to `missing` (no usable transcript at all), note that explicitly in the guidance section rather than fabricating rows or silently omitting the section.

## Quick-start sequence

When this skill triggers:

1. **Confirm you have the inputs.** If the user provided a ticker only (no uploaded files), run Phase 0 above to auto-fetch documents. If the user uploaded files directly, use those. Either way, you need: (a) prior quarter's investor presentation, (b) latest quarter's investor presentation, and optionally (c) the concall transcript for the latest quarter. Do not fabricate missing documents.

2. **Identify Q vs Q-1.** When using auto-fetched files, read `manifest.json` — the PPT entry with the higher `date` value is Q (latest); the lower is Q-1 (prior). When user-uploaded, ask the user to confirm which deck is which if the quarter dates are not obvious from the filenames.

3. **Read both presentations in full.** Don't skim. Both decks must be read cover-to-cover before you start the diff, because page ordering differs and some line items only appear in one deck.

4. **Open `references/phase1_diff_framework.md`** and run the 9-dimension diff. Produce the structured output per the framework.

5. **If a concall transcript is provided, open `references/phase2_concall_reconciliation.md`** and run the reconciliation. Management commentary often resolves or amplifies Phase 1 flags — treat the concall as a debate between your flags and management's narrative.

6. **Pull live price data.** Use the data sourcing guidance in `references/phase3_live_repricing.md`. Screener.in's quoted price is often stale by days or weeks — always verify against at least one live tick source.

6b. **Always run Phase 4 — invoke `forward-guidance-extractor`.** This is not optional and not skippable even for a "quick" diff: you already have the concall transcript in hand, so the marginal cost is one extra reasoning pass, not a new fetch. Follow that skill's Phase 1–4 exactly (transcript classification → explicit-guidance extraction → absolute/relative computation → persistence), then carry its enriched guidance array into this skill's own DTO rather than building a second workbook.

7. **Write the output DTO, then render the widget from it.** Per
   `skills/tooling/output-dto-standard/SKILL.md`, the HTML widget must be reproducible
   FROM a persisted JSON, not generated directly from live reasoning. Before calling the
   visualize tool:
   - Write `{TICKER}_filings_diff.json` (e.g. to `data/agent-outputs/`) capturing the
     diff findings, one record per company, with the required envelope fields plus the
     11 output sections as structured data — roughly:
     ```json
     {
       "companyId": "NSE:BSE",
       "creationTime": "2026-07-07T00:00:00Z",
       "modifiedTime": "2026-07-07T00:00:00Z",
       "creator": "consecutive-filings-diff",
       "quarters": { "current": "Q4FY26", "prior": "Q3FY26" },
       "plDiff": { ... },
       "balanceSheetCashFlow": { ... },
       "operationalKpiDiff": { ... },
       "positiveSurprises": [ ... ],
       "negativeSurprises": [ ... ],
       "newGrowthTriggers": [ ... ],
       "newProductsCapacity": [ ... ],
       "concallReconciliation": [ ... ],
       "forwardGuidance": [ ... ],
       "valuationReset": { ... },
       "verdictChips": [ ... ]
     }
     ```
     `forwardGuidance` is the enriched array produced by `forward-guidance-extractor`'s
     Phase 3 script (`compute_guidance_value.py`) for this same ticker/quarter — each
     item already carries `metric_category`, `metric`, `period_guided`, `display`,
     `base_period`, `quote`, and `stale_reference` fields. Company, ticker, and quarter
     are already fixed by this DTO's own `companyId`/`quarters` fields, so do not repeat
     them inside each guidance item or render them as columns in the widget table.
     If re-running for the same company/quarter pair, read any existing JSON first and
     preserve its original `creationTime`.
   - Then produce the final institutional briefing as an interactive HTML widget using
     the visualize tool, templated FROM that JSON — the widget structure is defined in
     `assets/briefing_template.html` — follow it unless the user asks for something
     different. Do not add facts to the widget that aren't in the JSON; if a fact
     changes, update the JSON first, then re-render.

8. **End with a conviction verdict.** Three bullet points maximum. What changed, what the price move means, what the action framework is now.

## Core principles

**Primary sources only.** Investor presentations and concall transcripts are the primary sources. Do not substitute news articles or analyst reports for actual filings.

**Diff before narrative.** The temptation is to read the concall first because it reads like prose. Resist. The decks contain numeric ground truth — the concall contains management's narrative about that truth. Run the numbers first so you know when management is spinning.

**Every flag must be resolved.** A forensic diff that raises yellow flags and then doesn't track whether the concall addressed them is incomplete. If a flag survives Phase 2, it becomes a watchlist item for the next quarter — label it accordingly.

**Price moves change the thesis.** A stock up 10% on concall day is not the same investment as the same stock four days earlier. The Phase 3 repricing is mandatory, not decorative. The margin-of-safety calculation drives the action framework.

**Institutional tone, always.** No retail hype language. No "to the moon" verbiage. Use Sell-side desk cadence: specific figures, explicit caveats, falsifiable claims. See `references/writing_style.md` for the house style guide.

## Output format

The final deliverable is a single HTML widget rendered via the visualize tool, with these sections in order:

1. **Headline P&L diff** — actual vs prior deck's implied trajectory
2. **Balance sheet & cash flow quality** — with CFO/PAT and working capital ratios
3. **Operational KPI diff** — orderbook, execution, capacity, headcount
4. **Positive surprises (ranked)** — new disclosures not in prior deck
5. **Negative surprises / growth-hampering events** — flagged with materiality
6. **New growth triggers** — not present in prior deck, with conviction tag
7. **New products / verticals / capacity additions** — at the company and subsidiary level
8. **Concall reconciliation** — for each Phase 1 flag, management's position
9. **Forward guidance extracted from the concall** — explicit, quantified guidance only (via `forward-guidance-extractor`), scoped to this company/quarter — no Company/Ticker/Quarter columns since those are already fixed by the report header
10. **Valuation reset at live CMP** — with scenario ladder and discount to framework fair value
11. **Verdict band** — 5–8 chip-style summary tags

See `assets/briefing_template.html` for the exact styling and layout to use.

## Finishing the response

After the widget renders, write 2–4 short paragraphs outside the widget, each starting with a bolded takeaway. These should be the three-to-four most analytically significant observations — not a rehash of the widget. The widget is for scannable reference; the paragraphs are for the thesis-level thinking.

Do NOT end with a generic "feel free to ask for more analysis" sign-off. End with a falsifiable prediction or the specific next catalyst to watch (e.g., "Q1 FY27 results in late July will test whether the CFO/PAT ratio normalizes to 0.80x+").

## Common failure modes to avoid

- **Stale price data.** Screener.in's cached quote is frequently days old. If the user flags this, immediately re-pull from dhan.co or kotakneo.com or similar live source before repricing anything.
- **Missing the one-line gold.** Concalls often have a single decisive sentence (e.g., "margins will keep improving, not normalizing at 15%") that changes the model. Reading transcripts for tone instead of specific claims misses this.
- **Treating both decks as symmetric.** The latest deck supersedes the prior one where they differ — but the prior deck's guidance implicitly sets the bar management is being measured against. Always frame the diff as "vs what was promised or implied in the prior deck."
- **Ignoring subsidiary disclosures.** Parent-subsidiary companies often have the most material disclosures hidden in the parent's capacity or credit rating update, not in the subsidiary's own deck. Check both where relevant.
- **Fabricating quantitative growth rates.** If the deck doesn't disclose a specific number, say so — do not extrapolate and present as fact. When building FY+1 estimates, always label them as estimates with the assumption chain.
