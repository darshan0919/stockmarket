---
name: guidance-relevance-filter
description: >
  Stage 2 of the guidance/PEAD pipeline: a cheap-model (Haiku/Gemini
  Flash-class) pass over the raw Transcript/PPT/Result text
  guidance-document-fetcher downloaded, pulling out every passage that
  PLAUSIBLY contains forward-looking guidance -- a number near a future-period
  word -- WITHOUT judging whether it's actually explicit vs. directional
  language. Deliberately recall-first and over-inclusive: this is the
  pre-filter that shrinks a 20-40 page document down to a handful of
  candidate excerpts before the expensive model reads it, not the step that
  makes the final call. Use immediately after guidance-document-fetcher,
  before forward-guidance-extractor. NEVER use this skill's output as final
  guidance -- it is an unjudged candidate list, always pass it to
  forward-guidance-extractor for the actual explicit/directional
  determination.
---

# Guidance Relevance Filter

Stage 2 of `guidance-document-fetcher` → `guidance-relevance-filter` →
`forward-guidance-extractor` → `pead-surprise-ranker`. This skill exists
because of a specific, measured failure: an earlier pilot asked a cheap
model to do FULL guidance extraction directly (find numbers, judge
explicit-vs-directional, attach base values) and it missed 55-100% of real
guidance items across a 4-company test, including one company where it
missed every single item and reported "none found" on a transcript that had
7 confirmed, explicit guidance statements (see forward-guidance-extractor's
SKILL.md "Model-tier note" for the full pilot table). That failure mode —
silent, total recall loss — is unacceptable for a skill whose whole point is
not missing what management said.

This skill fixes that by changing what the cheap model is actually asked to
do. **Judging "is this explicit guidance or just confident-sounding talk" is
hard and is exactly where the cheap model failed. Judging "does this
paragraph contain a number and a reference to a future period" is easy** —
it's closer to keyword/pattern matching than to financial-analyst judgment,
and it's the kind of task a smaller model's reliability band actually
covers. So this stage does ONLY the easy part, recall-first: when in doubt,
INCLUDE the passage. A few false positives here cost the downstream flagship
model a few extra tokens to dismiss. A false negative here is invisible and
uncorrectable — the flagship model never sees what got dropped. That
asymmetry is the entire design rationale; don't let the instructions below
drift toward precision at recall's expense.

Follow [`skills/_shared/conventions.md`](../../_shared/conventions.md) — §11
(this skill only exists as a token-optimization measure for the pipeline as
a whole, so its own note at the end should report the compression ratio it
achieved, not a generic tip).

## Input

The `textPaths` from `guidance-document-fetcher`'s output for one company —
typically 1-3 files (`Transcript`, `PPT`, `Result`, whichever were found).
Process one company at a time; don't batch multiple companies' documents
into a single pass (same cross-company contamination risk every other skill
in this pipeline avoids for the same reason).

## Step 1 — Scan each available document (cheap model)

For EACH document type found for the company, read the raw text and extract
every passage where a number (₹/$/%/units/multiplier) appears within roughly
the same sentence or table row as a forward-looking reference: a named
future period (FY27, Q1FY27, "next year", "by FY28", "over the next 2-3
years"), a guidance-signal verb ("expect", "guide", "target", "aim",
"plan to reach"), or a PPT slide labelled "Outlook"/"Guidance"/"FY27E"/
similar.

**Explicit permissiveness rules (read these twice — they're the point of
this skill):**
- Do NOT decide whether the number is "real" guidance vs. a historical
  actual, an analyst's number, or vague talk. If it has a number and a
  forward-period cue anywhere nearby, extract it. The next stage sorts this
  out with full context.
- Do NOT try to compute or normalise anything (no midpoints, no base-value
  matching, no absolute/relative conversion). Copy the passage close to
  verbatim.
- Include a little surrounding context (1-2 sentences before/after, or the
  adjacent table row/slide title for a PPT) so the next stage isn't working
  from a bare fragment — but don't include entire multi-paragraph blocks
  "just in case"; the goal is compression, not a second copy of the document.
- If a whole section is dense with numbers (a segment-by-segment guidance
  table, a slide with 6 bullet targets), keep it as ONE excerpt rather than
  splitting into 6 near-duplicate ones — the flagship model can split it
  later if needed.
- Historical/trailing-quarter numbers ARE worth including if they sit right
  next to a forward number (they're often the base value the next stage
  needs) — don't strip them out trying to be "guidance-only"; that
  precision-minded pruning is exactly the mistake to avoid here.

