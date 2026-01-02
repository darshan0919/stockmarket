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

          {/* Search Bar - Now global */}
          <div className="flex-1 max-w-2xl">
            <SearchBar placeholder="Search stocks by symbol or name..." />
          </div>

          {/* Navigation */}
          <nav className="flex items-center space-x-6 whitespace-nowrap">
            <Link href="/">
              <span
                className={`text-sm font-medium cursor-pointer hover:text-primary-600 transition-colors ${
                  isActive('/') ? 'text-primary-600' : 'text-gray-700'
                }`}
              >
                Dashboard
              </span>
            </Link>
            <Link href="/screener">
              <span
                className={`text-sm font-medium cursor-pointer hover:text-primary-600 transition-colors ${
                  isActive('/screener') ? 'text-primary-600' : 'text-gray-700'
                }`}
              >
                Screener
              </span>
            </Link>
            <Link href="/watchlist">
              <span
                className={`text-sm font-medium cursor-pointer hover:text-primary-600 transition-colors ${
                  isActive('/watchlist') ? 'text-primary-600' : 'text-gray-700'
                }`}
              >
                Watchlist
              </span>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
