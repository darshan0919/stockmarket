const { upcomingResults: bseUpcomingResults } = require('../api/bseIndiaApi');
const { upcomingResults: nseUpcomingResults } = require('../api/nseIndiaApi');
const { fetchStockDetails } = require('../scripts/stockDetailsFetcher');
const { getLastQuatersRevenueGrowthMetrics } = require("../scripts/quaterlyResultsFetcher");

/**
 * Normalize BSE result to common format
 */
const normalizeBseResult = (result) => ({
  symbol: result.short_name,
  name: result.Long_Name,
  date: result.meeting_date,
  scrip_code: result.scrip_Code,
  exchange: 'BSE',
  exchangeSymbol: `BSE:${result.short_name}`,
});

/**
 * Normalize NSE result to common format
 * NSE API returns: { symbol, company, bm_desc, date, ... }
 */
const normalizeNseResult = (result) => ({
  symbol: result.symbol,
  name: result.company,
  date: result.date,
  scrip_code: null, // NSE doesn't use scrip codes
  exchange: 'NSE',
  exchangeSymbol: `NSE:${result.symbol}`,
});

/**
 * Merge NSE and BSE results, giving preference to NSE
 * When same company exists in both, prefer NSE entry
 */
const mergeResults = (nseResults, bseResults) => {
  const merged = new Map();

  // Add NSE results first (they get preference)
  for (const result of nseResults) {
    const normalized = normalizeNseResult(result);
    const key = normalized.symbol.toUpperCase();
    merged.set(key, normalized);
  }

  // Add BSE results only if not already present from NSE
  for (const result of bseResults) {
    const normalized = normalizeBseResult(result);
    const key = normalized.symbol.toUpperCase();
    if (!merged.has(key)) {
      merged.set(key, normalized);
    }
  }

  // Convert to array and sort by date
  return Array.from(merged.values()).sort((a, b) => {
    const dateA = parseDate(a.date);
    const dateB = parseDate(b.date);
    return dateA - dateB;
  });
};

/**
 * Parse date string to Date object
 * Handles multiple formats: "DD-Mon-YYYY", "DD/MM/YYYY", etc.
 */
const parseDate = (dateStr) => {
  if (!dateStr) return new Date(0);

  // Try parsing "DD-Mon-YYYY" format (e.g., "29-Dec-2025")
  const monthNames = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  const match = dateStr.match(/(\d{1,2})[-\/](\w{3}|\d{1,2})[-\/](\d{4})/);
  if (match) {
    const day = parseInt(match[1]);
    const monthPart = match[2].toLowerCase();
    const year = parseInt(match[3]);

    let month;
    if (monthNames[monthPart] !== undefined) {
      month = monthNames[monthPart];
    } else {
      month = parseInt(monthPart) - 1;
    }

    return new Date(year, month, day);
  }

  // Fallback to native parsing
  return new Date(dateStr);
};

const getUpcomingResults = async (req, res, next) => {
  try {
    const page = Number.parseInt(req.query.page || 1);
    const limit = Number.parseInt(req.query.limit || 10);

    // Fetch from both NSE and BSE in parallel
    const [nseResults, bseResults] = await Promise.all([
      nseUpcomingResults().catch((err) => {
        console.error('NSE API error:', err.message);
        return [];
      }),
      bseUpcomingResults().catch((err) => {
        console.error('BSE API error:', err.message);
        return [];
      }),
    ]);

    console.log(`Fetched ${nseResults.length} NSE results, ${bseResults.length} BSE results`);

    // Merge results with NSE preference
    const mergedResults = mergeResults(nseResults, bseResults);
    console.log(`Merged to ${mergedResults.length} unique results`);

    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedResults = mergedResults.slice(startIndex, endIndex);

    // Fetch stock details for each result
    const promises = paginatedResults.map(async (result) => {
      const stockDetails = await fetchStockDetails(result.symbol, result.scrip_code);
      const quarterlyRevenueDetails = await getLastQuatersRevenueGrowthMetrics(result.symbol, 4)
      return {
        ...result,
        stockDetails: stockDetails,
        revenue: quarterlyRevenueDetails,
      };
    });
    const parsedResults = await Promise.all(promises);

    res.json({
      success: true,
      data: parsedResults,
      hasNext: endIndex < mergedResults.length,
      total: mergedResults.length,
    });
  } catch (error) {
    next(error);
  }
};

const getUpcomingResultsSymbols = async (req, res, next) => {
  try {
    // Fetch from both NSE and BSE in parallel
    const [nseResults, bseResults] = await Promise.all([
      nseUpcomingResults().catch((err) => {
        console.error('NSE API error:', err.message);
        return [];
      }),
      bseUpcomingResults().catch((err) => {
        console.error('BSE API error:', err.message);
        return [];
      }),
    ]);

    // Merge results with NSE preference
    const mergedResults = mergeResults(nseResults, bseResults);

    // Extract only exchange symbols
    const symbols = mergedResults.map((result) => result.exchangeSymbol);

    res.json({
      success: true,
      symbols: symbols,
      total: symbols.length,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUpcomingResults,
  getUpcomingResultsSymbols,
};
