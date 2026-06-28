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

When a Cowork task is created or modified, it must be split into two components:

| Component | Responsibility | Runs When |
|---|---|---|
| **Companion Script** | All computation, data fetching, parsing, formatting, filtering, sorting, aggregation | First — before the model |
| **Task Prompt** | Reasoning, judgment, synthesis, decisions, recommendations | After the script outputs are ready |

The script resolves all facts. The prompt interprets them.

---

## Step-by-Step Workflow

### Step 1 — Understand the Task

Ask the user (or infer from context):
1. What should this task *do* end-to-end?
2. What data/files/APIs does it need to touch?
3. What decision or synthesis does the model need to make?
4. What is the output format / where does it go?
5. How often does it run, and what triggers it?

### Step 2 — Partition the Work

Apply the boundary rule to every operation in the task:

**Goes in the Script (deterministic):**
- File reads/writes (CSV, JSON, Excel, TXT, logs)
- API calls (fetch data, paginate, authenticate)
- Parsing (HTML, PDF, JSON, XML)
- Formatting (date/number formatting, string transforms)
- Filtering and sorting (by date, value, flag)
- Aggregation (sum, count, group-by, rolling averages)
- Deduplication, joins, schema normalization
- Computing derived fields (ratios, deltas, % change)

**Goes in the Prompt (judgment):**
- Interpreting whether a number is "good" or "bad"
- Writing a recommendation, summary, or narrative
- Deciding what action to take given ambiguity
- Flagging anomalies that require human judgment
- Synthesizing multiple data sources into a conclusion
- Drafting communications (emails, alerts, reports)

**Gray area rule:** If it can be computed with a function and the same inputs always yield the same outputs → script. If it requires weighing tradeoffs or reading context → prompt.

### Step 3 — Write the Companion Script

Generate a Python script (preferred) or bash script that:

```python
# Structure every companion script like this:

#!/usr/bin/env python3
"""
Task: <task name>
Purpose: Pre-computes all deterministic inputs for the Claude task prompt.
Output: Writes structured JSON to stdout or a temp file for the prompt to consume.
"""

import json, sys
# ... imports

def fetch_data():
    """All API calls / file reads here."""
    pass

def process(raw):
    """All parsing, filtering, sorting, aggregation here."""
    pass

def format_output(processed):
    """Normalize into a clean structure the prompt can directly use."""
    pass

if __name__ == "__main__":
    raw = fetch_data()
    processed = process(raw)
    output = format_output(processed)
    print(json.dumps(output, indent=2))
    # OR: write to /tmp/task_output.json for the prompt to read
```

**Script rules:**
- Must be idempotent — safe to re-run
- Must handle errors gracefully (try/except with meaningful messages)
- Must produce a clean, flat JSON output that the prompt can directly read
- Must not contain any "reasoning" or narrative — only data
- Should be fast — if slow, add caching or pagination logic

### Step 4 — Write the Task Prompt

The task prompt must follow this template:

```
## Context
[1-2 lines: what this task does and when it runs]

## Input
The companion script has already run and produced the following output:
<paste or reference script output structure here>

## Your Job
[Describe ONLY the judgment/reasoning/synthesis work]

Do NOT re-compute anything the script already computed.
Do NOT re-fetch any data.
Do NOT re-sort or re-filter. The script has done this.

## Output Format
[Describe exact output: file, message, table, alert, etc.]
```

**Prompt rules:**
- Prompt should be under 300 words for most tasks
- Never instruct the model to "calculate", "fetch", "parse", "sort", "filter", "count", or "aggregate" — those belong in the script
- The prompt references script output, it does not reproduce script logic
- Prompt must specify output format exactly

### Step 5 — Validate the Split

Before finalizing, run this checklist:

- [ ] Does the script handle ALL data fetching and computation?
- [ ] Is the prompt free of any "calculate X" or "fetch Y" instructions?
- [ ] Does the script output a clean JSON the prompt can immediately use?
- [ ] Would the script produce identical output if run twice with the same inputs?
- [ ] Is the prompt focused entirely on what to *decide* or *synthesize*?
- [ ] Is error handling in the script (not the prompt)?
- [ ] Is the script idempotent and safe to re-run?

---

## Output to Deliver to User

Always deliver both artifacts:

### Artifact 1: `<task_name>_script.py`
Complete, runnable Python script with proper error handling and JSON output.

### Artifact 2: Task Prompt (in a code block)
Lightweight prompt text ready to paste into the Cowork task scheduler, referencing the script's output structure.

### Artifact 3: Quickstart comment (optional)
If the task needs env vars, API keys, or dependencies, list them in a `# SETUP` block at the top of the script.

---

## Examples of the Split in Practice

### ❌ Wrong — Everything in the Prompt
```
Task Prompt: "Fetch my last 7 days of trades from the Zerodha API, 
filter to only losing trades, calculate the average loss, 
sort by size, and write a short reflection on what went wrong."
```

### ✅ Right — Split Architecture
**Script does:** API auth → fetch trades → filter losing → calculate avg loss → sort by size → output JSON  
**Prompt does:** Read the JSON → write a short reflection on patterns and what to adjust

---

### ❌ Wrong — Prompt asks model to parse
```
Task Prompt: "Read the CSV at /data/watchlist.csv, 
parse each row, and for each stock check if RSI > 70..."
```

### ✅ Right
**Script does:** Read CSV → compute RSI for each ticker → flag RSI > 70 → output list  
**Prompt does:** For the flagged stocks, assess whether to trim or hold based on broader thesis

---

## When Modifying an Existing Task

If the user is updating an existing task:
1. Re-audit the current prompt for any computation that should move to the script
2. Update the script first, then update the prompt to consume the new output
3. Re-run the Step 5 checklist
4. Version the script (add `# v2 — added X` comment at top)

---

## Edge Cases

**"The task is very simple, does it need a script?"**  
Yes, if it touches any external data (file, API, network). The discipline matters more on simple tasks because the habit must generalize.

**"The script output is too large for the prompt context."**  
Summarize or truncate in the script itself. The script decides what's relevant, not the prompt.

**"The task is one-time, not recurring."**  
Still split. One-time tasks become recurring later. Start clean.

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
