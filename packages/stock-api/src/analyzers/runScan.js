'use strict';

const fs = require('fs');
const path = require('path');
const { stockscans } = require('../index');

function parseScanId(arg) {
  const m = arg.match(/\/scans\/saved\/([a-f0-9]{24})/);
  if (m) return m[1];
  if (/^[a-f0-9]{24}$/.test(arg.trim())) return arg.trim();
  throw new Error(`Could not parse a scanId from '${arg}'. Expected a URL like https://www.stockscans.in/scans/saved/<24-hex> or the bare id.`);
}

function buildRunPayload(definition) {
  return {
    ratiosType: "Default",
    timePeriod: "Latest",
    scan: definition,
    watchlistIds: definition.watchlistIds || [],
    order: "desc",
    orderBy: "Market Capitalization",
    offset: 0,
  };
}

function flattenTable(runResp) {
  const table = runResp.table;
  if (!table || table.length < 1) {
    return { rows: [], total: runResp.total || 0 };
  }
  const header = table[0];
  const rows = [];
  for (let i = 1; i < table.length; i++) {
    const raw = table[i];
    const rowObj = {};
    for (let j = 0; j < Math.min(header.length, raw.length); j++) {
      rowObj[header[j]] = raw[j];
    }
    rows.push(rowObj);
  }
  return { rows, total: runResp.total || rows.length };
}

/**
 * Resolves a saved scan into its current company universe.
 */
async function resolveUniverse(scanArg, options = {}) {
  const { jsonOut, listOnly = false } = options;
  const scanId = parseScanId(scanArg);

  const definition = await stockscans.getScanMetadata(scanId);
  const scanName = definition.scanName || scanId;

  const payload = buildRunPayload(definition);
  
  // Handle pagination until we get all results
  const allRows = [];
  let total = null;
  let offset = 0;

  while (total === null || offset < total) {
    payload.offset = offset;
    const runResp = await stockscans.runScan(payload, scanId);
    const { rows, total: currentTotal } = flattenTable(runResp);
    
    total = currentTotal;
    if (rows.length === 0) break;
    
    allRows.push(...rows);
    offset += rows.length;
  }

  const universe = {
    scanId,
    scanName,
    filters: definition.filters || [],
    total,
    fetched_at: new Date().toISOString(),
    companies: allRows
  };

  if (jsonOut) {
    fs.writeFileSync(path.resolve(jsonOut), JSON.stringify(universe, null, 2), 'utf-8');
  }

  return universe;
}

module.exports = {
  resolveUniverse,
  parseScanId,
  buildRunPayload,
  flattenTable
};
