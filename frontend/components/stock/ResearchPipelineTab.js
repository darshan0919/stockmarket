import { useCallback, useEffect, useState } from 'react';
import { getResearchDashboardIframeSrc, researchPipelineAPI, stockAPI } from '../../lib/api';

const STEP_KEY = (sym) => `researchPipelineStep:${sym}`;

/** Same presets as Announcements tab bulk download (StockScans time window). */
const BULK_TIME_SPAN_OPTIONS = [
  { value: 'm3', label: 'Last 3 months' },
  { value: 'm6', label: 'Last 6 months' },
  { value: 'y1', label: 'Last 1 year' },
  { value: 'y3', label: 'Last 3 years' },
  { value: 'y5', label: 'Last 5 years' },
  { value: 'all', label: 'All time' },
];

const STEPS = [
  { id: 'workspace', title: 'Workspace', short: 'Folders' },
  { id: 'acquire', title: 'Acquire PDFs', short: 'PDFs' },
  { id: 'projectA', title: 'Project A — extraction', short: 'Extract' },
  { id: 'projectB', title: 'Project B — dashboard', short: 'Dashboard' },
  { id: 'view', title: 'View in app', short: 'View' },
];

/**
 * Institutional equity research workflow: gated steps, workspace API, prompts, dashboard upload + iframe.
 * @param {{ basicInfo: { name?: string, symbol?: string } }} props
 */
