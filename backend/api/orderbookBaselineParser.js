/**
 * @fileoverview Order book baseline parser - fetches and parses order book from annual reports
 * @module api/orderbookBaselineParser
 * @see {@link docs/API_REFERENCE.md#orders-apis} for Orders API docs
 * @see {@link docs/backend/api/geminiClient.md} for shared AI client
 */

const fs = require('fs');
const path = require('path');
const { parseNseDateToObject, formatNseDateForApi } = require('../utils/nseHelpers');
const { parsePdfWithGemini, hashPrompt } = require('./geminiClient');
const { getQuoteApi } = require('./nseIndiaApi');

// Read the orderbook baseline prompt from file
const orderbookBaselinePrompt = fs.readFileSync(
  path.join(__dirname, '../prompts/orderbook_baseline.txt'),
  'utf-8'
);

const promptHash = hashPrompt(orderbookBaselinePrompt);

/**
 * Fetch annual reports for a symbol from NSE
 * @param {string} symbol - Stock symbol
 * @returns {Array} List of annual reports
 */
const fetchAnnualReports = async (symbol) => {
  try {
    return await getQuoteApi('getCorpAnnualReport', symbol);
  } catch (error) {
    console.error('Error fetching annual reports:', error.message);
    return [];
  }
};

/**
 * Fetch investor presentations for a symbol from NSE
 * @param {string} symbol - Stock symbol
 * @param {number} monthsBack - How many months back to look
 * @returns {Array} List of investor presentations
 */
const fetchInvestorPresentations = async (symbol, monthsBack = 12) => {
  try {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - monthsBack);

    return await getQuoteApi('getCorporateAnnouncement', symbol, {
      subject: 'Investor Presentation',
      fromDate: formatNseDateForApi(fromDate),
      toDate: formatNseDateForApi(toDate),
    });
  } catch (error) {
    console.error('Error fetching investor presentations:', error.message);
    return [];
  }
};

/**
 * Fetch quarterly/financial results for a symbol from NSE
 * These often contain order book information
 * @param {string} symbol - Stock symbol
 * @param {number} monthsBack - How many months back to look
 * @returns {Array} List of financial results
 */
const fetchFinancialResults = async (symbol, monthsBack = 12) => {
  try {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - monthsBack);

    return await getQuoteApi('getCorporateAnnouncement', symbol, {
      subject: 'Financial Results',
      fromDate: formatNseDateForApi(fromDate),
      toDate: formatNseDateForApi(toDate),
    });
  } catch (error) {
    console.error('Error fetching financial results:', error.message);
    return [];
  }
};

/**
 * Parse order book baseline from a PDF document using Gemini AI
 * @param {string} attachmentUrl - URL to the PDF attachment
 * @returns {Object} Extracted order book baseline data
 */
const parseOrderbookBaseline = async (attachmentUrl) => {
  return parsePdfWithGemini({
    attachmentUrl,
    prompt: orderbookBaselinePrompt,
    promptHash,
    timeout: 180000,
    parseJson: true,
    errorShape: { order_book: null, document_info: null },
  });
};

/**
 * Get the best baseline document (most recent annual report, investor presentation, or financial result)
 * @param {string} symbol - Stock symbol
 * @returns {Object} Best baseline document info with parsed order book
 */
