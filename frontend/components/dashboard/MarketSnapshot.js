import { useMarket } from '../../lib/hooks/useMarket';
import LoadingSpinner from '../common/LoadingSpinner';
import { formatNumber, formatChange, getChangeColor } from '../../lib/utils/formatters';

export default function MarketSnapshot() {
  const { marketData, loading, error } = useMarket();

  if (loading) return <LoadingSpinner size="sm" />;
  if (error) return <div className="text-red-600">Error loading market data</div>;
  if (!marketData) return null;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Market Snapshot</h2>

      {/* Indices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Nifty 50 */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">NIFTY 50</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatNumber(marketData.nifty50?.current, 2)}
          </div>
          <div className={`text-sm font-medium ${getChangeColor(marketData.nifty50?.change)}`}>
            {formatChange(marketData.nifty50?.change, 2)} (
            {formatChange(marketData.nifty50?.change_percent, 2)}%)
          </div>
        </div>

        {/* Sensex */}
        <div className="border border-gray-200 rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">SENSEX</div>
          <div className="text-2xl font-bold text-gray-900">
            {formatNumber(marketData.sensex?.current, 2)}
          </div>
          <div className={`text-sm font-medium ${getChangeColor(marketData.sensex?.change)}`}>
            {formatChange(marketData.sensex?.change, 2)} (
            {formatChange(marketData.sensex?.change_percent, 2)}%)
          </div>
        </div>
      </div>

      {/* Sector Performance */}
      {marketData.sectors && Object.keys(marketData.sectors).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Sector Performance</h3>
          <div className="space-y-2">
            {Object.entries(marketData.sectors)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([sector, change]) => (
                <div key={sector} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{sector}</span>
                  <span className={`text-sm font-medium ${getChangeColor(change)}`}>
                    {formatChange(change, 2)}%
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

