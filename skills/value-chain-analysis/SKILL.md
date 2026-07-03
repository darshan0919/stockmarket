---
name: value-chain-analysis
description: >
  Buy-side value chain analysis for a company or industry — maps the journey from raw
  input to end customer and identifies where economic value actually concentrates and
  why. Use whenever the user asks "value chain of X", "where does the margin sit in this
  industry", "who owns the bottleneck", "map the chain for X", "where is value
  migrating", "which part of the chain has the moat", or when sector-research-deepdive /
  investment-thesis-engine (Theme pillar) needs a value-chain module. Output is a
  structured note (MD or HTML widget) ending with a 10-year positioning verdict.
---

# Value Chain Analysis

Source: SOIC value-chain prompt (Google Doc prompt library). Follow
`skills/_shared/data-verification.md` — every margin/share claim needs a source tag.

Analyze as a buy-side analyst trying to understand where economic value concentrates and
why. Map the chain raw input → end customer into 5–8 stages. For EACH stage answer:

1. **Who controls it?** Fragmented players or concentrated oligopoly? Vertically integrated
   incumbents or specialists? Name actual companies (Indian market first, global context).
2. **Margin profile.** Which stages earn outsized returns, which are commoditized
   pass-throughs — and WHY the economics work that way (evidence: 3-year gross-margin
   trends of representative players, tagged [R]/[D]/[E]).
3. **Chokepoints.** What's scarce — capacity, capability, relationships, regulatory access,
   IP, or scale? Who owns the bottleneck?
4. **Value migration.** Shifting upstream (inputs/components), downstream
   (distribution/customer ownership), or being captured by new entrants attacking one stage?
5. **Technology edges.** Any key technological advantage in the chain? What makes it unique
   and how long to replicate?
6. **Disruption test.** If a well-capitalized outsider attacked the most profitable node,
   how would they do it? What's the incumbent's defense?

**Platform/consumer-internet businesses:** replace the physical chain with the customer
journey — acquisition → first transaction → repeat behaviour → monetisation → LTV — and do
per-transaction unit economics per stage instead of stage margins.

## Output

- Stage-by-stage table: Stage | Who controls | Margin profile | Chokepoint | Direction of
  value migration | Key players.
- One diagram-style summary (HTML widget or ASCII chain) marking the high-margin nodes.
- Mandatory closing: **"Where would you want to be positioned in this chain for the next
  decade — and why?"** followed by **"What could be wrong with this analysis?"**
- If the company being researched sits in a weak node, say so plainly — this feeds the
  Theme pillar of `investment-thesis-engine`.

Optional NotebookLM-style variant: condense into 5–6 slide-sized sections (use `pptx`
skill) explaining the chain, where the moat sits, and any special tech — visuals over text.
