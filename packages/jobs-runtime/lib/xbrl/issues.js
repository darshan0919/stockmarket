'use strict';

/**
 * XBRL issue log. Instances are keyed per run/job (no module-level mutable
 * state) so concurrent jobs never share a collector.
 */

const CATEGORIES = Object.freeze([
  'MISSING_FILING',
  'MISSING_FIELD',
  'UNMAPPED_ELEMENT',
  'UNIT',
  'SIGN',
  'SUM_CHECK',
  'EXCHANGE_DISAGREE',
  'RESTATED_COMPARATIVE',
  'REVISION',
  'PARSE_ERROR',
  'ENDPOINT_CHANGE',
  'LATENCY',
  'FALLBACK_USED',
  'PERIODICITY',
]);
const SEVERITIES = Object.freeze(['major', 'minor', 'info']);

/**
 * @typedef {Object} XbrlIssue
 * @property {string} category
 * @property {'major'|'minor'|'info'} severity
 * @property {string} message
 * @property {string} [symbol]
 * @property {string} [period] - Period end, e.g. `30-JUN-2026`.
 * @property {string} [exchange] - `NSE` | `BSE`.
 * @property {string} [filingType]
 * @property {Object} [detail]
 */

/**
 * Create an issue collector scoped to one run.
 * @param {string} runId - Explicit run/job identifier (keyed state).
 * @returns {{runId: string, add: (issue: XbrlIssue) => XbrlIssue, all: () => XbrlIssue[], summary: () => Record<string, Record<string, number>>}}
 */
function createIssueLog(runId) {
  if (!runId) throw new Error('createIssueLog requires an explicit runId');
  const items = [];
  return {
    runId,
    add(issue) {
      if (!CATEGORIES.includes(issue.category)) {
        throw new Error(`Unknown XBRL issue category: ${issue.category}`);
      }
      if (!SEVERITIES.includes(issue.severity)) {
        throw new Error(`Unknown XBRL issue severity: ${issue.severity}`);
      }
      const rec = { ...issue, runId };
      items.push(rec);
      return rec;
    },
    all: () => items.slice(),
    summary() {
      const out = {};
      for (const i of items) {
        out[i.category] = out[i.category] || { major: 0, minor: 0, info: 0 };
        out[i.category][i.severity] += 1;
      }
      return out;
    },
  };
}

module.exports = { createIssueLog, CATEGORIES, SEVERITIES };
