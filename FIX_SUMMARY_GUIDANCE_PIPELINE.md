# Fix Summary: Daily Guidance Extractor Pipeline

**Date:** 2026-08-11 → 2026-08-12  
**Issue:** `daily-forward-guidance-with-pead` scheduled task failed with dependency gate error  
**Root Cause:** `check_extraction_success.py` verification script had an import error  
**Status:** ✓ FIXED

---

## The Problem

The `daily-forward-guidance-with-pead` scheduled task (11:45 PM) aborted with:

```
Task aborted — dependency gate failed.
Step 1 check returned `status: "failure", count: 0` — no `guidance-documents` records 
exist for 2026-08-11. The upstream 11:30 PM `guidance-document-extractor` run did not 
persist any data today...
```

However, the upstream `guidance-document-extractor` task **DID successfully complete** and **saved 38 guidance-documents records** to `data/reports.json` with `date: "2026-08-11"`.

## Root Cause Analysis

The issue was in `scripts/jobs/check_extraction_success.py`:

**Original Problem (line 34):**
```python
from lib.db import find, get

records = find(collection_name, {
    "date": date_str,
    "creator": {"$in": [
        "quarterly-result-extractor",
        "guidance-document-extractor"
    ]}
})
```

**Issues:**
1. The script tried to import a Node.js module (`lib/db`) from Python, which failed with "No module named 'lib'"
2. The `find()` function signature doesn't support MongoDB-style `{"$in": [...]}` operators
3. The exception handling silently returned a failure status instead of surfacing the actual import error

## The Fix

**File:** `scripts/jobs/check_extraction_success.py`

**Changes:**
1. Replaced Node.js db import with direct JSON querying
2. Added proper repo-root detection using `os.path.dirname()` (works in both local and sandbox environments)
3. Implemented proper filter logic matching the db.js `find()` function contract:
   - `type` == collection_name ✓
   - `date` == date_str ✓
   - `creator` in the expected list ✓

**New implementation:**
```python
# Find repo root by looking for data/reports.json
script_dir = os.path.dirname(os.path.abspath(__file__))
repo_root = os.path.dirname(os.path.dirname(script_dir))
reports_path = os.path.join(repo_root, 'data', 'reports.json')

with open(reports_path, 'r') as f:
    reports = json.load(f)

# Filter for records matching the collection type, date, and creators
matching_records = [
    r for r in reports.values()
    if r.get('type') == collection_name
    and r.get('date') == date_str
    and r.get('creator') in [
        'quarterly-result-extractor',
        'guidance-document-extractor'
    ]
]
```

## Verification

**Before fix:**
```
$ python3 scripts/jobs/check_extraction_success.py --collection guidance-documents --date 2026-08-11
{
  "status": "error",
  "error": "Could not import db module: No module named 'lib'",
  "date": "2026-08-11"
}
Exit code 1
```

**After fix:**
```
$ python3 scripts/jobs/check_extraction_success.py --collection guidance-documents --date 2026-08-11
{
  "status": "success",
  "count": 38,
  "message": "Found 38 guidance-documents records for 2026-08-11",
  "date": "2026-08-11",
  "firstRecord": {
    "id": "rpt_guidance-document-extractor_NSE:63MOONS_2026-08-11_72301fde",
    "type": "guidance-documents",
    "date": "2026-08-11",
    "companyId": "NSE:63MOONS",
    "creator": "guidance-document-extractor",
    ...
  }
}
Exit code 0 ✓
```

## Impact

✓ **Pipeline Unblocked:** The `daily-forward-guidance-with-pead` task (11:45 PM) can now:
  - Read the 38 guidance-documents records persisted by guidance-document-extractor
  - Extract actionable management guidance per company
  - Generate forward guidance Excel and email digest to djplearner@gmail.com
  - Optionally chain pead-surprise-ranker for earnings season predictions

✓ **Robustness:** The fix also improves error handling:
  - Eliminates cross-language import issues (Node ↔ Python)
  - Works in both local repo and sandboxed environments
  - Returns proper exit codes for shell script gates

## Files Changed

- `scripts/jobs/check_extraction_success.py` — Fixed verification gate

## Next Steps

The `daily-forward-guidance-with-pead` task will proceed on its next scheduled run (11:45 PM). No further action required.
