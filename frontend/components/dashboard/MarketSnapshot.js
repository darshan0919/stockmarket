import { useMarket } from '../../lib/hooks/useMarket';
import LoadingSpinner from '../common/LoadingSpinner';
import { formatNumber, formatChange, getChangeColor } from '../../lib/utils/formatters';

/**
 * Market snapshot card showing index values and sector performance
 * @component
 */
export default function MarketSnapshot() {
  const { marketData, loading, error } = useMarket();

  if (loading) {
    return (
      <div className="finance-card p-5">
        <LoadingSpinner size="sm" text="Loading market data..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="finance-card p-5">
        <div className="text-error text-sm">Failed to load market data</div>
      </div>
    );
  }

  if (!marketData) return null;

  return (
    <div className="finance-card h-full">
      <div className="p-5">
        <h2 className="section-title mb-4">Market Snapshot</h2>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <IndexCard
            name="NIFTY 50"
            value={marketData.nifty50?.current}
            change={marketData.nifty50?.change}
            changePercent={marketData.nifty50?.change_percent}
          />
          <IndexCard
            name="SENSEX"
            value={marketData.sensex?.current}
            change={marketData.sensex?.change}
            changePercent={marketData.sensex?.change_percent}
          />
        </div>

        {marketData.sectors && Object.keys(marketData.sectors).length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">
              Sector Performance
            </h3>
            <div className="space-y-2">
              {Object.entries(marketData.sectors)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([sector, change]) => (
                  <div key={sector} className="flex items-center justify-between">
                    <span className="text-sm text-base-content/70">{sector}</span>
                    <span
                      className={`text-sm font-medium font-mono tabular-nums ${getChangeColor(change)}`}
                    >
                      {formatChange(change, 2)}%
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IndexCard({ name, value, change, changePercent }) {
  const isPositive = change >= 0;

  return (
    <div className="finance-stat">
      <div className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-1">
        {name}
      </div>
      <div className="text-xl font-bold font-mono tabular-nums text-base-content">
        {formatNumber(value, 2)}
      </div>
      <div className={`flex items-center gap-1.5 mt-1 ${getChangeColor(change)}`}>
        <svg
          className={`w-3.5 h-3.5 ${isPositive ? '' : 'rotate-180'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm font-medium font-mono tabular-nums">
          {formatChange(change, 2)}
        </span>
        <span className="text-xs font-mono tabular-nums">({formatChange(changePercent, 2)}%)</span>
      </div>
    </div>
  );
}
