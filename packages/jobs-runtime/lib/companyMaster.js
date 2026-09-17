/**
 * Shared company master lookup — the single source of truth for
 * NSE ticker <-> BSE scrip code <-> company name <-> keywords across all
 * skills in this repo. Read-only consumer module; the sync job
 * (companyMasterSync.js) is the only writer.
 *
 * Import and use from any skill instead of re-deriving ticker mappings:
 *   const { loadCompanyMaster, findByTicker, findByScripCode, findInText } =
 *     require('.../lib/companyMaster');
 */
const fs = require('fs');
const path = require('path');
const { sanitizeCompanyId } = require('@stock/api/utils/companyId');

function getMasterPath() {
  const v2 = path.join(require('./db').dataRoot(), 'cache', 'company-master.json');
  if (fs.existsSync(v2)) return v2;
  const legacy = path.join(__dirname, '..', 'data', 'company-master.json');
  if (fs.existsSync(legacy)) return legacy;
  const repoRootCache = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'data',
    'cache',
    'company-master.json'
  );
  if (fs.existsSync(repoRootCache)) return repoRootCache;
  return v2;
}

const MASTER_PATH = getMasterPath();

const SUFFIX_RE = /\b(LIMITED|LTD|PVT|PRIVATE|INDIA|CO|COMPANY|CORP|CORPORATION|INC|LLC)\b\.?/gi;
function normalizeName(name) {
  return String(name || '')
    .toUpperCase()
    .replace(SUFFIX_RE, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidTicker(t) {
  if (!t || typeof t !== 'string') return false;
  const s = t.trim();
  return s.length >= 1 && s.length <= 25 && !/\s/.test(s) && /^[A-Za-z0-9_.-]+$/.test(s);
}

let _cache = null;
function loadCompanyMaster({ forceReload = false } = {}) {
  if (_cache && !forceReload) return _cache;
  const masterPath = getMasterPath();
  if (fs.existsSync(masterPath)) {
    try {
      _cache = JSON.parse(fs.readFileSync(masterPath, 'utf8'));
    } catch (_) {
      _cache = { companies: [] };
    }
  } else {
    _cache = { companies: [] };
  }
  if (!Array.isArray(_cache.companies)) _cache.companies = [];

  // Build lookup indexes once per load.
  _cache._byNseTicker = new Map();
  _cache._byBseScripCode = new Map();
  _cache._byBseSymbol = new Map();
  _cache._byNormName = new Map();
  _cache._byKeyword = new Map();
  for (const c of _cache.companies) {
    if (c.nseTicker) _cache._byNseTicker.set(c.nseTicker.toUpperCase(), c);
    if (c.bseTicker) _cache._byBseScripCode.set(String(c.bseTicker), c);
    // BSE's own alpha tradingsymbol (distinct from the numeric scrip code) —
    // exchange feeds like BSE's bulk/block-deal API report THIS as their
    // `scripname`, not the full legal name or the numeric code (verified
    // 2026-07-30: AQYLON's BSE bulk-deal rows carry symbol "AQYLON", same as
    // its NSE ticker). Index it separately so lookups can match it directly.
    if (c.bseSymbol) _cache._byBseSymbol.set(c.bseSymbol.toUpperCase(), c);
    if (c.companyName) _cache._byNormName.set(normalizeName(c.companyName), c);
    if (c.cleanName) _cache._byNormName.set(normalizeName(c.cleanName), c);
    if (c.rawNseName) _cache._byNormName.set(normalizeName(c.rawNseName), c);
    if (c.rawBseName) _cache._byNormName.set(normalizeName(c.rawBseName), c);
    for (const kw of c.keywords || []) {
      _cache._byKeyword.set(kw.toUpperCase(), c);
    }
  }

  // Also overlay companies.json (Data Ecosystem v2 primary metadata collection)
  // to ensure clean StockScans names, known NSE<->BSE links, and newly touched companies
  // are indexed even before a company-master rebuild.
  try {
    const companiesJsonPath = path.join(require('./db').dataRoot(), 'companies.json');
    if (fs.existsSync(companiesJsonPath)) {
      const compDb = JSON.parse(fs.readFileSync(companiesJsonPath, 'utf8'));
      for (const [id, c] of Object.entries(compDb)) {
        const rawNse = c.nseTicker || (id.startsWith('NSE:') ? id.slice(4) : null);
        const rawBse = c.bseScripCode || (id.startsWith('BSE:') ? id.slice(4) : null);
        const nseT = isValidTicker(rawNse) ? rawNse.toUpperCase() : '';
        const bseC = /^\d+$/.test(String(rawBse || '').trim()) ? String(rawBse).trim() : '';
        const norm = c.name ? normalizeName(c.name) : null;
        let existing =
          (nseT && _cache._byNseTicker.get(nseT)) ||
          (bseC && _cache._byBseScripCode.get(bseC)) ||
          (norm && _cache._byNormName.get(norm));
        if (existing) {
          if (!existing.cleanName && c.name) existing.cleanName = c.name;
          if (!existing.nseTicker && nseT) existing.nseTicker = nseT;
          if (!existing.bseTicker && bseC) existing.bseTicker = bseC;
          if (norm) _cache._byNormName.set(norm, existing);
        } else if (norm) {
          const entry = {
            companyId: nseT ? `NSE:${nseT}` : bseC ? `BSE:${bseC}` : `NAME:${norm}`,
            nseTicker: nseT || null,
            bseTicker: bseC || null,
            companyName: c.name,
            cleanName: c.name,
            keywords: c.keywords || [],
          };
          if (nseT) _cache._byNseTicker.set(nseT, entry);
          if (bseC) _cache._byBseScripCode.set(String(bseC), entry);
          _cache._byNormName.set(norm, entry);
        }
      }
    }
  } catch (_) {
    /* best effort */
  }

  return _cache;
}

/**
 * Look up by NSE ticker, e.g. "CEIGALL" -> company record or null. Strips
 * dash-separated series suffixes (e.g. "CEIGALL-BE") via `sanitizeCompanyId`
 * first — the master's keys are always the bare symbol.
 * @param {string} ticker
 * @returns {Object|null}
 */
function findByTicker(ticker) {
  const m = loadCompanyMaster();
  const cleaned = sanitizeCompanyId(String(ticker || ''))
    .toUpperCase()
    .replace(/^NSE:/, '')
    .trim();
  return m._byNseTicker.get(cleaned) || null;
}

/**
 * Look up by BSE scrip/exchange_token code, e.g. "500325" -> company record or null.
 * @param {string|number} scripCode
 * @returns {Object|null}
 */
function findByScripCode(scripCode) {
  const m = loadCompanyMaster();
  const cleaned = sanitizeCompanyId(String(scripCode || ''))
    .replace(/^BSE:/, '')
    .trim();
  return m._byBseScripCode.get(cleaned) || null;
}

/**
 * Look up by BSE's own alpha tradingsymbol (not the numeric scrip code), e.g. "AQYLON".
 * @param {string} bseSymbol
 * @returns {Object|null}
 */
function findByBseTicker(bseSymbol) {
  const m = loadCompanyMaster();
  const cleaned = sanitizeCompanyId(String(bseSymbol || ''))
    .toUpperCase()
    .replace(/^BSE:/, '')
    .trim();
  return m._byBseSymbol.get(cleaned) || null;
}

/**
 * Look up by company name (exact normalized match against clean, NSE, BSE, or StockScans name).
 * Falls back to findInText if direct normalized match fails.
 * @param {string} name
 * @returns {Object|null}
 */
function findByName(name) {
  if (!name) return null;
  const m = loadCompanyMaster();
  const norm = normalizeName(name);
  if (!norm) return null;
  const direct = m._byNormName.get(norm);
  if (direct) return direct;
  return findInText(name);
}

/**
 * Resolve any company identifier (NSE ticker, BSE scrip code, BSE tradingsymbol,
 * NSE raw name, BSE raw name, or StockScans company name) to its canonical NSE ticker.
 * Returns null if the company is BSE-only or unresolvable.
 * @param {string|number} input
 * @returns {string|null}
 */
function resolveToNseTicker(input) {
  if (!input) return null;
  const str = String(input).trim();

  // If the input contains spaces, it is a company name, not a ticker
  if (/\s/.test(str)) {
    const nameHit = findByName(str);
    return nameHit && nameHit.nseTicker ? nameHit.nseTicker : null;
  }

  // 1. Direct NSE ticker
  const nseHit = findByTicker(str);
  if (nseHit && nseHit.nseTicker) return nseHit.nseTicker;

  // 2. BSE numeric scrip code
  if (/^(?:BSE:)?\d+$/.test(str)) {
    const scripHit = findByScripCode(str);
    if (scripHit && scripHit.nseTicker) return scripHit.nseTicker;
  }

  // 3. BSE alpha trading symbol
  const bseSymHit = findByBseTicker(str);
  if (bseSymHit && bseSymHit.nseTicker) return bseSymHit.nseTicker;

  // 4. Exact normalized name
  const nameHit = findByName(str);
  if (nameHit && nameHit.nseTicker) return nameHit.nseTicker;

  return null;
}

/**
 * Canonical identity resolver for deals/corporate-action events across NSE and BSE.
 * Guarantee: For ANY company that is dual-listed or listed on NSE, the key and displaySymbol
 * will ALWAYS be the NSE scrip code (`NSE:{nseTicker}`).
 * BSE-only companies resolve to `BSE:{bseScripCode}`.
 *
 * @param {Object} opts
 * @param {string} [opts.symbol]
 * @param {string} [opts.company]
 * @param {string} [opts.companyName]
 * @param {string} [opts.exchange]
 * @returns {{
 *   key: string,
 *   displaySymbol: string,
 *   companyName: string,
 *   nseTicker: string|null,
 *   bseTicker: string|null,
 *   companyId: string|null,
 *   isDualListed: boolean
 * }}
 */
function resolveCompanyIdentity({ symbol, company, companyName, exchange }) {
  const name = companyName || company || symbol || '';
  let cleanSymbol = symbol ? String(symbol).trim() : '';
  let effectiveExchange = exchange;
  if (!effectiveExchange) {
    if (cleanSymbol.startsWith('NSE:')) effectiveExchange = 'NSE';
    else if (cleanSymbol.startsWith('BSE:')) effectiveExchange = 'BSE';
  }
  cleanSymbol = cleanSymbol.replace(/^(NSE|BSE):/i, '');

  let rec = null;

  // 1. Exchange-specific direct lookup
  if (effectiveExchange === 'NSE' && cleanSymbol) {
    rec = findByTicker(cleanSymbol);
  } else if (effectiveExchange === 'BSE' && cleanSymbol && /^\d+$/.test(cleanSymbol)) {
    rec = findByScripCode(cleanSymbol);
  } else if (effectiveExchange === 'BSE' && cleanSymbol && !/^\d+$/.test(cleanSymbol)) {
    rec = findByBseTicker(cleanSymbol);
  }

  // 2. Cross-exchange fallback if symbol didn't match under declared exchange
  if (!rec && cleanSymbol) {
    rec = findByTicker(cleanSymbol) || findByScripCode(cleanSymbol) || findByBseTicker(cleanSymbol);
  }

  // 3. Name lookup (clean name, NSE name, BSE name, StockScans name)
  if (!rec && name) {
    rec = findByName(name);
  }

  // Canonical key policy: Always use NSE scrip code if available!
  const nseTicker = rec
    ? rec.nseTicker
    : effectiveExchange === 'NSE' && isValidTicker(cleanSymbol) && !/^\d+$/.test(cleanSymbol)
      ? sanitizeCompanyId(cleanSymbol).toUpperCase()
      : null;
  const bseTicker = rec
    ? rec.bseTicker
    : effectiveExchange === 'BSE' && isValidTicker(cleanSymbol) && /^\d+$/.test(cleanSymbol)
      ? sanitizeCompanyId(cleanSymbol)
      : null;

  let key;
  let displaySymbol;

  if (nseTicker) {
    key = `NSE:${nseTicker}`;
    displaySymbol = nseTicker;
  } else if (bseTicker) {
    key = `BSE:${bseTicker}`;
    displaySymbol = bseTicker;
  } else {
    const norm = normalizeName(name);
    key = norm ? `NAME:${norm}` : `UNKNOWN:${cleanSymbol || 'deal'}`;
    displaySymbol = sanitizeCompanyId(cleanSymbol) || name;
  }

  const resolvedCompanyName = (rec && (rec.cleanName || rec.companyName)) || name;

  return {
    key,
    displaySymbol,
    companyName: resolvedCompanyName,
    nseTicker: nseTicker || null,
    bseTicker: bseTicker || null,
    companyId: key.startsWith('NAME:') || key.startsWith('UNKNOWN:') ? null : key,
    isDualListed: Boolean(nseTicker && bseTicker),
  };
}

/**
 * Resolve any company input (string or object) to its canonical companyId
 * (e.g. "NSE:TICKER" or "BSE:SCRIPCODE") based on company-master.json.
 *
 * Guarantees:
 * 1. Dual-listed companies ALWAYS return "NSE:{nseTicker}".
 * 2. BSE-only companies return "BSE:{bseTicker}".
 * 3. NSE-only companies return "NSE:{nseTicker}".
 * 4. If unmapped in master and fallback is true (default), returns sanitized
 *    original input if formatted as a ticker/id, or null if unknown.
 *
 * @param {string|Object} input - e.g. "NPST", "NSE:NPST", "544396", "BSE:544396",
 *   "Network People Services Technologies Ltd", or { symbol, company, companyName, exchange }
 * @param {Object} [opts]
 * @param {boolean} [opts.fallback=true]
 * @returns {string|null}
 */
function resolveCompanyId(input, { fallback = true } = {}) {
  if (!input) return null;
  let opts = {};
  if (typeof input === 'object') {
    opts = input;
  } else {
    const s = String(input).trim();
    if (s.startsWith('NSE:')) {
      opts = { symbol: s.slice(4), exchange: 'NSE' };
    } else if (s.startsWith('BSE:')) {
      opts = { symbol: s.slice(4), exchange: 'BSE' };
    } else if (/\s/.test(s)) {
      opts = { companyName: s };
    } else if (/^\d+$/.test(s)) {
      opts = { symbol: s, exchange: 'BSE' };
    } else {
      opts = { symbol: s };
    }
  }

  const identity = resolveCompanyIdentity(opts);
  if (identity && identity.companyId) {
    return identity.companyId;
  }

  if (!fallback) return null;

  if (typeof input === 'string') {
    const clean = sanitizeCompanyId(input);
    if (clean.startsWith('NSE:') || clean.startsWith('BSE:')) {
      return !/\s/.test(clean) ? clean : null;
    }
    if (isValidTicker(clean)) {
      return /^\d+$/.test(clean) ? `BSE:${clean}` : `NSE:${clean.toUpperCase()}`;
    }
  }

  return null;
}

/**
 * Resolve a company mention inside free text (tweet/announcement body).
 * Priority: exact #TICKER hashtag > known keyword phrase > normalized
 * company-name substring. Returns the first (highest-priority) match or null.
 * This is intentionally conservative — no fuzzy/edit-distance matching, to
 * avoid false positives feeding a conviction/signal pipeline.
 */
function findInText(text) {
  const m = loadCompanyMaster();
  const upper = String(text || '').toUpperCase();

  const hashtagMatch = upper.match(/#([A-Z0-9]{2,20})\b/);
  if (hashtagMatch) {
    const byTicker = m._byNseTicker.get(hashtagMatch[1]);
    if (byTicker) return byTicker;
    const byKeyword = m._byKeyword.get(hashtagMatch[1]);
    if (byKeyword) return byKeyword;
  }

  for (const [kw, company] of m._byKeyword) {
    if (kw.length >= 4 && upper.includes(kw)) return company;
  }

  const normText = normalizeName(upper);
  for (const [norm, company] of m._byNormName) {
    if (norm.length >= 4 && normText.includes(norm)) return company;
  }

  return null;
}

module.exports = {
  loadCompanyMaster,
  findByTicker,
  findByScripCode,
  findByBseTicker,
  findByName,
  findInText,
  resolveToNseTicker,
  resolveCompanyIdentity,
  resolveCompanyId,
  normalizeName,
  getMasterPath,
  MASTER_PATH,
};
