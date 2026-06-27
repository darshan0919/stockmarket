import Head from 'next/head';
import { useState, useEffect, useCallback, useRef } from 'react';
import { marketAPI } from '../lib/api';
import StockTable, { ColumnPicker, useColumnState } from '../components/shared/StockTable';
import { formatDate } from '../lib/utils/formatters';

const BUCKETS = [
  { value: 'allSec', label: 'All Securities' },
  { value: 'NIFTY', label: 'Nifty 50' },
  { value: 'NIFTYNEXT50', label: 'Nifty Next 50' },
  { value: 'BANKNIFTY', label: 'Bank Nifty' },
  { value: 'FOSec', label: 'F&O Securities' },
];

const AUTO_REFRESH_MS = 30_000;

export default function Gainers() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ timestamp: null, bucket: 'allSec', count: 0 });
  const [bucket, setBucket] = useState('allSec');
  const [exchange, setExchange] = useState('nse');
  const { hiddenCols, toggleColumn } = useColumnState();
  const [orderBook, setOrderBook] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [sellOffersOnly, setSellOffersOnly] = useState(false);
  const [buyBidsOnly, setBuyBidsOnly] = useState(false);

  const intervalRef = useRef(null);
  const inFlightRef = useRef(false);

  const fetchGainers = useCallback(async (selectedBucket, selectedExchange, selectedOrderBook) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setLoading(true);
      setError(null);
      const response = await marketAPI.getTopGainers({
        count: 25,
        bucket: selectedBucket,
        exchange: selectedExchange,
        orderBook: selectedOrderBook,
      });
      if (response.data.success) {
        const { rows: newRows, timestamp, bucket: resolvedBucket, count } = response.data.data;
        setRows(newRows);
        setMeta({ timestamp, bucket: resolvedBucket, count });
        setLastUpdated(new Date());
      } else {
        setError(response.data.error || 'Failed to fetch top gainers');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch top gainers');
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchGainers(bucket, exchange, orderBook);
  }, [bucket, exchange, orderBook, fetchGainers]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      fetchGainers(bucket, exchange, orderBook);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [bucket, exchange, fetchGainers]);

  const displayedCount = sellOffersOnly
    ? rows.filter((r) => r.offerLevels != null && r.offerLevels > 0).length
    : buyBidsOnly
    ? rows.filter((r) => r.bidLevels != null && r.bidLevels > 0).length
    : rows.length;

  return (
    <>
      <Head>
        <title>Top Gainers - Stock Screener</title>
        <meta name="description" content="Top gaining Indian stocks with volume, delivery, P/E and weekly change" />
      </Head>

      <div>
        <div className="mb-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="page-header">Top Gainers</h1>
              <p className="section-subtitle mt-1">
                NSE top gainers · {displayedCount} stocks
                {lastUpdated && (
                  <span className="ml-2 text-base-content/40">
                    · updated {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Buy bids toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="toggle toggle-sm toggle-success"
                  checked={buyBidsOnly}
                  onChange={(e) => {
                    setBuyBidsOnly(e.target.checked);
                    if (e.target.checked) setSellOffersOnly(false);
                  }}
                />
                <span className="text-sm text-base-content/70">Buy bids only</span>
              </label>

              {/* Sell offers toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="toggle toggle-sm toggle-error"
                  checked={sellOffersOnly}
                  onChange={(e) => {
                    setSellOffersOnly(e.target.checked);
                    if (e.target.checked) setBuyBidsOnly(false);
                  }}
                />
                <span className="text-sm text-base-content/70">Sell offers only</span>
              </label>

              <ColumnPicker hiddenCols={hiddenCols} toggleColumn={toggleColumn} />
              <button
                onClick={() => setOrderBook((v) => !v)}
                className={`btn btn-sm gap-1.5 ${orderBook ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
              >
                Bids &amp; Offers
              </button>

              {/* Exchange toggle */}
              <div className="join">
                {['nse', 'bse'].map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setExchange(ex)}
                    disabled={loading}
                    className={`join-item btn btn-sm ${exchange === ex ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
                  >
                    {ex.toUpperCase()}
                  </button>
                ))}
              </div>

              <select
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                disabled={loading}
                className="select select-sm select-bordered"
                aria-label="Gainers universe"
              >
                {BUCKETS.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>

              <button
                onClick={() => fetchGainers(bucket, exchange, orderBook)}
                disabled={loading}
                className="btn btn-sm btn-secondary btn-outline gap-1.5"
              >
                {loading ? (
                  <>
                    <span className="loading loading-spinner loading-xs" />
                    Loading...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Auto-refresh indicator */}
        {!loading && rows.length > 0 && (
          <div className="mb-3 flex items-center gap-1.5 text-xs text-base-content/30">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Auto-refreshes every 30s
          </div>
        )}

        {error && (
          <div className="finance-card border-error/30 bg-error/5 p-4 mb-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-error">{error}</span>
              <button onClick={() => fetchGainers(bucket, exchange, orderBook)} className="text-xs font-medium text-error hover:underline">
                Try again
              </button>
            </div>
          </div>
        )}

        <div className="finance-card">
          {loading && rows.length === 0 ? (
            <div className="p-4 space-y-2">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-10 bg-base-300/40 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <StockTable
              rows={rows}
              hiddenCols={hiddenCols}
              sellOffersOnly={sellOffersOnly}
              buyBidsOnly={buyBidsOnly}
              emptyMessage="No gainers available right now"
            />
          )}
        </div>

        {!loading && rows.length > 0 && (
          <div className="mt-3 text-center text-xs text-base-content/30">
            Del Value = traded value × delivery% · 1W = 5-session price change · Bids/Offers from live NSE order book
          </div>
        )}
      </div>
    </>
  );
}

export { getServerSideProps } from '../lib/forceServerSide';
