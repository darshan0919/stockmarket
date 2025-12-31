import {
  formatCurrency,
  formatChange,
  formatLargeNumber,
  getChangeColor,
} from '../../lib/utils/formatters';
import { useWatchlist } from '../../lib/hooks/useWatchlist';

export default function StockHeader({ stock, latestPrice, change, changePercent }) {
  const { isInWatchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const inWatchlist = isInWatchlist(stock.symbol);

  const handleWatchlistToggle = async () => {
    if (inWatchlist) {
      const result = await removeFromWatchlist(stock.symbol);
      if (!result.success) alert(`Error: ${result.error}`);
    } else {
      const result = await addToWatchlist(stock.symbol);
      if (!result.success) alert(`Error: ${result.error}`);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">{stock.name}</h1>
          <div className="flex items-center space-x-3">
            <span className="text-lg text-gray-600">{stock.symbol}</span>
            <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
              {stock.sector}
            </span>
            <span className="text-sm text-gray-500">{stock.industry}</span>
          </div>
        </div>
        <button
          onClick={handleWatchlistToggle}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            inWatchlist
              ? 'bg-red-50 text-red-600 hover:bg-red-100'
              : 'bg-primary-50 text-primary-600 hover:bg-primary-100'
          }`}
        >
          {inWatchlist ? '★ Remove from Watchlist' : '☆ Add to Watchlist'}
        </button>
      </div>

      {/* Price Info */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <div className="text-sm text-gray-600 mb-1">Current Price</div>
          <div className="text-2xl font-bold text-gray-900">{formatCurrency(latestPrice)}</div>
          <div className={`text-sm font-medium ${getChangeColor(changePercent)}`}>
            {formatChange(change)} ({formatChange(changePercent)}%)
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-600 mb-1">Market Cap</div>
          <div className="text-xl font-semibold text-gray-900">
            {formatLargeNumber(stock.market_cap)}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-600 mb-1">Sector</div>
          <div className="text-xl font-semibold text-gray-900">{stock.sector}</div>
        </div>
        <div>
          <div className="text-sm text-gray-600 mb-1">Industry</div>
          <div className="text-xl font-semibold text-gray-900">{stock.industry}</div>
        </div>
      </div>
    </div>
  );
}
