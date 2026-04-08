/**
 * utils.js — Shared utilities for the Walk the Talk extension.
 * Loaded by both content.js (via manifest) and sidepanel.html (via script tag).
 * @file extensions/wtt-extension/utils.js
 */

/**
 * Convert a YYYYMM date string to an Indian FY quarter label (e.g. "Q1FY26").
 * Indian FY runs Apr–Mar: Q1=Jun, Q2=Sep, Q3=Dec, Q4=Mar.
 * @param {string} d - Date in YYYYMM format
 * @returns {string} Quarter label like "Q2FY25", or the raw date if month doesn't match
 */
function dateToQuarter(d) {
  const yr = parseInt(d.slice(0, 4));
  const mo = parseInt(d.slice(4, 6));
  const fy2 = n => String(n % 100).padStart(2, "0");
  if (mo === 6)  return `Q1FY${fy2(yr + 1)}`;
  if (mo === 9)  return `Q2FY${fy2(yr + 1)}`;
  if (mo === 12) return `Q3FY${fy2(yr + 1)}`;
  if (mo === 3)  return `Q4FY${fy2(yr)}`;
  return d;
}

/**
 * Compare two quarter labels for sorting (newest first).
 * Converts "Q1FY26" to a sortable number: FY*10 + Q.
 * @param {string} a - Quarter label
 * @param {string} b - Quarter label
 * @returns {number} Negative if a is newer, positive if b is newer
 */
function qtrSort(a, b) {
  const parse = q => {
    const m = q.match(/Q(\d)FY(\d+)/);
    return m ? parseInt(m[2]) * 10 + parseInt(m[1]) : 0;
  };
  return parse(b) - parse(a);
}
