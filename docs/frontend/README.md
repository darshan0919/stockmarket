# Frontend Documentation

> **Code Location**: `frontend/`  
> **Entry Point**: `frontend/pages/_app.js`  
> **Last Updated**: 2025-01-02

## Overview

The frontend is a Next.js 14 React application providing a user interface for stock market analysis, screening, and watchlist management.

## Directory Structure

```
frontend/
├── components/              # React components
│   ├── common/             # Reusable components
│   │   ├── Header.js       # Navigation header with global search
│   │   ├── SearchBar.js    # Stock search component (integrated in Header)
│   │   ├── Table.js        # Data table
│   │   ├── Modal.js        # Modal dialog
│   │   └── LoadingSpinner.js
│   ├── dashboard/          # Dashboard widgets
│   │   ├── MarketSnapshot.js
│   │   ├── UpcomingResults.js
│   │   └── WatchlistSummary.js
│   ├── screener/           # Screener components
│   │   ├── FilterPanel.js
│   │   └── ResultsTable.js
│   └── stock/              # Stock detail components
│       ├── StockHeader.js
│       ├── QuarterlyResults.js
│       ├── BalanceSheet.js
│       ├── CashFlows.js
│       ├── ChartTab.js
│       ├── TechnicalTab.js
│       ├── FundamentalsTab.js
│       ├── OrderBook.js
│       ├── TranscriptTab.js
│       └── __tests__/      # Component tests
├── lib/                     # Utilities and hooks
│   ├── api.js              # API client
│   ├── hooks/              # Custom React hooks
│   │   ├── useMarket.js
│   │   └── useWatchlist.js
│   └── utils/              # Helper functions
│       └── formatters.js
├── pages/                   # Next.js pages
│   ├── _app.js             # App wrapper
│   ├── _document.js        # Document wrapper
│   ├── index.js            # Dashboard
│   ├── screener.js         # Screener page
│   ├── watchlist.js        # Watchlist page
│   ├── 404.js              # 404 page
│   └── stock/
│       └── [symbol].js     # Dynamic stock page
├── public/                  # Static assets
├── styles/
│   └── globals.css         # Global styles
├── tailwind.config.js
├── next.config.js
└── jest.config.js
```

## Quick Reference

### Global Navigation

The application features a global header with navigation and search functionality:

- **Logo**: Links to the dashboard page
- **Search Bar**: Global stock search available on all pages (symbol or company name)
- **Navigation Links**: Dashboard, Screener, Watchlist

The search bar is integrated into the header, making it accessible from any page including individual stock detail pages. It provides autocomplete functionality with:
- Real-time search results
- Keyboard navigation (arrow keys, Enter, Escape)
- Direct navigation to stock detail pages
- Pagination support for large result sets

### Components

| Component | File | Documentation |
|-----------|------|---------------|
| SearchBar | [SearchBar.js](./components/SearchBar.md) | Stock search with autocomplete |
| QuarterlyResults | [QuarterlyResults.js](./components/QuarterlyResults.md) | Financial results table |
| StockHeader | [StockHeader.js](./components/StockHeader.md) | Stock price header |

### Hooks

| Hook | File | Documentation |
|------|------|---------------|
| useMarket | [useMarket.js](./hooks/useMarket.md) | Market data hook |
| useWatchlist | [useWatchlist.js](./hooks/useWatchlist.md) | Watchlist management |

### Utilities

| Utility | File | Documentation |
|---------|------|---------------|
| formatters | [formatters.js](./utils/formatters.md) | Number and date formatting |
| api | [api.js](./lib/api.md) | API client |

## Development

### Running the Application

```bash
cd frontend
# Dependencies are installed from repo root: yarn install

yarn dev   # Development server at http://localhost:3000
yarn build # Production build
yarn start # Start production server

# Or from repo root:
yarn workspace stock-screener-frontend dev
```

### Running Tests

```bash
yarn workspace stock-screener-frontend test
yarn workspace stock-screener-frontend test:watch
```

### Code Formatting

```bash
yarn workspace stock-screener-frontend format
yarn workspace stock-screener-frontend format:check
```

## API Client

The API client is centralized in `lib/api.js`:

```javascript
import { stockAPI, screenerAPI, watchlistAPI, marketAPI } from '../lib/api';

// Usage
const response = await stockAPI.search('RELIANCE');
const details = await stockAPI.getDetails('RELIANCE');
```

### Available APIs

| API Object | Methods |
|------------|---------|
| `stockAPI` | `search()`, `getDetails()`, `getTechnicals()`, `getFinancials()`, `getQuarterlyResults()` |
| `screenerAPI` | `runScreener()` |
| `watchlistAPI` | `getAll()`, `add()`, `remove()` |
| `marketAPI` | `getIndices()`, `getStats()` |
| `transcriptAPI` | `getTranscripts()`, `analyzeTranscript()` |
| `ordersAPI` | `getBySymbol()`, `getFullParsed()`, `parsePdf()`, `getOrderbook()` |
| `upcomingResultsAPI` | `getAll()`, `getSymbols()` |
| `announcementsAPI` | `getBySymbol()` |

