/**
 * Controller for fetching declared quarterly results from StockScans
 * @module controllers/declaredResultsController
 * @see {@link docs/API_REFERENCE.md#declared-results-apis} for API docs
 */

const fs = require('fs');
const path = require('path');
const { stockscans } = require('@stock/api');
const { getAuthToken } = require('../../core/api/stockscansAuth');
const { ensureRepoDownloadsRoot } = require('../../core/utils/repoDownloads');

// This controller previously hit `company/scan-company-results` and
// `company/get-concall-notes` directly via raw axios, bypassing
// StockscansClient — those payload/response shapes are identical to
// StockscansClient#resultsScan (POST /api/scans/result/run) and
// StockscansClient#concallNotes (GET /api/scans/concall/notes/{id}/{ssUrl})
// respectively, so both calls now route through the shared client instead
// of duplicating request-building logic here. See AGENTS.md's "no direct
// third-party API calls" rule — StockscansClient.js is the only file that
// should know Stockscans' URLs.
//
// `notesUrl` is still exposed to the frontend as a plain URL string for two
// reasons: (1) screener-web/results.js opens it directly in a new browser
// tab (TranscriptNotesBadge), which needs a real navigable URL, not a
// client-method call; (2) downloadTranscriptNotes below accepts it back
// from the frontend to know which document to fetch server-side. We build
// it via StockscansClient#concallNotesUrl (not by hand-rolling
// `stockscans.in/...` here) so the path segment still only lives in one
// file if Stockscans moves it again.
const STOCKSCANS_ASSETS_URL = 'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs';

/**
 * Get declared quarterly results with filters
 * @route POST /api/declared-results
 * @see {@link docs/API_REFERENCE.md#declared-results} for API docs
 */
const getDeclaredResults = async (req, res, next) => {
  try {
    const {
      marketCapMin = 1000,
      index = [],
      industry = [],
      watchlistIds = [],
      order = 'desc',
      orderBy = 'Last Result Date',
      offset = 0,
      resultDate = '',
      searchCompany = '',
      documentType = '',
    } = req.body;

    // Build request payload for StockScans API
    const payload = {
      scan: {
        filters: [
          {
            left: 'Market Capitalization',
            right: String(marketCapMin),
            sign: '>=',
          },
        ],
        index,
        industry,
        watchlistIds,
      },
      order,
      orderBy,
      offset,
      resultDate,
      searchCompany,
      documentType,
    };

    // Auth is handled internally by StockscansClient (StockscansAuth reads
    // STOCKSCANS_AUTH_TOKEN); no need to resolve or attach it here.
    const data = await stockscans.resultsScan(payload);

    // Transform the data for our frontend
    const transformedResults = (data.resultTables || []).map((result) => {
      const { companyId, metaRatios, resultTable, documents } = result;

      // Parse company ID (e.g., "NSE:SIRCA" -> { exchange: "NSE", symbol: "SIRCA" })
      const [exchange, symbol] = companyId.split(':');

      // Get consolidated or standalone data
      const financialData = resultTable.C || resultTable.S || [];
      const dataSource = resultTable.C ? 'Consolidated' : 'Standalone';

      // Transform documents with full URLs.
      // Other documents (Transcript, PPT, Result) use the S3 assets URL;
      // Transcript Notes use StockscansClient#concallNotesUrl (still a real
      // navigable URL — screener-web opens it directly in a new tab).
      const transformedDocs = (documents || []).map((doc) => {
        let fullUrl = null;
        let notesUrl = null;

        if (doc.ssUrl) {
          fullUrl = `${STOCKSCANS_ASSETS_URL}/${doc.ssUrl}`;
          if (doc.hasNotes) {
            notesUrl = stockscans.concallNotesUrl(companyId, doc.ssUrl);
          }
        }

        return {
          ...doc,
          fullUrl,
          notesUrl,
        };
      });

      return {
        companyId,
        exchange,
        symbol,
        name: metaRatios?.Name || symbol,
        lastResultDate: metaRatios?.['Last Result Date'] || null,
        priceToEarnings: metaRatios?.['Price To Earnings'] || null,
        marketCap: metaRatios?.['Market Capitalization'] || null,
        fundamentalsSource: metaRatios?.['Fundamentals Source'] || null,
        dataSource,
        financialData,
        hasConsolidated: !!resultTable.C,
        hasStandalone: !!resultTable.S,
        consolidatedData: resultTable.C || null,
        standaloneData: resultTable.S || null,
        documents: transformedDocs,
      };
    });

    res.json({
      success: true,
      data: {
        results: transformedResults,
        pagination: {
          total: data.total || 0,
          start: data.start || 1,
          end: data.end || 20,
          offset,
        },
        quarterDate: data.quarterDate || null,
        resultDates: data.resultDates || [],
        order,
        orderBy,
      },
    });
  } catch (error) {
    console.error('Error fetching declared results:', error.message);

    if (error.response) {
      // StockScans API returned an error
      return res.status(error.response.status).json({
        success: false,
        error: 'Failed to fetch results from StockScans',
        details: error.response.data,
      });
    }

    next(error);
  }
};

/**
 * Get available filter options for results
 * @route GET /api/declared-results/filters
 * @see {@link docs/API_REFERENCE.md#declared-results-filters} for API docs
 */
