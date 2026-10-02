#!/usr/bin/env node
'use strict';

/**
 * extract_result_narrative.js — pulls the text XBRL does not carry out of the
 * Result PDF text: explanations of exceptional / one-off items, and the
 * auditor's (limited review) report remarks including any qualification.
 *
 * Pure text extraction, zero LLM: it returns verbatim paragraphs and a
 * deterministic qualification flag; interpreting them is the analysis skill's job.
 *
 * Usage: node extract_result_narrative.js --result-text /tmp/X/result.txt [--ppt-text ...]
 * Output (stdout JSON):
 *   { found, exceptionalNotes: [{text, matched}], auditorRemarks: [{text, kind}],
 *     qualification: 'qualified'|'emphasis-of-matter'|'none-detected'|'not-found',
 *     reviewReportFound }
 */

const fs = require('fs');

const ONE_OFF_RE =
  /exceptional\s+items?|one[-\s]?(?:time|off)|non[-\s]?recurring|impairment|write[-\s]?(?:off|back)|provision\s+for\s+(?:doubtful|expected\s+credit)|fair\s+value\s+(?:gain|loss)|gain\s+on\s+(?:sale|disposal|deconsolidation)|loss\s+on\s+(?:sale|disposal)|settlement|voluntary\s+retirement|labour\s+code|reversal\s+of\s+(?:provision|liabilit)/i;
const QUALIFIED_RE =
  /qualified\s+conclusion|except\s+for\s+the\s+(?:effects?|possible\s+effects?|matter)|adverse\s+conclusion|disclaimer\s+of\s+conclusion|basis\s+for\s+qualified/i;
const EMPHASIS_RE =
  /emphasis\s+of\s+matter|material\s+uncertainty\s+related\s+to\s+going\s+concern|we\s+draw\s+attention|other\s+matter/i;
const REVIEW_HEAD_RE =
  /limited\s+review\s+report|independent\s+auditor'?s?\s+review\s+report|review\s+report\s+to/i;

/**
 * Split layout text into paragraphs (blank-line separated), collapsing whitespace.
 * @param {string} text
 * @returns {string[]}
 */
function paragraphs(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 40);
}

/** A paragraph that looks like a table row of numbers rather than prose. */
const looksNumeric = (p) => (p.match(/[\d,.()-]+/g) || []).join('').length > p.length * 0.5;

/**
 * Extract narrative facts from result text.
 * @param {string} text
 * @returns {Object}
 */
function extractNarrative(text) {
  if (!text || !text.trim()) {
    return {
      found: false,
      exceptionalNotes: [],
      auditorRemarks: [],
      qualification: 'not-found',
      reviewReportFound: false,
    };
  }
  const paras = paragraphs(text);
  const exceptionalNotes = [];
  const seen = new Set();
  for (const p of paras) {
    if (looksNumeric(p)) continue;
    const m = ONE_OFF_RE.exec(p);
    if (
      m &&
      /\b(note|during the quarter|quarter ended|the company|the group)\b/i.test(p) &&
      !seen.has(p)
    ) {
      seen.add(p);
      exceptionalNotes.push({ text: p.slice(0, 1500), matched: m[0].toLowerCase() });
    }
  }
  const reviewIdx = paras.findIndex((p) => REVIEW_HEAD_RE.test(p));
  const reviewReportFound = reviewIdx >= 0;
  const window = reviewReportFound ? paras.slice(reviewIdx, reviewIdx + 25) : [];
  const auditorRemarks = [];
  let qualification = reviewReportFound ? 'none-detected' : 'not-found';
  for (const p of window) {
    if (QUALIFIED_RE.test(p)) {
      qualification = 'qualified';
      auditorRemarks.push({ text: p.slice(0, 1500), kind: 'qualification' });
    } else if (EMPHASIS_RE.test(p)) {
      if (qualification !== 'qualified') qualification = 'emphasis-of-matter';
      auditorRemarks.push({ text: p.slice(0, 1500), kind: 'emphasis' });
    }
  }
  return {
    found: exceptionalNotes.length > 0 || auditorRemarks.length > 0 || reviewReportFound,
    exceptionalNotes: exceptionalNotes.slice(0, 12),
    auditorRemarks: auditorRemarks.slice(0, 8),
    qualification,
    reviewReportFound,
  };
}

function main() {
  const args = process.argv.slice(2);
  const get = (f) => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : null;
  };
  const rp = get('--result-text');
  if (!rp || !fs.existsSync(rp)) {
    process.stdout.write(
      JSON.stringify({ found: false, error: '--result-text file required' }) + '\n'
    );
    process.exit(1);
  }
  process.stdout.write(
    JSON.stringify(extractNarrative(fs.readFileSync(rp, 'utf8')), null, 2) + '\n'
  );
}

if (require.main === module) main();

module.exports = { extractNarrative, paragraphs };
