# StockHeader Component

Stock detail page header showing name, symbol, sector, industry, price, market cap, and watchlist toggle.

## Source File
`frontend/components/stock/StockHeader.js`

## Props

| Prop | Type | Description |
|------|------|-------------|
| `stock` | object | Stock object with `symbol`, `name`, `sector`, `industry`, `market_cap` |
| `latestPrice` | number | Current price |
| `change` | number | Price change (absolute) |
| `changePercent` | number | Price change (percent) |

## Behavior

- Uses `useWatchlist` for add/remove; shows snackbar on error
- Formats price with `formatCurrency`, change with `formatChange`, market cap with `formatLargeNumber`
- Watchlist button: "☆ Add to Watchlist" or "★ Remove from Watchlist"

## Usage Example

```jsx
import StockHeader from '../components/stock/StockHeader';

<StockHeader
  stock={stock}
  latestPrice={1234.56}
  change={12.5}
  changePercent={1.02}
/>
```

## Related
- [useWatchlist](../hooks/useWatchlist.md)
- [formatters](../utils/formatters.md)
- [watchlistController](../../backend/controllers/watchlistController.md)
