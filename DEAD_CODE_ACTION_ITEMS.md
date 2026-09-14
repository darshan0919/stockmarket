# Dead Code & Coding Practice Action Items

> **Last Updated:** 2026-09-14T23:01:06.897Z  
> **Status:** Automated Scan Completed  
> **Active Action Items:** 3

---

## 📊 Summary Breakdown

| Category | Flagged Items | Priority |
| :--- | :---: | :---: |
| **Coding Standard Violation** | 2 | High/Medium |
| **Unused File** | 1 | High/Medium |

---

## 📋 Action Items List

The following items were identified by analyzing scheduled jobs, skills, workspace APIs, and frontend applications. Corresponding entries have also been synchronized to [`data/tasks.json`](file:///Users/darshanpatel/code/stockmarket/data/tasks.json).

### 1. [High] Refactor hardcoded user absolute path in skills/tooling/ask-anil-lamba/scripts/__pycache__/search_anil_lamba.cpython-314.pyc
- **Category:** Coding Standard Violation
- **Target File:** [`skills/tooling/ask-anil-lamba/scripts/__pycache__/search_anil_lamba.cpython-314.pyc`](file:///Users/darshanpatel/code/stockmarket/skills/tooling/ask-anil-lamba/scripts/__pycache__/search_anil_lamba.cpython-314.pyc)
- **Details:** Hardcoded path(s) found: /Users/darshanpatel/code/stockmarket. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in skills/tooling/ask-anil-lamba/scripts/__pycache__/search_anil_lamba.cpython-314.pyc`

### 2. [High] Refactor hardcoded user absolute path in skills/tooling/ask-soic/scripts/__pycache__/search_soic.cpython-314.pyc
- **Category:** Coding Standard Violation
- **Target File:** [`skills/tooling/ask-soic/scripts/__pycache__/search_soic.cpython-314.pyc`](file:///Users/darshanpatel/code/stockmarket/skills/tooling/ask-soic/scripts/__pycache__/search_soic.cpython-314.pyc)
- **Details:** Hardcoded path(s) found: /Users/darshanpatel/code/stockmarket. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in skills/tooling/ask-soic/scripts/__pycache__/search_soic.cpython-314.pyc`

### 3. [High] Investigate unreferenced source file migrateToShardedJsonl.js
- **Category:** Unused File
- **Target File:** [`packages/jobs-runtime/scripts/migrateToShardedJsonl.js`](file:///Users/darshanpatel/code/stockmarket/packages/jobs-runtime/scripts/migrateToShardedJsonl.js)
- **Details:** Source file 'packages/jobs-runtime/scripts/migrateToShardedJsonl.js' has zero incoming references and is not reachable from any package.json script, scheduled job, skill, application entrypoint, or test suite.
- **Recommended Action:** `[DELETE] packages/jobs-runtime/scripts/migrateToShardedJsonl.js`

