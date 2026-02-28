import Head from 'next/head';
import { useRouter } from 'next/router';
import MarketSnapshot from '../components/dashboard/MarketSnapshot';
import WatchlistSummary from '../components/dashboard/WatchlistSummary';
import UpcomingResults from '../components/dashboard/UpcomingResults';

/**
 * Dashboard page component
 * @component
 * @see {@link docs/frontend/README.md} for documentation
 */
export default function Dashboard() {
  const router = useRouter();

  const preBuiltScreeners = [
    {
      name: 'Value Stocks',
      description: 'Low P/E, low P/B with strong ROE',
      filters: { pe_max: 15, pb_max: 3, roe_min: 15 },
      icon: '💎',
    },
    {
      name: 'Growth Stocks',
      description: 'High revenue & profit growth',
      filters: { revenue_growth_3y_min: 15, profit_growth_3y_min: 15 },
      icon: '🚀',
    },
    {
      name: 'Dividend Stocks',
      description: 'High yield with reasonable valuations',
      filters: { dividend_yield_min: 2, pe_max: 20 },
      icon: '💰',
    },
    {
      name: 'Low Debt',
      description: 'Conservative balance sheets',
      filters: { debt_to_equity_max: 0.5, current_ratio_min: 1.5 },
      icon: '🛡️',
    },
    {
      name: 'Quality Stocks',
      description: 'High ROE & ROCE, manageable debt',
      filters: { roe_min: 15, roce_min: 15, debt_to_equity_max: 1 },
      icon: '⭐',
    },
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

      <div>
        {/* Page header */}
        <div className="mb-6">
          <h1 className="page-header">Dashboard</h1>
          <p className="section-subtitle mt-1">Indian stock market overview and analysis tools</p>
        </div>

        {/* Market + Watchlist row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">
          <div className="lg:col-span-3">
            <MarketSnapshot />
          </div>
          <div className="lg:col-span-2">
            <WatchlistSummary />
          </div>
        </div>

        {/* Upcoming Results */}
        <div className="mb-5">
          <UpcomingResults />
        </div>

        {/* Quick Screeners */}
        <div className="finance-card">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-title">Quick Screeners</h2>
                <p className="section-subtitle mt-0.5">
                  Pre-built templates to find stocks matching common strategies
                </p>
              </div>
              <button
                onClick={() => router.push('/screener')}
                className="btn btn-sm btn-secondary gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Custom Screener
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
              {preBuiltScreeners.map((screener, index) => (
                <button
                  key={index}
                  onClick={() => handleScreenerClick(screener)}
                  className="finance-card-hover text-left p-4 group"
                >
                  <div className="text-2xl mb-2">{screener.icon}</div>
                  <div className="text-sm font-semibold text-base-content group-hover:text-secondary transition-colors">
                    {screener.name}
                  </div>
                  <div className="text-xs text-base-content/50 mt-1">{screener.description}</div>
                  <div className="flex items-center gap-1 mt-2">
                    {Object.keys(screener.filters).map((key, i) => (
                      <span key={i} className="finance-badge bg-base-200 text-base-content/60">
                        {key
                          .replace(/_/g, ' ')
                          .replace(/min|max/g, '')
                          .trim()}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
          <button
            onClick={() => router.push('/screener')}
            className="finance-card-hover p-5 text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-secondary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold group-hover:text-secondary transition-colors">
                  Stock Screener
                </h3>
                <p className="text-xs text-base-content/50 mt-0.5">
                  Filter stocks with 300+ criteria
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => router.push('/watchlist')}
            className="finance-card-hover p-5 text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-success"
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
              </div>
              <div>
                <h3 className="text-sm font-semibold group-hover:text-success transition-colors">
                  Watchlist
                </h3>
                <p className="text-xs text-base-content/50 mt-0.5">Track your favorite stocks</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => router.push('/results')}
            className="finance-card-hover p-5 text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center flex-shrink-0">
                <svg
                  className="w-5 h-5 text-info"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold group-hover:text-info transition-colors">
                  Quarterly Results
                </h3>
                <p className="text-xs text-base-content/50 mt-0.5">Latest earnings & analysis</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}
