import { useCallback, useEffect, useState } from 'react';
import { getResearchDashboardIframeSrc, researchPipelineAPI, stockAPI } from '../../lib/api';

/**
 * Institutional equity research workflow: folder checklist, prompt copy, dashboard upload + iframe.
 * @param {{ basicInfo: { name?: string, symbol?: string } }} props
 */
export default function ResearchPipelineTab({ basicInfo }) {
  const company = basicInfo?.name || '';
  const ticker = basicInfo?.symbol || '';
  const symbol = ticker;

  const [manifest, setManifest] = useState([]);
  const [manifestError, setManifestError] = useState(null);
  const [hasDashboard, setHasDashboard] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [copyStatus, setCopyStatus] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState(null);

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
    refreshDashboardPresence();
  }, [refreshDashboardPresence]);

  const copyPrompt = async (id, label) => {
    setCopyStatus(null);
    try {
      const res = await researchPipelineAPI.getPromptText(id, { company, ticker });
      const text = typeof res.data === 'string' ? res.data : String(res.data);
      await navigator.clipboard.writeText(text);
      setCopyStatus(`Copied: ${label}`);
    } catch (e) {
      setCopyStatus(e.response?.data?.error || e.message || 'Copy failed');
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
      setIframeKey((k) => k + 1);
    } catch (err) {
      setUploadError(err.response?.data?.error || err.message || 'Delete failed');
    }
  };

  const phaseA = manifest.filter((p) => p.phase === 'A');
  const phaseB = manifest.filter((p) => p.phase === 'B');
  const kickoffExtract = `Company: ${company || '[Company name]'}, Ticker: ${ticker || '[TICKER]'}. Ready to extract.`;
  const kickoffDashboard = `Company: ${company || '[Company name]'}, Ticker: ${ticker || '[TICKER]'}. Files attached. Ready to generate dashboard.`;

  return (
    <div className="space-y-8 text-sm">
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
          Prompts are run in an external LLM (e.g. Claude) with your PDFs or extracts attached. This
          tab loads copy-ready text from the API and can host your generated HTML dashboard.
        </p>
      </div>

      <section>
        <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">
          Phase 1 — Research folder layout
        </h3>
        <ul className="space-y-2 text-base-content/80 font-mono text-2xs sm:text-xs bg-base-200/30 rounded-lg p-4 border border-base-300/40">
          <li>
            <code className="text-secondary">[RESEARCH_ROOT]/Annual_Reports/</code> — annual report
            PDFs
          </li>
          <li>
            <code className="text-secondary">[RESEARCH_ROOT]/Concalls/</code> — concall PDFs
          </li>
          <li>
            <code className="text-secondary">[RESEARCH_ROOT]/Investor_Presentations/</code> — decks
          </li>
          <li>
            <code className="text-secondary">[RESEARCH_ROOT]/Credit_Rating_Reports/</code> — rating
            PDFs
          </li>
          <li>
            <code className="text-secondary">[RESEARCH_ROOT]/Events_Announcements/</code> — filings
            / PR
          </li>
          <li>
            <code className="text-secondary">
              [RESEARCH_ROOT]/{ticker || '[TICKER]'}_MasterData.xlsx
            </code>{' '}
            — Screener.in export (for Phase 3)
          </li>
        </ul>
      </section>

      <section>
        <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">
          Phase 2 — Project A (extraction)
        </h3>
        <p className="text-base-content/70 mb-2">
          Suggested message after attaching PDFs (edit if needed):
        </p>
        <div className="flex flex-wrap gap-2 items-center mb-4">
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
      </section>

      <section>
        <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">
          Phase 3 — Project B (dashboard)
        </h3>
        <p className="text-base-content/70 mb-2">
          Attach: <strong>MasterData.xlsx</strong>,{' '}
          <strong>
            {ticker || '[TICKER]'}_AR_Extracts.txt, _Concall.txt, _InvestorPres.txt,
            _Ra9ngReports.txt
          </strong>
          , optional <strong>_Events.txt</strong> / <strong>_Estimates.txt</strong>. After the model
          shows the <strong>PRE-GENERATION BRIEF</strong>, reply <strong>GENERATE</strong>.
        </p>
        <div className="flex flex-wrap gap-2 items-center mb-4">
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
      </section>

      <section>
        <h3 className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-3">
          Phase 4 — View dashboard in app
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
        {copyStatus && <p className="text-success text-2xs mb-2">{copyStatus}</p>}
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
    </div>
  );
}
