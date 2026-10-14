#!/usr/bin/env node
'use strict';

/**
 * Phase 0 helper (deterministic, zero-LLM) for forward-guidance-extractor.
 *
 * For each company in a saved scan (or explicit ticker list):
 * 1. Resolves canonical companyId via companyMaster.
 * 2. Checks latest transcript document via StockscansClient.latestTranscript(companyId).
 * 3. Checks DB cache: if current quarter's forward-guidance DTO already exists,
 *    returns the cached DTO (unless --force).
 * 4. Handles transcript status:
 *    - latest === null: records to missing list ("no transcript found")
 *    - latest.hasNotes === false: records to missing list ("transcript on file, AI notes not yet available — retry in a day or two")
 *    - latest.hasNotes === true: fetches concallNotes and growthCatalysts directly via StockscansClient.
 * 5. Pulls prior quarter's forward-guidance DTO from DB for Phase 1b QoQ comparison.
 * 6. Saves raw fetches to <out-dir>/<safe_company_id>_raw.json and writes manifest.json.
 *
 * Usage:
 *   node fetch_guidance_notes.js --scan-url <url> --out-dir <dir> [--force]
 *   node fetch_guidance_notes.js --tickers NSE:A,NSE:B --out-dir <dir> [--force]
 */

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../../../../packages/jobs-runtime/lib/env.js');
loadEnv();
const { StockscansClient } = require('../../../../stock-api/src/clients/StockscansClient.js');
const { resolveUniverse } = require('../../../../stock-api/src/analyzers/runScan.js');
const {
  resolveCompanyId,
  sanitizeCompanyId,
} = require('../../../../stock-api/src/utils/companyId.js');
const db = require('../../../../packages/jobs-runtime/lib/db.js');

function parseArgs(argv) {
  const out = {
    scanUrl: null,
    tickers: null,
    tickersFile: null,
    outDir: null,
    force: false,
    liquidityGate: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scan-url') out.scanUrl = argv[++i];
    else if (a === '--tickers')
      out.tickers = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === '--tickers-file') out.tickersFile = argv[++i];
    else if (a === '--out-dir') out.outDir = argv[++i];
    else if (a === '--force') out.force = true;
    else if (a === '--liquidity-gate') out.liquidityGate = true;
  }
  return out;
}