export default function ResearchPipelineTab({ basicInfo }) {
  const company = basicInfo?.name || '';
  const ticker = basicInfo?.symbol || '';
  const symbol = ticker;

  const [currentStep, setCurrentStep] = useState(0);
  const [manifest, setManifest] = useState([]);
  const [manifestError, setManifestError] = useState(null);
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [initBusy, setInitBusy] = useState(false);
  const [bulkTimeSpan, setBulkTimeSpan] = useState('y1');
  const [packBusy, setPackBusy] = useState(false);
  const [manualPdfsOk, setManualPdfsOk] = useState(false);
  const [skipExtracts, setSkipExtracts] = useState(false);
  const [skipMasterData, setSkipMasterData] = useState(false);
  const [hasDashboard, setHasDashboard] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [copyStatus, setCopyStatus] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const refreshStatus = useCallback(async () => {
    if (!symbol) return;
    try {
      setStatusError(null);
      const res = await researchPipelineAPI.getWorkspaceStatus(symbol);
      if (res.data?.success && res.data.data) {
        setStatus(res.data.data);
      }
    } catch (e) {
      setStatus(null);
      setStatusError(e.response?.data?.error || e.message || 'Failed to load workspace status');
    }
  }, [symbol]);

  const refreshDashboardPresence = useCallback(async () => {
    if (!symbol) return;
    try {
      const r = await stockAPI.researchDashboardHead(symbol);
      setHasDashboard(r.status === 200);
    } catch {
      setHasDashboard(false);
    }
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;
    try {
      const raw = localStorage.getItem(STEP_KEY(symbol));
      const n = raw != null ? parseInt(raw, 10) : 0;
      if (!Number.isNaN(n) && n >= 0 && n < STEPS.length) {
        setCurrentStep(n);
      }
    } catch {
      /* ignore */
    }
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;
    try {
      localStorage.setItem(STEP_KEY(symbol), String(currentStep));
    } catch {
      /* ignore */
    }
  }, [symbol, currentStep]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setManifestError(null);
        const res = await researchPipelineAPI.listPrompts();
        if (!cancelled && res.data?.success && Array.isArray(res.data.data)) {
          setManifest(res.data.data);
        }
      } catch (e) {
        if (!cancelled) {
          setManifestError(e.response?.data?.error || e.message || 'Failed to load prompts');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    refreshDashboardPresence();
  }, [refreshDashboardPresence]);

  const copyPrompt = async (id, label) => {
    setCopyStatus(null);
    setActionError(null);
    try {
      const res = await researchPipelineAPI.getPromptText(id, { company, ticker });
      const text = typeof res.data === 'string' ? res.data : String(res.data);
      await navigator.clipboard.writeText(text);
      setCopyStatus(`Copied: ${label}`);
    } catch (e) {
      setCopyStatus(e.response?.data?.error || e.message || 'Copy failed');
    }
  };

  const onInitWorkspace = async () => {
    if (!symbol) return;
    setInitBusy(true);
    setActionError(null);
    try {
      await researchPipelineAPI.initWorkspace(symbol);
      await refreshStatus();
    } catch (e) {
      setActionError(e.response?.data?.error || e.message || 'Init failed');
    } finally {
      setInitBusy(false);
    }
  };

  const onStockscansPackToWorkspace = async () => {
    if (!symbol) return;
    setPackBusy(true);
    setActionError(null);
    setCopyStatus(null);
    try {
      const res = await researchPipelineAPI.stockscansPackToWorkspace(symbol, bulkTimeSpan);
      const d = res.data?.data;
      await refreshStatus();
      if (d?.savedCount === 0) {
        setActionError(
          'No PDFs were saved. Ensure STOCKSCANS_AUTH_TOKEN is set on the API, this symbol exists on StockScans, and the time window includes filings with attachments.'
        );
      } else {
        setCopyStatus(
          `Saved ${d.savedCount} PDF(s) to workspace (${d.failedCount || 0} failed). ` +
            `Queued ${d.totalQueued} attachment(s) for ${d.timeSpan}.`
        );
      }
    } catch (e) {
      const msg = e.response?.data?.error || e.message || 'StockScans pack failed';
      setActionError(msg);
    } finally {
      setPackBusy(false);
    }
  };

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !symbol) return;
    setUploadError(null);
    setUploadBusy(true);
    try {
      await stockAPI.uploadResearchDashboard(symbol, file);
      await refreshDashboardPresence();
      await refreshStatus();
      setIframeKey((k) => k + 1);
    } catch (err) {
      setUploadError(err.response?.data?.error || err.message || 'Upload failed');
    } finally {
      setUploadBusy(false);
    }
  };

  const removeDashboard = async () => {
    if (!symbol) return;
    setUploadError(null);
    try {
      await stockAPI.deleteResearchDashboard(symbol);
      setHasDashboard(false);
      await refreshStatus();
      setIframeKey((k) => k + 1);
    } catch (err) {
      setUploadError(err.response?.data?.error || err.message || 'Delete failed');
    }
  };

  const phaseA = manifest.filter((p) => p.phase === 'A');
  const phaseB = manifest.filter((p) => p.phase === 'B');
  const kickoffExtract = `Company: ${company || '[Company name]'}, Ticker: ${ticker || '[TICKER]'}. Ready to extract.`;
  const kickoffDashboard = `Company: ${company || '[Company name]'}, Ticker: ${ticker || '[TICKER]'}. Files attached. Ready to generate dashboard.`;

  const layoutOk = status?.layoutExists === true;
  const totalPdfCount =
    status?.pdfCounts && typeof status.pdfCounts === 'object'
      ? Object.values(status.pdfCounts).reduce((a, b) => a + (Number(b) || 0), 0)
      : 0;
  const pdfsOk = totalPdfCount > 0 || manualPdfsOk;
  const extractsOk = status?.extractsAllPresent === true || skipExtracts;
  const masterOk = status?.masterDataPresent === true || skipMasterData;

  const canProceed0 = layoutOk;
  const canProceed1 = pdfsOk;
  const canProceed2 = extractsOk;
  const canProceed3 = masterOk;

  const goNext = () => {
    if (currentStep < STEPS.length - 1) setCurrentStep((s) => s + 1);
  };
  const goBack = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
  };

  return (
    <div className="space-y-6 text-sm">
      <div className="rounded-lg border border-base-300/60 bg-base-200/20 px-4 py-3">
        <p className="text-xs text-base-content/60 uppercase tracking-wider mb-1">Context</p>
        <p>
          <span className="text-base-content/50">Company:</span>{' '}
          <span className="font-medium">{company || '—'}</span>
          <span className="mx-2 text-base-content/30">|</span>
          <span className="text-base-content/50">NSE:</span>{' '}
          <span className="font-mono font-semibold">{ticker || '—'}</span>
        </p>
        <p className="text-2xs text-base-content/50 mt-2">
          Guided workflow: complete each step and click <strong>Proceed</strong>. Project A/B still
          run in an external LLM (e.g. Claude) with your files — this tab prepares folders, pulls
          StockScans PDFs into category folders for the interval you pick, and hosts the HTML
          dashboard.
        </p>
      </div>

      {/* Step indicator */}
      <ol className="flex flex-wrap gap-1 sm:gap-2 text-2xs sm:text-xs">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={`rounded-full px-2 py-1 border transition-colors ${
                i === currentStep
                  ? 'border-secondary bg-secondary/15 text-secondary font-medium'
                  : i < currentStep
                    ? 'border-base-300/50 text-base-content/60'
                    : 'border-base-300/30 text-base-content/40'
              }`}
              onClick={() => setCurrentStep(i)}
            >
              {i + 1}. {s.short}
            </button>
          </li>
        ))}
      </ol>

      {actionError && (
        <p
          className="text-error text-2xs rounded-lg border border-error/30 bg-error/5 px-3 py-2"
          role="alert"
        >
          {actionError}
        </p>
      )}
      {copyStatus && !actionError && (
        <p className="text-success text-2xs rounded-lg border border-success/20 bg-success/5 px-3 py-2">
          {copyStatus}
        </p>
      )}

      {/* Step 0 */}
      {currentStep === 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
            Step 1 — Research folder layout
          </h3>
          <p className="text-base-content/70">
            Create the same directory tree the equity-research skills expect under{' '}
            <code className="text-2xs bg-base-200/50 px-1 rounded">RESEARCH_ROOT/[TICKER]/</code>{' '}
            (default <code className="text-2xs">~/Research</code> on the machine running the API).
          </p>
          {status?.researchRoot && (
            <p className="text-2xs text-base-content/60 font-mono break-all">
              researchRoot: {status.researchRoot}
              <br />
              workspace: {status.workspace}
            </p>
          )}
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={initBusy || !symbol}
            onClick={onInitWorkspace}
          >
            {initBusy ? 'Creating…' : 'Create / verify workspace folders'}
          </button>
          {statusError && (
            <p className="text-warning text-2xs" role="status">
              {statusError}
            </p>
          )}
          <ul className="space-y-1 text-base-content/80 font-mono text-2xs sm:text-xs bg-base-200/30 rounded-lg p-4 border border-base-300/40">
            <li>
              <code className="text-secondary">…/Annual_Reports/</code>
            </li>
            <li>
              <code className="text-secondary">…/Concalls/</code>
            </li>
            <li>
              <code className="text-secondary">…/Investor_Presentations/</code>
            </li>
            <li>
              <code className="text-secondary">…/Credit_Rating_Reports/</code>
            </li>
            <li>
              <code className="text-secondary">…/Events_Announcements/</code>
            </li>
            <li>
              <code className="text-secondary">…/{ticker || '[TICKER]'}_MasterData.xlsx</code>{' '}
              (Phase 4)
            </li>
          </ul>
        </section>
      )}

      {/* Step 1 */}
      {currentStep === 1 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
            Step 2 — Download PDFs (StockScans)
          </h3>
          <p className="text-base-content/70">
            Choose a time window. The API loads announcements per category (annual reports,
            transcripts, investor presentations, credit ratings, order / event filings), filters by
            date, dedupes by attachment URL, and saves PDFs under the matching folders on the
            machine running the backend (<code className="text-2xs">Annual_Reports</code>,{' '}
            <code className="text-2xs">Concalls</code>, etc.). Requires{' '}
            <code className="text-2xs">STOCKSCANS_AUTH_TOKEN</code> in{' '}
            <code className="text-2xs">backend/.env</code>.
          </p>
          <label className="form-control w-full max-w-xs">
            <span className="label-text text-2xs opacity-70">Interval</span>
            <select
              className="select select-bordered select-sm w-full"
              value={bulkTimeSpan}
              onChange={(e) => setBulkTimeSpan(e.target.value)}
              aria-label="Time span for PDF download"
            >
              {BULK_TIME_SPAN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={packBusy || !symbol || !layoutOk}
              onClick={onStockscansPackToWorkspace}
            >
              {packBusy ? 'Downloading…' : 'Download PDFs to workspace'}
            </button>
          </div>
          {!layoutOk && <p className="text-warning text-2xs">Complete Step 1 (workspace) first.</p>}
          <label className="flex items-center gap-2 cursor-pointer text-2xs text-base-content/70">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={manualPdfsOk}
              onChange={(e) => setManualPdfsOk(e.target.checked)}
            />
            I already placed PDFs in the workspace folders (skip download)
          </label>
          {status?.pdfCounts && (
            <div className="text-2xs text-base-content/60 font-mono space-y-0.5">
              <p>
                Total PDFs in workspace: <strong>{totalPdfCount}</strong>
              </p>
              {Object.entries(status.pdfCounts).map(([folder, n]) => (
                <p key={folder}>
                  {folder}: {n}
                </p>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Step 2 Project A */}
      {currentStep === 2 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
            Step 3 — Project A (extraction)
          </h3>
          <p className="text-base-content/70 mb-2">
            Run the unified prompt in your LLM with PDFs attached; save outputs next to the folders
            (filenames below). Refresh status after saving files.
          </p>
          <div className="flex flex-wrap gap-2 items-center mb-2">
            <code className="flex-1 min-w-0 break-all text-2xs bg-base-200/50 rounded px-2 py-1.5 border border-base-300/50">
              {kickoffExtract}
            </code>
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => {
                navigator.clipboard.writeText(kickoffExtract);
                setCopyStatus('Copied kickoff line (extraction)');
              }}
            >
              Copy
            </button>
          </div>
          {manifestError && (
            <p className="text-error text-2xs mb-2" role="alert">
              {manifestError}
            </p>
          )}
          <div className="space-y-2">
            {phaseA.map((p) => (
              <div
                key={p.id}
                className="flex flex-wrap items-center gap-2 justify-between rounded-lg border border-base-300/50 px-3 py-2"
              >
                <div>
                  <div className="font-medium text-base-content">{p.label}</div>
                  <div className="text-2xs text-base-content/45">{p.filename}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-xs btn-secondary"
                    onClick={() => copyPrompt(p.id, p.label)}
                  >
                    Copy prompt
                  </button>
                  <a
                    className="btn btn-xs btn-ghost"
                    href={researchPipelineAPI.getPromptAbsoluteUrl(p.id, { company, ticker })}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open raw
                  </a>
                </div>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => refreshStatus()}>
            Refresh file check
          </button>
          {status?.extractsPresent && (
            <ul className="text-2xs font-mono text-base-content/70">
              {Object.entries(status.extractsPresent).map(([k, v]) => (
                <li key={k}>
                  {k}: {v ? '✓' : '—'}
                </li>
              ))}
            </ul>
          )}
          <label className="flex items-center gap-2 cursor-pointer text-2xs text-base-content/70">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={skipExtracts}
              onChange={(e) => setSkipExtracts(e.target.checked)}
            />
            Continue without all five .txt files (not recommended)
          </label>
        </section>
      )}

      {/* Step 3 Project B */}
      {currentStep === 3 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
            Step 4 — Project B (dashboard)
          </h3>
          <p className="text-base-content/70 mb-2">
            Attach: <strong>{ticker || '[TICKER]'}_MasterData.xlsx</strong> (Screener export),{' '}
            <strong>
              {ticker || '[TICKER]'}_AR_Extracts.txt, _Concall.txt, _InvestorPres.txt,
              _RatingReports.txt
            </strong>
            , optional <strong>_Events.txt</strong> / <strong>_Estimates.txt</strong>. After the
            model shows the <strong>PRE-GENERATION BRIEF</strong>, reply <strong>GENERATE</strong>.
          </p>
          <div className="flex flex-wrap gap-2 items-center mb-2">
            <code className="flex-1 min-w-0 break-all text-2xs bg-base-200/50 rounded px-2 py-1.5 border border-base-300/50">
              {kickoffDashboard}
            </code>
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => {
                navigator.clipboard.writeText(kickoffDashboard);
                setCopyStatus('Copied kickoff line (dashboard)');
              }}
            >
              Copy
            </button>
          </div>
          {phaseB.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-2 justify-between rounded-lg border border-base-300/50 px-3 py-2 mb-2"
            >
              <div>
                <div className="font-medium text-base-content">{p.label}</div>
                <div className="text-2xs text-base-content/45">{p.filename}</div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-xs btn-secondary"
                  onClick={() => copyPrompt(p.id, p.label)}
                >
                  Copy prompt
                </button>
                <a
                  className="btn btn-xs btn-ghost"
                  href={researchPipelineAPI.getPromptAbsoluteUrl(p.id, { company, ticker })}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open raw
                </a>
              </div>
            </div>
          ))}
          <p className="text-2xs text-base-content/60">
            MasterData on disk: <strong>{status?.masterDataPresent ? 'yes' : 'no'}</strong> (
            {status?.masterDataFile || '—'})
          </p>
          <label className="flex items-center gap-2 cursor-pointer text-2xs text-base-content/70">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={skipMasterData}
              onChange={(e) => setSkipMasterData(e.target.checked)}
            />
            Continue without MasterData.xlsx (you must still satisfy the prompt)
          </label>
        </section>
      )}

      {/* Step 4 View */}
      {currentStep === 4 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider">
            Step 5 — View dashboard in app
          </h3>
          <p className="text-base-content/70 mb-3">
            Upload the generated{' '}
            <code className="text-2xs">{ticker || '[TICKER]'}_Dashboard.html</code> (max ~25 MB). It
            loads in an iframe with full JavaScript (Chart.js CDN inside the file).
          </p>
          <div className="flex flex-wrap gap-2 items-center mb-3">
            <label className="btn btn-sm btn-primary">
              {uploadBusy ? 'Uploading…' : 'Upload HTML'}
              <input
                type="file"
                accept=".html,.htm,text/html"
                className="hidden"
                disabled={uploadBusy || !symbol}
                onChange={onFileChange}
              />
            </label>
            {hasDashboard && (
              <button
                type="button"
                className="btn btn-sm btn-ghost text-error"
                onClick={removeDashboard}
              >
                Remove uploaded dashboard
              </button>
            )}
          </div>
          {uploadError && (
            <p className="text-error text-2xs mb-2" role="alert">
              {uploadError}
            </p>
          )}
          {!hasDashboard && !uploadBusy && (
            <p className="text-base-content/50 text-2xs mb-2">
              No dashboard uploaded for this symbol yet.
            </p>
          )}
          {hasDashboard && symbol && (
            <iframe
              key={iframeKey}
              title="Institutional equity research dashboard"
              src={getResearchDashboardIframeSrc(symbol)}
              className="w-full min-h-[70vh] rounded-lg border border-base-300/60 bg-base-100"
            />
          )}
        </section>
      )}

      {/* Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-base-300/40">
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={currentStep === 0}
          onClick={goBack}
        >
          Back
        </button>
        <div className="flex gap-2">
          {currentStep === 0 && (
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={!canProceed0}
              onClick={goNext}
            >
              Proceed
            </button>
          )}
          {currentStep === 1 && (
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={!canProceed1}
              onClick={goNext}
            >
              Proceed
            </button>
          )}
          {currentStep === 2 && (
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={!canProceed2}
              onClick={goNext}
            >
              Proceed
            </button>
          )}
          {currentStep === 3 && (
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={!canProceed3}
              onClick={goNext}
            >
              Proceed
            </button>
          )}
          {currentStep === 4 && (
            <span className="text-2xs text-base-content/50 self-center">
              Last step — upload when ready
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
