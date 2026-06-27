import Head from 'next/head';
import { useState, useEffect, useCallback, useRef } from 'react';
import { screenerAPI } from '../lib/api';
import ScanList from '../components/screener/ScanList';
import StockTable, { ColumnPicker, useColumnState } from '../components/shared/StockTable';

const AUTO_REFRESH_MS = 30_000;

export default function Screener() {
  const [scans, setScans] = useState([]);
  const [scansLoading, setScansLoading] = useState(true);
  const [scansError, setScansError] = useState(null);

  const [selectedScan, setSelectedScan] = useState(null);
  const [rows, setRows] = useState([]);
  const [scanName, setScanName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [sellOffersOnly, setSellOffersOnly] = useState(false);
  const [buyBidsOnly, setBuyBidsOnly] = useState(false);

  const { hiddenCols, toggleColumn } = useColumnState();

  const intervalRef = useRef(null);
  const inFlightRef = useRef(false);

  // Load saved scans once on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await screenerAPI.getSavedScans();
        if (res.data.success) setScans(res.data.data);
        else setScansError('Failed to load saved scans');
      } catch (err) {
        setScansError(err.response?.data?.error || err.message || 'Failed to load saved scans');
      } finally {
        setScansLoading(false);
      }
    })();
  }, []);

  const runScan = useCallback(async (scan) => {
    if (!scan) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await screenerAPI.runScan(scan.scan || scan);
      if (res.data.success) {
        const { rows: newRows, scanName: name } = res.data.data;
        setRows(newRows);
        setScanName(name);
        setLastUpdated(new Date());
      } else {
        setError(res.data.error || 'Scan failed');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Scan failed');
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  // Auto-refresh every 30s while a scan is selected
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!selectedScan) return;
    intervalRef.current = setInterval(() => runScan(selectedScan), AUTO_REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [selectedScan, runScan]);

  const handleSelectScan = (scanItem) => {
    setSelectedScan(scanItem);
    setRows([]);
    setScanName('');
    setError(null);
    runScan(scanItem);
  };

  const handleExportCSV = () => {
    if (rows.length === 0) return;
    const headers = ['Symbol', 'Price', '%Change', 'Volume', 'Value(Cr)', 'Del%', 'Del%(30D)', 'P/E', 'MCap(Cr)', 'Retail%', 'PAT Growth TTM', '1W Change', 'Bids', 'Offers'];
    const csvRows = [headers.join(',')];
    rows.forEach((row) => {
      csvRows.push([
        row.symbol,
        row.price ?? '',
        row.changePercent ?? '',
        row.volume ?? '',
        row.value != null ? (row.value / 1e7).toFixed(2) : '',
        row.deliveryPercent ?? '',
        row.avgDeliveryPercent30d ?? '',
        row.pe ?? '',
        row.marketCapCr ?? '',
        row.retailHoldingPercent ?? '',
        row.patGrowthTtm ?? '',
        row.weekChangePercent ?? '',
        row.bidLevels ?? '',
        row.offerLevels ?? '',
      ].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scanName || 'scan'}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const displayedCount = sellOffersOnly
    ? rows.filter((r) => r.offerLevels != null && r.offerLevels > 0).length
    : buyBidsOnly
    ? rows.filter((r) => r.bidLevels != null && r.bidLevels > 0).length
    : rows.length;

  return (
    <>
      <Head>
        <title>Screener - Saved Scans</title>
        <meta name="description" content="Run your saved StockScans scans with live price and order data" />
      </Head>

      <div>
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="page-header">Screener</h1>
              <p className="section-subtitle mt-1">
                {scanName
                  ? `${scanName} · ${displayedCount} stocks`
                  : 'Select a scan from the left'}
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

              {rows.length > 0 && (
                <ColumnPicker hiddenCols={hiddenCols} toggleColumn={toggleColumn} />
              )}

              {rows.length > 0 && (
                <button onClick={handleExportCSV} className="btn btn-sm btn-success gap-1.5">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export CSV
                </button>
              )}

              <button
                onClick={() => selectedScan && runScan(selectedScan)}
                disabled={!selectedScan || loading}
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
        {selectedScan && !loading && (
          <div className="mb-3 flex items-center gap-1.5 text-xs text-base-content/30">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Auto-refreshes every 30s
          </div>
        )}

        {error && (
          <div className="finance-card border-error/30 bg-error/5 p-4 mb-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-error">{error}</span>
              <button
                onClick={() => selectedScan && runScan(selectedScan)}
                className="text-xs font-medium text-error hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          {/* Scan picker */}
          <div className="lg:col-span-1">
            <ScanList
              scans={scans}
              selectedScanId={selectedScan?.scanId}
              onSelect={handleSelectScan}
              loading={scansLoading}
            />
            {scansError && <p className="mt-2 text-xs text-error">{scansError}</p>}
          </div>

          {/* Results */}
          <div className="lg:col-span-3">
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
                  emptyMessage="Select a scan to run it"
                />
              )}
            </div>

            {!loading && rows.length > 0 && (
              <div className="mt-3 text-center text-xs text-base-content/30">
                Del Value = traded value × delivery% · 1W = 5-session price change · Bids/Offers from live NSE order book
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export { getServerSideProps } from '../lib/forceServerSide';
