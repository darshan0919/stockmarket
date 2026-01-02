# SearchBar Component

> **Component**: `SearchBar`  
> **File**: `frontend/components/common/SearchBar.js`  
> **Last Updated**: 2025-01-02

## Overview

The `SearchBar` component provides real-time stock search functionality with autocomplete, keyboard navigation, and pagination support. It is integrated into the Header component for global availability across all pages.

## Features

- **Real-time Search**: Debounced search with 300ms delay
- **Autocomplete**: Dropdown with search results as you type
- **Highlighting**: Matched text highlighted in results
- **Keyboard Navigation**: Arrow keys, Enter, Escape support
- **Pagination**: Load more results for large result sets
- **Click Outside**: Automatically closes dropdown when clicking outside
- **Price Display**: Shows current price and change percentage
- **Exchange Display**: Shows stock exchange (NSE/BSE)
- **Sector Information**: Optional sector display in results

## Usage

### In Header (Current Implementation)

```javascript
import SearchBar from './SearchBar';

function Header() {
  return (
    <header>
      <SearchBar placeholder="Search stocks by symbol or name..." />
    </header>
  );
}
```

### Standalone Usage (If Needed)

```javascript
import SearchBar from '../components/common/SearchBar';

function MyComponent() {
  return (
    <div>
      <h1>Find Stocks</h1>
      <SearchBar placeholder="Search by symbol or company name..." />
    </div>
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `placeholder` | string | `'Search stocks...'` | Placeholder text for the input field |

## Component Behavior

### Search Flow

1. User types in the search input
2. Query is debounced (300ms delay)
3. API call is made to backend search endpoint
4. Results are displayed in dropdown
5. User can navigate with keyboard or click
6. Selecting a result navigates to stock detail page

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `ArrowDown` | Move selection down in results |
| `ArrowUp` | Move selection up in results |
| `Enter` | Navigate to selected stock |
| `Escape` | Close results dropdown |

### Features in Detail

#### Debouncing

The search is debounced to prevent excessive API calls:

```javascript
useEffect(() => {
  const debounceTimer = setTimeout(searchStocks, 300);
  return () => clearTimeout(debounceTimer);
}, [query, page]);
```

#### Pagination

Results are paginated with 10 items per page. Users can load more results:

```javascript
const limit = 10;
const [page, setPage] = useState(1);
const [hasMore, setHasMore] = useState(false);

const handleLoadMore = () => {
  setPage(page + 1);
};
```

#### Click Outside Detection

The dropdown automatically closes when clicking outside:

```javascript
useEffect(() => {
  const handleClickOutside = (event) => {
    if (searchRef.current && !searchRef.current.contains(event.target)) {
      setShowResults(false);
    }
  };

  document.addEventListener('mousedown', handleClickOutside);
  return () => document.removeEventListener('mousedown', handleClickOutside);
}, []);
```

## API Integration

The SearchBar uses the `stockAPI.search()` method from `lib/api.js`:

```javascript
const response = await stockAPI.search(query, page, limit);

