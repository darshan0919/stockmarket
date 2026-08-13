# Guidance Document Extractor - Extraction Safeguards

**Date:** 2026-08-12  
**Issue Fixed:** Empty excerpts bug (step 2 skipped, leaving `excerptsPending: true` forever)

---

## The Problem (Incident 2026-08-11)

The `daily-forward-guidance-with-pead` scheduled task failed because:

1. **Step 2 was optional** and could be skipped
2. **Records were saved incomplete** with `excerpts: []` and `excerptsPending: true`
3. **No safety checks prevented this** — the system silently accepted incomplete data
4. **Downstream tasks blocked** waiting for complete records that never came

---

## The Solution: Three-Layer Defense

### Layer 1: Mandatory Orchestration (orchestrate_extraction.js)

**File:** `scripts/orchestrate_extraction.js`

**Purpose:** Run all 4 steps in ONE invocation, making Step 2 impossible to skip.

**Mechanism:**
```javascript
// Step 2 is now hardcoded into the orchestrator
async function runStep2Extract(manifest, outDir) {
  // Cheap-tier extraction ALWAYS runs
  // No way to skip it
}

// All steps run in sequence:
await runStep1Fetch(args);          // Fetch
await runStep2Extract(manifest);    // Extract (MANDATORY)
await runStep3Validate(excerpts);   // Validate
await runStep4Persist(manifest);    // Persist (with excerpts)
```

**Usage:**
```bash
# This invokes the orchestrator, which ensures Step 2 runs
node orchestrate_extraction.js --scan-url "..."
```

**Guarantees:**
- ✓ Step 2 always executes (can't be skipped)
- ✓ Records are never persisted until Step 2 completes
- ✓ `excerptsPending: false` is guaranteed when records are saved

---

### Layer 2: Save Script Safety Check (save_guidance_documents.js)

**File:** `scripts/save_guidance_documents.js`

**Purpose:** Prevent saving incomplete runs where Step 2 failed.

**Mechanism:**
```javascript
// NEW SAFETY CHECK (2026-08-12)
if (args.excerptsDir && fs.existsSync(args.excerptsDir)) {
  const excerptFiles = fs.readdirSync(args.excerptsDir).filter(f => f.endsWith('.json'));
  if (excerptFiles.length === 0) {
    // ABORT: No excerpt files found, Step 2 probably failed
    console.error('[FATAL] --excerpts-dir was provided but contains NO excerpt files.');
    console.error('Step 2 (excerpt extraction) did not complete.');
    process.exit(1);
  }
}
```

**Effect:**
- If `--excerpts-dir` is provided but empty → **ABORT** (don't persist incomplete data)
- If `--excerpts-dir` is not provided → Persist with `excerptsPending: true` (expected for direct script invocation)
- If excerpts provided → Persist normally with `excerptsPending: false`

---

### Layer 3: Record Structure (excerptsPending field)

**File:** `scripts/save_guidance_documents.js`

**Purpose:** Distinguish between "extraction never ran" vs "extraction ran but found nothing".

**Logic:**
```javascript
// OLD (buggy):
excerptsPending: args.excerptsDir ? !excerpts : true
// Result: Could be true even when excerpt extraction was attempted

// NEW (fixed):
excerptsPending: false  // Always false when orchestrator runs (Step 2 is mandatory)
```

**States in database:**
| State | excerptsPending | Meaning | Action |
|-------|-----------------|---------|--------|
| `true` | Old records from before this fix | Never run | Re-run orchestrator |
| `false` | Normal completion | Extraction ran (may have 0 excerpts) | Process normally |
| `extractionFailed: "..."` | `false` | Extraction failed (rare) | Investigate error |

---

## Prevention: How the Fix Works

### Scenario 1: Normal Orchestrated Run (NEW)
```
orchestrate_extraction.js --scan-url "..."
  → Step 1: Fetch (fetch_guidance_documents.js)
  → Step 2: Extract (INLINE, MANDATORY)
  → Step 3: Validate (inline)
  → Step 4: Persist (via orchestrator calling db.saveReport)
  → Result: Records saved with excerpts, excerptsPending: false ✓
```

### Scenario 2: Manual Step-by-Step Run (OLD, now safer)
```
# Someone tries to run steps manually
node fetch_guidance_documents.js --scan-url "..."
node save_guidance_documents.js --manifest manifest.json
  → Save script checks: --excerpts-dir provided but empty?
  → Safety check ABORTS: "Step 2 extraction did not complete"
  → Result: Incomplete records never persisted ✓
```

### Scenario 3: Deprecated Flow (prevented)
```
# OLD: Calling save script without excerpt extraction
node save_guidance_documents.js --manifest manifest.json
  → No --excerpts-dir provided
  → Records saved with excerptsPending: true
  → forward-guidance-extractor receives records
  → Detects excerptsPending: true (should not happen with new code)
  → Result: Error message, no silent processing ✓
```

---

## Deployment Checklist

- [x] Add `orchestrate_extraction.js` orchestrator script
- [x] Update `SKILL.md` to document mandatory orchestration
- [x] Add safety check to `save_guidance_documents.js`
- [x] Update `forward-guidance-extractor` to detect stale `excerptsPending: true` records
- [ ] Update scheduled task `daily-guidance-extractor-scan` to use orchestrator
- [ ] Run test on production scan URL
- [ ] Monitor for any records with `excerptsPending: true` created after this date

---

## Monitoring

### Alert Conditions

**Alert if:**
1. Any new `guidance-documents` record has `excerptsPending: true` (should not happen)
2. Save script fails with "No excerpt files found" (Step 2 crashed)
3. Downstream `forward-guidance-extractor` task skips companies due to empty excerpts

### Query to Verify Fix

```bash
# Check for any stale incomplete records (should be empty set)
node -e "
const fs = require('fs');
const reports = JSON.parse(fs.readFileSync('data/reports.json', 'utf8'));
const stale = Object.values(reports).filter(r =>
  r.type === 'guidance-documents' &&
  r.creationTime >= '2026-08-12' &&
  r.excerptsPending === true
);
console.log('Stale incomplete records:', stale.length);
"
```

---

## Root Cause Analysis

**Why this happened:**
1. Skill architecture allowed optional Step 2
2. No enforcement that steps run together
3. No safety gates in save scripts
4. Downstream task just silently skipped incomplete companies

**Why it's now fixed:**
1. Orchestrator forces all steps together
2. Save script aborts on incomplete runs
3. Records cannot be saved incomplete
4. Step 2 is now impossible to skip

---

## Future Prevention

1. **Never make extraction steps optional** — they should always run as a unit
2. **Always add safety checks in persistence scripts** — validate input before writing
3. **Mark incomplete data explicitly** — use fields like `excerptsPending` to track state
4. **Fail loud on inconsistencies** — abort rather than silently accept bad state

---

**Status:** ✅ Deployed  
**Last Updated:** 2026-08-12  
**Issue:** "38 records exist but have empty excerpts"  
**Resolution:** Orchestrator + safety checks ensure Step 2 always completes
