import Head from 'next/head';
import { useRouter } from 'next/router';
import { useWatchlist } from '../lib/hooks/useWatchlist';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  formatCurrency,
  formatChange,
  formatNumber,
  getChangeColor,
} from '../lib/utils/formatters';

export default function Watchlist() {
  const { watchlist, loading, removeFromWatchlist, fetchWatchlist } = useWatchlist();
  const router = useRouter();

  const handleRemove = async (symbol) => {
    if (confirm(`Remove ${symbol} from watchlist?`)) {
      const result = await removeFromWatchlist(symbol);
      if (result.success) {
        fetchWatchlist();
      } else {
        alert(`Error: ${result.error}`);
      }
    }
  };

  const handleRowClick = (stock) => {
    router.push(`/stock/${stock.symbol}`);
  };

  if (loading) {
    return (
      <>
        <Head>
          <title>Watchlist - Stock Screener</title>
        </Head>
        <LoadingSpinner text="Loading watchlist..." />
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Watchlist - Stock Screener</title>
        <meta name="description" content="Your stock watchlist" />
      </Head>

      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">My Watchlist</h1>
          <button
            onClick={fetchWatchlist}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Refresh
          </button>
        </div>

        {watchlist.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <svg
              className="mx-auto h-16 w-16 text-gray-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Your watchlist is empty</h2>
            <p className="text-gray-600 mb-6">Start adding stocks to track them here</p>
            <button
              onClick={() => router.push('/screener')}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
            >
              Find Stocks
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="mb-4 text-sm text-gray-600">
              {watchlist.length} stock{watchlist.length !== 1 ? 's' : ''} in watchlist
            </div>

            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Sector</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">Change</th>
                    <th className="text-right">Change %</th>
                    <th className="text-right">P/E</th>
                    <th className="text-right">ROE %</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlist.map((stock) => (
                    <tr key={stock.symbol}>
                      <td
                        onClick={() => handleRowClick(stock)}
                        className="font-semibold text-primary-600 cursor-pointer hover:text-primary-700"
                      >
                        {stock.symbol}
                      </td>
                      <td onClick={() => handleRowClick(stock)} className="cursor-pointer">
                        {stock.name}
                      </td>
                      <td onClick={() => handleRowClick(stock)} className="cursor-pointer">
                        {stock.sector}
                      </td>
                      <td
                        onClick={() => handleRowClick(stock)}
                        className="text-right cursor-pointer"
                      >
                        {formatCurrency(stock.price)}
                      </td>
                      <td
                        onClick={() => handleRowClick(stock)}
                        className={`text-right cursor-pointer ${getChangeColor(stock.change)}`}
                      >
                        {formatChange(stock.change)}
                      </td>
                      <td
                        onClick={() => handleRowClick(stock)}
                        className={`text-right cursor-pointer ${getChangeColor(stock.change_percent)}`}
                      >
                        {formatChange(stock.change_percent)}%
                      </td>
                      <td
                        onClick={() => handleRowClick(stock)}
                        className="text-right cursor-pointer"
                      >
                        {formatNumber(stock.pe_ratio)}
                      </td>
                      <td
                        onClick={() => handleRowClick(stock)}
                        className="text-right cursor-pointer"
                      >
                        {formatNumber(stock.roe)}
                      </td>
                      <td className="text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(stock.symbol);
                          }}
                          className="px-3 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
