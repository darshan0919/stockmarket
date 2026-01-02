# Header Component

> **Component**: `Header`  
> **File**: `frontend/components/common/Header.js`  
> **Last Updated**: 2025-01-02

## Overview

The `Header` component provides global navigation and stock search functionality across all pages of the application. It includes the application logo, integrated search bar, and navigation links.

## Features

- **Global Search Bar**: Integrated stock search available on all pages
- **Navigation Links**: Dashboard, Screener, Watchlist with active state highlighting
- **Responsive Layout**: Flexbox layout that adapts to content
- **Active Route Highlighting**: Uses Next.js router to highlight current page

## Usage

The Header is automatically included in all pages via the `_app.js` wrapper:

```javascript
// pages/_app.js
import Header from '../components/common/Header';

function MyApp({ Component, pageProps }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <Component {...pageProps} />
      </main>
    </div>
  );
}
```

## Component Structure

```javascript
<header>
  <Logo />           // Links to dashboard
  <SearchBar />      // Global stock search
  <Navigation />     // Main navigation links
</header>
```

## Props

The Header component does not accept any props.

## Search Bar Integration

The SearchBar component is integrated directly into the Header, providing:

- **Global Availability**: Accessible from all pages including stock detail pages
- **Autocomplete**: Real-time search results with highlighted matches
- **Keyboard Navigation**: Arrow keys, Enter, Escape support
- **Direct Navigation**: Clicking a result navigates to the stock detail page

See [SearchBar.md](./SearchBar.md) for detailed search functionality.

## Navigation

The Header includes three main navigation links:

| Link | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Main dashboard with market overview |
| Screener | `/screener` | Stock screening tools |
| Watchlist | `/watchlist` | User's watchlist |

Active routes are highlighted with the primary color (`text-primary-600`).

## Styling

The Header uses Tailwind CSS classes:

- **Container**: `container mx-auto px-4` - Responsive container
- **Layout**: `flex items-center justify-between` - Flexbox with space-between
- **Border**: `border-b border-gray-200` - Bottom border separator
- **Background**: `bg-white` - White background
- **Shadow**: `shadow-sm` - Subtle shadow

### Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  Logo          SearchBar (flex-1)         Navigation    │
└─────────────────────────────────────────────────────────┘
```

The SearchBar takes up the available space between the logo and navigation using `flex-1` with a `max-w-2xl` constraint.

## Responsive Design

The Header is responsive and adjusts to different screen sizes:

- **Desktop**: Full layout with all elements visible
- **Tablet**: SearchBar width adjusts
- **Mobile**: Navigation may need additional responsive handling (future enhancement)

## Testing

Tests are located in `frontend/components/common/__tests__/Header.test.js`:

```javascript
describe('Header', () => {
  it('renders the header with logo', () => {});
  it('renders navigation links', () => {});
  it('renders the search bar', () => {});
  it('highlights active navigation link', () => {});
  it('search bar is globally accessible', () => {});
});
```

Run tests:

```bash
cd frontend
npm test -- Header.test.js
```

## Code Example

```javascript
import Link from 'next/link';
import { useRouter } from 'next/router';
import SearchBar from './SearchBar';

/**
 * Header component with navigation and global search
 * @component
 * @see {@link docs/frontend/components/Header.md} for documentation
 */
export default function Header() {
  const router = useRouter();

  const isActive = (path) => {
    return router.pathname === path;
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-3 gap-6">
          {/* Logo */}
          <Link href="/">
            <div className="text-2xl font-bold text-primary-600 cursor-pointer whitespace-nowrap">
              Stock Screener
            </div>
          </Link>

          {/* Global Search Bar */}
          <div className="flex-1 max-w-2xl">
            <SearchBar placeholder="Search stocks by symbol or name..." />
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center space-x-6 whitespace-nowrap">
            {/* Navigation items */}
          </nav>
        </div>
      </div>
    </header>
  );
}
```

## Related Components

- [SearchBar](./SearchBar.md) - Stock search component integrated in header
- [_app.js](../../pages/_app.md) - App wrapper that includes the header

## Changelog

### 2025-01-02
- Added integrated SearchBar component to header for global search
- Updated layout to flex with search bar between logo and navigation
- Added JSDoc comments
- Created comprehensive documentation
- Added unit tests

### Previous
- Initial implementation with logo and navigation links

