#!/usr/bin/env node
/**
 * Task: Check Extraction Success
 * Purpose: Verify that quarterly-result-extractor (or guidance-document-extractor)
 * persisted records to the DB successfully. Used as a gate before downstream analysis
 * skills (quarterly-result-analysis, forward-guidance-extractor).
 *
 * Usage:
 *   node check_extraction_success.js --collection quarterly-result-documents --date 2026-08-11
 *   node check_extraction_success.js --collection guidance-documents --date 2026-08-11
 *
 * Exit codes:
 *   0 = Success (records found, analysis task can proceed)
 *   1 = Failure (no records, analysis task will NOT run)
 */

'use strict';

const path = require('path');

/**
 * Parse CLI args to extract named parameters.
 */
function argValue(argv, key, defaultVal = null) {
  const idx = argv.indexOf(key);
  return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : defaultVal;
}

/**
 * Check if records were persisted to the DB for the given date.
 *
 * NOTE: 'quarterly-result-documents' and 'guidance-documents' are DTO `type`
 * values, not db.js collection names — both are persisted via
 * `db.saveReport()` into the single `reports` collection (see
 * docs/DATA_RULES.md §2, "Analysis/report DTO" row; db.js's
 * SINGLE_FILE_COLLECTIONS list does not include either of these names, so
 * calling `db.find(collectionName, ...)` directly throws "Unknown
 * collection"). Always query the `reports` collection and filter on `type`.
 *
 * @param {string} collectionName - the DTO `type`, e.g. 'quarterly-result-documents', 'guidance-documents'
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Promise<{status: 'success'|'failure'|'error', count: number, message: string, date: string, records?: Array}>}
 */
