import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useWatchlist } from '../lib/hooks/useWatchlist';
import { useSnackbar } from '../lib/contexts/SnackbarContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import Modal from '../components/common/Modal';
import {
  formatCurrency,
  formatChange,
  formatNumber,
  getChangeColor,
} from '../lib/utils/formatters';

export default function Watchlist() {
  const { watchlist, loading, removeFromWatchlist, fetchWatchlist } = useWatchlist();
  const { showSnackbar } = useSnackbar();
  const router = useRouter();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [symbolToRemove, setSymbolToRemove] = useState(null);

  const handleRemoveClick = (symbol) => {
    setSymbolToRemove(symbol);
    setShowDeleteModal(true);
  };

  const handleRemoveConfirm = async () => {
    if (!symbolToRemove) return;
    const result = await removeFromWatchlist(symbolToRemove);
    setShowDeleteModal(false);
    setSymbolToRemove(null);
    if (result.success) {
      fetchWatchlist();
    } else {
      showSnackbar(`Error: ${result.error}`, 'error');
    }
  };

  const handleRemoveCancel = () => {
    setShowDeleteModal(false);
    setSymbolToRemove(null);
  };

  const handleRowClick = (stock) => {
    router.push(`/stock/${stock.symbol}`);
  };

  if (loading) {
    return (
      <>
        <Head>
          <title>Watchlist - Stock Screener</title>
        </Head>
        <LoadingSpinner text="Loading watchlist..." />
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Watchlist - Stock Screener</title>
        <meta name="description" content="Your stock watchlist" />
      </Head>

      <div>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="page-header">My Watchlist</h1>
            {watchlist.length > 0 && (
              <p className="section-subtitle mt-1">
                {watchlist.length} stock{watchlist.length !== 1 ? 's' : ''} tracked
              </p>
            )}
          </div>
          <button
            onClick={fetchWatchlist}
            className="btn btn-sm btn-ghost gap-1.5 text-base-content/50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>

        {watchlist.length === 0 ? (
          <div className="finance-card">
            <div className="p-12 text-center">
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
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
              <h2 className="text-base font-semibold mb-2">Your watchlist is empty</h2>
              <p className="text-sm text-base-content/40 mb-6">
                Start adding stocks to track them here
              </p>
              <button onClick={() => router.push('/screener')} className="btn btn-sm btn-secondary">
                Find Stocks
              </button>
            </div>
          </div>
        ) : (
          <div className="finance-card">
            <div className="overflow-x-auto">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Sector</th>
                    <th className="num">Price</th>
                    <th className="num">Change</th>
                    <th className="num">Change %</th>
                    <th className="num">P/E</th>
                    <th className="num">ROE %</th>
                    <th className="text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {watchlist.map((stock) => (
                    <tr key={stock.symbol} className="cursor-pointer">
                      <td
                        onClick={() => handleRowClick(stock)}
                        className="font-semibold text-secondary"
                      >
                        {stock.symbol}
                      </td>
                      <td onClick={() => handleRowClick(stock)} className="text-base-content/80">
                        {stock.name}
                      </td>
                      <td onClick={() => handleRowClick(stock)}>
                        <span className="finance-badge bg-base-200 text-base-content/60">
                          {stock.sector}
                        </span>
                      </td>
                      <td onClick={() => handleRowClick(stock)} className="num">
                        {formatCurrency(stock.price)}
                      </td>
                      <td
                        onClick={() => handleRowClick(stock)}
                        className={`num ${getChangeColor(stock.change)}`}
                      >
                        {formatChange(stock.change)}
                      </td>
                      <td
                        onClick={() => handleRowClick(stock)}
                        className={`num ${getChangeColor(stock.change_percent)}`}
                      >
                        {formatChange(stock.change_percent)}%
                      </td>
                      <td onClick={() => handleRowClick(stock)} className="num">
                        {formatNumber(stock.pe_ratio)}
                      </td>
                      <td onClick={() => handleRowClick(stock)} className="num">
                        {formatNumber(stock.roe)}
                      </td>
                      <td className="text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveClick(stock.symbol);
                          }}
                          className="text-xs font-medium text-error/60 hover:text-error transition-colors"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={showDeleteModal}
        onClose={handleRemoveCancel}
        title="Remove from Watchlist"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-base-content/60">
            Remove <span className="font-semibold text-base-content">{symbolToRemove}</span> from
            your watchlist?
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={handleRemoveCancel} className="btn btn-sm btn-ghost">
              Cancel
            </button>
            <button onClick={handleRemoveConfirm} className="btn btn-sm btn-error">
              Remove
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export { getServerSideProps } from '../lib/forceServerSide';
