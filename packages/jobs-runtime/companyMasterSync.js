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
      // Kite's BSE rows carry BOTH a numeric scrip code (exchange_token) and
      // a tradingsymbol — and that BSE tradingsymbol is very often the same
      // alpha ticker as the NSE one (e.g. "AQYLON", "GEOJITFSL", "NOVARTIND"
      // all match across exchanges). BSE's own bulk/block-deal feed reports
      // this alpha tradingsymbol (not the numeric scrip code, not the full
      // legal name) as its `scripname` — verified 2026-07-30 when AQYLON's
      // BSE bulk-deal rows carried `symbol: "AQYLON"` while its insider PIT
      // filing on the same day carried the full legal name "Aqylon Nexus
      // Limited". Without indexing this BSE tradingsymbol too, bulk/block
      // deals for a dual-listed stock resolve to two different identities
      // (one via the NSE ticker, one falling through to a raw "AQYLON"
      // name-key that doesn't match "AQYLON NEXUS" in the master) and the
      // digest shows the same stock as two separate rows.
      if (!bseByName.has(norm)) {
        bseByName.set(norm, { scripCode: exchangeToken, bseSymbol: tradingsymbol, rawName: name });
      }
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

  // Kite's `name` column is truncated to a fixed width, and NSE and BSE feed
  // rows for the SAME company are truncated to DIFFERENT widths (e.g. Geojit
  // Financial Services: NSE row name = "GEOJIT FINANCIAL SER L", BSE row name
  // = "GEOJIT FINANCIAL SERVICES LIMI" — 22 vs 31 chars, verified 2026-07-30).
  // An exact normalizedName match therefore misses this pair entirely and
  // companyMasterSync used to emit two orphan records (NSE-only + BSE-only)
  // for one real dual-listed company, which in turn broke dealsDigest's
  // cross-exchange insider-filing dedup for that stock. Fix: after exact
  // matching, do a second pass pairing any still-unmatched NSE/BSE norms
  // where one is a prefix of the other (both truncations of the same longer
  // name) and the shared prefix is long enough (>=8 chars) to be a safe
  // signal rather than a coincidence.
  // NSE and BSE both abbreviate/truncate the raw name to a fixed width, but
  // they cut at different points AND sometimes abbreviate whole words rather
  // than hard-truncating mid-string (e.g. Geojit Financial Services: NSE =
  // "GEOJIT FINANCIAL SER L", BSE = "GEOJIT FINANCIAL SERVICES LIMI" — "SER"
  // is a word-abbreviation of "SERVICES", not a character-truncation of it).
  // A plain longer.startsWith(shorter) check misses this, so compare
  // token-by-token: same token count, the first two tokens must match
  // EXACTLY (a strong anchor so we don't accidentally fuse two different
  // companies that merely start with the same word), and every remaining
  // token pair must be an exact match or one token a prefix of the other.
  const usedBseNorms = new Set();
  const bseNormList = [...bseByName.keys()];
  const bseTokensByNorm = new Map(bseNormList.map((n) => [n, n.split(' ').filter(Boolean)]));

  // NOTE: token counts frequently DON'T match even for the same company —
  // "DR LAL PATH LABS" (4 tokens) vs "DR LAL PATHLABS" (3 tokens, no space
  // before "LABS"), or "CCL PRODUCTS I" (extra trailing "I", an abbreviated
  // "INDIA" survivor after suffix-stripping removed the rest of the word) vs
  // "CCL PRODUCTS" (2 tokens) — both verified 2026-07-30. But an anchor of
  // "first two tokens match exactly" is NOT enough on its own: "INDIAN
  // RAILWAY FIN CORP L" (IRFC) and "INDIAN RAILWAY CATERING AND TO" (IRCTC)
  // both start with "INDIAN RAILWAY" and are completely different companies
  // — verified false-positive during testing. So: anchor on the first two
  // tokens (rejects unrelated companies like "RELIANCE INDUSTRIES" vs
  // "RELIANCE POWER" outright), then require the REMAINING tokens to also be
  // compatible — checked positionally (each pair equal or one a
  // prefix of the other, same as the anchor logic) with a couple of narrow,
  // safe allowances for the token-count mismatches actually observed: a
  // dangling trailing 1-2 char token on the longer side (an abbreviation
  // remnant like "I"/"L"), or adjacent tokens on the longer side collapsing
  // (no separator) to match the shorter side's token count (handles the
  // "PATH LABS" vs "PATHLABS" split-word case). This rejects IRFC/IRCTC
  // (remaining "FIN CORP L" vs "CATERING AND TO" — first pair "FIN" isn't a
  // prefix of "CATERING" —) while still accepting Geojit, CCL Products, and
  // Dr Lal Pathlabs.
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

  const allNorms = new Set([...nseByName.keys(), ...bseByName.keys()]);
  const companies = [];
  const consumedBseNormsFromExactPass = new Set(
    [...nseByName.keys()].filter((n) => bseByName.has(n))
  );
  for (const n of consumedBseNormsFromExactPass) usedBseNorms.add(n);

  for (const norm of allNorms) {
    if (usedBseNorms.has(norm) && !nseByName.has(norm) && bseByName.has(norm)) {
      // This BSE norm was already consumed as the truncation-match partner of
      // an NSE norm processed earlier in this same loop — skip so it isn't
      // also emitted as a standalone BSE-only record.
      continue;
    }

    let nse = nseByName.get(norm);
    let bse = bseByName.get(norm);

    if (nse && !bse) {
      const matchedBseNorm = findTruncationMatch(norm);
      if (matchedBseNorm) {
        bse = bseByName.get(matchedBseNorm);
        usedBseNorms.add(matchedBseNorm);
      }
    }

    const rawName = (nse && nse.rawName) || (bse && bse.rawName);
    const nseTicker = nse ? nse.ticker : null;
    const bseTicker = bse ? bse.scripCode : null;
    const bseSymbol = bse ? bse.bseSymbol || null : null;
    const companyId = nseTicker ? `NSE:${nseTicker}` : `BSE:${bseTicker}`;

    const prior = existingByNorm.get(norm);
    const keywords = prior && Array.isArray(prior.keywords) ? prior.keywords : [];

    companies.push({
      companyId,
      nseTicker,
      bseTicker,
      bseSymbol,
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
