'use strict';

/**
 * BSE scrip-code resolution for the XBRL resolvers.
 *
 * Order: explicit override -> numeric symbol -> `bseScripCode` stored on the company record
 * (data/companies.json, maintained by companyMasterSync) -> BSE name search (last resort; logged,
 * because a search hit can be the wrong company — e.g. `HSIL` matched Hemant Surgical Industries).
 */

const fs = require('fs');

let _byNse = null;
let _nameByNse = null;

/** @returns {Map<string,string>} NSE ticker -> BSE scrip code, from companies.json. */
function loadStoredScrips() {
  if (_byNse) return _byNse;
  _byNse = new Map();
  _nameByNse = new Map();
  try {
    const file = require('../db').collectionFile('companies');
    if (!fs.existsSync(file)) return _byNse;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const c of Array.isArray(raw) ? raw : Object.values(raw)) {
      if (!c) continue;
      const t = String(c.nseTicker || c.id || '')
        .replace(/^NSE:/i, '')
        .toUpperCase();
      if (!t || t.startsWith('BSE:')) continue;
      if (c.name) _nameByNse.set(t, String(c.name));
      if (c.bseScripCode) _byNse.set(t, String(c.bseScripCode));
    }
  } catch (_) {
    /* best effort: fall through to search */
  }
  return _byNse;
}

/** Test hook: drop the in-memory index. */
function resetStoredScrips() {
  _byNse = null;
  _nameByNse = null;
}

/**
 * @param {Object} o
 * @param {string} o.symbol - NSE symbol (or a numeric BSE scrip code).
 * @param {string|number} [o.bseScrip] - explicit override.
 * @param {{getScripCode:Function}} o.bse
 * @param {Function} [o.lookup] - (symbol) => scrip|null; default reads companies.json.
 * @param {string} [o.name] - company name used to verify a search hit (default: companies.json).
 * @returns {Promise<{scrip:string|null, source:'override'|'symbol'|'stored'|'search'|'mismatch'|null}>}
 */
async function resolveBseScrip({ symbol, bseScrip, bse, lookup, name }) {
  if (bseScrip) return { scrip: String(bseScrip), source: 'override' };
  const sym = String(symbol || '')
    .replace(/^(NSE|BSE):/i, '')
    .toUpperCase();
  if (/^\d{5,6}$/.test(sym)) return { scrip: sym, source: 'symbol' };
  const stored = lookup ? lookup(sym) : loadStoredScrips().get(sym);
  if (stored) return { scrip: String(stored), source: 'stored' };
  // Last resort. A BSE ticker is a different namespace from an NSE ticker (NSE:NRL is Nupur Recyclers, BSE's
  // nearest hit is GNRL = Gujarat Natural Resources), so the hit must be the same company, not just a symbol.
  if (typeof bse.smartSearch !== 'function') {
    const found = await bse.getScripCode(sym);
    return found ? { scrip: String(found), source: 'search' } : { scrip: null, source: null };
  }
  const { symbols } = await bse.smartSearch(sym);
  const hit = (symbols || []).find((x) => String(x.symbol).toUpperCase() === sym);
  if (!hit || !hit.bse_scrip_code) return { scrip: null, source: null };
  loadStoredScrips(); // ensures the name index is built
  const nm = name || (_nameByNse && _nameByNse.get(sym)) || null;
  const { sameCompany } = require('../bseScripBackfill');
  if (!sameCompany({ name: nm }, sym, hit.symbol_info).ok)
    return { scrip: null, source: 'mismatch' };
  return { scrip: String(hit.bse_scrip_code), source: 'search' };
}

/** Issue-log entry for a search-derived scrip (not verified against the company record). */
function searchScripIssue(symbol, scrip) {
  return {
    category: 'FALLBACK_USED',
    severity: 'info',
    exchange: 'BSE',
    message: `BSE scrip ${scrip} resolved by name search, not stored on the company record; verify it is the right company`,
    detail: { symbol, scrip },
  };
}

module.exports = { resolveBseScrip, searchScripIssue, loadStoredScrips, resetStoredScrips };