const getOrderbookBaseline = async (symbol) => {
  const upperSymbol = symbol.toUpperCase();

  // Fetch annual reports, investor presentations, and financial results in parallel
  const [annualReports, investorPresentations, financialResults] = await Promise.all([
    fetchAnnualReports(upperSymbol),
    fetchInvestorPresentations(upperSymbol, 18), // Extended to 18 months
    fetchFinancialResults(upperSymbol, 12),
  ]);

  console.log(
    `[${upperSymbol}] Fetched documents - Annual Reports: ${
      Array.isArray(annualReports) ? annualReports.length : 0
    }, Investor Presentations: ${
      Array.isArray(investorPresentations) ? investorPresentations.length : 0
    }, Financial Results: ${Array.isArray(financialResults) ? financialResults.length : 0}`
  );

  // Combine and sort by date (most recent first)
  const allDocuments = [];

  // Process annual reports (priority 1 - most likely to have order book)
  if (Array.isArray(annualReports)) {
    for (const report of annualReports) {
      const date = parseNseDateToObject(report.an_dt || report.date);
      if (date && report.attchmntFile) {
        allDocuments.push({
          type: 'Annual Report',
          priority: 1,
          date,
          dateStr: report.an_dt || report.date,
          attachmentUrl: report.attchmntFile,
          description: report.desc || report.subject || 'Annual Report',
        });
      }
    }
  }

  // Process investor presentations (priority 2)
  if (Array.isArray(investorPresentations)) {
    for (const pres of investorPresentations) {
      const date = parseNseDateToObject(pres.an_dt || pres.date);
      if (date && pres.attchmntFile) {
        allDocuments.push({
          type: 'Investor Presentation',
          priority: 2,
          date,
          dateStr: pres.an_dt || pres.date,
          attachmentUrl: pres.attchmntFile,
          description: pres.desc || pres.subject || 'Investor Presentation',
        });
      }
    }
  }

  // Process financial results (priority 3 - may contain order book info)
  if (Array.isArray(financialResults)) {
    for (const result of financialResults) {
      const date = parseNseDateToObject(result.an_dt || result.date);
      if (date && result.attchmntFile) {
        allDocuments.push({
          type: 'Financial Results',
          priority: 3,
          date,
          dateStr: result.an_dt || result.date,
          attachmentUrl: result.attchmntFile,
          description: result.desc || result.subject || 'Financial Results',
        });
      }
    }
  }

  // Sort by priority first, then by date descending (most recent first)
  allDocuments.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return b.date - a.date;
  });

  if (allDocuments.length === 0) {
    return {
      success: false,
      error:
        'No annual reports, investor presentations, or financial results found for this company',
      baseline: null,
      documents_fetched: {
        annual_reports: Array.isArray(annualReports) ? annualReports.length : 0,
        investor_presentations: Array.isArray(investorPresentations)
          ? investorPresentations.length
          : 0,
        financial_results: Array.isArray(financialResults) ? financialResults.length : 0,
      },
    };
  }

  // Try to parse documents that might have order book info (try up to 5 documents)
  const documentsToTry = allDocuments.slice(0, 5);
  const errors = [];

  for (const doc of documentsToTry) {
    try {
      console.log(`[${upperSymbol}] Trying to parse ${doc.type}: ${doc.description}`);
      const parsedData = await parseOrderbookBaseline(doc.attachmentUrl);

      if (parsedData.extraction_success && parsedData.order_book?.total_value?.value_in_crore_inr) {
        console.log(`[${upperSymbol}] Successfully extracted order book from ${doc.type}`);
        return {
          success: true,
          baseline: {
            document: doc,
            parsed_data: parsedData,
            order_book_value_crores: parsedData.order_book.total_value.value_in_crore_inr,
            as_of_date: parsedData.order_book.as_of_date,
            reporting_period: parsedData.order_book.reporting_period,
            segment_breakdown: parsedData.order_book.segment_breakdown,
            execution_timeline: parsedData.order_book.execution_timeline,
            // Order inflow for the current period (quarter/year)
            order_inflow: parsedData.order_book.order_inflow_current_period,
            order_book_commentary: parsedData.order_book.order_book_commentary,
          },
          _cache_metadata: parsedData._cache_metadata,
        };
      } else {
        errors.push(`${doc.type}: No order book data found`);
      }
    } catch (e) {
      console.error('Error parsing document:', doc.attachmentUrl, e.message);
      errors.push(`${doc.type}: ${e.message}`);
    }
  }

  return {
    success: false,
    error:
      'Could not extract order book information from available documents. This company may not publish order book details in their filings.',
    documents_checked: documentsToTry.map((d) => `${d.type}: ${d.description}`),
    parse_errors: errors,
    baseline: null,
  };
};

module.exports = {
  fetchAnnualReports,
  fetchInvestorPresentations,
  fetchFinancialResults,
  parseOrderbookBaseline,
  getOrderbookBaseline,
};
