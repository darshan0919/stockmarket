---
name: daily-guidance-extractor-scan
description: Daily guidance document extraction for saved scan 429918e3098ce660baec9f22 (FIX: now uses orchestrator to ensure Step 2 always runs)
---

## Context

Run the guidance-document-extractor skill daily at 11:30 PM to bulk-fetch and extract guidance documents (Transcript + PPT + Result) for all companies in the saved Stockscans scan at https://www.stockscans.in/scans/saved/429918e3098ce660baec9f22. 

**IMPORTANT (2026-08-12):** This task now uses the orchestrator (`orchestrate_extraction.js`) which ensures ALL 4 steps complete, including Step 2 (excerpt extraction). This prevents the bug where records were saved with empty excerpts.

## Execution Plan

### Step 1: Run Orchestrator (Fetch + Extract + Validate + Persist)

```bash
cd /Users/darshanpatel/code/stockmarket

export STOCKSCANS_AUTH_TOKEN="$(grep '^STOCKSCANS_AUTH_TOKEN' .env | cut -d= -f2-)"

node skills/equity-research/guidance-document-extractor/scripts/orchestrate_extraction.js \
  --scan-url "https://www.stockscans.in/scans/saved/429918e3098ce660baec9f22"
```

**What this does:**
- **Step 1 (Fetch):** Bulk-fetches Transcript, PPT, Result for all companies in the scan (zero LLM tokens)
- **Step 2 (Extract):** Runs cheap-tier excerpt extraction (MANDATORY - the fix for empty excerpts bug)
- **Step 3 (Validate):** Validates excerpt structure
- **Step 4 (Persist):** Saves guidance-documents records to `data/reports.json` with `excerpts` populated and `excerptsPending: false`

**Output:**
```json
{
  "status": "success",
  "step1": { "companiesFetched": 38 },
  "step2": { "totalExcerpts": 466, "companiesWithExcerpts": 32 },
  "step4": { "recordsSaved": 38 },
  "note": "All steps completed including mandatory Step 2 excerpt extraction"
}
```

### Step 2: Verify Extraction Success

```bash
python3 /Users/darshanpatel/code/stockmarket/scripts/jobs/check_extraction_success.py \
  --collection guidance-documents \
  --date $(date +%Y-%m-%d)
```

**Purpose:** Verify that at least one guidance-documents record was persisted with today's date.

**Exit codes:**
- `0`: Success — records found, downstream task will proceed
- `1`: Failure — no records found, downstream task will be skipped

### Step 3: Trigger Downstream Task (if verification passed)

If Step 2 verification succeeds (exit code 0), the verification script automatically signals:
```
Downstream task ready: daily-forward-guidance-with-pead (11:45 PM)
```

The downstream task will:
- Read the 38 guidance-documents records
- Extract actionable management guidance per company
- Generate forward guidance Excel and email digest
- Optionally chain PEAD surprise ranker for earnings season

### Step 4: Track Invocation

```bash
python3 /Users/darshanpatel/code/stockmarket/scripts/metrics/track_invocation.py \
  --name daily-guidance-extractor-scan \
  --type task \
  --model haiku \
  --files 1
```

## Key Changes (2026-08-12 Fix)

**OLD (buggy flow):**
1. Fetch documents
2. Save records with `excerptsPending: true` (Step 2 skipped)
3. Downstream task receives incomplete records → blocked

**NEW (fixed flow - using orchestrator):**
1. Fetch documents
2. Extract excerpts (MANDATORY)
3. Validate
4. Persist with `excerpts` populated and `excerptsPending: false`
5. Downstream task receives complete records → proceeds

## Safety Guarantees

✓ **Step 2 is mandatory** — Cannot be skipped, runs inline in orchestrator  
✓ **Records are never incomplete** — All 4 steps run atomically  
✓ **Save script validates** — Aborts if excerpt extraction didn't complete  
✓ **Status field is accurate** — `excerptsPending: false` means extraction actually ran  

## Idempotency

Each run is idempotent:
- Same-day re-runs upsert records (deterministic IDs)
- Guidance excerpts are replaced, not accumulated
- No duplicate records created

## Monitoring

**Alert if:**
1. Orchestrator fails with exit code ≠ 0
2. Verification script finds 0 records (extraction didn't persist)
3. Downstream task is skipped (verify gate failed)

**Check record status:**
```bash
node -e "
const fs = require('fs');
const reports = JSON.parse(fs.readFileSync('data/reports.json', 'utf8'));
const guidance = Object.values(reports).filter(r => 
  r.type === 'guidance-documents' && 
  r.date === new Date().toISOString().slice(0, 10)
);
console.log('Records:', guidance.length);
console.log('With excerpts:', guidance.filter(r => r.body).length);
"
```

## Documentation

- **Orchestrator:** `skills/equity-research/guidance-document-extractor/scripts/orchestrate_extraction.js`
- **Safeguards:** `skills/equity-research/guidance-document-extractor/EXTRACTION_SAFEGUARDS.md`
- **Skill SKILL.md:** `skills/equity-research/guidance-document-extractor/SKILL.md`

## Related Tasks

- **11:45 PM:** `daily-forward-guidance-with-pead` (reads output of this task)
- **Previous issue (fixed):** Empty excerpts in guidance-documents records (2026-08-11)
- **Verification gate (fixed):** `check_extraction_success.py` Python/Node import error (2026-08-12)