async function checkDbRecords(collectionName, dateStr) {
  try {
    // Dynamically load db.js from the repo's jobs-runtime
    // This script runs in the Cowork environment where the repo is mounted
    const db = require('../../packages/jobs-runtime/lib/db');

    // Query for records created on the given date.
    // db.js's find() does exact-equality matching on `creator` only (no $in
    // support), so fetch by type+date and post-filter for either extraction
    // skill's creator here.
    //
    // IMPORTANT: db.find() returns thin index entries only (id/type/date/
    // companyId/creator/summary/body — see db.js's `find()` doc comment).
    // It does NOT include content fields like `excerpts` or `found` — those
    // live in the full body file that `body` points to and require
    // `db.readReport(id)` to load. A prior version of this script counted
    // any matching index entry as "success," which silently passed even
    // when guidance-document-extractor had only fetched documents but not
    // yet run its relevance-filter pass (excerptsPending: true, excerpts: []
    // on every record) — the exact "fetched but not filtered" state this
    // gate exists to catch. Always read the full body before judging
    // completeness.
    const byTypeAndDate = db.find('reports', { type: collectionName, date: dateStr });
    const candidates = byTypeAndDate.filter((r) =>
      ['quarterly-result-extractor', 'guidance-document-extractor'].includes(r.creator)
    );

    if (!candidates || candidates.length === 0) {
      return {
        status: 'failure',
        count: 0,
        message: `No ${collectionName} records persisted for ${dateStr}`,
        date: dateStr,
      };
    }

    // Load full bodies and require the extraction to have actually finished
    // (excerptsPending === false). A record can legitimately end up with
    // excerpts: [] (Stage 2 ran and genuinely found nothing — see
    // forward-guidance-extractor's SKILL.md case 3), but excerptsPending
    // still lets us distinguish that from "Stage 1 fetched documents and
    // stopped before the relevance-filter pass ran," which is a failure
    // this gate must catch, not silently pass through.
    const fullRecords = candidates.map((r) => db.readReport(r.id));
    const incomplete = fullRecords.filter((r) => r.excerptsPending === true);
    const complete = fullRecords.filter((r) => r.excerptsPending !== true);

    if (complete.length === 0) {
      return {
        status: 'failure',
        count: 0,
        message: `Found ${candidates.length} ${collectionName} records for ${dateStr}, but all ${incomplete.length} still have excerptsPending: true (relevance-filter pass never completed)`,
        date: dateStr,
        incompleteIds: incomplete.map((r) => r.id).slice(0, 10),
      };
    }

    const result = {
      status: 'success',
      count: complete.length,
      message: `Found ${complete.length} completed ${collectionName} records for ${dateStr}`,
      date: dateStr,
      records: complete.slice(0, 3), // Return first 3 full records as sample
    };
    if (incomplete.length > 0) {
      result.message += ` (${incomplete.length} of ${candidates.length} still have excerptsPending: true and were excluded)`;
      result.incompleteIds = incomplete.map((r) => r.id);
    }
    return result;
  } catch (error) {
    // If db module can't be loaded, try an alternative approach using fs directly
    try {
      const fs = require('fs');

      // Try to read the reports.json file directly
      const reportPath = path.join(
        __dirname,
        '../../data/reports.json'
      );

      if (!fs.existsSync(reportPath)) {
        return {
          status: 'error',
          count: 0,
          error: `Reports database not found at ${reportPath}`,
          date: dateStr,
        };
      }

      const reportsContent = fs.readFileSync(reportPath, 'utf8');
      const reports = JSON.parse(reportsContent);

      // data/reports.json is a flat object keyed by record id (index
      // entries, same thin shape as db.find() — see the note above), NOT
      // { records: [...] }. Object.values() is the correct read.
      const matching = Object.values(reports).filter(
        (r) =>
          r.type === collectionName &&
          r.date === dateStr &&
          (r.creator === 'quarterly-result-extractor' ||
            r.creator === 'guidance-document-extractor')
      );

      if (!matching.length) {
        return {
          status: 'failure',
          count: 0,
          message: `No ${collectionName} records persisted for ${dateStr}`,
          date: dateStr,
        };
      }

      // Same completeness requirement as the primary path: an index entry
      // alone doesn't tell us whether Stage 2's relevance-filter finished,
      // so load each full body (reports/<id>.json, per the `body` field)
      // and check excerptsPending there.
      const dataDir = path.join(__dirname, '../../data');
      const fullMatching = matching.map((r) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dataDir, r.body), 'utf8'));
        } catch {
          return r; // body file missing/unreadable — fall back to the index entry as-is
        }
      });
      const incomplete = fullMatching.filter((r) => r.excerptsPending === true);
      const complete = fullMatching.filter((r) => r.excerptsPending !== true);

      if (complete.length === 0) {
        return {
          status: 'failure',
          count: 0,
          message: `Found ${matching.length} ${collectionName} records for ${dateStr}, but all ${incomplete.length} still have excerptsPending: true (relevance-filter pass never completed)`,
          date: dateStr,
          incompleteIds: incomplete.map((r) => r.id).slice(0, 10),
        };
      }

      const fallbackResult = {
        status: 'success',
        count: complete.length,
        message: `Found ${complete.length} completed ${collectionName} records for ${dateStr}`,
        date: dateStr,
        records: complete.slice(0, 3),
      };
      if (incomplete.length > 0) {
        fallbackResult.message += ` (${incomplete.length} of ${matching.length} still have excerptsPending: true and were excluded)`;
        fallbackResult.incompleteIds = incomplete.map((r) => r.id);
      }
      return fallbackResult;
    } catch (fallbackError) {
      return {
        status: 'error',
        error: `Could not load db module or read reports.json: ${error.message}`,
        fallbackError: fallbackError.message,
        date: dateStr,
      };
    }
  }
}

/**
 * Main entry point.
 */
async function main() {
  const collectionName = argValue(process.argv, '--collection');
  const dateStr = argValue(process.argv, '--date');

  if (!collectionName || !dateStr) {
    console.error(
      JSON.stringify(
        {
          status: 'error',
          error: 'Usage: node check_extraction_success.js --collection <name> --date <YYYY-MM-DD>',
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const result = await checkDbRecords(collectionName, dateStr);
  console.log(JSON.stringify(result, null, 2));

  // Exit with failure if status is not 'success'
  if (result.status !== 'success') {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { checkDbRecords };
