# Dead Code & Coding Practice Action Items

> **Last Updated:** 2026-10-22T20:45:28.342Z
> **Status:** Automated Scan Completed
> **Active Action Items:** 132

---

## 📊 Summary Breakdown

| Category                        | Flagged Items |  Priority   |
| :------------------------------ | :-----------: | :---------: |
| **Committed Stray Artifact**    |       3       | High/Medium |
| **Coding Standard Violation**   |       1       | High/Medium |
| **Unused File**                 |      21       | High/Medium |
| **Unreferenced Non-Code File**  |      103      | High/Medium |
| **Data Directory Hanging Node** |       4       | High/Medium |

## 🗂️ Whole-Directory Findings (sorted by file count — check these first)

| Directory                | Files | Category                   | Action                                                                      |
| :----------------------- | :---: | :------------------------- | :-------------------------------------------------------------------------- |
| `cache/`                 |  88   | Unreferenced Non-Code File | `[VERIFY] cache/ — confirm unused, then delete or relocate`                 |
| `.pcsi_adhoc/`           |  40   | Unreferenced Non-Code File | `[VERIFY] .pcsi_adhoc/ — confirm unused, then delete or relocate`           |
| `.pcsi_postclose/notes/` |   6   | Unreferenced Non-Code File | `[VERIFY] .pcsi_postclose/notes/ — confirm unused, then delete or relocate` |
| `.pcsi_run/`             |   5   | Unreferenced Non-Code File | `[VERIFY] .pcsi_run/ — confirm unused, then delete or relocate`             |
| `_to_delete/`            |   4   | Unused File                | `[DELETE] _to_delete/`                                                      |

---

## 📋 Action Items List

