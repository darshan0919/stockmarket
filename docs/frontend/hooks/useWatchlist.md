# useWatchlist Hook

Manages user's stock watchlist. Fetches list, add/remove symbols, check membership.

## Source File
`frontend/lib/hooks/useWatchlist.js`

## Return Value

| Property | Type | Description |
|----------|------|-------------|
| `watchlist` | Array | List of watchlist items |
| `loading` | boolean | Loading state |
| `error` | string \| null | Error message |
| `fetchWatchlist` | function | Refresh watchlist |
| `addToWatchlist` | function(symbol) | Add symbol; returns `{ success, error? }` |
| `removeFromWatchlist` | function(symbol) | Remove symbol; returns `{ success, error? }` |
| `isInWatchlist` | function(symbol) | Check if symbol is in watchlist |

## Usage Example

```jsx
import { useWatchlist } from '../lib/hooks/useWatchlist';

function WatchlistButton({ symbol }) {
  const { isInWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const inList = isInWatchlist(symbol);

  return (
    <button onClick={() => inList ? removeFromWatchlist(symbol) : addToWatchlist(symbol)}>
      {inList ? 'Remove' : 'Add'}
    </button>
  );
}
```

## API

- `watchlistAPI.getAll()` - GET /api/watchlist
- `watchlistAPI.add(symbol)` - POST /api/watchlist/:symbol
- `watchlistAPI.remove(symbol)` - DELETE /api/watchlist/:symbol

## Related
- [watchlistController](../../backend/controllers/watchlistController.md)
- [StockHeader](../components/StockHeader.md)
- [api](../lib/api.md)
