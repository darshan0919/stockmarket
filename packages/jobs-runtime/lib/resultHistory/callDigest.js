'use strict';

/**
 * callDigest.js — the per-concall digest that makes the quarterly-result history pack cheap.
 *
 * A past earnings call never changes, so the frontier-model reading of it — guidance rows,
 * tone label, topic inventory, "one-off" excuses, catalysts disclosed — is done ONCE per
 * transcript and stored as a `concall-digest` report (db.saveReport). Every later history
 * pack (and every later quarter's pack) reuses it; only the newest call is ever read again.
 *
 * Admission control is mechanical (verifyExtract L1): every `quote` must be found verbatim in
 * the transcript's cached text, otherwise the digest is rejected before it is stored — one
 * invented quote discredits the whole digest, since it would be reused for 4 quarters.
 * The reasoning itself is done by the agent (no LLM API calls from scripts, conventions §24).
 */

const { verifyL1 } = require('../verifyExtract');
const { quarterEndIso } = require('./period');

const REPORT_TYPE = 'concall-digest';
const CREATOR = 'quarterly-result-extractor';

/** quarterly-result-analysis/references/tone_taxonomy.md — the six labels. */
const TONE_LABELS = [
  'aggressive',
  'confident',
  'cautious',
  'defensive',
  'opportunistic',
  'conservative',
];

/** rerating-catalysts growth_catalyst_framework.md §4 — C-A-T-A-L-Y-S-T. */
const CATALYST_LETTERS = [
  'CAPEX',
  'ACQUISITION',
  'TURNAROUND',
  'APPROVALS',
  'LARGE_ORDERS',
  'YEAR_ZERO',
  'SWITCH',
  'THEME',
];

/**
 * Structural validation of an agent-written digest body. Returns a list of problems
 * (empty = valid). Does not judge content — only shape, enums and required quotes.
 * @param {Object} d digest body {tone, guidance, topics, oneOffs, catalysts}
 * @returns {string[]}
 */
function validateDigest(d) {
  const errs = [];
  if (!d || typeof d !== 'object') return ['digest must be an object'];
  const needQuote = (x, where) => {
    if (!x || typeof x.quote !== 'string' || !x.quote.trim()) errs.push(`${where}: quote required`);
  };
  if (!d.tone || !TONE_LABELS.includes(d.tone.label)) {
    errs.push(`tone.label must be one of ${TONE_LABELS.join('|')}`);
  } else needQuote(d.tone, 'tone');
  for (const k of ['guidance', 'topics', 'oneOffs', 'catalysts']) {
    if (!Array.isArray(d[k])) errs.push(`${k} must be an array (use [] when none)`);
  }
  (d.guidance || []).forEach((g, i) => {
    if (!g.metric || !g.period_guided)
      errs.push(`guidance[${i}]: metric and period_guided required`);
    if (g.relative_pct == null && g.absolute_value == null && !g.milestone)
      errs.push(`guidance[${i}]: relative_pct, absolute_value or milestone required`);
    needQuote(g, `guidance[${i}]`);
  });
  (d.topics || []).forEach((t, i) => {
    if (!t.topic || !Array.isArray(t.keywords) || !t.keywords.length)
      errs.push(`topics[${i}]: topic and non-empty keywords[] required`);
    needQuote(t, `topics[${i}]`);
  });
  (d.oneOffs || []).forEach((o, i) => {
    if (!o.costHead) errs.push(`oneOffs[${i}]: costHead required`);
    needQuote(o, `oneOffs[${i}]`);
  });
  (d.catalysts || []).forEach((c, i) => {
    if (!CATALYST_LETTERS.includes(c.letter))
      errs.push(`catalysts[${i}]: letter must be one of ${CATALYST_LETTERS.join('|')}`);
    if (!c.title) errs.push(`catalysts[${i}]: title required`);
    needQuote(c, `catalysts[${i}]`);
  });
  return errs;
}

/**
 * L1 quote anchoring against the transcript text.
 * @param {Object} digest body
 * @param {string} transcriptText full cached transcript text
 * @returns {Object} verifyL1 result {status, checked, matched, unmatched}
 */
function verifyDigest(digest, transcriptText) {
  return verifyL1({ data: digest }, { text: String(transcriptText || '') });
}

/**
 * Build the persisted record (envelope fields + body). Pure.
 * @param {Object} args
 * @param {string} args.companyId
 * @param {string} args.quarter YYYYMM of the call's quarter
 * @param {{ssUrl: string, date: string}} args.transcript
 * @param {Object} args.digest validated digest body
 * @param {Object} args.verification verifyDigest() result (status 'pass')
 * @param {string} args.modelUsed exact model that wrote the digest
 * @returns {Object}
 */
function buildDigestRecord({ companyId, quarter, transcript, digest, verification, modelUsed }) {
  return {
    type: REPORT_TYPE,
    creator: CREATOR,
    companyId,
    date: quarterEndIso(quarter),
    quarter,
    modelUsed,
    transcript: {
      ssUrl: transcript.ssUrl,
      date: transcript.date,
      url: `https://www.stockscans.in/document/${transcript.ssUrl}`,
    },
    verification: {
      status: verification.status,
      checked: verification.checked,
      matched: verification.matched,
    },
    summary: `${quarter} concall digest: tone ${digest.tone.label}, ${digest.guidance.length} guides, ${digest.topics.length} topics, ${digest.oneOffs.length} one-offs, ${digest.catalysts.length} catalysts`,
    tone: digest.tone,
    guidance: digest.guidance,
    topics: digest.topics,
    oneOffs: digest.oneOffs,
    catalysts: digest.catalysts,
  };
}

/**
 * All stored digests for a company (full bodies), newest quarter first.
 * @param {Object} db packages/jobs-runtime/lib/db.js
 * @param {string} companyId
 * @returns {Array<Object>}
 */
function listDigests(db, companyId) {
  return (db.find('reports', { type: REPORT_TYPE, companyId }) || [])
    .map((r) => db.readReport(r.id) || r)
    .sort((a, b) => String(b.quarter).localeCompare(String(a.quarter)));
}

module.exports = {
  REPORT_TYPE,
  CREATOR,
  TONE_LABELS,
  CATALYST_LETTERS,
  validateDigest,
  verifyDigest,
  buildDigestRecord,
  listDigests,
};
