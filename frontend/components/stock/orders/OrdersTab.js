/**
 * Main Orders tab component.
 * Manages state, tab switching, and orchestrates order-related sub-views.
 * @module components/stock/orders/OrdersTab
 * @see {@link docs/API_REFERENCE.md#orders-apis} for Orders API docs
 */

import { useState, useEffect, useMemo } from 'react';
import Image from 'next/image';
import { ordersAPI } from '../../../lib/api';
import { useSnackbar } from '../../../lib/contexts/SnackbarContext';
import LoadingSpinner from '../../common/LoadingSpinner';
import { formatCurrency, formatDuration, getUnannouncedQuarter } from './orderUtils';
import OrderAnnouncements, { EmptyState } from './OrderAnnouncements';
import OrderRow from './OrderDetails';
import OrderBookView, { OrderInflowSummary } from './OrderBookView';
import QuarterView from './QuarterView';

/**
 * Orders tab with multiple views: Announcements, Order Book, All Orders (AI).
 * @param {Object} props
 * @param {string} props.symbol - Stock symbol
 */
export default function OrdersTab({ symbol }) {
  const { showSnackbar } = useSnackbar();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('non-ai'); // non-ai | orderbook | all
  const [parsingOrderId, setParsingOrderId] = useState(null);
  const [sortBy, setSortBy] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');

  const [orderbookData, setOrderbookData] = useState(null);
  const [baselineDocumentUrl, setBaselineDocumentUrl] = useState(null);
  const [baselineDocumentTitle, setBaselineDocumentTitle] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });

  const [timing, setTiming] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);
  const [clientFetchTime, setClientFetchTime] = useState(null);
  const [orderbookFallbackMessage, setOrderbookFallbackMessage] = useState(null);
  const [orderbookFallbackDetails, setOrderbookFallbackDetails] = useState(null);

  const [latestTranscript, setLatestTranscript] = useState(null);
  const [unannouncedQuarterInfo, setUnannouncedQuarterInfo] = useState(null);
  const [transcriptLoading, setTranscriptLoading] = useState(true);

  const [quartersData, setQuartersData] = useState([]);
  const [quartersLoading, setQuartersLoading] = useState(false);
  const [downloadingQuarter, setDownloadingQuarter] = useState(null);

  const processTranscriptData = (transcriptData) => {
    if (!transcriptData) {
      setTranscriptLoading(false);
      return null;
    }

    try {
      setLatestTranscript(transcriptData);
      const transcriptDateStr = transcriptData.announcement_date;
      if (transcriptDateStr) {
        const transcriptDate = new Date(transcriptDateStr);
        const quarterInfo = getUnannouncedQuarter(transcriptDate);
        setUnannouncedQuarterInfo(quarterInfo);
        setTranscriptLoading(false);
        return { transcript: transcriptData, quarterInfo };
      }
    } catch (err) {
      console.error('Error processing transcript:', err);
    }

    setTranscriptLoading(false);
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

  const fetchData = async (mode = viewMode, quarterInfo = unannouncedQuarterInfo) => {
    if (!symbol) return;

    const fetchStartTime = Date.now();

    try {
      setLoading(true);
      setError(null);
      setTiming(null);
      setCacheStats(null);
      setClientFetchTime(null);
      setOrderbookData(null);
      setBaselineDocumentUrl(null);
      setBaselineDocumentTitle(null);
      if (mode !== 'all' || viewMode !== 'orderbook') {
        setOrderbookFallbackMessage(null);
        setOrderbookFallbackDetails(null);
      }

      let response;
      if (mode === 'non-ai') {
        response = await ordersAPI.getNonAI(symbol, 100);
      } else if (mode === 'orderbook') {
        response = await ordersAPI.getOrderbook(symbol);
      } else {
        response = await ordersAPI.getFullParsed(symbol, 50);
      }

      const clientTime = Date.now() - fetchStartTime;
      setClientFetchTime(clientTime);

      if (response.data.success) {
        let fetchedOrders = [];
        let transcriptResult = null;

        if (mode === 'non-ai') {
          fetchedOrders = response.data.data.orders || [];

          if (response.data.data.latest_transcript) {
            transcriptResult = processTranscriptData(response.data.data.latest_transcript);
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
        } else if (mode === 'orderbook') {
          setOrderbookData(response.data.data);
          fetchedOrders = response.data.data.new_orders || [];
        } else {
          fetchedOrders = response.data.data.orders || [];
        }

        if (mode === 'non-ai' && quarterInfo) {
          fetchedOrders = filterOrdersByQuarter(fetchedOrders, quarterInfo);
        }

        setOrders(fetchedOrders);

        if (response.data.data.timing) {
          setTiming(response.data.data.timing);
        }
        if (response.data.data.cache_stats) {
          setCacheStats(response.data.data.cache_stats);
        }
      } else {
        if (mode === 'orderbook') {
          console.log(
            'Orderbook baseline not found, switching to non-ai view:',
            response.data.error
          );
          setOrderbookFallbackMessage(
            response.data.message ||
              'Order book baseline not found for this company. Showing basic order announcements instead.'
          );
          setOrderbookFallbackDetails({
            documentsChecked: response.data.documents_checked,
            documentsFetched: response.data.documents_fetched,
            parseErrors: response.data.parse_errors,
          });
          setViewMode('non-ai');
          await fetchData('non-ai', quarterInfo);
          return;
        }
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
    fetchData(viewMode);
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

  const handleViewModeChange = async (newMode) => {
    if (newMode === viewMode) return;
    setViewMode(newMode);
    setOrderbookFallbackMessage(null);
    setOrderbookFallbackDetails(null);
    await fetchData(newMode, unannouncedQuarterInfo);
  };

  const handleParsePdf = async (order) => {
    if (!order.attachment_url) return;

    setParsingOrderId(order.id);

    try {
      const response = await ordersAPI.parsePdf(symbol, order.attachment_url);

      if (response.data.success) {
        const parsedData = response.data.data.parsed_data;

        setOrders((prevOrders) =>
          prevOrders.map((o) => {
            if (o.id === order.id) {
              const pdfDetails = parsedData?.order_details || {};
              return {
                ...o,
                pdf_parsed: parsedData?.extraction_success || false,
                confidence_score: parsedData?.confidence_score || 0,
                order_details: {
                  ...o.order_details,
                  order_value: pdfDetails.order_value || o.order_details?.order_value,
                  order_capacity: pdfDetails.order_capacity || o.order_details?.order_capacity,
                  customer_name: pdfDetails.customer_name || o.order_details?.customer_name,
                  customer_type: pdfDetails.customer_type || o.order_details?.customer_type,
                  order_type: pdfDetails.order_type || o.order_details?.order_type,
                  project_description:
                    pdfDetails.project_description || o.order_details?.project_description,
                },
              };
            }
            return o;
          })
        );
      }
    } catch (err) {
      console.error('Error parsing PDF:', err);
    } finally {
      setParsingOrderId(null);
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
    return (
      <LoadingSpinner
        size="sm"
        text={
          viewMode === 'non-ai'
            ? 'Loading orders...'
            : viewMode === 'orderbook'
              ? 'Loading order book... This may take a moment as we analyze reports.'
              : 'Loading and parsing orders...'
        }
      />
    );
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

  const totalValue = sortedOrders.reduce(
    (sum, o) => sum + (o.order_details?.order_value?.value_in_crore_inr || 0),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-lg font-semibold">
              {viewMode === 'non-ai'
                ? 'Order Announcements'
                : viewMode === 'orderbook'
                  ? 'Order Book Analysis'
                  : 'All Order Announcements (AI Parsed)'}
            </h3>
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
            {viewMode === 'non-ai'
              ? 'View order announcements with direct links to official documents (no AI processing)'
              : viewMode === 'orderbook'
                ? 'Outstanding unexecuted order book from latest reports + new orders'
                : 'All corporate announcements for received orders with AI-extracted details'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-sm opacity-60">View:</span>
          <div className="join">
            <button
              onClick={() => handleViewModeChange('non-ai')}
              className={`btn btn-sm join-item ${viewMode === 'non-ai' ? 'btn-active' : ''}`}
              title="View announcements without AI parsing"
            >
              Announcements
            </button>
            <button
              onClick={() => handleViewModeChange('orderbook')}
              className={`btn btn-sm join-item ${viewMode === 'orderbook' ? 'btn-active' : ''}`}
              title="Analyze order book with AI"
            >
              Order Book (AI)
            </button>
            <button
              onClick={() => handleViewModeChange('all')}
              className={`btn btn-sm join-item ${viewMode === 'all' ? 'btn-active' : ''}`}
              title="Parse all orders with AI"
            >
              All Orders (AI)
            </button>
          </div>
        </div>
      </div>

      {orderbookFallbackMessage && (
        <div className="alert alert-warning">
          <div className="flex items-start gap-3">
            <svg
              className="h-5 w-5 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium">Order Book Baseline Not Available</p>
              <p className="text-sm mt-1 opacity-90">{orderbookFallbackMessage}</p>
              {orderbookFallbackDetails && (
                <div className="mt-3 text-xs opacity-80 space-y-1">
                  {orderbookFallbackDetails.documentsFetched && (
                    <p>
                      Documents found:{' '}
                      {orderbookFallbackDetails.documentsFetched.annual_reports || 0} annual
                      reports,{' '}
                      {orderbookFallbackDetails.documentsFetched.investor_presentations || 0}{' '}
                      investor presentations,{' '}
                      {orderbookFallbackDetails.documentsFetched.financial_results || 0} financial
                      results
                    </p>
                  )}
                  {orderbookFallbackDetails.documentsChecked &&
                    orderbookFallbackDetails.documentsChecked.length > 0 && (
                      <div>
                        <p className="font-medium">Documents analyzed:</p>
                        <ul className="list-disc list-inside ml-2 mt-1">
                          {orderbookFallbackDetails.documentsChecked.slice(0, 3).map((doc, i) => (
                            <li key={i} className="truncate max-w-md">
                              {doc}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              )}
            </div>
            <button
              onClick={() => {
                setOrderbookFallbackMessage(null);
                setOrderbookFallbackDetails(null);
              }}
              className="btn btn-ghost btn-sm btn-square"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      )}

      {clientFetchTime && !loading && (
        <div className="card bg-neutral text-neutral-content rounded-xl shadow-md">
          <div className="card-body p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
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

              {cacheStats && (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-base-100/10 rounded-lg">
                    <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div>
                      <div className="text-xs opacity-70">Cache Hits</div>
                      <div className="font-semibold">
                        {cacheStats.cache_hits} ({cacheStats.cache_hit_rate}%)
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-base-100/10 rounded-lg">
                    <svg className="w-4 h-4 text-warning" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div>
                      <div className="text-xs opacity-70">Fresh Parses</div>
                      <div className="font-semibold">{cacheStats.cache_misses}</div>
                    </div>
                  </div>
                  {cacheStats.baseline_from_cache !== undefined && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-base-100/10 rounded-lg">
                      <svg className="w-4 h-4 text-info" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                        <path
                          fillRule="evenodd"
                          d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <div>
                        <div className="text-xs opacity-70">Baseline</div>
                        <div className="font-semibold">
                          {cacheStats.baseline_from_cache ? 'Cached' : 'Fresh'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {(viewMode === 'all' || viewMode === 'orderbook') && sortedOrders.length > 0 && (
        <OrderInflowSummary orders={sortedOrders} totalValue={totalValue} />
      )}

      {viewMode === 'non-ai' && (
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
      )}

      {viewMode === 'orderbook' && orderbookData && (
        <OrderBookView
          orderbookData={orderbookData}
          orders={sortedOrders}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
          onParsePdf={handleParsePdf}
          parsingOrderId={parsingOrderId}
        />
      )}

      {viewMode === 'all' && (
        <>
          {sortedOrders.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card bg-info/10 border border-info/20 shadow-sm">
                  <div className="card-body p-4">
                    <div className="text-sm font-medium text-info mb-1">Total Orders</div>
                    <div className="text-2xl font-bold">{sortedOrders.length}</div>
                  </div>
                </div>
                <div className="card bg-success/10 border border-success/20 shadow-sm">
                  <div className="card-body p-4">
                    <div className="text-sm font-medium text-success mb-1">With Values</div>
                    <div className="text-2xl font-bold">
                      {
                        sortedOrders.filter((o) => o.order_details?.order_value?.value_in_crore_inr)
                          .length
                      }
                    </div>
                  </div>
                </div>
                <div className="card bg-secondary/10 border border-secondary/20 shadow-sm">
                  <div className="card-body p-4">
                    <div className="text-sm font-medium text-secondary mb-1">Total Value</div>
                    <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
                  </div>
                </div>
                <div className="card bg-warning/10 border border-warning/20 shadow-sm">
                  <div className="card-body p-4">
                    <div className="text-sm font-medium text-warning mb-1">AI Parsed</div>
                    <div className="text-2xl font-bold">
                      {sortedOrders.filter((o) => o.pdf_parsed).length}/{sortedOrders.length}
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th
                        className="cursor-pointer hover:bg-base-200/50"
                        onClick={() => handleSort('date')}
                      >
                        <div className="flex items-center gap-1">
                          Date
                          {sortBy === 'date' && (
                            <svg
                              className={`w-3 h-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                      </th>
                      <th
                        className="text-right cursor-pointer hover:bg-base-200/50"
                        onClick={() => handleSort('amount')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Amount
                          {sortBy === 'amount' && (
                            <svg
                              className={`w-3 h-3 ${sortOrder === 'asc' ? 'rotate-180' : ''}`}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          )}
                        </div>
                      </th>
                      <th className="text-center">Capacity</th>
                      <th>Customer</th>
                      <th>Description</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedOrders.map((order) => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        onParsePdf={handleParsePdf}
                        isParsing={parsingOrderId === order.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

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
        Data source: NSE India corporate announcements & reports. Order values are extracted using
        AI from official filings.
      </p>
    </div>
  );
}
