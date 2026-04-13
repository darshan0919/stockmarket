import { useState, useEffect, useMemo, useCallback } from 'react';
import { announcementsAPI } from '../../lib/api';
import {
  ANNOUNCEMENT_SEARCH,
  buildCategoryYearPack,
  buildOrderBookPack,
  buildStandardPack,
} from '../../lib/announcementBulkDownload';
import { useSnackbar } from '../../lib/contexts/SnackbarContext';
import LoadingSpinner from '../common/LoadingSpinner';

const SEARCH_DEBOUNCE_MS = 400;

/** Bulk ZIP category (one combined control + download button) */
const BULK_CATEGORY_OPTIONS = [
  { value: 'standard', label: 'Standard pack' },
  { value: 'orders', label: 'Order book' },
  { value: 'annual', label: 'Annual report' },
  { value: 'transcript', label: 'Transcript' },
  { value: 'presentation', label: 'Investor presentation' },
];

/** Shared time span for every bulk category */
const BULK_TIME_SPAN_OPTIONS = [
  { value: 'm3', label: 'Last 3 months' },
  { value: 'm6', label: 'Last 6 months' },
  { value: 'y1', label: 'Last 1 year' },
  { value: 'y3', label: 'Last 3 years' },
  { value: 'y5', label: 'Last 5 years' },
  { value: 'all', label: 'All time' },
];

/**
 * Persisted choice for GET /api/announcements/:symbol?provider=
 * @see {@link docs/API_REFERENCE.md#announcements-apis}
 */
const ANNOUNCEMENTS_PROVIDER_STORAGE_KEY = 'announcementsProvider';

/**
 * @returns {'stockscans'|'nse'}
 */
function readInitialDataProvider() {
  if (typeof window === 'undefined') return 'stockscans';
  try {
    const v = window.localStorage.getItem(ANNOUNCEMENTS_PROVIDER_STORAGE_KEY);
    if (v === 'nse' || v === 'stockscans') return v;
  } catch {
    /* ignore */
  }
  return 'stockscans';
}

/**
 * Make search text safe for use in a downloaded ZIP filename segment.
 * @param {string} raw - User search input
 * @returns {string} Sanitized segment or empty if nothing usable remains
 */
