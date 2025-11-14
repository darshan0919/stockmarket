// Technical Indicators Calculations

/**
 * Calculate Simple Moving Average
 * @param {Array} prices - Array of closing prices
 * @param {Number} period - Period for SMA calculation
 * @returns {Array} Array of SMA values
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
 * @param {Array} prices - Array of closing prices
 * @param {Number} period - Period for EMA calculation
 * @returns {Array} Array of EMA values
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
 * @param {Array} prices - Array of closing prices
 * @param {Number} period - Period for RSI calculation (default 14)
 * @returns {Number} Current RSI value
 */
function calculateRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) {
    return null;
  }

  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  const gains = changes.map(c => c > 0 ? c : 0);
  const losses = changes.map(c => c < 0 ? -c : 0);

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
      rsi.push(100 - (100 / (1 + rs)));
    }
  }

  return rsi.length > 0 ? rsi[rsi.length - 1] : null;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * @param {Array} prices - Array of closing prices
 * @returns {Object} Object with macd, signal, and histogram values
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
 * @param {Array} priceHistory - Array of price history objects with close prices
 * @returns {Object} Object containing all technical indicators
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

  const closePrices = priceHistory.map(ph => ph.close);

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

