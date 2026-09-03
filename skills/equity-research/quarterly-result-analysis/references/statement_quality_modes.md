# Statement-quality modes — reference

Loaded by `quarterly-result-analysis` when `--statement` is passed. The default (no
`--statement`) is the full 3-basket interpretive note and this file is not read at all.

## What these modes are for

The full note answers "what does this quarter mean for the thesis?" — it reads a transcript, a
PPT and a Result filing, classifies management tone, tracks narrative shift, and renders a
widget and a PDF. That is the right shape for one company you care about, and the wrong shape
for forty results filed on the same evening.

A statement-quality mode answers a narrower, more mechanical question: **is this statement
clean?** It reads one financial statement, runs its deterministic scan, and writes a short
graded verdict. No transcript. No tone. No narrative shift. No widget, no PDF, no monitoring
checklist. That makes it cheap enough to run across every result filed on a given day and use
as a _filter_: the names that come back `STRAINED` or `RED-FLAG`, or that come back `CLEAN`
with a genuinely improving trend, are the ones that earn a full note afterwards.

The economics only work if the mode stays disciplined about the split. Every number, delta,
ratio, day-count and threshold test is already done by the analyzer scripts before any model
reads anything. What the model contributes is the part a script cannot: deciding whether a
cleared signal is structural or a one-period swing, resolving two signals that point in
opposite directions, and writing the one sentence that would change a holding decision. If a
run finds itself re-deriving arithmetic, or reading a transcript, the mode has been abandoned
and the cost advantage with it.

## Modes

| Flag                        | Statement                                                  | Engine                                              | Shared framework                                                                      |
| --------------------------- | ---------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `--statement income`        | Consolidated income statement in the Result filing         | `stock-api/src/analyzers/incomeStatementSignals.js` | [`_shared/income-statement-signals.md`](../../../_shared/income-statement-signals.md) |
| `--statement balance-sheet` | Statement of assets and liabilities (Result filing or PPT) | `stock-api/src/analyzers/balanceSheetSignals.js`    | [`_shared/balance-sheet-signals.md`](../../../_shared/balance-sheet-signals.md)       |
| `--statement cashflow`      | Statement of cash flows (Result filing or PPT)             | `stock-api/src/analyzers/cashflowSignals.js`        | [`_shared/cashflow-signals.md`](../../../_shared/cashflow-signals.md)                 |

Multiple are allowed (`--statement balance-sheet,cashflow`). Requesting all three is legitimate
and still much cheaper than the full note, because it skips the transcript, the tone work and
both renders — but when all three are requested, the cross-statement dedup rule below is what
keeps it from reading like three separate reports about the same company.

## Consolidated, not standalone

Take the **consolidated** statement wherever both are filed. An investor owns the consolidated
entity, and subsidiaries are exactly where receivables, loans and related-party exposures tend
to sit. `extract_statements.js` already prefers consolidated; if only standalone is available,
say so in the output rather than letting the reader assume otherwise.

## Availability and staleness (balance-sheet and cashflow modes only)

The income statement is always there. The other two are not: SEBI LODR Reg 33(3) requires a
statement of assets and liabilities and a statement of cash flows **only half-yearly**, as
notes to the half-yearly results. `quarterly-result-extractor`'s Step 2.6 has already resolved
this into `statementAvailability.<statement>.status`, and this mode acts on that status without
re-litigating it:

- **`fresh`** → analyse.
- **`absent`** → output exactly one line: the statement was not filed this quarter, which under
  Reg 33(3) is compliance-normal for Q1/Q3, plus the date of the last one on record. Stop. Do
  not reconstruct it from the annual report, Screener, or a web summary.
- **`stale-repeat`** → output one line: the document repeats the statement already on record
  (give its as-at date), so there is nothing new to analyse. Stop.
- **`stale-asof`** → output one line: the statement is as at an earlier date than this
  quarter's end, and belongs to that earlier period. Stop.

Reporting a stale statement as if it were current is the specific failure this whole path is
built to prevent, so a run that produces a full balance-sheet verdict on a `stale-repeat`
statement is wrong even if every number in it is accurate.

## Exhaustiveness requirement

The balance-sheet and cash-flow modes are held to the same standard as the income-statement
one: **every line in the scan is computed and considered, every period.** The analyzers do this
by construction — they iterate their whole `CHECKS` array and return both what cleared the bar
and what did not, so nothing is skipped by inattention. The obligation this places on the
model's pass is to read the `skipped` array too, not only `material`: a line that sat just under
its bar, or that came back "not disclosed", is sometimes the most informative thing on the page
(receivable days you cannot compute because receivables were not broken out is a disclosure
finding, not a null).

What exhaustive does **not** mean is long. The scan considers everything; the write-up reports
what cleared a bar and would change a reader's view, ranked by effect. A twenty-line recitation
of immaterial moves is the failure mode on the other side, and it costs tokens for negative
information value.