The following items were identified by analyzing scheduled jobs, skills, workspace APIs, and frontend applications. Corresponding entries have also been synchronized to [`data/tasks.json`](file:///Users/darshanpatel/code/stockmarket/data/tasks.json).

### 1. [High] Remove committed artifact/binary .pcsi_adhoc/fetch-scan.out

- **Category:** Committed Stray Artifact
- **Target File:** [`.pcsi_adhoc/fetch-scan.out`](file:///Users/darshanpatel/code/stockmarket/.pcsi_adhoc/fetch-scan.out)
- **Details:** File '.pcsi_adhoc/fetch-scan.out' is a generated artifact, media file, or build binary (.out) committed to git. Per docs/DATA_RULES.md, generated artifacts belong in data/assets/ or data/runs/ and must not be tracked in git.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached .pcsi_adhoc/fetch-scan.out`

### 2. [High] Remove committed artifact/binary .pcsi_adhoc/resolve-scan.out

- **Category:** Committed Stray Artifact
- **Target File:** [`.pcsi_adhoc/resolve-scan.out`](file:///Users/darshanpatel/code/stockmarket/.pcsi_adhoc/resolve-scan.out)
- **Details:** File '.pcsi_adhoc/resolve-scan.out' is a generated artifact, media file, or build binary (.out) committed to git. Per docs/DATA_RULES.md, generated artifacts belong in data/assets/ or data/runs/ and must not be tracked in git.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached .pcsi_adhoc/resolve-scan.out`

### 3. [High] Remove committed artifact/binary .pcsi_adhoc/send-digest.out

- **Category:** Committed Stray Artifact
- **Target File:** [`.pcsi_adhoc/send-digest.out`](file:///Users/darshanpatel/code/stockmarket/.pcsi_adhoc/send-digest.out)
- **Details:** File '.pcsi_adhoc/send-digest.out' is a generated artifact, media file, or build binary (.out) committed to git. Per docs/DATA_RULES.md, generated artifacts belong in data/assets/ or data/runs/ and must not be tracked in git.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached .pcsi_adhoc/send-digest.out`

### 4. [High] Refactor hardcoded user absolute path in scripts/**tests**/antigravitySync.test.js

- **Category:** Coding Standard Violation
- **Target File:** [`scripts/__tests__/antigravitySync.test.js`](file:///Users/darshanpatel/code/stockmarket/scripts/__tests__/antigravitySync.test.js)
- **Details:** Hardcoded path(s) found: /Users/darshanpatel/code/other. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in scripts/__tests__/antigravitySync.test.js`

### 5. [High] Investigate unreferenced folder \_to_delete/ (4 files, all unreferenced)

- **Category:** Unused File
- **Target File:** [`_to_delete`](file:///Users/darshanpatel/code/stockmarket/_to_delete)
- **Details:** Every file that exists under \_to_delete/ (recursively, 4 total) is unreachable from any entry root. Representative reason: all 4 files under this folder are unreferenced. Full file list: \_to_delete/**testlist.js, \_to_delete/**testlist2.js, \_to_delete/\_diag2.js, \_to_delete/\_diag_drive_list.js
- **Recommended Action:** `[DELETE] _to_delete/`

### 6. [High] Investigate unreferenced source file build_infoclass.py

- **Category:** Unused File
- **Target File:** [`.pcsi_postclose/build_infoclass.py`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/build_infoclass.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] .pcsi_postclose/build_infoclass.py`

### 7. [High] Investigate unreferenced source file build_notes_batch1.py

- **Category:** Unused File
- **Target File:** [`.pcsi_postclose/build_notes_batch1.py`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/build_notes_batch1.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] .pcsi_postclose/build_notes_batch1.py`

### 8. [High] Investigate unreferenced source file build_notes_batch2.py

- **Category:** Unused File
- **Target File:** [`.pcsi_postclose/build_notes_batch2.py`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/build_notes_batch2.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] .pcsi_postclose/build_notes_batch2.py`

### 9. [High] Investigate unreferenced source file build_notes_batch3.py

- **Category:** Unused File
- **Target File:** [`.pcsi_postclose/build_notes_batch3.py`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/build_notes_batch3.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] .pcsi_postclose/build_notes_batch3.py`

### 10. [High] Investigate unreferenced source file build_notes_batch4.py

- **Category:** Unused File
- **Target File:** [`.pcsi_postclose/build_notes_batch4.py`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/build_notes_batch4.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] .pcsi_postclose/build_notes_batch4.py`

### 11. [High] Investigate unreferenced source file bt.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/bt.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/bt.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/bt.py`

### 12. [High] Investigate unreferenced source file cand.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/cand.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/cand.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/cand.py`

### 13. [High] Investigate unreferenced source file case.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/case.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/case.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/case.py`

### 14. [High] Investigate unreferenced source file dl.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/dl.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/dl.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/dl.py`

### 15. [High] Investigate unreferenced source file dl_deliv.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/dl_deliv.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/dl_deliv.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/dl_deliv.py`

### 16. [High] Investigate unreferenced source file dl_ohlc.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/dl_ohlc.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/dl_ohlc.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/dl_ohlc.py`

### 17. [High] Investigate unreferenced source file feat.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/feat.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/feat.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/feat.py`

### 18. [High] Investigate unreferenced source file feat2.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/feat2.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/feat2.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/feat2.py`

### 19. [High] Investigate unreferenced source file uni.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/uni.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/uni.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/uni.py`

### 20. [High] Investigate unreferenced source file uni2.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/uni2.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/uni2.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/uni2.py`

### 21. [High] Investigate unreferenced source file uni3.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/uni3.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/uni3.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/uni3.py`

### 22. [High] Investigate unreferenced source file documentExtractors.py

- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/lib/documentExtractors.py`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/lib/documentExtractors.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/lib/documentExtractors.py`

### 23. [High] Investigate unreferenced source file volumeRocketingClassifier.js

- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/lib/volumeRocketingClassifier.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/lib/volumeRocketingClassifier.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/lib/volumeRocketingClassifier.js`

### 24. [High] Investigate unreferenced source file generateSigmaAdvGuidancePdf.js

- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/scripts/orderbook/generateSigmaAdvGuidancePdf.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/scripts/orderbook/generateSigmaAdvGuidancePdf.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/scripts/orderbook/generateSigmaAdvGuidancePdf.js`

### 25. [High] Investigate unreferenced source file capture.js

- **Category:** Unused File
- **Target File:** [`tools/x-timeline-capture/capture.js`](file:///Users/darshanpatel/code/stockmarket/tools/x-timeline-capture/capture.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tools/x-timeline-capture/capture.js`

### 26. [Low] Investigate unreferenced folder cache/ (88 files, all unreferenced)

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache`](file:///Users/darshanpatel/code/stockmarket/cache)
- **Details:** Every file that exists under cache/ (recursively, 88 total) is not referenced by any reachable code. Full file list: cache/digest_preview.html, cache/runs/adhoc-20261011/batch-read.stderr.log, cache/runs/adhoc-20261011/batch-read.stdout.log, cache/runs/adhoc-20261011/categorise-output.json, cache/runs/adhoc-20261011/categorise.stderr.log, cache/runs/adhoc-20261011/commit-window.stderr.log, cache/runs/adhoc-20261011/commit-window.stdout.log, cache/runs/adhoc-20261011/deep-dive.txt, cache/runs/adhoc-20261011/enrich-orders.stderr.log, cache/runs/adhoc-20261011/enrich-orders2.stderr.log, cache/runs/adhoc-20261011/enrich-orders3.stderr.log, cache/runs/adhoc-20261011/enrich-orders4.stderr.log, cache/runs/adhoc-20261011/enrich-orders5.stderr.log, cache/runs/adhoc-20261011/fetch-scan-output.json, cache/runs/adhoc-20261011/fetch-scan.stderr.log, cache/runs/adhoc-20261011/filter-noise-output.json, cache/runs/adhoc-20261011/filter-noise.stderr.log, cache/runs/adhoc-20261011/insights-array.json, cache/runs/adhoc-20261011/insights-enriched.json, cache/runs/adhoc-20261011/insights-enriched2.json, cache/runs/adhoc-20261011/insights-enriched3.json, cache/runs/adhoc-20261011/item-summary.txt, cache/runs/adhoc-20261011/knowledge-gaps.json, cache/runs/adhoc-20261011/pdf-texts.json, cache/runs/adhoc-20261011/pdf-urls.json, cache/runs/adhoc-20261011/prefetch.log, cache/runs/adhoc-20261011/route-remaining.stdout.log, cache/runs/adhoc-20261011/routine-items.json, cache/runs/adhoc-20261011/send-digest.stderr.log, cache/runs/adhoc-20261011/send-digest.stdout.log, cache/runs/adhoc-20261011/stats.json, cache/runs/adhoc-20261011/texts-preview.txt, cache/runs/adhoc-20261011/write-notes.stderr.log, cache/runs/adhoc-20261011/write-notes.stdout.log, cache/runs/adhoc-20261013/batch-read.stderr.log, cache/runs/adhoc-20261013/batch-read2.stderr.log, cache/runs/adhoc-20261013/categorise-output.json, cache/runs/adhoc-20261013/commit-window.stderr.log, cache/runs/adhoc-20261013/commit-window.stdout.log, cache/runs/adhoc-20261013/deep1.txt, cache/runs/adhoc-20261013/deep2.txt, cache/runs/adhoc-20261013/fetch-scan-output.json, cache/runs/adhoc-20261013/filter-noise-output.json, cache/runs/adhoc-20261013/insights-array.json, cache/runs/adhoc-20261013/knowledge-gaps.json, cache/runs/adhoc-20261013/pdf-texts.json, cache/runs/adhoc-20261013/pdf-urls.json, cache/runs/adhoc-20261013/remaining-routine.json, cache/runs/adhoc-20261013/routine-items.json, cache/runs/adhoc-20261013/send-digest.stderr.log, cache/runs/adhoc-20261013/send-digest.stdout.log, cache/runs/adhoc-20261013/stats.json, cache/runs/adhoc-20261013/texts-preview.txt, cache/runs/adhoc-20261013/write-notes-results.json, cache/runs/adhoc-20261013/write-notes.stderr.log, cache/runs/adhoc-20261013/write-notes.stdout.log, cache/runs/post-close-20261015-1915/batch-read.stderr.log, cache/runs/post-close-20261015-1915/batch-read.stdout.log, cache/runs/post-close-20261015-1915/batch_1.json, cache/runs/post-close-20261015-1915/batch_2.json, cache/runs/post-close-20261015-1915/batch_3.json, cache/runs/post-close-20261015-1915/batch_4.json, cache/runs/post-close-20261015-1915/batch_5.json, cache/runs/post-close-20261015-1915/batch_6.json, cache/runs/post-close-20261015-1915/batch_7.json, cache/runs/post-close-20261015-1915/categorise-output.json, cache/runs/post-close-20261015-1915/categorise.stderr.log, cache/runs/post-close-20261015-1915/commit-window.stderr.log, cache/runs/post-close-20261015-1915/commit-window.stdout.log, cache/runs/post-close-20261015-1915/dup-items.json, cache/runs/post-close-20261015-1915/dup-mark-processed-results.json, cache/runs/post-close-20261015-1915/fetch-scan-output.json, cache/runs/post-close-20261015-1915/fetch-scan.stderr.log, cache/runs/post-close-20261015-1915/filter-noise-output.json, cache/runs/post-close-20261015-1915/filter-noise.stderr.log, cache/runs/post-close-20261015-1915/heavy-items.json, cache/runs/post-close-20261015-1915/heavy-skip-results.json, cache/runs/post-close-20261015-1915/insights-array.json, cache/runs/post-close-20261015-1915/pdf-texts.json, cache/runs/post-close-20261015-1915/pdf-urls.json, cache/runs/post-close-20261015-1915/prefetch.log, cache/runs/post-close-20261015-1915/remaining-items.json, cache/runs/post-close-20261015-1915/resolve-scan.json, cache/runs/post-close-20261015-1915/resolve-scan.stderr.log, cache/runs/post-close-20261015-1915/routine-items.json, cache/runs/post-close-20261015-1915/send-digest.stderr.log, cache/runs/post-close-20261015-1915/send-digest.stdout.log, cache/runs/post-close-20261015-1915/stats.json
- **Recommended Action:** `[VERIFY] cache/ — confirm unused, then delete or relocate`

### 27. [Low] Investigate unreferenced folder .pcsi_adhoc/ (40 files, all unreferenced)

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_adhoc`](file:///Users/darshanpatel/code/stockmarket/.pcsi_adhoc)
- **Details:** Every file that exists under .pcsi_adhoc/ (recursively, 40 total) is not referenced by any reachable code. Full file list: .pcsi_adhoc/ACSTECH.json, .pcsi_adhoc/AERPACE.json, .pcsi_adhoc/AERPACE_full.json, .pcsi_adhoc/CEMPRO.json, .pcsi_adhoc/DELTACORP.json, .pcsi_adhoc/DELTACORP_full.json, .pcsi_adhoc/DELTACORP_full2.json, .pcsi_adhoc/DIACABS.json, .pcsi_adhoc/HMAAGRO.json, .pcsi_adhoc/IIRM.json, .pcsi_adhoc/INDUSINVIT.json, .pcsi_adhoc/LTTS.json, .pcsi_adhoc/MEGAMONT.json, .pcsi_adhoc/NAZARA.json, .pcsi_adhoc/SYSTEMATIC.json, .pcsi_adhoc/VERTIS.json, .pcsi_adhoc/categorise.err, .pcsi_adhoc/categorise.json, .pcsi_adhoc/data-push.log, .pcsi_adhoc/enrich-orders.err, .pcsi_adhoc/fetch-scan.err, .pcsi_adhoc/fetch-scan.json, .pcsi_adhoc/fetch-scan.out, .pcsi_adhoc/filter-noise.err, .pcsi_adhoc/filter-noise.json, .pcsi_adhoc/gabriel.json, .pcsi_adhoc/insights-array-enriched.json, .pcsi_adhoc/insights-array.json, .pcsi_adhoc/light-pdf-urls.json, .pcsi_adhoc/note_aerpace.json, .pcsi_adhoc/note_cempro.json, .pcsi_adhoc/note_deltacorp.json, .pcsi_adhoc/note_gabriel.json, .pcsi_adhoc/note_megamont.json, .pcsi_adhoc/note_systematic.json, .pcsi_adhoc/resolve-scan.out, .pcsi_adhoc/routine-items.json, .pcsi_adhoc/send-digest.err, .pcsi_adhoc/send-digest.out, .pcsi_adhoc/stats.json
- **Recommended Action:** `[VERIFY] .pcsi_adhoc/ — confirm unused, then delete or relocate`

### 28. [Low] Investigate unreferenced folder .pcsi_postclose/notes/ (6 files, all unreferenced)

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/notes`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/notes)
- **Details:** Every file that exists under .pcsi_postclose/notes/ (recursively, 6 total) is not referenced by any reachable code. Full file list: .pcsi_postclose/notes/optivalue.json, .pcsi_postclose/notes/pgil.json, .pcsi_postclose/notes/seamecltd.json, .pcsi_postclose/notes/ucil.json, .pcsi_postclose/notes/uhtl.json, .pcsi_postclose/notes/utlsolar.json
- **Recommended Action:** `[VERIFY] .pcsi_postclose/notes/ — confirm unused, then delete or relocate`

### 29. [Low] Investigate unreferenced folder .pcsi_run/ (5 files, all unreferenced)

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_run`](file:///Users/darshanpatel/code/stockmarket/.pcsi_run)
- **Details:** Every file that exists under .pcsi_run/ (recursively, 5 total) is not referenced by any reachable code. Full file list: .pcsi_run/empty.json, .pcsi_run/gaps.json, .pcsi_run/routine-items.json, .pcsi_run/send-digest.err, .pcsi_run/stats.json
- **Recommended Action:** `[VERIFY] .pcsi_run/ — confirm unused, then delete or relocate`

### 30. [Low] Investigate unreferenced file b1_markprocessed.tsv

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/b1_markprocessed.tsv`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/b1_markprocessed.tsv)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/b1_markprocessed.tsv — confirm unused, then delete or relocate`

### 31. [Low] Investigate unreferenced file b2_markprocessed.tsv

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/b2_markprocessed.tsv`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/b2_markprocessed.tsv)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/b2_markprocessed.tsv — confirm unused, then delete or relocate`

### 32. [Low] Investigate unreferenced file b3_markprocessed.tsv

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/b3_markprocessed.tsv`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/b3_markprocessed.tsv)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/b3_markprocessed.tsv — confirm unused, then delete or relocate`

### 33. [Low] Investigate unreferenced file b4_markprocessed.tsv

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/b4_markprocessed.tsv`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/b4_markprocessed.tsv)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/b4_markprocessed.tsv — confirm unused, then delete or relocate`

### 34. [Low] Investigate unreferenced file categorise-compact.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/categorise-compact.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/categorise-compact.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/categorise-compact.json — confirm unused, then delete or relocate`

### 35. [Low] Investigate unreferenced file categorise.err

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/categorise.err`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/categorise.err)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/categorise.err — confirm unused, then delete or relocate`

### 36. [Low] Investigate unreferenced file categorise.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/categorise.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/categorise.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/categorise.json — confirm unused, then delete or relocate`

### 37. [Low] Investigate unreferenced file commit-window.err

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/commit-window.err`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/commit-window.err)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/commit-window.err — confirm unused, then delete or relocate`

### 38. [Low] Investigate unreferenced file commit-window.out

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/commit-window.out`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/commit-window.out)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/commit-window.out — confirm unused, then delete or relocate`

### 39. [Low] Investigate unreferenced file data-push.err

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/data-push.err`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/data-push.err)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] .pcsi_postclose/data-push.err — 0-byte file is always considered dead`

### 40. [Low] Investigate unreferenced file data-push.out

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/data-push.out`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/data-push.out)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] .pcsi_postclose/data-push.out — 0-byte file is always considered dead`

### 41. [Low] Investigate unreferenced file data-push2.err

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/data-push2.err`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/data-push2.err)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] .pcsi_postclose/data-push2.err — 0-byte file is always considered dead`

### 42. [Low] Investigate unreferenced file data-push2.out

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/data-push2.out`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/data-push2.out)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] .pcsi_postclose/data-push2.out — 0-byte file is always considered dead`

### 43. [Low] Investigate unreferenced file data-push3.err

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/data-push3.err`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/data-push3.err)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] .pcsi_postclose/data-push3.err — 0-byte file is always considered dead`

### 44. [Low] Investigate unreferenced file data-push3.out

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/data-push3.out`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/data-push3.out)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] .pcsi_postclose/data-push3.out — 0-byte file is always considered dead`

### 45. [Low] Investigate unreferenced file data-push4.err

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/data-push4.err`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/data-push4.err)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] .pcsi_postclose/data-push4.err — 0-byte file is always considered dead`

### 46. [Low] Investigate unreferenced file data-push4.out

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/data-push4.out`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/data-push4.out)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] .pcsi_postclose/data-push4.out — 0-byte file is always considered dead`

### 47. [Low] Investigate unreferenced file data-push5.err

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/data-push5.err`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/data-push5.err)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] .pcsi_postclose/data-push5.err — 0-byte file is always considered dead`

### 48. [Low] Investigate unreferenced file data-push5.out

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/data-push5.out`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/data-push5.out)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] .pcsi_postclose/data-push5.out — 0-byte file is always considered dead`

### 49. [Low] Investigate unreferenced file dup.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/dup.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/dup.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/dup.json — confirm unused, then delete or relocate`

### 50. [Low] Investigate unreferenced file dup_pairs.tsv

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/dup_pairs.tsv`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/dup_pairs.tsv)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/dup_pairs.tsv — confirm unused, then delete or relocate`

### 51. [Low] Investigate unreferenced file dups.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/dups.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/dups.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/dups.json — confirm unused, then delete or relocate`

### 52. [Low] Investigate unreferenced file enrich.err

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/enrich.err`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/enrich.err)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/enrich.err — confirm unused, then delete or relocate`

### 53. [Low] Investigate unreferenced file fetch-scan.err

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/fetch-scan.err`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/fetch-scan.err)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/fetch-scan.err — confirm unused, then delete or relocate`

### 54. [Low] Investigate unreferenced file fetch-scan.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/fetch-scan.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/fetch-scan.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/fetch-scan.json — confirm unused, then delete or relocate`

### 55. [Low] Investigate unreferenced file fetch-scan.out

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/fetch-scan.out`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/fetch-scan.out)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/fetch-scan.out — confirm unused, then delete or relocate`

### 56. [Low] Investigate unreferenced file filter-noise.err

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/filter-noise.err`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/filter-noise.err)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/filter-noise.err — confirm unused, then delete or relocate`

### 57. [Low] Investigate unreferenced file filter-noise.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/filter-noise.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/filter-noise.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/filter-noise.json — confirm unused, then delete or relocate`

### 58. [Low] Investigate unreferenced file gaps.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/gaps.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/gaps.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/gaps.json — confirm unused, then delete or relocate`

### 59. [Low] Investigate unreferenced file heavy-urls.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/heavy-urls.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/heavy-urls.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/heavy-urls.json — confirm unused, then delete or relocate`

### 60. [Low] Investigate unreferenced file heavy.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/heavy.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/heavy.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/heavy.json — confirm unused, then delete or relocate`

### 61. [Low] Investigate unreferenced file heavy_recs.jsonl

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/heavy_recs.jsonl`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/heavy_recs.jsonl)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/heavy_recs.jsonl — confirm unused, then delete or relocate`

### 62. [Low] Investigate unreferenced file insights-array-enriched.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/insights-array-enriched.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/insights-array-enriched.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/insights-array-enriched.json — confirm unused, then delete or relocate`

### 63. [Low] Investigate unreferenced file insights-array.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/insights-array.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/insights-array.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/insights-array.json — confirm unused, then delete or relocate`

### 64. [Low] Investigate unreferenced file insights-scored.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/insights-scored.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/insights-scored.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/insights-scored.json — confirm unused, then delete or relocate`

### 65. [Low] Investigate unreferenced file merged.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/merged.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/merged.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/merged.json — confirm unused, then delete or relocate`

### 66. [Low] Investigate unreferenced file note_b1_0.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b1_0.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b1_0.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b1_0.json — confirm unused, then delete or relocate`

### 67. [Low] Investigate unreferenced file note_b1_1.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b1_1.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b1_1.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b1_1.json — confirm unused, then delete or relocate`

### 68. [Low] Investigate unreferenced file note_b1_2.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b1_2.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b1_2.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b1_2.json — confirm unused, then delete or relocate`

### 69. [Low] Investigate unreferenced file note_b1_3.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b1_3.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b1_3.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b1_3.json — confirm unused, then delete or relocate`

### 70. [Low] Investigate unreferenced file note_b2_0.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b2_0.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b2_0.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b2_0.json — confirm unused, then delete or relocate`

### 71. [Low] Investigate unreferenced file note_b2_1.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b2_1.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b2_1.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b2_1.json — confirm unused, then delete or relocate`

### 72. [Low] Investigate unreferenced file note_b2_2.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b2_2.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b2_2.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b2_2.json — confirm unused, then delete or relocate`

### 73. [Low] Investigate unreferenced file note_b2_3.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b2_3.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b2_3.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b2_3.json — confirm unused, then delete or relocate`

### 74. [Low] Investigate unreferenced file note_b2_4.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b2_4.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b2_4.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b2_4.json — confirm unused, then delete or relocate`

### 75. [Low] Investigate unreferenced file note_b2_5.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b2_5.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b2_5.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b2_5.json — confirm unused, then delete or relocate`

### 76. [Low] Investigate unreferenced file note_b3_0.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b3_0.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b3_0.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b3_0.json — confirm unused, then delete or relocate`

### 77. [Low] Investigate unreferenced file note_b3_1.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b3_1.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b3_1.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b3_1.json — confirm unused, then delete or relocate`

### 78. [Low] Investigate unreferenced file note_b3_2.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b3_2.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b3_2.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b3_2.json — confirm unused, then delete or relocate`

### 79. [Low] Investigate unreferenced file note_b3_3.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b3_3.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b3_3.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b3_3.json — confirm unused, then delete or relocate`

### 80. [Low] Investigate unreferenced file note_b4_0.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b4_0.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b4_0.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b4_0.json — confirm unused, then delete or relocate`

### 81. [Low] Investigate unreferenced file note_b4_1.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b4_1.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b4_1.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b4_1.json — confirm unused, then delete or relocate`

### 82. [Low] Investigate unreferenced file note_b4_2.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b4_2.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b4_2.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b4_2.json — confirm unused, then delete or relocate`

### 83. [Low] Investigate unreferenced file note_b4_3.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/note_b4_3.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/note_b4_3.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/note_b4_3.json — confirm unused, then delete or relocate`

### 84. [Low] Investigate unreferenced file notes_batch1.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/notes_batch1.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/notes_batch1.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/notes_batch1.json — confirm unused, then delete or relocate`

### 85. [Low] Investigate unreferenced file notes_batch2.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/notes_batch2.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/notes_batch2.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/notes_batch2.json — confirm unused, then delete or relocate`

### 86. [Low] Investigate unreferenced file notes_batch3.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/notes_batch3.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/notes_batch3.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/notes_batch3.json — confirm unused, then delete or relocate`

### 87. [Low] Investigate unreferenced file notes_batch4.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/notes_batch4.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/notes_batch4.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/notes_batch4.json — confirm unused, then delete or relocate`

### 88. [Low] Investigate unreferenced file pdf-urls.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/pdf-urls.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/pdf-urls.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/pdf-urls.json — confirm unused, then delete or relocate`

### 89. [Low] Investigate unreferenced file pdftexts.jsonl

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/pdftexts.jsonl`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/pdftexts.jsonl)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/pdftexts.jsonl — confirm unused, then delete or relocate`

### 90. [Low] Investigate unreferenced file prefetch.err

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/prefetch.err`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/prefetch.err)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/prefetch.err — confirm unused, then delete or relocate`

### 91. [Low] Investigate unreferenced file prefetch.out

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/prefetch.out`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/prefetch.out)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/prefetch.out — confirm unused, then delete or relocate`

### 92. [Low] Investigate unreferenced file resolve-scan.err

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/resolve-scan.err`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/resolve-scan.err)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/resolve-scan.err — confirm unused, then delete or relocate`

### 93. [Low] Investigate unreferenced file resolve-scan.out

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/resolve-scan.out`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/resolve-scan.out)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/resolve-scan.out — confirm unused, then delete or relocate`

### 94. [Low] Investigate unreferenced file rest-with-text.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/rest-with-text.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/rest-with-text.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/rest-with-text.json — confirm unused, then delete or relocate`

### 95. [Low] Investigate unreferenced file rest.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/rest.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/rest.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/rest.json — confirm unused, then delete or relocate`

### 96. [Low] Investigate unreferenced file routine-items.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/routine-items.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/routine-items.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/routine-items.json — confirm unused, then delete or relocate`

### 97. [Low] Investigate unreferenced file seamec-notes.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/seamec-notes.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/seamec-notes.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/seamec-notes.json — confirm unused, then delete or relocate`

### 98. [Low] Investigate unreferenced file send-digest.err

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/send-digest.err`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/send-digest.err)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/send-digest.err — confirm unused, then delete or relocate`

### 99. [Low] Investigate unreferenced file send-digest.out

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/send-digest.out`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/send-digest.out)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/send-digest.out — confirm unused, then delete or relocate`

### 100. [Low] Investigate unreferenced file ssurl-map.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/ssurl-map.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/ssurl-map.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/ssurl-map.json — confirm unused, then delete or relocate`

### 101. [Low] Investigate unreferenced file stats.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/stats.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/stats.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/stats.json — confirm unused, then delete or relocate`

### 102. [Low] Investigate unreferenced file toprocess-urls.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/toprocess-urls.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/toprocess-urls.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/toprocess-urls.json — confirm unused, then delete or relocate`

### 103. [Low] Investigate unreferenced file toprocess.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/toprocess.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/toprocess.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/toprocess.json — confirm unused, then delete or relocate`

### 104. [Low] Investigate unreferenced file toprocess_idx.tsv

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_postclose/toprocess_idx.tsv`](file:///Users/darshanpatel/code/stockmarket/.pcsi_postclose/toprocess_idx.tsv)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_postclose/toprocess_idx.tsv — confirm unused, then delete or relocate`

### 105. [Low] Investigate unreferenced file Forward_Guidance_20261011.xlsx

- **Category:** Unreferenced Non-Code File
- **Target File:** [`Forward_Guidance_20261011.xlsx`](file:///Users/darshanpatel/code/stockmarket/Forward_Guidance_20261011.xlsx)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] Forward_Guidance_20261011.xlsx — confirm unused, then delete or relocate`

### 106. [Low] Investigate unreferenced file Forward_Guidance_20261012.xlsx

- **Category:** Unreferenced Non-Code File
- **Target File:** [`Forward_Guidance_20261012.xlsx`](file:///Users/darshanpatel/code/stockmarket/Forward_Guidance_20261012.xlsx)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] Forward_Guidance_20261012.xlsx — confirm unused, then delete or relocate`

### 107. [Low] Investigate unreferenced file Forward_Guidance_20261014.xlsx

- **Category:** Unreferenced Non-Code File
- **Target File:** [`Forward_Guidance_20261014.xlsx`](file:///Users/darshanpatel/code/stockmarket/Forward_Guidance_20261014.xlsx)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] Forward_Guidance_20261014.xlsx — confirm unused, then delete or relocate`

### 108. [Low] Investigate unreferenced file PEAD_Ranking_Upcoming_Results_20261014.xlsx

- **Category:** Unreferenced Non-Code File
- **Target File:** [`PEAD_Ranking_Upcoming_Results_20261014.xlsx`](file:///Users/darshanpatel/code/stockmarket/PEAD_Ranking_Upcoming_Results_20261014.xlsx)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] PEAD_Ranking_Upcoming_Results_20261014.xlsx — confirm unused, then delete or relocate`

### 109. [Low] Investigate unreferenced file \_pe_tmp.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`packages/jobs-runtime/_pe_tmp.json`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/_pe_tmp.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] packages/jobs-runtime/_pe_tmp.json — confirm unused, then delete or relocate`

### 110. [Low] Investigate unreferenced file temp_cycle_add.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`packages/jobs-runtime/data/runs/temp_cycle_add.json`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/data/runs/temp_cycle_add.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] packages/jobs-runtime/data/runs/temp_cycle_add.json — confirm unused, then delete or relocate`

### 111. [Low] Investigate unreferenced file temp_macro_readings.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`packages/jobs-runtime/data/runs/temp_macro_readings.json`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/data/runs/temp_macro_readings.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] packages/jobs-runtime/data/runs/temp_macro_readings.json — confirm unused, then delete or relocate`

### 112. [Low] Investigate unreferenced file \_unm.js.todelete

- **Category:** Unreferenced Non-Code File
- **Target File:** [`scripts/pdf-corpus/_unm.js.todelete`](file:///Users/darshanpatel/code/stockmarket/scripts/pdf-corpus/_unm.js.todelete)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] scripts/pdf-corpus/_unm.js.todelete — confirm unused, then delete or relocate`

### 113. [Low] Investigate unreferenced file NSE_KANOHAR_DRHP_2026-01-23.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_KANOHAR_DRHP_2026-01-23.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_KANOHAR_DRHP_2026-01-23.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_KANOHAR_DRHP_2026-01-23.pdf — confirm unused, then delete or relocate`

### 114. [Low] Investigate unreferenced file NSE_KANOHAR_PPT_202609.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_KANOHAR_PPT_202609.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_KANOHAR_PPT_202609.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_KANOHAR_PPT_202609.pdf — confirm unused, then delete or relocate`

### 115. [Low] Investigate unreferenced file NSE_KANOHAR_Result_202609.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_KANOHAR_Result_202609.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_KANOHAR_Result_202609.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_KANOHAR_Result_202609.pdf — confirm unused, then delete or relocate`

### 116. [Low] Investigate unreferenced file NSE_MRPL_Result_202506.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Result_202506.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Result_202506.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Result_202506.pdf — confirm unused, then delete or relocate`

### 117. [Low] Investigate unreferenced file NSE_MRPL_Result_202509.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Result_202509.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Result_202509.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Result_202509.pdf — confirm unused, then delete or relocate`

### 118. [Low] Investigate unreferenced file NSE_MRPL_Result_202512.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Result_202512.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Result_202512.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Result_202512.pdf — confirm unused, then delete or relocate`

### 119. [Low] Investigate unreferenced file NSE_MRPL_Result_202603.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Result_202603.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Result_202603.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Result_202603.pdf — confirm unused, then delete or relocate`

### 120. [Low] Investigate unreferenced file NSE_MRPL_Result_202606.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Result_202606.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Result_202606.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Result_202606.pdf — confirm unused, then delete or relocate`

### 121. [Low] Investigate unreferenced file NSE_MRPL_Transcript_202403.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Transcript_202403.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Transcript_202403.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Transcript_202403.pdf — confirm unused, then delete or relocate`

### 122. [Low] Investigate unreferenced file NSE_MRPL_Transcript_202503.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Transcript_202503.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Transcript_202503.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Transcript_202503.pdf — confirm unused, then delete or relocate`

### 123. [Low] Investigate unreferenced file NSE_MRPL_Transcript_202506.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Transcript_202506.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Transcript_202506.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Transcript_202506.pdf — confirm unused, then delete or relocate`

### 124. [Low] Investigate unreferenced file NSE_MRPL_Transcript_202509.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Transcript_202509.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Transcript_202509.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Transcript_202509.pdf — confirm unused, then delete or relocate`

### 125. [Low] Investigate unreferenced file NSE_MRPL_Transcript_202512.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Transcript_202512.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Transcript_202512.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Transcript_202512.pdf — confirm unused, then delete or relocate`

### 126. [Low] Investigate unreferenced file NSE_SUPRIYA_PPT_202603.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_SUPRIYA_PPT_202603.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_SUPRIYA_PPT_202603.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_SUPRIYA_PPT_202603.pdf — confirm unused, then delete or relocate`

### 127. [Low] Investigate unreferenced file NSE_SUPRIYA_PPT_202606.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_SUPRIYA_PPT_202606.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_SUPRIYA_PPT_202606.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_SUPRIYA_PPT_202606.pdf — confirm unused, then delete or relocate`

### 128. [Low] Investigate unreferenced file NSE_SUPRIYA_Result_202606.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_SUPRIYA_Result_202606.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_SUPRIYA_Result_202606.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_SUPRIYA_Result_202606.pdf — confirm unused, then delete or relocate`

### 129. [Medium] Verify data/\_push_log.txt is actually orphaned

- **Category:** Data Directory Hanging Node
- **Target File:** [`data/_push_log.txt`](file:///Users/darshanpatel/code/stockmarket/data/_push_log.txt)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('\_push_log.txt'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[DELETE] data/_push_log.txt — 0-byte file is always considered dead`

### 130. [Medium] Verify data/scratch is actually orphaned

- **Category:** Data Directory Hanging Node
- **Target File:** [`data/scratch`](file:///Users/darshanpatel/code/stockmarket/data/scratch)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('scratch'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[VERIFY] data/scratch — no data-layer code references this collection name`

### 131. [Medium] Verify data/stockmarket.db is actually orphaned

- **Category:** Data Directory Hanging Node
- **Target File:** [`data/stockmarket.db`](file:///Users/darshanpatel/code/stockmarket/data/stockmarket.db)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('stockmarket.db'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[DELETE] data/stockmarket.db — 0-byte file is always considered dead`

### 132. [Medium] Verify data/tmp_save_gainers_reports.js is actually orphaned

- **Category:** Data Directory Hanging Node
- **Target File:** [`data/tmp_save_gainers_reports.js`](file:///Users/darshanpatel/code/stockmarket/data/tmp_save_gainers_reports.js)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('tmp_save_gainers_reports.js'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[DELETE] data/tmp_save_gainers_reports.js — files starting with tmp_* are always considered dead`
