'use strict';

/**
 * Canonical companyId sanitizer — the SINGLE source of truth for stripping
 * NSE/BSE series-suffix noise off a companyId/ticker before it's used for
 * ANYTHING: company-master lookups, db.js record ids/links, Stockscans API
 * calls, or building a stockscans.in URL for an email hyperlink.
 *
 * The bug this fixes: raw NSE scan/feed data sometimes reports a symbol with
 * a dash-separated trading-series suffix appended — e.g. "SOMECO-BE" (Book
 * Entry / trade-for-trade series), "SOMECO-SM" (SME platform), "SOMECO-BZ",
 * "SOMECO-BL", "SOMECO-ST", etc. That suffix is a MARKET/SERIES attribute,
 * not part of the company's identity — Stockscans, the company-master DB,
 * and every downstream lookup key on the bare symbol. Left unstripped, the
 * suffixed variant silently fails company-master lookups (falls through to
 * "unknown company") and produces a dead/wrong stockscans.in company URL in
 * emails, even though the exchange:symbol prefix is otherwise correct.
 *
 * Deliberately narrow: only strips a KNOWN suffix list, appended after the
 * bare symbol with a `-`. Does NOT touch the `NSE:`/`BSE:` exchange prefix
 * (that's a different concern — see gainersClassifier.js's
 * `normalizeCompanyId` for double-prefix cleanup, which should compose with
 * this, not duplicate it).
 *
 * @param {string} id - e.g. "NSE:SOMECO-BE", "SOMECO-SM", "BSE:500325"
 * @returns {string} sanitized id, e.g. "NSE:SOMECO", "SOMECO", "BSE:500325"
 */

// NSE/BSE trading series suffixes seen appended to a symbol with a dash.
// Not exhaustive by design — extend this list (not the regex shape) if a new
// suffix shows up in the wild; keep it a literal alternation so an unknown
// dash-suffixed ticker (e.g. a genuine company name containing a dash) is
// left untouched rather than guessed at.
const KNOWN_SERIES_SUFFIXES = [
  'BE', // Book Entry / trade-for-trade
  'BZ', // trade-for-trade, Z group
  'BL', // trade-for-trade, limited physical
  'SM', // SME platform
  'ST', // SME platform, trade-for-trade
  'IL', // Institutional/illiquid
  'GC', // Government of India relief bonds category
  'BT', // trade-for-trade, T group
];

const SUFFIX_RE = new RegExp(`-(?:${KNOWN_SERIES_SUFFIXES.join('|')})$`, 'i');

/**
 * @param {string} id
 * @returns {string}
 */
function sanitizeCompanyId(id) {
  const s = String(id || '').trim();
  if (!s) return s;
  return s.replace(SUFFIX_RE, '');
}

let _companyMaster = undefined;
function getCompanyMaster() {
  if (_companyMaster !== undefined) return _companyMaster;
  try {
    _companyMaster = require('../../../packages/jobs-runtime/lib/companyMaster');
  } catch (_) {
    try {
      _companyMaster = require('@stock/jobs-runtime/lib/companyMaster');
    } catch (__) {
      _companyMaster = null;
    }
  }
  return _companyMaster;
}

/**
 * Resolve any company input to canonical companyId via companyMaster.
 * @param {string|Object} input
 * @param {Object} [opts]
 * @returns {string|null}
 */
function resolveCompanyId(input, opts) {
  const cm = getCompanyMaster();
  if (cm && typeof cm.resolveCompanyId === 'function') {
    return cm.resolveCompanyId(input, opts);
  }
  return sanitizeCompanyId(
    typeof input === 'string' ? input : input?.symbol || input?.companyId || ''
  );
}

/**
 * Resolve company identity record via companyMaster.
 * @param {Object} opts
 * @returns {Object}
 */
function resolveCompanyIdentity(opts) {
  const cm = getCompanyMaster();
  if (cm && typeof cm.resolveCompanyIdentity === 'function') {
    return cm.resolveCompanyIdentity(opts);
  }
  const s = sanitizeCompanyId(opts?.symbol || opts?.companyId || '');
  return {
    key: s,
    displaySymbol: s,
    companyName: opts?.companyName || opts?.company || s,
    nseTicker: null,
    bseTicker: null,
    companyId: s || null,
    isDualListed: false,
  };
}

module.exports = {
  sanitizeCompanyId,
  KNOWN_SERIES_SUFFIXES,
  resolveCompanyId,
  resolveCompanyIdentity,
};
