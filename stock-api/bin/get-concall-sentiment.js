#!/usr/bin/env node
'use strict';

/**
 * Bulk concall-sentiment resolver — thin wrapper around
 * `StockscansClient.concallScan()` using the standard throwaway-watchlist
 * pattern to scope the scan to an arbitrary companyId list.
 *
 * Schema confirmed live 2026-08-01 (see `docs/stockscans-api-schemas.md` and
 * `StockscansClient.concallScan`'s JSDoc for the full row layout). Envelope
 * key is `rows`; pagination advances via `next` (offset or null), not an
 * offset/total comparison.
 *
 * Usage:
 *   node get-concall-sentiment.js --companies NSE:A,NSE:B,NSE:C
 *   node get-concall-sentiment.js --companies NSE:A --debug-raw   (prints raw rows to stderr)
 *
 * Output (stdout, JSON): array of
 *   { companyId, sentiment: 'Bullish'|'Optimistic'|..., sentimentCode: 0-4,
 *     resultQualityScore, highlights, date, recentWithinDays, raw: [...] }
 * for every row concall-scan returned within the throwaway watchlist — NOT
 * one guaranteed row per requested companyId (a company with no concall on
 * file simply won't appear; callers should treat absence as "no concall
 * data", not an error).
 */

const { StockscansClient, CONCALL_SCAN_SENTIMENT } = require('../src/clients/StockscansClient.js');

// See StockscansClient.concallScan's JSDoc for the full field-by-field note;
// indices 0, 5, 6, 7, 11 are read by nothing here (not yet load-bearing).
const RECORD_INDEX = {
  companyId: 1,
  date: 4,
  resultQualityScore: 8,
  sentiment: 9,
  highlights: 10,
};

class ConcallSentimentResolver {
  constructor({ client } = {}) {
    this.client = client || new StockscansClient();
  }

  /**
   * @param {string[]} companyIds
   * @param {Object} [opts]
   * @param {boolean} [opts.debugRaw=false] - log the raw first row to stderr
   * @param {Date} [opts.now] - injectable "now" for recentWithinDays (tests)
   * @returns {Promise<Array>}
   */
  async forCompanies(companyIds, { debugRaw = false, now = new Date() } = {}) {
    return this._withThrowawayWatchlist(companyIds, async (watchlistId) => {
      const results = [];
      let offset = 0;
      for (;;) {
        const page = await this.client.concallScan({
          industry: [],
          index: [],
          watchlistIds: [watchlistId],
          resultTiers: [],
          sentimentTiers: [],
          filters: [],
          q: '',
          offset,
        });
        const rows = page.rows || [];
        if (debugRaw && offset === 0 && rows.length) {
          process.stderr.write(`[concall-sentiment] raw first row: ${JSON.stringify(rows[0])}\n`);
        }
        for (const r of rows) {
          const code = r[RECORD_INDEX.sentiment];
          const dateStr = r[RECORD_INDEX.date];
          const dateMs = dateStr ? Date.parse(dateStr) : NaN;
          results.push({
            raw: r,
            companyId: r[RECORD_INDEX.companyId],
            resultQualityScore: r[RECORD_INDEX.resultQualityScore],
            sentimentCode: code,
            sentiment: CONCALL_SCAN_SENTIMENT[code] || null,
            highlights: r[RECORD_INDEX.highlights],
            date: dateStr || null,
            recentWithinDays: Number.isFinite(dateMs)
              ? Math.max(0, Math.floor((now.getTime() - dateMs) / 86400000))
              : null,
          });
        }
        if (page.next === null || page.next === undefined) break;
        offset = page.next;
      }
      return results;
    });
  }

  async _withThrowawayWatchlist(companyIds, fn) {
    const name = `_gainers_concall_scan_${Date.now()}`;
    const { watchlistId } = await this.client.createWatchlist(name, companyIds);
    try {
      return await fn(watchlistId);
    } finally {
      await this.client.deleteWatchlist(watchlistId).catch(() => {});
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const companiesArg = args[args.indexOf('--companies') + 1];
  const debugRaw = args.includes('--debug-raw');
  if (!companiesArg) {
    process.stderr.write('Usage: get-concall-sentiment.js --companies NSE:A,NSE:B [--debug-raw]\n');
    process.exit(1);
  }
  const companyIds = companiesArg.split(',').map((s) => s.trim()).filter(Boolean);
  const resolver = new ConcallSentimentResolver();
  try {
    const out = await resolver.forCompanies(companyIds, { debugRaw });
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } catch (e) {
    process.stderr.write(`[concall-sentiment] ERROR: ${e.message}\n`);
    process.stdout.write(JSON.stringify({ error: e.message }) + '\n');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { ConcallSentimentResolver, RECORD_INDEX };