## Cross-statement discipline (mandatory when more than one mode runs)

Rising receivable days on the balance sheet and weak CFO/PAT conversion in the cash-flow
statement are **one finding seen from two angles**, not two findings. The same is true of
inventory (P&L "changes in inventories" ↔ balance-sheet inventory days ↔ cash-flow
working-capital line) and of debt (balance-sheet gearing ↔ P&L finance cost ↔ financing cash
flows). Write each once, cite both statements it draws on, and move on —
`conventions.md` §17. When only one mode runs, still name the corroboration the other statement
would provide and say it was not checked, so the reader knows the difference between "checked
and clean" and "not checked".

## Verdict grade

Every statement gets exactly one grade. Grades are about the STATEMENT's quality, not about the
stock:

| Grade      | Meaning                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `CLEAN`    | Nothing material cleared a bar, or what did clear was constructive                                             |
| `WATCH`    | One or two material items worth tracking, none threatening                                                     |
| `STRAINED` | Material deterioration in conversion, working capital, gearing or asset quality                                |
| `RED-FLAG` | A combination flag at `high` severity, or an extraction-verified pattern that belongs in `forensic-accounting` |

`EXTRACTION_SUSPECT` (totals do not tie, or the cash bridge does not reconcile) is not a grade —
it is a blocker. Report the parse failure and grade nothing.

Escalation rule: on `RED-FLAG`, say plainly that the finding exceeds what a single-quarter
statement read can settle and name `forensic-accounting` as the next step. Do not attempt the
multi-year fraud scan inside this mode.

## Output contract (per company)

Compact and uniform, so a batch of forty is scannable and diffable:

```
<COMPANY> (<TICKER>) — <STATEMENT> quality — <QUARTER>
Grade: <CLEAN|WATCH|STRAINED|RED-FLAG>   Basis: <e.g. H1 FY27 vs H1 FY26>   Source: <Result|PPT>, <consolidated|standalone>
- <finding, one sentence, with the number and its comparison> [STRUCTURAL|CYCLICAL|TEMPORARY]
- <finding> [TAG]
...(3-8, ranked by effect on the reader's view; the flags from `combinations` lead)
Not checked: <the corroboration the other statements would give, when they weren't run>
```

Rules that make the batch usable:

- **Every finding carries its number and its comparison basis.** "Receivable days rose" is not
  a finding; "receivable days 55 → 71 (H1 FY27 vs H1 FY26), against 18% revenue growth" is.
- **Tag every finding** `STRUCTURAL` / `CYCLICAL` / `TEMPORARY`, the same taxonomy the full note
  uses — it is what tells the reader whether a development affects fair value or just the next
  two quarters.
- **Lead with `combinations`.** A combination flag is a pattern across lines and outranks any
  single-line reading.
- **If nothing clears a bar, say so in one line** and grade `CLEAN` — an explicit clean read is
  a result, and a batch where the clean names are silent is unusable as a filter.
- **No prose paragraphs, no widget, no PDF.** A reader who wants those asks for the full note.

## Persistence

Save one `statement-quality` report per company per statement via `db.saveReport()` — the
`reports` collection with a new `type`, not a new collection (`docs/DATA_RULES.md` §2). Envelope
per `skills/tooling/output-dto-standard/SKILL.md`: `companyId`, `creationTime`, `modifiedTime`,
`creator: "quarterly-result-analysis"`, `modelUsed` (the grading and the
Structural/Cyclical/Temporary tags are judgment, so this field is required), plus `statement`,
`grade`, `basis`, `sourceDocument`, `findings[]`, `flags[]`, `staleness`, and `scanRef` (the
cache key of the analyzer scan the findings came from, so the numbers behind a verdict can be
re-read without recomputing).

Because the scans are cached per `(companyId, period)`, re-running a mode over a batch that was
already scanned costs nothing in extraction and only re-spends the small grading pass. End the
run with `node packages/jobs-runtime/scripts/data.js push` as usual.

## Batch runs

Statement modes are the bulk-safe path, and a batch is a single run with one summary, not forty
runs stapled together:

1. Resolve the company list (explicit ids, a comma list, or a Stockscans saved-scan URL —
   scope it with the throwaway-watchlist pattern, `conventions.md` §14).
2. For each company, ensure a `quarterly-result-documents` record exists; invoke
   `quarterly-result-extractor` for the ones that do not. This is the expensive part of a batch,
   so run it once per company and let the cache carry repeat requests.
3. Grade each company from its scan output.
4. Emit **one ranked table** — company, grade, the single most important finding — ordered
   worst-first, followed by the per-company blocks above. Names that came back `absent` or
   `stale-*` get their own short list at the end so the reader can see coverage, not just
   results. A batch whose output does not distinguish "clean" from "not checked" is misleading
   in exactly the way that matters.
5. Close with the standing token-optimization note (`conventions.md` §11) — for a batch, that
   means saying how many companies were cache hits and how many needed a fresh extraction.
