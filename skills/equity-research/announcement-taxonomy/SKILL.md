---
name: announcement-taxonomy
description: The reasoning layer over the deterministic announcement classifier — reads a filing, judges independently whether it sits on the EPS-accretion / J-curve / re-rating path (SOIC growth-catalyst framework), compares that judgment to what `lib/announcementTaxonomy.js` computed, and writes every disagreement back as a learned rule so the script gets better over time. Use when classifying a filing's SIGNIFICANCE (not just its category), when a scan's classification looks wrong, when asked "is this filing actually a big deal / does this justify a re-rating", or as the review layer any announcement-consuming skill (gainers-signal, volume-rocketing, watchlist-insights, post-close-scan-insights) calls before trusting a script verdict on a high-stakes name. Also run standalone as a weekly audit of the taxonomy's accuracy (`status`, `promote-rule --auto`).
---

# Announcement Taxonomy (script + reasoning, with a learning loop)

A keyword list cannot tell a ₹2 Cr capex on a ₹5,000 Cr base from a capacity
doubling, and it can never match a trigger phrased in words nobody thought to
add. A model reading every filing from scratch every morning is expensive,
slow, and non-reproducible. This skill is the third option: **the script
proposes, the reasoning disposes, and every disagreement the reasoning wins
becomes a rule** — so tomorrow's script is a little less wrong than today's,
and the model spends its judgment on what's genuinely ambiguous instead of
re-deriving "an order win is material" for the ten-thousandth time.

## Why this exists (the failure it fixes)

On 2026-09-04 `gainers-signal` classified all of these ROUTINE and never read
them, purely because their titles carried no keyword:

| Filing                                      | What was actually inside                                    |
| ------------------------------------------- | ----------------------------------------------------------- |
| "Update On Clearance Of Outstanding Debt"   | 9 of 14 consortium banks fully repaid, debt-free that month |
| "Press Release / Media Release"             | EV subsidiary scaling to 100 showrooms by FY28              |
| "Announcement under Reg 30-Monthly Updates" | August volumes +40% YoY                                     |

All three are textbook EPS-accretion / J-curve triggers. The keyword fix
(2026-09-05) catches these three specifically; this skill exists because there
will always be a fourth one nobody thought of, and the system needs a way to
notice and absorb it rather than waiting for a human to spot the miss.

## The two axes — do not collapse them

`lib/announcementTaxonomy.js` now emits both:

- **`strength`** (STRONG / SUPPORTING / ROUTINE) — how much does this filing
  ASSERT? A board-meeting date notice asserts nothing: ROUTINE, correctly.
- **`significance`** (VERY_HIGH / HIGH / NORMAL) — does this plausibly change
  the market's model of FUTURE EPS? That same date notice, for a company that
  guided hard last quarter, is a dated catalyst the market front-runs:
  VERY_HIGH.

Darshan's bar, stated directly: **any filing that leads to EPS accretion, a
J-curve, or strong anticipation is very high significance.** The script's
VERY_HIGH set encodes that — capacity (store/showroom additions included:
retail floor space IS capacity), deleveraging, margin expansion, order book,
fundraise, the four corporate actions, the four primary documents
(result/PPT/concall/AR), and anticipation.

Significance from the script is a **prior, not a verdict**. Resolving it is
this skill's job.

## Reference — read before reasoning

[`../rerating-catalysts/references/growth_catalyst_framework.md`](../rerating-catalysts/references/growth_catalyst_framework.md)
is the interpretive lens, and it is not optional background: §2 ("new" is the
master keyword — 17 catalyst categories), §5a (the J-curve lifecycle:
Trigger → Capacity/Operating Leverage → Revenue Acceleration → Margin
Expansion → PAT/EPS Acceleration → Re-rating), §5b (fake J-curves), §3b
(structural vs. cyclical, incl. the one-off-vs-sustainable margin checklist),
and §5d (order book grows before revenue; capacity commissions before the
ramp) are the specific sections this skill's judgment runs on.

Grounding from SOIC's own corpus, for the categories added on 2026-09-05:

- The canonical trigger list is literally "margin expansion, capacity
  expansion, deleveraging, capex, geographical expansion, corporate action,
  backward integration" — _Masterclass on Investing Using AI · 29.06.25 Class 2
  Best Tools for Investing, 00:29:04_.
