---
name: consecutive-filings-diff
description: Institutional-grade forensic diff across consecutive quarterly investor presentations (Q-1 vs Q), reconciled with the latest concall transcript, and repriced with live market data for any listed company. Use this skill whenever the user uploads two or more consecutive investor presentations, uploads a concall transcript alongside a presentation, says "diff these decks", "compare Q3 vs Q4 presentation", "update the thesis with the latest concall", "reprice this stock after results", or provides back-to-back quarterly filings. Also trigger when the user has an existing research thesis and new quarterly data arrives, or says "update it with the latest results". Produces an institutional briefing covering P&L diff, balance sheet & cash flow quality, operational KPIs, positive/negative surprises, new growth triggers, growth-hampering events, new products/verticals, capacity additions, concall reconciliation, and valuation reset at live CMP — rendered as an interactive HTML widget.
---

# Consecutive Filings Diff & Thesis Repricing

A three-phase workflow for extracting maximum alpha from consecutive quarterly filings + concall + live price, packaged as an institutional research deliverable.

This skill is designed for equity research analysts who already have a working thesis on a stock and need to refresh it with each new quarterly data drop. The workflow is brutally disciplined: diff the primary documents first, layer in the concall commentary second, reprice with live market data third — in that order, no shortcuts.

## When to use this skill

- User uploads two quarterly investor presentations (e.g., Q3 FY26 deck + Q4 FY26 deck)
- User uploads a concall transcript alongside one or more presentations
- User says any variant of: "diff these decks", "compare the two presentations", "update the thesis", "reprice with the latest numbers", "run the concall through", "what changed between these two quarters"
- User has an existing sector thesis (e.g., from prior conversation context) and new quarterly data becomes available
- User asks "is management on track for guidance?" with filings in hand

## The three phases

The skill follows a strict three-phase sequence. Each phase has a deliverable. Do not skip ahead.

### Phase 1 — Document Diff

Extract structured data from both presentations and produce a line-by-line diff across 9 dimensions. See `references/phase1_diff_framework.md` for the full framework.

### Phase 2 — Concall Reconciliation

Read the concall transcript line by line. Map management commentary onto the Phase 1 findings. Every flag raised in Phase 1 must be explicitly checked: did the concall address it, and how? See `references/phase2_concall_reconciliation.md` for the reconciliation framework.

### Phase 3 — Live Repricing

Pull live CMP and market cap from at least two independent sources (screener.in is often cached — use dhan.co, kotakneo.com, tickertape.in as fallbacks). Recompute TTM P/E, FY+1 forward P/E, and discount/premium to the framework fair value. Rebuild the risk-reward ladder. See `references/phase3_live_repricing.md` for the pricing and scenario framework.

## Quick-start sequence

When this skill triggers:

1. **Confirm you have the inputs.** The user needs to have provided (a) prior quarter's investor presentation, (b) latest quarter's investor presentation, and optionally (c) the concall transcript for the latest quarter. If anything is missing, ask — do not fabricate.

2. **Read both presentations in full.** Don't skim. Both decks must be read cover-to-cover before you start the diff, because page ordering differs and some line items only appear in one deck.

3. **Open `references/phase1_diff_framework.md`** and run the 9-dimension diff. Produce the structured output per the framework.

4. **If a concall transcript is provided, open `references/phase2_concall_reconciliation.md`** and run the reconciliation. Management commentary often resolves or amplifies Phase 1 flags — treat the concall as a debate between your flags and management's narrative.

5. **Pull live price data.** Use the data sourcing guidance in `references/phase3_live_repricing.md`. Screener.in's quoted price is often stale by days or weeks — always verify against at least one live tick source.

6. **Produce the final institutional briefing** as an interactive HTML widget using the visualize tool. The widget structure is defined in `assets/briefing_template.html` — follow it unless the user asks for something different.

7. **End with a conviction verdict.** Three bullet points maximum. What changed, what the price move means, what the action framework is now.

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
9. **Valuation reset at live CMP** — with scenario ladder and discount to framework fair value
10. **Verdict band** — 5–8 chip-style summary tags

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