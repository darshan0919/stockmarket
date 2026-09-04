---
name: monthly-updates-tracker
description: Tracks month-on-month sales/volume disclosures from Indian listed companies (autos, tractors, metals, retail, NBFCs) that file "monthly business update" announcements on the 1st-3rd of each month, and publishes them as an interactive QoQ/YoY table plus 12-month trend charts. Use whenever the user says "monthly updates", "monthly sales numbers", "auto sales for <month>", "who reported monthly numbers", "monthly volume tracker", "refresh the monthly updates page", or when the monthly-business-updates scheduled job fires on the 1st. Also use to answer "how are <company>'s monthly volumes trending" or "compare monthly sales of X and Y". NOT for quarterly results (that's quarterly-result-analysis) or for one-off announcement reads (announcement-insights).
---

# Monthly Updates Tracker

On the 1st of every month, a few dozen Indian listed companies file monthly
business updates: auto OEMs report units sold, miners report tonnes, some
retailers and NBFCs report revenue or disbursements. Individually each is a
one-line filing; together they are the earliest read on the quarter, weeks
before any result. This skill turns that scattered set of PDFs into one
sortable growth table and a set of trend charts.

## Architecture — read this before changing anything

Four passes, and the split between them is the point:

| Pass                               | Who does it                      | Where                                                                |
| ---------------------------------- | -------------------------------- | -------------------------------------------------------------------- |
| 1. Fetch + text-extract            | script                           | `packages/jobs-runtime/monthlyUpdates/fetchUpdates.js`, `pdfText.js` |
| 2. Slice numeric region            | script                           | `tableSlice.js`                                                      |
| 3. **Read the table**              | **the agent running this skill** | batch files under `data/runs/monthly-updates-batches/`               |
| 4. Series, growth, render, publish | script                           | `buildSeries.js`, `persist.js`, `renderApp.js`                       |

**Pass 3 never calls a model API.** There is no API key in this pipeline and
none should be added — `modelClient.js` is a deliberate tombstone recording
that decision. Reading a filing's table and deciding which row is the headline
metric is judgment, and judgment is done by the agent executing this skill.
Everything mechanical around it is a script (conventions §17).

Growth arithmetic is likewise script-side, never agent-side: the agent reports
levels only. A model that both reads and computes can emit a QoQ figure that
doesn't follow from its own extracted numbers.

## Commands

```bash
yarn monthly-updates fetch     # scan + download + extract text (cached)
yarn monthly-updates batches   # emit agent work-packets for unparsed filings
yarn monthly-updates ingest    # validate + store the agent's JSON rows
yarn monthly-updates build     # persist events + DTO, render the page
yarn monthly-updates deploy    # publish the page to Vercel
yarn monthly-updates run       # fetch + build (no parse step)
```

Flags: `--months N` (default 15), `--max-day N` (default 3), `--force`.

## Running it

1. **Fetch.** `yarn monthly-updates fetch`. Scans the saved announcement scan
   "Monthly Updates" (`0b85d5ecbd43531ee2f10213`) across the calendar quarters
   covering the window, keeps announcements filed on day 1-3 of a month, pulls
   each PDF, and extracts text. Text is cached per `ssUrl`, so a re-run is
   seconds rather than minutes. PDFs themselves are never stored (DATA_RULES §1.1).

2. **Batches.** `yarn monthly-updates batches`. Writes `batch_NN.txt` files,
   each holding ~12 filings pre-sliced to just their numeric region. Filings
   already parsed are skipped, so this is empty on a no-op run.

3. **Read them yourself.** For each `batch_NN.txt`: read it, follow the
   instructions at its top, and write `batch_NN.json` beside it — one JSON
   object per filing, as a single array. For a large backfill, fan this out
   across subagents (~8 batches each) rather than reading 30 batches serially.
   Rules that matter:
   - Echo `ssUrl` **exactly** — it is the join key; a wrong one is discarded.
   - Report levels **as printed**. No unit conversion, no rescaling, no
     computing growth percentages.
   - Prefer the most inclusive TOTAL row (Domestic + Export over Domestic) and
     say which in `scope`.
   - Sales over production when a filing reports both.
   - Indian digit grouping: `1,13,143` is 113143.
   - **A null is a valid answer.** Many of these filings are cover letters,
     investor-meet intimations, or percentages-only narrative updates with no
     level at all. Record `currentValue: null, confidence: "low"` — never
     invent a number to avoid a null. Roughly 1 in 5 filings is legitimately
     figure-free.

4. **Ingest.** `yarn monthly-updates ingest`. Validates against the batch
   manifest, coerces types, range-checks, and caches. Rejects are reported, not
   silently dropped. Re-run `batches` after: pending should be 0.

5. **Build.** `yarn monthly-updates build`. Groups filings into per-company
   series, computes growth, writes `events` records and the report DTO, and
   renders the page to `data/assets/monthly-updates/index.html`.

6. **Deploy.** `yarn monthly-updates deploy`. Needs the Vercel CLI authenticated
   once (`npm i -g vercel && vercel login`, or a `VERCEL_TOKEN` in the env).
   If it fails, the page is still on disk — say so rather than treating it as a
   total failure.

7. **Push.** `yarn data:push`, then report the files-touched manifest (§9).

## Growth semantics — get these right

- **MoM** — latest month vs the previous month. Monthly filers only.
- **QoQ** — last 3 reported months vs the 3 before them. A single month against
  one three months back would just be a lagged MoM and would read as seasonal
  noise.
- **YoY** — prefers the filing's **own stated prior-year figure**, since that is
  the company's restated comparable and accounts for reclassifications our
  stored history can't know about. Falls back to the same month in our history.
  `yoyBasis` records which was used.
- **Cadence matters.** Not every filer in this scan is monthly — banks, NBFCs
  and several retailers file _quarterly_ updates through the same announcement
  categories. `buildSeries.js` detects cadence from the median gap between
  periods; for a quarterly filer MoM is suppressed and QoQ becomes
  latest-quarter-vs-previous. Summing three quarterly points as if they were
  months would triple-count. These are chipped `Q` in the table.

## Units — never sum across them

Filings report in units, tonnes, MT, Rs cr, Rs lakh, MW and more. Each company
gets **one primary metric with its unit shown**; growth percentages are
comparable across companies, absolute levels are **not**. The page never
aggregates across units, and the multi-company chart offers an **Indexed
(first period = 100)** mode plus a scale-gap warning, because a 616,000-unit
filer will otherwise flatten a 4,000-unit filer into the axis.

## Data destinations (DATA_RULES)

- `events-YYYY-MM.json`, type **`monthly-business-update`** — one record per
  filing reading, via `db.appendEvents`. New `type` in an existing collection,
  which §2 prefers over a new collection. `date` is the reporting month, with
  the filing date kept separately as `filedOn`.
- `reports.json` + `reports/<id>.json`, type `monthly-updates-tracker` — the
  DTO the page renders from, via `db.saveReport`.
- `data/cache/monthly-updates-text/` — extracted filing text.
- `data/cache/monthly-updates-parsed/` — parsed readings, keyed on
  `(ssUrl, promptVersion)`.
- `data/runs/monthly-updates-batches/` — agent work-packets.
- `data/assets/monthly-updates/index.html` — the rendered page.
- Creator on every record: `monthly-updates`.

Caching rule worth preserving: only a **genuine** result is cached — a real
reading, or an explicitly-confirmed no-figure filing. A failed or absent parse
is never cached, or a transient failure freezes into permanent "no data".
Cache entries are invalidated by **overwriting** them; never delete
(Cowork mounts throw EPERM, and DATA_RULES §5 forbids deletes in a write path).

## Gotchas

- **Rate limits.** Stockscans 429s under load. Quarters are fetched serially,
  pages 3-wide, PDFs 4-wide, with a 6-attempt/1.5s-base backoff. A failed page
  **breaks the walk loudly** rather than being read as end-of-data — an earlier
  version silently returned 107 filings instead of 372 because a rejected page
  and an empty page took the same branch. Don't raise the fan-out.
- **`mapWithConcurrency` returns `{ok, value}` wrappers**, not raw values.
- **OCR is the exception, not the rule.** 371 of 372 filings had a real text
  layer. `pdftotext -layout` (column geometry matters) is the primary path;
  tesseract runs only when a filing yields under 40 digits.
- **`total` from `announcements/scan` is self-inflating** — never page on it.

## Output

Report: companies tracked, monthly vs quarterly filers, latest period, notable
movers (largest YoY/QoQ, and any sign flips), the page URL, files touched (§9),
and the token-optimization note (§11).
