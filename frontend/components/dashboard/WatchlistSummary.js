import { useWatchlist } from '../../lib/hooks/useWatchlist';
import LoadingSpinner from '../common/LoadingSpinner';
import { formatCurrency, formatChange, getChangeColor } from '../../lib/utils/formatters';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function WatchlistSummary() {
  const { watchlist, loading } = useWatchlist();
  const router = useRouter();

  if (loading) return <LoadingSpinner size="sm" />;

  const displayWatchlist = watchlist.slice(0, 5);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Watchlist Summary</h2>
        <Link href="/watchlist">
          <span className="text-sm text-primary-600 hover:text-primary-700 cursor-pointer font-medium">
            View All →
          </span>
        </Link>
      </div>

      {displayWatchlist.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="mb-4">Your watchlist is empty</p>
          <Link href="/screener">
            <button className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
              Find Stocks
            </button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {displayWatchlist.map((stock) => (
            <div
              key={stock.symbol}
              onClick={() => router.push(`/stock/${stock.symbol}`)}
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <div>
                <div className="font-semibold text-gray-900">{stock.symbol}</div>
                <div className="text-sm text-gray-600">{stock.name}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-gray-900">
                  {formatCurrency(stock.price)}
                </div>
                <div className={`text-sm font-medium ${getChangeColor(stock.change_percent)}`}>
                  {formatChange(stock.change_percent, 2)}%
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

