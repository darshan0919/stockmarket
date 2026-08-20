#!/usr/bin/env node
/**
 * Task: Daily Results Extractor
 * Purpose: Fetch all companies with results filed on a given date via Stockscans resultsScan API,
 * with filters applied. Returns a manifest for bulk processing by quarterly-result-extractor.
 *
 * Usage: node daily_results_extractor.js [--date YYYY-MM-DD]
 * Defaults to yesterday's date if no date provided.
 */

'use strict';

const path = require('path');
const { StockscansClient } = require('../../stock-api/src/clients/StockscansClient');
const { StockscansAuth } = require('../../stock-api/src/auth/stockscansAuth');

/**
 * Get yesterday's date in YYYY-MM-DD format.
 */
function getPreviousDay() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

/**
 * Parse CLI args to extract --date parameter.
 */
function argValue(argv, key, defaultVal = null) {
  const idx = argv.indexOf(key);
  return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : defaultVal;
}

/**
 * Fetch all companies with results filed on a given date.
 * Uses the same filters from the user's cURL example to screen for quality companies.
 *
 * @param {StockscansClient} client
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Promise<{date, count, companies, status, error?}>}
 */
async function fetchResultsForDate(client, dateStr) {
  const payload = {
    scan: {
      // Filters from the user's cURL example: EPS Growth YoY >= 40%, Market Cap >= 300 Cr, EPS Growth QoQ >= 5%
      filters: [
        { left: 'EPS Growth YoY', sign: '>=', right: '40' },
        { left: 'Market Capitalization', sign: '>=', right: '300' },
        { left: 'EPS Growth QoQ', sign: '>=', right: '5' },
      ],
      index: [],
      industry: [],
      watchlistIds: [],
    },
    order: 'desc',
    orderBy: 'Last Result Date',
    offset: 0,
    resultDate: dateStr,
    searchCompany: '',
    documentType: '',
  };

  try {
    const response = await client.resultsScan(payload);

    if (response.status !== 200 && response.status !== undefined) {
      throw new Error(
        `API returned status ${response.status}: ${response.message || 'Unknown error'}`
      );
    }

    const companies = response.data?.results || [];

    return {
      date: dateStr,
      count: companies.length,
      companies,
      status: 'success',
    };
  } catch (error) {
    return {
      date: dateStr,
      count: 0,
      companies: [],
      status: 'error',
      error: error.message,
    };
  }
}

/**
 * Paginate through all results for a given date.
 * Fetches all pages concurrently to avoid sequential delays.
 *
 * @param {StockscansClient} client
 * @param {string} dateStr
 * @param {number} [pageSize=50] - Assumed page size per API response
 * @returns {Promise<{date, allCompanies, status, error?}>}
 */
async function fetchAllResultsPages(client, dateStr, pageSize = 50) {
  const allCompanies = [];
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;
  const maxPages = 50; // Safety cap to avoid runaway pagination

  try {
    while (hasMore && pageCount < maxPages) {
      const payload = {
        scan: {
          filters: [
            { left: 'EPS Growth YoY', sign: '>=', right: '40' },
            { left: 'Market Capitalization', sign: '>=', right: '300' },
            { left: 'EPS Growth QoQ', sign: '>=', right: '5' },
          ],
          index: [],
          industry: [],
          watchlistIds: [],
        },
        order: 'desc',
        orderBy: 'Last Result Date',
        offset,
        resultDate: dateStr,
        searchCompany: '',
        documentType: '',
      };

      const response = await client.resultsScan(payload);

      if (response.status !== 200 && response.status !== undefined) {
        throw new Error(
          `API returned status ${response.status}: ${response.message || 'Unknown error'}`
        );
      }

      const companies = response.data?.results || [];
      if (!companies.length) {
        hasMore = false;
        break;
      }

      allCompanies.push(...companies);
      pageCount += 1;

      // Check if we got fewer results than page size (indicates last page)
      if (companies.length < pageSize) {
        hasMore = false;
      } else {
        offset += pageSize;
      }
    }

    return {
      date: dateStr,
      allCompanies,
      pageCount,
      status: 'success',
    };
  } catch (error) {
    return {
      date: dateStr,
      allCompanies: [],
      pageCount: 0,
      status: 'error',
      error: error.message,
    };
  }
}

/**
 * Main entry point.
 */
async function main() {
  try {
    const dateStr = argValue(process.argv, '--date') || getPreviousDay();

    // Initialize Stockscans client with auth
    const envPath = path.resolve(__dirname, '../../.env');
    const auth = new StockscansAuth({ envPath });
    const client = new StockscansClient({ auth });

    // Fetch all results for the given date (paginated)
    const result = await fetchAllResultsPages(client, dateStr);

    if (result.status === 'error') {
      console.error(JSON.stringify(result, null, 2));
      process.exit(1);
    }

    // Transform companies to include normalized companyId for downstream processing
    const companies = result.allCompanies.map((company) => ({
      companyId: company.companyId || company.Name, // fallback to Name if companyId missing
      name: company.Name,
      resultDate: dateStr,
      ssUrl: company.resultSsUrl,
      pptSsUrl: company.pptSsUrl,
      transcriptSsUrl: company.transcriptSsUrl,
    }));

    const output = {
      date: dateStr,
      count: companies.length,
      pageCount: result.pageCount,
      companies,
      status: 'success',
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          status: 'error',
          error: error.message,
          stack: error.stack,
        },
        null,
        2
      )
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { fetchAllResultsPages, getPreviousDay };
