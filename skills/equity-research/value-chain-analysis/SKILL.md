---
name: value-chain-analysis
description: >
  Buy-side value chain analysis for a company or industry — maps the journey from raw
  input to end customer and identifies where economic value actually concentrates and
  why. Use whenever the user asks "value chain of X", "where does the margin sit in this
  industry", "who owns the bottleneck", "map the chain for X", "where is value
  migrating", "which part of the chain has the moat", or when sector-research-deepdive /
  investment-thesis-engine (Theme pillar) needs a value-chain module. Output is a
  structured note (MD or HTML widget, plus a Drive-shareable PDF when rendered as a widget)
  ending with a 10-year positioning verdict.
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

**Persist the JSON DTO first.** Before writing the stage-by-stage table or rendering the
widget, persist via `db.saveReport(dto)` (`packages/jobs-runtime/lib/db.js`, type
`value-chain`) — NOT a hand-placed file under `data/agent-outputs/`; this is what makes the
DTO Drive-mirrored and re-readable by the PDF step below. A top-level array with one record
per named company that appears in the chain (each stage names actual companies; every named
company gets its own record). Each record MUST carry the standard
envelope from `skills/tooling/output-dto-standard/SKILL.md` — `companyId` (canonical
`EXCH:SYMBOL` where the company is listed; if unlisted/private, use the company name as a
best-effort id and note it's unlisted), `creationTime`, `modifiedTime`,
`creator: "value-chain-analysis"`, and `modelUsed` (the model you're running as — the
chokepoint/positioning/value-migration read is LLM analysis, required per
`output-dto-standard/SKILL.md`) — plus domain fields: `stage`, `whoControls`,
`marginProfile`, `chokepoint`, `valueMigrationDirection`, and (for the company being
researched, if any) the `positioning10yr` verdict and the "what could be wrong" note. The
table and diagram below are a render of this JSON, not an independently drafted note.

- Stage-by-stage table: Stage | Who controls | Margin profile | Chokepoint | Direction of
  value migration | Key players.
- One diagram-style summary (HTML widget or ASCII chain) marking the high-margin nodes.
- Mandatory closing: **"Where would you want to be positioned in this chain for the next
  decade — and why?"** followed by **"What could be wrong with this analysis?"**
- If the company being researched sits in a weak node, say so plainly — this feeds the
  Theme pillar of `investment-thesis-engine`.
- **PDF artifact.** Whenever the diagram-style summary is rendered as an HTML widget (not
  the plain ASCII-chain fallback), also render a PDF from the same DTO — see
  [`skills/_shared/pdf-artifact-step.md`](../../_shared/pdf-artifact-step.md). Save to
  `data/assets/value-chain-analysis/<Industry>_ValueChain.pdf` and end with
  `node packages/jobs-runtime/scripts/data.js push` so it's Drive-shareable.

Optional NotebookLM-style variant: condense into 5–6 slide-sized sections (use `pptx`
skill) explaining the chain, where the moat sits, and any special tech — visuals over text.