function sanitizeSearchForZipFilename(raw) {
  const t = raw !== undefined && raw !== null ? String(raw).trim() : '';
  if (!t) return '';
  const s = t
    .replace(/[/\\:*?"<>|\x00-\x1f]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 60);
  return s || '';
}

// Helper function to format relative time
const formatTimeAgo = (dateString) => {
  if (!dateString) return '';

  // NSE date format: "31-Dec-2025 10:30:00"
  let date;
  if (dateString.includes('-')) {
    const parts = dateString.split(' ');
    const dateParts = parts[0].split('-');
    const months = {
      Jan: 0,
      Feb: 1,
      Mar: 2,
      Apr: 3,
      May: 4,
      Jun: 5,
      Jul: 6,
      Aug: 7,
      Sep: 8,
      Oct: 9,
      Nov: 10,
      Dec: 11,
    };
    if (dateParts.length === 3 && months[dateParts[1]] !== undefined) {
      date = new Date(parseInt(dateParts[2], 10), months[dateParts[1]], parseInt(dateParts[0], 10));
    } else {
      date = new Date(dateString);
    }
  } else {
    date = new Date(dateString);
  }

  if (isNaN(date.getTime())) return dateString;

  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)} months ago`;
  return `${Math.floor(diffInSeconds / 31536000)} years ago`;
};

// Announcement Card Component
const AnnouncementCard = ({ announcement }) => {
  const { subject, desc, an_dt, attchmntFile, attchmntText } = announcement;

  return (
    <div className="finance-card-hover p-5 group">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Title/Subject */}
          <h3 className="text-sm font-semibold mb-1 leading-tight">
            {subject?.replace(/_/g, ' ') || 'Announcement'}
          </h3>

          {/* Description */}
          {desc && <p className="text-sm opacity-60 mt-2 line-clamp-3 leading-relaxed">{desc}</p>}

          {/* Attachment Text */}
          {attchmntText && (
            <div className="mt-3 flex items-start gap-2">
              <svg
                className="w-4 h-4 opacity-40 mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
              <span className="text-xs opacity-50 leading-relaxed">{attchmntText}</span>
            </div>
          )}
        </div>

        {/* External Link Icon */}
        {attchmntFile && (
          <a
            href={attchmntFile}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 p-2 opacity-40 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
            title="View attachment"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </a>
        )}
      </div>

      {/* Time ago */}
      <div className="mt-4 pt-3 border-t border-base-200">
        <span className="text-xs opacity-50">{formatTimeAgo(an_dt)}</span>
      </div>
    </div>
  );
};

// Empty State Component
const EmptyState = ({ searchTerm }) => (
  <div className="text-center py-12">
    <svg
      className="w-16 h-16 mx-auto mb-4 opacity-30"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
    <h3 className="text-lg font-medium opacity-70 mb-1">No announcements found</h3>
    <p className="text-sm opacity-50">
      {searchTerm
        ? `No results for "${searchTerm}". Try a different search term.`
        : 'No announcements available for this company.'}
    </p>
  </div>
);

/**
 * Corporate announcements tab — data from StockScans search API (proxied by the backend).
 * Bulk download uses one category, one time span, and POST `/announcements/:symbol/download`.
 * @param {Object} props
 * @param {string} props.symbol - Trading symbol (NSE)
 * @see {@link docs/API_REFERENCE.md#announcements-apis}
 * @see {@link frontend/lib/announcementBulkDownload.js}
 */
export default function AnnouncementsTab({ symbol }) {
  const { showSnackbar } = useSnackbar();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  /** Backend `code` when GET /announcements fails (e.g. STOCKSCANS_BAD_COMPANY) */
  const [errorCode, setErrorCode] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [dataProvider, setDataProvider] = useState(() => readInitialDataProvider());
  const [downloading, setDownloading] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('standard');
  const [bulkTimeSpan, setBulkTimeSpan] = useState('y1');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const remoteSearchParam = useMemo(() => {
    return debouncedSearch.length >= 3 ? debouncedSearch : '';
  }, [debouncedSearch]);

  const fetchPage = useCallback(
    async (offset, append) => {
      if (!symbol) return;

      const params = { offset, provider: dataProvider };
      if (remoteSearchParam) params.search = remoteSearchParam;

      const response = await announcementsAPI.getBySymbol(symbol, params);
      if (!response.data.success) {
        throw new Error(response.data?.error || 'Request failed');
      }

      const batch = Array.isArray(response.data.data) ? response.data.data : [];
      const meta = response.data.meta || {};
      const provider = meta.provider || dataProvider;

      if (provider === 'nse') {
        setNextOffset(batch.length);
        setHasMore(false);
      } else {
        const limit = typeof meta.limit === 'number' ? meta.limit : 30;
        // meta.offset is often 0 on every StockScans page; `0 ?? requestOffset` would not advance pagination.
        setNextOffset(offset + batch.length);
        setHasMore(batch.length > 0 && batch.length === limit);
      }

      if (append) {
        setAnnouncements((prev) => [...prev, ...batch]);
      } else {
        setAnnouncements(batch);
      }
    },
    [symbol, remoteSearchParam, dataProvider]
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!symbol) return;
      try {
        setLoading(true);
        setError(null);
        setErrorCode(null);
        setNextOffset(0);
        await fetchPage(0, false);
      } catch (err) {
        if (!cancelled) {
          console.error('Error fetching announcements:', err);
          const data = err.response?.data;
          setError(data?.error || err.message || 'Unable to load announcements');
          setErrorCode(data?.code ?? null);
          setAnnouncements([]);
          setHasMore(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [symbol, remoteSearchParam, fetchPage]);

  const displayedAnnouncements = useMemo(() => {
    const t = searchTerm.trim();
    const low = t.toLowerCase();

    if (dataProvider === 'nse' && t.length >= 3) {
      return announcements.filter(
        (ann) =>
          (ann.subject || '').toLowerCase().includes(low) ||
          (ann.desc || '').toLowerCase().includes(low)
      );
    }

    if (t.length === 0 || t.length >= 3) return announcements;
    return announcements.filter(
      (ann) =>
        (ann.subject || '').toLowerCase().includes(low) ||
        (ann.desc || '').toLowerCase().includes(low)
    );
  }, [announcements, searchTerm, dataProvider]);

  const handleLoadMore = async () => {
    if (!symbol || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      await fetchPage(nextOffset, true);
    } catch (err) {
      console.error('Error loading more announcements:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
  };

  /**
   * Trigger browser download of a ZIP blob
   * @param {Blob} blob
   * @param {string} filename
   */
  const triggerZipDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /**
   * Non-blocking feedback after ZIP response (browser file + optional server path header).
   * @param {{ headers?: Record<string, string> }} response - Axios-style response
   */
  const notifyZipSaved = (response) => {
    const savedPath = response.headers?.['x-saved-to-repo'];
    if (savedPath) {
      showSnackbar(`ZIP saved on server at ${savedPath} (and in your browser).`, 'success', 5500);
    } else {
      showSnackbar('ZIP download started.', 'success');
    }
  };

  /**
   * Run bulk download from the selected category and time span.
   */
  const handleBulkDownload = async () => {
    if (!symbol) {
      showSnackbar('Wait for announcements to load, then try again.', 'warning');
      return;
    }

    setBulkDownloading(true);

    try {
      let items;
      let zipSearchLabel;
      const span = bulkTimeSpan;
      const upperSymbol = symbol.toUpperCase();

      if (bulkCategory === 'standard') {
        items = await buildStandardPack(symbol, dataProvider, announcementsAPI, span);
        zipSearchLabel = `Standard_${span}`;
      } else if (bulkCategory === 'orders') {
        items = await buildOrderBookPack(symbol, dataProvider, announcementsAPI, span);
        zipSearchLabel = `OrderBook_${span}`;
      } else if (bulkCategory === 'annual') {
        items = await buildCategoryYearPack(
          symbol,
          dataProvider,
          announcementsAPI,
          ANNOUNCEMENT_SEARCH.ANNUAL_REPORT,
          span
        );
        zipSearchLabel = `Annual_${span}`;
      } else if (bulkCategory === 'transcript') {
        items = await buildCategoryYearPack(
          symbol,
          dataProvider,
          announcementsAPI,
          ANNOUNCEMENT_SEARCH.TRANSCRIPT,
          span
        );
        zipSearchLabel = `Transcript_${span}`;
      } else {
        items = await buildCategoryYearPack(
          symbol,
          dataProvider,
          announcementsAPI,
          ANNOUNCEMENT_SEARCH.INVESTOR_PRESENTATION,
          span
        );
        zipSearchLabel = `InvestorPresentation_${span}`;
      }

      const withFiles = items.filter((ann) => ann.attchmntFile);
      if (withFiles.length === 0) {
        showSnackbar('No PDF attachments found for this bundle.', 'warning');
        return;
      }

      const payload = withFiles.map((ann) => ({
        url: ann.attchmntFile,
        subject: ann.subject || ann.desc || 'announcement',
        date: ann.an_dt || '',
      }));

      const response = await announcementsAPI.downloadPdfs(symbol, payload, {
        search: zipSearchLabel,
      });

      const blob = new Blob([response.data], { type: 'application/zip' });
      const dateStr = new Date().toISOString().split('T')[0];
      const safeSeg = sanitizeSearchForZipFilename(zipSearchLabel);
      triggerZipDownload(
        blob,
        safeSeg
          ? `${upperSymbol}_announcements_${safeSeg}_${dateStr}.zip`
          : `${upperSymbol}_announcements_${dateStr}.zip`
      );
      notifyZipSaved(response);
    } catch (err) {
      console.error('Bulk download failed:', err);
      showSnackbar(err.message || 'Failed to download bundle. Please try again.', 'error', 5000);
    } finally {
      setBulkDownloading(false);
    }
  };

  /**
   * Download all PDF attachments from filtered announcements as a single ZIP file.
   * Sends current search text so the ZIP filename includes a sanitized search segment.
   * Uses backend proxy to fetch PDFs (S3 or NSE)
   * @see {@link docs/frontend/components/AnnouncementsTab.md} for component docs
   */
  const handleDownload = async () => {
    const announcementsWithFiles = displayedAnnouncements.filter((ann) => ann.attchmntFile);

    if (announcementsWithFiles.length === 0) return;

    setDownloading(true);

    try {
      const upperSymbol = symbol.toUpperCase();
      const payload = announcementsWithFiles.map((ann) => ({
        url: ann.attchmntFile,
        subject: ann.subject || ann.desc || 'announcement',
        date: ann.an_dt || '',
      }));

      const searchTrimmed = searchTerm.trim();
      const response = await announcementsAPI.downloadPdfs(symbol, payload, {
        search: searchTrimmed,
      });

      const blob = new Blob([response.data], { type: 'application/zip' });
      const dateStr = new Date().toISOString().split('T')[0];
      const searchSeg = sanitizeSearchForZipFilename(searchTrimmed);
      triggerZipDownload(
        blob,
        searchSeg
          ? `${upperSymbol}_announcements_${searchSeg}_${dateStr}.zip`
          : `${upperSymbol}_announcements_${dateStr}.zip`
      );
      notifyZipSaved(response);
    } catch (err) {
      console.error('Failed to download announcement PDFs:', err);
      showSnackbar('Failed to download PDFs. Please try again.', 'error', 5000);
    } finally {
      setDownloading(false);
    }
  };

  const dataSourceControl = (
    <div className="mb-4 rounded-xl border border-base-300/50 bg-base-200/30 p-3">
      <label className="form-control w-full max-w-md">
        <span className="label-text text-xs opacity-70">Data source</span>
        <select
          className="select select-bordered select-sm bg-base-100 w-full max-w-xs"
          value={dataProvider}
          onChange={(e) => {
            const v = e.target.value;
            if (v !== 'stockscans' && v !== 'nse') return;
            setDataProvider(v);
            try {
              localStorage.setItem(ANNOUNCEMENTS_PROVIDER_STORAGE_KEY, v);
            } catch {
              /* ignore */
            }
          }}
          aria-label="Announcements data source"
        >
          <option value="stockscans">StockScans</option>
          <option value="nse">NSE India</option>
        </select>
      </label>
      <p className="text-xs opacity-60 mt-2">
        {dataProvider === 'stockscans'
          ? 'Server-side search and pagination. Requires STOCKSCANS_AUTH_TOKEN on the backend. Failures are not silently switched to NSE.'
          : 'One response per symbol; use the search box to filter loaded rows (3+ characters).'}
      </p>
    </div>
  );

  if (loading) {
    return (
      <div>
        {dataSourceControl}
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (error && announcements.length === 0) {
    return (
      <div>
        {dataSourceControl}
        <div className="text-center py-8">
          <div className="text-error mb-2">{error}</div>
          <p className="text-sm opacity-50">
            {dataProvider === 'stockscans' ? (
              errorCode === 'STOCKSCANS_BAD_COMPANY' ? (
                <>
                  This ticker may not exist on StockScans (their API often returns HTTP 500 for
                  unknown companies). Switch data source to NSE above for NSE corporate
                  announcements, or confirm the symbol on stockscans.in.
                </>
              ) : errorCode === 'STOCKSCANS_AUTH_REQUIRED' ||
                /authentication failed/i.test(error || '') ? (
                <>
                  Refresh <code className="text-xs">STOCKSCANS_AUTH_TOKEN</code> in the backend{' '}
                  <code className="text-xs">.env</code> from an active stockscans.in session, or
                  switch data source to NSE above for a limited list.
                </>
              ) : (
                <>
                  If the problem persists, try refreshing{' '}
                  <code className="text-xs">STOCKSCANS_AUTH_TOKEN</code> in the backend{' '}
                  <code className="text-xs">.env</code> or switch data source to NSE above.
                </>
              )
            ) : (
              <>
                Could not load NSE announcements. Try again later or switch data source if the issue
                persists.
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  const localFilterActive = searchTerm.trim().length > 0 && searchTerm.trim().length < 3;
  const searchPlaceholder =
    dataProvider === 'stockscans'
      ? 'Search announcements (3+ letters for server search)…'
      : 'Filter loaded announcements (3+ letters)…';

  return (
    <div>
      {dataSourceControl}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h3 className="text-lg font-semibold">Announcements</h3>

        <div className="flex gap-2 items-center flex-wrap">
          {/* Download Button */}
          {displayedAnnouncements.filter((ann) => ann.attchmntFile).length > 0 && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="btn btn-sm btn-secondary gap-1.5"
              title="Download all PDF attachments from filtered announcements"
            >
              {downloading ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span>
                  Downloading...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download PDFs ({displayedAnnouncements.filter((ann) => ann.attchmntFile).length})
                </>
              )}
            </button>
          )}

          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                className="w-5 h-5 opacity-40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={handleSearchChange}
              className="w-full pl-10 pr-10 py-2 border border-base-300/60 rounded-lg focus:outline-none focus:border-secondary/50 focus:bg-base-100 text-sm bg-base-200/60 transition-all"
            />
            {searchTerm && (
              <button
                onClick={handleClearSearch}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-base-content/40 hover:text-base-content/70"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Preset bulk downloads */}
      <div className="mb-6 p-4 rounded-xl border border-base-300/50 bg-base-200/40 space-y-3">
        <h4 className="text-sm font-semibold opacity-90">Bulk download</h4>
        <p className="text-xs opacity-60">
          Choose a document category and a time window. Standard pack includes annual reports,
          transcripts, investor presentations, and orders, each filtered by the same window. With
          StockScans, each category is fetched page-by-page until complete. With NSE, matching uses
          only the single loaded list (much smaller).
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-end gap-3">
          <label className="form-control w-full sm:w-auto sm:min-w-[200px]">
            <span className="label-text text-xs opacity-70 py-0 mb-1">Category</span>
            <select
              className="select select-bordered select-sm bg-base-100 w-full"
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              disabled={bulkDownloading}
              aria-label="Bulk download category"
            >
              {BULK_CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="form-control w-full sm:w-auto sm:min-w-[200px]">
            <span className="label-text text-xs opacity-70 py-0 mb-1">Time span</span>
            <select
              className="select select-bordered select-sm bg-base-100 w-full"
              value={bulkTimeSpan}
              onChange={(e) => setBulkTimeSpan(e.target.value)}
              disabled={bulkDownloading}
              aria-label="Bulk download time span"
            >
              {BULK_TIME_SPAN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={handleBulkDownload}
            disabled={bulkDownloading}
            className="btn btn-sm btn-primary gap-1.5 sm:mb-0.5"
          >
            {bulkDownloading ? (
              <>
                <span className="loading loading-spinner loading-xs"></span>
                Preparing…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download ZIP
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results count */}
      {announcements.length > 0 && (
        <p className="text-sm opacity-50 mb-4">
          {localFilterActive
            ? `Showing ${displayedAnnouncements.length} of ${announcements.length} loaded`
            : hasMore && dataProvider === 'stockscans'
              ? `${announcements.length} announcements loaded (more when you use Load more)`
              : `${announcements.length} announcements`}
        </p>
      )}

      {/* Announcements Grid */}
      {displayedAnnouncements.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayedAnnouncements.map((announcement, index) => (
              <AnnouncementCard
                key={`${announcement.an_dt}-${announcement.subject}-${index}`}
                announcement={announcement}
              />
            ))}
          </div>

          {/* Load More Button */}
          {hasMore && !localFilterActive && (
            <div className="mt-6 text-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="btn btn-sm btn-secondary btn-outline gap-1.5"
              >
                {loadingMore ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    Loading...
                  </>
                ) : (
                  <>Load more</>
                )}
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState searchTerm={searchTerm} />
      )}

      {/* Attribution */}
      <p className="text-xs text-base-content/40 mt-6">
        {dataProvider === 'nse' ? (
          <>Data source: NSE India corporate announcements (your selected data source).</>
        ) : (
          <>
            Data source:{' '}
            <a
              href="https://www.stockscans.in"
              target="_blank"
              rel="noopener noreferrer"
              className="link link-hover"
            >
              StockScans
            </a>{' '}
            search API (your selected data source); PDFs from StockScans storage when linked.
          </>
        )}
      </p>
      <p className="text-xs text-base-content/40 mt-2">
        The backend also saves a copy under the project&apos;s{' '}
        <code className="text-xs">downloads/</code> folder (same path no matter how you start the
        API), in addition to your browser download. A snackbar shows the relative path when
        available.
      </p>
    </div>
  );
}
