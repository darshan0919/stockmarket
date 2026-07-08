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
  const dryRun = process.argv.includes('--dry-run');

  console.error('Fetching Kite instruments dump...');
  const csv = await fetchText(INSTRUMENTS_URL);
  const lines = csv.split('\n').filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));

  const nseByName = new Map(); // normalizedName -> {ticker, rawName}
  const bseByName = new Map(); // normalizedName -> {scripCode, rawName}

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
      if (!nseByName.has(norm)) nseByName.set(norm, { ticker: tradingsymbol, rawName: name });
    } else if (exchange === 'BSE') {
      if (!bseByName.has(norm)) bseByName.set(norm, { scripCode: exchangeToken, rawName: name });
    }
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

  const allNorms = new Set([...nseByName.keys(), ...bseByName.keys()]);
  const companies = [];
  for (const norm of allNorms) {
    const nse = nseByName.get(norm);
    const bse = bseByName.get(norm);
    const rawName = (nse && nse.rawName) || (bse && bse.rawName);
    const nseTicker = nse ? nse.ticker : null;
    const bseTicker = bse ? bse.scripCode : null;
    const companyId = nseTicker ? `NSE:${nseTicker}` : `BSE:${bseTicker}`;

    const prior = existingByNorm.get(norm);
    const keywords = prior && Array.isArray(prior.keywords) ? prior.keywords : [];

    companies.push({
      companyId,
      nseTicker,
      bseTicker,
      companyName: rawName,
      keywords,
    });
  }

  companies.sort((a, b) => a.companyId.localeCompare(b.companyId));

  const output = {
    generatedAt: new Date().toISOString(),
    source: 'kite-instruments-public-csv',
    totalCompanies: companies.length,
    nseListed: companies.filter((c) => c.nseTicker).length,
    bseOnly: companies.filter((c) => !c.nseTicker && c.bseTicker).length,
    companies,
  };

  if (dryRun) {
    console.log(JSON.stringify({ status: 'dry-run', ...output, companies: undefined }, null, 2));
    return;
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
        bseOnly: output.bseOnly,
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
