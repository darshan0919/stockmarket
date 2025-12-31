import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Header() {
  const router = useRouter();

  const isActive = (path) => {
    return router.pathname === path;
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/">
            <div className="text-2xl font-bold text-primary-600 cursor-pointer">Stock Screener</div>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center space-x-6">
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