const getFilterOptions = async (req, res, next) => {
  try {
    // Return static filter options
    // These can be expanded to be fetched dynamically from StockScans API
    res.json({
      success: true,
      data: {
        sortOptions: [
          { value: 'Last Result Date', label: 'Result Date' },
          { value: 'Market Capitalization', label: 'Market Cap' },
          { value: 'Price To Earnings', label: 'P/E Ratio' },
        ],
        documentTypes: [
          { value: 'Transcript Notes', label: 'Transcript Notes' },
          { value: 'Transcript', label: 'Transcript' },
          { value: 'Result', label: 'Result' },
          { value: 'PPT', label: 'Investor Presentation' },
        ],
        indices: [
          { value: 'Nifty 50', label: 'Nifty 50' },
          { value: 'Nifty Next 50', label: 'Nifty Next 50' },
          { value: 'Nifty Midcap 100', label: 'Nifty Midcap 100' },
          { value: 'Nifty Smallcap 100', label: 'Nifty Smallcap 100' },
        ],
        industries: [
          { value: 'Information Technology', label: 'IT' },
          { value: 'Banking', label: 'Banking' },
          { value: 'Pharmaceuticals', label: 'Pharmaceuticals' },
          { value: 'Automobiles', label: 'Automobiles' },
          { value: 'FMCG', label: 'FMCG' },
          { value: 'Oil & Gas', label: 'Oil & Gas' },
          { value: 'Metals & Mining', label: 'Metals & Mining' },
          { value: 'Cement', label: 'Cement' },
          { value: 'Power', label: 'Power' },
          { value: 'Chemicals', label: 'Chemicals' },
          { value: 'Textiles', label: 'Textiles' },
          { value: 'Real Estate', label: 'Real Estate' },
        ],
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Download transcript notes for all results in current quarter
 * @route POST /api/declared-results/download-notes
 * @see {@link docs/API_REFERENCE.md#download-transcript-notes} for API docs
 *
 * Uses StockScans authentication to download notes and save them to disk
 */
const downloadTranscriptNotes = async (req, res, next) => {
  try {
    const { quarterDate, companyIds = [] } = req.body;

    if (!quarterDate) {
      return res.status(400).json({
        success: false,
        error: 'quarterDate is required',
      });
    }

    if (!companyIds || companyIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'companyIds array is required',
      });
    }

    // Confirm auth is actually configured before starting the batch (auth
    // itself is applied per-request by StockscansClient/StockscansAuth —
    // this is just an early, clear failure instead of N silent per-item
    // failures below).
    try {
      getAuthToken();
      console.log('Using StockScans auth token from environment');
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message,
      });
    }

    const downloadDir = path.join(ensureRepoDownloadsRoot(), quarterDate);
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    const downloadResults = [];
    let successCount = 0;
    let errorCount = 0;

    // Download each transcript note (can have multiple per company)
    for (const companyData of companyIds) {
      const { companyId, symbol, name, notesUrl, documentType, date } = companyData;

      if (!notesUrl) {
        downloadResults.push({
          companyId,
          symbol,
          name,
          success: false,
          error: 'No notes URL available',
        });
        errorCount++;
        continue;
      }

      try {
        console.log(
          `Downloading notes for ${symbol} (${name}) - ${documentType || 'unknown'} ${date || ''}...`
        );

        // notesUrl is StockscansClient#concallNotesUrl's output
        // (.../notes/{companyId}/{ssUrl}) — recover ssUrl from its last path
        // segment rather than re-parsing/re-hitting the URL directly, so
        // the actual request still goes through StockscansClient#concallNotes.
        const ssUrl = decodeURIComponent(notesUrl.split('/').pop());
        const notesData = await stockscans.concallNotes(companyId, ssUrl);

        // Save to file with unique name (include date to handle multiple docs per company)
        const dateStr = date || 'undated';
        const fileName = `${symbol}_${dateStr}_notes.json`;
        const filePath = path.join(downloadDir, fileName);
        fs.writeFileSync(filePath, JSON.stringify(notesData, null, 2));

        downloadResults.push({
          companyId,
          symbol,
          name,
          documentType,
          date,
          success: true,
          filePath,
          fileName,
        });
        successCount++;

        console.log(`✓ Downloaded: ${fileName}`);
      } catch (error) {
        const errorMsg = error.response
          ? `HTTP ${error.response.status}: ${error.response.statusText}`
          : error.message;

        console.error(`✗ Failed to download ${symbol}: ${errorMsg}`);

        downloadResults.push({
          companyId,
          symbol,
          name,
          success: false,
          error: errorMsg,
        });
        errorCount++;
      }
    }

    console.log(
      `Download complete: ${successCount} successful, ${errorCount} failed, saved to ${downloadDir}`
    );

    res.json({
      success: true,
      data: {
        quarterDate,
        downloadDir,
        totalCompanies: companyIds.length,
        successCount,
        errorCount,
        results: downloadResults,
      },
    });
  } catch (error) {
    console.error('Error downloading transcript notes:', error.message);

    if (error.message.includes('authenticate')) {
      return res.status(401).json({
        success: false,
        error: 'Failed to authenticate with StockScans',
        details: error.message,
      });
    }

    next(error);
  }
};

module.exports = {
  getDeclaredResults,
  getFilterOptions,
  downloadTranscriptNotes,
};
