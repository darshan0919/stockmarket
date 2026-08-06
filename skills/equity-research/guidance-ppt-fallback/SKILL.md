---
name: guidance-ppt-fallback
description: >
  Cheap, mechanical fallback pass for forward-guidance-extractor: for companies
  where NO Q_FY_ transcript exists, or a transcript exists but yielded zero
  explicit guidance items, checks that company's investor PPT for the same
  quarter for any explicit, quantified forward guidance slide (revenue/margin/
  capex/capacity/order-book targets with a real number attached). Deliberately
  scoped to shallow "does this slide contain a number tied to a future period,
  yes/no, extract it" judgment — no synthesis, no ranking, no cross-company
  reasoning — so this skill is DESIGNED to run on a lower-cost model
  (Haiku-class / Gemini Flash-class) rather than the flagship model. Use after
  forward-guidance-extractor leaves companies in its "missing" or "no guidance
  found" buckets, or whenever the user says "check the PPT for guidance too",
  "did the presentation have any targets", "PPT fallback", "see if the deck has
  guidance". Persists via the same forward-guidance report DTO
  (save_forward_guidance.js), source: "PPT", so pead-surprise-ranker (or any
  other consumer) reads both tiers through one schema without knowing which
  document a given item came from.
---

# Guidance PPT Fallback

A concall transcript is the primary source for forward-guidance-extractor. But
not every company holds a concall, and not every concall transcript contains a
numeric guidance statement even when one exists — some managements only put
targets in the investor presentation (PPT) slides ("FY27E" boxes, capacity/
capex tables, order-book bar charts). This skill is the second-tier check:
cheap, narrow, and does not require the judgment forward-guidance-extractor's
Phase 2 needs (distinguishing "explicit" from "directional" language across a
30-40 page verbatim transcript). Reading a PPT for a labelled number on a
slide is a much shallower task — that's the reason to route it to a cheaper
model rather than defaulting to the same model as the transcript pass.

Follow [`skills/_shared/conventions.md`](../../_shared/conventions.md) — §3
(all persistence via `db.js`, done here through the SAME
`save_forward_guidance.js` script forward-guidance-extractor uses — never
hand-write a second write path for the same DTO type), §8 (context-first),
§9 (files-touched manifest), §11 (token-optimization suggestion).

## When to run this

- Immediately after a `forward-guidance-extractor` run, for every company that
  landed in its `missing` bucket (no Transcript found) OR was saved with an
  empty `guidance: []` array (transcript existed, no explicit numbers in it).
- On demand for a specific ticker/quarter the user names.

Do NOT run this as a substitute for forward-guidance-extractor's Phase 1-4 —
always try the transcript first; a transcript, when it has numbers, is a
richer source (full Q&A context, base-value quotes) than a slide deck.

## Step 1 — Find candidates (script, no LLM)

```bash
node skills/equity-research/guidance-ppt-fallback/scripts/find_ppt_fallback_candidates.js \
  --quarter Q4FY26 [--tickers NSE:A,NSE:B,...]
```

Reads the `reports` collection via `db.js` for `type: "forward-guidance"`
records matching the quarter. Without `--tickers`, returns every company at
that quarter with `transcriptAvailable: false` or an empty `guidance` array.
With `--tickers`, filters to just that list (still re-checks their saved
state — don't assume the caller already knows which ones need it). Prints a
JSON array of `{ticker, quarter}` candidates.

## Step 2 — Fetch the PPT (script, no LLM)

For each candidate, download that quarter's PPT via the same
`documentsFetcher.js` module `stock-documents-fetcher` and
`forward-guidance-extractor` both use — do not re-implement fetching:

```js
const { fetchDocuments } = require('/absolute/path/to/stockmarket/stock-api/src/fetchers/documentsFetcher.js');
const res = await fetchDocuments('<TICKER>', {
  types: ['PPT'],
  startDate: '<yyyymm>',   // the candidate's quarter yyyymm
  endDate: '<yyyymm>',
  outputDir: '/tmp/<safe_ticker>_ppt',
});
```

If nothing comes back for the exact `yyyymm`, retry once with a ±2-month
window (`startDate` 2 months earlier, `endDate` 2 months later) to catch a
PPT filed slightly off the quarter-end label — some companies file a week or
two into the next month. Record the actual filed date if it differs.
`STOCKSCANS_AUTH_TOKEN` resolution and re-fetch failure modes are identical to
`stock-documents-fetcher`'s "Failure modes" section — read it if a fetch
fails, don't guess.

Convert to text with `pdftotext -layout <pdf> <out>.txt` (same tool
forward-guidance-extractor uses for transcripts). PPT text extraction from
`pdftotext` is often choppy (slide layouts, tables, callout boxes don't
linearize cleanly) — that's fine, the extraction step below only needs to spot
a number, not parse prose.

## Step 3 — Extract (the one LLM step — keep it narrow)

Read the extracted text. For each slide/section, ask only: **is there an
explicit number (₹/$/%/units) attached to a named future period (FY27, Q1FY27,
"next year", "by FY28", etc.)?** If yes, extract one item per number using the
IDENTICAL schema forward-guidance-extractor's Phase 2 uses (see its SKILL.md
for the full field list) with `"source": "PPT"` added:

