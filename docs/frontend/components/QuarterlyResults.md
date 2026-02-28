# QuarterlyResults Component

Displays quarterly financial results in a horizontal scrollable table. Supports consolidated/standalone toggle and shows YoY/QoQ growth metrics.

## Source File
`frontend/components/stock/QuarterlyResults.js`

## Props

| Prop | Type | Description |
|------|------|-------------|
| `symbol` | string | Stock symbol to fetch results for |

## Behavior

- Fetches data via `stockAPI.getQuarterlyResults(symbol)`
- Auto-scrolls to right (latest quarter) when data loads
- Toggle between consolidated and standalone results when both exist
- Displays P&L metrics (sales, expenses, OPM, net profit, EPS) and growth (YoY, QoQ)
- Figures in Crores; growth shown with color (green/red)

## Usage Example

```jsx
import QuarterlyResults from '../components/stock/QuarterlyResults';

<QuarterlyResults symbol="RELIANCE" />
```

## Related
- [stockController](../../backend/controllers/stockController.md)
- [formatters](../utils/formatters.md)
- [API Reference](../../API_REFERENCE.md#stocks-apis)
