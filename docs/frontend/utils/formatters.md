# Formatters

Utility functions for formatting numbers, currencies, dates, and percentages in the frontend. Uses Indian locale (en-IN).

## Source File
`frontend/lib/utils/formatters.js`

## Functions

### formatCurrency(value, emptyPlaceholder)
Format number as Indian currency (₹X,XXX.XX).

**Parameters:**
- `value` (number | null | undefined)
- `emptyPlaceholder` (string) - Default 'N/A'

### formatPrice(value, emptyPlaceholder)
Format as simple ₹X.XX (no thousands separator).

### formatQuarterDate(dateStr)
Format YYYYMM (e.g., "202512") to "Dec 2025".

**Parameters:**
- `dateStr` (string) - 6-char YYYYMM

### formatLargeNumber(value)
Format with K/M/B/Cr suffixes (e.g., ₹1.23Cr, ₹2.5B).

### formatPercent(value, decimals, emptyPlaceholder)
Format as "X.XX%" (no sign).

### formatPercentage(value, decimals)
Format with sign for growth (e.g., "+5.25%", "-2.10%").

### formatNumber(value, decimals)
Format number with fixed decimals.

### formatDate(date)
Format date as "DD Mon YYYY" (en-IN).

### formatChartDate(date)
Short format for charts: "Mon YY".

### getChangeColor(value)
Return Tailwind class: `text-positive`, `text-negative`, or `text-gray-600`.

### getChangeBgColor(value)
Return Tailwind class: `bg-positive`, `bg-negative`, or `bg-gray-100`.

### formatChange(value, decimals)
Format with sign (e.g., "+12.50", "-3.25").

## Usage Example

```javascript
import { formatCurrency, formatLargeNumber, formatPercentage } from '../lib/utils/formatters';

formatCurrency(1234.56);        // "₹1,234.56"
formatLargeNumber(1234567890);  // "₹123.46Cr"
formatPercentage(5.25);        // "+5.25%"
```

## Related
- [QuarterlyResults](../components/QuarterlyResults.md)
- [StockHeader](../components/StockHeader.md)
- [formatters.test.js](../../frontend/lib/utils/__tests__/formatters.test.js)
