# Stock Screener Frontend

Next.js frontend for stock screening and analysis.

## Setup

### 1. Install Dependencies

From the **repository root**:

```bash
corepack enable
yarn install
```

### 2. Configure Environment

Create a `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### 3. Start Development Server

```bash
yarn workspace stock-screener-frontend dev
# Or from this directory:
yarn dev
```

Application will start on `http://localhost:3000`

## Available Scripts

- `yarn dev` — Start development server
- `yarn build` — Build for production
- `yarn start` — Start production server
- `yarn lint` — Run ESLint

## Pages

### Dashboard (`/`)
- Search bar with auto-complete
- Market snapshot (indices & sectors)
- Watchlist summary
- Quick screener templates

### Screener (`/screener`)
- Advanced filtering panel
- Results table with sorting
- CSV export functionality

### Stock Details (`/stock/[symbol]`)
- Company overview
- Fundamentals metrics
- Financial statements
- Price charts with indicators
- Technical analysis

### Watchlist (`/watchlist`)
- Track favorite stocks
- Real-time price updates
- Quick access to stock details

## Components

### Common
- `Header` - Navigation bar
- `SearchBar` - Auto-complete search
- `Table` - Reusable data table
- `Modal` - Popup dialogs
- `LoadingSpinner` - Loading indicator

### Dashboard
- `MarketSnapshot` - Indices overview
- `WatchlistSummary` - Top watchlist items

### Screener
- `FilterPanel` - All screening filters
- `ResultsTable` - Filtered stock results

### Stock
- `StockHeader` - Price & company info
- `FundamentalsTab` - Financial metrics
- `FinancialsTab` - Statements
- `ChartTab` - Price charts with Recharts
- `TechnicalTab` - Indicators

## Styling

Using Tailwind CSS with custom configuration:
- Primary color: Blue (#3b82f6)
- Responsive breakpoints: sm, md, lg, xl
- Custom utilities for positive/negative values

## API Integration

All API calls go through `lib/api.js`:
- Centralized axios instance
- Request/response interceptors
- Error handling

## State Management

Using React hooks:
- `useState` for local state
- `useEffect` for side effects
- Custom hooks in `lib/hooks/`:
  - `useWatchlist` - Watchlist management
  - `useMarket` - Market data

## Utilities

### Formatters (`lib/utils/formatters.js`)
- `formatCurrency` - Indian currency format
- `formatLargeNumber` - Cr, L, K suffixes
- `formatPercent` - Percentage display
- `formatDate` - Date formatting
- `getChangeColor` - Color based on value

## Performance

- Server-side rendering with Next.js
- Image optimization
- Code splitting
- Lazy loading for heavy components

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

