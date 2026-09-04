/**
 * Main Orders tab component.
 * Manages state, order announcements, and quarterly downloads.
 * @module components/stock/orders/OrdersTab
 * @see {@link docs/API_REFERENCE.md#orders-apis} for Orders API docs
 */

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { ordersAPI } from '../../../../core/lib/api';
import { useSnackbar } from '../../../../core/lib/contexts/SnackbarContext';
import LoadingSpinner from '../../../../core/components/common/LoadingSpinner';
import { formatDuration, getUnannouncedQuarter } from './orderUtils';
import OrderAnnouncements from './OrderAnnouncements';
import QuarterView from './QuarterView';

/**
 * Orders tab with Announcements and Quarters views.
 * @param {Object} props
 * @param {string} props.symbol - Stock symbol
 */
export default function OrdersTab({ symbol }) {
  const { showSnackbar } = useSnackbar();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');

  const [baselineDocumentUrl, setBaselineDocumentUrl] = useState(null);
  const [baselineDocumentTitle, setBaselineDocumentTitle] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [clientFetchTime, setClientFetchTime] = useState(null);

  const [latestTranscript, setLatestTranscript] = useState(null);
  const [unannouncedQuarterInfo, setUnannouncedQuarterInfo] = useState(null);

  const [quartersData, setQuartersData] = useState([]);
  const [quartersLoading, setQuartersLoading] = useState(false);
  const [downloadingQuarter, setDownloadingQuarter] = useState(null);

  const processTranscriptData = (transcriptData) => {
    if (!transcriptData) return null;

    try {
      setLatestTranscript(transcriptData);
      const transcriptDateStr = transcriptData.announcement_date;
      if (transcriptDateStr) {
        const transcriptDate = new Date(transcriptDateStr);
        const quarterInfo = getUnannouncedQuarter(transcriptDate);
        setUnannouncedQuarterInfo(quarterInfo);
        return { transcript: transcriptData, quarterInfo };
      }
    } catch (err) {
      console.error('Error processing transcript:', err);
    }
    return null;
  };

  const fetchQuartersData = async () => {
    if (!symbol) return;

    try {
      setQuartersLoading(true);
      const response = await ordersAPI.getQuarters(symbol);
      if (response.data.success) {
        setQuartersData(response.data.data.quarters || []);
      }
    } catch (err) {
      console.error('Error fetching quarters data:', err);
    } finally {
      setQuartersLoading(false);
    }
  };

  const filterOrdersByQuarter = (allOrders, quarterInfo) => {
    if (!quarterInfo?.startDate) return allOrders;
    return allOrders.filter((order) => {
      const orderDate = new Date(order.announcement_date);
      return orderDate >= quarterInfo.startDate;
    });
  };

  const fetchData = async () => {
    if (!symbol) return;

    const fetchStartTime = Date.now();

    try {
      setLoading(true);
      setError(null);
      setClientFetchTime(null);
      setBaselineDocumentUrl(null);
      setBaselineDocumentTitle(null);

      const response = await ordersAPI.getNonAI(symbol, 100);
      const clientTime = Date.now() - fetchStartTime;
      setClientFetchTime(clientTime);

      if (response.data.success) {
        let fetchedOrders = response.data.data.orders || [];
        let quarterInfo = unannouncedQuarterInfo;

        if (response.data.data.latest_transcript) {
          const transcriptResult = processTranscriptData(response.data.data.latest_transcript);
          if (transcriptResult?.quarterInfo) {
            quarterInfo = transcriptResult.quarterInfo;
          }
        }

        if (response.data.data.baseline_document_url) {
          setBaselineDocumentUrl(response.data.data.baseline_document_url);
          setBaselineDocumentTitle(
            response.data.data.baseline_document_title || 'Baseline Document'
          );
        }

        if (quarterInfo) {
          fetchedOrders = filterOrdersByQuarter(fetchedOrders, quarterInfo);
        }

        setOrders(fetchedOrders);
      } else {
        setError(response.data.error || 'Failed to fetch data');
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Unable to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchQuartersData();
  }, [symbol]);

  const handleStockScansClick = () => {
    if (symbol) {
      const exchangeSymbol = `NSE%3A${encodeURIComponent(symbol)}`;
      const stockScansUrl = `https://www.stockscans.in/company/${exchangeSymbol}/standalone#reports`;
      window.open(stockScansUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleScreenerClick = () => {
    if (symbol) {
      const screenerUrl = `https://www.screener.in/company/${encodeURIComponent(symbol)}/#documents`;
      window.open(screenerUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const sortedOrders = useMemo(() => {
    const sorted = [...orders];
    sorted.sort((a, b) => {
      if (sortBy === 'date') {
        const dateA = new Date(a.announcement_date || 0);
        const dateB = new Date(b.announcement_date || 0);
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      } else if (sortBy === 'amount') {
        const amountA = a.order_details?.order_value?.value_in_crore_inr || 0;
        const amountB = b.order_details?.order_value?.value_in_crore_inr || 0;
        return sortOrder === 'desc' ? amountB - amountA : amountA - amountB;
      }
      return 0;
    });
    return sorted;
  }, [orders, sortBy, sortOrder]);

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const handleCopyJSON = async () => {
    try {
      const jsonData = JSON.stringify(sortedOrders, null, 2);
      await navigator.clipboard.writeText(jsonData);
      setCopySuccess(true);
      showSnackbar('JSON copied to clipboard!', 'success');
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      showSnackbar('Failed to copy JSON', 'error');
    }
  };

  const handleDownloadAll = async () => {
    try {
      setDownloading(true);
      setDownloadProgress({ current: 0, total: sortedOrders.length + (latestTranscript ? 1 : 0) });
      showSnackbar('Starting download... Please wait', 'info');

      const transcriptUrl = latestTranscript?.attachment_url || null;
      const transcriptDate = latestTranscript?.announcement_date || null;
      const quarterStartDate = unannouncedQuarterInfo?.startDate?.toISOString() || null;

      const response = await ordersAPI.downloadDirect(
        symbol,
        sortedOrders.length,
        transcriptUrl,
        quarterStartDate,
        transcriptDate
      );

      if (response.data.success) {
        const { folder_path, downloaded } = response.data.data;
        setDownloadProgress({
          current: downloaded,
          total: sortedOrders.length + (latestTranscript ? 1 : 0),
        });
        showSnackbar(
          `Downloaded ${downloaded} PDF${downloaded !== 1 ? 's' : ''} to ${folder_path}`,
          'success',
          5000
        );
      } else {
        throw new Error('Download failed');
      }
    } catch (err) {
      console.error('Failed to download PDFs:', err);
      showSnackbar('Download failed. Please try again.', 'error', 4000);
    } finally {
      setDownloading(false);
      setTimeout(() => setDownloadProgress({ current: 0, total: 0 }), 1000);
    }
  };

  const handleDownloadQuarter = async (quarter) => {
    try {
      setDownloadingQuarter(quarter.periodLabel);
      showSnackbar(`Starting download for ${quarter.periodLabel}...`, 'info');

      const response = await ordersAPI.downloadQuarter(
        symbol,
        quarter.quarter,
        quarter.fiscalYear,
        quarter.orders,
        quarter.transcripts
      );

      if (response.data.success) {
        const { folder_path, downloaded } = response.data.data;
        showSnackbar(
          `Downloaded ${downloaded} file${downloaded !== 1 ? 's' : ''} for ${quarter.periodLabel} to ${folder_path}`,
          'success',
          5000
        );
      } else {
        throw new Error('Download failed');
      }
    } catch (err) {
      console.error('Failed to download quarter data:', err);
      showSnackbar('Download failed. Please try again.', 'error', 4000);
    } finally {
      setDownloadingQuarter(null);
    }
  };

  if (loading) {
    return <LoadingSpinner size="sm" text="Loading orders..." />;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-error mb-2">{error}</div>
        <button onClick={() => fetchData()} className="btn btn-sm btn-secondary">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-lg font-semibold">Order Announcements</h3>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleStockScansClick}
                className="btn btn-ghost btn-sm btn-square"
                title="View on StockScans"
              >
                <Image
                  src="/icons/stockscans.png"
                  alt="StockScans"
                  width={18}
                  height={18}
                  className="object-contain"
                />
              </button>
              <button
                onClick={handleScreenerClick}
                className="btn btn-ghost btn-sm btn-square"
                title="View on Screener"
              >
                <Image
                  src="/icons/screener.png"
                  alt="Screener"
                  width={18}
                  height={18}
                  className="object-contain"
                />
              </button>
            </div>
          </div>
          <p className="text-sm text-slate-500">
            View order announcements with direct links to official documents
          </p>
        </div>
      </div>

      {clientFetchTime && !loading && (
        <div className="card bg-neutral text-neutral-content rounded-xl shadow-md">
          <div className="card-body p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <div className="text-xs opacity-70 uppercase tracking-wider">Total Load Time</div>
                <div className="text-2xl font-bold">{formatDuration(clientFetchTime)}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <OrderAnnouncements
        transcript={latestTranscript}
        unannouncedQuarterInfo={unannouncedQuarterInfo}
        orders={sortedOrders}
        baselineDocumentUrl={baselineDocumentUrl}
        baselineDocumentTitle={baselineDocumentTitle}
        onDownloadAll={handleDownloadAll}
        onCopyJSON={handleCopyJSON}
        downloading={downloading}
        downloadProgress={downloadProgress}
        copySuccess={copySuccess}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSort={handleSort}
      />

      <div className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-bold">Last 8 Quarters</h3>
            <p className="text-sm opacity-50 mt-1">
              View and download order announcements and transcripts by quarter
            </p>
          </div>
        </div>

        <QuarterView
          quarters={quartersData}
          loading={quartersLoading}
          downloadingQuarter={downloadingQuarter}
          onDownloadQuarter={handleDownloadQuarter}
        />
      </div>

      <p className="text-xs opacity-50 mt-6">
        Data source: NSE India corporate announcements & reports.
      </p>
    </div>
  );
}
