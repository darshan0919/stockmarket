#!/usr/bin/env node
/**
 * Company master sync — builds/updates the single shared ticker-mapping
 * database used across skills: NSE ticker <-> BSE scrip code <-> company
 * name <-> keywords.
 *
 * Source: Kite Connect's public instruments dump (https://api.kite.trade/instruments)
 * — this is a public, unauthenticated CSV (confirmed by the existing usage in
 * packages/jobs-runtime/dealsDigest.js's isAvailableOnNSE()), so no API key
 * or secret is required for this sync.
 *
 * This file is REFERENCE DATA (Data Ecosystem v2): a regenerable heavy
 * derivable stored at data/cache/company-master.json — kept locally, synced to
 * Drive by scripts/data.js, never committed to git. Other skills read it
 * synchronously via lib/companyMaster.js.
 *
 * Usage:
 *   node companyMasterSync.js                 # fetch + merge + write
 *   node companyMasterSync.js --dry-run        # fetch + report diff, no write
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { loadEnv, argValue, hasFlag } = require('./lib/env');
const { syncStockscansCompanies } = require('./lib/stockscansCompanySync');

// Data Ecosystem v2: write to data/cache/ (synced by scripts/data.js push).
const OUT_DIR = path.join(require('./lib/db').dataRoot(), 'cache');
const OUT_PATH = path.join(OUT_DIR, 'company-master.json');
const INSTRUMENTS_URL = 'https://api.kite.trade/instruments';

const SUFFIX_RE = /\b(LIMITED|LTD|PVT|PRIVATE|INDIA|CO|COMPANY|CORP|CORPORATION|INC|LLC)\b\.?/gi;

function normalizeName(name) {
  return String(name || '')
    .toUpperCase()
    .replace(SUFFIX_RE, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Minimal CSV line splitter that respects double-quoted fields. */