- "Whenever a business sees an acceleration in top line growth you must study
  that business… profitability growth is just a function of sales growth" —
  _Crash Course · 28.12.25 Part 2 Spotting Growth Businesses, 00:51:42_.
- "Capacity expansion coupled with favorable regulation can create a huge
  kicker for growth" — _Crash Course · Class 3 Finding Multibaggers, 00:51:06_.
- "Market is a discounting machine" — _SOIC Market Signals · 17.05.26 Earnings
  Decoded, 01:24:56_ — and SOIC's own workflow screens **upcoming results** for
  companies already growing >25% (_L4 · When to Buy a Stock, 00:45:58_). That
  pairing is the entire justification for the `anticipation` category: a result
  DATE is a catalyst when prior guidance was strong.
- Re-rating vs. de-rating is a PE-multiple event driven by the market's read on
  forward earnings, and market environment sets the hit rate — _Crash Course ·
  Class 8 SOIC Method Explained, 00:02:20_ and _25.01.26 Part B Valuation,
  00:18:06_. Practical consequence: a genuine catalyst in a de-rating market
  can still not re-rate the stock. Say that when it applies rather than
  promising a re-rating the tape won't deliver.

## Workflow

### 1. Script verdict first (cheap, deterministic)

```bash
S=skills/equity-research/announcement-taxonomy/scripts/taxonomy_review.js
node "$S" classify --url "<pdfUrl>" --subject "<title>" --description "<desc>"
```

Returns `{script: {category, strength, significance, reasoningCheck,
matchedKeywords, materialitySignal}, excerpt, textUsable, textSource}`. It
resolves text exactly as `gainersScanner`'s Step 2a does (Filing Extract first,
live PDF second) so you and the script are reading the same document.

**`textUsable: false` means the read failed, NOT that the filing is empty.**
Escalate (retry, or flag it) — never accept a ROUTINE verdict computed over no
text.

### 2. Your own verdict, independently

Read the `excerpt` (or the full PDF if the excerpt is truncated at a material
point) and answer, without looking at the script's answer first:

1. **Which §2 "new" category is this, if any?** Name it, or say none.
2. **Where on the §5a path does it sit** — Trigger / Capacity & Operating
   Leverage / Revenue Acceleration / Margin Expansion / PAT-EPS Acceleration?
   Earlier on the path = more of the re-rating still ahead.
3. **Is the magnitude material RELATIVE to this company?** This is the judgment
   the script structurally cannot make: ₹1,305 Cr of orders against a ₹6,676 Cr
   market cap is 19.5%; the same order at ITC is a rounding error. Always
   express size as a % of market cap / revenue / existing capacity / store
   count — never as a bare absolute number.
4. **Does it survive §5b and §3b?** A PAT/margin move traceable to a low base,
   inventory gain, exceptional income, tax reversal, forex, or a one-off order
   is not a catalyst. A margin move that is mix-shift/backward-integration/
   operating-leverage driven is.
5. **NEW or CONFIRMATION (§3)?** A filing executing on guidance given last
   quarter is lower information content than an unguided one. If in doubt, hand
   off to `announcement-info-classifier` — that skill answers exactly this and
   should not be reimplemented here.
6. **Final: `significance` = VERY_HIGH / HIGH / NORMAL, and `strength`.**

For `anticipation` specifically, the script hands you a named question it
cannot answer: **did this company give strong guidance in its last concall?**
Check it (`buildCompanyContext(companyId, {stockscans: true})` →
`concallNotes`, or the last transcript). Strong prior guidance + a result date
= VERY_HIGH. No guidance, or soft guidance = NORMAL. Never assume.

### 3. Compare, and record every disagreement

If your verdict matches the script's, you're done — return the verdict and move
on. Record nothing (a ledger of agreements teaches nothing and buries the
signal).

If they differ on **category, strength, or significance**, record it:

```bash
node "$S" record-mismatch '{
  "companyId": "NSE:XYZ",
  "url": "<pdfUrl>",
  "subject": "<title>",
  "scriptVerdict":    {"category":"general","strength":"ROUTINE","significance":"NORMAL"},
  "reasoningVerdict": {"category":"capacity","strength":"STRONG","significance":"VERY_HIGH"},
  "winner": "reasoning",
  "rationale": "one sentence: what the script missed and why it matters for forward EPS",
  "suggestedKeyword": "financial closure",
  "suggestedCategory": "capacity"
}'
```

