---
name: cowork-task-architect
description: >
  Companion skill for Claude Cowork task creation and modification. Use this skill EVERY TIME a new scheduled task is created or an existing task is being updated in Claude Cowork. Triggers on phrases like "create a task", "schedule a task", "set up a cowork task", "add a recurring task", "modify this task", "update the task prompt", "I want to automate X in Cowork", or any time the user describes what they want a Cowork task to do. This skill enforces the Script-First architecture: a companion Python/bash script handles all deterministic operations (file I/O, API calls, parsing, formatting, filtering, sorting, aggregation) while the task prompt stays lightweight and focuses only on judgment and synthesis. Never let the model do in reasoning what a script can compute deterministically. Always apply this skill — even for "simple" tasks — because even simple tasks benefit from this separation.
---

# Cowork Task Architect

Enforces the **Script-First architecture** for every Claude Cowork scheduled task:  
> **Script = deterministic + repeatable. Task Prompt = ambiguous + requires judgment.**

---

## Core Principle

When a Cowork task is created or modified, it must be designed with a **strict orchestration architecture**:

| Component | Responsibility |
|---|---|
| **APIs / Scripts / Skills** | All computation, data fetching, parsing, filtering, logic, judgment, and formatting. |
| **Scheduled Cowork Task** | Pure orchestration. It only handles calling the respective APIs/scripts/skills in order. It has NO logic of its own. |

The scripts and skills do all the real work. The scheduled task simply orchestrates them using exact file paths.

---

## Step-by-Step Workflow

### Step 1 — Figure out which apis/scripts/skills to create

Ask the user (or infer from context):
1. What should this task *do* end-to-end?
2. What data/files/APIs does it need to touch?
3. Based on the requirements, figure out exactly which APIs, companion scripts, or skills need to be created.

### Step 2 — Create them and place them in the stockmarket project

Create the necessary APIs, scripts, and skills, and place them in the appropriate places in the `stockmarket` project.

Apply the boundary rule to every operation in the task:

**Goes in the Script/API/Skill:**
- File reads/writes (CSV, JSON, Excel, TXT, logs)
- API calls (fetch data, paginate, authenticate)
- Parsing (HTML, PDF, JSON, XML)
- Formatting (date/number formatting, string transforms)
- Filtering and sorting (by date, value, flag)
- Aggregation (sum, count, group-by, rolling averages)
- Deduplication, joins, schema normalization
- Any judgment, reasoning, or synthesis (encapsulate in a skill if needed)

Generate Python scripts (preferred) or bash scripts that:

```python
# Structure every companion script like this:

#!/usr/bin/env python3
"""
Task: <task name>
Purpose: Handles logic for the task.
"""

import json, sys
# ... imports

def fetch_data():
    """All API calls / file reads here."""
    pass

def process(raw):
    """All logic, parsing, filtering, sorting, aggregation here."""
    pass

if __name__ == "__main__":
    raw = fetch_data()
    processed = process(raw)
    print(json.dumps(processed, indent=2))
```

**Script rules:**
- Must be idempotent — safe to re-run
- Must handle errors gracefully (try/except with meaningful messages)
- Should be fast — if slow, add caching or pagination logic

