---
name: monthly-business-updates
description: Monthly job — collect the 1st-of-month business/sales update filings, parse them, refresh the interactive tracker page, publish it, and send Darshan the link
---

You are running Darshan's **Monthly Business Updates** job (stockmarket
monorepo). It fires on the 2nd of each month, after the bulk of the previous
month's sales filings have landed on the 1st.

Read `skills/equity-research/monthly-updates-tracker/SKILL.md` from the local
mounted repo (fall back to the GitHub copy only if the local path is
unavailable) and follow it in order. The architecture section there is not
background reading — the fetch/parse split is what keeps this job correct.

**No LLM API keys.** Pass 3 (reading each filing's table) is done by YOU, in
this job, by reading the batch files. There is no model API in this pipeline
and none is to be added.

## Sequence

1. **Fetch.** `yarn monthly-updates fetch`. Default window (15 months) is right
   for a routine run — the text cache makes the historical part nearly free, and
   the extra months keep the YoY base populated. Note `reportingDayCohort`,
   `cacheHits` and `ocrUsed` from the output.

2. **Batches.** `yarn monthly-updates batches`. On a normal monthly run this
   should be 1-3 batches (just the new month's filings). If it reports 20+,
   something invalidated the parse cache — say so in the report rather than
   quietly grinding through it.

3. **Parse — you do this.** For each `batch_NN.txt` under
   `data/runs/monthly-updates-batches/`: read it, follow the instructions at the
   top of the file, and write `batch_NN.json` beside it. With more than ~8
   batches, fan out across subagents (~8 batches each) instead of reading them
   serially.

   Hold the line on these:
   - `ssUrl` echoed **exactly** — it is the join key.
   - Levels **as printed**; no unit conversion, no rescaling, no growth maths.
   - Most inclusive TOTAL row; record which in `scope`.
   - Sales over production.
   - **A null is a correct answer** for a cover letter, an investor-meet
     intimation, or a percentages-only narrative update. About 1 in 5 filings
     has no figure. Never invent a number to avoid a null.

4. **Ingest.** `yarn monthly-updates ingest`. Any rejects are reported, not
   ignored. Then re-run `batches` — `pendingParse` must be 0 before you build.

5. **Build.** `yarn monthly-updates build`.

6. **Deploy.** `yarn monthly-updates deploy`. If the Vercel CLI isn't
   authenticated, the deploy fails but the page is still on disk at
   `data/assets/monthly-updates/index.html` — report the local path and what
   Darshan needs to run once (`vercel login`), and continue. A failed deploy is
   not a failed run.

7. **Push.** `yarn data:push`.

8. **Notify.** Email Darshan a short digest:
   - the page URL (or the local path if deploy was skipped)
   - companies tracked, split monthly vs quarterly filers, latest period
   - **the 5 biggest YoY movers and the 5 biggest QoQ movers**, each with the
     company, the metric and unit, and the percentage — and render every company
     name via `stockscansLink()` (conventions §20), never as plain text
   - any sign flips (a company that was growing and is now shrinking, or the
     reverse) — this is the part Darshan actually acts on
   - a one-line data-quality note: how many filings carried no figure, and any
     low-confidence readings worth a manual look

## Judgment — the part that isn't scripted

The table is generated; the _read_ is yours. In the email, lead with what
changed, not with the fact that the job ran. A single company's YoY spike is
usually noise or a small base; two or three companies in the same sector moving
the same way in the same month is a signal. Say which of the two you're looking
at. Where a mover has a small base or a one-month history, flag it rather than
presenting it as a trend.

## Guardrails

- Don't raise the fetch concurrency. Stockscans 429s, and an earlier version of
  this pipeline silently returned 107 filings instead of 372 because a
  rate-limited page looked like an empty page.
- Don't compare absolute values across companies — units differ (units, tonnes,
  Rs cr, MW). Growth percentages compare; levels do not.
- Companies chipped `Q` file quarterly, not monthly. Don't describe their QoQ as
  a month-on-month move.

## Report

End with the files-touched manifest (DATA_RULES §7 / conventions §9) taken from
`db.touchedFiles()` and the `data:push` output, plus the standing
token-optimization note (conventions §11).
