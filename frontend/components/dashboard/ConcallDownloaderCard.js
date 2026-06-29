import { useState } from 'react';
import Modal from '../common/Modal';
import { announcementsAPI } from '../../lib/api';
import { useSnackbar } from '../../lib/contexts/SnackbarContext';

/**
 * Trigger browser download of a ZIP blob returned by the concall download API.
 * @param {Blob} blob
 * @param {string} filename
 */
function downloadZipBlob(blob, filename) {
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
 * Dashboard card to download latest earnings-call transcript PDFs for companies in a StockScans saved scan.
 * @see {@link docs/API_REFERENCE.md#download-latest-concall-transcripts-zip}
 */
export default function ConcallDownloaderCard() {
  const { showSnackbar } = useSnackbar();
  const [modalOpen, setModalOpen] = useState(false);
  const [scanUrl, setScanUrl] = useState('');
  const [quarterDate, setQuarterDate] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * @param {import('react').FormEvent} e
   */
  async function onSubmit(e) {
    e.preventDefault();
    const trimmed = scanUrl.trim();
    if (!trimmed) {
      showSnackbar('Paste a StockScans saved scan link.', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await announcementsAPI.downloadLatestConcalls({
        scanUrl: trimmed,
        quarterDate: quarterDate.trim() || undefined,
      });

      const disposition = res.headers['content-disposition'] || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] || 'concalls.zip';
      downloadZipBlob(res.data, filename);

      const missing = res.headers['x-concall-missing'];
      if (missing) {
        showSnackbar(`ZIP downloaded. No transcript for: ${missing}`, 'warning');
      } else {
        showSnackbar('Concall transcripts ZIP downloaded.', 'success');
      }
      setModalOpen(false);
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.message ||
        'Download failed. Check STOCKSCANS_AUTH_TOKEN in .env.';
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
          <div className="w-10 h-10 rounded-lg bg-warning/15 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-5 h-5 text-warning"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold group-hover:text-warning transition-colors">
              Concall Downloader
            </h3>
            <p className="text-xs text-base-content/50 mt-0.5">
              Latest earnings-call PDFs from a StockScans scan
            </p>
          </div>
        </div>
      </button>

      <Modal
        isOpen={modalOpen}
        onClose={() => !loading && setModalOpen(false)}
        title="Download latest concalls"
        size="md"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-base-content/70">
            Paste a saved StockScans scan link (e.g.{' '}
            <code className="text-xs">https://www.stockscans.in/scans/saved/…</code>). The server
            loads companies via StockScans <code className="text-xs">scans/run</code>, fetches
            earnings-call transcripts, and downloads PDFs as a ZIP.
          </p>
          <label className="form-control w-full" htmlFor="concall-downloader-scan-url">
            <span className="label-text text-xs font-medium">Saved scan URL</span>
            <input
              id="concall-downloader-scan-url"
              type="url"
              className="input input-bordered input-sm w-full mt-1 font-mono text-xs"
              placeholder="https://www.stockscans.in/scans/saved/c29a98ebbb568f073162ba24"
              value={scanUrl}
              onChange={(ev) => setScanUrl(ev.target.value)}
              disabled={loading}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="form-control w-full" htmlFor="concall-downloader-quarter">
            <span className="label-text text-xs font-medium">Quarter (optional)</span>
            <input
              id="concall-downloader-quarter"
              type="text"
              className="input input-bordered input-sm w-full mt-1 font-mono"
              placeholder="202603"
              value={quarterDate}
              onChange={(ev) => setQuarterDate(ev.target.value)}
              disabled={loading}
              pattern="\d{6}"
              title="YYYYMM — leave blank for current quarter with lookback"
            />
            <span className="label-text-alt text-base-content/50 mt-1">
              StockScans quarter key (YYYYMM). Empty uses the current quarter and walks back if
              needed.
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
              {loading ? <span className="loading loading-spinner loading-xs" /> : 'Download ZIP'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
