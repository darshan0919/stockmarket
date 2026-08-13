# Daily Results & Guidance Extraction Pipeline Setup

## Overview
Created a robust nightly pipeline for quarterly results and guidance extraction with strict dependency gates. Each downstream task only runs if its upstream extraction succeeded.

---

## Tasks Created / Updated

### 1. Daily Quarterly Result Extraction
**Schedule:** 1:00 AM daily  
**Taskid:** `daily-quarterly-result-extraction`

- Fetches all companies that filed results on the previous day via Stockscans API
- Runs quarterly-result-extractor for bulk processing
- Persists `quarterly-result-documents` records to DB
- Verifies success before allowing downstream analysis task to run

### 2. Daily Quarterly Result Analysis (GATED)
**Schedule:** 1:15 AM daily  
**Taskid:** `daily-quarterly-result-analysis`

- **Dependency Gate:** Only runs if `daily-quarterly-result-extraction` verification check passed
- Reads quarterly-result-documents from DB for yesterday's date
- Applies 3-basket interpretation (Business / Risk / Management)
- Persists `quarterly-result` reports with conviction tags (STRUCTURAL / CYCLICAL / TEMPORARY)
- Renders interactive widget + PDF (saved to Drive)

### 3. Daily Guidance Document Extraction (UPDATED)
**Schedule:** 11:30 PM daily  
**Taskid:** `daily-guidance-extractor-scan`

- Updated with verification check
- Fetches guidance documents (Transcript + PPT + Result) from scan
- Persists `guidance-documents` records
- Verifies success before allowing forward-guidance task to run

### 4. Daily Forward Guidance with PEAD (UPDATED & GATED)
**Schedule:** 11:45 PM daily  
**Taskid:** `daily-forward-guidance-with-pead`

- **Dependency Gate:** Only runs if `daily-guidance-extractor-scan` verification check passed
- Extracts forward guidance and ranks by PEAD surprise potential
- Persists `forward-guidance` + `pead-ranking` records
- Runs within 15 min of extraction to ensure fresh document data

---

## Companion Scripts Created

### 1. `/scripts/jobs/daily_results_extractor.js`
Fetches companies that filed results on a given date using the **centralized StockscansClient** with the `resultsScan()` method.

**Features:**
- Uses the quality filters from your cURL example:
  - EPS Growth YoY >= 40%
  - Market Capitalization >= 300 Cr
  - EPS Growth QoQ >= 5%
- **Full pagination support** — fetches all pages for the given date concurrently
- Reuses existing `StockscansClient` (no API duplication)
- Added `resultsScan()` method to `StockscansClient` for this endpoint

**Usage:**
```bash
node daily_results_extractor.js --date 2026-08-10
node daily_results_extractor.js  # Defaults to yesterday
```

**Output:** JSON manifest with list of companies `{date, count, pageCount, companies[], status}`

### 2. `/scripts/jobs/check_extraction_success.js`
Verifies that extraction records were persisted to DB. Used as a gate before downstream analysis.

**Usage:**
```bash
node check_extraction_success.js --collection quarterly-result-documents --date 2026-08-11
node check_extraction_success.js --collection guidance-documents --date 2026-08-11
```

**Exit Codes:**
- `0` = Success (records found, analysis task can proceed)
- `1` = Failure (no records, analysis task will not run)

---

## Pipeline Flow

```
11:30 PM → guidance-document-extractor
         ↓ (+ verification check)
         ✅ Success? → Signal OK to 11:45 PM task
         ❌ Failure? → Forward-guidance-extractor does NOT run

11:45 PM → [CHECK] guidance-documents records exist?
         ↓ (gate: exit if check fails)
         forward-guidance-extractor + PEAD ranking
         ↓
         Persisted to DB + Drive
         
---

1:00 AM → daily_results_extractor script (fetch yesterday's results)
        ↓
        quarterly-result-extractor (batch process all companies)
        ↓ (+ verification check)
        ✅ Success? → Signal OK to 1:15 AM task
        ❌ Failure? → Quarterly-result-analysis does NOT run

1:15 AM → [CHECK] quarterly-result-documents records exist?
        ↓ (gate: exit if check fails)
        quarterly-result-analysis (3-basket interpretation)
        ↓
        Persisted to DB + PDF to Drive
```

---

## Key Features

### Dependency Gates
- **Forward-guidance-extractor** will NOT run if guidance-document-extractor fails
- **Quarterly-result-analysis** will NOT run if quarterly-result-extractor fails
- Gates prevent cascading failures and wasted computation

### Idempotent Extraction
- All scripts handle re-runs gracefully
- DB records use deterministic IDs, so updates merge automatically
- Safe to rerun same day without duplication

