# useMarket Hook

Fetches and manages market indices data. Auto-refreshes every 5 minutes.

## Source File
`frontend/lib/hooks/useMarket.js`

## Return Value

| Property | Type | Description |
|----------|------|-------------|
| `marketData` | object \| null | Market indices (nifty50, sensex, sectors) |
| `loading` | boolean | Loading state |
| `error` | string \| null | Error message if any |
| `refresh` | function | Manually refresh data |

## Usage Example

```jsx
import { useMarket } from '../lib/hooks/useMarket';

function MarketWidget() {
  const { marketData, loading, error, refresh } = useMarket();

  if (loading) return <Spinner />;
  if (error) return <Error message={error} />;

  return (
    <div>
      Nifty: {marketData.nifty50.current}
      <button onClick={refresh}>Refresh</button>
    </div>
  );
}
```

## API

- Calls `marketAPI.getIndices()` (GET /api/market/indices)
- Auto-refresh interval: 5 minutes

## Related
- [marketController](../../backend/controllers/marketController.md)
- [api](../lib/api.md)