## Custom Hooks

### useMarket

```javascript
import { useMarket } from '../lib/hooks/useMarket';

function MyComponent() {
  const { marketData, loading, error, refresh } = useMarket();
  
  if (loading) return <LoadingSpinner />;
  if (error) return <div>Error: {error}</div>;
  
  return <div>{marketData.nifty50.current}</div>;
}
```

### useWatchlist

```javascript
import { useWatchlist } from '../lib/hooks/useWatchlist';

function MyComponent() {
  const { 
    watchlist, 
    loading, 
    addToWatchlist, 
    removeFromWatchlist,
    isInWatchlist 
  } = useWatchlist();
  
  const handleAdd = async () => {
    const result = await addToWatchlist('RELIANCE');
    if (result.success) {
      // Handle success
    }
  };
}
```

## Utility Functions

### Formatters (`lib/utils/formatters.js`)

| Function | Description | Example |
|----------|-------------|---------|
| `formatCurrency(value)` | Indian currency format | `₹1,234.56` |
| `formatLargeNumber(value)` | Abbreviated numbers | `₹1.5Cr` |
| `formatPercent(value)` | Percentage | `12.50%` |
| `formatPercentage(value)` | Signed percentage | `+12.50%` |
| `formatNumber(value)` | Decimal number | `12.50` |
| `formatDate(date)` | Indian date format | `Jan 15, 2024` |
| `getChangeColor(value)` | Color class for change | `text-positive` |

## Component Patterns

### Loading State

```javascript
function MyComponent() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  if (loading) return <LoadingSpinner />;
  if (!data) return <div>No data available</div>;

  return <div>{/* Render data */}</div>;
}
```

### Error Handling

```javascript
function MyComponent() {
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      const response = await api.getData();
      // Handle response
    } catch (err) {
      setError(err.message);
    }
  };

  if (error) return <div className="text-red-500">{error}</div>;
}
```

### Tab Navigation

The stock detail page uses tab-based navigation:

```javascript
const tabs = [
  { id: 'quarterly', label: 'Quarterly', component: QuarterlyResults },
  { id: 'balance', label: 'Balance Sheet', component: BalanceSheet },
  // ...
];

const [activeTab, setActiveTab] = useState('quarterly');
const ActiveComponent = tabs.find(t => t.id === activeTab).component;
```

## Styling

- **Framework**: Tailwind CSS
- **Configuration**: `tailwind.config.js`
- **Global Styles**: `styles/globals.css`

### Custom Colors

```javascript
// tailwind.config.js
colors: {
  primary: { 500: '#3B82F6', 600: '#2563EB' },
  positive: '#10B981',
  negative: '#EF4444'
}
```

### Common Classes

```javascript
// Positive change
<span className="text-positive">+12.5%</span>

// Negative change
<span className="text-negative">-5.2%</span>

// Card styling
<div className="bg-white rounded-lg shadow p-4">

// Button
<button className="px-4 py-2 bg-primary-500 text-white rounded hover:bg-primary-600">
```

## Page Structure

### Stock Detail Page (`pages/stock/[symbol].js`)

```javascript
export default function StockPage() {
  const router = useRouter();
  const { symbol } = router.query;

  // Fetch stock data
  // Render StockHeader
  // Render tab navigation
  // Render active tab content
}
```

### Screener Page (`pages/screener.js`)

```javascript
export default function ScreenerPage() {
  // State for filters
  // FilterPanel component
  // ResultsTable component
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL (default: `http://localhost:5000/api`) |

## Adding New Components

### 1. Create the Component

```javascript
// frontend/components/NewComponent.js

/**
 * NewComponent - Description of what it does
 * @param {Object} props - Component props
 * @param {string} props.data - Data to display
 * @returns {JSX.Element}
 * 
 * @example
 * <NewComponent data="example" />
 */
export default function NewComponent({ data }) {
  return (
    <div className="p-4 bg-white rounded-lg shadow">
      {data}
    </div>
  );
}
```

### 2. Add Tests

```javascript
// frontend/components/__tests__/NewComponent.test.js
import { render, screen } from '@testing-library/react';
import NewComponent from '../NewComponent';

describe('NewComponent', () => {
  it('renders data correctly', () => {
    render(<NewComponent data="test" />);
    expect(screen.getByText('test')).toBeInTheDocument();
  });
});
```

### 3. Export (if needed)

```javascript
// frontend/components/index.js
export { default as NewComponent } from './NewComponent';
```