Output one JSON array per company:

```json
{
  "ticker": "NSE:X",
  "quarter": "Q4FY26",
  "excerpts": [
    {
      "source": "Transcript",
      "text": "We expect to grow the revenues to INR3000-3,100 crores, which translates to 65% to 70% growth for the full year FY27 over FY26.",
      "context": "Analyst question about FY27 outlook, CFO response, page/segment ~mid-call"
    },
    {
      "source": "PPT",
      "text": "FY27E Guidance: Revenue growth 25% +/- 2%, EBITDA margin 8-9%",
      "context": "Slide 14, 'Outlook' section"
    }
  ]
}
```

Write to `/tmp/<safe_ticker>_relevant_excerpts.json`.

## Step 2 — Sanity check (script, no LLM)

```bash
python3 skills/equity-research/guidance-relevance-filter/scripts/check_excerpt_coverage.py \
  --excerpts /tmp/<safe_ticker>_relevant_excerpts.json \
  --source-texts <Transcript.txt path>,<PPT.txt path>,...
```

Deterministic, cheap check (not a re-extraction): counts how many
forward-period keyword hits (`FY2[6-9]`, `next year`, `guidance`, `target`,
`expect`, `%` near a digit, etc.) exist in the raw source text versus how
many ended up referenced in the excerpts. If the raw-text keyword count is
notably higher than what got captured, that's a signal this pass under-shot
recall for this company specifically — flag it for a second look (either a
re-run of Step 1, or escalate that one company's extraction to
forward-guidance-extractor's model directly on the raw text as a fallback)
rather than silently trusting a possibly-thin excerpt file.

## Step 3 — Hand off

Pass the excerpts file (not the raw document text) to
`forward-guidance-extractor` — this is the compression payoff: the flagship
model in Stage 3 reads a few KB of pre-filtered candidate passages per
company instead of a full 20-40 page transcript plus a PPT plus a Result
filing.

## Validated 2026-08-06 -- real improvement, not yet perfect

Piloted end-to-end on NSE:IFBIND (the company that produced a 0/7 total miss
under the old "cheap model does full extraction directly" design):
- The recall-first filter pass captured **71 of 71** forward-guidance signal
  keyword windows in the raw transcript (100% per `check_excerpt_coverage.py`),
  compressing an 82KB transcript to a 12.6KB excerpt file (~85% size
  reduction) -- confirming the compression goal works as intended.
- Feeding those excerpts into a flagship-model extraction pass recovered
  **5 of the 7** items the original full-transcript Sonnet run found (up
  from 0/7 with the old design) -- a large improvement, but not yet 1:1.
- The 2 misses were NOT the "silently invent nothing, silently drop
  everything" failure mode from before -- they were narrower and diagnosable:
  (a) one excerpt captured only an analyst's PARAPHRASE of a management
  claim rather than management's own quote, so the flagship model correctly
  refused to treat it as explicit (the zero-assumption rule working exactly
  as designed) -- the underlying passage needs a slightly wider context
  window in Step 1 to catch the actual management quote nearby; (b) one
  genuine guidance passage (a home-appliances growth figure) was omitted
  from the 28 excerpts entirely -- a real recall gap in Step 1's scan.

**Until this closes further, do not treat this skill's excerpt file as a
complete substitute for reading the raw transcript when correctness matters
more than cost** (e.g. a single high-stakes name, not a 50-company batch) --
for large-batch runs where the cost/coverage tradeoff clearly favors this
pipeline, 71% recovery of a design that was previously producing SILENT
total misses is a large net improvement, but say so explicitly in the run's
token-optimization note rather than implying the excerpt file is guaranteed
complete.

**Concrete refinement to try next:** widen Step 1's context window to always
include the full surrounding Q&A turn (question + full answer, not just 1-2
sentences) when a signal is found inside an analyst's paraphrase or a
partial answer -- the home-appliances miss and the paraphrase-only capture
both look like a context-window sizing issue rather than the recall-first
instruction itself failing.

## Token-optimization note (report every run)

State the compression ratio achieved: total raw source text size (all
document types, all companies) versus total excerpt file size, and flag any
company where Step 2's coverage check came back low (a candidate for
tightening the recall-first instructions further, not for trusting the
cheap model's output as final).

## File tree

```
guidance-relevance-filter/
├── SKILL.md
└── scripts/
    └── check_excerpt_coverage.py   (Step 2)
```
