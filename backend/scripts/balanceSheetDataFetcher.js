const axios = require('axios');
const { parseXBRL } = require('../utils/xbrlParser');
const QuarterlyResult = require('../models/QuarterlyResult');

const getCurrentMetrics = async (symbol) => {
  const upperSymbol = symbol.toUpperCase();
  const consolidateResults = await QuarterlyResult.find({ symbol: upperSymbol, consolidated: true })
    .sort({ to_date: -1 })
    .limit(4)
    .lean();
  if (consolidateResults.length > 0) {
    return calculateMetrics(consolidateResults);
  }

  const standaloneResults = await QuarterlyResult.find({ symbol: upperSymbol, consolidated: false })
    .sort({ to_date: -1 })
    .limit(4)
    .lean();
  if (standaloneResults.length > 0) {
    return calculateMetrics(standaloneResults);
  }
  const results = await fetchAndStoreQuarterlyResults(symbol);
  if (results.empty) {
    return {};
  }

  return getCurrentMetrics(symbol);
};

const calculateMetrics = (results) => {
  const currentMetrics = {
    debt_equity_ratio: getDebtEquityRatio(results[0]),
    roce: getROCE(results),
    last_quarter_roce: getROCE(results.slice(0, 1)),
  };
  return currentMetrics;
};

const getROCE = (results) => {
  let total_operating_profit = results.reduce((acc, result) => acc + result.operating_profit, 0);
  let total_capital = 0;
  let count = 0;
  results.forEach((result) => {
    if (!result.equity_capital) {
      return;
    }
    const capital_employed = total_equity(result) + total_borrowings(result);
    if (capital_employed > 0) {
      total_capital += capital_employed;
      count++;
    }
  });
  if (count === 0 || results.length <= 2) {
    return null;
  }
  total_operating_profit = (total_operating_profit * 4) / results.length;
  total_capital = total_capital / count;
  return (total_operating_profit / total_capital) * 100;
};

const getDebtEquityRatio = (result) => {
  console.log('borrowings', total_borrowings(result), 'equity', total_equity(result));
  return total_borrowings(result) / total_equity(result);
};

const total_equity = (result) => {
  return result.equity_capital + (result.reserves || 0) + (result.other_equity || 0);
};

const total_borrowings = (result) => {
  return (
    (result.borrowings || 0) +
    (result.other_non_curr_financial_liabilities || 0) +
    (result.other_curr_financial_liabilities || 0)
  );
};