```json
{
  "metric_category": "Top Line",
  "metric": "Revenue",
  "period_guided": "FY27",
  "absolute_value": 1500.0,
  "absolute_unit": "cr",
  "relative_pct": null,
  "base_value": null,
  "base_period": null,
  "base_value_source_quote": null,
  "quote": "FY27E revenue guidance: Rs 1,500 cr (slide 12, 'Outlook')",
  "confidence": "explicit",
  "source": "PPT"
}
```

Same zero-assumption rule as the transcript pass: a slide titled "Growth
Strategy" or "Our Vision" with no number attached is not guidance — skip it,
don't invent a row. `base_value`/`base_value_source_quote` may only be filled
if the SAME PPT states that base number on another slide (e.g. a historical
trend chart with a labelled FY26 bar) — quote which slide it came from.

This step deliberately does NOT require reading Q&A dynamics, tone, or
cross-referencing prior quarters the way transcript extraction does — a
consistent, mechanical "number-or-no-number" scan is well within a cheaper
model's reliability band. If the calling context lets you pick the model,
prefer a Haiku-class/Gemini-Flash-class model here; escalate to the flagship
model only if a company's PPT is unusually text-dense (a few EV/pharma/CDMO
decks run 40+ slides of narrative) and the shallow pass keeps missing/
misreading numbers on a spot-check.

Write items (possibly empty array) to `/tmp/<safe_ticker>_ppt_items.json`.

## Step 4 — Compute + persist (script, no LLM, reused verbatim)

Reuse `forward-guidance-extractor`'s own scripts — do not fork them:

```bash
python3 skills/equity-research/forward-guidance-extractor/scripts/compute_guidance_value.py \
  --batch /tmp/<safe_ticker>_ppt_items.json > /tmp/<safe_ticker>_ppt_enriched.json

node skills/equity-research/forward-guidance-extractor/scripts/save_forward_guidance.js \
  --ticker <TICKER> --quarter <QUARTER> --date <today YYYY-MM-DD> \
  --guidance-file /tmp/<safe_ticker>_ppt_enriched.json \
  --transcript-available false \
  --model <the model that ran Step 3, e.g. claude-haiku-4-5 or gemini-flash>
```

If Step 3 found nothing, still run this with an empty-array file — a saved
"transcript-unavailable, PPT-checked, nothing found" record is itself useful
(it tells `pead-surprise-ranker` and future re-runs not to re-check this
company's PPT for the same quarter). `--model` must reflect whichever model
actually ran Step 3, per `output-dto-standard/SKILL.md` — don't default to
the orchestrating model's name if a cheaper model did the extraction.

## Step 5 — Finish the run

1. `node packages/jobs-runtime/scripts/data.js push`.
2. **Files touched** section: every `reports/<id>.json` written (with count),
   read from the script output, never from memory.
3. **Token-optimization note** (mandatory, `conventions.md` §11): report how
   many of the N candidates had a PPT with usable guidance vs. no PPT at all
   vs. PPT-but-no-numbers — a batch with a low hit rate (most PPTs have no
   numbers) is itself the signal to suggest running Step 3 on an even cheaper
   model next time, or skipping PPT-fallback entirely for that sector if it's
   never yielded anything across repeated runs.

## Pitfalls

- **Don't let the cheap-model pass over-extract.** A model under-tuned for
  this task will happily turn "we aim to grow" into a fabricated row if not
  held to the explicit-number rule — spot-check a sample before trusting a
  large PPT-fallback batch at face value.
- **PPT dates don't always match transcript quarter labels exactly** — a
  results PPT is sometimes filed a few days to weeks after the transcript, so
  widen the fetch window (Step 2) before concluding "no PPT" for a quarter.
- **Never treat a multi-year backlog/order-book number as a single-period
  guidance figure.** "$1bn order book for FY27 and beyond" is NOT the same as
  "$1bn FY27 revenue" — extract it with the period exactly as stated
  ("FY27 and beyond"), and let `pead-surprise-ranker` decide how (or whether)
  to convert it into a period-specific estimate.

## File tree

```
guidance-ppt-fallback/
├── SKILL.md
└── scripts/
    └── find_ppt_fallback_candidates.js   (Step 1)
```
