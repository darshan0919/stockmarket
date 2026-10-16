# Dead Code & Coding Practice Action Items

> **Last Updated:** 2026-10-16T07:40:13.740Z
> **Status:** Automated Scan Completed
> **Active Action Items:** 203

---

## 📊 Summary Breakdown

| Category                        | Flagged Items |  Priority   |
| :------------------------------ | :-----------: | :---------: |
| **Committed Stray Artifact**    |      13       | High/Medium |
| **Unused File**                 |      41       | High/Medium |
| **Unreferenced Non-Code File**  |      145      | High/Medium |
| **Data Directory Hanging Node** |       4       | High/Medium |

## 🗂️ Whole-Directory Findings (sorted by file count — check these first)

| Directory                           | Files | Category    | Action                                       |
| :---------------------------------- | :---: | :---------- | :------------------------------------------- |
| `packages/jobs-runtime/_to_delete/` |   5   | Unused File | `[DELETE] packages/jobs-runtime/_to_delete/` |

---

## 📋 Action Items List

The following items were identified by analyzing scheduled jobs, skills, workspace APIs, and frontend applications. Corresponding entries have also been synchronized to [`data/tasks.json`](file:///Users/darshanpatel/code/stockmarket/data/tasks.json).

### 1. [High] Remove committed artifact/binary .pcsi_run/send-digest.out

- **Category:** Committed Stray Artifact
- **Target File:** [`.pcsi_run/send-digest.out`](file:///Users/darshanpatel/code/stockmarket/.pcsi_run/send-digest.out)
- **Details:** File '.pcsi_run/send-digest.out' is a generated artifact, media file, or build binary (.out) committed to git. Per docs/DATA_RULES.md, generated artifacts belong in data/assets/ or data/runs/ and must not be tracked in git.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached .pcsi_run/send-digest.out`

### 2. [High] Remove committed root session data \_scratch_briefs.json

- **Category:** Committed Stray Artifact
- **Target File:** [`_scratch_briefs.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_briefs.json)
- **Details:** File '\_scratch_briefs.json' is a scratch JSON/HTML payload left at the repository root. Per clean code standards, remove or relocate into data/runs/ or data/assets/.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached _scratch_briefs.json`

### 3. [High] Remove committed root session data \_scratch_claude_content.json

- **Category:** Committed Stray Artifact
- **Target File:** [`_scratch_claude_content.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_claude_content.json)
- **Details:** File '\_scratch_claude_content.json' is a scratch JSON/HTML payload left at the repository root. Per clean code standards, remove or relocate into data/runs/ or data/assets/.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached _scratch_claude_content.json`

### 4. [High] Remove committed root session data \_scratch_claude_render.html

- **Category:** Committed Stray Artifact
- **Target File:** [`_scratch_claude_render.html`](file:///Users/darshanpatel/code/stockmarket/_scratch_claude_render.html)
- **Details:** File '\_scratch_claude_render.html' is a scratch JSON/HTML payload left at the repository root. Per clean code standards, remove or relocate into data/runs/ or data/assets/.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached _scratch_claude_render.html`

### 5. [High] Remove committed root session data \_scratch_claude_stats.json

