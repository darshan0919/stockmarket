/**
 * Technical Indicators Calculations
 * @module utils/technicalIndicators
 * @see {@link docs/backend/utils/technicalIndicators.md} for detailed documentation
 * @see {@link backend/utils/__tests__/technicalIndicators.test.js} for tests
 */

/**
 * Calculate Simple Moving Average
 * SMA = (P1 + P2 + ... + Pn) / n
 *
 * @param {number[]} prices - Array of closing prices
 * @param {number} period - Period for SMA calculation
 * @returns {number[]} Array of SMA values
 *
 * @example
 * const prices = [10, 20, 30, 40, 50];
 * const sma = calculateSMA(prices, 3); // [20, 30, 40]
 */
function calculateSMA(prices, period) {
  if (!prices || prices.length < period) {
    return [];
  }

  const sma = [];
  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const average = slice.reduce((a, b) => a + b, 0) / period;
    sma.push(average);
  }
  return sma;
}

/**
 * Calculate Exponential Moving Average
 * EMA = (Price × k) + (Previous EMA × (1 - k)), where k = 2 / (period + 1)
 *
 * @param {number[]} prices - Array of closing prices
 * @param {number} period - Period for EMA calculation
 * @returns {number[]} Array of EMA values
 *
 * @example
 * const prices = [10, 20, 30, 40, 50];
 * const ema = calculateEMA(prices, 3);
 */
function calculateEMA(prices, period) {
  if (!prices || prices.length === 0) {
    return [];
  }

  const k = 2 / (period + 1);
  const ema = [prices[0]];

  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i - 1] * (1 - k));
  }

  return ema;
}

/**
 * Calculate Relative Strength Index
 * RSI = 100 - (100 / (1 + RS)), where RS = Average Gain / Average Loss
 *
 * @param {number[]} prices - Array of closing prices
 * @param {number} [period=14] - Period for RSI calculation
 * @returns {number|null} Current RSI value (0-100) or null if insufficient data
 *
 * @example
 * const rsi = calculateRSI(prices, 14);
 * // RSI > 70: Overbought, RSI < 30: Oversold
 */
function calculateRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) {
    return null;
  }

  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  const gains = changes.map((c) => (c > 0 ? c : 0));
  const losses = changes.map((c) => (c < 0 ? -c : 0));

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  const rsi = [];
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }

  return rsi.length > 0 ? rsi[rsi.length - 1] : null;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * MACD Line = EMA(12) - EMA(26)
 * Signal Line = EMA(9) of MACD Line
 * Histogram = MACD Line - Signal Line
 *
 * @param {number[]} prices - Array of closing prices (minimum 26 required)
 * @returns {{macd: number|null, signal: number|null, histogram: number|null}} MACD values
 *
 * @example
 * const { macd, signal, histogram } = calculateMACD(prices);
 */
function calculateMACD(prices) {
  if (!prices || prices.length < 26) {
    return { macd: null, signal: null, histogram: null };
  }

  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);

  const macdLine = [];
  for (let i = 0; i < ema12.length && i < ema26.length; i++) {
    macdLine.push(ema12[i] - ema26[i]);
  }

  const signalLine = calculateEMA(macdLine, 9);

  const histogram = [];
  for (let i = 0; i < macdLine.length && i < signalLine.length; i++) {
    histogram.push(macdLine[i] - signalLine[i]);
  }

  const lastIndex = macdLine.length - 1;
  return {
    macd: macdLine[lastIndex] || null,
    signal: signalLine[signalLine.length - 1] || null,
    histogram: histogram[histogram.length - 1] || null,
  };
}

/**
 * Calculate all technical indicators for a stock
 * Combines SMA, EMA, RSI, and MACD calculations
 *
 * @param {Object[]} priceHistory - Array of price history objects
 * @param {number} priceHistory[].close - Closing price
 * @returns {{sma_50: number|null, sma_200: number|null, rsi_14: number|null, macd: Object}} All indicators
 *
 * @example
 * const indicators = calculateAllIndicators(priceHistory);
 * // { sma_50: 100, sma_200: 95, rsi_14: 65, macd: {...} }
 *
 * @see Used by stockController.getStockTechnicals()
 */
function calculateAllIndicators(priceHistory) {
  if (!priceHistory || priceHistory.length === 0) {
    return {
      sma_50: null,
      sma_200: null,
      rsi_14: null,
      macd: { macd: null, signal: null, histogram: null },
    };
  }

  const closePrices = priceHistory.map((ph) => ph.close);

  const sma50Array = calculateSMA(closePrices, 50);
  const sma200Array = calculateSMA(closePrices, 200);

  return {
    sma_50: sma50Array.length > 0 ? sma50Array[sma50Array.length - 1] : null,
    sma_200: sma200Array.length > 0 ? sma200Array[sma200Array.length - 1] : null,
    rsi_14: calculateRSI(closePrices, 14),
    macd: calculateMACD(closePrices),
  };
}

module.exports = {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateAllIndicators,
};
