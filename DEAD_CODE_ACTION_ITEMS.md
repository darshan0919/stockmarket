# Dead Code & Coding Practice Action Items

> **Last Updated:** 2026-10-07T21:59:08.372Z
> **Status:** Automated Scan Completed
> **Active Action Items:** 80

---

## 📊 Summary Breakdown

| Category | Flagged Items | Priority |
| :--- | :---: | :---: |
| **Coding Standard Violation** | 1 | High/Medium |
| **Unused File** | 36 | High/Medium |
| **Unreferenced Non-Code File** | 39 | High/Medium |
| **Data Directory Hanging Node** | 4 | High/Medium |

## 🗂️ Whole-Directory Findings (sorted by file count — check these first)

| Directory | Files | Category | Action |
| :--- | :---: | :--- | :--- |
| `tmp/pcsi-run/` | 10 | Unreferenced Non-Code File | `[DELETE] tmp/pcsi-run/ — files under repo-root tmp/ are always considered dead` |
| `_to_delete/tmp_diag3_orderbook_1791311583/` | 6 | Unused File | `[DELETE] _to_delete/tmp_diag3_orderbook_1791311583/` |
| `scripts/xbrl/` | 5 | Unused File | `[DELETE] scripts/xbrl/` |
| `jobs/data/` | 5 | Unreferenced Non-Code File | `[DELETE] jobs/data/ — files under jobs/data/ are always considered dead` |
| `_to_delete/tmp_diag2_postclose_1791309085/` | 2 | Unused File | `[DELETE] _to_delete/tmp_diag2_postclose_1791309085/` |
| `_to_delete/tmp_diag_postclose_1791308657/` | 2 | Unused File | `[DELETE] _to_delete/tmp_diag_postclose_1791308657/` |
| `_to_delete/cache_test_debris/` | 2 | Unreferenced Non-Code File | `[VERIFY] _to_delete/cache_test_debris/ — confirm unused, then delete or relocate` |

---

## 📋 Action Items List

