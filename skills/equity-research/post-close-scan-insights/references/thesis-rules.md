# Thesis rules — what this skill adds to `announcement-insights`

Reference for `post-close-scan-insights` Step 4. Load this before writing any
insight. These four rules exist because the base `announcement-insights` read,
applied mechanically, systematically mis-prices exactly the announcements that
matter most.

`announcement-insights` gives you the base read: what happened, a headline, a
causal `thesisChain`, an `epsImpact`, a significance. Four rules layer on top.
They exist because the base read, applied mechanically, systematically
mis-prices exactly the announcements that matter most.

### 4a — Hunt the J-curve, not the linear extrapolation

The filings worth finding are the ones where the earnings path **bends**, not
the ones where it continues. A 15% order-book growth update is information; a
plant that has been absorbing depreciation and interest for six quarters
finally commissioning is an inflection, and the two deserve wildly different
attention even when the rupee numbers look similar.

Per `skills/equity-research/rerating-catalysts/SKILL.md` §5f (the J-Curve
Inflection framework and the SOIC growth-catalyst material behind it), tag a
filing as a J-curve candidate when it plausibly marks the **elbow** — the point
where costs already sunk start converting into operating leverage. The recurring
shapes:

- **Capex commissioning / capacity going live.** Depreciation and interest have
  been in the P&L for quarters with no revenue against them; revenue now
  arrives against a fixed cost base already paid for.
- **Deleveraging crossing a threshold.** Interest cost falls straight to PAT
  with no revenue growth required at all (see 4b).
- **Mix shift into a structurally higher-margin product, geography or channel**
  — especially a first regulatory approval (USFDA, PLI, CDSCO) that unlocks a
  margin pool rather than adding volume to the existing one.
- **Fixed-cost absorption crossing breakeven** in a subsidiary, new segment or
  new plant that has been loss-making.
- **A one-off drag ending** — litigation settled, a loss-making arm divested, a
  contract repriced.

**When a filing looks like an elbow but you can't tell from the filing alone
whether the sunk costs are actually already in the base, call
`rerating-catalysts` in `--mode brief` for that company** (it has a 2-level
cache, so a repeat call within the window is cheap). That mode exists precisely
for this: it reads the last 4 concalls, 4 quarterly results and 2 investor PPTs
and answers whether the cost base is already carrying the investment. Without
that check a "capacity commissioned" filing is indistinguishable from a
"capacity announced" one, and only the first is an elbow.

Record the outcome on the note as `jCurve: {isCandidate, shape, elbowEvidence,
whatWouldConfirm}`. `whatWouldConfirm` is the one that earns its keep across
runs — naming the specific line item that should move next quarter is what lets
Step 8's validation, and a later `investment-thesis-engine` review, check
whether the elbow was real or imagined.

Do NOT tag a J-curve on the announcement's own optimism. Management describing
a project as transformational is not evidence of an elbow; sunk cost visible in
the reported base is.

### 4b — PAT growth, not EPS growth alone

**This is the rule most likely to be got wrong, because the intuitive read is
backwards.** A QIP, preferential allotment or warrant issue increases the share
count, so the reflex is "dilutive, EPS-negative, mark it down." That reflex is
wrong whenever the proceeds retire debt, because interest saved lands in PAT
with no execution risk and no revenue growth required — and net of dilution the
EPS effect is frequently **positive**.

So reason through PAT explicitly before touching EPS:

1. **What does PAT do?** Interest saved from debt repaid, plus any operating
   contribution from what the money buys, minus incremental depreciation.
   Interest saved is the highest-confidence number in this whole chain: it is
   arithmetic on a disclosed principal at a disclosed or estimable rate.
2. **What does the share count do?** Issue size ÷ issue price, plus any warrant
   or convertible tranches, and note the timing — a warrant converting in
   tranches over 18 months dilutes gradually, not on announcement.
3. **Only then, EPS = PAT ÷ diluted shares**, and state the direction with the
   sign you actually computed.

