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
4. CLASSIFY significance: high | medium | low | routine.
     high   — M&A, large capex, major order win (>10% of revenue), regulatory
              action, management change, equity dilution, change of control.
     medium — strategic subsidiaries, smaller acquisitions, analyst/investor meets,
              new product launches, credit-rating changes, capacity commissioning.
     low    — minor disclosures, press releases with limited new information.
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
