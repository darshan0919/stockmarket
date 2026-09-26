#!/usr/bin/env node
'use strict';

/**
 * fetch_management_interviews.js — deterministic Extraction step (conventions
 * §17) for rerating-catalysts Phase 1: the last N (default 5) management
 * interviews within the last M (default 3) months for a company, via
 * Stockscans' own Interview Scans feed (`interviewScan`/`interviewDetail` —
 * see docs/stockscans-api-schemas.md for the confirmed-live payload/response
 * schemas).
 *
 * Per conventions §26 (platform-reuse-first), YouTube management-interview
 * discovery is already served natively by Stockscans' Interview Scans page —
 * this script wraps that feed rather than re-implementing a YouTube search
 * or transcript pipeline from scratch.
 *
 * ── Caching (conventions §17a) ──────────────────────────────────────────────
 * A single interview's takeaways never change once published, so each video
 * is fetched via `interviewDetail` at most once, ever, and cached by videoId
 * under `data/cache/rerating-catalysts/interviews/` — any later run for any
 * company reuses the cached takeaways with no staleness check needed (unlike
 * `brief_cache.js`'s filing-level cache, which also survives across
 * companies but exists mainly to dedupe repeated reads of the SAME filing
 * across different callers). Only the LIST call (`interviewScan`) is ever
 * re-issued, because new interviews can appear at any time.
 *
 * No LLM calls here (conventions §24) — fetch, filter-to-window, cap, cache.
 * Applying the "new" catalyst lens to the returned takeaways is the skill's
 * own Phase 2 judgment step, not this script's job.
 *
 * Usage:
 *   node fetch_management_interviews.js --ticker NSE:NEPHROPLUS \
 *     [--months 3] [--max 5] [--as-of YYYY-MM-DD]
 */

const fs = require('fs');
const path = require('path');
const { stockscans } = require('../../../../stock-api/src/index.js');
const { sanitizeCompanyId } = require('../../../../stock-api/src/utils/companyId.js');
const db = require('../../../../packages/jobs-runtime/lib/db.js');
const { safeKey } = require('./brief_cache.js');

const DEFAULT_MONTHS = 3;
const DEFAULT_MAX = 5;
// Interview-scan pagination is a genuinely opaque cursor (docs/
// stockscans-api-schemas.md), not an offset — per conventions §16's
// exception for cursor-based endpoints, page sequentially and bound the
// loop defensively rather than trust the server to terminate quickly for a
// single-company `q` query.
const MAX_PAGES = 5;