A worked shape, because the arithmetic is the argument: a ₹800cr QIP where
₹600cr retires debt at 11% saves ₹66cr of interest, ~₹49cr after tax. If the
company earned ₹300cr PAT on 20cr shares (EPS ₹15) and issues 2.6cr new shares
at ₹310, PAT goes to ₹349cr on 22.6cr shares — EPS ₹15.44. **Accretive, despite
13% dilution.** Called "dilutive" on share count alone, that filing gets marked
down when it should be marked up.

The same discipline applies in reverse, and it is the more common error in the
other direction: an order win or capex announcement that grows revenue while
adding interest and depreciation can be **PAT-negative for several quarters**
before the J-curve elbow arrives. Say which quarters, and don't let a large
revenue number stand in for an earnings number.

Where interest cost, debt quantum or the tax rate isn't in the filing, get them
from `buildCompanyContext(companyId)` and the latest result note rather than
guessing; if they genuinely aren't available, set
`epsImpact.confidence: "low"` and say which input is missing. A stated missing
input is useful; a confident number built on an invented interest rate is
worse than no number.

Record the intermediate reasoning on the note as `patBridge: {interestSaved,
taxRate, incrementalDepreciation, operatingContribution, newShares,
dilutionPct, patDelta, epsDelta, direction}`. It's what makes the conclusion
auditable and what Step 8 checks against.

### 4c — Use the knowledge base, and declare where it fell short

Before settling a judgment that turns on framework rather than arithmetic —
what this deal structure usually means, how this regulatory mechanism works,
whether this pattern historically preceded a re-rating — query
`ask-soic` (`skills/tooling/ask-soic/SKILL.md`, TF-IDF search over 1,100+
Learnyst and YouTube transcripts, returning cited synthesis). Cite what it
returns in the note. This is the cheapest available check against confidently
reasoning from first principles about something the knowledge base already
answers better.

**When `ask-soic` has no useful coverage, that absence is itself a deliverable.**
Collect each such gap and pass them to `send-digest --knowledge-gaps <file>` as
a JSON array of `{topic, whyItMattered, resolvedVia}`:

- `topic` — the specific thing not covered, named precisely enough to act on
  ("CCPS-to-equity conversion mechanics under SEBI ICDR", not "fundraising").
- `whyItMattered` — which judgment in tonight's run needed it.
- `resolvedVia` — what you used instead: a named primary source, first
  principles, or `null`/omitted if it stayed unresolved (the footer renders
  that as an explicit "unresolved" flag).

The value here is cumulative, not per-run: one night's gap is a curiosity, the
same gap three weeks running is a concrete instruction to add that material to
the knowledge base. Surfacing it in the same place every time is what makes the
repetition visible at all. Don't pad this list — a run that hit no gaps should
pass no file, and an empty footer strip is the honest answer.

### 4d — Merged cards need a merged headline

When one company files several announcements inside one window, the renderer
clubs them into ONE thesis card (`groupInsightsByCompany`) and, by default, the
card shows the highest-scoring filing's headline while the body combines every
filing's thesis chain. That default is wrong whenever the filings are related,
because the headline then describes one filing while the card argues something
larger.

**So when a card merges multiple filings, write a headline for the COMBINED
thesis, not the lead filing's.** The test: does the headline account for why
these filings together mean more than the strongest one alone?

- A board-outcome filing + a ₹600cr QIP approval + a debt-reduction intimation
  is not "Board meeting outcome" — it is "₹600cr raise to retire ₹450cr debt;
  interest saving ~₹40cr lifts PAT ~12% despite 9% dilution."
- Two SAST filings and a pledge release from the same promoter group is not
  "Pledge released on 2.1% of equity" — it is "promoter pledge fully unwound
  across three filings; 6.4% of equity de-encumbered."
- Where the filings are genuinely unrelated (an order win and an unconnected
  auditor resignation), do NOT force a synthesis. Lead with the higher-signal
  one and let the body carry the other; a strained connection between unrelated
  facts is worse than an honest lead.

Pass the synthesised line as the `headline` on the highest-scoring item's
`add-note` payload (that is the one the merged card renders), and make sure the
combined `thesisChain` reads in causal order rather than as concatenated
fragments per filing.
