---
name: document-preprocessor
description: Turn corporate filings into structured, page-anchored Filing Extracts ahead of demand, so the daily scan skills reason over JSON instead of re-reading PDFs. Drains a deterministic queue of documents filed since its own cursor, and for each one emits a rigid, verbatim-only JSON extract (announcement, result, transcript, ppt, annual_report) which a script then verifies by checking every quote against the document's own cached text. Deliberately needs NO deep reasoning — it is transcription, not judgment — so it can be scheduled onto a cheap agent. Use for "pre-process filings", "extract today's documents", "run the preprocessing queue", or when the document-preprocessing scheduled job fires.
---

# Document Preprocessor

**Extraction only. No judgment, no interpretation, no valuation, ever.**

This skill exists so `post-close-scan-insights`, `gainers-signal`,
`volume-rocketing` and `announcement-info-classifier` stop doing
document-reading at signal time. Reading a filing is company-scoped,
slow-changing, identical across all four skills, and not a judgment call — so it
belongs on a document-arrival trigger, done once, by the cheapest thing that can
do it correctly.

**What "cheap model" means here.** It describes the JOB, not a vendor. Every step
below is transcription against a rigid schema, so whichever agent is executing
this skill does it directly — Gemini via the Antigravity sidecars, a cheap-tier
Cowork task, whatever is cheapest at the time. **This skill never calls an LLM
provider's API with a stored key, and no script it invokes does either.** That is
a standing repo rule (see `guidance-document-extractor`'s Step 2, which says the
same thing for the same reason): a model invocation should be a visible scheduled
run, never a library call buried inside a skill's reasoning loop.

If you find yourself needing to _decide_ something — whether a number matters,
whether a filing is significant, what it implies — stop. That is the consuming
skill's job and doing it here corrupts the whole design (see "The line" below).

Script-first per `skills/_shared/conventions.md` §17: queue building, noise
filtering, profile assignment, verification and persistence are all scripts. The
only thing you do is read a document and fill in a schema.

## Setup

```bash
QUEUE="yarn preprocess:queue"
```

Do NOT export data-path env vars — every script resolves `<repo>/data/` and
`<repo>/.env` itself (conventions §2).

## Step 1 — Pull a batch

```bash
yarn preprocess:queue next --limit 60 --batch-size 20          # mixed/steady-state
yarn preprocess:backfill --days 7 --profile annual_report      # one heavy class
```

**Always pass `--profile` when you want one heavy document class.** It scopes the
scan server-side via the `announcementType` enum instead of walking the whole
universe and filtering client-side. Measured on a live 7-day window (2026-09-04):

|                  | pages fetched               | heavy documents found |
| ---------------- | --------------------------- | --------------------- |
| unscoped (`All`) | ~80 — **hits the page cap** | 47                    |
| scoped, 4 passes | 18                          | 188                   |

Four times fewer requests and four times the recall. The recall half matters more:
the unscoped walk stops at `MAX_PAGES` and truncates the window silently, so it
never reaches most of what was filed. Scoping shrinks the result set below the cap,
which is what makes the walk complete rather than merely cheaper. Stockscans also
rate-limits hard, and the unscoped walk is the main source of 429s.

**Check `stats.hitPageCap` on every run.** `true` means the window was truncated
and "nothing else was filed" is not a finding — narrow the window or scope by
`--profile`.

Returns `{cutoffUtc, scanSource, scanName, stats, batches[][], extractDir}`.

