const axios = require('axios');

/**
 * Fetch stock price data from Alpha Vantage
 * @param {String} symbol - Stock symbol
 * @returns {Object} Price data
 */
async function fetchStockPriceAlphaVantage(symbol) {
  try {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      throw new Error('Alpha Vantage API key not configured');
    }

    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${symbol}.NS&outputsize=full&apikey=${apiKey}`;
    const response = await axios.get(url);

    if (response.data['Error Message']) {
      throw new Error('Invalid stock symbol');
    }

    const timeSeries = response.data['Time Series (Daily)'];
    if (!timeSeries) {
      throw new Error('No data available');
    }

    const priceHistory = [];
    for (const [date, values] of Object.entries(timeSeries)) {
      priceHistory.push({
        date: new Date(date),
        open: parseFloat(values['1. open']),
        high: parseFloat(values['2. high']),
        low: parseFloat(values['3. low']),
        close: parseFloat(values['4. close']),
        volume: parseInt(values['5. volume']),
      });
    }

    return priceHistory;
  } catch (error) {
    console.error(`Error fetching price data for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Fetch fundamentals from Financial Modeling Prep
 * @param {String} symbol - Stock symbol
 * @returns {Object} Fundamental data
 */
async function fetchFundamentalsFMP(symbol) {
  try {
    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
      throw new Error('FMP API key not configured');
    }

    const url = `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}.NS?apikey=${apiKey}`;
    const response = await axios.get(url);

    if (!response.data || response.data.length === 0) {
      throw new Error('No fundamental data available');
    }

    const data = response.data[0];
    return {
      pe_ratio: data.peRatio || null,
      pb_ratio: data.pbRatio || null,
      roe: data.roe ? data.roe * 100 : null,
      debt_to_equity: data.debtToEquity || null,
      dividend_yield: data.dividendYield ? data.dividendYield * 100 : null,
      current_ratio: data.currentRatio || null,
    };
  } catch (error) {
    console.error(`Error fetching fundamentals for ${symbol}:`, error.message);
    return null;
  }
}

/**
 * Delay execution for rate limiting
 * @param {Number} ms - Milliseconds to delay
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  fetchStockPriceAlphaVantage,
  fetchFundamentalsFMP,
  delay,
};
