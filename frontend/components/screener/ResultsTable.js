import { useRouter } from 'next/router';
import { formatLargeNumber, formatNumber } from '../../lib/utils/formatters';

export default function ResultsTable({ results, loading }) {
  const router = useRouter();

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="spinner mx-auto"></div>
        <p className="mt-4 text-gray-600">Running screener...</p>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <svg
          className="mx-auto h-12 w-12 text-gray-400 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p>No stocks found matching your criteria</p>
        <p className="text-sm mt-2">Try adjusting your filters</p>
      </div>
    );
  }

  const handleRowClick = (stock) => {
    router.push(`/stock/${stock.symbol}`);
  };

  return (
    <div>
      <div className="mb-4 text-sm text-gray-600">
        Found {results.length} stock{results.length !== 1 ? 's' : ''}
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Name</th>
              <th>Sector</th>
              <th className="text-right">Market Cap</th>
              <th className="text-right">P/E</th>
              <th className="text-right">P/B</th>
              <th className="text-right">ROE %</th>
              <th className="text-right">ROCE %</th>
              <th className="text-right">D/E</th>
            </tr>
          </thead>
          <tbody>
            {results.map((stock) => (
              <tr key={stock.id} onClick={() => handleRowClick(stock)}>
                <td className="font-semibold text-primary-600">{stock.symbol}</td>
                <td>{stock.name}</td>
                <td>{stock.sector}</td>
                <td className="text-right">{formatLargeNumber(stock.market_cap)}</td>
                <td className="text-right">{formatNumber(stock.pe_ratio)}</td>
                <td className="text-right">{formatNumber(stock.pb_ratio)}</td>
                <td className="text-right">{formatNumber(stock.roe)}</td>
                <td className="text-right">{formatNumber(stock.roce)}</td>
                <td className="text-right">{formatNumber(stock.debt_to_equity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
