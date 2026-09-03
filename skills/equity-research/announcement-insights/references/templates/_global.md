═══════════════════════════════════════════════════════════════════════════════
INSIGHT GENERATION — GLOBAL RULES (apply to EVERY announcement, every category)
═══════════════════════════════════════════════════════════════════════════════

1. READ THE ACTUAL PDF FIRST. Run `read-pdf <pdfUrl>` and base the insight on the
   document body. NEVER write an insight from the title/description alone — that is
   the #1 quality failure. If the PDF is empty/404/unparseable, say so explicitly
   in the insight, then fall back to the description.
2. BE ACTIONABLE AND SPECIFIC. Pull the hard facts out of the PDF: names, absolute
   numbers, percentages, ₹ amounts, dates, counterparties, thresholds. Generic
   restatements like "the exchange has received a disclosure" or "the company made
   an announcement" are NOT acceptable — they carry zero decision value.
3. STRUCTURE (3–6 sentences at `standard` depth; see the category template for
   `deep`/`quick` variants):
   (a) What happened — with the extracted numbers.
   (b) Why it matters — shareholder impact, direction (positive/negative/neutral)
   AND magnitude.
   (c) Connection to prior notes — trend, consistency, or contradiction vs this
   company's earlier notes.
   (d) What to watch next — one concrete, monitorable point.
   3.5. HEADLINE + THESIS CHAIN + EPS IMPACT (structured fields, in addition to the
   `insight` prose above — same underlying analysis, not a second research pass):
   - `headline`: ONE crisp line combining what happened + how it plausibly
     changes future EPS. Fragment style, not a full sentence with a subject and
     verb clause for each half — e.g. "₹65cr share-swap dilutes FY27 EPS ~2%"
     not "The company announced a share swap which is expected to..." If no EPS
     link can honestly be derived (routine disclosures, investor-meet reschedules,
     procedural filings), the headline states the strongest forward-looking read
     available instead — do not force an EPS claim that isn't supported by the
     document. Never fabricate a number to fill this field.
   - `thesisChain`: an ordered array of short causal steps, each one clause,
     reading like a chain of "this happened → this → this → this will happen to
     EPS": step 1 is the fact from the filing, each subsequent step is the
     direct consequence of the one before it, and the LAST step — only when
     genuinely derivable — states the EPS/earnings effect with a timeline (e.g.
     "adds ~₹4cr annualised PAT from Q2FY27" or "no EPS impact expected before
     FY28 commissioning"). 3-5 steps is typical; use fewer for a simple filing
     rather than padding. If the chain cannot honestly reach an EPS conclusion,
     end it at the last step you can actually support (e.g. "strengthens
     bargaining position with X supplier" ) rather than inventing a forced final
     step — a shorter, honest chain beats a longer, speculative one. Do NOT
     prefix steps 2+ with "so"/"so that"/"and so" — every renderer joins the
     array with an arrow (→) between steps, which already carries that
     causal/sequential meaning; writing "so" as well is a redundant restatement
     of what the arrow already says. Write each step as a bare clause: "EPS is
     mechanically diluted ~4.7%", not "so EPS is mechanically diluted ~4.7%".
   - `epsImpact`: `null` when no EPS linkage is derivable (this is a valid,
     expected outcome for most `general`/`investor_meet`/procedural
     announcements — do not force a number). When derivable:
     `{direction: "positive"|"negative"|"neutral", magnitude: "<free text, e.g.
'~2% dilution' or '~₹4cr annualised PAT'>", timeline: "<free text, e.g. 'from
Q2FY27' or 'FY28 onward'>", confidence: "high"|"medium"|"low"}`. `confidence`
     reflects how directly the filing supports the number — a disclosed rupee
     figure with a stated date is `high`; a qualitative directional read with no
     hard number is `low`.
   - These three fields are ADDITIVE to steps (a)-(d) above — they don't replace
     the prose `insight`, they give a renderer (email digest, widget, PDF) a
     structured hook so it never has to re-summarize or re-derive the causal
     chain from a paragraph. Populate them for every note, including `routine`/
     `low` significance ones (a short chain and a `headline` still apply even
     when `epsImpact` ends up `null`).
4. CLASSIFY significance: high | medium | low | routine.
   high — M&A, large capex, major order win (>10% of revenue), regulatory
   action, management change, equity dilution, change of control.
   medium — strategic subsidiaries, smaller acquisitions, analyst/investor meets,
   new product launches, credit-rating changes, capacity commissioning.
   low — minor disclosures, press releases with limited new information.
   routine— passed the noise filter but carries no real signal (state why).
5. TAG from: capex, order_win, acquisition, merger, demerger, subsidiary,
   management_change, equity_dilution, debt, credit_rating, capacity,
   international_expansion, regulatory, dividend, buyback, agm_outcome, concall,
   investor_meet, press_release, fundraise, high_conviction.
6. HIGH-CONVICTION CATEGORIES (`demerger`, `merger`, `acquisition`,
   `management_change`) additionally require: `significance` floor of `medium`
   (never `routine`/`low` purely because the deal is small — a ₹250cr demerger of
   an unloved segment is exactly the base-rate-favourable setup, see the deep
   playbook), the `high_conviction` tag, and a one-line "why this clears the
   research bar" note even when you conclude the immediate stock reaction should
   be small. See `references/demerger-merger-management-change-playbook.md` for
   the full valuation/timing framework behind this — don't skip straight to
   writing the insight without reading it at least once per category.
