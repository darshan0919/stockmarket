# Routing rules — taxonomy gaps and the three standing judgment rules

Reference for `post-close-scan-insights` Step 2/3. Load this before deciding an
item is routine. Every rule here exists because a real run got it wrong once,
and the incident is named so the rule can be re-argued on evidence rather than
taken on faith.

## Known taxonomy gaps

flag recurring instances to `insight-validation`/`skill-manager` as candidates
for `CATEGORY_RULES` fixes rather than silently working around them every run):

- A bare `"PPT <Month> <Year>"` title fails to match `investor_presentation`
  and is categorised `general` instead of heavy-doc-skipped.
- Generic `"Scheme of Arrangement"` language matches `demerger` even when the
  scheme is a capital-return/bonus-preference distribution, not a business
  split. Read the PDF before trusting the label for anything in the
  `demerger`/`merger`/`acquisition`/`management_change` bucket — the category
  decides how much attention an item gets, not what to conclude about it.
- A generic `"Press Release"` title can hide a genuinely high-conviction event
  (e.g. an NCLT demerger approval). If `general` comes back for an
  announcement whose PDF text carries
  `regulatory`/`arrangement`/`NCLT`/`tribunal` language, treat it as a likely
  miscategorisation and read it in full before writing a routine low-signal
  note.

## Three standing judgment rules that override "looks routine"

**`shareholding_change` (SAST) — cross-check the day's `dealsDigest` first.**
SAST Reg 29 disclosures are what `packages/jobs-runtime/dealsDigest.js`
independently prices and ranks by rupee value, and rupee value is the objective
materiality signal — not share count, not the category label. Per Darshan's
standing direction (2026-08-24), smart-money buying/selling and promoter pledge
creation/release are always worth surfacing. Before defaulting one to routine:

1. Check `data/runs/digest_<YYYYMMDD>.json` (same IST calendar date) for a
   `sast.rows` entry matching the company/acquirer/timestamp.
2. **Present with a real net value** → confirmed material; cite the priced
   figure from that digest rather than re-deriving your own share-count
   estimate (e.g. "per same-day dealsDigest this pledge-revoke is valued at
   ₹979cr, 6.4% of market cap" — the 21-Aug-2026 PARADEEP case that
   established this).
3. **Absent from the snapshot** (below dealsDigest's ₹5cr threshold, an
   intra-promoter transfer netting to zero, or dealsDigest hasn't run) → still
   don't default to routine. Read the PDF and judge strategic relevance: an
   inter-se transfer into a family trust with net holding unchanged can still
   matter for succession/governance context even though it nets to ~₹0 and
   will never surface in a value-ranked view. This is the case missed on
   2026-08-22 (IVG Trust / Vadilal Industries, 3 SAST filings, OCR-blocked).
4. **No snapshot for that date at all** → say so in the run report rather than
   treating "no snapshot" as "checked, not material."

**`ocrFailed: true` is a hard stop, not routine.** Some SAST and
board-resolution PDFs are scanned/image-only and come back with a near-empty
text layer; `read-pdf-with-meta` returns an `ocrFailed` flag alongside `text`.
Say so explicitly in the run report and flag for manual follow-up — never fold
it into a routine `mark-processed`. This rule exists because a run marked four
such SAST filings "routine" without ever reading them, one of which was the
₹979cr Paradeep pledge-revoke above.

**A small rupee figure does not make a `general` item low-signal.** A new
associate/JV incorporation, a new store opening, any filing where the business
is DOING something new, is a real expansion/operating-cadence signal (Darshan's
standing direction, 2026-08-24). Judge by "did the company's state change" —
new entity, location or relationship = yes; the same people continuing the same
roles = no — not by the absolute rupee amount.

**`highConviction: true` means "look harder," not "conclude significant."** A
`HIGH_CONVICTION_CATEGORIES` match can still be a minor incremental event once
read (a small follow-on stake top-up mechanically tagged `acquisition`). Write
the significance the content supports while still giving it the deep template's
full attention. The `add-note` significance floor (`medium` minimum for those
four categories) is a code-level guard and applies regardless.

## Step 4 — Write the thesis

`announcement-insights` gives the base read: what happened, a headline, a causal
`thesisChain`, an `epsImpact`, a significance. **Four rules layer on top, and
they are in `references/thesis-rules.md` — read that file before writing any
insight in this run.** In brief:

- **4a J-curve focus** — hunt filings where the earnings path _bends_ (capex
  commissioning, deleveraging crossing a threshold, mix shift, fixed-cost
  breakeven, a drag ending), not ones where it continues. Call
  `rerating-catalysts --mode brief` when you can't tell from the filing whether
  the sunk cost is already in the reported base. Record
  `jCurve: {isCandidate, shape, elbowEvidence, whatWouldConfirm}`.
- **4b PAT before EPS** — reason through PAT explicitly first. A QIP that
  retires debt is frequently EPS-**accretive** despite dilution, because
  interest saved is the highest-confidence number in the chain. Record
  `patBridge: {...}`.
- **4c Use `ask-soic`**, and declare where the knowledge base fell short —
  collected gaps go to `send-digest --knowledge-gaps`.
- **4d Merged cards get a merged headline** — when one company's filings club
  into one card, the headline must account for the combined thesis, not the lead
  filing's.