- **Category:** Committed Stray Artifact
- **Target File:** [`_scratch_claude_stats.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_claude_stats.json)
- **Details:** File '\_scratch_claude_stats.json' is a scratch JSON/HTML payload left at the repository root. Per clean code standards, remove or relocate into data/runs/ or data/assets/.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached _scratch_claude_stats.json`

### 6. [High] Remove committed root session data \_scratch_content.json

- **Category:** Committed Stray Artifact
- **Target File:** [`_scratch_content.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_content.json)
- **Details:** File '\_scratch_content.json' is a scratch JSON/HTML payload left at the repository root. Per clean code standards, remove or relocate into data/runs/ or data/assets/.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached _scratch_content.json`

### 7. [High] Remove committed root session data \_scratch_dto_hcltech.json

- **Category:** Committed Stray Artifact
- **Target File:** [`_scratch_dto_hcltech.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_dto_hcltech.json)
- **Details:** File '\_scratch_dto_hcltech.json' is a scratch JSON/HTML payload left at the repository root. Per clean code standards, remove or relocate into data/runs/ or data/assets/.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached _scratch_dto_hcltech.json`

### 8. [High] Remove committed root session data \_scratch_dto_shriramfin.json

- **Category:** Committed Stray Artifact
- **Target File:** [`_scratch_dto_shriramfin.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_dto_shriramfin.json)
- **Details:** File '\_scratch_dto_shriramfin.json' is a scratch JSON/HTML payload left at the repository root. Per clean code standards, remove or relocate into data/runs/ or data/assets/.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached _scratch_dto_shriramfin.json`

### 9. [High] Remove committed root session data \_scratch_dto_tcs.json

- **Category:** Committed Stray Artifact
- **Target File:** [`_scratch_dto_tcs.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_dto_tcs.json)
- **Details:** File '\_scratch_dto_tcs.json' is a scratch JSON/HTML payload left at the repository root. Per clean code standards, remove or relocate into data/runs/ or data/assets/.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached _scratch_dto_tcs.json`

### 10. [High] Remove committed root session data \_scratch_render.html

- **Category:** Committed Stray Artifact
- **Target File:** [`_scratch_render.html`](file:///Users/darshanpatel/code/stockmarket/_scratch_render.html)
- **Details:** File '\_scratch_render.html' is a scratch JSON/HTML payload left at the repository root. Per clean code standards, remove or relocate into data/runs/ or data/assets/.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached _scratch_render.html`

### 11. [High] Remove committed root session data \_scratch_research_dtos.json

- **Category:** Committed Stray Artifact
- **Target File:** [`_scratch_research_dtos.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_research_dtos.json)
- **Details:** File '\_scratch_research_dtos.json' is a scratch JSON/HTML payload left at the repository root. Per clean code standards, remove or relocate into data/runs/ or data/assets/.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached _scratch_research_dtos.json`

### 12. [High] Remove committed root session data \_scratch_stats.json

- **Category:** Committed Stray Artifact
- **Target File:** [`_scratch_stats.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_stats.json)
- **Details:** File '\_scratch_stats.json' is a scratch JSON/HTML payload left at the repository root. Per clean code standards, remove or relocate into data/runs/ or data/assets/.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached _scratch_stats.json`

### 13. [High] Remove committed root session data \_scratch_urls.json

- **Category:** Committed Stray Artifact
- **Target File:** [`_scratch_urls.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_urls.json)
- **Details:** File '\_scratch_urls.json' is a scratch JSON/HTML payload left at the repository root. Per clean code standards, remove or relocate into data/runs/ or data/assets/.
- **Recommended Action:** `[REMOVE FROM GIT] git rm --cached _scratch_urls.json`

### 14. [High] Investigate unreferenced folder packages/jobs-runtime/\_to_delete/ (5 files, all unreferenced)

- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/_to_delete`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/_to_delete)
- **Details:** Every file that exists under packages/jobs-runtime/\_to_delete/ (recursively, 5 total) is unreachable from any entry root. Representative reason: all 5 files under this folder are unreferenced. Full file list: packages/jobs-runtime/\_to_delete/\_pcsi_targeted_push_20261014.js, packages/jobs-runtime/\_to_delete/\_pcsi_targeted_push_20261014_1915.js, packages/jobs-runtime/\_to_delete/\_tmp_push2.js, packages/jobs-runtime/\_to_delete/\_tmp_pushChanged.js, packages/jobs-runtime/\_to_delete/probe_listing_tmp.js
- **Recommended Action:** `[DELETE] packages/jobs-runtime/_to_delete/`

### 15. [High] Investigate unreferenced source file .pcsi_batch_scratch.js

- **Category:** Unused File
- **Target File:** [`.pcsi_batch_scratch.js`](file:///Users/darshanpatel/code/stockmarket/.pcsi_batch_scratch.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] .pcsi_batch_scratch.js`

### 16. [High] Investigate unreferenced source file .pcsi_infoclass_scratch.js

- **Category:** Unused File
- **Target File:** [`.pcsi_infoclass_scratch.js`](file:///Users/darshanpatel/code/stockmarket/.pcsi_infoclass_scratch.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] .pcsi_infoclass_scratch.js`

### 17. [High] Investigate unreferenced source file \_scratch_check_extracts.js

- **Category:** Unused File
- **Target File:** [`_scratch_check_extracts.js`](file:///Users/darshanpatel/code/stockmarket/_scratch_check_extracts.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _scratch_check_extracts.js`

### 18. [High] Investigate unreferenced source file \_scratch_claude_save_research_dtos.js

- **Category:** Unused File
- **Target File:** [`_scratch_claude_save_research_dtos.js`](file:///Users/darshanpatel/code/stockmarket/_scratch_claude_save_research_dtos.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _scratch_claude_save_research_dtos.js`

### 19. [High] Investigate unreferenced source file \_scratch_ctx.js

- **Category:** Unused File
- **Target File:** [`_scratch_ctx.js`](file:///Users/darshanpatel/code/stockmarket/_scratch_ctx.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _scratch_ctx.js`

### 20. [High] Investigate unreferenced source file \_scratch_listdocs.js

- **Category:** Unused File
- **Target File:** [`_scratch_listdocs.js`](file:///Users/darshanpatel/code/stockmarket/_scratch_listdocs.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _scratch_listdocs.js`

### 21. [High] Investigate unreferenced source file \_scratch_put_briefs.js

- **Category:** Unused File
- **Target File:** [`_scratch_put_briefs.js`](file:///Users/darshanpatel/code/stockmarket/_scratch_put_briefs.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _scratch_put_briefs.js`

### 22. [High] Investigate unreferenced source file \_scratch_put_filings.js

- **Category:** Unused File
- **Target File:** [`_scratch_put_filings.js`](file:///Users/darshanpatel/code/stockmarket/_scratch_put_filings.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _scratch_put_filings.js`

### 23. [High] Investigate unreferenced source file \_scratch_s3url.js

- **Category:** Unused File
- **Target File:** [`_scratch_s3url.js`](file:///Users/darshanpatel/code/stockmarket/_scratch_s3url.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _scratch_s3url.js`

### 24. [High] Investigate unreferenced source file \_scratch_save_full_reports.js

- **Category:** Unused File
- **Target File:** [`_scratch_save_full_reports.js`](file:///Users/darshanpatel/code/stockmarket/_scratch_save_full_reports.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _scratch_save_full_reports.js`

### 25. [High] Investigate unreferenced source file \_scratch_save_research.js

- **Category:** Unused File
- **Target File:** [`_scratch_save_research.js`](file:///Users/darshanpatel/code/stockmarket/_scratch_save_research.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _scratch_save_research.js`

### 26. [High] Investigate unreferenced source file batch-read.js

- **Category:** Unused File
- **Target File:** [`cache/runs/adhoc-20261011/batch-read.js`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/batch-read.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261011/batch-read.js`

### 27. [High] Investigate unreferenced source file resolve-order-bases.js

- **Category:** Unused File
- **Target File:** [`cache/runs/adhoc-20261011/resolve-order-bases.js`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/resolve-order-bases.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261011/resolve-order-bases.js`

### 28. [High] Investigate unreferenced source file route-remaining.js

- **Category:** Unused File
- **Target File:** [`cache/runs/adhoc-20261011/route-remaining.js`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/route-remaining.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261011/route-remaining.js`

### 29. [High] Investigate unreferenced source file write-notes.js

- **Category:** Unused File
- **Target File:** [`cache/runs/adhoc-20261011/write-notes.js`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/write-notes.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261011/write-notes.js`

### 30. [High] Investigate unreferenced source file batch-read.js

- **Category:** Unused File
- **Target File:** [`cache/runs/adhoc-20261013/batch-read.js`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/batch-read.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261013/batch-read.js`

### 31. [High] Investigate unreferenced source file batch-read2.js

- **Category:** Unused File
- **Target File:** [`cache/runs/adhoc-20261013/batch-read2.js`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/batch-read2.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261013/batch-read2.js`

### 32. [High] Investigate unreferenced source file write-notes.js

- **Category:** Unused File
- **Target File:** [`cache/runs/adhoc-20261013/write-notes.js`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/write-notes.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261013/write-notes.js`

### 33. [High] Investigate unreferenced source file batch-read.js

- **Category:** Unused File
- **Target File:** [`cache/runs/post-close-20261015-1915/batch-read.js`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/batch-read.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] cache/runs/post-close-20261015-1915/batch-read.js`

### 34. [High] Investigate unreferenced source file write-notes-batch1.js

- **Category:** Unused File
- **Target File:** [`cache/runs/post-close-20261015-1915/write-notes-batch1.js`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/write-notes-batch1.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] cache/runs/post-close-20261015-1915/write-notes-batch1.js`

### 35. [High] Investigate unreferenced source file write-notes-batch2.js

- **Category:** Unused File
- **Target File:** [`cache/runs/post-close-20261015-1915/write-notes-batch2.js`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/write-notes-batch2.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] cache/runs/post-close-20261015-1915/write-notes-batch2.js`

### 36. [High] Investigate unreferenced source file write-notes-batch3.js

- **Category:** Unused File
- **Target File:** [`cache/runs/post-close-20261015-1915/write-notes-batch3.js`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/write-notes-batch3.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] cache/runs/post-close-20261015-1915/write-notes-batch3.js`

### 37. [High] Investigate unreferenced source file write-notes-batch4.js

- **Category:** Unused File
- **Target File:** [`cache/runs/post-close-20261015-1915/write-notes-batch4.js`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/write-notes-batch4.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] cache/runs/post-close-20261015-1915/write-notes-batch4.js`

### 38. [High] Investigate unreferenced source file write-notes-batch5.js

- **Category:** Unused File
- **Target File:** [`cache/runs/post-close-20261015-1915/write-notes-batch5.js`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/write-notes-batch5.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] cache/runs/post-close-20261015-1915/write-notes-batch5.js`

### 39. [High] Investigate unreferenced source file write-notes-batch6.js

- **Category:** Unused File
- **Target File:** [`cache/runs/post-close-20261015-1915/write-notes-batch6.js`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/write-notes-batch6.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] cache/runs/post-close-20261015-1915/write-notes-batch6.js`

### 40. [High] Investigate unreferenced source file write-notes-batch7.js

- **Category:** Unused File
- **Target File:** [`cache/runs/post-close-20261015-1915/write-notes-batch7.js`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/write-notes-batch7.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] cache/runs/post-close-20261015-1915/write-notes-batch7.js`

### 41. [High] Investigate unreferenced source file bt.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/bt.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/bt.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/bt.py`

### 42. [High] Investigate unreferenced source file cand.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/cand.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/cand.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/cand.py`

### 43. [High] Investigate unreferenced source file case.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/case.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/case.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/case.py`

### 44. [High] Investigate unreferenced source file dl.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/dl.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/dl.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/dl.py`

### 45. [High] Investigate unreferenced source file dl_deliv.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/dl_deliv.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/dl_deliv.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/dl_deliv.py`

### 46. [High] Investigate unreferenced source file dl_ohlc.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/dl_ohlc.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/dl_ohlc.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/dl_ohlc.py`

### 47. [High] Investigate unreferenced source file feat.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/feat.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/feat.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/feat.py`

### 48. [High] Investigate unreferenced source file feat2.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/feat2.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/feat2.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/feat2.py`

### 49. [High] Investigate unreferenced source file uni.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/uni.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/uni.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/uni.py`

### 50. [High] Investigate unreferenced source file uni2.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/uni2.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/uni2.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/uni2.py`

### 51. [High] Investigate unreferenced source file uni3.py

- **Category:** Unused File
- **Target File:** [`docs/mtf-flush-signal/uni3.py`](file:///Users/darshanpatel/code/stockmarket/docs/mtf-flush-signal/uni3.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] docs/mtf-flush-signal/uni3.py`

### 52. [High] Investigate unreferenced source file \_m.js

- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/_m.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/_m.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/_m.js`

### 53. [High] Investigate unreferenced source file \_nb.js

- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/_nb.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/_nb.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/_nb.js`

### 54. [High] Investigate unreferenced source file capture.js

- **Category:** Unused File
- **Target File:** [`tools/x-timeline-capture/capture.js`](file:///Users/darshanpatel/code/stockmarket/tools/x-timeline-capture/capture.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tools/x-timeline-capture/capture.js`

### 55. [Low] Investigate unreferenced file empty.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_run/empty.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_run/empty.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_run/empty.json — confirm unused, then delete or relocate`

### 56. [Low] Investigate unreferenced file routine-items.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_run/routine-items.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_run/routine-items.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_run/routine-items.json — confirm unused, then delete or relocate`

### 57. [Low] Investigate unreferenced file send-digest.err

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_run/send-digest.err`](file:///Users/darshanpatel/code/stockmarket/.pcsi_run/send-digest.err)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_run/send-digest.err — confirm unused, then delete or relocate`

### 58. [Low] Investigate unreferenced file send-digest.out

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_run/send-digest.out`](file:///Users/darshanpatel/code/stockmarket/.pcsi_run/send-digest.out)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_run/send-digest.out — confirm unused, then delete or relocate`

### 59. [Low] Investigate unreferenced file stats.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`.pcsi_run/stats.json`](file:///Users/darshanpatel/code/stockmarket/.pcsi_run/stats.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] .pcsi_run/stats.json — confirm unused, then delete or relocate`

### 60. [Low] Investigate unreferenced file Forward_Guidance_20261011.xlsx

- **Category:** Unreferenced Non-Code File
- **Target File:** [`Forward_Guidance_20261011.xlsx`](file:///Users/darshanpatel/code/stockmarket/Forward_Guidance_20261011.xlsx)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] Forward_Guidance_20261011.xlsx — confirm unused, then delete or relocate`

### 61. [Low] Investigate unreferenced file Forward_Guidance_20261012.xlsx

- **Category:** Unreferenced Non-Code File
- **Target File:** [`Forward_Guidance_20261012.xlsx`](file:///Users/darshanpatel/code/stockmarket/Forward_Guidance_20261012.xlsx)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] Forward_Guidance_20261012.xlsx — confirm unused, then delete or relocate`

### 62. [Low] Investigate unreferenced file Forward_Guidance_20261014.xlsx

- **Category:** Unreferenced Non-Code File
- **Target File:** [`Forward_Guidance_20261014.xlsx`](file:///Users/darshanpatel/code/stockmarket/Forward_Guidance_20261014.xlsx)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] Forward_Guidance_20261014.xlsx — confirm unused, then delete or relocate`

### 63. [Low] Investigate unreferenced file PEAD_Ranking_Upcoming_Results_20261014.xlsx

- **Category:** Unreferenced Non-Code File
- **Target File:** [`PEAD_Ranking_Upcoming_Results_20261014.xlsx`](file:///Users/darshanpatel/code/stockmarket/PEAD_Ranking_Upcoming_Results_20261014.xlsx)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] PEAD_Ranking_Upcoming_Results_20261014.xlsx — confirm unused, then delete or relocate`

### 64. [Low] Investigate unreferenced file \_scratch_briefs.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`_scratch_briefs.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_briefs.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _scratch_briefs.json — confirm unused, then delete or relocate`

### 65. [Low] Investigate unreferenced file \_scratch_claude_content.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`_scratch_claude_content.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_claude_content.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _scratch_claude_content.json — confirm unused, then delete or relocate`

### 66. [Low] Investigate unreferenced file \_scratch_claude_render.html

- **Category:** Unreferenced Non-Code File
- **Target File:** [`_scratch_claude_render.html`](file:///Users/darshanpatel/code/stockmarket/_scratch_claude_render.html)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _scratch_claude_render.html — confirm unused, then delete or relocate`

### 67. [Low] Investigate unreferenced file \_scratch_claude_stats.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`_scratch_claude_stats.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_claude_stats.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _scratch_claude_stats.json — confirm unused, then delete or relocate`

### 68. [Low] Investigate unreferenced file \_scratch_content.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`_scratch_content.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_content.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _scratch_content.json — confirm unused, then delete or relocate`

### 69. [Low] Investigate unreferenced file \_scratch_dto_hcltech.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`_scratch_dto_hcltech.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_dto_hcltech.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _scratch_dto_hcltech.json — confirm unused, then delete or relocate`

### 70. [Low] Investigate unreferenced file \_scratch_dto_shriramfin.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`_scratch_dto_shriramfin.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_dto_shriramfin.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _scratch_dto_shriramfin.json — confirm unused, then delete or relocate`

### 71. [Low] Investigate unreferenced file \_scratch_dto_tcs.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`_scratch_dto_tcs.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_dto_tcs.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _scratch_dto_tcs.json — confirm unused, then delete or relocate`

### 72. [Low] Investigate unreferenced file \_scratch_render.html

- **Category:** Unreferenced Non-Code File
- **Target File:** [`_scratch_render.html`](file:///Users/darshanpatel/code/stockmarket/_scratch_render.html)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _scratch_render.html — confirm unused, then delete or relocate`

### 73. [Low] Investigate unreferenced file \_scratch_research_dtos.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`_scratch_research_dtos.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_research_dtos.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _scratch_research_dtos.json — confirm unused, then delete or relocate`

### 74. [Low] Investigate unreferenced file \_scratch_stats.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`_scratch_stats.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_stats.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _scratch_stats.json — confirm unused, then delete or relocate`

### 75. [Low] Investigate unreferenced file \_scratch_urls.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`_scratch_urls.json`](file:///Users/darshanpatel/code/stockmarket/_scratch_urls.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _scratch_urls.json — confirm unused, then delete or relocate`

### 76. [Low] Investigate unreferenced file digest_preview.html

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/digest_preview.html`](file:///Users/darshanpatel/code/stockmarket/cache/digest_preview.html)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/digest_preview.html — confirm unused, then delete or relocate`

### 77. [Low] Investigate unreferenced file batch-read.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/batch-read.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/batch-read.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/batch-read.stderr.log — confirm unused, then delete or relocate`

### 78. [Low] Investigate unreferenced file batch-read.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/batch-read.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/batch-read.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/batch-read.stdout.log — confirm unused, then delete or relocate`

### 79. [Low] Investigate unreferenced file categorise-output.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/categorise-output.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/categorise-output.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/categorise-output.json — confirm unused, then delete or relocate`

### 80. [Low] Investigate unreferenced file categorise.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/categorise.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/categorise.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/categorise.stderr.log — confirm unused, then delete or relocate`

### 81. [Low] Investigate unreferenced file commit-window.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/commit-window.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/commit-window.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/commit-window.stderr.log — confirm unused, then delete or relocate`

### 82. [Low] Investigate unreferenced file commit-window.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/commit-window.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/commit-window.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/commit-window.stdout.log — confirm unused, then delete or relocate`

### 83. [Low] Investigate unreferenced file data-push-bg.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/data-push-bg.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/data-push-bg.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261011/data-push-bg.log — 0-byte file is always considered dead`

### 84. [Low] Investigate unreferenced file data-push.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/data-push.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/data-push.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261011/data-push.stderr.log — 0-byte file is always considered dead`

### 85. [Low] Investigate unreferenced file data-push.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/data-push.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/data-push.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261011/data-push.stdout.log — 0-byte file is always considered dead`

### 86. [Low] Investigate unreferenced file data-push2.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/data-push2.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/data-push2.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261011/data-push2.stderr.log — 0-byte file is always considered dead`

### 87. [Low] Investigate unreferenced file data-push2.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/data-push2.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/data-push2.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261011/data-push2.stdout.log — 0-byte file is always considered dead`

### 88. [Low] Investigate unreferenced file data-push3.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/data-push3.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/data-push3.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261011/data-push3.stderr.log — 0-byte file is always considered dead`

### 89. [Low] Investigate unreferenced file data-push3.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/data-push3.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/data-push3.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261011/data-push3.stdout.log — 0-byte file is always considered dead`

### 90. [Low] Investigate unreferenced file data-push4.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/data-push4.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/data-push4.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261011/data-push4.log — 0-byte file is always considered dead`

### 91. [Low] Investigate unreferenced file deep-dive.txt

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/deep-dive.txt`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/deep-dive.txt)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/deep-dive.txt — confirm unused, then delete or relocate`

### 92. [Low] Investigate unreferenced file enrich-orders.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/enrich-orders.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/enrich-orders.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/enrich-orders.stderr.log — confirm unused, then delete or relocate`

### 93. [Low] Investigate unreferenced file enrich-orders2.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/enrich-orders2.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/enrich-orders2.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/enrich-orders2.stderr.log — confirm unused, then delete or relocate`

### 94. [Low] Investigate unreferenced file enrich-orders3.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/enrich-orders3.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/enrich-orders3.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/enrich-orders3.stderr.log — confirm unused, then delete or relocate`

### 95. [Low] Investigate unreferenced file enrich-orders4.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/enrich-orders4.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/enrich-orders4.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/enrich-orders4.stderr.log — confirm unused, then delete or relocate`

### 96. [Low] Investigate unreferenced file enrich-orders5.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/enrich-orders5.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/enrich-orders5.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/enrich-orders5.stderr.log — confirm unused, then delete or relocate`

### 97. [Low] Investigate unreferenced file fetch-scan-output.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/fetch-scan-output.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/fetch-scan-output.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/fetch-scan-output.json — confirm unused, then delete or relocate`

### 98. [Low] Investigate unreferenced file fetch-scan.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/fetch-scan.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/fetch-scan.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/fetch-scan.stderr.log — confirm unused, then delete or relocate`

### 99. [Low] Investigate unreferenced file filter-noise-output.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/filter-noise-output.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/filter-noise-output.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/filter-noise-output.json — confirm unused, then delete or relocate`

### 100. [Low] Investigate unreferenced file filter-noise.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/filter-noise.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/filter-noise.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/filter-noise.stderr.log — confirm unused, then delete or relocate`

### 101. [Low] Investigate unreferenced file insights-array.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/insights-array.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/insights-array.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/insights-array.json — confirm unused, then delete or relocate`

### 102. [Low] Investigate unreferenced file insights-enriched.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/insights-enriched.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/insights-enriched.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/insights-enriched.json — confirm unused, then delete or relocate`

### 103. [Low] Investigate unreferenced file insights-enriched2.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/insights-enriched2.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/insights-enriched2.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/insights-enriched2.json — confirm unused, then delete or relocate`

### 104. [Low] Investigate unreferenced file insights-enriched3.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/insights-enriched3.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/insights-enriched3.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/insights-enriched3.json — confirm unused, then delete or relocate`

### 105. [Low] Investigate unreferenced file item-summary.txt

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/item-summary.txt`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/item-summary.txt)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/item-summary.txt — confirm unused, then delete or relocate`

### 106. [Low] Investigate unreferenced file knowledge-gaps.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/knowledge-gaps.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/knowledge-gaps.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/knowledge-gaps.json — confirm unused, then delete or relocate`

### 107. [Low] Investigate unreferenced file pdf-texts.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/pdf-texts.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/pdf-texts.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/pdf-texts.json — confirm unused, then delete or relocate`

### 108. [Low] Investigate unreferenced file pdf-urls.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/pdf-urls.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/pdf-urls.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/pdf-urls.json — confirm unused, then delete or relocate`

### 109. [Low] Investigate unreferenced file prefetch.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/prefetch.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/prefetch.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/prefetch.log — confirm unused, then delete or relocate`

### 110. [Low] Investigate unreferenced file route-remaining.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/route-remaining.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/route-remaining.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261011/route-remaining.stderr.log — 0-byte file is always considered dead`

### 111. [Low] Investigate unreferenced file route-remaining.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/route-remaining.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/route-remaining.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/route-remaining.stdout.log — confirm unused, then delete or relocate`

### 112. [Low] Investigate unreferenced file routine-items.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/routine-items.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/routine-items.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/routine-items.json — confirm unused, then delete or relocate`

### 113. [Low] Investigate unreferenced file send-digest.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/send-digest.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/send-digest.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/send-digest.stderr.log — confirm unused, then delete or relocate`

### 114. [Low] Investigate unreferenced file send-digest.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/send-digest.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/send-digest.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/send-digest.stdout.log — confirm unused, then delete or relocate`

### 115. [Low] Investigate unreferenced file stats.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/stats.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/stats.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/stats.json — confirm unused, then delete or relocate`

### 116. [Low] Investigate unreferenced file texts-preview.txt

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/texts-preview.txt`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/texts-preview.txt)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/texts-preview.txt — confirm unused, then delete or relocate`

### 117. [Low] Investigate unreferenced file write-notes.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/write-notes.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/write-notes.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/write-notes.stderr.log — confirm unused, then delete or relocate`

### 118. [Low] Investigate unreferenced file write-notes.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261011/write-notes.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261011/write-notes.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261011/write-notes.stdout.log — confirm unused, then delete or relocate`

### 119. [Low] Investigate unreferenced file batch-read.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/batch-read.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/batch-read.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/batch-read.stderr.log — confirm unused, then delete or relocate`

### 120. [Low] Investigate unreferenced file batch-read.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/batch-read.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/batch-read.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261013/batch-read.stdout.log — 0-byte file is always considered dead`

### 121. [Low] Investigate unreferenced file batch-read2.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/batch-read2.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/batch-read2.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/batch-read2.stderr.log — confirm unused, then delete or relocate`

### 122. [Low] Investigate unreferenced file batch-read2.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/batch-read2.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/batch-read2.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261013/batch-read2.stdout.log — 0-byte file is always considered dead`

### 123. [Low] Investigate unreferenced file categorise-output.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/categorise-output.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/categorise-output.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/categorise-output.json — confirm unused, then delete or relocate`

### 124. [Low] Investigate unreferenced file commit-window.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/commit-window.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/commit-window.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/commit-window.stderr.log — confirm unused, then delete or relocate`

### 125. [Low] Investigate unreferenced file commit-window.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/commit-window.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/commit-window.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/commit-window.stdout.log — confirm unused, then delete or relocate`

### 126. [Low] Investigate unreferenced file data-push.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/data-push.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/data-push.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261013/data-push.stderr.log — 0-byte file is always considered dead`

### 127. [Low] Investigate unreferenced file data-push.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/data-push.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/data-push.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261013/data-push.stdout.log — 0-byte file is always considered dead`

### 128. [Low] Investigate unreferenced file data-push2.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/data-push2.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/data-push2.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261013/data-push2.stderr.log — 0-byte file is always considered dead`

### 129. [Low] Investigate unreferenced file data-push2.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/data-push2.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/data-push2.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261013/data-push2.stdout.log — 0-byte file is always considered dead`

### 130. [Low] Investigate unreferenced file data-push3.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/data-push3.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/data-push3.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261013/data-push3.stderr.log — 0-byte file is always considered dead`

### 131. [Low] Investigate unreferenced file data-push3.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/data-push3.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/data-push3.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261013/data-push3.stdout.log — 0-byte file is always considered dead`

### 132. [Low] Investigate unreferenced file data-push4.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/data-push4.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/data-push4.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] cache/runs/adhoc-20261013/data-push4.log — 0-byte file is always considered dead`

### 133. [Low] Investigate unreferenced file deep1.txt

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/deep1.txt`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/deep1.txt)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/deep1.txt — confirm unused, then delete or relocate`

### 134. [Low] Investigate unreferenced file deep2.txt

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/deep2.txt`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/deep2.txt)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/deep2.txt — confirm unused, then delete or relocate`

### 135. [Low] Investigate unreferenced file fetch-scan-output.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/fetch-scan-output.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/fetch-scan-output.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/fetch-scan-output.json — confirm unused, then delete or relocate`

### 136. [Low] Investigate unreferenced file filter-noise-output.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/filter-noise-output.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/filter-noise-output.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/filter-noise-output.json — confirm unused, then delete or relocate`

### 137. [Low] Investigate unreferenced file insights-array.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/insights-array.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/insights-array.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/insights-array.json — confirm unused, then delete or relocate`

### 138. [Low] Investigate unreferenced file knowledge-gaps.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/knowledge-gaps.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/knowledge-gaps.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/knowledge-gaps.json — confirm unused, then delete or relocate`

### 139. [Low] Investigate unreferenced file pdf-texts.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/pdf-texts.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/pdf-texts.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/pdf-texts.json — confirm unused, then delete or relocate`

### 140. [Low] Investigate unreferenced file pdf-urls.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/pdf-urls.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/pdf-urls.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/pdf-urls.json — confirm unused, then delete or relocate`

### 141. [Low] Investigate unreferenced file remaining-routine.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/remaining-routine.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/remaining-routine.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/remaining-routine.json — confirm unused, then delete or relocate`

### 142. [Low] Investigate unreferenced file routine-items.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/routine-items.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/routine-items.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/routine-items.json — confirm unused, then delete or relocate`

### 143. [Low] Investigate unreferenced file send-digest.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/send-digest.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/send-digest.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/send-digest.stderr.log — confirm unused, then delete or relocate`

### 144. [Low] Investigate unreferenced file send-digest.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/send-digest.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/send-digest.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/send-digest.stdout.log — confirm unused, then delete or relocate`

### 145. [Low] Investigate unreferenced file stats.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/stats.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/stats.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/stats.json — confirm unused, then delete or relocate`

### 146. [Low] Investigate unreferenced file texts-preview.txt

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/texts-preview.txt`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/texts-preview.txt)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/texts-preview.txt — confirm unused, then delete or relocate`

### 147. [Low] Investigate unreferenced file write-notes-results.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/write-notes-results.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/write-notes-results.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/write-notes-results.json — confirm unused, then delete or relocate`

### 148. [Low] Investigate unreferenced file write-notes.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/write-notes.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/write-notes.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/write-notes.stderr.log — confirm unused, then delete or relocate`

### 149. [Low] Investigate unreferenced file write-notes.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/adhoc-20261013/write-notes.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/adhoc-20261013/write-notes.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/adhoc-20261013/write-notes.stdout.log — confirm unused, then delete or relocate`

### 150. [Low] Investigate unreferenced file batch-read.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/batch-read.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/batch-read.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/batch-read.stderr.log — confirm unused, then delete or relocate`

### 151. [Low] Investigate unreferenced file batch-read.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/batch-read.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/batch-read.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/batch-read.stdout.log — confirm unused, then delete or relocate`

### 152. [Low] Investigate unreferenced file batch_1.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/batch_1.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/batch_1.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/batch_1.json — confirm unused, then delete or relocate`

### 153. [Low] Investigate unreferenced file batch_2.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/batch_2.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/batch_2.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/batch_2.json — confirm unused, then delete or relocate`

### 154. [Low] Investigate unreferenced file batch_3.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/batch_3.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/batch_3.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/batch_3.json — confirm unused, then delete or relocate`

### 155. [Low] Investigate unreferenced file batch_4.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/batch_4.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/batch_4.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/batch_4.json — confirm unused, then delete or relocate`

### 156. [Low] Investigate unreferenced file batch_5.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/batch_5.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/batch_5.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/batch_5.json — confirm unused, then delete or relocate`

### 157. [Low] Investigate unreferenced file batch_6.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/batch_6.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/batch_6.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/batch_6.json — confirm unused, then delete or relocate`

### 158. [Low] Investigate unreferenced file batch_7.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/batch_7.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/batch_7.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/batch_7.json — confirm unused, then delete or relocate`

### 159. [Low] Investigate unreferenced file categorise-output.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/categorise-output.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/categorise-output.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/categorise-output.json — confirm unused, then delete or relocate`

### 160. [Low] Investigate unreferenced file categorise.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/categorise.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/categorise.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/categorise.stderr.log — confirm unused, then delete or relocate`

### 161. [Low] Investigate unreferenced file commit-window.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/commit-window.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/commit-window.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/commit-window.stderr.log — confirm unused, then delete or relocate`

### 162. [Low] Investigate unreferenced file commit-window.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/commit-window.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/commit-window.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/commit-window.stdout.log — confirm unused, then delete or relocate`

### 163. [Low] Investigate unreferenced file dup-items.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/dup-items.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/dup-items.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/dup-items.json — confirm unused, then delete or relocate`

### 164. [Low] Investigate unreferenced file dup-mark-processed-results.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/dup-mark-processed-results.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/dup-mark-processed-results.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/dup-mark-processed-results.json — confirm unused, then delete or relocate`

### 165. [Low] Investigate unreferenced file fetch-scan-output.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/fetch-scan-output.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/fetch-scan-output.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/fetch-scan-output.json — confirm unused, then delete or relocate`

### 166. [Low] Investigate unreferenced file fetch-scan.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/fetch-scan.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/fetch-scan.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/fetch-scan.stderr.log — confirm unused, then delete or relocate`

### 167. [Low] Investigate unreferenced file filter-noise-output.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/filter-noise-output.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/filter-noise-output.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/filter-noise-output.json — confirm unused, then delete or relocate`

### 168. [Low] Investigate unreferenced file filter-noise.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/filter-noise.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/filter-noise.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/filter-noise.stderr.log — confirm unused, then delete or relocate`

### 169. [Low] Investigate unreferenced file heavy-items.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/heavy-items.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/heavy-items.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/heavy-items.json — confirm unused, then delete or relocate`

### 170. [Low] Investigate unreferenced file heavy-skip-results.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/heavy-skip-results.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/heavy-skip-results.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/heavy-skip-results.json — confirm unused, then delete or relocate`

### 171. [Low] Investigate unreferenced file insights-array.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/insights-array.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/insights-array.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/insights-array.json — confirm unused, then delete or relocate`

### 172. [Low] Investigate unreferenced file pdf-texts.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/pdf-texts.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/pdf-texts.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/pdf-texts.json — confirm unused, then delete or relocate`

### 173. [Low] Investigate unreferenced file pdf-urls.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/pdf-urls.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/pdf-urls.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/pdf-urls.json — confirm unused, then delete or relocate`

### 174. [Low] Investigate unreferenced file prefetch.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/prefetch.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/prefetch.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/prefetch.log — confirm unused, then delete or relocate`

### 175. [Low] Investigate unreferenced file remaining-items.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/remaining-items.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/remaining-items.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/remaining-items.json — confirm unused, then delete or relocate`

### 176. [Low] Investigate unreferenced file resolve-scan.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/resolve-scan.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/resolve-scan.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/resolve-scan.json — confirm unused, then delete or relocate`

### 177. [Low] Investigate unreferenced file resolve-scan.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/resolve-scan.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/resolve-scan.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/resolve-scan.stderr.log — confirm unused, then delete or relocate`

### 178. [Low] Investigate unreferenced file routine-items.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/routine-items.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/routine-items.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/routine-items.json — confirm unused, then delete or relocate`

### 179. [Low] Investigate unreferenced file send-digest.stderr.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/send-digest.stderr.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/send-digest.stderr.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/send-digest.stderr.log — confirm unused, then delete or relocate`

### 180. [Low] Investigate unreferenced file send-digest.stdout.log

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/send-digest.stdout.log`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/send-digest.stdout.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/send-digest.stdout.log — confirm unused, then delete or relocate`

### 181. [Low] Investigate unreferenced file stats.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`cache/runs/post-close-20261015-1915/stats.json`](file:///Users/darshanpatel/code/stockmarket/cache/runs/post-close-20261015-1915/stats.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] cache/runs/post-close-20261015-1915/stats.json — confirm unused, then delete or relocate`

### 182. [Low] Investigate unreferenced file \_pe_tmp.json

- **Category:** Unreferenced Non-Code File
- **Target File:** [`packages/jobs-runtime/_pe_tmp.json`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/_pe_tmp.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] packages/jobs-runtime/_pe_tmp.json — confirm unused, then delete or relocate`

### 183. [Low] Investigate unreferenced file \_unm.js.todelete

- **Category:** Unreferenced Non-Code File
- **Target File:** [`scripts/pdf-corpus/_unm.js.todelete`](file:///Users/darshanpatel/code/stockmarket/scripts/pdf-corpus/_unm.js.todelete)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] scripts/pdf-corpus/_unm.js.todelete — confirm unused, then delete or relocate`

### 184. [Low] Investigate unreferenced file NSE_KANOHAR_DRHP_2026-01-23.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_KANOHAR_DRHP_2026-01-23.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_KANOHAR_DRHP_2026-01-23.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_KANOHAR_DRHP_2026-01-23.pdf — confirm unused, then delete or relocate`

### 185. [Low] Investigate unreferenced file NSE_KANOHAR_PPT_202609.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_KANOHAR_PPT_202609.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_KANOHAR_PPT_202609.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_KANOHAR_PPT_202609.pdf — confirm unused, then delete or relocate`

### 186. [Low] Investigate unreferenced file NSE_KANOHAR_Result_202609.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_KANOHAR_Result_202609.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_KANOHAR_Result_202609.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_KANOHAR_Result_202609.pdf — confirm unused, then delete or relocate`

### 187. [Low] Investigate unreferenced file NSE_MRPL_Result_202506.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Result_202506.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Result_202506.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Result_202506.pdf — confirm unused, then delete or relocate`

### 188. [Low] Investigate unreferenced file NSE_MRPL_Result_202509.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Result_202509.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Result_202509.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Result_202509.pdf — confirm unused, then delete or relocate`

### 189. [Low] Investigate unreferenced file NSE_MRPL_Result_202512.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Result_202512.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Result_202512.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Result_202512.pdf — confirm unused, then delete or relocate`

### 190. [Low] Investigate unreferenced file NSE_MRPL_Result_202603.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Result_202603.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Result_202603.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Result_202603.pdf — confirm unused, then delete or relocate`

### 191. [Low] Investigate unreferenced file NSE_MRPL_Result_202606.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Result_202606.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Result_202606.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Result_202606.pdf — confirm unused, then delete or relocate`

### 192. [Low] Investigate unreferenced file NSE_MRPL_Transcript_202403.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Transcript_202403.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Transcript_202403.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Transcript_202403.pdf — confirm unused, then delete or relocate`

### 193. [Low] Investigate unreferenced file NSE_MRPL_Transcript_202503.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Transcript_202503.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Transcript_202503.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Transcript_202503.pdf — confirm unused, then delete or relocate`

### 194. [Low] Investigate unreferenced file NSE_MRPL_Transcript_202506.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Transcript_202506.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Transcript_202506.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Transcript_202506.pdf — confirm unused, then delete or relocate`

### 195. [Low] Investigate unreferenced file NSE_MRPL_Transcript_202509.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Transcript_202509.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Transcript_202509.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Transcript_202509.pdf — confirm unused, then delete or relocate`

### 196. [Low] Investigate unreferenced file NSE_MRPL_Transcript_202512.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_MRPL_Transcript_202512.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_MRPL_Transcript_202512.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_MRPL_Transcript_202512.pdf — confirm unused, then delete or relocate`

### 197. [Low] Investigate unreferenced file NSE_SUPRIYA_PPT_202603.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_SUPRIYA_PPT_202603.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_SUPRIYA_PPT_202603.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_SUPRIYA_PPT_202603.pdf — confirm unused, then delete or relocate`

### 198. [Low] Investigate unreferenced file NSE_SUPRIYA_PPT_202606.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_SUPRIYA_PPT_202606.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_SUPRIYA_PPT_202606.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_SUPRIYA_PPT_202606.pdf — confirm unused, then delete or relocate`

### 199. [Low] Investigate unreferenced file NSE_SUPRIYA_Result_202606.pdf

- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_SUPRIYA_Result_202606.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_SUPRIYA_Result_202606.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_SUPRIYA_Result_202606.pdf — confirm unused, then delete or relocate`

### 200. [Medium] Verify data/\_push_log.txt is actually orphaned

- **Category:** Data Directory Hanging Node
- **Target File:** [`data/_push_log.txt`](file:///Users/darshanpatel/code/stockmarket/data/_push_log.txt)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('\_push_log.txt'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[DELETE] data/_push_log.txt — 0-byte file is always considered dead`

### 201. [Medium] Verify data/scratch is actually orphaned

- **Category:** Data Directory Hanging Node
- **Target File:** [`data/scratch`](file:///Users/darshanpatel/code/stockmarket/data/scratch)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('scratch'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[VERIFY] data/scratch — no data-layer code references this collection name`

### 202. [Medium] Verify data/stockmarket.db is actually orphaned

- **Category:** Data Directory Hanging Node
- **Target File:** [`data/stockmarket.db`](file:///Users/darshanpatel/code/stockmarket/data/stockmarket.db)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('stockmarket.db'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[DELETE] data/stockmarket.db — 0-byte file is always considered dead`

### 203. [Medium] Verify data/tmp_save_gainers_reports.js is actually orphaned

- **Category:** Data Directory Hanging Node
- **Target File:** [`data/tmp_save_gainers_reports.js`](file:///Users/darshanpatel/code/stockmarket/data/tmp_save_gainers_reports.js)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('tmp_save_gainers_reports.js'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[DELETE] data/tmp_save_gainers_reports.js — files starting with tmp_* are always considered dead`
