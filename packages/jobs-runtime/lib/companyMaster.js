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

// Data Ecosystem v2: master lives in data/cache/ (regenerable via Kite; synced
// to Drive by scripts/data.js). Falls back to the legacy in-package copy so the
// lookup keeps working before the first companyMasterSync run on a machine.
const MASTER_PATH_V2 = path.join(require('./db').dataRoot(), 'cache', 'company-master.json');
const MASTER_PATH_LEGACY = path.join(__dirname, '..', 'data', 'company-master.json');
const MASTER_PATH = fs.existsSync(MASTER_PATH_V2) ? MASTER_PATH_V2 : MASTER_PATH_LEGACY;

const SUFFIX_RE = /\b(LIMITED|LTD|PVT|PRIVATE|INDIA|CO|COMPANY|CORP|CORPORATION|INC|LLC)\b\.?/gi;
function normalizeName(name) {
  return String(name || '')
    .toUpperCase()
    .replace(SUFFIX_RE, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let _cache = null;
function loadCompanyMaster({ forceReload = false } = {}) {
  if (_cache && !forceReload) return _cache;
  if (!fs.existsSync(MASTER_PATH)) {
    throw new Error(`Company master not found at ${MASTER_PATH}. Run companyMasterSync.js first.`);
  }
  _cache = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));

  // Build lookup indexes once per load.
  _cache._byNseTicker = new Map();
  _cache._byBseScripCode = new Map();
  _cache._byNormName = new Map();
  _cache._byKeyword = new Map();
  for (const c of _cache.companies) {
    if (c.nseTicker) _cache._byNseTicker.set(c.nseTicker.toUpperCase(), c);
    if (c.bseTicker) _cache._byBseScripCode.set(String(c.bseTicker), c);
    _cache._byNormName.set(normalizeName(c.companyName), c);
    for (const kw of c.keywords || []) {
      _cache._byKeyword.set(kw.toUpperCase(), c);
    }
  }
  return _cache;
}

/** Look up by NSE ticker, e.g. "CEIGALL" -> company record or null. */
function findByTicker(ticker) {
  const m = loadCompanyMaster();
  return (
    m._byNseTicker.get(
      String(ticker || '')
        .toUpperCase()
        .trim()
    ) || null
  );
}

/** Look up by BSE scrip/exchange_token code, e.g. "500325" -> company record or null. */
function findByScripCode(scripCode) {
  const m = loadCompanyMaster();
  return m._byBseScripCode.get(String(scripCode || '').trim()) || null;
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
  findInText,
  normalizeName,
  MASTER_PATH,
};
