# Dead Code & Coding Practice Action Items

> **Last Updated:** 2026-09-04T07:32:39.849Z  
> **Status:** Automated Scan Completed  
> **Active Action Items:** 24

---

## 📊 Summary Breakdown

| Category | Flagged Items | Priority |
| :--- | :---: | :---: |
| **Obsolete Temp File** | 5 | High/Medium |
| **Env Var Unused Outside Tests** | 19 | High/Medium |

---

## 📋 Action Items List

The following items were identified by analyzing scheduled jobs, skills, workspace APIs, and frontend applications. Corresponding entries have also been synchronized to [`data/tasks.json`](file:///Users/darshanpatel/code/stockmarket/data/tasks.json).

### 1. [High] Remove obsolete temporary script packages/jobs-runtime/_test_drive_tmp.js
- **Category:** Obsolete Temp File
- **Target File:** [`packages/jobs-runtime/_test_drive_tmp.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/_test_drive_tmp.js)
- **Details:** File 'packages/jobs-runtime/_test_drive_tmp.js' is a temporary/scratch script leftover in the repository.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/_test_drive_tmp.js`

### 2. [High] Remove obsolete temporary script _save_triggers_tmp.js
- **Category:** Obsolete Temp File
- **Target File:** [`_save_triggers_tmp.js`](file:///Users/darshanpatel/code/stockmarket/_save_triggers_tmp.js)
- **Details:** File '_save_triggers_tmp.js' is a temporary/scratch script leftover in the repository.
- **Recommended Action:** `[DELETE] _save_triggers_tmp.js`

### 3. [High] Remove obsolete temporary script _tmp_save_gainers_research.js
- **Category:** Obsolete Temp File
- **Target File:** [`_tmp_save_gainers_research.js`](file:///Users/darshanpatel/code/stockmarket/_tmp_save_gainers_research.js)
- **Details:** File '_tmp_save_gainers_research.js' is a temporary/scratch script leftover in the repository.
- **Recommended Action:** `[DELETE] _tmp_save_gainers_research.js`

### 4. [High] Remove obsolete temporary script vr_email_tmp.js
- **Category:** Obsolete Temp File
- **Target File:** [`vr_email_tmp.js`](file:///Users/darshanpatel/code/stockmarket/vr_email_tmp.js)
- **Details:** File 'vr_email_tmp.js' is a temporary/scratch script leftover in the repository.
- **Recommended Action:** `[DELETE] vr_email_tmp.js`

### 5. [High] Remove obsolete temporary script vr_research_tmp.js
- **Category:** Obsolete Temp File
- **Target File:** [`vr_research_tmp.js`](file:///Users/darshanpatel/code/stockmarket/vr_research_tmp.js)
- **Details:** File 'vr_research_tmp.js' is a temporary/scratch script leftover in the repository.
- **Recommended Action:** `[DELETE] vr_research_tmp.js`

### 6. [Low] Verify whether LEARNYST_SOIC_SCHOOL_ID is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_SOIC_SCHOOL_ID' is declared in .env.example but the literal name never appears in any non-test source file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_SOIC_SCHOOL_ID usage, then remove from .env/.env.example if genuinely unused`

### 7. [Low] Verify whether LEARNYST_SOIC_BUNDLE_ID is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_SOIC_BUNDLE_ID' is declared in .env.example but the literal name never appears in any non-test source file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_SOIC_BUNDLE_ID usage, then remove from .env/.env.example if genuinely unused`

### 8. [Low] Verify whether LEARNYST_SOIC_GRAPHQL_URL is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_SOIC_GRAPHQL_URL' is declared in .env.example but the literal name never appears in any non-test source file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_SOIC_GRAPHQL_URL usage, then remove from .env/.env.example if genuinely unused`

### 9. [Low] Verify whether LEARNYST_SOIC_COURSES_API_BASE is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_SOIC_COURSES_API_BASE' is declared in .env.example but the literal name never appears in any non-test source file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_SOIC_COURSES_API_BASE usage, then remove from .env/.env.example if genuinely unused`

### 10. [Low] Verify whether LEARNYST_SOIC_TRANSCRIPT_API_BASE is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_SOIC_TRANSCRIPT_API_BASE' is declared in .env.example but the literal name never appears in any non-test source file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_SOIC_TRANSCRIPT_API_BASE usage, then remove from .env/.env.example if genuinely unused`

### 11. [Low] Verify whether LEARNYST_SOIC_ORIGIN is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_SOIC_ORIGIN' is declared in .env.example but the literal name never appears in any non-test source file — only in a *.test.js/*.spec.js file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_SOIC_ORIGIN usage, then remove from .env/.env.example if genuinely unused`

### 12. [Low] Verify whether LEARNYST_SOIC_REFERER is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_SOIC_REFERER' is declared in .env.example but the literal name never appears in any non-test source file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_SOIC_REFERER usage, then remove from .env/.env.example if genuinely unused`

### 13. [Low] Verify whether LEARNYST_SOIC_REQUEST_DELAY_MS is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_SOIC_REQUEST_DELAY_MS' is declared in .env.example but the literal name never appears in any non-test source file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_SOIC_REQUEST_DELAY_MS usage, then remove from .env/.env.example if genuinely unused`

### 14. [Low] Verify whether LEARNYST_SOIC_MODULE_DELAY_MS is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_SOIC_MODULE_DELAY_MS' is declared in .env.example but the literal name never appears in any non-test source file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_SOIC_MODULE_DELAY_MS usage, then remove from .env/.env.example if genuinely unused`

### 15. [Low] Verify whether LEARNYST_SOIC_MAX_RETRIES is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_SOIC_MAX_RETRIES' is declared in .env.example but the literal name never appears in any non-test source file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_SOIC_MAX_RETRIES usage, then remove from .env/.env.example if genuinely unused`

### 16. [Low] Verify whether LEARNYST_CHARTITUDE_AUTH_TOKEN is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_CHARTITUDE_AUTH_TOKEN' is declared in .env.example but the literal name never appears in any non-test source file — only in a *.test.js/*.spec.js file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_CHARTITUDE_AUTH_TOKEN usage, then remove from .env/.env.example if genuinely unused`

### 17. [Low] Verify whether LEARNYST_CHARTITUDE_SCHOOL_ID is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_CHARTITUDE_SCHOOL_ID' is declared in .env.example but the literal name never appears in any non-test source file — only in a *.test.js/*.spec.js file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_CHARTITUDE_SCHOOL_ID usage, then remove from .env/.env.example if genuinely unused`

### 18. [Low] Verify whether LEARNYST_CHARTITUDE_ORIGIN is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_CHARTITUDE_ORIGIN' is declared in .env.example but the literal name never appears in any non-test source file — only in a *.test.js/*.spec.js file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_CHARTITUDE_ORIGIN usage, then remove from .env/.env.example if genuinely unused`

### 19. [Low] Verify whether LEARNYST_CHARTITUDE_REFERER is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_CHARTITUDE_REFERER' is declared in .env.example but the literal name never appears in any non-test source file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_CHARTITUDE_REFERER usage, then remove from .env/.env.example if genuinely unused`

### 20. [Low] Verify whether LEARNYST_CHARTITUDE_REQUEST_DELAY_MS is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_CHARTITUDE_REQUEST_DELAY_MS' is declared in .env.example but the literal name never appears in any non-test source file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_CHARTITUDE_REQUEST_DELAY_MS usage, then remove from .env/.env.example if genuinely unused`

### 21. [Low] Verify whether LEARNYST_CHARTITUDE_MODULE_DELAY_MS is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_CHARTITUDE_MODULE_DELAY_MS' is declared in .env.example but the literal name never appears in any non-test source file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_CHARTITUDE_MODULE_DELAY_MS usage, then remove from .env/.env.example if genuinely unused`

### 22. [Low] Verify whether LEARNYST_CHARTITUDE_MAX_RETRIES is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'LEARNYST_CHARTITUDE_MAX_RETRIES' is declared in .env.example but the literal name never appears in any non-test source file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] LEARNYST_CHARTITUDE_MAX_RETRIES usage, then remove from .env/.env.example if genuinely unused`

### 23. [Low] Verify whether COWORK_DRIVE_ROOT is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'COWORK_DRIVE_ROOT' is declared in .env.example but the literal name never appears in any non-test source file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] COWORK_DRIVE_ROOT usage, then remove from .env/.env.example if genuinely unused`

### 24. [Low] Verify whether COWORK_DRIVE_SYNC is actually needed
- **Category:** Env Var Unused Outside Tests
- **Target File:** [`.env.example`](file:///Users/darshanpatel/code/stockmarket/.env.example)
- **Details:** 'COWORK_DRIVE_SYNC' is declared in .env.example but the literal name never appears in any non-test source file. It may be genuinely unused, OR it may be read via a dynamically-built name (e.g. `` `PREFIX_${key}_SUFFIX` ``) that a literal grep cannot see — verify before removing it from .env/.env.example and any test that references it.
- **Recommended Action:** `[VERIFY] COWORK_DRIVE_SYNC usage, then remove from .env/.env.example if genuinely unused`

