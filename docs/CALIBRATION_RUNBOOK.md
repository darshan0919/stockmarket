# Calibration runbook — enabling an extraction profile

How a `document-preprocessor` profile goes from off → trusted by the daily skills.
Companion to [`PREPROCESSING_PIPELINE_PLAN.md`](PREPROCESSING_PIPELINE_PLAN.md) §2 (L3).

Written 2026-09-04.

---

## Why the gate exists

A cheap agent reads a filing and writes `pat_cr: 412`. That number enters the
corpus, post-close quotes it, the signal scorer ranks on it, a thesis cites it.
**If it is wrong, we have replaced "we never read it" with "we read it wrong, and
we are confident" — strictly worse than the skip it was meant to fix.**

Precedent from this same build: a coverage metric read 13% when the truth was 92%.
Plausible, stable, wrong by 7×, and nothing about it looked broken. Extraction
accuracy fails the same quiet way. The gate is the only defence.

## The two switches

| Env var                      | Meaning                                 |
| ---------------------------- | --------------------------------------- |
| `PREPROCESS_SHADOW_PROFILES` | queued and extracted, **never served**  |
| `PREPROCESS_PROFILES`        | served to the daily skills (and queued) |

`docExtracts.get()` returns `null` for a shadow profile, so a consuming skill
**physically cannot** read an uncalibrated extract — the guard is in code, not in
a skill's instructions. Calibration tooling opts in with `{ includeShadow: true }`,
the only place that flag belongs.

This split exists because the gate was otherwise circular: a profile must be
extracting to be calibrated, but enabling it is what calibration authorises.

## Document supply decides the order, not difficulty

Check before choosing a profile — supply is seasonal and it dominates everything
else:

```bash
node -e "…paginateScanToCutoff over 7 days, count heavy categories…"
# or just run: yarn preprocess:queue next --window-hours 168 --limit 1
# and read stats.heavyDocs / stats.shadowQueued
```

Measured 2026-09-04 (AGM season, between results seasons), 7-day window:

| Profile         | Documents available |
| --------------- | ------------------- |
| `annual_report` | **244**             |
| `ppt`           | 15                  |
| `transcript`    | 6                   |
| `result`        | **2**               |

So `result` — structurally the easiest profile and the biggest long-run prize
(205 of 438 historically skipped documents) — **cannot be calibrated in September
at all.** It needs a results season: late Jan, Apr, Jul, Oct. Calibrate what is
actually filing now, and revisit the rest when the calendar supplies them.

## The five steps

**1. Shadow-enable** in `.env`:

```
PREPROCESS_SHADOW_PROFILES=annual_report,ppt
```

**2. Let the cheap agent extract.** Either wait for the scheduled
`document-preprocessing` job (every 30 min, 09:00-23:30 IST) or run a backfill:

```bash
yarn preprocess:backfill --days 7 --profile annual_report --limit 20
```

**`--profile` is what makes this affordable.** It scopes the scan server-side to
that one `announcementType`, so a 7-day annual-report backfill costs ~10 pages
instead of ~80 and returns more documents, not fewer (the unscoped walk hits the
page cap and truncates). It is also the difference between one 429 and a run of
them.

Target ≥20 stored extracts so the 15-document sample has slack for rejects. Note
that heavy documents are genuinely large — sampled annual reports ran 240,000 to
942,000 characters — so extraction is real work even on a cheap model. Prefer 20
documents over 40; the gate only needs 15.

If you see 429 or `circuitBreakerTripped`, wait and use a smaller `--limit`;
raising it does not go faster.

**2b. Confirm the extracts came from COMPLETE documents.**

```bash
node -e "require('./packages/jobs-runtime/lib/env').loadEnv();
const d=require('./packages/jobs-runtime/lib/docExtracts'), fs=require('fs');
const dir=d.dir('annual_report');
for (const f of fs.readdirSync(dir)) { const e=JSON.parse(fs.readFileSync(dir+'/'+f));
  const m=d.sourceTextMeta(e.sourceUrl); console.log(e.companyId, m.truncated?'TRUNCATED':'ok', m.text.length); }"
```

Any `TRUNCATED` means the extraction step used the 8,000-char excerpt instead of
`--full`. **Do not proceed** — re-extract first. `calibrate plan` skips these and
reports `truncatedSourcesSkipped`, but a short sample is a symptom, not a fix.

This step exists because the gate is otherwise blind to it: two readers handed the
same excerpt agree perfectly, the score comes back clean, and the profile gets
certified for reading under 1% of its documents.

**3. Plan the sample:**

```bash
yarn preprocess:calibrate plan --profile annual_report --n 15
```

Writes `data/cache/doc-extracts/_calibration/annual_report.json`. It only picks
documents whose text is already cached, so both readers see identical input and
the diff measures extraction rather than fetch quality.

**4. Flagship reference read.** A flagship session reads those 15 documents
properly and fills each row's `reference` with the same schema.

> **Do not look at the stored extract first.** Anchoring on it is how a
> calibration run confirms whatever it was going to confirm. And the reader must
> be a _different, stronger_ model than the one that produced the extracts — one
> model diffed against itself returns a confident PASS and measures nothing.

**5. Score:**

```bash
yarn preprocess:calibrate score --profile annual_report
```

Gate: **≥98% numeric agreement AND zero directional sign flips.** Sign flips have
no tolerance — a wrong number is a bad datum, a wrong sign is a wrong thesis.
The script prints `verdict` and `blockedBy`; honour them.

## On PASS

```bash
# 1. move the profile from shadow to served in .env
PREPROCESS_PROFILES=announcement,annual_report

# 2. MANDATORY — recover everything filed while it was gated
yarn preprocess:backfill --days <however long it was gated> --profile annual_report
yarn baselines:build
yarn data:push
```

Skipping the backfill leaves every document filed during the gated period
permanently behind the cursor. See `document-preprocessor` SKILL.md Step 5.

## On FAIL

Read `worstFields` — it names which fields disagree, ranked. Fix the **profile
schema wording** in `references/profiles.md`, not the extracts, then re-extract
and re-score. Common causes, in the order they actually occur:

- **Sign conventions.** A bracketed `(12.4)` is negative in Indian filings.
  `changes_in_inventories` flips sign between presentations and inverts the whole
  inventory-gain signal downstream.
- **Unit conversion.** Lakh vs crore; a USD figure that must stay `null` rather
  than get an invented exchange rate.
- **Scanned tables.** L1 catches a _fabricated_ quote but not a _misread digit
  inside a real one_. This is where `annual_report` is most likely to fail, and
  it is the reason L2's arithmetic reconciliation exists.
- **A field that needs judgment.** If agreement is poor because two careful
  readers legitimately differ, the field is not transcription — remove it from the
  profile and let the consuming skill decide.

## Re-run cadence

Quarterly, and after any change to a profile's schema or wording. A profile that
passed once is not permanently passed — the corpus it feeds is only as good as
its last measurement.
