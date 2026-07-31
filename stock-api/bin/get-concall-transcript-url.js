#!/usr/bin/env node
'use strict';

/**
 * Concall transcript URL resolver — replaces the concall-transcript-extractor
 * skill's waterfall now that Stockscans guarantees a Transcript document for
 * every reported quarter ("live concall support"). This script ONLY resolves
 * the `ssUrl` (and derived document URL `${BASE_URL}/document/${ssUrl}`) for
 * one or many companies — it does not transcribe recordings or call
 * Perplexity/NotebookLM. If Stockscans has no Transcript for a requested
 * company/quarter, that's a genuine "not filed yet" — surface it, don't
 * fall back to anything else.
 *
 * Three scenarios (see class methods below):
 *   1. singleCompanyQuarter(companyId, quarter)   — one company, any quarter
 *   2. multiCompanyLatestQuarter(companyIds)      — many companies, latest quarter only
 *   3. multiCompanyHistoricalQuarter(companyIds, quarter) — many companies, any quarter
 *
 * Scenarios 2 & 3 use a throwaway watchlist (created, queried, deleted) since
 * both bulk endpoints filter by watchlistId, not a raw companyId list.
 *
 * Usage:
 *   node get-concall-transcript-url.js --company NSE:STLTECH --quarter Q1FY27
 *   node get-concall-transcript-url.js --companies NSE:A,NSE:B,NSE:C            (latest quarter)
 *   node get-concall-transcript-url.js --companies NSE:A,NSE:B --quarter Q4FY26 (historical)
 *
 * Output (stdout, JSON):
 *   { companyId, quarter, ssUrl, documentUrl } | { companyId, quarter, error }
 *   or an array of the above for multi-company calls.
 */

const { StockscansClient } = require('../src/clients/StockscansClient.js');
const { parseQuarterString } = require('../src/utils/fiscalQuarter.js');

const BASE_URL = 'https://www.stockscans.in';
const toDocumentUrl = (ssUrl) => (ssUrl ? `${BASE_URL}/document/${ssUrl}` : null);

class ConcallTranscriptResolver {
  constructor({ client } = {}) {
    this.client = client || new StockscansClient();
  }

  /** Scenario 1: single company, any given quarter. */
  async singleCompanyQuarter(companyId, quarter) {
    const { documents } = await this.client.documents(companyId);
    const hit = (documents || []).find(
      (d) => d.documentType === 'Transcript' && (!quarter || d.date === quarter) && d.ssUrl
    );
    if (!hit) return { companyId, quarter, error: 'no Transcript document found for this quarter' };
    return { companyId, quarter: hit.date, ssUrl: hit.ssUrl, documentUrl: toDocumentUrl(hit.ssUrl) };
  }

  /** Scenario 2: many companies, latest reported quarter only. */
  async multiCompanyLatestQuarter(companyIds) {
    return this._withThrowawayWatchlist(companyIds, async (watchlistId) => {
      const byCompanyId = new Map();
      let offset = 0;
      let quarterDate = null;
      for (; ;) {
        const page = await this.client.resultsDocuments({
          offset,
          documentType: 'Transcript',
          watchlistIds: [watchlistId],
        });
        quarterDate = page.quarterDate;
        const docs = page.documents || [];
        for (const doc of docs) byCompanyId.set(doc.companyId, doc);
        if (!docs.length || offset + docs.length >= page.total) break;
        offset += docs.length;
      }
      return companyIds.map((companyId) => {
        const doc = byCompanyId.get(companyId);
        if (!doc || !doc.transcriptSsUrl) {
          return { companyId, quarter: quarterDate, error: 'no Transcript filed yet this quarter' };
        }
        return {
          companyId,
          quarter: quarterDate,
          ssUrl: doc.transcriptSsUrl,
          documentUrl: toDocumentUrl(doc.transcriptSsUrl),
        };
      });
    });
  }

  /**
   * Scenario 3: many companies, a specific historical quarter.
   * @param {string[]} companyIds
   * @param {string} quarter - "Q1FY27" or raw "YYYYMM" (parsed via parseQuarterString)
   */
  async multiCompanyHistoricalQuarter(companyIds, quarter) {
    const { yyyymm: quarterDate } = parseQuarterString(quarter);
    return this._withThrowawayWatchlist(companyIds, async (watchlistId) => {
      const byCompanyId = new Map();
      let offset = 0;
      for (; ;) {
        const page = await this.client.scanAnnouncements({
          scan: {
            filters: [],
            index: [],
            industry: [],
            watchlistIds: [watchlistId],
            searchFilters: [],
            announcementType: 'Earnings Call',
            alerts: false,
            searchMode: 'full',
            companyIds: [],
            companyFilters: [],
          },
          offset,
          quarterDate,
        });
        const items = page.announcements || page.documents || page.items || [];
        for (const item of items) {
          const ssUrl = item.ssUrl || item.transcriptSsUrl;
          if (item.companyId && ssUrl) byCompanyId.set(item.companyId, { ...item, ssUrl });
        }
        const total = page.total ?? items.length;
        if (!items.length || offset + items.length >= total) break;
        offset += items.length;
      }
      return companyIds.map((companyId) => {
        const doc = byCompanyId.get(companyId);
        if (!doc) return { companyId, quarter: quarterDate, error: 'no Earnings Call transcript found for this quarter' };
        return { companyId, quarter: quarterDate, ssUrl: doc.ssUrl, documentUrl: toDocumentUrl(doc.ssUrl) };
      });
    });
  }

  async _withThrowawayWatchlist(companyIds, fn) {
    const name = `tmp-transcript-fetch-${Date.now()}`;
    const { watchlistId } = await this.client.createWatchlist(name, companyIds);
    try {
      return await fn(watchlistId);
    } finally {
      await this.client.deleteWatchlist(watchlistId).catch(() => { });
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
  };

  const resolver = new ConcallTranscriptResolver();
  const company = get('--company');
  const companies = get('--companies');
  const quarter = get('--quarter');

  let result;
  if (company) {
    result = await resolver.singleCompanyQuarter(company, quarter);
  } else if (companies) {
    const companyIds = companies.split(',').map((s) => s.trim()).filter(Boolean);
    result = quarter
      ? await resolver.multiCompanyHistoricalQuarter(companyIds, quarter)
      : await resolver.multiCompanyLatestQuarter(companyIds);
  } else {
    console.error('Usage: --company <id> [--quarter <Q>] | --companies <id,id,...> [--quarter <Q>]');
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

module.exports = { ConcallTranscriptResolver, toDocumentUrl };

if (require.main === module) {
  main().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
  });
}
