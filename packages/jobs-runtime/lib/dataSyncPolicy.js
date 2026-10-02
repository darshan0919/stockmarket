'use strict';

const path = require('path');

/**
 * Top-level `data/` folders that are local-only research material and must never reach Drive
 * (nor be hashed by `data push`, which reads every candidate file in full).
 *  - `pdf-corpus/`  PDF extraction study corpus: downloaded filings, XBRL truth, scan listings,
 *                   benchmark runs (docs/PDF_OCR_EXTRACTION_PLAN.md). Study/testing/training only.
 *  - `xbrl-corpus/` reserved for raw XBRL filings kept for the same purpose.
 */
const LOCAL_ONLY_DIRS = ['pdf-corpus/', 'xbrl-corpus/'];

/**
 * True for paths (relative to the data root, forward slashes) that `data push`/`pull`/`status`
 * must ignore: locks, sync metadata, temp/corrupt/conflict/backup files, and the local-only dirs.
 * @param {string} rel
 * @returns {boolean}
 */
const NEVER_SYNC = (rel) =>
  rel.startsWith('.locks/') ||
  rel.startsWith('_meta/') ||
  LOCAL_ONLY_DIRS.some((d) => rel.startsWith(d)) ||
  rel.includes('.tmp.') ||
  rel.includes('.corrupt.') ||
  rel.includes('.local-conflict.') ||
  path.basename(rel) === '.env' ||
  path.basename(rel) === '.DS_Store' ||
  // local backup/scratch files must never mirror to Drive
  /(backup|\.bak|\.orig)$/i.test(rel) ||
  // artifact records store their body in assets/, never as a reports/ body —
  // any reports/rpt_artifact-migration_*.json is an orphan (do not sync)
  /^reports\/rpt_artifact-migration_.*\.json$/.test(rel);

module.exports = { NEVER_SYNC, LOCAL_ONLY_DIRS };
