# Company Sector-Industry Sync — Terminal Command

## Quick Start
Run this command in your terminal to sync sector/industry data from Stockscans:

```bash
cd /Users/darshanpatel/code/stockmarket && node stock-api/bin/sync-company-sector-industry.js
```

## What This Does
- Fetches sector + industry classification for all ~6,475 companies from Stockscans API
- Updates `data/companies.json` with new sector/industry fields
- Handles rate-limiting automatically (5s delay between pages, exponential backoff on 429)
- **Supports resumption**: If interrupted, re-run the same command to continue from where it left off
- **Commits partial data**: Updates are written to disk after each page, not just at the end

## How It Works

### Normal run (first time or complete restart)
```bash
cd /Users/darshanpatel/code/stockmarket && node stock-api/bin/sync-company-sector-industry.js
```
- Fetches all pages sequentially
- Saves progress to `.cache/sync-company-sector-industry.json` after each page
- Takes ~10-15 minutes with default 5s inter-page delay

### Resume an interrupted run
```bash
cd /Users/darshanpatel/code/stockmarket && node stock-api/bin/sync-company-sector-industry.js
```
- Same command automatically resumes from last cached offset
- Skips already-fetched pages, continues from where it stopped
- No need to pass any flags

### Start fresh (clear cache, ignore previous progress)
```bash
cd /Users/darshanpatel/code/stockmarket && node stock-api/bin/sync-company-sector-industry.js --reset-cache
```

### Adjust delays (if you hit rate limits)
```bash
cd /Users/darshanpatel/code/stockmarket && node stock-api/bin/sync-company-sector-industry.js --page-delay-ms 10000
```
- Default: 5000ms (5s between pages)
- If you see HTTP 429 errors: increase to 10000 or 15000ms

## Files Involved

### Input (API)
- Stockscans `/api/company/scans/run` endpoint

### Output (Written to disk)
- `data/companies.json` — company records with new `sector` and `industry` fields
- `data/.cache/sync-company-sector-industry.json` — progress tracking (auto-deleted when complete)

### Data Structure
Each company record gets updated with:
```json
{
  "id": "company-id",
  "sector": "Banks",
  "industry": "Banks - Private"
}
```

## Monitoring Progress

Watch the output in real-time:
```bash
cd /Users/darshanpatel/code/stockmarket && node stock-api/bin/sync-company-sector-industry.js 2>&1 | tee sync.log
```

Each line shows progress:
```
[sync-company-sector-industry] page offset 0: 50 rows, total=6475
[sync-company-sector-industry] page offset 50: 50 rows
[sync-company-sector-industry] upserted batch: +50 inserted, +0 updated
...
```

## Issues & Fixes

### "Why didn't data get written on interrupt?"
**Old behavior**: Script only wrote data if it completed all pages.
**New behavior**: Partial data is written after each page via `db.upsertMany()` batching.

### "Why didn't it resume?"
**Old behavior**: No resumption support; always started from page 0.
**New behavior**: Progress cached to `data/.cache/sync-company-sector-industry.json` and loaded on re-run.

### "I see HTTP 429 (rate limit) errors"
The Stockscans API bans requests for ~8-9 minutes after ~2,250 companies are fetched.
- If backoff completes: script resumes automatically
- If timeout expires: just re-run the same command to resume

## Expected Runtimes

| Scenario | Duration |
|----------|----------|
| Full run (fresh, 5s delay) | ~10-15 min |
| Full run (5s delay + one rate-limit ban) | ~15-25 min |
| Resume from page 2300 | ~3-5 min |
| Check data coverage | < 1 sec |

## Verify Results

Check how many companies got sector/industry data:
```bash
node -e "
const fs = require('fs');
const cos = JSON.parse(fs.readFileSync('data/companies.json', 'utf8'));
const withSector = Object.values(cos).filter(c => c.sector).length;
console.log('Coverage:', withSector, '/', Object.keys(cos).length, 
  '(' + ((withSector/Object.keys(cos).length)*100).toFixed(1) + '%)');
"
```

---

**Questions?** Check the full script at `stock-api/bin/sync-company-sector-industry.js` for implementation details.
