/**
 * Results Page - Dashboard for declared quarterly results
 * @page /results
 * @see {@link docs/frontend/pages/results.md} for documentation
 */

import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { declaredResultsAPI } from '../lib/api';
import ResultCard from '../components/results/ResultCard';
import ResultsFilterPanel from '../components/results/ResultsFilterPanel';

/**
 * Format quarter date for display (e.g., "202512" -> "Dec 2025")
 */
function formatQuarterDate(dateStr) {
  if (!dateStr || dateStr.length !== 6) return dateStr;
  const year = dateStr.substring(0, 4);
  const month = parseInt(dateStr.substring(4, 6), 10);
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${monthNames[month - 1]} ${year}`;
}

/**
 * Results page component
 */
export default function Results() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState(null);
  const [allTranscriptNotes, setAllTranscriptNotes] = useState([]); // All notes for download
  const [loadingAllNotes, setLoadingAllNotes] = useState(false);
  const [pagination, setPagination] = useState({
    total: 0,
    start: 1,
    end: 20,
    offset: 0,
  });
  const [quarterDate, setQuarterDate] = useState('');
  const [resultDates, setResultDates] = useState([]);
  const [filters, setFilters] = useState({
    marketCapMin: 1000,
    index: [],
    industry: [],
    order: 'desc',
    orderBy: 'Last Result Date',
    offset: 0,
    resultDate: '', // No date filtering, let API handle it
    searchCompany: '',
    documentType: 'Transcript Notes', // Default to transcript notes
  });

  // Fetch results
  const fetchResults = useCallback(async (currentFilters) => {
    try {
      setLoading(true);
      setError(null);

      const response = await declaredResultsAPI.getResults(currentFilters);

      if (response.data.success) {
        const {
          results: newResults,
          pagination: newPagination,
          quarterDate: qd,
          resultDates: rd,
        } = response.data.data;

        if (currentFilters.offset === 0) {
          setResults(newResults);
        } else {
          setResults((prev) => [...prev, ...newResults]);
        }

        setPagination(newPagination);
        setQuarterDate(qd);
        setResultDates(rd || []);
      }
    } catch (err) {
      console.error('Error fetching results:', err);
      setError(err.response?.data?.error || err.message || 'Failed to fetch results');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchResults(filters);
  }, []);

  // Fetch ALL transcript notes on page load (with parallel API calls)
  useEffect(() => {
    const fetchAllTranscriptNotes = async () => {
      setLoadingAllNotes(true);
      try {
        // Base params for fetching transcript notes
        const baseParams = {
          marketCapMin: 1000,
          documentType: 'Transcript Notes',
          order: 'desc',
          orderBy: 'Last Result Date',
        };

        // First call to get total count
        const firstResponse = await declaredResultsAPI.getResults({
          ...baseParams,
          offset: 0,
        });

        if (!firstResponse.data.success) {
          console.error('First API call failed');
          setAllTranscriptNotes([]);
          return;
        }

        const { results: firstResults, pagination: paginationData } = firstResponse.data.data;
        const totalCount = paginationData.total;
        const pageSize = paginationData.end - paginationData.start + 1; // Usually 20

        console.log(`Fetching transcript notes: ${totalCount} total, page size ${pageSize}`);

        // Extract notes from first page
        const allNotes = [];
        firstResults.forEach((result) => {
          (result.documents || [])
            .filter((doc) => doc.hasNotes && doc.notesUrl)
            .forEach((doc) => {
              allNotes.push({
                companyId: result.companyId,
                symbol: result.symbol,
                name: result.name,
                notesUrl: doc.notesUrl,
                documentType: doc.documentType,
                date: doc.date,
              });
            });
        });

        console.log(`First page: ${firstResults.length} results, ${allNotes.length} notes`);

        // If there are more pages, fetch them in parallel
        if (paginationData.end < totalCount) {
          const offsets = [];
          for (let offset = paginationData.end; offset < totalCount; offset += pageSize) {
            offsets.push(offset);
          }

          console.log(`Fetching ${offsets.length} more pages in parallel...`);

          // Make parallel API calls for all remaining pages
          const parallelResponses = await Promise.all(
            offsets.map((offset) =>
              declaredResultsAPI.getResults({
                ...baseParams,
                offset,
              })
            )
          );

          // Extract notes from all parallel responses
          parallelResponses.forEach((response) => {
            if (response.data.success) {
              response.data.data.results.forEach((result) => {
                (result.documents || [])
                  .filter((doc) => doc.hasNotes && doc.notesUrl)
                  .forEach((doc) => {
                    allNotes.push({
                      companyId: result.companyId,
                      symbol: result.symbol,
                      name: result.name,
                      notesUrl: doc.notesUrl,
                      documentType: doc.documentType,
                      date: doc.date,
                    });
                  });
              });
            }
          });
        }

        console.log(`Total notes fetched: ${allNotes.length}`);
        console.log(allNotes);
        setAllTranscriptNotes(allNotes);
      } catch (err) {
        console.error('Error fetching all transcript notes:', err);
        setAllTranscriptNotes([]);
      } finally {
        setLoadingAllNotes(false);
      }
    };

    fetchAllTranscriptNotes();
  }, []); // Run once on page load

  // Handle filter changes
  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    fetchResults(newFilters);
  };

  // Handle load more
  const handleLoadMore = () => {
    const newFilters = {
      ...filters,
      offset: pagination.end,
    };
    setFilters(newFilters);
    fetchResults(newFilters);
  };

  // Handle download all transcript notes (uses pre-fetched allTranscriptNotes)
  const handleDownloadAllNotes = async () => {
    try {
      setDownloading(true);
      setDownloadStatus(null);

      if (allTranscriptNotes.length === 0) {
        setDownloadStatus({
          success: false,
          message: 'No transcript notes available to download',
        });
        return;
      }

      setDownloadStatus({
        success: true,
        message: `Downloading ${allTranscriptNotes.length} transcript notes...`,
      });

      // Call backend API to download using authentication
      const downloadResponse = await declaredResultsAPI.downloadTranscriptNotes(
        formatQuarterDate(quarterDate),
        allTranscriptNotes
      );

      if (downloadResponse.data.success) {
        const { successCount, errorCount, downloadDir, totalCompanies } =
          downloadResponse.data.data;

        setDownloadStatus({
          success: true,
          message: `Successfully downloaded ${successCount} of ${totalCompanies} transcript notes to ${downloadDir}`,
          details: {
            totalCompanies,
            successCount,
            errorCount,
          },
        });
      } else {
        setDownloadStatus({
          success: false,
          message: downloadResponse.data.error || 'Download failed',
        });
      }
    } catch (err) {
      console.error('Error downloading transcript notes:', err);
      setDownloadStatus({
        success: false,
        message: err.response?.data?.error || err.message || 'Failed to download transcript notes',
        details: err.response?.data?.details,
      });
    } finally {
      setDownloading(false);
    }
  };

  // Calculate if there are more results to load
  const hasMore = pagination.end < pagination.total;

  return (
    <>
      <Head>
        <title>Declared Results - Stock Screener</title>
        <meta name="description" content="View declared quarterly results for Indian stocks" />
      </Head>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Declared Results</h1>
              <p className="text-gray-600 mt-1">
                {quarterDate && (
                  <span className="font-medium">{formatQuarterDate(quarterDate)} Quarter</span>
                )}
                {pagination.total > 0 && (
                  <span className="ml-2">({pagination.total} Results Declared)</span>
                )}
              </p>
            </div>
            {/* Download All Notes Button */}
            {quarterDate && results.length > 0 && (
              <button
                onClick={handleDownloadAllNotes}
                disabled={downloading}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Downloading...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download All Notes
                    {loadingAllNotes ? (
                      <span className="ml-1 text-green-200">(loading...)</span>
                    ) : (
                      <span className="ml-1">({allTranscriptNotes.length})</span>
                    )}
                  </>
                )}
              </button>
            )}
          </div>

          {/* Download Status Message */}
          {downloadStatus && (
            <div
              className={`mt-4 p-4 rounded-lg ${
                downloadStatus.success
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              <div className="flex items-start">
                <svg
                  className={`w-5 h-5 mr-2 mt-0.5 ${downloadStatus.success ? 'text-green-400' : 'text-red-400'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {downloadStatus.success ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  )}
                </svg>
                <div className="flex-1">
                  <p className={downloadStatus.success ? 'text-green-700' : 'text-red-700'}>
                    {downloadStatus.message}
                  </p>
                  {downloadStatus.details && (
                    <p className="text-sm text-gray-600 mt-1">
                      Total: {downloadStatus.details.totalCompanies} | Downloaded:{' '}
                      {downloadStatus.details.successCount} | Errors:{' '}
                      {downloadStatus.details.errorCount}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setDownloadStatus(null)}
                  className="text-gray-400 hover:text-gray-600"
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
              </div>
            </div>
          )}
        </div>

        {/* Filter Panel */}
        <ResultsFilterPanel
          onFilterChange={handleFilterChange}
          filters={filters}
          resultDates={resultDates}
          loading={loading}
        />

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <svg
                className="w-5 h-5 text-red-400 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-red-700">{error}</span>
            </div>
            <button
              onClick={() => fetchResults(filters)}
              className="mt-2 text-sm text-red-600 hover:text-red-700 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Results Grid */}
        {!loading && results.length === 0 && !error ? (
          <div className="text-center py-16">
            <svg
              className="mx-auto h-16 w-16 text-gray-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No results found</h3>
            <p className="text-gray-500">Try adjusting your filters to see more results</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {results.map((result, index) => (
                <ResultCard key={`${result.companyId}-${index}`} result={result} />
              ))}
            </div>

            {/* Loading State for Initial Load */}
            {loading && results.length === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[...Array(4)].map((_, index) => (
                  <div key={index} className="bg-white rounded-lg shadow-md p-4 animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded w-2/3 mb-4"></div>
                    <div className="space-y-2">
                      <div className="h-3 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-200 rounded"></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Load More Button */}
            {hasMore && (
              <div className="mt-8 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Loading...
                    </span>
                  ) : (
                    <>Load More ({pagination.total - pagination.end} remaining)</>
                  )}
                </button>
              </div>
            )}

            {/* Pagination Info */}
            {results.length > 0 && (
              <div className="mt-6 text-center text-sm text-gray-500">
                Showing {pagination.start} - {pagination.end} of {pagination.total} results
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