function safeFilename(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function retryOnce(fn) {
  try {
    return await fn();
  } catch (e) {
    // concallNotes/growthCatalysts occasionally return a transient bare
    // 401 {} or network blip that clears on an unmodified retry within ~1.5s
    await sleep(1500);
    return await fn();
  }
}

function getCompanyIdFromRow(row) {
  const direct = resolveCompanyId(row);
  if (direct) return sanitizeCompanyId(direct);

  const rawCandidate =
    row.companyId ||
    row['Company Id'] ||
    row.Symbol ||
    row['NSE Symbol'] ||
    row['BSE Scrip Code'] ||
    row['BSE Symbol'] ||
    row.symbol ||
    row['Company Name'] ||
    row.companyName;

  const resolved = resolveCompanyId(rawCandidate);
  if (resolved) return sanitizeCompanyId(resolved);

  if (rawCandidate && typeof rawCandidate === 'string') {
    const s = sanitizeCompanyId(rawCandidate.trim());
    if (s.startsWith('NSE:') || s.startsWith('BSE:')) return s;
    return `NSE:${s}`;
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.scanUrl && !args.tickers && !args.tickersFile) {
    console.error(
      'Usage: fetch_guidance_notes.js (--scan-url <url> | --tickers NSE:A,NSE:B | --tickers-file <path>) --out-dir <path> [--force]'
    );
    process.exit(1);
  }

  const REPO_ROOT = path.resolve(__dirname, '../../../../');
  const targetDir = args.outDir || path.join('data', 'cache', `guidance_${Date.now()}`);
  const outDir = path.isAbsolute(targetDir) ? targetDir : path.resolve(REPO_ROOT, targetDir);
  fs.mkdirSync(outDir, { recursive: true });

  const client = new StockscansClient();
  await client.validateAuth();

  const missing = [];
  const cachedDtos = [];
  const toProcess = [];
  let scanName = 'Explicit Tickers';
  let scanId = null;

  if (args.scanUrl) {
    const universe = await resolveUniverse(args.scanUrl, { liquidityGate: args.liquidityGate });
    scanName = universe.scanName || universe.scanId;
    scanId = universe.scanId;

    // Collect illiquid exclusions
    for (const ill of universe.excluded_illiquid || []) {
      const cid = getCompanyIdFromRow(ill);
      missing.push({
        ticker: cid || ill.Symbol || ill['Company Name'] || 'Unknown',
        companyName: ill['Company Name'] || ill.companyName || cid,
        quarter: 'N/A',
        reason: ill._exclusionReason || 'illiquid (filtered by liquidity gate)',
        scanRow: ill,
      });
    }

    // Collect unresolved liquidity
    for (const unr of universe.unresolved_liquidity || []) {
      const cid = getCompanyIdFromRow(unr);
      missing.push({
        ticker: cid || unr.Symbol || unr['Company Name'] || 'Unknown',
        companyName: unr['Company Name'] || unr.companyName || cid,
        quarter: 'N/A',
        reason: unr._liquidityNote || 'liquidity columns unresolved',
        scanRow: unr,
      });
    }

    for (const row of universe.companies) {
      const cid = getCompanyIdFromRow(row);
      if (cid) {
        toProcess.push({
          companyId: cid,
          scanRow: row,
          companyName: row['Company Name'] || row.companyName || cid,
        });
      }
    }
  } else if (args.tickersFile) {
    const raw = JSON.parse(fs.readFileSync(args.tickersFile, 'utf8'));
    for (const item of raw) {
      const cid = typeof item === 'string' ? resolveCompanyId(item) : getCompanyIdFromRow(item);
      if (cid) {
        toProcess.push({
          companyId: cid,
          scanRow: item.scanRow || null,
          companyName: item.companyName || cid,
        });
      }
    }
  } else if (args.tickers) {
    for (const t of args.tickers) {
      const cid = resolveCompanyId(t) || sanitizeCompanyId(t);
      if (cid) {
        toProcess.push({ companyId: cid, scanRow: null, companyName: cid });
      }
    }
  }

  console.log(`Starting Phase 0 fetch for ${toProcess.length} candidate company(s)...`);
  const fetched = [];

  for (let i = 0; i < toProcess.length; i++) {
    const { companyId, scanRow, companyName } = toProcess[i];
    console.log(`[${i + 1}/${toProcess.length}] Checking ${companyId}...`);

    let latest = null;
    try {
      latest = await retryOnce(() => client.latestTranscript(companyId));
    } catch (e) {
      console.warn(`Error resolving latest transcript for ${companyId}: ${e.message}`);
    }

    // Case 1: No transcript found
    if (!latest) {
      missing.push({
        ticker: companyId,
        companyName,
        quarter: 'Unknown',
        reason: 'no transcript found',
        scanRow,
      });
      continue;
    }

    const quarter = latest.date || 'Unknown';

    // Case 2: Transcript on file, but AI notes not yet synthesized
    if (!latest.hasNotes) {
      missing.push({
        ticker: companyId,
        companyName,
        quarter,
        reason: 'transcript on file, AI notes not yet available — retry in a day or two',
        scanRow,
      });
      continue;
    }

    // Case 3: hasNotes is true -> Check cache
    if (!args.force) {
      const existing = db
        .find('reports', { type: 'forward-guidance', companyId })
        .find((r) => r.quarter === quarter || r.date === quarter);
      if (existing) {
        console.log(`  Cached report found: ${existing.id} (${quarter})`);
        const fullDto = db.readReport(existing.id);
        if (fullDto) {
          if (scanRow && !fullDto.scanRow) fullDto.scanRow = scanRow;
          cachedDtos.push(fullDto);
          fetched.push({
            companyId,
            companyName: fullDto.companyName || companyName,
            quarter,
            cached: true,
            reportId: existing.id,
            scanRow,
          });
          continue;
        }
      }
    }

    // Fetch concallNotes and growthCatalysts
    try {
      console.log(`  Fetching concall notes (${latest.ssUrl}) and growth catalysts...`);
      const notes = await retryOnce(() => client.concallNotes(companyId, latest.ssUrl));
      await sleep(200);
      let catalysts = null;
      try {
        catalysts = await retryOnce(() => client.growthCatalysts(companyId));
      } catch (catErr) {
        console.warn(`  Warning: growthCatalysts failed for ${companyId}: ${catErr.message}`);
      }

      // Phase 1b prior report lookup
      const prior = db
        .find('reports', { type: 'forward-guidance', companyId })
        .filter((r) => r.quarter !== quarter)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
      const priorReport = prior ? db.readReport(prior.id) : null;

      const rawData = {
        ticker: companyId,
        companyName: notes.companyName || companyName,
        quarter,
        ssUrl: latest.ssUrl,
        concallNotes: notes,
        growthCatalysts: catalysts,
        priorReport,
        scanRow,
      };

      const rawFile = path.join(outDir, `${safeFilename(companyId)}_raw.json`);
      fs.writeFileSync(rawFile, JSON.stringify(rawData, null, 2), 'utf8');

      fetched.push({
        companyId,
        companyName: rawData.companyName,
        quarter,
        cached: false,
        rawFile,
        hasPriorReport: Boolean(priorReport),
        scanRow,
      });
    } catch (err) {
      console.error(`  Failed to fetch notes for ${companyId}: ${err.message}`);
      missing.push({
        ticker: companyId,
        companyName,
        quarter,
        reason: `fetch failed: ${err.message}`,
        scanRow,
      });
    }

    await sleep(250);
  }

  const manifest = {
    scanId,
    scanName,
    outDir,
    timestamp: new Date().toISOString(),
    totalCandidates: toProcess.length,
    cachedCount: cachedDtos.length,
    toExtractCount: fetched.filter((f) => !f.cached).length,
    missingCount: missing.length,
    fetched,
    cachedDtos,
    missing,
  };

  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('\n--- Phase 0 Fetch Summary ---');
  console.log(`Scan: ${scanName} (${scanId || 'direct'})`);
  console.log(`Output Directory: ${outDir}`);
  console.log(`Total Candidates: ${toProcess.length}`);
  console.log(`Cached Reports: ${cachedDtos.length}`);
  console.log(`To Extract: ${manifest.toExtractCount}`);
  console.log(`Missing / Excluded: ${missing.length}`);
  console.log(`Manifest written to: ${manifestPath}`);
}

main().catch((err) => {
  console.error('Phase 0 Fetch encountered fatal error:', err);
  process.exit(1);
});
