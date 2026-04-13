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
import TranscriptTab from '../../components/stock/TranscriptTab';
import AnnouncementsTab from '../../components/stock/AnnouncementsTab';
import OrdersTab from '../../components/stock/OrdersTab';

/**
 * Stock detail route: loads quote and fundamentals from GET /api/stocks/:symbol.
 * @see {@link docs/frontend/README.md} for routing
 */
export default function StockDetails() {
  const router = useRouter();
  const { symbol } = router.query;

  const [stockData, setStockData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const fetchStockDetails = async () => {
      if (!router.isReady || !symbol) return;

      try {
        setLoading(true);
        setError(null);
        const response = await stockAPI.getDetails(symbol);
        if (response.data.success && response.data.data) {
          setStockData(response.data.data);
        } else {
          setError(response.data?.error || 'Failed to load stock details');
        }
      } catch (err) {
        setError(err.response?.data?.error || err.message);
        console.error('Error fetching stock details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStockDetails();
  }, [router.isReady, symbol]);

  if (!router.isReady || loading) {
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
      <div>
        <div className="finance-card p-8 text-center">
          <svg
            className="mx-auto h-12 w-12 text-error/40 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.27 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <h2 className="text-lg font-semibold mb-2">Error Loading Stock</h2>
          <p className="text-sm text-base-content/60 mb-4">{error}</p>
          <button onClick={() => router.push('/')} className="btn btn-sm btn-secondary">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!stockData) {
    return (
      <div>
        <div className="finance-card p-8 text-center">
          <h2 className="text-lg font-semibold mb-2">No stock data</h2>
          <p className="text-sm text-base-content/60 mb-4">
            The server returned an empty response.
          </p>
          <button onClick={() => router.push('/')} className="btn btn-sm btn-secondary">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const {
    basic_info,
    price_info,
    fundamentals,
    latest_financial,
    price_history_5y = [],
    nse_data,
  } = stockData;

  const latestPrice =
    price_info?.last_price ||
    price_info?.close ||
    (price_history_5y?.length > 0 ? price_history_5y[price_history_5y.length - 1].close : null);
  const change = price_info?.change || 0;
  const changePercent = price_info?.change_percent || 0;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'fundamentals', label: 'Fundamentals' },
    { id: 'financials', label: 'Financials' },
    { id: 'chart', label: 'Chart' },
    { id: 'technicals', label: 'Technicals' },
    { id: 'transcript', label: 'Transcripts' },
    { id: 'orders', label: 'Orders' },
    { id: 'announcements', label: 'Announcements' },
  ];

  return (
    <>
      <Head>
        <title>
          {basic_info.name} ({basic_info.symbol}) - Stock Details
        </title>
        <meta name="description" content={`Stock details for ${basic_info.name}`} />
      </Head>

      <div>
        <StockHeader
          stock={basic_info}
          latestPrice={latestPrice}
          change={change}
          changePercent={changePercent}
        />

        {/* Tabs */}
        <div className="finance-card mb-5">
          <div className="border-b border-base-300/60 overflow-x-auto">
            <div className="flex px-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-secondary text-secondary'
                      : 'border-transparent text-base-content/50 hover:text-base-content/80 hover:border-base-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-5">
            {activeTab === 'overview' && (
              <OverviewSection
                basicInfo={basic_info}
                priceInfo={price_info}
                fundamentals={fundamentals}
              />
            )}
            {activeTab === 'fundamentals' && <FundamentalsTab fundamentals={fundamentals} />}
            {activeTab === 'financials' && <FinancialsTab symbol={basic_info.symbol} />}
            {activeTab === 'chart' && <ChartTab priceHistory={price_history_5y} />}
            {activeTab === 'technicals' && <TechnicalTab symbol={basic_info.symbol} />}
            {activeTab === 'transcript' && <TranscriptTab symbol={basic_info.symbol} />}
            {activeTab === 'orders' && <OrdersTab symbol={basic_info.symbol} />}
            {activeTab === 'announcements' && <AnnouncementsTab symbol={basic_info.symbol} />}
          </div>
        </div>
      </div>
    </>
  );
}

function OverviewSection({ basicInfo, priceInfo, fundamentals }) {
  const quickRatios = [
    { label: 'P/E Ratio', value: fundamentals?.pe_ratio, format: 'number' },
    { label: 'P/B Ratio', value: fundamentals?.pb_ratio, format: 'number' },
    { label: 'ROE', value: fundamentals?.roe, format: 'percent' },
    { label: 'ROCE', value: fundamentals?.roce, format: 'percent' },
    { label: 'Debt/Equity', value: fundamentals?.debt_to_equity, format: 'number' },
    { label: 'Dividend Yield', value: fundamentals?.dividend_yield, format: 'percent' },
    { label: 'EPS', value: fundamentals?.eps, format: 'currency' },
    { label: 'Book Value', value: fundamentals?.book_value_per_share, format: 'currency' },
  ];

  const priceData = [
    { label: 'Day High', value: priceInfo?.day_high },
    { label: 'Day Low', value: priceInfo?.day_low },
    { label: '52W High', value: priceInfo?.week_high },
    { label: '52W Low', value: priceInfo?.week_low },
  ];

  const formatValue = (val, format) => {
    if (val === null || val === undefined) return '-';
    const num = parseFloat(val);
    if (isNaN(num)) return '-';
    if (format === 'percent') return `${num.toFixed(2)}%`;
    if (format === 'currency')
      return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
    return num.toFixed(2);
  };

  return (
    <div className="space-y-6">
      {/* Company Info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <InfoItem label="Company" value={basicInfo.name} />
        <InfoItem label="Symbol" value={basicInfo.symbol} />
        <InfoItem label="Sector" value={basicInfo.sector} />
        <InfoItem label="Industry" value={basicInfo.industry} />
      </div>

      {/* Quick Ratios - inspired by stockscans.in */}
      <div>
        <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">
          Quick Ratios
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {quickRatios.map((ratio, idx) => (
            <div key={idx} className="finance-stat text-center">
              <div className="text-2xs text-base-content/50 mb-1">{ratio.label}</div>
              <div className="text-sm font-bold font-mono tabular-nums text-base-content">
                {formatValue(ratio.value, ratio.format)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Price Information */}
      <div>
        <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">
          Price Information
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {priceData.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center finance-stat">
              <span className="text-xs text-base-content/50">{item.label}</span>
              <span className="text-sm font-semibold font-mono tabular-nums">
                {item.value ? `₹${parseFloat(item.value).toLocaleString('en-IN')}` : '-'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }) {
  return (
    <div>
      <div className="text-2xs text-base-content/40 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-medium text-base-content mt-0.5">{value || '-'}</div>
    </div>
  );
}
