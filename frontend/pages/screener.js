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

      <div>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="page-header">Stock Screener</h1>
            <p className="section-subtitle mt-1">
              Choose from fundamental filters to find your ideal stocks
            </p>
          </div>
          {results.length > 0 && (
            <button onClick={handleExportCSV} className="btn btn-sm btn-success gap-1.5">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Export CSV
            </button>
          )}
        </div>

        {error && (
          <div className="finance-card border-error/30 bg-error/5 p-4 mb-5">
            <span className="text-sm text-error">{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          <div className="lg:col-span-1">
            <FilterPanel onFilter={handleFilter} onClear={handleClear} />
          </div>
          <div className="lg:col-span-3">
            <ResultsTable results={results} loading={loading} />
          </div>
        </div>
      </div>
    </>
  );
}
