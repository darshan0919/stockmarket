# Dead Code & Coding Practice Action Items

> **Last Updated:** 2026-10-28T03:00:05.842Z
> **Status:** Automated Scan Completed
> **Active Action Items:** 32

---

## 📊 Summary Breakdown

| Category                        | Flagged Items |  Priority   |
| :------------------------------ | :-----------: | :---------: |
| **Coding Standard Violation**   |       1       | High/Medium |
| **Unused File**                 |       3       | High/Medium |
| **Unreferenced Non-Code File**  |      27       | High/Medium |
| **Data Directory Hanging Node** |       1       | High/Medium |

## 🗂️ Whole-Directory Findings (sorted by file count — check these first)

| Directory         | Files | Category                   | Action                                                               |
| :---------------- | :---: | :------------------------- | :------------------------------------------------------------------- |
| `cache/`          |  106  | Unreferenced Non-Code File | `[VERIFY] cache/ — confirm unused, then delete or relocate`          |
| `stock-api/data/` |   1   | Unreferenced Non-Code File | `[VERIFY] stock-api/data/ — confirm unused, then delete or relocate` |

---

## 📋 Action Items List

The following items were identified by analyzing scheduled jobs, skills, workspace APIs, and frontend applications. Corresponding entries have also been synchronized to [`data/tasks.json`](file:///Users/darshanpatel/code/stockmarket/data/tasks.json).

### 1. [High] Refactor hardcoded user absolute path in scripts/**tests**/antigravitySync.test.js

- **Category:** Coding Standard Violation
- **Target File:** [`scripts/__tests__/antigravitySync.test.js`](file:///Users/darshanpatel/code/stockmarket/scripts/__tests__/antigravitySync.test.js)
- **Details:** Hardcoded path(s) found: /Users/darshanpatel/code/other. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in scripts/__tests__/antigravitySync.test.js`

### 2. [High] Investigate unreferenced source file documentExtractors.py

- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/lib/documentExtractors.py`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/lib/documentExtractors.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/lib/documentExtractors.py`

### 3. [High] Investigate unreferenced source file volumeRocketingClassifier.js

- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/lib/volumeRocketingClassifier.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/lib/volumeRocketingClassifier.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/lib/volumeRocketingClassifier.js`

### 4. [High] Investigate unreferenced source file capture.js

- **Category:** Unused File
- **Target File:** [`tools/x-timeline-capture/capture.js`](file:///Users/darshanpatel/code/stockmarket/tools/x-timeline-capture/capture.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tools/x-timeline-capture/capture.js`

### 5. [Low] Investigate unreferenced folder cache/ (106 files, all unreferenced)

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache`](file:///Users/darshanpatel/code/stockmarket/cache)
- **Details:** Every file that exists under cache/ (recursively, 106 total) is not referenced by any reachable code. Full file list: cache/digest_preview.html, cache/runs/adhoc-20261011/batch-read.stderr.log, cache/runs/adhoc-20261011/batch-read.stdout.log, cache/runs/adhoc-20261011/categorise-output.json, cache/runs/adhoc-20261011/categorise.stderr.log, cache/runs/adhoc-20261011/commit-window.stderr.log, cache/runs/adhoc-20261011/commit-window.stdout.log, cache/runs/adhoc-20261011/deep-dive.txt, cache/runs/adhoc-20261011/enrich-orders.stderr.log, cache/runs/adhoc-20261011/enrich-orders2.stderr.log, cache/runs/adhoc-20261011/enrich-orders3.stderr.log, cache/runs/adhoc-20261011/enrich-orders4.stderr.log, cache/runs/adhoc-20261011/enrich-orders5.stderr.log, cache/runs/adhoc-20261011/fetch-scan-output.json, cache/runs/adhoc-20261011/fetch-scan.stderr.log, cache/runs/adhoc-20261011/filter-noise-output.json, cache/runs/adhoc-20261011/filter-noise.stderr.log, cache/runs/adhoc-20261011/insights-array.json, cache/runs/adhoc-20261011/insights-enriched.json, cache/runs/adhoc-20261011/insights-enriched2.json, cache/runs/adhoc-20261011/insights-enriched3.json, cache/runs/adhoc-20261011/item-summary.txt, cache/runs/adhoc-20261011/knowledge-gaps.json, cache/runs/adhoc-20261011/pdf-texts.json, cache/runs/adhoc-20261011/pdf-urls.json, cache/runs/adhoc-20261011/prefetch.log, cache/runs/adhoc-20261011/route-remaining.stdout.log, cache/runs/adhoc-20261011/routine-items.json, cache/runs/adhoc-20261011/send-digest.stderr.log, cache/runs/adhoc-20261011/send-digest.stdout.log, cache/runs/adhoc-20261011/stats.json, cache/runs/adhoc-20261011/texts-preview.txt, cache/runs/adhoc-20261011/write-notes.stderr.log, cache/runs/adhoc-20261011/write-notes.stdout.log, cache/runs/adhoc-20261013/batch-read.stderr.log, cache/runs/adhoc-20261013/batch-read2.stderr.log, cache/runs/adhoc-20261013/categorise-output.json, cache/runs/adhoc-20261013/commit-window.stderr.log, cache/runs/adhoc-20261013/commit-window.stdout.log, cache/runs/adhoc-20261013/deep1.txt, cache/runs/adhoc-20261013/deep2.txt, cache/runs/adhoc-20261013/fetch-scan-output.json, cache/runs/adhoc-20261013/filter-noise-output.json, cache/runs/adhoc-20261013/insights-array.json, cache/runs/adhoc-20261013/knowledge-gaps.json, cache/runs/adhoc-20261013/pdf-texts.json, cache/runs/adhoc-20261013/pdf-urls.json, cache/runs/adhoc-20261013/remaining-routine.json, cache/runs/adhoc-20261013/routine-items.json, cache/runs/adhoc-20261013/send-digest.stderr.log, cache/runs/adhoc-20261013/send-digest.stdout.log, cache/runs/adhoc-20261013/stats.json, cache/runs/adhoc-20261013/texts-preview.txt, cache/runs/adhoc-20261013/write-notes-results.json, cache/runs/adhoc-20261013/write-notes.stderr.log, cache/runs/adhoc-20261013/write-notes.stdout.log, cache/runs/adhoc-20261028/categorise-output.json, cache/runs/adhoc-20261028/categorise.stderr.log, cache/runs/adhoc-20261028/commit-window.stderr.log, cache/runs/adhoc-20261028/commit-window.stdout.log, cache/runs/adhoc-20261028/data-push.pid, cache/runs/adhoc-20261028/data-push.stderr.log, cache/runs/adhoc-20261028/data-push.stdout.log, cache/runs/adhoc-20261028/fetch-scan-output.json, cache/runs/adhoc-20261028/fetch-scan.stderr.log, cache/runs/adhoc-20261028/filter-noise-output.json, cache/runs/adhoc-20261028/filter-noise.stderr.log, cache/runs/adhoc-20261028/insights-array.json, cache/runs/adhoc-20261028/resolve-scan.stderr.log, cache/runs/adhoc-20261028/resolve-scan.stdout.log, cache/runs/adhoc-20261028/routine-items.json, cache/runs/adhoc-20261028/send-digest.stderr.log, cache/runs/adhoc-20261028/send-digest.stdout.log, cache/runs/adhoc-20261028/stats.json, cache/runs/post-close-20261015-1915/batch-read.stderr.log, cache/runs/post-close-20261015-1915/batch-read.stdout.log, cache/runs/post-close-20261015-1915/batch_1.json, cache/runs/post-close-20261015-1915/batch_2.json, cache/runs/post-close-20261015-1915/batch_3.json, cache/runs/post-close-20261015-1915/batch_4.json, cache/runs/post-close-20261015-1915/batch_5.json, cache/runs/post-close-20261015-1915/batch_6.json, cache/runs/post-close-20261015-1915/batch_7.json, cache/runs/post-close-20261015-1915/categorise-output.json, cache/runs/post-close-20261015-1915/categorise.stderr.log, cache/runs/post-close-20261015-1915/commit-window.stderr.log, cache/runs/post-close-20261015-1915/commit-window.stdout.log, cache/runs/post-close-20261015-1915/dup-items.json, cache/runs/post-close-20261015-1915/dup-mark-processed-results.json, cache/runs/post-close-20261015-1915/fetch-scan-output.json, cache/runs/post-close-20261015-1915/fetch-scan.stderr.log, cache/runs/post-close-20261015-1915/filter-noise-output.json, cache/runs/post-close-20261015-1915/filter-noise.stderr.log, cache/runs/post-close-20261015-1915/heavy-items.json, cache/runs/post-close-20261015-1915/heavy-skip-results.json, cache/runs/post-close-20261015-1915/insights-array.json, cache/runs/post-close-20261015-1915/pdf-texts.json, cache/runs/post-close-20261015-1915/pdf-urls.json, cache/runs/post-close-20261015-1915/prefetch.log, cache/runs/post-close-20261015-1915/remaining-items.json, cache/runs/post-close-20261015-1915/resolve-scan.json, cache/runs/post-close-20261015-1915/resolve-scan.stderr.log, cache/runs/post-close-20261015-1915/routine-items.json, cache/runs/post-close-20261015-1915/send-digest.stderr.log, cache/runs/post-close-20261015-1915/send-digest.stdout.log, cache/runs/post-close-20261015-1915/stats.json
- **Recommended Action:** `[VERIFY] cache/ — confirm unused, then delete or relocate`

### 6. [Low] Investigate unreferenced folder stock-api/data/ (1 files, all unreferenced)

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock-api/data`](file:///Users/darshanpatel/code/stockmarket/stock-api/data)
- **Details:** Every file that exists under stock-api/data/ (recursively, 1 total) is not referenced by any reachable code. Full file list: stock-api/data/assets/quarterly-result-analysis/PARACABLES_Q2_FY27_ResultAnalysis.pdf
- **Recommended Action:** `[VERIFY] stock-api/data/ — confirm unused, then delete or relocate`

### 7. [Low] Investigate unreferenced file Forward_Guidance_20261011.xlsx

- **Category:** Unreferenced Non-Code File
- **Target File:** [`Forward_Guidance_20261011.xlsx`](file:///Users/darshanpatel/code/stockmarket/Forward_Guidance_20261011.xlsx)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] Forward_Guidance_20261011.xlsx — confirm unused, then delete or relocate`

### 8. [Low] Investigate unreferenced file Forward_Guidance_20261012.xlsx

- **Category:** Unreferenced Non-Code File
- **Target File:** [`Forward_Guidance_20261012.xlsx`](file:///Users/darshanpatel/code/stockmarket/Forward_Guidance_20261012.xlsx)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] Forward_Guidance_20261012.xlsx — confirm unused, then delete or relocate`

### 9. [Low] Investigate unreferenced file Forward_Guidance_20261014.xlsx

- **Category:** Unreferenced Non-Code File
- **Target File:** [`Forward_Guidance_20261014.xlsx`](file:///Users/darshanpatel/code/stockmarket/Forward_Guidance_20261014.xlsx)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] Forward_Guidance_20261014.xlsx — confirm unused, then delete or relocate`

### 10. [Low] Investigate unreferenced file PEAD_Ranking_Upcoming_Results_20261014.xlsx

- **Category:** Unreferenced Non-Code File
- **Target File:** [`PEAD_Ranking_Upcoming_Results_20261014.xlsx`](file:///Users/darshanpatel/code/stockmarket/PEAD_Ranking_Upcoming_Results_20261014.xlsx)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] PEAD_Ranking_Upcoming_Results_20261014.xlsx — confirm unused, then delete or relocate`

### 11. [Low] Investigate unreferenced file \_pe_tmp.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`packages/jobs-runtime/_pe_tmp.json`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/_pe_tmp.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] packages/jobs-runtime/_pe_tmp.json — confirm unused, then delete or relocate`

### 12. [Low] Investigate unreferenced file gainers_why_20261022.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`packages/jobs-runtime/data/runs/gainers_why_20261022.json`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/data/runs/gainers_why_20261022.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] packages/jobs-runtime/data/runs/gainers_why_20261022.json — confirm unused, then delete or relocate`

### 13. [Low] Investigate unreferenced file temp_cycle_add.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`packages/jobs-runtime/data/runs/temp_cycle_add.json`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/data/runs/temp_cycle_add.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] packages/jobs-runtime/data/runs/temp_cycle_add.json — confirm unused, then delete or relocate`

### 14. [Low] Investigate unreferenced file temp_macro_readings.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`packages/jobs-runtime/data/runs/temp_macro_readings.json`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/data/runs/temp_macro_readings.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] packages/jobs-runtime/data/runs/temp_macro_readings.json — confirm unused, then delete or relocate`

### 15. [Low] Investigate unreferenced file \_unm.js.todelete

- **Category:** Unreferenced Non-Code File
- **Target File:** [`scripts/pdf-corpus/_unm.js.todelete`](file:///Users/darshanpatel/code/stockmarket/scripts/pdf-corpus/_unm.js.todelete)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] scripts/pdf-corpus/_unm.js.todelete — confirm unused, then delete or relocate`

### 16. [Low] Investigate unreferenced file NSE_KANOHAR_DRHP_2026-01-23.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_KANOHAR_DRHP_2026-01-23.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_KANOHAR_DRHP_2026-01-23.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_KANOHAR_DRHP_2026-01-23.pdf — confirm unused, then delete or relocate`

### 17. [Low] Investigate unreferenced file NSE_KANOHAR_PPT_202609.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_KANOHAR_PPT_202609.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_KANOHAR_PPT_202609.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_KANOHAR_PPT_202609.pdf — confirm unused, then delete or relocate`

### 18. [Low] Investigate unreferenced file NSE_KANOHAR_Result_202609.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_KANOHAR_Result_202609.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_KANOHAR_Result_202609.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_KANOHAR_Result_202609.pdf — confirm unused, then delete or relocate`

### 19. [Low] Investigate unreferenced file NSE_MRPL_Result_202506.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Result_202506.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Result_202506.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Result_202506.pdf — confirm unused, then delete or relocate`

### 20. [Low] Investigate unreferenced file NSE_MRPL_Result_202509.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Result_202509.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Result_202509.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Result_202509.pdf — confirm unused, then delete or relocate`

### 21. [Low] Investigate unreferenced file NSE_MRPL_Result_202512.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Result_202512.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Result_202512.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Result_202512.pdf — confirm unused, then delete or relocate`

### 22. [Low] Investigate unreferenced file NSE_MRPL_Result_202603.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Result_202603.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Result_202603.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Result_202603.pdf — confirm unused, then delete or relocate`

### 23. [Low] Investigate unreferenced file NSE_MRPL_Result_202606.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Result_202606.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Result_202606.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Result_202606.pdf — confirm unused, then delete or relocate`

### 24. [Low] Investigate unreferenced file NSE_MRPL_Transcript_202403.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Transcript_202403.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Transcript_202403.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Transcript_202403.pdf — confirm unused, then delete or relocate`

### 25. [Low] Investigate unreferenced file NSE_MRPL_Transcript_202503.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Transcript_202503.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Transcript_202503.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Transcript_202503.pdf — confirm unused, then delete or relocate`

### 26. [Low] Investigate unreferenced file NSE_MRPL_Transcript_202506.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Transcript_202506.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Transcript_202506.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Transcript_202506.pdf — confirm unused, then delete or relocate`

### 27. [Low] Investigate unreferenced file NSE_MRPL_Transcript_202509.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Transcript_202509.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Transcript_202509.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Transcript_202509.pdf — confirm unused, then delete or relocate`

### 28. [Low] Investigate unreferenced file NSE_MRPL_Transcript_202512.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Transcript_202512.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Transcript_202512.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Transcript_202512.pdf — confirm unused, then delete or relocate`

### 29. [Low] Investigate unreferenced file NSE_SUPRIYA_PPT_202603.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_SUPRIYA_PPT_202603.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_SUPRIYA_PPT_202603.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_SUPRIYA_PPT_202603.pdf — confirm unused, then delete or relocate`

### 30. [Low] Investigate unreferenced file NSE_SUPRIYA_PPT_202606.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_SUPRIYA_PPT_202606.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_SUPRIYA_PPT_202606.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_SUPRIYA_PPT_202606.pdf — confirm unused, then delete or relocate`

### 31. [Low] Investigate unreferenced file NSE_SUPRIYA_Result_202606.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_SUPRIYA_Result_202606.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_SUPRIYA_Result_202606.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_SUPRIYA_Result_202606.pdf — confirm unused, then delete or relocate`

### 32. [Medium] Verify data/scratch is actually orphaned

- **Category:** Data Directory Hanging Node
- **Target File:** [`data/scratch`](file:///Users/darshanpatel/code/stockmarket/data/scratch)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('scratch'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[VERIFY] data/scratch — no data-layer code references this collection name`
