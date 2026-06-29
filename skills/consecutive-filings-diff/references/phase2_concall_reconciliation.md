# Phase 2 — Concall Reconciliation

Phase 1 gives you the numeric ground truth. Phase 2 tests whether management's narrative about that truth holds up. Every flag raised in Phase 1 should be cross-checked against what management said or didn't say on the concall. If a flag isn't addressed, that itself is a data point.

## The core move

Read the concall transcript with your Phase 1 flags open side-by-side. For each flag, find the analyst question (or management opening remark) that touches it — or confirm that no one addressed it. Resolution of a flag requires:

1. A specific management statement (direct quote or close paraphrase)
2. An assessment of whether the statement is specific/falsifiable or evasive
3. A before/after chip change: does the flag remain yellow/red, or does it downgrade to green-monitored?

If a yellow flag is addressed evasively, it stays yellow. If it's addressed with specific operational detail (timelines, counterparty structure, cash conversion cycle), it can downgrade. If it's not addressed at all, it stays yellow with a note: "not addressed on concall — carry to next quarter's watchlist."

## What to extract from the concall

### Opening remarks

Management opening statements are carefully scripted. Key things to extract:

- **New disclosures not in the deck** (often bid pipeline size, order inflow totals, forward-looking capacity plans)
- **Reaffirmation or revision of prior guidance** — e.g., "we maintain our 15% EBITDA margin floor" vs "margins will keep improving"
- **Industry commentary that diverges from the deck** — sometimes management softens the deck's bullish macro claims in the concall because investors push back

### Q&A — the high-value section

Analyst questions on the concall are a curated selection of the market's concerns. Focus on:

1. **Questions about margin sustainability** — management's answer here sets the next year's consensus model
2. **Questions about orderbook / pipeline conversion** — hit ratios, timing of closures, geography mix
3. **Questions about working capital / receivables** — this directly validates or invalidates the Phase 1 CFO/PAT flag
4. **Questions about new verticals or acquisitions** — especially where the deck was silent
5. **Questions about macro risks** — regulatory, tariff, transmission/evacuation, currency

Extract the actual management response verbatim or in close paraphrase. Don't summarize — the exact words matter for forensic scoring.

## The reconciliation table

For each Phase 1 flag, produce a row in this format:

| Phase 1 flag | Addressed on concall? | Management response (verbatim or close paraphrase) | Post-concall classification |

Populate this internally before producing the widget. The widget will display a simplified version of this as the "Updated flag matrix."

## Classification guide

Use these downgrade/upgrade rules:

- **Yellow → Green-monitored:** Management provided a specific, falsifiable answer with numeric or procedural detail. The claim can be tested in the next quarter.
- **Yellow → Yellow-monitored:** Management addressed it but with qualitative reassurance only. The flag remains but is on track.
- **Yellow → Red:** Management evaded the question or the answer revealed something worse than the Phase 1 flag suspected.
- **Red → Yellow:** Rare, but possible when management discloses additional detail that clarifies a previously opaque situation.
- **Red → Red (elevated):** Management didn't address a major concern (e.g., large announced acquisition never mentioned on concall).

## Hunting for the one-line gold

Concalls almost always contain a single decisive sentence that shifts the model more than the rest of the transcript combined. Examples from the institutional canon:

- "Margins will keep improving; it will not get normalized at the 15% floor level"
- "We don't see any payment stretch from the government or companies — most receivables are less than six months"
- "We are selectively participating only where it is suitable to our margin or risk-reward metrics"

These sentences are usually buried in answers to follow-up analyst questions, not in opening remarks. Read the Q&A closely. When you find one, build your post-concall thesis around it — it becomes the linchpin of the updated model.

## What management doesn't address is also signal

Make a list of material disclosures from the Phase 1 diff that do NOT appear anywhere in the concall:

- A large acquisition announced in a recent filing
- A new product line launched between quarters
- A rating downgrade or governance action
- A recent legal filing or regulatory order

If management proactively discusses it, that's neutral. If analysts ask about it, that's neutral. If neither happens and the item was material enough to be in the prior filings, flag it RED-silent and carry to next quarter's watchlist.

## The FY+1 guidance check

Every concall eventually has at least one analyst asking about forward guidance (usually phrased as "what execution are you targeting for FY+1" or "what margin range should we model"). Management's response is critical. The patterns are:

- **Explicit guidance** — rare in India, but when given, it's a strong commitment
- **Directional guidance** — "we see continued growth" — weak, use deck's implied trajectory instead
- **Refused guidance** — "we don't give forward numbers" — fall back to the pipeline and backlog math from Phase 1
- **Threshold reaffirmation** — "we maintain our 15% margin floor" — means the floor is the consensus model input

Update the FY+1 model based on the pattern observed. If management refused guidance, your FY+1 is a bottoms-up build from orderbook + new wins assumption.

## Common concall-era thesis shifts

Across hundreds of Indian mid-cap concalls, these are the patterns where reconciliation often produces the biggest thesis shifts:

1. **Management raising the effective margin floor** without formal guidance revision — always a positive
2. **Acknowledgment of a slowdown in a specific geography** — often macro, not company-specific, but the disclosure itself is a mid-cap stock event
3. **Refusal to quantify hit ratios or conversion probabilities** on large pipelines — benign if historical execution is strong, concerning if the company is a new IPO
4. **First-time disclosure of international / export orderbook** — structurally bullish
5. **Vague answers on related party transactions or promoter entities** — always a RED flag, never resolves to green

## Output format for Phase 2

The Phase 2 output is a "Reconciliation" block in the widget containing:

1. Updated flag matrix (before/after for each Phase 1 flag)
2. Up to 5 verbatim management quotes that changed the thesis
3. List of Phase 1 flags that were NOT addressed (with the implication)
4. Any new flags that emerged from the concall (things the decks didn't disclose)

Do not make the concall reconciliation the centerpiece of the widget — the decks are still the primary source. The concall is the second layer.

## Quality self-check before moving to Phase 3

- [ ] Every Phase 1 flag has a concall-addressed status (yes/no)
- [ ] At least one verbatim management quote is extracted
- [ ] The FY+1 guidance pattern is classified (explicit / directional / refused / threshold)
- [ ] New concall-only disclosures are flagged for Phase 3 incorporation
- [ ] Materiality of silent items is assessed