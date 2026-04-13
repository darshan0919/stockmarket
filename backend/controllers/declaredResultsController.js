/**
 * Controller for fetching declared quarterly results from StockScans
 * @module controllers/declaredResultsController
 * @see {@link docs/API_REFERENCE.md#declared-results-apis} for API docs
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getAuthToken, createAuthenticatedClient } = require('../services/stockscansAuth');
const { ensureRepoDownloadsRoot } = require('../utils/repoDownloads');

const STOCKSCANS_API_URL = 'https://www.stockscans.in/api/company/scan-company-results';
const STOCKSCANS_ASSETS_URL = 'https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs';
const STOCKSCANS_NOTES_API_URL = 'https://www.stockscans.in/api/company/get-concall-notes';

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

    // Get auth token for StockScans API
    let authToken;
    try {
      authToken = getAuthToken();
    } catch (err) {
      // Continue without auth token - some requests may work without it
      authToken = null;
    }

    // Make request to StockScans API with authentication
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers.Cookie = `authtoken=${authToken}`;
    }

    const response = await axios.post(STOCKSCANS_API_URL, payload, {
      headers,
      timeout: 30000,
    });

    const data = response.data;

    // Transform the data for our frontend
    const transformedResults = (data.resultTables || []).map((result) => {
      const { companyId, metaRatios, resultTable, documents } = result;

      // Parse company ID (e.g., "NSE:SIRCA" -> { exchange: "NSE", symbol: "SIRCA" })
      const [exchange, symbol] = companyId.split(':');

      // Get consolidated or standalone data
      const financialData = resultTable.C || resultTable.S || [];
      const dataSource = resultTable.C ? 'Consolidated' : 'Standalone';

      // Transform documents with full URLs
      // Transcript Notes use a different API endpoint
      // Other documents (Transcript, PPT, Result) use S3 assets URL
      const transformedDocs = (documents || []).map((doc) => {
        let fullUrl = null;
        let notesUrl = null;

        if (doc.ssUrl) {
          // All documents except notes use the S3 assets URL
          fullUrl = `${STOCKSCANS_ASSETS_URL}/${doc.ssUrl}`;

          // If document has notes, add the notes URL
          if (doc.hasNotes) {
            notesUrl = `${STOCKSCANS_NOTES_API_URL}/${companyId}/${doc.ssUrl}`;
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

    // Get auth token from environment
    let authToken;
    try {
      authToken = getAuthToken();
      console.log('Using StockScans auth token from environment');
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: err.message,
      });
    }

    // Create authenticated axios client
    const authClient = createAuthenticatedClient(authToken);

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

        // Fetch the notes content using authenticated client
        const response = await authClient.get(notesUrl, {
          responseType: 'json', // Notes API returns JSON
        });

        // Save to file with unique name (include date to handle multiple docs per company)
        const dateStr = date || 'undated';
        const fileName = `${symbol}_${dateStr}_notes.json`;
        const filePath = path.join(downloadDir, fileName);
        fs.writeFileSync(filePath, JSON.stringify(response.data, null, 2));

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