**Data persistence rules (MANDATORY when a task/script stores anything):**
Every task/script that persists data must comply with `docs/DATA_RULES.md`
(companion: `docs/DATA_ECOSYSTEM.md`; conventions: `skills/_shared/conventions.md`
§3, §5–8). In short:
- Only five destinations exist: an existing collection via
  `packages/jobs-runtime/lib/db.js` helpers (`saveReport` / `appendEvents` /
  `appendNotes` / `appendValidations` / `saveThesis` / `upsertMany`),
  `data/cache/` (heavy regenerable derivables), `data/runs/` (raw per-run dumps),
  `data/assets/` (template renders of JSON DTOs), or nothing (re-fetchable data
  isn't stored). Never repo root, never cwd, never a new ad-hoc folder.
- Prefer an existing collection + new `type` over a new collection; a new
  collection requires the full checklist in DATA_RULES §3 (two whitelist
  registrations, docs, tests).
- Every record carries the envelope: deterministic `id`, `creationTime`,
  `modifiedTime`, `creator` (the task/skill name), plus `companyId` / `date` /
  `type` where applicable. Batch writes; NO file deletions in any write path
  (Cowork mounts throw EPERM on delete — an inline `rm` aborts the save).
- Schedule with buffers: ≥ 30 min from any existing task, ≥ 60 min from any task
  writing the same collection (see DATA_RULES §6 for the current slot map).
- **Files-touched manifest (DATA_RULES §7):** the task's final run summary MUST
  list every file created/modified — from `db.touchedFiles()` /
  `StorageService.touchedFiles()` in scripts, and the `data:push` `↑ <file>`
  lines — with record counts for collections. Bake this into every generated
  task prompt's reporting step.

### Step 3 — Create/update the task in the live Cowork scheduler

The `jobs/` folder is linked directly as the Cowork root folder, so there is no separate repo copy to maintain — the live Cowork scheduler is the single source of truth. Create or update the task there via the `create_scheduled_task` / `update_scheduled_task` tools.

**Critical Rules for the Task Prompt:**
1. It doesn't have any logic of its own.
2. Its job is ONLY to orchestrate the execution of the respective apis/scripts/skills.
3. It must refer to the **exact absolute paths** of the respective apis/scripts/skills for invoking them.
4. The task prompt must always include a fallback github file path for each script/skill, in case the local file path is missing or inaccessible.

The task prompt body must follow this template:

```
## Context
[1-2 lines: what this task does and when it runs]

## Execution Plan
Call the following exact scripts/APIs in order:
1. Execute script: /path/to/stockmarket/scripts/script_name.py
   (Fallback: https://raw.githubusercontent.com/darshan0919/stockmarket/main/scripts/script_name.py)
2. Execute skill: /path/to/stockmarket/skills/skill_name/SKILL.md
   (Fallback: https://raw.githubusercontent.com/darshan0919/stockmarket/main/skills/skill_name/SKILL.md)
3. [etc...]
N-1. (if the task persisted anything) Execute: node /Users/darshan.patel/code/personal/stockmarket/packages/jobs-runtime/scripts/data.js push
   (idempotent, push-only — see docs/DATA_RULES.md §5), then include a
   "Files touched" section in the run summary listing every file created or
   modified (from the scripts' touchedFiles() output and the push ↑ lines —
   docs/DATA_RULES.md §7)
N. (FINAL STEP ALWAYS) Execute script: /Users/darshan.patel/code/personal/stockmarket/scripts/track_invocation.py --name [insert task name] --type task

Do NOT run any logic, calculations, data fetching, or file modifications directly. Your only job is to orchestrate these existing scripts/skills exactly as specified.
```

Call the tool directly — do not just instruct the user to paste something manually:
- New task → `mcp__scheduled-tasks__create_scheduled_task` with `taskId`, `prompt` (the body above), `description`, and `cronExpression` or `fireAt`.
- Existing task → `mcp__scheduled-tasks__update_scheduled_task` with the same `taskId` and whichever fields changed.

---

## Output to Deliver to User

Always deliver the following:

### Artifact 1: Scripts and Skills Creation
Create the necessary scripts/skills as files in the appropriate directories of the `stockmarket` project. Provide the user with the absolute paths to the newly created files.

### Artifact 2: Task Prompt (in a code block)
Lightweight prompt text, orchestrating the scripts/skills with absolute paths. This is not just a snippet to hand the user to paste — it must already have been submitted via `create_scheduled_task`/`update_scheduled_task` per Step 3.

### Artifact 3: Quickstart comment (optional)
If the task needs env vars, API keys, or dependencies, list them in a `# SETUP` block at the top of the relevant script.

---

## Examples of the Orchestration in Practice

### ❌ Wrong — Task has its own logic
```
Task Prompt: "Fetch my last 7 days of trades from the Zerodha API, 
filter to only losing trades, calculate the average loss, 
sort by size, and write a short reflection on what went wrong."
```

### ✅ Right — Pure Orchestration
**Script does:** API auth → fetch trades → filter losing → calculate avg loss → sort by size → output JSON to a file
**Skill does:** Reads the JSON → writes a short reflection on patterns
**Task Prompt does:** Execute `/path/to/stockmarket/scripts/fetch_losing_trades.py` and then execute `/path/to/stockmarket/skills/write_reflection/SKILL.md`

---

### ❌ Wrong — Task asks model to parse
```
Task Prompt: "Read the CSV at /data/watchlist.csv, 
parse each row, and for each stock check if RSI > 70..."
```

### ✅ Right — Pure Orchestration
**Script does:** Read CSV → compute RSI for each ticker → flag RSI > 70 → write output 
**Task Prompt does:** Execute `/path/to/stockmarket/scripts/check_rsi.py`.

---

## When Modifying an Existing Task

If the user is updating an existing task:
1. Re-audit the current prompt for any logic or computation that should move to a script or skill.
2. Update the script/skill first, then update the prompt to only orchestrate the calls with exact paths.
3. Version the script (add `# v2 — added X` comment at top)

---

## Edge Cases

**"The task is very simple, does it need a script?"**  
Yes. All logic and data fetching belong in a script or skill. The task prompt must remain purely orchestration.

**"I don't know how to write the script."**  
Describe what data you need and where it comes from. This skill will write the script for you.

---

## Stockscans API Integration

All Stockscans API logic — authentication, token resolution, document fetching, announcements pagination, scan execution — lives in a **single canonical file** in the Company Research project:

```
/mnt/project/stockscans_client.py
```

### When to use it

Any Cowork task companion script that needs to:
- Fetch documents (transcripts, annual reports, PPTs, results)
- Pull corporate announcements
- Run a saved scan to get a company universe
- Resolve / validate the authtoken

**Must import from this file, not duplicate the logic.**

### How to import in a companion script

```python
import sys
sys.path.insert(0, "/mnt/project")
from stockscans_client import (
    load_authtoken,          # token resolution (file → env → fallbacks)
    check_token_expiry,      # JWT decode + warn/error
    fetch_documents_list,    # GET /api/company/documents/{ticker}
    filter_documents,        # type + date + last-N filtering
    download_one,            # S3 PDF download with retries
    iter_announcements,      # paginated POST /api/company/announcements
    resolve_scan_universe,   # saved-scan → company list
    write_manifest,          # manifest.json writer
)
```

### What NOT to do in companion scripts

```python
# ❌ Never duplicate auth logic inline
token = open("/mnt/project/Stockscans_authtoken").read().strip()

# ❌ Never hardcode the API URL
url = "https://www.stockscans.in/api/company/documents/" + ticker

# ❌ Never copy-paste check_token_expiry or TOKEN_FALLBACKS
```

### Authtoken resolution order (handled by `load_authtoken`)

1. `--authtoken-file` CLI arg (if your script exposes one)
2. `STOCKSCANS_AUTHTOKEN` environment variable
3. `/mnt/project/Stockscans_authtoken` ← primary location in Cowork
4. `/mnt/project/stockscans_authtoken` (lowercase fallback)
5. `/mnt/user-data/uploads/Stockscans_authtoken`
6. `~/.stockscans_authtoken`

### Minimal companion script pattern for Stockscans tasks

```python
#!/usr/bin/env python3
"""
Task: <task name>
Purpose: Fetch and pre-process Stockscans data for the Claude task prompt.
"""
import sys, json
sys.path.insert(0, "/mnt/project")
from stockscans_client import load_authtoken, check_token_expiry, fetch_documents_list, filter_documents

def main():
    token = load_authtoken()
    check_token_expiry(token)   # warns if expiring; errors if expired

    docs = fetch_documents_list("NSE:TICKER", token)
    filtered = filter_documents(docs, types=["Transcript"], last_n=4)

    print(json.dumps({"documents": filtered}, indent=2))

if __name__ == "__main__":
    main()
```
