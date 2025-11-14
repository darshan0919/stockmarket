import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { stockAPI } from '../../lib/api';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import StockHeader from '../../components/stock/StockHeader';
import FundamentalsTab from '../../components/stock/FundamentalsTab';
import FinancialsTab from '../../components/stock/FinancialsTab';
import ChartTab from '../../components/stock/ChartTab';
import TechnicalTab from '../../components/stock/TechnicalTab';

export default function StockDetails() {
  const router = useRouter();
  const { symbol } = router.query;

  const [stockData, setStockData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchStockDetails = async () => {
      if (!symbol) return;

      try {
        setLoading(true);
        setError(null);
        const response = await stockAPI.getDetails(symbol);
        if (response.data.success) {
          setStockData(response.data.data);
        }
      } catch (err) {
        setError(err.response?.data?.error || err.message);
        console.error('Error fetching stock details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStockDetails();
  }, [symbol]);

  if (loading) {
    return (
      <>
        <Head>
          <title>Loading Stock Details...</title>
        </Head>
        <LoadingSpinner text="Loading stock details..." />
      </>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-xl font-semibold text-red-900 mb-2">Error Loading Stock</h2>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!stockData) return null;

  const { basic_info, fundamentals, latest_financial, price_history_5y } = stockData;

  // Calculate latest price and change
  const latestPrice = price_history_5y.length > 0 ? price_history_5y[price_history_5y.length - 1].close : null;
  const prevPrice = price_history_5y.length > 1 ? price_history_5y[price_history_5y.length - 2].close : null;
  const change = latestPrice && prevPrice ? latestPrice - prevPrice : 0;
  const changePercent = prevPrice && prevPrice !== 0 ? (change / prevPrice) * 100 : 0;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'fundamentals', label: 'Fundamentals' },
    { id: 'financials', label: 'Financials' },
    { id: 'chart', label: 'Chart' },
    { id: 'technicals', label: 'Technicals' },
  ];

  return (
    <>
      <Head>
        <title>{basic_info.name} ({basic_info.symbol}) - Stock Details</title>
        <meta name="description" content={`Stock details for ${basic_info.name}`} />
      </Head>

      <div className="max-w-7xl mx-auto">
        {/* Stock Header */}
        <StockHeader
          stock={basic_info}
          latestPrice={latestPrice}
          change={change}
          changePercent={changePercent}
        />

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6" aria-label="Tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'overview' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Company Overview</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div>
                      <span className="text-sm text-gray-600">Company Name:</span>
                      <p className="text-base font-semibold text-gray-900">{basic_info.name}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Symbol:</span>
                      <p className="text-base font-semibold text-gray-900">{basic_info.symbol}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Sector:</span>
                      <p className="text-base font-semibold text-gray-900">{basic_info.sector}</p>
                    </div>
                    <div>
                      <span className="text-sm text-gray-600">Industry:</span>
                      <p className="text-base font-semibold text-gray-900">{basic_info.industry}</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Key Metrics Snapshot</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">P/E Ratio:</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {fundamentals.pe_ratio || 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">ROE:</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {fundamentals.roe ? `${fundamentals.roe.toFixed(2)}%` : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Debt/Equity:</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {fundamentals.debt_to_equity || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'fundamentals' && <FundamentalsTab fundamentals={fundamentals} />}

            {activeTab === 'financials' && <FinancialsTab symbol={basic_info.symbol} />}

            {activeTab === 'chart' && <ChartTab priceHistory={price_history_5y} />}

            {activeTab === 'technicals' && <TechnicalTab symbol={basic_info.symbol} />}
          </div>
        </div>
      </div>
    </>
  );
}

