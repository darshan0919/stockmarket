# Dead Code & Coding Practice Action Items

> **Last Updated:** 2026-09-23T06:36:01.419Z
> **Status:** Automated Scan Completed
> **Active Action Items:** 16

---

## 📊 Summary Breakdown

| Category | Flagged Items | Priority |
| :--- | :---: | :---: |
| **Unused File** | 11 | High/Medium |
| **Unreferenced Non-Code File** | 2 | High/Medium |
| **Data Directory Hanging Node** | 3 | High/Medium |

---

## 📋 Action Items List

The following items were identified by analyzing scheduled jobs, skills, workspace APIs, and frontend applications. Corresponding entries have also been synchronized to [`data/tasks.json`](file:///Users/darshanpatel/code/stockmarket/data/tasks.json).

### 1. [High] Investigate unreferenced source file _tmp_ann_scan.js
- **Category:** Unused File
- **Target File:** [`_tmp_ann_scan.js`](file:///Users/darshanpatel/code/stockmarket/_tmp_ann_scan.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _tmp_ann_scan.js`

### 2. [High] Investigate unreferenced source file _tmp_build_baseline.js
- **Category:** Unused File
- **Target File:** [`_tmp_build_baseline.js`](file:///Users/darshanpatel/code/stockmarket/_tmp_build_baseline.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _tmp_build_baseline.js`

### 3. [High] Investigate unreferenced source file _tmp_build_baseline2.js
- **Category:** Unused File
- **Target File:** [`_tmp_build_baseline2.js`](file:///Users/darshanpatel/code/stockmarket/_tmp_build_baseline2.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _tmp_build_baseline2.js`

### 4. [High] Investigate unreferenced source file _tmp_build_baseline3.js
- **Category:** Unused File
- **Target File:** [`_tmp_build_baseline3.js`](file:///Users/darshanpatel/code/stockmarket/_tmp_build_baseline3.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _tmp_build_baseline3.js`

### 5. [High] Investigate unreferenced source file _tmp_concall_full.js
- **Category:** Unused File
- **Target File:** [`_tmp_concall_full.js`](file:///Users/darshanpatel/code/stockmarket/_tmp_concall_full.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _tmp_concall_full.js`

### 6. [High] Investigate unreferenced source file _tmp_concall_notes.js
- **Category:** Unused File
- **Target File:** [`_tmp_concall_notes.js`](file:///Users/darshanpatel/code/stockmarket/_tmp_concall_notes.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _tmp_concall_notes.js`

### 7. [High] Investigate unreferenced source file tmp_gainers_research_20260921.js
- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/tmp_gainers_research_20260921.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/tmp_gainers_research_20260921.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/tmp_gainers_research_20260921.js`

### 8. [High] Investigate unreferenced source file tmp_check_extracts.js
- **Category:** Unused File
- **Target File:** [`tmp_check_extracts.js`](file:///Users/darshanpatel/code/stockmarket/tmp_check_extracts.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tmp_check_extracts.js`

### 9. [High] Investigate unreferenced source file tmp_check_extracts2.js
- **Category:** Unused File
- **Target File:** [`tmp_check_extracts2.js`](file:///Users/darshanpatel/code/stockmarket/tmp_check_extracts2.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tmp_check_extracts2.js`

### 10. [High] Investigate unreferenced source file tmp_fetch_ann.js
- **Category:** Unused File
- **Target File:** [`tmp_fetch_ann.js`](file:///Users/darshanpatel/code/stockmarket/tmp_fetch_ann.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tmp_fetch_ann.js`

### 11. [High] Investigate unreferenced source file tmp_fetch_briefs.js
- **Category:** Unused File
- **Target File:** [`tmp_fetch_briefs.js`](file:///Users/darshanpatel/code/stockmarket/tmp_fetch_briefs.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tmp_fetch_briefs.js`

### 12. [Low] Investigate unreferenced file tmp_gainers_content_20260921.json
- **Category:** Unreferenced Non-Code File
- **Target File:** [`packages/jobs-runtime/tmp_gainers_content_20260921.json`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/tmp_gainers_content_20260921.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/tmp_gainers_content_20260921.json — files starting with tmp_* are always considered dead`

### 13. [Low] Investigate unreferenced file tmp_gainers_stats_20260921.json
- **Category:** Unreferenced Non-Code File
- **Target File:** [`packages/jobs-runtime/tmp_gainers_stats_20260921.json`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/tmp_gainers_stats_20260921.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/tmp_gainers_stats_20260921.json — files starting with tmp_* are always considered dead`

### 14. [Medium] Verify data/_push_log.txt is actually orphaned
- **Category:** Data Directory Hanging Node
- **Target File:** [`data/_push_log.txt`](file:///Users/darshanpatel/code/stockmarket/data/_push_log.txt)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('_push_log.txt'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[DELETE] data/_push_log.txt — 0-byte file is always considered dead`

### 15. [Medium] Verify data/stockmarket.db is actually orphaned
- **Category:** Data Directory Hanging Node
- **Target File:** [`data/stockmarket.db`](file:///Users/darshanpatel/code/stockmarket/data/stockmarket.db)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('stockmarket.db'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[DELETE] data/stockmarket.db — 0-byte file is always considered dead`

### 16. [Medium] Verify data/tmp_save_gainers_reports.js is actually orphaned
- **Category:** Data Directory Hanging Node
- **Target File:** [`data/tmp_save_gainers_reports.js`](file:///Users/darshanpatel/code/stockmarket/data/tmp_save_gainers_reports.js)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('tmp_save_gainers_reports.js'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[DELETE] data/tmp_save_gainers_reports.js — files starting with tmp_* are always considered dead`