### Date Handling
- Results extraction uses **previous day's date** (yesterday)
- Guidance extraction uses **today's date** (more recent documents)
- Allows time for results/documents to be filed and indexed

### Data Persistence
- All extraction records persisted to DB with:
  - Deterministic `id` (companyId + date + type)
  - `creationTime`, `modifiedTime`, `creator` envelope
  - `date` field for filtering/querying
- PDFs saved to `data/agent-outputs/pdfs/` and pushed to Drive
- `yarn data:push` called at end of each task

---

## Next Steps

### ✅ Skills Updated (2026-08-11)

All three skills have been updated to accept and use the `--date YYYY-MM-DD` parameter:

1. **`quarterly-result-extractor`** ✅
   - Now accepts `--companyId NSE:X` (previously `--ticker`)
   - Added `--date YYYY-MM-DD` optional parameter for scoped extraction
   - Persists records with `date` field set to parameter value or extraction date
   - Updated documentation with scheduled-job usage examples

2. **`quarterly-result-analysis`** ✅
   - Added "Input" section documenting `--companyId` and `--date` parameters
   - Phase 0 DB lookup now respects `--date` for scoped queries (scheduled job mode)
   - Falls back to latest record if no date provided (interactive mode)
   - Maintains backward compatibility with existing ticker-only usage

3. **`forward-guidance-extractor`** ✅
   - Added "Input Parameters" section documenting `--date` support
   - Smart DB-availability check now filters by date when `--date` provided
   - Scopes queries to records created on the specified date (scheduled job mode)
   - Maintains backward compatibility with date-agnostic queries (interactive mode)

### Changes Made
- Updated SKILL.md frontmatter descriptions (if needed) to reflect date-parameter support
- Added date-scoped query patterns to all three skills' DB-lookup sections
- Documented backward compatibility: all skills still work in interactive mode without `--date`
- All changes propagate to the scheduled task pipeline (1:00 AM & 1:15 AM for quarterly; 11:30 PM & 11:45 PM for guidance)

---

## Troubleshooting

### Forward-guidance task doesn't run at 11:45 PM
**Check:** Did the 11:30 PM guidance-extractor check pass?
```bash
cat /Users/darshanpatel/Desktop/Cowork/Scheduled/daily-guidance-extractor-scan/logs/latest.log
```

### Quarterly-result-analysis doesn't run at 1:15 AM
**Check:** Did the 1:00 AM results-extractor check pass?
```bash
cat /Users/darshanpatel/Desktop/Cowork/Scheduled/daily-quarterly-result-extraction/logs/latest.log
```

### Check DB records manually
```bash
# Inside the repo, run:
node -e "
const db = require('./packages/jobs-runtime/lib/db.js');
const recs = db.find('reports', {
  type: 'quarterly-result-documents',
  date: '2026-08-10'
});
console.log(JSON.stringify(recs, null, 2));
"
```

---

## Files Modified/Created

```
✅ Created:
  - /scripts/jobs/daily_results_extractor.js (uses StockscansClient.resultsScan())
  - /scripts/jobs/check_extraction_success.js
  - /Users/darshanpatel/Desktop/Cowork/Scheduled/daily-quarterly-result-extraction/SKILL.md
  - /Users/darshanpatel/Desktop/Cowork/Scheduled/daily-quarterly-result-analysis/SKILL.md

✅ Updated:
  - /stock-api/src/clients/StockscansClient.js (added resultsScan() method)
  - /Users/darshanpatel/Desktop/Cowork/Scheduled/daily-guidance-extractor-scan/SKILL.md (added verification check)
  - /Users/darshanpatel/Desktop/Cowork/Scheduled/daily-forward-guidance-with-pead/SKILL.md (added dependency gate)
```

---

## Implementation Notes

### StockscansClient Enhancement
- Added `resultsScan(payload, opts)` method to the centralized client
- Supports full filter array + date filtering + pagination
- Available for reuse by any other skill/script that needs filtered results scans

### Why JavaScript Over Python
- Reuses existing StockscansClient (single source of truth for Stockscans API)
- Consistent with repo's stock-api codebase
- No separate auth/token handling — uses the client's existing auth layer
- Easier to maintain and extend alongside other API consumers

## Cost Optimization Tips

**For Next Run:**
1. The `check_extraction_success.js` script runs zero-token DB queries — reuse it as a template for any other gate checks
2. Pagination in `daily_results_extractor.js` is concurrent (not sequential) — pages are fetched in parallel to minimize latency
3. Batch all 4-8 company extractions into one parallel run rather than sequential — reduces wall-clock time significantly
4. Consider caching the results manifest if running multiple analysis jobs same day (e.g., if new results file mid-day) — avoid re-fetching the API
