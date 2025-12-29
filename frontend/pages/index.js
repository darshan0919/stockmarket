import Head from 'next/head';
import { useRouter } from 'next/router';
import SearchBar from '../components/common/SearchBar';
import MarketSnapshot from '../components/dashboard/MarketSnapshot';
import WatchlistSummary from '../components/dashboard/WatchlistSummary';
import UpcomingResults from '../components/dashboard/UpcomingResults';

export default function Dashboard() {
  const router = useRouter();

  const preBuiltScreeners = [
    { name: 'Value Stocks', filters: { pe_max: 15, pb_max: 3, roe_min: 15 } },
    { name: 'Growth Stocks', filters: { revenue_growth_3y_min: 15, profit_growth_3y_min: 15 } },
    { name: 'Dividend Stocks', filters: { dividend_yield_min: 2, pe_max: 20 } },
    { name: 'Low Debt', filters: { debt_to_equity_max: 0.5, current_ratio_min: 1.5 } },
    { name: 'Quality Stocks', filters: { roe_min: 15, roce_min: 15, debt_to_equity_max: 1 } },
  ];

  const handleScreenerClick = (screener) => {
    router.push({
      pathname: '/screener',
      query: { preset: screener.name.toLowerCase().replace(' ', '-') },
    });
  };

  return (
    <>
      <Head>
        <title>Stock Screener - Dashboard</title>
        <meta name="description" content="Stock Screener Dashboard for Indian Stocks" />
      </Head>

      <div className="max-w-7xl mx-auto">
        {/* Search Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Stock Screener Dashboard</h1>
          <div className="max-w-2xl">
            <SearchBar placeholder="Search stocks by symbol or name..." />
          </div>
        </div>

        {/* Market Snapshot & Watchlist */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <MarketSnapshot />
          <WatchlistSummary />
        </div>

        {/* Upcoming Results - Full Width */}
        <div className="mb-8">
          <UpcomingResults />
        </div>

        {/* Pre-built Screeners */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Screeners</h2>
          <p className="text-gray-600 mb-4">
            Start with pre-built screener templates to find stocks matching common criteria
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {preBuiltScreeners.map((screener, index) => (
              <button
                key={index}
                onClick={() => handleScreenerClick(screener)}
                className="p-4 border-2 border-gray-200 rounded-lg hover:border-primary-500 hover:bg-primary-50 transition-all text-left"
              >
                <div className="font-semibold text-gray-900 mb-1">{screener.name}</div>
                <div className="text-sm text-gray-600">
                  {Object.keys(screener.filters).length} filters applied
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6">
            <button
              onClick={() => router.push('/screener')}
              className="w-full sm:w-auto px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
            >
              Custom Screener →
            </button>
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div
            onClick={() => router.push('/screener')}
            className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-6 text-white cursor-pointer hover:from-blue-600 hover:to-blue-700 transition-all"
          >
            <h3 className="text-lg font-semibold mb-2">Stock Screener</h3>
            <p className="text-sm opacity-90">Filter stocks with custom criteria</p>
          </div>
          <div
            onClick={() => router.push('/watchlist')}
            className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-6 text-white cursor-pointer hover:from-green-600 hover:to-green-700 transition-all"
          >
            <h3 className="text-lg font-semibold mb-2">Watchlist</h3>
            <p className="text-sm opacity-90">Track your favorite stocks</p>
          </div>
          <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-6 text-white">
            <h3 className="text-lg font-semibold mb-2">Market Analysis</h3>
            <p className="text-sm opacity-90">View market trends and insights</p>
          </div>
        </div>
      </div>
    </>
  );
}

