/**
 * Top Gainers Page - Enriched table of NSE top gainers.
 * @page /gainers
 * @see {@link docs/frontend/pages/gainers.md} for documentation
 */

import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { marketAPI } from '../lib/api';
import TopGainersTable, { ColumnPicker, useColumnState } from '../components/gainers/TopGainersTable';
import { formatDate } from '../lib/utils/formatters';

const BUCKETS = [
  { value: 'allSec', label: 'All Securities' },
  { value: 'NIFTY', label: 'Nifty 50' },
  { value: 'NIFTYNEXT50', label: 'Nifty Next 50' },
  { value: 'BANKNIFTY', label: 'Bank Nifty' },
  { value: 'FOSec', label: 'F&O Securities' },
];

export default function Gainers() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ timestamp: null, bucket: 'allSec', count: 0 });
  const [bucket, setBucket] = useState('allSec');
  const [exchange, setExchange] = useState('nse');
  const { hiddenCols, toggleColumn } = useColumnState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchGainers = useCallback(async (selectedBucket, selectedExchange) => {
    try {
      setLoading(true);
      setError(null);
      const response = await marketAPI.getTopGainers({
        count: 25,
        bucket: selectedBucket,
        exchange: selectedExchange,
      });
      if (response.data.success) {
        const { rows: newRows, timestamp, bucket: resolvedBucket, count } = response.data.data;
        setRows(newRows);
        setMeta({ timestamp, bucket: resolvedBucket, count });
      } else {
        setError(response.data.error || 'Failed to fetch top gainers');
      }
    } catch (err) {
      console.error('Error fetching top gainers:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch top gainers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGainers(bucket, exchange);
  }, [bucket, exchange, fetchGainers]);

  return (
    <>
      <Head>
        <title>Top Gainers - Stock Screener</title>
        <meta
          name="description"
          content="Top gaining Indian stocks with volume, delivery, P/E and weekly change"
        />
      </Head>

      <div>
        {/* Page header */}
        <div className="mb-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="page-header">Top Gainers</h1>
              <p className="section-subtitle mt-1">
                NSE top gainers with delivery, valuation &amp; weekly momentum
                {meta.timestamp && (
                  <span className="ml-2 text-base-content/40">
                    · as of {formatDate(meta.timestamp)}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ColumnPicker hiddenCols={hiddenCols} toggleColumn={toggleColumn} />
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
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => fetchGainers(bucket, exchange)}
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
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Refresh
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="finance-card border-error/30 bg-error/5 p-4 mb-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-error">{error}</span>
              <button
                onClick={() => fetchGainers(bucket)}
                className="text-xs font-medium text-error hover:underline"
              >
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
            <TopGainersTable rows={rows} hiddenCols={hiddenCols} />
          )}
        </div>

        {!loading && rows.length > 0 && (
          <div className="mt-3 text-center text-xs text-base-content/30">
            Showing {meta.count} gainers · Del Value = traded value × delivery% · 1W = 5-session
            price change
          </div>
        )}
      </div>
    </>
  );
}

export { getServerSideProps } from '../lib/forceServerSide';