function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
          return;
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = hasFlag('--dry-run');
  const skipStockscans = hasFlag('--skip-stockscans');
  const resetCache = hasFlag('--reset-cache');
  const concurrency = Number(argValue('--concurrency') || 1);
  const pageDelayMs = Number(argValue('--page-delay-ms') || 5000);
  const maxPages = Number(argValue('--max-pages') || Infinity);

  let stockscansSummary = null;
  if (!skipStockscans) {
    console.error('Phase 1: Syncing Stockscans company universe & sectors/industries...');
    try {
      stockscansSummary = await syncStockscansCompanies({
        dryRun,
        resetCache,
        concurrency,
        pageDelayMs,
        maxPages,
      });
    } catch (e) {
      console.error(
        `Warning: Stockscans company sync failed (${e.message}). Proceeding with Kite instruments sync...`
      );
    }
  } else {
    console.error('Phase 1: Skipping Stockscans company sync (--skip-stockscans).');
  }

  console.error('Phase 2: Fetching Kite instruments dump...');
  const csv = await fetchText(INSTRUMENTS_URL);
  const lines = csv.split('\n').filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));

  const nseByName = new Map(); // normalizedName -> {ticker, rawName, norm}
  const bseByName = new Map(); // normalizedName -> {scripCode, bseSymbol, rawName, norm}
  const nseBySymbol = new Map(); // ticker -> {ticker, rawName, norm}
  const bseBySymbol = new Map(); // tradingsymbol -> {scripCode, bseSymbol, rawName, norm}
  const bseByScripCode = new Map(); // scripCode -> {scripCode, bseSymbol, rawName, norm}

  for (let i = 1; i < lines.length; i++) {
    const p = parseCsvLine(lines[i]);
    if (p.length < header.length) continue;
    const exchange = p[col.exchange];
    const instrumentType = p[col.instrument_type];
    if (instrumentType !== 'EQ') continue;

    const tradingsymbol = p[col.tradingsymbol];
    const name = p[col.name];
    const exchangeToken = p[col.exchange_token];
    const norm = normalizeName(name);
    if (!norm) continue;

    if (exchange === 'NSE') {
      const entry = { ticker: tradingsymbol, rawName: name, norm };
      if (!nseByName.has(norm)) nseByName.set(norm, entry);
      if (tradingsymbol && !nseBySymbol.has(tradingsymbol.toUpperCase())) {
        nseBySymbol.set(tradingsymbol.toUpperCase(), entry);
      }
    } else if (exchange === 'BSE') {
      const entry = {
        scripCode: String(exchangeToken),
        bseSymbol: tradingsymbol,
        rawName: name,
        norm,
      };
      if (!bseByName.has(norm)) {
        bseByName.set(norm, entry);
      }
      if (tradingsymbol && !bseBySymbol.has(tradingsymbol.toUpperCase())) {
        bseBySymbol.set(tradingsymbol.toUpperCase(), entry);
      }
      if (exchangeToken && !bseByScripCode.has(String(exchangeToken))) {
        bseByScripCode.set(String(exchangeToken), entry);
      }
    }
  }

  // Load companies.json (Data Ecosystem v2 primary metadata collection)
  const db = require('./lib/db');
  const COMPANIES_FILE = db.collectionFile('companies');
  let companiesJson = {};
  if (fs.existsSync(COMPANIES_FILE)) {
    try {
      companiesJson = db.loadFile(COMPANIES_FILE);
    } catch (e) {
      console.error(`Warning: could not load ${COMPANIES_FILE}: ${e.message}`);
    }
  }

  const compByNse = new Map();
  const compByBse = new Map();
  const compByNorm = new Map();
  for (const [id, c] of Object.entries(companiesJson)) {
    const nseT = (c.nseTicker || (id.startsWith('NSE:') ? id.slice(4) : null) || '').toUpperCase();
    const bseC = c.bseScripCode || (id.startsWith('BSE:') ? id.slice(4) : null) || '';
    if (nseT) compByNse.set(nseT, c);
    if (bseC) compByBse.set(String(bseC), c);
    if (c.name) compByNorm.set(normalizeName(c.name), c);
  }

  // Load existing file to preserve keywords across syncs.
  let existing = { companies: [] };
  if (fs.existsSync(OUT_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    } catch (e) {
      console.error(`Warning: could not parse existing ${OUT_PATH}, starting fresh: ${e.message}`);
    }
  }
  const existingByNorm = new Map(
    (existing.companies || []).map((c) => [normalizeName(c.companyName), c])
  );

  const usedBseScripCodes = new Set();
  const usedBseNorms = new Set();
  const bseNormList = [...bseByName.keys()];
  const bseTokensByNorm = new Map(bseNormList.map((n) => [n, n.split(' ').filter(Boolean)]));

  function positionalPrefixCompatible(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      const shorter = a[i].length <= b[i].length ? a[i] : b[i];
      const longer = a[i].length <= b[i].length ? b[i] : a[i];
      if (!shorter || !longer.startsWith(shorter)) return false;
    }
    return true;
  }

  function collapseToLength(tokens, targetLen) {
    let cur = tokens.slice();
    while (cur.length > targetLen && cur.length >= 2) {
      const merged = cur[cur.length - 2] + cur[cur.length - 1];
      cur = cur.slice(0, -2).concat([merged]);
    }
    return cur;
  }

  function remainderCompatible(restA, restB) {
    if (positionalPrefixCompatible(restA, restB)) return true;
    if (restA.length === restB.length + 1 && restA[restA.length - 1].length <= 2) {
      if (positionalPrefixCompatible(restA.slice(0, -1), restB)) return true;
    }
    if (restB.length === restA.length + 1 && restB[restB.length - 1].length <= 2) {
      if (positionalPrefixCompatible(restA, restB.slice(0, -1))) return true;
    }
    if (restA.length !== restB.length) {
      const [longer, shorter] = restA.length > restB.length ? [restA, restB] : [restB, restA];
      if (longer.length - shorter.length <= 2) {
        if (positionalPrefixCompatible(collapseToLength(longer, shorter.length), shorter)) {
          return true;
        }
      }
    }
    return false;
  }

  function tokensCompatible(nseTokens, bseTokens) {
    if (nseTokens.length < 2 || bseTokens.length < 2) return false;
    if (nseTokens[0] !== bseTokens[0] || nseTokens[1] !== bseTokens[1]) return false;
    return remainderCompatible(nseTokens.slice(2), bseTokens.slice(2));
  }

  function findTruncationMatch(nseNorm) {
    const nseTokens = nseNorm.split(' ').filter(Boolean);
    for (const bseNorm of bseNormList) {
      if (usedBseNorms.has(bseNorm)) continue;
      if (tokensCompatible(nseTokens, bseTokensByNorm.get(bseNorm))) return bseNorm;
    }
    return null;
  }

  const companies = [];

  // Pass 1: Process all NSE listed equities and pair with BSE counterparts
  for (const [ticker, nse] of nseBySymbol) {
    let bse = null;

    // 1a. Check known pairing from companies.json
    const compRecord = compByNse.get(ticker);
    if (compRecord && compRecord.bseScripCode) {
      const scripStr = String(compRecord.bseScripCode);
      if (bseByScripCode.has(scripStr)) {
        bse = bseByScripCode.get(scripStr);
      }
    }

    // 1b. Check exact trading symbol match (e.g. NPST, RELIANCE, TCS)
    if (!bse && bseBySymbol.has(ticker)) {
      const candidate = bseBySymbol.get(ticker);
      if (!usedBseScripCodes.has(candidate.scripCode)) {
        bse = candidate;
      }
    }

    // 1c. Check exact normalized name match
    if (!bse && bseByName.has(nse.norm)) {
      const candidate = bseByName.get(nse.norm);
      if (!usedBseScripCodes.has(candidate.scripCode)) {
        bse = candidate;
      }
    }

    // 1d. Check token prefix / truncation match
    if (!bse) {
      const matchedBseNorm = findTruncationMatch(nse.norm);
      if (matchedBseNorm) {
        const candidate = bseByName.get(matchedBseNorm);
        if (candidate && !usedBseScripCodes.has(candidate.scripCode)) {
          bse = candidate;
        }
      }
    }

    if (bse) {
      usedBseScripCodes.add(bse.scripCode);
      usedBseNorms.add(bse.norm);
    }

    const nseTicker = nse.ticker;
    const bseTicker = bse ? bse.scripCode : compRecord ? compRecord.bseScripCode || null : null;
    const bseSymbol = bse ? bse.bseSymbol : null;
    const cleanName = compRecord ? compRecord.name : compByNorm.get(nse.norm)?.name || null;
    const rawName = nse.rawName || (bse && bse.rawName);
    const companyName = cleanName || rawName;

    const prior =
      existingByNorm.get(nse.norm) ||
      (cleanName ? existingByNorm.get(normalizeName(cleanName)) : null);
    const keywords = [
      ...new Set([
        ...(prior && Array.isArray(prior.keywords) ? prior.keywords : []),
        ...(compRecord && Array.isArray(compRecord.keywords) ? compRecord.keywords : []),
      ]),
    ];

    companies.push({
      companyId: `NSE:${nseTicker}`,
      nseTicker,
      bseTicker,
      bseSymbol,
      companyName,
      cleanName,
      sector: compRecord ? compRecord.sector || null : null,
      industry: compRecord ? compRecord.industry || null : null,
      rawNseName: nse.rawName,
      rawBseName: bse ? bse.rawName : null,
      keywords,
    });
  }

  // Pass 2: Add remaining BSE-only equities (not paired with any NSE equity)
  for (const [scripCode, bse] of bseByScripCode) {
    if (usedBseScripCodes.has(scripCode)) continue;

    const compRecord = compByBse.get(scripCode) || compByNorm.get(bse.norm);
    const cleanName = compRecord ? compRecord.name : null;
    const companyName = cleanName || bse.rawName;
    const prior =
      existingByNorm.get(bse.norm) ||
      (cleanName ? existingByNorm.get(normalizeName(cleanName)) : null);
    const keywords = [
      ...new Set([
        ...(prior && Array.isArray(prior.keywords) ? prior.keywords : []),
        ...(compRecord && Array.isArray(compRecord.keywords) ? compRecord.keywords : []),
      ]),
    ];

    companies.push({
      companyId: `BSE:${scripCode}`,
      nseTicker: null,
      bseTicker: scripCode,
      bseSymbol: bse.bseSymbol || null,
      companyName,
      cleanName,
      sector: compRecord ? compRecord.sector || null : null,
      industry: compRecord ? compRecord.industry || null : null,
      rawNseName: null,
      rawBseName: bse.rawName,
      keywords,
    });
  }

  companies.sort((a, b) => a.companyId.localeCompare(b.companyId));

  const output = {
    generatedAt: new Date().toISOString(),
    source: skipStockscans
      ? 'kite-instruments-public-csv+companies-json'
      : 'stockscans-scans+kite-instruments-public-csv+companies-json',
    totalCompanies: companies.length,
    nseListed: companies.filter((c) => c.nseTicker).length,
    dualListed: companies.filter((c) => c.nseTicker && c.bseTicker).length,
    bseOnly: companies.filter((c) => !c.nseTicker && c.bseTicker).length,
    withSectorIndustry: companies.filter((c) => c.sector || c.industry).length,
    companies,
  };

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          status: 'dry-run',
          ...output,
          companies: undefined,
          stockscans: stockscansSummary,
        },
        null,
        2
      )
    );
    return;
  }

  // Backfill missing bseScripCode into companies.json if found during sync
  let companiesDirty = false;
  if (fs.existsSync(COMPANIES_FILE)) {
    for (const c of Object.values(companiesJson)) {
      const nseT = (
        c.nseTicker ||
        (c.id && c.id.startsWith('NSE:') ? c.id.slice(4) : null) ||
        ''
      ).toUpperCase();
      if (nseT && !c.bseScripCode) {
        const paired = companies.find((m) => m.nseTicker === nseT);
        if (paired && paired.bseTicker) {
          c.bseScripCode = paired.bseTicker;
          if (!c.aliases) c.aliases = [];
          const bseAlias = `BSE:${paired.bseTicker}`;
          if (!c.aliases.includes(bseAlias)) c.aliases.push(bseAlias);
          c.modifiedTime = require('./lib/ist').nowIstIso();
          companiesDirty = true;
        }
      }
    }
    if (companiesDirty) {
      db.withLock('companies', () => {
        db.writeFileAtomic(COMPANIES_FILE, companiesJson);
      });
      console.error('Enriched companies.json with newly paired BSE scrip codes.');
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(output, null, 2));
  console.log(
    JSON.stringify(
      {
        status: 'ok',
        outPath: OUT_PATH,
        totalCompanies: companies.length,
        nseListed: output.nseListed,
        dualListed: output.dualListed,
        bseOnly: output.bseOnly,
        withSectorIndustry: output.withSectorIndustry,
        stockscans: stockscansSummary,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error('companyMasterSync failed:', e.message);
  process.exit(1);
});
