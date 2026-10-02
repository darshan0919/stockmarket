'use strict';

/**
 * Backfill `bseScripCode` on NSE company records via BSE name search, rejecting wrong-company hits.
 *
 * A hit is accepted only when its listed name overlaps the record name (>= 0.6 of the shorter name's
 * tokens, suffixes stripped). Otherwise the record is marked MISMATCH for review (e.g. NSE:HSIL ->
 * "HEMANT SURGICAL INDUSTRIES LTD" is rejected). Every check is stamped in a separate `checks` map
 * (kept in data/cache/bse-scrip-checks.json, NOT on the company record, so a NOT_FOUND stamp never
 * bumps a record's modifiedTime) so NOT_FOUND / MISMATCH names are not re-queried until `retryDays`.
 * Pure of I/O apart from the injected `bse` client; the caller persists the returned updates/checks.
 */

const { normalizeName } = require('./companyMaster');

const ACCEPT_OVERLAP = 0.6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fraction of the shorter name's tokens present in the other name. */
function nameOverlap(a, b) {
  const ta = new Set(normalizeName(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.min(ta.size, tb.size);
}

/** Letters/digits only, upper-cased: "D P Wires Ltd" and "DP WIRES LTD" both become "DPWIRES". */
const collapse = (n) => normalizeName(n).replace(/\s+/g, '');

/**
 * Is a BSE hit the same company as the record? Name token overlap first; then the collapsed-name rule
 * (spacing differences); for records with no name only, a >= 4-letter symbol prefix of the BSE name
 * (SHREYASI -> "SHREYAS INTERMEDIATES"; HSIL -> "HEMANT SURGICAL" fails).
 * @returns {{ok:boolean, score:number}}
 */
function sameCompany(record, sym, bseName) {
  const name = record.name;
  if (name) {
    const score = nameOverlap(name, bseName);
    if (score >= ACCEPT_OVERLAP) return { ok: true, score };
    const a = collapse(name);
    const b = collapse(bseName);
    if (a.length >= 6 && b.length >= 6 && (a.startsWith(b) || b.startsWith(a)))
      return { ok: true, score: 1 };
    return { ok: false, score };
  }
  const b = collapse(bseName);
  const p = sym.slice(0, 4);
  return { ok: sym.length >= 4 && b.startsWith(p), score: b.startsWith(p) ? 0.6 : 0 };
}

/** NSE ticker of a company record, or null for BSE-only / unkeyed records. */
function nseTickerOf(c) {
  const t = c.nseTicker || (c.id && c.id.startsWith('NSE:') ? c.id.slice(4) : null);
  return t ? String(t).replace(/^NSE:/i, '').toUpperCase() : null;
}

/**
 * @param {Object} o
 * @param {Array<Object>} o.records - company records (as in companies.json).
 * @param {Record<string,{status:string,at:string}>} [o.checks] - previous check stamps by company id.
 * @param {{smartSearch:Function}} o.bse
 * @param {number} [o.limit=2000] max records to query this call.
 * @param {number} [o.delayMs=120] pause between BSE queries (BSE returns empty pages when hammered).
 * @param {number} [o.concurrency=1] parallel queries (updates order is only deterministic at 1).
 * @param {number} [o.retryDays=30] skip NOT_FOUND/MISMATCH records checked more recently than this.
 * @param {Date} [o.now]
 * @param {Function} [o.onRow] (row) => void, per checked record.
 * @returns {Promise<{updates:Array<Object>, checks:Object, stats:Object}>} updates are partial records for
 *   `db.upsertMany` (only accepted codes); checks is the full updated stamp map.
 */
async function backfillBseScrips({
  records,
  checks = {},
  bse,
  limit = 2000,
  retryDays = 30,
  delayMs = 120,
  concurrency = 1,
  now = new Date(),
  onRow,
}) {
  const cutoff = now.getTime() - retryDays * 86400000;
  const candidates = records
    .filter((c) => {
      if (c.bseScripCode) return false;
      const t = nseTickerOf(c);
      if (!t || !c.id || !c.id.startsWith('NSE:')) return false;
      const chk = checks[c.id];
      return !(chk && chk.at && Date.parse(chk.at) > cutoff);
    })
    // most recently touched first: those are the companies the pipelines are actually using
    .sort((a, b) => String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')))
    .slice(0, limit);

  const stats = { candidates: candidates.length, accepted: 0, mismatch: 0, notFound: 0, error: 0 };
  const updates = [];
  const nextChecks = { ...checks };
  const at = now.toISOString();
  const work = async (c) => {
    const sym = nseTickerOf(c);
    let row;
    try {
      const find = async (q) => {
        const { symbols } = await bse.smartSearch(q);
        return (symbols || []).find((s) => String(s.symbol).toUpperCase() === sym);
      };
      // BSE search occasionally returns an empty page under load: confirm a miss with a second query
      // (the company name, after a pause) before recording NOT_FOUND.
      let hit = await find(sym);
      if (!hit && c.name) {
        await sleep(delayMs * 4);
        hit = await find(c.name);
      }
      if (delayMs) await sleep(delayMs);
      if (!hit) {
        stats.notFound++;
        row = { id: c.id, status: 'NOT_FOUND' };
        nextChecks[c.id] = { status: 'NOT_FOUND', at };
      } else {
        const { ok, score } = sameCompany(c, sym, hit.symbol_info);
        if (ok) {
          stats.accepted++;
          row = { id: c.id, status: 'OK', scrip: hit.bse_scrip_code, score };
          const aliases = Array.from(new Set([...(c.aliases || []), `BSE:${hit.bse_scrip_code}`]));
          // `creator` is required by db.upsertMany and shallow-merged, so keep the record's own.
          updates.push({
            id: c.id,
            creator: c.creator || 'company-master-sync',
            bseScripCode: String(hit.bse_scrip_code),
            aliases,
          });
          nextChecks[c.id] = { status: 'OK', at, score };
        } else {
          stats.mismatch++;
          row = {
            id: c.id,
            status: 'MISMATCH',
            scrip: hit.bse_scrip_code,
            ours: c.name,
            bse: hit.symbol_info,
            score,
          };
          nextChecks[c.id] = {
            status: 'MISMATCH',
            at,
            scrip: String(hit.bse_scrip_code),
            bseName: hit.symbol_info,
            ourName: c.name || null,
          };
        }
      }
    } catch (e) {
      // transient failure: no stamp, so the next run retries
      stats.error++;
      row = { id: c.id, status: 'ERROR', error: e.message };
    }
    if (onRow) onRow(row);
  };
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (next < candidates.length) await work(candidates[next++]);
    })
  );
  return { updates, checks: nextChecks, stats };
}

module.exports = { backfillBseScrips, nameOverlap, sameCompany, nseTickerOf, ACCEPT_OVERLAP };

/** Location of the persisted check stamps. */
function checksFile() {
  return require('path').join(require('./db').dataRoot(), 'cache', 'bse-scrip-checks.json');
}

/** @returns {Record<string,Object>} */
function loadChecks() {
  try {
    return JSON.parse(require('fs').readFileSync(checksFile(), 'utf8'));
  } catch (_) {
    return {};
  }
}

/**
 * Persist stamps atomically (tmp + rename). Re-reads the file first and keeps the newer stamp per id, so two
 * concurrent runs never drop each other's results.
 */
function saveChecks(checks) {
  const fs = require('fs');
  const file = checksFile();
  fs.mkdirSync(require('path').dirname(file), { recursive: true });
  const merged = { ...loadChecks() };
  for (const [id, c] of Object.entries(checks)) {
    if (!merged[id] || String(c.at || '') >= String(merged[id].at || '')) merged[id] = c;
  }
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(merged) + '\n');
  fs.renameSync(tmp, file);
}

module.exports.loadChecks = loadChecks;
module.exports.saveChecks = saveChecks;
module.exports.checksFile = checksFile;
