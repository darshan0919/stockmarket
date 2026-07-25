# Dead Code & Coding Practice Action Items

> **Last Updated:** 2026-07-25T15:30:03.365Z  
> **Status:** Automated Scan Completed  
> **Active Action Items:** 21

---

## 📊 Summary Breakdown

| Category | Flagged Items | Priority |
| :--- | :---: | :---: |
| **Obsolete Temp File** | 3 | High/Medium |
| **Coding Standard Violation** | 18 | High/Medium |

---

## 📋 Action Items List

The following items were identified by analyzing scheduled jobs, skills, workspace APIs, and frontend applications. Corresponding entries have also been synchronized to [`data/tasks.json`](file:///Users/darshanpatel/code/stockmarket/data/tasks.json).

### 1. [High] Remove obsolete root temporary script check_deals_tmp.js
- **Category:** Obsolete Temp File
- **Target File:** [`check_deals_tmp.js`](file:///Users/darshanpatel/code/stockmarket/check_deals_tmp.js)
- **Details:** File 'check_deals_tmp.js' is a scratch script leftover in the root directory.
- **Recommended Action:** `[DELETE] check_deals_tmp.js`

### 2. [High] Remove obsolete root temporary script run_render_pdf_tmp.js
- **Category:** Obsolete Temp File
- **Target File:** [`run_render_pdf_tmp.js`](file:///Users/darshanpatel/code/stockmarket/run_render_pdf_tmp.js)
- **Details:** File 'run_render_pdf_tmp.js' is a scratch script leftover in the root directory.
- **Recommended Action:** `[DELETE] run_render_pdf_tmp.js`

### 3. [High] Remove obsolete root temporary script save_gandhar_tmp.js
- **Category:** Obsolete Temp File
- **Target File:** [`save_gandhar_tmp.js`](file:///Users/darshanpatel/code/stockmarket/save_gandhar_tmp.js)
- **Details:** File 'save_gandhar_tmp.js' is a scratch script leftover in the root directory.
- **Recommended Action:** `[DELETE] save_gandhar_tmp.js`

### 4. [High] Refactor hardcoded user absolute path in jobs/Scheduled/conversation-enrichment-stockmarket/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`jobs/Scheduled/conversation-enrichment-stockmarket/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/jobs/Scheduled/conversation-enrichment-stockmarket/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in jobs/Scheduled/conversation-enrichment-stockmarket/SKILL.md`

### 5. [High] Refactor hardcoded user absolute path in jobs/Scheduled/daily-deals-digest/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`jobs/Scheduled/daily-deals-digest/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/jobs/Scheduled/daily-deals-digest/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in jobs/Scheduled/daily-deals-digest/SKILL.md`

### 6. [High] Refactor hardcoded user absolute path in jobs/Scheduled/daily-gainers-digest/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`jobs/Scheduled/daily-gainers-digest/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/jobs/Scheduled/daily-gainers-digest/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in jobs/Scheduled/daily-gainers-digest/SKILL.md`

### 7. [High] Refactor hardcoded user absolute path in jobs/Scheduled/daily-thesis-delta-scan/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`jobs/Scheduled/daily-thesis-delta-scan/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/jobs/Scheduled/daily-thesis-delta-scan/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in jobs/Scheduled/daily-thesis-delta-scan/SKILL.md`

### 8. [High] Refactor hardcoded user absolute path in jobs/Scheduled/near-highs-digest/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`jobs/Scheduled/near-highs-digest/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/jobs/Scheduled/near-highs-digest/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in jobs/Scheduled/near-highs-digest/SKILL.md`

### 9. [High] Refactor hardcoded user absolute path in jobs/Scheduled/periodic-dead-code-scan/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`jobs/Scheduled/periodic-dead-code-scan/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/jobs/Scheduled/periodic-dead-code-scan/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in jobs/Scheduled/periodic-dead-code-scan/SKILL.md`

### 10. [High] Refactor hardcoded user absolute path in jobs/Scheduled/upload-stock-reports-to-google-drive/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`jobs/Scheduled/upload-stock-reports-to-google-drive/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/jobs/Scheduled/upload-stock-reports-to-google-drive/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in jobs/Scheduled/upload-stock-reports-to-google-drive/SKILL.md`

### 11. [High] Refactor hardcoded user absolute path in jobs/Scheduled/weekly-conversation-capture-stockmarket/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`jobs/Scheduled/weekly-conversation-capture-stockmarket/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/jobs/Scheduled/weekly-conversation-capture-stockmarket/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in jobs/Scheduled/weekly-conversation-capture-stockmarket/SKILL.md`

### 12. [High] Refactor hardcoded user absolute path in jobs/Scheduled/weekly-gainers-digest/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`jobs/Scheduled/weekly-gainers-digest/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/jobs/Scheduled/weekly-gainers-digest/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in jobs/Scheduled/weekly-gainers-digest/SKILL.md`

### 13. [High] Refactor hardcoded user absolute path in jobs/Scheduled/weekly-insight-review-stockmarket/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`jobs/Scheduled/weekly-insight-review-stockmarket/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/jobs/Scheduled/weekly-insight-review-stockmarket/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in jobs/Scheduled/weekly-insight-review-stockmarket/SKILL.md`

### 14. [High] Refactor hardcoded user absolute path in jobs/Scheduled/weekly-thesis-review/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`jobs/Scheduled/weekly-thesis-review/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/jobs/Scheduled/weekly-thesis-review/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in jobs/Scheduled/weekly-thesis-review/SKILL.md`

### 15. [High] Refactor hardcoded user absolute path in scripts/verify_dead_code.js
- **Category:** Coding Standard Violation
- **Target File:** [`scripts/verify_dead_code.js`](file:///Users/darshanpatel/code/stockmarket/scripts/verify_dead_code.js)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in scripts/verify_dead_code.js`

### 16. [High] Refactor hardcoded user absolute path in skills/tooling/conversation-capture/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`skills/tooling/conversation-capture/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/skills/tooling/conversation-capture/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in skills/tooling/conversation-capture/SKILL.md`

### 17. [High] Refactor hardcoded user absolute path in skills/tooling/cowork-task-architect/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`skills/tooling/cowork-task-architect/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/skills/tooling/cowork-task-architect/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in skills/tooling/cowork-task-architect/SKILL.md`

### 18. [High] Refactor hardcoded user absolute path in skills/tooling/github-skill-invoker/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`skills/tooling/github-skill-invoker/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/skills/tooling/github-skill-invoker/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in skills/tooling/github-skill-invoker/SKILL.md`

### 19. [High] Refactor hardcoded user absolute path in skills/tooling/skill-manager/SKILL.md
- **Category:** Coding Standard Violation
- **Target File:** [`skills/tooling/skill-manager/SKILL.md`](file:///Users/darshanpatel/code/stockmarket/skills/tooling/skill-manager/SKILL.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in skills/tooling/skill-manager/SKILL.md`

### 20. [High] Refactor hardcoded user absolute path in QUICKSTART.md
- **Category:** Coding Standard Violation
- **Target File:** [`QUICKSTART.md`](file:///Users/darshanpatel/code/stockmarket/QUICKSTART.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in QUICKSTART.md`

### 21. [High] Refactor hardcoded user absolute path in README.md
- **Category:** Coding Standard Violation
- **Target File:** [`README.md`](file:///Users/darshanpatel/code/stockmarket/README.md)
- **Details:** Hardcoded path(s) found: /Users/darshan.patel/code/personal. Use process.cwd(), relative paths, or environment variables instead.
- **Recommended Action:** `[REFACTOR] Replace static absolute paths in README.md`

