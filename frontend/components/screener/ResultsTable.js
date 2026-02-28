import { useRouter } from 'next/router';
import { formatLargeNumber, formatNumber } from '../../lib/utils/formatters';

/**
 * Screener results table displaying filtered stocks
 * @component
 */
export default function ResultsTable({ results, loading }) {
  const router = useRouter();

  if (loading) {
    return (
      <div className="finance-card">
        <div className="p-5">
          <h2 className="section-title mb-4">Results</h2>
          <div className="text-center py-12">
            <span className="loading loading-spinner loading-md text-secondary" />
            <p className="mt-3 text-sm text-base-content/50">Running screener...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="finance-card">
        <div className="p-5">
          <h2 className="section-title mb-4">Results</h2>
          <div className="text-center py-16">
            <svg className="mx-auto h-12 w-12 text-base-content/15 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <p className="text-sm text-base-content/50">No stocks found</p>
            <p className="text-xs text-base-content/30 mt-1">Adjust filters and run the screener</p>
          </div>
        </div>
      </div>
    );
  }

  const handleRowClick = (stock) => {
    router.push(`/stock/${stock.symbol}`);
  };

  return (
    <div className="finance-card">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Results</h2>
          <span className="text-xs text-base-content/50">
            {results.length} stock{results.length !== 1 ? 's' : ''} found
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="finance-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Sector</th>
                <th className="num">Market Cap</th>
                <th className="num">P/E</th>
                <th className="num">P/B</th>
                <th className="num">ROE %</th>
                <th className="num">ROCE %</th>
                <th className="num">D/E</th>
              </tr>
            </thead>
            <tbody>
              {results.map((stock) => (
                <tr
                  key={stock.id}
                  onClick={() => handleRowClick(stock)}
                  className="cursor-pointer"
                >
                  <td className="font-semibold text-secondary">{stock.symbol}</td>
                  <td className="text-base-content/80">{stock.name}</td>
                  <td>
                    <span className="finance-badge bg-base-200 text-base-content/60">
                      {stock.sector}
                    </span>
                  </td>
                  <td className="num">{formatLargeNumber(stock.market_cap)}</td>
                  <td className="num">{formatNumber(stock.pe_ratio)}</td>
                  <td className="num">{formatNumber(stock.pb_ratio)}</td>
                  <td className="num">{formatNumber(stock.roe)}</td>
                  <td className="num">{formatNumber(stock.roce)}</td>
                  <td className="num">{formatNumber(stock.debt_to_equity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
