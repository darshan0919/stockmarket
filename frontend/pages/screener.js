import Head from 'next/head';
import { useState } from 'react';
import FilterPanel from '../components/screener/FilterPanel';
import ResultsTable from '../components/screener/ResultsTable';
import { screenerAPI } from '../lib/api';

export default function Screener() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFilter = async (filters) => {
    try {
      setLoading(true);
      setError(null);
      const response = await screenerAPI.runScreener(filters);
      if (response.data.success) {
        setResults(response.data.data);
      }
    } catch (err) {
      setError(err.message);
      console.error('Screener error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setResults([]);
    setError(null);
  };

  const handleExportCSV = () => {
    if (results.length === 0) return;

    const headers = ['Symbol', 'Name', 'Sector', 'Market Cap', 'P/E', 'P/B', 'ROE', 'ROCE', 'D/E'];
    const csvRows = [headers.join(',')];

    results.forEach((stock) => {
      const row = [
        stock.symbol,
        `"${stock.name}"`,
        stock.sector,
        stock.market_cap,
        stock.pe_ratio || '',
        stock.pb_ratio || '',
        stock.roe || '',
        stock.roce || '',
        stock.debt_to_equity || '',
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screener-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <>
      <Head>
        <title>Stock Screener - Filter Stocks</title>
        <meta name="description" content="Screen stocks with custom filters" />
      </Head>

      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Stock Screener</h1>
          {results.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              Export CSV
            </button>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            Error: {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Filter Panel */}
          <div className="lg:col-span-1">
            <FilterPanel onFilter={handleFilter} onClear={handleClear} />
          </div>

          {/* Results */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Results</h2>
              <ResultsTable results={results} loading={loading} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
