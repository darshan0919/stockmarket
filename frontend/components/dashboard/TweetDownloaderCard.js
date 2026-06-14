import { useState } from 'react';
import Modal from '../common/Modal';
import { twitterAPI } from '../../lib/api';
import { useSnackbar } from '../../lib/contexts/SnackbarContext';

/**
 * Dashboard entry that opens a modal to fetch tweets via x.com GraphQL and download JSON.
 * @see {@link docs/frontend/README.md} for frontend architecture
 * @see {@link docs/API_REFERENCE.md#x-twitter-apis}
 */
export default function TweetDownloaderCard() {
  const { showSnackbar } = useSnackbar();
  const [modalOpen, setModalOpen] = useState(false);
  const [handle, setHandle] = useState('');
  const [intervalDays, setIntervalDays] = useState(7);
  const [loading, setLoading] = useState(false);

  /**
   * Trigger browser download of a JSON blob.
   * @param {unknown} payload
   * @param {string} filename
   */
  function downloadJson(payload, filename) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * @param {import('react').FormEvent} e
   */
  async function onSubmit(e) {
    e.preventDefault();
    const trimmed = handle.trim().replace(/^@+/, '');
    if (!trimmed) {
      showSnackbar('Enter a Twitter handle.', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await twitterAPI.fetchTweets({
        handle: trimmed,
        intervalDays: Number(intervalDays),
      });
      const envelope = res.data;
      if (!envelope?.success || !envelope.data) {
        showSnackbar(envelope?.error || 'Could not fetch tweets.', 'error');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      downloadJson(envelope.data, `x-tweets-${trimmed}-${stamp}.json`);
      showSnackbar('JSON downloaded.', 'success');
      setModalOpen(false);
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        'Request failed. Check backend logs and X API credentials.';
      showSnackbar(msg, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="finance-card-hover p-5 text-left group"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-neutral/15 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-5 h-5 text-base-content"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold group-hover:text-secondary transition-colors">
              Tweet Downloader
            </h3>
            <p className="text-xs text-base-content/50 mt-0.5">Export tweets from x.com as JSON</p>
          </div>
        </div>
      </button>

      <Modal
        isOpen={modalOpen}
        onClose={() => !loading && setModalOpen(false)}
        title="Tweet Downloader"
        size="sm"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-base-content/70">
            Fetches posts for the author in the selected lookback window using your server-side
            x.com session credentials.
          </p>
          <label className="form-control w-full" htmlFor="tweet-downloader-handle">
            <span className="label-text text-xs font-medium">Twitter handle (author)</span>
            <input
              id="tweet-downloader-handle"
              type="text"
              className="input input-bordered input-sm w-full mt-1"
              placeholder="elonmusk"
              value={handle}
              onChange={(ev) => setHandle(ev.target.value)}
              disabled={loading}
              autoComplete="off"
            />
          </label>
          <label className="form-control w-full" htmlFor="tweet-downloader-interval">
            <span className="label-text text-xs font-medium">Interval (days)</span>
            <input
              id="tweet-downloader-interval"
              type="number"
              min={1}
              max={365}
              className="input input-bordered input-sm w-full mt-1"
              value={intervalDays}
              onChange={(ev) => setIntervalDays(ev.target.value)}
              disabled={loading}
            />
            <span className="label-text-alt text-base-content/50 mt-1">
              Tweets from the last N days (1–365).
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={loading}
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm min-w-[8rem]"
              disabled={loading}
            >
              {loading ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                'Fetch & download'
              )}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