// Response format:
{
  success: true,
  results: [
    {
      symbol: 'RELIANCE',
      name: 'Reliance Industries Limited',
      exchange: 'NSE',
      sector: 'Oil & Gas',
      current_price: 2450.50,
      change_percent: 1.25
    },
    // ...
  ],
  total: 100,
  page: 1,
  limit: 10
}
```

## Result Display

Each search result shows:

- **Company Name**: Highlighted matching text
- **Symbol & Exchange**: Stock symbol and exchange name
- **Sector**: Industry sector (if available)
- **Current Price**: Latest stock price in INR
- **Change %**: Percentage change (color-coded: green=positive, red=negative)

### Result Card Format

```
┌─────────────────────────────────────────┐
│ Reliance Industries Limited             │
│ RELIANCE · NSE • Oil & Gas              │
│                          ₹2,450.50       │
│                            +1.25%        │
└─────────────────────────────────────────┘
```

## Styling

### Input Field

- Border: `border border-gray-300`
- Focus: `focus:ring-2 focus:ring-primary-500`
- Padding: `px-4 py-2`
- Search icon: Positioned absolute on the right

### Dropdown

- Position: `absolute z-50 w-full mt-2`
- Background: `bg-white`
- Border: `border border-gray-200`
- Shadow: `shadow-lg`
- Max Height: `max-h-[500px]` with overflow scroll

### Result Items

- Hover: `hover:bg-gray-50`
- Selected (keyboard): `bg-blue-50`
- Border: `border-b border-gray-100` between items

## Helper Functions

### formatPrice

Formats price with Indian currency symbol:

```javascript
const formatPrice = (price) => {
  if (!price) return 'N/A';
  return `₹${Number(price).toFixed(2)}`;
};
```

### formatChange

Formats change percentage with sign:

```javascript
const formatChange = (change) => {
  if (!change && change !== 0) return '';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${Number(change).toFixed(2)}%`;
};
```

### getChangeColor

Returns color class based on change value:

```javascript
const getChangeColor = (change) => {
  if (!change || change === 0) return 'text-gray-600';
  return change > 0 ? 'text-green-600' : 'text-red-600';
};
```

### highlightMatch

Highlights matching text in results:

```javascript
const highlightMatch = (text, query) => {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-yellow-200 text-gray-900">
        {part}
      </mark>
    ) : (
      part
    )
  );
};
```

## Testing

Tests are located in `frontend/components/common/__tests__/SearchBar.test.js`:

```javascript
describe('SearchBar', () => {
  it('renders search input with default placeholder', () => {});
  it('shows loading state during search', () => {});
  it('displays search results', () => {});
  it('highlights matching text in results', () => {});
  it('navigates to stock page on result click', () => {});
  it('clears search after selection', () => {});
  it('shows no results message when empty', () => {});
  it('handles keyboard navigation with arrow keys', () => {});
  it('hides results on Escape key', () => {});
  it('hides results on click outside', () => {});
  it('debounces search requests', () => {});
  it('displays stock exchange in results', () => {});
  it('shows load more button when more results available', () => {});
  it('handles API errors gracefully', () => {});
});
```

Run tests:

```bash
cd frontend
npm test -- SearchBar.test.js
```

## Performance Considerations

1. **Debouncing**: 300ms delay prevents excessive API calls
2. **Pagination**: Only loads 10 results at a time
3. **Memoization**: Results are cached for the current query
4. **Event Cleanup**: Event listeners are properly cleaned up on unmount

## Error Handling

The component handles errors gracefully:

```javascript
try {
  const response = await stockAPI.search(query, page, limit);
  // Process results
} catch (error) {
  console.error('Search error:', error);
  setResults([]);
  setHasMore(false);
}
```

Errors are logged to console and the component shows "No results found" message.

## Accessibility

- **Keyboard Navigation**: Full keyboard support for navigation and selection
- **Click Outside**: Intuitive dropdown closing behavior
- **Focus Management**: Input remains focused during keyboard navigation
- **Visual Feedback**: Clear hover and selection states

## Integration with Header

The SearchBar is now integrated into the Header component for global availability:

```javascript
// Header.js
<div className="flex-1 max-w-2xl">
  <SearchBar placeholder="Search stocks by symbol or name..." />
</div>
```

This makes the search available on:
- Dashboard page
- Screener page
- Watchlist page
- Individual stock detail pages
- All other pages

## Related Components

- [Header](./Header.md) - Navigation header that includes the SearchBar
- [StockHeader](./StockHeader.md) - Stock detail page header

## API Reference

See [API_REFERENCE.md](../../API_REFERENCE.md#stock-search) for search endpoint documentation.

## Changelog

### 2025-01-02
- Integrated into Header component for global availability
- Added comprehensive JSDoc comments
- Created detailed documentation
- No functional changes to search behavior

### Previous
- Initial implementation with autocomplete
- Keyboard navigation support
- Pagination support
- Highlight matching text