The queue resolves its window from **its own cursor** (`document-preprocessing`,
not post-close's), drops noise, assigns a profile, and subtracts anything already
extracted. Items are ordered heavy-documents first, then high-conviction
categories, then newest — so a `--limit`ed run spends its budget where a missed
extraction costs most.

**Report `stats` verbatim in your run report.** `scanSource` other than `live`
means the universe came from a stale cache or the frozen fallback — say so
prominently, exactly as `post-close-scan-insights` requires, because a silently
stale universe makes a run's absences meaningless.

`stats.profileDisabled` counts documents skipped because their profile has not
passed its calibration gate (Step 5). That number is expected to be large until
the heavy-document profiles are enabled — it is the size of the prize, not a
failure. Say what it is.

## Step 2 — For each document: read it, fill the schema

One document at a time. For each item in the batch:

```bash
# announcement profile — the 8000-char default is ample for a Reg-30 filing
yarn watchlist-insights read-pdf-with-meta "<sourceUrl>"

# result / transcript / ppt / annual_report — --full is MANDATORY
yarn watchlist-insights read-pdf-with-meta "<sourceUrl>" --full
```

**`--full` is not an optimisation, it is a correctness requirement for every
heavy profile.** The default caps text at 8,000 characters — fine for the short
announcements this reader was built for, catastrophic for anything longer. On
2026-09-04, 40 heavy-document extracts were produced without it: an annual report
of 951,309 characters returned its covering letter, and the resulting schemas came
back almost entirely null (contingent liabilities 0/24, remuneration 0/24) because
those sections were never in the text. Every one still reported `L1: pass` and
`confidence: high`, because the quotes were accurate — about the covering letter.

`verifyExtract` now hard-rejects any extract whose source was truncated
(`status: truncated_source`), so this cannot recur silently. If you see that
status, you forgot `--full`.

This is the shared, cache-backed reader every other skill uses — never fetch a
PDF another way. It returns `{text, numPages, isHeavyParse, ocrFailed}`, and it
populates the text cache that Step 3's verification reads. **A document read any
other way cannot be verified**, because L1 has nothing to check the quotes
against.

**`ocrFailed: true` is a hard stop.** Emit `{"error": "unreadable"}` for that
document and nothing else. Never a partial extract from a scanned filing — a run
once marked four unread SAST filings routine from their titles, one of which was
a ₹979cr pledge revoke. An extract that silently omits what it could not read is
that same failure wearing a schema.

Then produce the JSON for that document's profile
(`references/profiles.md` has the schema for each: `announcement`, `result`,
`transcript`, `ppt`, `annual_report`).

### The five rules — identical for every profile, non-negotiable

1. **Output is JSON matching the schema.** No prose, no markdown, no commentary.
2. **Extract only what is literally written.** No inference, no outside
   knowledge, no arithmetic the document doesn't state, no valuation.
3. **`null` for anything absent**, and name the field in `missing[]`. A guessed
   value is worse than a null, because a null is visible and a guess is not.
4. **Every fact carries a verbatim quote and a page number.** This is what makes
   the output admissible: a script checks each quote against the document's own
   text, so a fabricated quote is caught by a substring test rather than by
   anyone's judgment. Quote exactly — you may trim leading/trailing words, never
   paraphrase, never stitch two sentences together.
5. **Unreadable → `{"error": "unreadable"}`** and nothing else.

### The line: transcription vs judgment

The profiles are written so that no field requires a decision. Watch for the
moment a task quietly becomes judgment — it usually arrives as an adjective:

| This is transcription (do it)                   | This is judgment (do NOT do it)     |
| ----------------------------------------------- | ----------------------------------- |
| "Extract every guidance statement"              | "Extract the _material_ guidance"   |
| "Record the order value as stated"              | "Assess whether the order is large" |
| "Copy the segment revenue table"                | "Explain the margin decline"        |
| "Record `direction` where management states it" | "Infer the EPS impact"              |

Recall-first, always: extract everything the schema asks for and let the
consuming skill discard. A missed fact costs a signal; an extra one costs a line
of JSON.

## Step 3 — Verify and persist (script — do NOT hand-write these files)

```bash
node -e '...'   # see below, or use the helper the job wrapper calls
```

Write each extract to a temp file and persist it via
`packages/jobs-runtime/lib/docExtracts.js`, which **refuses an extract that has
not been through `verifyExtract()`** — deliberately, so an unverified artifact
cannot exist. `lib/verifyExtract.js` runs:

- **L1 quote anchoring** — every quote must appear in the document's cached text
  (whitespace- and punctuation-normalised). Any miss ⇒ the whole extract is
  rejected to `doc-extracts/_rejected/` and that document falls back to the
  flagship path. One fabricated quote discredits the extract, not just that
  field.
- **L2 bound checks** — percentages in range, dates parse and aren't
  future-dated, EBITDA ≤ revenue, segments ≤ total. L2 never rejects; it pins
  `confidence: 'low'`, which consuming skills must treat as a lead, not a fact.

`confidence: 'high'` requires L1 to have genuinely passed. **L1 `skipped` (source
text not cached) is not a pass** and yields `low`.

## Step 4 — Commit the cursor, then push

```bash
yarn preprocess:queue commit     # ONLY after Step 3 completed cleanly
yarn data:push
```

`commit` advances the cursor to the window this run actually covered. **Skip it
if anything errored or was left incomplete** — committing after a partial run
permanently drops whatever didn't get processed, since the next run's window no
longer reaches back that far (conventions §19).

`yarn data:push` is mandatory even on partial failure (conventions §6).

## Step 5 — The calibration gate (before enabling any new profile)

**Full procedure: [`docs/CALIBRATION_RUNBOOK.md`](../../../docs/CALIBRATION_RUNBOOK.md).**

Two switches, not one. `PREPROCESS_SHADOW_PROFILES` extracts a profile for
calibration; `PREPROCESS_PROFILES` serves it to the daily skills.
`docExtracts.get()` returns `null` for a shadow profile, so nothing downstream can
read an uncalibrated extract — a profile must extract to be calibrated, but it
must not be trusted while it is being calibrated, and one switch could not express
both.

Do not move a profile from shadow to served until it has passed:

```bash
yarn preprocess:calibrate plan  --profile result --n 15
# read those 15 documents PROPERLY — full attention, no schema shortcuts,
# and WITHOUT looking at the stored extract first — fill `reference` in the worksheet
yarn preprocess:calibrate score --profile result
```

The gate: **numeric agreement ≥98% and zero directional sign flips.** The script
prints a `verdict` and `blockedBy`; honour it. A wrong number is a bad datum, a
wrong sign is a wrong thesis, which is why the second condition has no tolerance
at all.

Re-run quarterly and after any change to a profile's schema or wording.

### Enabling a profile REQUIRES a backfill — this step is not optional

```bash
yarn preprocess:backfill --days 45 --profile result --limit 200
```

While a profile is gated, `next` counts its documents in `stats.profileDisabled`
and moves on — and the cursor then advances past them. So on the day a heavy
profile passes its gate, every Result / PPT / transcript / annual report filed
while it was gated (~50 a day, for however many weeks it was off) sits behind the
cursor and would never be extracted. The queue would look perfectly healthy while
having no history at all for exactly the document types this pipeline exists for.

`backfill` walks back over already-covered time and queues whatever is still
missing an extract. It deliberately does **not** write a pending-window marker, so
it can never move the incremental cursor — run it as many times as you like, in
parallel with the normal schedule, without disturbing anything. Follow it with
`yarn baselines:build` so the cards pick up the newly-extracted history.

Choose `--days` to cover the period the profile was gated, not an arbitrary week.

Expect scanned filings to be where a profile fails first — L1 catches a
_fabricated_ quote but not a _misread digit inside a real one_, which is exactly
what L2's arithmetic reconciliation and this gate exist to catch.

## Rules

- **Files-touched manifest** (conventions §9): list every extract written, every
  rejection, and the `data:push` `↑` lines.
- **Never store the raw PDF** (conventions §6) — extracts only; the text cache is
  managed by `read-pdf-with-meta`.
- **Never edit an existing extract.** A filed document does not change, so an
  extract is immutable. If a profile's schema changes, the version bump makes new
  extracts; it does not rewrite old ones.
- **Report the rejection rate every run.** L1 rejections should be under 1%. A
  rising rate is the earliest signal of prompt regression and is the single
  number most worth watching here.
- **Token-optimization suggestion** (conventions §11): end every run with a
  concrete, evidence-based note — which profiles hit cache, whether the batch
  size was right, whether the window returned too many or too few documents.
