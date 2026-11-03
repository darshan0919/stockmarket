'use strict';
/**
 * ipoLockinStore — read side of the IPO float-unlock watch (skills/_shared/ipo-lockin-watch.md).
 * Exact schedules (analyst/RHP-derived, non-regenerable) live in the `ipos` collection as `type: 'ipo-lockin'`
 * (db.js); date-only estimates for every ≤24-month listing are a regenerable cache built by `yarn ipo-lockin build`.
 * An exact record always wins over an estimate. Synchronous and local-only so the card renderers stay pure-ish.
 */
const db = require('./db');
const { StorageService } = require('@stock/cloud-utils');
const { sanitizeCompanyId } = require('@stock/api/utils/companyId');
const ist = require('./ist');
const L = require('./ipoLockins');

const TYPE = 'ipo-lockin';
const ESTIMATES_REL = 'cache/ipo-lockin-estimates.json';

/** @returns {string} today's IST calendar date, YYYY-MM-DD */
const todayIst = () => ist.istDate().toISOString().slice(0, 10);

/** @returns {Map<string, Object>} companyId → schedule record (exact overrides estimate) */
function loadIndex() {
  const idx = new Map();
  const est = StorageService.readJson(ESTIMATES_REL);
  for (const [id, rec] of Object.entries((est && est.byCompanyId) || {})) idx.set(id, rec);
  for (const rec of db.find('ipos', { type: TYPE })) idx.set(rec.companyId, rec);
  return idx;
}

/**
 * Add `ipoLockin` (a lockinWatch block) to every item whose company listed within 24 months.
 * Items are copied, never mutated. Market cap is read from either card shape.
 * @param {Array<Object>} items cards/insights/signals carrying a companyId (or ticker)
 * @param {{today?:string, index?:Map<string,Object>}} [opts]
 */
function attachIpoLockins(items, { today = todayIst(), index } = {}) {
  let idx = index;
  if (!idx) {
    try {
      idx = loadIndex();
    } catch (e) {
      // Enrichment must never block a digest/report — but a silent miss would break the "always shown" rule.
      console.warn(
        `[ipo-lockin] schedule store unreadable, cards render without the unlock line: ${e.message}`
      );
      idx = new Map();
    }
  }
  return (items || []).map((it) => {
    const id =
      it && (it.companyId || it.ticker) ? sanitizeCompanyId(it.companyId || it.ticker) : null;
    const rec = id && idx.get(id);
    if (!rec) return it;
    const mcap = (it.marketData && it.marketData.marketCapCr) ?? it.market_cap_cr ?? null;
    const w = L.lockinWatch(rec, today, { marketCapCr: typeof mcap === 'number' ? mcap : null });
    return w ? { ...it, ipoLockin: w } : it;
  });
}

module.exports = { TYPE, ESTIMATES_REL, todayIst, loadIndex, attachIpoLockins };
