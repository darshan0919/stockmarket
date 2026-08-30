# SOIC "New Information" Framework — applied to corporate announcements

## The core idea

Markets price in expectations, not events. A stock re-rates on the DELTA between what
the market believed yesterday and what it can believe today — not on the raw
significance of an announcement's category. An acquisition, a demerger, a management
change: these categories correlate with high impact on AVERAGE (which is exactly why
`announcement-insights` flags them `HIGH_CONVICTION` by default), but the correlation
breaks down completely for any single announcement that was already substantially
known, discussed, or committed to before the filing date.

This is the mistake this skill exists to prevent: treating "big category" as a proxy for
"big surprise." They are correlated, not identical, and conflating them is exactly how a
research process ends up loudly flagging non-events and staying quiet on genuinely novel
developments that happen to fall in an unglamorous category.

## Why retail has a structural edge here specifically

Institutional research desks track guidance and management commentary closely for
large-caps, so the KNOWN bucket is usually well-priced by them. But for small/mid-caps —
exactly where a lot of this repo's watchlist-driven research lives — institutional
coverage is thin, concall attendance is low, and PPTs are barely read. That means:

1. A retail investor who DOES do the baseline-check work in this skill has a genuine
   edge over the market's average information state, because most participants aren't
   doing it.
2. The KNOWN bucket isn't just "priced in for everyone" — it may be priced in only for
   the small number of people who were paying attention, meaning even a KNOWN
   confirmation can still move the stock as OTHER less-informed participants catch up.
   Don't treat KNOWN as automatically "no signal" — treat it as "lower marginal signal
   for someone who already had the baseline; possibly still signal for the market's
   average participant." Say this distinction explicitly when it matters (e.g. a
   small-cap with very low analyst coverage vs a heavily-tracked large-cap).

## Calibration by claim type

- **Numbers** (deal size, capacity figures, dates): the standard for "already known" is
  high — a vague prior mention of "considering opportunities" does NOT make a specific
  ₹200 Cr, Q3FY27 announcement KNOWN; it makes it FOLLOW-UP at best (direction was known,
  specifics were not).
- **Counterparty identity** (who is being acquired, who the new director is): treat as
  its own claim, separate from the fact that "an acquisition/appointment was coming." A
  company confirming "we are acquiring XYZ Pvt Ltd" when it had only said "in advanced
  talks" without naming a target should have the target's IDENTITY bucketed NEW even
  while the fact-of-a-deal is KNOWN.
- **Decisions with binary outcomes** (board approves X, shareholders reject Y): if
  management said "we will put this to the board next quarter," the OUTCOME is still NEW
  even if the PROCESS was KNOWN — a board can decline just as easily as approve.
- **Routine/scheduled events** (AGM notice, record date for a previously-announced
  dividend): these are near-always KNOWN or not worth a claim-level entry at all — don't
  manufacture a NEW/KNOWN split for administrative housekeeping that carries no
  information content either way.

## Common failure patterns to watch for

- **False KNOWN from vague prior language.** "We continue to evaluate strategic options"
  said on three consecutive concalls does NOT make a specific, named transaction KNOWN —
  it's boilerplate hedge language until a specific claim is verifiable in the baseline.
  Require a SPECIFIC prior statement (name, number, date) to justify KNOWN; a vague
  gesture in the general direction justifies FOLLOW-UP at most.
- **False NEW from thin lookback.** The inverse failure — see the "What could be wrong"
  section in the main SKILL.md. A claim isn't NEW just because your 4-concall,
  1-PPT, 24-month-announcement search didn't find it; it's NEW *relative to that
  baseline*, and the baseline's completeness must always be reported alongside the
  verdict.
- **Category-anchoring.** Do not let `announcement-insights`' `HIGH_CONVICTION` /
  `significance` flags bias the claim-level read. Read the baseline first, form the
  NEW/KNOWN/FOLLOW-UP view independently, THEN compare it against the taxonomy's
  category-based significance — the interesting output is precisely where the two
  disagree.