Three disciplines that keep this ledger honest:

- **`winner` may be `script`.** If you re-read and the script was right, record
  that. A layer that only ever records itself as correct produces a rules file
  drifting toward whatever the model hallucinated, with no audit trail. The
  `wonByScript` count in `status` is a real and useful number.
- **Omit `suggestedKeyword` when no keyword could have fixed it.** Mismatches
  about MAGNITUDE ("script said VERY_HIGH on a trivial ₹2 Cr capex") are
  judgment calls; adding a keyword can't help and adding one anyway pollutes
  the rules. Record the mismatch with a rationale and no keyword.
- **Suggest the phrase the DOCUMENT used**, not a paraphrase — the learned rule
  is matched as a plain substring against real filing text.

### 4. Promote repeated misses into the script

```bash
node "$S" status                 # what's pending, and the accuracy trend
node "$S" promote-rule --auto    # promote everything at >=2 independent occurrences
```

A keyword is promoted only after it has caused the **same** miss on **two
different documents** (`DEFAULT_MIN_OCCURRENCES`) — one mismatch is an anecdote.
Promotion is additive-only: learned keywords extend a category's list and can
never remove or reorder a built-in rule, so a bad learned rule can widen a
category but can never silently disable one. Rejected automatically: keywords
under 6 characters (they over-match catastrophically as substrings) and unknown
categories. Removing a learned rule is a human edit of
`data/cache/announcement-taxonomy-rules.json`, and `provenance` records which
mismatches justified every entry.

Run Step 4 at the end of a batch (or weekly), not per announcement.

### 5. When to run the reasoning pass at all

Reasoning is the expensive half; spend it where a wrong classification actually
costs something:

- **Always** — anything the script tags `significance: VERY_HIGH` or that
  carries a `reasoningCheck`, and anything feeding an ACT-tier card, a thesis
  update, or an email a human will act on.
- **Always** — any filing whose script verdict is ROUTINE/general but which
  belongs to a name with a large delivery-backed move that day. That
  combination (nothing found, yet real money moved) is precisely the 2026-09-04
  failure signature, and it is the cheapest place to catch the next one.
- **Sample** — roughly 1 in 5 of the remaining ROUTINE/general filings per run.
  Sampling is what keeps the ledger populated with the misses nobody flagged;
  without it the loop only ever learns from cases someone already suspected.
- **Skip** — filings already covered by a served Filing Extract whose category
  matches the script's, and repeat filings of a document already classified.

## Interpreting the accuracy trend

`status` reports mismatch counts by script category over a window. The number
that matters is the **trend**, not the level:

- **Falling mismatch rate** — the loop is working; keywords are absorbing
  classes of miss.
- **Flat or rising, with most mismatches carrying no `suggestedKeyword`** — the
  remaining misses are magnitude/judgment calls that keywords structurally
  cannot fix. The fix is this SKILL.md's reasoning instructions (or the
  significance sets in the script), not more keywords. Say so in the run report
  rather than promoting weak keywords to make a number move.
- **Rising, concentrated in one category** — that category's built-in keyword
  list has a systematic gap worth a human look.

## Boundaries

| If you need...                                                   | Route to                         |
| ---------------------------------------------------------------- | -------------------------------- |
| The insight/write-up for one announcement                        | `announcement-insights`          |
| Whether a filing's claims are NEW vs already known               | `announcement-info-classifier`   |
| The full re-rating catalyst note for a company                   | `rerating-catalysts`             |
| Whether management delivered on past guidance                    | `management-credibility-tracker` |
| **What KIND of filing this is, and how much it matters for EPS** | **THIS SKILL**                   |

This skill does not write insights, emails, or PDFs. It returns a verdict
(`{category, strength, significance, stage, rationale}`) and maintains the
rules. Everything downstream is somebody else's job.

## Rules

- Never finalize a verdict from a title/description alone — that is the exact
  bug this layer exists to catch (see
  `../_shared/scan-signal-pipeline.md` "Strength is never judged from a title").
- Always express magnitude relative to the company's own base.
- A `textUsable: false` read is escalated, never silently classified.
- Record mismatches in both directions; never suppress one where the script won.
- Promote on evidence (≥2 occurrences), never on a single anecdote.
- Cite the framework section (§2/§5a/§5b/§3b) your reasoning rests on, so a
  later reader can check the call against the same lens.
