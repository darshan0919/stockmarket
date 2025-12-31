# Technical Indicators Utility

> **File**: `backend/utils/technicalIndicators.js`  
> **Tests**: `backend/utils/__tests__/technicalIndicators.test.js`  
> **Last Updated**: 2024-12-31

## Overview

This module provides functions for calculating technical analysis indicators used in stock market analysis.

## Functions

### calculateSMA

Calculates Simple Moving Average for a price series.

```javascript
function calculateSMA(prices, period) → number[]
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `prices` | `number[]` | Array of closing prices |
| `period` | `number` | Number of periods for SMA |

**Returns:** `number[]` - Array of SMA values

**Example:**
```javascript
const { calculateSMA } = require('../utils/technicalIndicators');

const prices = [10, 20, 30, 40, 50];
const sma = calculateSMA(prices, 3);
// Result: [20, 30, 40]
```

**Algorithm:**
```
SMA = (P1 + P2 + ... + Pn) / n
```

---

### calculateEMA

Calculates Exponential Moving Average for a price series.

```javascript
function calculateEMA(prices, period) → number[]
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `prices` | `number[]` | Array of closing prices |
| `period` | `number` | Number of periods for EMA |

**Returns:** `number[]` - Array of EMA values

**Example:**
```javascript
const { calculateEMA } = require('../utils/technicalIndicators');

const prices = [10, 20, 30, 40, 50];
const ema = calculateEMA(prices, 3);
```

**Algorithm:**
```
Multiplier (k) = 2 / (period + 1)
EMA = (Price × k) + (Previous EMA × (1 - k))
```

---

### calculateRSI

Calculates Relative Strength Index.

```javascript
function calculateRSI(prices, period = 14) → number | null
```

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `prices` | `number[]` | - | Array of closing prices |
| `period` | `number` | 14 | Number of periods for RSI |

**Returns:** `number | null` - Current RSI value (0-100) or null if insufficient data

**Example:**
```javascript
const { calculateRSI } = require('../utils/technicalIndicators');

const prices = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 
                46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03];
const rsi = calculateRSI(prices, 14);
// Result: ~70.53
```

**Interpretation:**
- RSI > 70: Overbought
- RSI < 30: Oversold
- RSI = 50: Neutral

**Algorithm:**
```
RS = Average Gain / Average Loss
RSI = 100 - (100 / (1 + RS))
```

---

### calculateMACD

Calculates Moving Average Convergence Divergence.

```javascript
function calculateMACD(prices) → { macd: number, signal: number, histogram: number }
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `prices` | `number[]` | Array of closing prices (minimum 26 required) |

**Returns:** Object with:
| Property | Type | Description |
|----------|------|-------------|
| `macd` | `number` | MACD line value |
| `signal` | `number` | Signal line value |
| `histogram` | `number` | MACD histogram value |

**Example:**
```javascript
const { calculateMACD } = require('../utils/technicalIndicators');

const prices = [/* 26+ closing prices */];
const macd = calculateMACD(prices);
// Result: { macd: 1.5, signal: 1.2, histogram: 0.3 }
```

**Algorithm:**
```
MACD Line = EMA(12) - EMA(26)
Signal Line = EMA(9) of MACD Line
Histogram = MACD Line - Signal Line
```

---

### calculateAllIndicators

Calculates all technical indicators for a stock.

```javascript
function calculateAllIndicators(priceHistory) → Object
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `priceHistory` | `Object[]` | Array of price history objects with `close` property |

**Returns:** Object with all indicators:
```javascript
{
  sma_50: number | null,
  sma_200: number | null,
  rsi_14: number | null,
  macd: {
    macd: number | null,
    signal: number | null,
    histogram: number | null
  }
}
```

**Example:**
```javascript
const { calculateAllIndicators } = require('../utils/technicalIndicators');

const priceHistory = [
  { date: '2024-01-01', close: 100 },
  { date: '2024-01-02', close: 102 },
  // ... more data
];

const indicators = calculateAllIndicators(priceHistory);
```

## Usage in Controllers

This utility is used by the stock controller to provide technical analysis:

```javascript
// backend/controllers/stockController.js
const { calculateAllIndicators } = require('../utils/technicalIndicators');

const getStockTechnicals = async (req, res, next) => {
  const priceHistory = await PriceHistory.find({ stock_id }).lean();
  const indicators = calculateAllIndicators(priceHistory);
  res.json({ success: true, data: indicators });
};
```

## Related Documentation

- [Stock Controller](../controllers/stockController.md) - Uses this utility
- [API Reference](../../API_REFERENCE.md#get-stock-technicals) - API endpoint documentation