The following items were identified by analyzing scheduled jobs, skills, workspace APIs, and frontend applications. Corresponding entries have also been synchronized to [`data/tasks.json`](file:///Users/darshanpatel/code/stockmarket/data/tasks.json).

### 1. [High] Refactor hardcoded user absolute path in skills/tooling/grill-skill/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`skills/tooling/grill-skill/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/skills/tooling/grill-skill/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshanpatel/code/stockmarket. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in skills/tooling/grill-skill/SKILL.md`

### 2. [High] Investigate unreferenced folder _to_delete/tmp_diag3_orderbook_1791311583/ (6 files, all unreferenced)
- **Category:** Unused File
- **Target File:** [`_to_delete/tmp_diag3_orderbook_1791311583`](file:///Users/darshanpatel/code/stockmarket/_to_delete/tmp_diag3_orderbook_1791311583)
- **Details:** Every file that exists under _to_delete/tmp_diag3_orderbook_1791311583/ (recursively, 6 total) is unreachable from any entry root. Representative reason: all 6 files under this folder are unreferenced. Full file list: _to_delete/tmp_diag3_orderbook_1791311583/bisect.js, _to_delete/tmp_diag3_orderbook_1791311583/test_ensurebase.js, _to_delete/tmp_diag3_orderbook_1791311583/test_extract.js, _to_delete/tmp_diag3_orderbook_1791311583/test_financials.js, _to_delete/tmp_diag3_orderbook_1791311583/test_resolvefacts.js, _to_delete/tmp_diag3_orderbook_1791311583/test_rollup.js
- **Recommended Action:** `[DELETE] _to_delete/tmp_diag3_orderbook_1791311583/`

### 3. [High] Investigate unreferenced folder scripts/xbrl/ (5 files, all unreferenced)
- **Category:** Unused File
- **Target File:** [`scripts/xbrl`](file:///Users/darshanpatel/code/stockmarket/scripts/xbrl)
- **Details:** Every file that exists under scripts/xbrl/ (recursively, 5 total) is unreachable from any entry root. Representative reason: all 5 files under this folder are unreferenced. Full file list: scripts/xbrl/backfill_bse_scrip.js, scripts/xbrl/compare_pdf.js, scripts/xbrl/validate_events.js, scripts/xbrl/validate_filings.js, scripts/xbrl/validate_results.js
- **Recommended Action:** `[DELETE] scripts/xbrl/`

### 4. [High] Investigate unreferenced folder _to_delete/tmp_diag2_postclose_1791309085/ (2 files, all unreferenced)
- **Category:** Unused File
- **Target File:** [`_to_delete/tmp_diag2_postclose_1791309085`](file:///Users/darshanpatel/code/stockmarket/_to_delete/tmp_diag2_postclose_1791309085)
- **Details:** Every file that exists under _to_delete/tmp_diag2_postclose_1791309085/ (recursively, 2 total) is unreachable from any entry root. Representative reason: all 2 files under this folder are unreferenced. Full file list: _to_delete/tmp_diag2_postclose_1791309085/check.js, _to_delete/tmp_diag2_postclose_1791309085/send_safe.js
- **Recommended Action:** `[DELETE] _to_delete/tmp_diag2_postclose_1791309085/`

### 5. [High] Investigate unreferenced folder _to_delete/tmp_diag_postclose_1791308657/ (2 files, all unreferenced)
- **Category:** Unused File
- **Target File:** [`_to_delete/tmp_diag_postclose_1791308657`](file:///Users/darshanpatel/code/stockmarket/_to_delete/tmp_diag_postclose_1791308657)
- **Details:** Every file that exists under _to_delete/tmp_diag_postclose_1791308657/ (recursively, 2 total) is unreachable from any entry root. Representative reason: all 2 files under this folder are unreferenced. Full file list: _to_delete/tmp_diag_postclose_1791308657/diag6.js, _to_delete/tmp_diag_postclose_1791308657/diag7.js
- **Recommended Action:** `[DELETE] _to_delete/tmp_diag_postclose_1791308657/`

### 6. [High] Investigate unreferenced source file _tmp_ann_scan.js
- **Category:** Unused File
- **Target File:** [`_tmp_ann_scan.js`](file:///Users/darshanpatel/code/stockmarket/_tmp_ann_scan.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _tmp_ann_scan.js`

### 7. [High] Investigate unreferenced source file _tmp_build_baseline.js
- **Category:** Unused File
- **Target File:** [`_tmp_build_baseline.js`](file:///Users/darshanpatel/code/stockmarket/_tmp_build_baseline.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _tmp_build_baseline.js`

### 8. [High] Investigate unreferenced source file _tmp_build_baseline2.js
- **Category:** Unused File
- **Target File:** [`_tmp_build_baseline2.js`](file:///Users/darshanpatel/code/stockmarket/_tmp_build_baseline2.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _tmp_build_baseline2.js`

### 9. [High] Investigate unreferenced source file _tmp_build_baseline3.js
- **Category:** Unused File
- **Target File:** [`_tmp_build_baseline3.js`](file:///Users/darshanpatel/code/stockmarket/_tmp_build_baseline3.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _tmp_build_baseline3.js`

### 10. [High] Investigate unreferenced source file _tmp_concall_full.js
- **Category:** Unused File
- **Target File:** [`_tmp_concall_full.js`](file:///Users/darshanpatel/code/stockmarket/_tmp_concall_full.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _tmp_concall_full.js`

### 11. [High] Investigate unreferenced source file _tmp_concall_notes.js
- **Category:** Unused File
- **Target File:** [`_tmp_concall_notes.js`](file:///Users/darshanpatel/code/stockmarket/_tmp_concall_notes.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _tmp_concall_notes.js`

### 12. [High] Investigate unreferenced source file save_research_dtos_tmp_20260925.js
- **Category:** Unused File
- **Target File:** [`_to_delete/save_research_dtos_tmp_20260925.js`](file:///Users/darshanpatel/code/stockmarket/_to_delete/save_research_dtos_tmp_20260925.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] _to_delete/save_research_dtos_tmp_20260925.js`

### 13. [High] Investigate unreferenced source file _tmp_debug_email.js
- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/_tmp_debug_email.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/_tmp_debug_email.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/_tmp_debug_email.js`

### 14. [High] Investigate unreferenced source file _tmp_debug_email2.js
- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/_tmp_debug_email2.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/_tmp_debug_email2.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/_tmp_debug_email2.js`

### 15. [High] Investigate unreferenced source file _tmp_debug_senddigest.js
- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/_tmp_debug_senddigest.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/_tmp_debug_senddigest.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/_tmp_debug_senddigest.js`

### 16. [High] Investigate unreferenced source file oce_instrumented.js
- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/lib/oce_instrumented.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/lib/oce_instrumented.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/lib/oce_instrumented.js`

### 17. [High] Investigate unreferenced source file index.js
- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/lib/pdfExtract/index.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/lib/pdfExtract/index.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/lib/pdfExtract/index.js`

### 18. [High] Investigate unreferenced source file tmp_gainers_research_20260921.js
- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/tmp_gainers_research_20260921.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/tmp_gainers_research_20260921.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/tmp_gainers_research_20260921.js`

### 19. [High] Investigate unreferenced source file tmp_pdftest.js
- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/tmp_pdftest.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/tmp_pdftest.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/tmp_pdftest.js`

### 20. [High] Investigate unreferenced source file tmp_resolvetest2.js
- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/tmp_resolvetest2.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/tmp_resolvetest2.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/tmp_resolvetest2.js`

### 21. [High] Investigate unreferenced source file tmp_resolvetest3.js
- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/tmp_resolvetest3.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/tmp_resolvetest3.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/tmp_resolvetest3.js`

### 22. [High] Investigate unreferenced source file tmp_resolvetest4.js
- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/tmp_resolvetest4.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/tmp_resolvetest4.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/tmp_resolvetest4.js`

### 23. [High] Investigate unreferenced source file tmp_resolvetest5.js
- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/tmp_resolvetest5.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/tmp_resolvetest5.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/tmp_resolvetest5.js`

### 24. [High] Investigate unreferenced source file tmp_resolvetest6.js
- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/tmp_resolvetest6.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/tmp_resolvetest6.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/tmp_resolvetest6.js`

### 25. [High] Investigate unreferenced source file eval_verify.js
- **Category:** Unused File
- **Target File:** [`scripts/pdf-corpus/eval_verify.js`](file:///Users/darshanpatel/code/stockmarket/scripts/pdf-corpus/eval_verify.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] scripts/pdf-corpus/eval_verify.js`

### 26. [High] Investigate unreferenced source file list_docs.js
- **Category:** Unused File
- **Target File:** [`scripts/pdf-corpus/list_docs.js`](file:///Users/darshanpatel/code/stockmarket/scripts/pdf-corpus/list_docs.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] scripts/pdf-corpus/list_docs.js`

### 27. [High] Investigate unreferenced source file ping_models.js
- **Category:** Unused File
- **Target File:** [`scripts/pdf-corpus/ping_models.js`](file:///Users/darshanpatel/code/stockmarket/scripts/pdf-corpus/ping_models.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] scripts/pdf-corpus/ping_models.js`

### 28. [High] Investigate unreferenced source file select_docs.js
- **Category:** Unused File
- **Target File:** [`scripts/pdf-corpus/select_docs.js`](file:///Users/darshanpatel/code/stockmarket/scripts/pdf-corpus/select_docs.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] scripts/pdf-corpus/select_docs.js`

### 29. [High] Investigate unreferenced source file save_dtos.js
- **Category:** Unused File
- **Target File:** [`tmp/gainers-signal-batch2/save_dtos.js`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers-signal-batch2/save_dtos.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tmp/gainers-signal-batch2/save_dtos.js`

### 30. [High] Investigate unreferenced source file build_content.py
- **Category:** Unused File
- **Target File:** [`tmp/gainers_run/build_content.py`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/build_content.py)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tmp/gainers_run/build_content.py`

### 31. [High] Investigate unreferenced source file save_reports_20260923.js
- **Category:** Unused File
- **Target File:** [`tmp/gainers_run/save_reports_20260923.js`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/save_reports_20260923.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tmp/gainers_run/save_reports_20260923.js`

### 32. [High] Investigate unreferenced source file save_reports_20260930.js
- **Category:** Unused File
- **Target File:** [`tmp/gainers_run/save_reports_20260930.js`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/save_reports_20260930.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tmp/gainers_run/save_reports_20260930.js`

### 33. [High] Investigate unreferenced source file tmp_check_extracts.js
- **Category:** Unused File
- **Target File:** [`tmp_check_extracts.js`](file:///Users/darshanpatel/code/stockmarket/tmp_check_extracts.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tmp_check_extracts.js`

### 34. [High] Investigate unreferenced source file tmp_check_extracts2.js
- **Category:** Unused File
- **Target File:** [`tmp_check_extracts2.js`](file:///Users/darshanpatel/code/stockmarket/tmp_check_extracts2.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tmp_check_extracts2.js`

### 35. [High] Investigate unreferenced source file tmp_fetch_ann.js
- **Category:** Unused File
- **Target File:** [`tmp_fetch_ann.js`](file:///Users/darshanpatel/code/stockmarket/tmp_fetch_ann.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tmp_fetch_ann.js`

### 36. [High] Investigate unreferenced source file tmp_fetch_briefs.js
- **Category:** Unused File
- **Target File:** [`tmp_fetch_briefs.js`](file:///Users/darshanpatel/code/stockmarket/tmp_fetch_briefs.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tmp_fetch_briefs.js`

### 37. [High] Investigate unreferenced source file capture.js
- **Category:** Unused File
- **Target File:** [`tools/x-timeline-capture/capture.js`](file:///Users/darshanpatel/code/stockmarket/tools/x-timeline-capture/capture.js)
- **Details:** Not reachable from any skill, scheduled job, package.json script, or UI entry point.
- **Recommended Action:** `[DELETE] tools/x-timeline-capture/capture.js`

### 38. [Low] Investigate unreferenced folder tmp/pcsi-run/ (10 files, all unreferenced)
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/pcsi-run`](file:///Users/darshanpatel/code/stockmarket/tmp/pcsi-run)
- **Details:** Every file that exists under tmp/pcsi-run/ (recursively, 10 total) is not referenced by any reachable code. Full file list: tmp/pcsi-run/01-resolve-scan.json, tmp/pcsi-run/02-fetch-scan.json, tmp/pcsi-run/03-filter-noise.raw, tmp/pcsi-run/04-categorise.raw, tmp/pcsi-run/categorise-clean.json, tmp/pcsi-run/fetch-scan-clean.json, tmp/pcsi-run/filter-noise-clean.json, tmp/pcsi-run/followers.json, tmp/pcsi-run/leads.json, tmp/pcsi-run/pdf-urls.json
- **Recommended Action:** `[DELETE] tmp/pcsi-run/ — files under repo-root tmp/ are always considered dead`

### 39. [Low] Investigate unreferenced folder jobs/data/ (5 files, all unreferenced)
- **Category:** Unreferenced Non-Code File
- **Target File:** [`jobs/data`](file:///Users/darshanpatel/code/stockmarket/jobs/data)
- **Details:** Every file that exists under jobs/data/ (recursively, 5 total) is not referenced by any reachable code. Full file list: jobs/data/rerating-catalysts/PATELCHEM_Multi_Plant_Capex_Master.html, jobs/data/rerating-catalysts/PATELCHEM_Multi_Plant_Capex_Master.pdf, jobs/data/rerating-catalysts/PATELCHEM_Output.pdf, jobs/data/rerating-catalysts/PATELCHEM_Talod_Capex_Timeline.html, jobs/data/rerating-catalysts/PATELCHEM_Talod_Capex_Timeline.pdf
- **Recommended Action:** `[DELETE] jobs/data/ — files under jobs/data/ are always considered dead`

### 40. [Low] Investigate unreferenced folder _to_delete/cache_test_debris/ (2 files, all unreferenced)
- **Category:** Unreferenced Non-Code File
- **Target File:** [`_to_delete/cache_test_debris`](file:///Users/darshanpatel/code/stockmarket/_to_delete/cache_test_debris)
- **Details:** Every file that exists under _to_delete/cache_test_debris/ (recursively, 2 total) is not referenced by any reachable code. Full file list: _to_delete/cache_test_debris/bs_HNDFDS_TEST/2026FYTEST-bs.json, _to_delete/cache_test_debris/cf_HNDFDS_TEST/2026FYTEST-cf.json
- **Recommended Action:** `[VERIFY] _to_delete/cache_test_debris/ — confirm unused, then delete or relocate`

### 41. [Low] Investigate unreferenced file .shadow_pass_results_tmp.json
- **Category:** Unreferenced Non-Code File
- **Target File:** [`_to_delete/.shadow_pass_results_tmp.json`](file:///Users/darshanpatel/code/stockmarket/_to_delete/.shadow_pass_results_tmp.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _to_delete/.shadow_pass_results_tmp.json — confirm unused, then delete or relocate`

### 42. [Low] Investigate unreferenced file gainers_content_20260924_stray.json
- **Category:** Unreferenced Non-Code File
- **Target File:** [`_to_delete/gainers_content_20260924_stray.json`](file:///Users/darshanpatel/code/stockmarket/_to_delete/gainers_content_20260924_stray.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _to_delete/gainers_content_20260924_stray.json — confirm unused, then delete or relocate`

### 43. [Low] Investigate unreferenced file gainers_email_preview_20260925.html
- **Category:** Unreferenced Non-Code File
- **Target File:** [`_to_delete/gainers_email_preview_20260925.html`](file:///Users/darshanpatel/code/stockmarket/_to_delete/gainers_email_preview_20260925.html)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _to_delete/gainers_email_preview_20260925.html — confirm unused, then delete or relocate`

### 44. [Low] Investigate unreferenced file sample_stage1.json.tmp
- **Category:** Unreferenced Non-Code File
- **Target File:** [`_to_delete/sample_stage1.json.tmp`](file:///Users/darshanpatel/code/stockmarket/_to_delete/sample_stage1.json.tmp)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _to_delete/sample_stage1.json.tmp — confirm unused, then delete or relocate`

### 45. [Low] Investigate unreferenced file shadow_pass_v2_results.json.tmp
- **Category:** Unreferenced Non-Code File
- **Target File:** [`_to_delete/shadow_pass_v2_results.json.tmp`](file:///Users/darshanpatel/code/stockmarket/_to_delete/shadow_pass_v2_results.json.tmp)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _to_delete/shadow_pass_v2_results.json.tmp — confirm unused, then delete or relocate`

### 46. [Low] Investigate unreferenced file shadow_pass_v3_results.json.tmp
- **Category:** Unreferenced Non-Code File
- **Target File:** [`_to_delete/shadow_pass_v3_results.json.tmp`](file:///Users/darshanpatel/code/stockmarket/_to_delete/shadow_pass_v3_results.json.tmp)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _to_delete/shadow_pass_v3_results.json.tmp — confirm unused, then delete or relocate`

### 47. [Low] Investigate unreferenced file shadow_pass_v4_results.json.tmp
- **Category:** Unreferenced Non-Code File
- **Target File:** [`_to_delete/shadow_pass_v4_results.json.tmp`](file:///Users/darshanpatel/code/stockmarket/_to_delete/shadow_pass_v4_results.json.tmp)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] _to_delete/shadow_pass_v4_results.json.tmp — confirm unused, then delete or relocate`

### 48. [Low] Investigate unreferenced file tmp_gainers_content_20260921.json
- **Category:** Unreferenced Non-Code File
- **Target File:** [`packages/jobs-runtime/tmp_gainers_content_20260921.json`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/tmp_gainers_content_20260921.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/tmp_gainers_content_20260921.json — files starting with tmp_* are always considered dead`

### 49. [Low] Investigate unreferenced file tmp_gainers_stats_20260921.json
- **Category:** Unreferenced Non-Code File
- **Target File:** [`packages/jobs-runtime/tmp_gainers_stats_20260921.json`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/tmp_gainers_stats_20260921.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/tmp_gainers_stats_20260921.json — files starting with tmp_* are always considered dead`

### 50. [Low] Investigate unreferenced file _unm.js.todelete
- **Category:** Unreferenced Non-Code File
- **Target File:** [`scripts/pdf-corpus/_unm.js.todelete`](file:///Users/darshanpatel/code/stockmarket/scripts/pdf-corpus/_unm.js.todelete)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] scripts/pdf-corpus/_unm.js.todelete — confirm unused, then delete or relocate`

### 51. [Low] Investigate unreferenced file NSE_KANOHAR_DRHP_2026-01-23.pdf
- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_KANOHAR_DRHP_2026-01-23.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_KANOHAR_DRHP_2026-01-23.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_KANOHAR_DRHP_2026-01-23.pdf — confirm unused, then delete or relocate`

### 52. [Low] Investigate unreferenced file NSE_KANOHAR_PPT_202609.pdf
- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_KANOHAR_PPT_202609.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_KANOHAR_PPT_202609.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_KANOHAR_PPT_202609.pdf — confirm unused, then delete or relocate`

### 53. [Low] Investigate unreferenced file NSE_KANOHAR_Result_202609.pdf
- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_KANOHAR_Result_202609.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_KANOHAR_Result_202609.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_KANOHAR_Result_202609.pdf — confirm unused, then delete or relocate`

### 54. [Low] Investigate unreferenced file NSE_SUPRIYA_PPT_202603.pdf
- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_SUPRIYA_PPT_202603.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_SUPRIYA_PPT_202603.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_SUPRIYA_PPT_202603.pdf — confirm unused, then delete or relocate`

### 55. [Low] Investigate unreferenced file NSE_SUPRIYA_PPT_202606.pdf
- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_SUPRIYA_PPT_202606.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_SUPRIYA_PPT_202606.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_SUPRIYA_PPT_202606.pdf — confirm unused, then delete or relocate`

### 56. [Low] Investigate unreferenced file NSE_SUPRIYA_Result_202606.pdf
- **Category:** Unreferenced Non-Code File
- **Target File:** [`stock_documents/NSE_SUPRIYA_Result_202606.pdf`](file:///Users/darshanpatel/code/stockmarket/stock_documents/NSE_SUPRIYA_Result_202606.pdf)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[VERIFY] stock_documents/NSE_SUPRIYA_Result_202606.pdf — confirm unused, then delete or relocate`

### 57. [Low] Investigate unreferenced file save_dtos.js.bak
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers-signal-batch2/save_dtos.js.bak`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers-signal-batch2/save_dtos.js.bak)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers-signal-batch2/save_dtos.js.bak — files under repo-root tmp/ are always considered dead`

### 58. [Low] Investigate unreferenced file pdf_aastha_mgmt.txt
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/pdf_aastha_mgmt.txt`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/pdf_aastha_mgmt.txt)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/pdf_aastha_mgmt.txt — files under repo-root tmp/ are always considered dead`

### 59. [Low] Investigate unreferenced file pdf_kabraextru.txt
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/pdf_kabraextru.txt`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/pdf_kabraextru.txt)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/pdf_kabraextru.txt — files under repo-root tmp/ are always considered dead`

### 60. [Low] Investigate unreferenced file pdf_maninds.txt
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/pdf_maninds.txt`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/pdf_maninds.txt)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/pdf_maninds.txt — files under repo-root tmp/ are always considered dead`

### 61. [Low] Investigate unreferenced file pdf_olaelec.txt
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/pdf_olaelec.txt`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/pdf_olaelec.txt)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/pdf_olaelec.txt — files under repo-root tmp/ are always considered dead`

### 62. [Low] Investigate unreferenced file pdf_optiemus_termsheet.txt
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/pdf_optiemus_termsheet.txt`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/pdf_optiemus_termsheet.txt)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/pdf_optiemus_termsheet.txt — files under repo-root tmp/ are always considered dead`

### 63. [Low] Investigate unreferenced file pdf_raymondrel_board.txt
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/pdf_raymondrel_board.txt`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/pdf_raymondrel_board.txt)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/pdf_raymondrel_board.txt — files under repo-root tmp/ are always considered dead`

### 64. [Low] Investigate unreferenced file pdf_raymondrel_press.txt
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/pdf_raymondrel_press.txt`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/pdf_raymondrel_press.txt)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/pdf_raymondrel_press.txt — files under repo-root tmp/ are always considered dead`

### 65. [Low] Investigate unreferenced file pdf_sanathan.txt
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/pdf_sanathan.txt`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/pdf_sanathan.txt)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/pdf_sanathan.txt — files under repo-root tmp/ are always considered dead`

### 66. [Low] Investigate unreferenced file pdf_sunflag.txt
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/pdf_sunflag.txt`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/pdf_sunflag.txt)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/pdf_sunflag.txt — files under repo-root tmp/ are always considered dead`

### 67. [Low] Investigate unreferenced file step1_scanner.log
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/step1_scanner.log`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/step1_scanner.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/step1_scanner.log — files under repo-root tmp/ are always considered dead`

### 68. [Low] Investigate unreferenced file step1_scanner_v2.log
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/step1_scanner_v2.log`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/step1_scanner_v2.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/step1_scanner_v2.log — files under repo-root tmp/ are always considered dead`

### 69. [Low] Investigate unreferenced file step1_scanner_v3.log
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/step1_scanner_v3.log`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/step1_scanner_v3.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/step1_scanner_v3.log — files under repo-root tmp/ are always considered dead`

### 70. [Low] Investigate unreferenced file step1b_ttl.log
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/step1b_ttl.log`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/step1b_ttl.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/step1b_ttl.log — files under repo-root tmp/ are always considered dead`

### 71. [Low] Investigate unreferenced file step2_classifier.log
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/step2_classifier.log`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/step2_classifier.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/step2_classifier.log — files under repo-root tmp/ are always considered dead`

### 72. [Low] Investigate unreferenced file step7_render.log
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/step7_render.log`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/step7_render.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/step7_render.log — files under repo-root tmp/ are always considered dead`

### 73. [Low] Investigate unreferenced file step7_send.log
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/step7_send.log`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/step7_send.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/step7_send.log — files under repo-root tmp/ are always considered dead`

### 74. [Low] Investigate unreferenced file step8_push.log
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/step8_push.log`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/step8_push.log)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/step8_push.log — files under repo-root tmp/ are always considered dead`

### 75. [Low] Investigate unreferenced file stockscans_coverage.json
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/gainers_run/stockscans_coverage.json`](file:///Users/darshanpatel/code/stockmarket/tmp/gainers_run/stockscans_coverage.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/gainers_run/stockscans_coverage.json — files under repo-root tmp/ are always considered dead`

### 76. [Low] Investigate unreferenced file pcw-pdf-texts.json
- **Category:** Unreferenced Non-Code File
- **Target File:** [`tmp/pcw-pdf-texts.json`](file:///Users/darshanpatel/code/stockmarket/tmp/pcw-pdf-texts.json)
- **Details:** Non-code file path/name not referenced by any reachable code.
- **Recommended Action:** `[DELETE] tmp/pcw-pdf-texts.json — files under repo-root tmp/ are always considered dead`

### 77. [Medium] Verify data/_push_log.txt is actually orphaned
- **Category:** Data Directory Hanging Node
- **Target File:** [`data/_push_log.txt`](file:///Users/darshanpatel/code/stockmarket/data/_push_log.txt)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('_push_log.txt'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[DELETE] data/_push_log.txt — 0-byte file is always considered dead`

### 78. [Medium] Verify data/scratch is actually orphaned
- **Category:** Data Directory Hanging Node
- **Target File:** [`data/scratch`](file:///Users/darshanpatel/code/stockmarket/data/scratch)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('scratch'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[VERIFY] data/scratch — no data-layer code references this collection name`

### 79. [Medium] Verify data/stockmarket.db is actually orphaned
- **Category:** Data Directory Hanging Node
- **Target File:** [`data/stockmarket.db`](file:///Users/darshanpatel/code/stockmarket/data/stockmarket.db)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('stockmarket.db'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[DELETE] data/stockmarket.db — 0-byte file is always considered dead`

### 80. [Medium] Verify data/tmp_save_gainers_reports.js is actually orphaned
- **Category:** Data Directory Hanging Node
- **Target File:** [`data/tmp_save_gainers_reports.js`](file:///Users/darshanpatel/code/stockmarket/data/tmp_save_gainers_reports.js)
- **Details:** No data-layer file (db.js/jsonlStore.js/wrapper) or data-layer consumer references this collection name ('tmp_save_gainers_reports.js'). Either it's genuinely orphaned scratch/backup data, or something is reading/writing it by a path pattern this scan cannot statically detect (verify manually before deleting).
- **Recommended Action:** `[DELETE] data/tmp_save_gainers_reports.js — files starting with tmp_* are always considered dead`