const fetchAndStoreQuarterlyResults = async (symbol) => {
  // First get company name from quote API
  const upperSymbol = symbol.toUpperCase();
  let companyName = '';
  try {
    const quoteResponse = await axios.get(
      `https://www.nseindia.com/api/quote-equity?symbol=${upperSymbol}`,
      {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'application/json',
        },
      }
    );
    companyName = quoteResponse.data.info?.companyName || '';
  } catch (err) {
    console.warn(`Could not fetch company name: ${err.message}`);
  }

  // Fetch from both APIs and merge results
  const issuer = encodeURIComponent(companyName || `${upperSymbol} LIMITED`);

  // API 1: corporates-financial-results (historical data)
  let historicalResults = [];
  try {
    const historicalResponse = await axios.get(
      `https://www.nseindia.com/api/corporates-financial-results?index=equities&symbol=${upperSymbol}&issuer=${issuer}&period=Quarterly`,
      {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'application/json',
        },
      }
    );
    historicalResults = historicalResponse.data || [];
    console.log(`Historical API: ${historicalResults.length} quarters found`);
  } catch (err) {
    console.warn(`Historical API failed: ${err.message}`);
  }

  // API 2: integrated-filing-results (recent 4 quarters with broadcast time)
  let recentResults = [];
  try {
    const recentResponse = await axios.get(
      `https://www.nseindia.com/api/integrated-filing-results?index=equities&symbol=${upperSymbol}&issuer=${issuer}&period_ended=all&type=Integrated%20Filing-%20Financials&page=1&size=20`,
      {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Accept: 'application/json',
        },
      }
    );
    recentResults = (recentResponse.data?.data || []).map((r) => ({
      xbrl: r.xbrl,
      companyName: r.cmName,
      consolidated: r.consolidated,
      audited: r.audited,
      fromDate: null, // Not provided in this API
      toDate: r.qe_Date,
      filingDate: r.creation_Date,
      broadcastDate: r.broadcast_Date,
      seqNumber: r.seq_Id,
    }));
    console.log(`Recent API: ${recentResults.length} quarters found`);
  } catch (err) {
    console.warn(`Recent API failed: ${err.message}`);
  }

  // Merge results: Use recent API data preferentially, then historical
  // Create a map to deduplicate by (toDate + consolidated)
  const resultsMap = new Map();

  // Add historical results first
  historicalResults.forEach((r) => {
    if (r.xbrl) {
      const key = `${r.toDate}_${r.consolidated}`;
      resultsMap.set(key, {
        ...r,
        source: 'historical',
      });
    }
  });

  // Override/add with recent results (they have broadcast_date)
  recentResults.forEach((r) => {
    if (r.xbrl) {
      const key = `${r.toDate}_${r.consolidated}`;
      resultsMap.set(key, {
        ...r,
        source: 'recent',
      });
    }
  });

  const allResults = Array.from(resultsMap.values());
  console.log(`Merged: ${allResults.length} unique quarters`);

  if (allResults.length === 0) {
    return {
      empty: true,
    };
  }

  // Step 3: Parse XBRL documents and store in database
  const promises = [];

  // Process all results (both consolidated and standalone)
  const latestResults = allResults;

  for (const result of latestResults) {
    promises.push(
      (async () => {
        try {
          // Check if already in database
          const existing = await QuarterlyResult.findOne({
            symbol: upperSymbol,
            seq_number: result.seqNumber,
          });

          if (existing && !force_refresh) {
            return existing;
          }

          // Parse XBRL
          const parsedData = await parseXBRL(result.xbrl);

          // Parse toDate - handle different formats (DD-MMM-YYYY or YYYY-MM-DD)
          let toDate;
          if (result.toDate.includes('-') && result.toDate.length > 10) {
            // Format: DD-MMM-YYYY (e.g., "30-SEP-2025")
            const parts = result.toDate.split('-');
            const months = {
              JAN: 0,
              FEB: 1,
              MAR: 2,
              APR: 3,
              MAY: 4,
              JUN: 5,
              JUL: 6,
              AUG: 7,
              SEP: 8,
              OCT: 9,
              NOV: 10,
              DEC: 11,
              Jan: 0,
              Feb: 1,
              Mar: 2,
              Apr: 3,
              May: 4,
              Jun: 5,
              Jul: 6,
              Aug: 7,
              Sep: 8,
              Oct: 9,
              Nov: 10,
              Dec: 11,
            };
            const monthStr = parts[1].toUpperCase().substring(0, 3);
            toDate = new Date(parseInt(parts[2]), months[monthStr], parseInt(parts[0]));
          } else {
            toDate = new Date(result.toDate);
          }

          // Create period string using fiscal year (Apr-Mar)
          // Fiscal Q1 = Apr-Jun (month 3-5), Q2 = Jul-Sep (6-8), Q3 = Oct-Dec (9-11), Q4 = Jan-Mar (0-2)
          const month = toDate.getMonth(); // 0-11
          let quarter, fiscal_year;

          if (month >= 3 && month <= 5) {
            // Apr-Jun = Q1
            quarter = 1;
            fiscal_year = toDate.getFullYear() + 1; // FY 2025 for Apr-Jun 2024
          } else if (month >= 6 && month <= 8) {
            // Jul-Sep = Q2
            quarter = 2;
            fiscal_year = toDate.getFullYear() + 1;
          } else if (month >= 9 && month <= 11) {
            // Oct-Dec = Q3
            quarter = 3;
            fiscal_year = toDate.getFullYear() + 1;
          } else {
            // Jan-Mar = Q4
            quarter = 4;
            fiscal_year = toDate.getFullYear(); // FY 2025 for Jan-Mar 2025
          }

          const period = `Q${quarter} FY${String(fiscal_year).slice(-2)}`;

          // Parse broadcast date if available
          let broadcastDate = null;
          if (result.broadcastDate) {
            // Format: "16-Oct-2025 17:04:16"
            const bcParts = result.broadcastDate.split(' ');
            const dateParts = bcParts[0].split('-');
            const timeParts = bcParts[1].split(':');
            const months = {
              Jan: 0,
              Feb: 1,
              Mar: 2,
              Apr: 3,
              May: 4,
              Jun: 5,
              Jul: 6,
              Aug: 7,
              Sep: 8,
              Oct: 9,
              Nov: 10,
              Dec: 11,
            };
            broadcastDate = new Date(
              dateParts[2],
              months[dateParts[1]],
              dateParts[0],
              timeParts[0],
              timeParts[1],
              timeParts[2]
            );
          }

          // Prepare document
          const quarterDoc = {
            symbol: upperSymbol,
            company_name: result.companyName || companyName,
            from_date: result.fromDate ? new Date(result.fromDate) : null,
            to_date: toDate,
            period,
            quarter,
            fiscal_year,
            filing_date: result.filingDate ? new Date(result.filingDate) : null,
            broadcast_date: broadcastDate,
            audited:
              result.audited === 'Audited' || result.audited === 'Un-Audited'
                ? result.audited === 'Audited'
                : false,
            consolidated: result.consolidated === 'Consolidated',
            seq_number: result.seqNumber,
            xbrl_url: result.xbrl,
            last_updated: new Date(),
            ...parsedData,
          };

          // Upsert to database
          const saved = await QuarterlyResult.findOneAndUpdate(
            { symbol: upperSymbol, seq_number: result.seqNumber },
            quarterDoc,
            { upsert: true, new: true }
          );

          return saved;
        } catch (error) {
          console.error(`Failed to parse quarter ${result.toDate}:`, error);
          return null;
        }
      })()
    );
  }

  // Wait for all parsing to complete
  const parsedResults = await Promise.all(promises);
  return parsedResults;
};

module.exports = {
  getCurrentMetrics,
  fetchAndStoreQuarterlyResults,
};