function interviewsDir() {
  const d = db.cachePath(path.join('rerating-catalysts', 'interviews'));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(file, obj) {
  // Write-then-rename so an interrupted run never leaves a truncated cache
  // file that a later run then fails to parse and silently treats as a
  // permanent miss (same pattern as brief_cache.js).
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

function getCachedInterview(videoId) {
  return readJson(path.join(interviewsDir(), `${safeKey(videoId)}.json`));
}

function putCachedInterview(videoId, record) {
  const file = path.join(interviewsDir(), `${safeKey(videoId)}.json`);
  writeJson(file, { ...record, videoId, cachedAt: new Date().toISOString() });
  return file;
}

function bareSymbol(companyId) {
  // interviewScan's `q` is a free-text match, confirmed live against a bare
  // ticker symbol (no EXCH: prefix) — see docs/stockscans-api-schemas.md.
  const parts = String(companyId).split(':');
  return parts.length > 1 ? parts[1] : parts[0];
}

function monthsAgo(n, from) {
  const d = new Date(from);
  d.setMonth(d.getMonth() - n);
  return d;
}

/**
 * @param {string} companyId - canonical EXCH:SYMBOL.
 * @param {Object} [opts]
 * @param {number} [opts.months=3] - lookback window in months.
 * @param {number} [opts.max=5] - hard cap on interviews considered, even if
 *   more exist inside the window.
 * @param {Date|string} [opts.asOf] - defaults to now; pass for a
 *   reproducible historical run.
 * @returns {Promise<Object>} `{companyId, q, windowStart, windowEnd,
 *   totalRowsFound, matchedCompanyRows, consideredCount, cacheHits,
 *   interviews: Array<{videoId, title, channelName, publishedAt,
 *   durationSec, embeddable, takeawaysMarkdown, cacheHit, sourceUrl}>}`
 */
async function fetchManagementInterviews(companyId, opts = {}) {
  const months = opts.months || DEFAULT_MONTHS;
  const max = opts.max || DEFAULT_MAX;
  const asOf = opts.asOf ? new Date(opts.asOf) : new Date();
  const windowStart = monthsAgo(months, asOf);

  const target = sanitizeCompanyId(companyId);
  const q = bareSymbol(target);

  let cursor = '';
  const allRows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await stockscans.interviewScan(
      { industry: [], index: [], watchlistIds: [], channelIds: [], q, cursor },
      {}
    );
    const rows = data.rows || [];
    allRows.push(...rows);
    if (!data.next || rows.length === 0) break;
    cursor = data.next;
  }

  // `q` is a text match, not an exact scope filter — keep only rows that
  // actually tag the target companyId (row[6] = Array<[companyId, name,
  // isPrimary]>), so a query like "TATA" scoped to one Tata entity doesn't
  // silently pull in interviews about a different Tata company.
  const matched = allRows.filter((row) =>
    (row[6] || []).some(([cid]) => sanitizeCompanyId(cid) === target)
  );

  const inWindow = matched
    .filter((row) => {
      const d = new Date(row[2]);
      return !Number.isNaN(d.getTime()) && d >= windowStart && d <= asOf;
    })
    .sort((a, b) => new Date(b[2]) - new Date(a[2]))
    .slice(0, max);

  const interviews = [];
  for (const row of inWindow) {
    const [videoId, title, publishedAt, durationSec, embeddable, channelName] = row;

    let cached = getCachedInterview(videoId);
    const cacheHit = Boolean(cached);
    if (!cached) {
      const detail = await stockscans.interviewDetail(videoId, {});
      const entry = (detail.takeaways || []).find(
        ([cid]) => sanitizeCompanyId(cid) === target
      );
      cached = {
        title: (detail.video && detail.video.title) || title,
        channelName: (detail.video && detail.video.channelName) || channelName,
        publishedAt: (detail.video && detail.video.publishedAt) || publishedAt,
        // A Stockscans-generated SUMMARY, not a verbatim transcript excerpt —
        // see the anti-hallucination note in docs/stockscans-api-schemas.md
        // and rerating-catalysts SKILL.md's interview-sourcing rule.
        takeawaysMarkdown: entry ? entry[1] : null,
      };
      putCachedInterview(videoId, cached);
    }

    interviews.push({
      videoId,
      title: cached.title,
      channelName: cached.channelName,
      publishedAt: cached.publishedAt,
      durationSec,
      embeddable,
      takeawaysMarkdown: cached.takeawaysMarkdown,
      cacheHit,
      sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }

  return {
    companyId: target,
    q,
    windowStart: windowStart.toISOString().slice(0, 10),
    windowEnd: asOf.toISOString().slice(0, 10),
    totalRowsFound: allRows.length,
    matchedCompanyRows: matched.length,
    consideredCount: interviews.length,
    cacheHits: interviews.filter((i) => i.cacheHit).length,
    interviews,
  };
}

function argValue(flag, argv, def) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : def;
}

async function main() {
  const argv = process.argv.slice(2);
  const ticker = argValue('--ticker', argv, null);
  if (!ticker) {
    throw new Error(
      'Usage: fetch_management_interviews.js --ticker NSE:X [--months 3] [--max 5] [--as-of YYYY-MM-DD]'
    );
  }
  const months = Number(argValue('--months', argv, DEFAULT_MONTHS));
  const max = Number(argValue('--max', argv, DEFAULT_MAX));
  const asOf = argValue('--as-of', argv, null);
  const result = await fetchManagementInterviews(ticker, { months, max, asOf });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

module.exports = { fetchManagementInterviews, getCachedInterview, putCachedInterview };

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(JSON.stringify({ error: err.message, stack: err.stack }) + '\n');
    process.exit(1);
  });
}
