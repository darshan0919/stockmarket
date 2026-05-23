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
import { formatQuarterDate } from '../lib/utils/formatters';

export default function Results() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState(null);
  const [allTranscriptNotes, setAllTranscriptNotes] = useState([]);
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
    resultDate: '',
    searchCompany: '',
    documentType: 'Transcript Notes',
  });

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

  useEffect(() => {
    fetchResults(filters);
  }, []);

  useEffect(() => {
    const fetchAllTranscriptNotes = async () => {
      setLoadingAllNotes(true);
      try {
        const baseParams = {
          marketCapMin: 1000,
          documentType: 'Transcript Notes',
          order: 'desc',
          orderBy: 'Last Result Date',
        };

        const firstResponse = await declaredResultsAPI.getResults({ ...baseParams, offset: 0 });

        if (!firstResponse.data.success) {
          setAllTranscriptNotes([]);
          return;
        }

        const { results: firstResults, pagination: paginationData } = firstResponse.data.data;
        const totalCount = paginationData.total;
        const pageSize = paginationData.end - paginationData.start + 1;

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

        if (paginationData.end < totalCount) {
          const offsets = [];
          for (let offset = paginationData.end; offset < totalCount; offset += pageSize) {
            offsets.push(offset);
          }

          const parallelResponses = await Promise.all(
            offsets.map((offset) => declaredResultsAPI.getResults({ ...baseParams, offset }))
          );

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

        setAllTranscriptNotes(allNotes);
      } catch (err) {
        console.error('Error fetching all transcript notes:', err);
        setAllTranscriptNotes([]);
      } finally {
        setLoadingAllNotes(false);
      }
    };

    fetchAllTranscriptNotes();
  }, []);

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
    fetchResults(newFilters);
  };

  const handleLoadMore = () => {
    const newFilters = { ...filters, offset: pagination.end };
    setFilters(newFilters);
    fetchResults(newFilters);
  };

  const handleDownloadAllNotes = async () => {
    try {
      setDownloading(true);
      setDownloadStatus(null);

      if (allTranscriptNotes.length === 0) {
        setDownloadStatus({ success: false, message: 'No transcript notes available to download' });
        return;
      }

      setDownloadStatus({
        success: true,
        message: `Downloading ${allTranscriptNotes.length} transcript notes...`,
      });

      const downloadResponse = await declaredResultsAPI.downloadTranscriptNotes(
        formatQuarterDate(quarterDate),
        allTranscriptNotes
      );

      if (downloadResponse.data.success) {
        const { successCount, errorCount, downloadDir, totalCompanies } =
          downloadResponse.data.data;
        setDownloadStatus({
          success: true,
          message: `Downloaded ${successCount} of ${totalCompanies} transcript notes to ${downloadDir}`,
          details: { totalCompanies, successCount, errorCount },
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

  const hasMore = pagination.end < pagination.total;

  return (
    <>
      <Head>
        <title>Declared Results - Stock Screener</title>
        <meta name="description" content="View declared quarterly results for Indian stocks" />
      </Head>

      <div>
        {/* Page header */}
        <div className="mb-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="page-header">Declared Results</h1>
              <p className="section-subtitle mt-1">
                {quarterDate && (
                  <span className="font-medium">{formatQuarterDate(quarterDate)} Quarter</span>
                )}
                {pagination.total > 0 && (
                  <span className="ml-2 text-base-content/40">({pagination.total} companies)</span>
                )}
              </p>
            </div>
            {quarterDate && results.length > 0 && (
              <button
                onClick={handleDownloadAllNotes}
                disabled={downloading}
                className="btn btn-sm btn-success gap-1.5"
              >
                {downloading ? (
                  <>
                    <span className="loading loading-spinner loading-xs" />
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
                    Download Notes
                    {loadingAllNotes ? (
                      <span className="text-xs opacity-60">(loading...)</span>
                    ) : (
                      <span className="text-xs">({allTranscriptNotes.length})</span>
                    )}
                  </>
                )}
              </button>
            )}
          </div>

          {downloadStatus && (
            <div
              className={`finance-card p-4 mt-4 ${downloadStatus.success ? 'border-success/30 bg-success/5' : 'border-error/30 bg-error/5'}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span
                    className={`text-sm ${downloadStatus.success ? 'text-success' : 'text-error'}`}
                  >
                    {downloadStatus.message}
                  </span>
                  {downloadStatus.details && (
                    <p className="text-xs text-base-content/50 mt-1">
                      Total: {downloadStatus.details.totalCompanies} | Downloaded:{' '}
                      {downloadStatus.details.successCount} | Errors:{' '}
                      {downloadStatus.details.errorCount}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setDownloadStatus(null)}
                  className="text-base-content/30 hover:text-base-content/60"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

        <ResultsFilterPanel
          onFilterChange={handleFilterChange}
          filters={filters}
          resultDates={resultDates}
          loading={loading}
        />

        {error && (
          <div className="finance-card border-error/30 bg-error/5 p-4 mb-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-error">{error}</span>
              <button
                onClick={() => fetchResults(filters)}
                className="text-xs font-medium text-error hover:underline"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && results.length === 0 && !error ? (
          <div className="text-center py-20">
            <svg
              className="mx-auto h-14 w-14 text-base-content/15 mb-4"
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
            <h3 className="text-base font-medium mb-1">No results found</h3>
            <p className="text-sm text-base-content/40">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {results.map((result, index) => (
                <ResultCard key={`${result.companyId}-${index}`} result={result} />
              ))}
            </div>

            {loading && results.length === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...Array(4)].map((_, index) => (
                  <div key={index} className="finance-card animate-pulse">
                    <div className="p-4">
                      <div className="h-4 bg-base-300/50 rounded w-1/3 mb-2" />
                      <div className="h-3 bg-base-300/50 rounded w-2/3 mb-4" />
                      <div className="space-y-2">
                        <div className="h-3 bg-base-300/50 rounded" />
                        <div className="h-3 bg-base-300/50 rounded" />
                        <div className="h-3 bg-base-300/50 rounded" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {hasMore && (
              <div className="mt-6 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="btn btn-sm btn-secondary btn-outline gap-1.5"
                >
                  {loading ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      Loading...
                    </>
                  ) : (
                    <>Load More ({pagination.total - pagination.end} remaining)</>
                  )}
                </button>
              </div>
            )}

            {results.length > 0 && (
              <div className="mt-4 text-center text-xs text-base-content/30">
                Showing {pagination.start} - {pagination.end} of {pagination.total}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export { getServerSideProps } from '../lib/forceServerSide';
