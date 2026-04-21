const fs = require('fs');
const path = require('path');

const { fetchAnnouncementPdfBuffers } = require('../services/announcementPdfFetch');
const { hasUploadedDashboard } = require('./researchDashboardController');
const { runStockscansPack } = require('../services/researchStockscansPack');
const {
  CATEGORY_FOLDERS,
  getResearchRoot,
  parseResearchSymbol,
  getTickerWorkspacePath,
  getExpectedWorkspaceFiles,
  ensureLayout,
  countPdfsInDir,
  writePdfBufferUnique,
} = require('../utils/researchWorkspace');

const PROMPTS_DIR = path.join(__dirname, '../prompts/institutional-equity');

const PROMPTS_MANIFEST = [
  {
    id: 'unified_master',
    label: 'Unified extraction (all 5 document types)',
    phase: 'A',
    filename: 'unified_master.txt',
  },
  {
    id: 'annual_reports',
    label: 'Annual reports only',
    phase: 'A',
    filename: 'annual_reports.txt',
  },
  {
    id: 'concalls',
    label: 'Concalls only',
    phase: 'A',
    filename: 'concalls.txt',
  },
  {
    id: 'investor_presentations',
    label: 'Investor presentations only',
    phase: 'A',
    filename: 'investor_presentations.txt',
  },
  {
    id: 'credit_ratings',
    label: 'Credit rating reports only',
    phase: 'A',
    filename: 'credit_ratings.txt',
  },
  {
    id: 'events_announcements',
    label: 'Events & announcements only',
    phase: 'A',
    filename: 'events_announcements.txt',
  },
  {
    id: 'dashboard_master_v4',
    label: 'Dashboard generator (Project B master)',
    phase: 'B',
    filename: 'dashboard_master_v4.txt',
  },
];

/**
 * GET /api/research-pipeline/prompts
 */
function listPrompts(req, res) {
  res.json({
    success: true,
    data: PROMPTS_MANIFEST.map(({ id, label, phase, filename }) => ({
      id,
      label,
      phase,
      filename,
    })),
  });
}

/**
 * Apply optional company/ticker substitution for chat-ready prompts.
 * @param {string} text
 * @param {string} [company]
 * @param {string} [ticker]
 */
function applyPlaceholders(text, company, ticker) {
  let out = text;
  if (company) {
    out = out.replace(/\[Company name\]/gi, company);
  }
  if (ticker) {
    const t = String(ticker).trim();
    out = out.replace(/\[NSE 9cker\]/g, t);
    out = out.replace(/\[NSE ticker\]/gi, t);
    out = out.replace(/\[TICKER\]/g, t);
  }
  return out;
}

/**
 * GET /api/research-pipeline/prompts/:id
 * Query: company, ticker (optional)
 */
function getPromptById(req, res, next) {
  try {
    const { id } = req.params;
    const entry = PROMPTS_MANIFEST.find((p) => p.id === id);
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Unknown prompt id' });
    }
    const filePath = path.join(PROMPTS_DIR, entry.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(500).json({
        success: false,
        error: `Prompt file missing: ${entry.filename}. Run node scripts/extractInstitutionalPrompts.js`,
      });
    }
    let text = fs.readFileSync(filePath, 'utf8');
    const company = req.query.company ? String(req.query.company) : '';
    const ticker = req.query.ticker ? String(req.query.ticker) : '';
    text = applyPlaceholders(text, company, ticker);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(text);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/research-pipeline/workspace/:symbol/init
 */
function initWorkspace(req, res) {
  const parsed = parseResearchSymbol(req.params.symbol);
  if (!parsed.ok) {
    return res.status(400).json({ success: false, error: parsed.error });
  }
  try {
    const { workspace } = ensureLayout(parsed.symbol);
    return res.json({
      success: true,
      data: {
        workspace,
        researchRoot: getResearchRoot(),
        symbol: parsed.symbol,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to create workspace',
    });
  }
}

/**
 * GET /api/research-pipeline/workspace/:symbol/status
 */
function getWorkspaceStatus(req, res) {
  const parsed = parseResearchSymbol(req.params.symbol);
  if (!parsed.ok) {
    return res.status(400).json({ success: false, error: parsed.error });
  }
  const sym = parsed.symbol;
  const ws = getTickerWorkspacePath(sym);
  const expected = getExpectedWorkspaceFiles(sym);
  /** @type {Record<string, number>} */
  const pdfCounts = {};
  for (const f of CATEGORY_FOLDERS) {
    pdfCounts[f] = countPdfsInDir(path.join(ws, f));
  }
  /** @type {Record<string, boolean>} */
  const extractsPresent = {};
  for (const [key, fname] of Object.entries(expected.extracts)) {
    extractsPresent[key] = fs.existsSync(path.join(ws, fname));
  }
  const extractsAllPresent = Object.values(extractsPresent).every(Boolean);
  const masterDataPresent = fs.existsSync(path.join(ws, expected.masterData));

  return res.json({
    success: true,
    data: {
      researchRoot: getResearchRoot(),
      workspace: ws,
      symbol: sym,
      layoutExists: fs.existsSync(ws),
      pdfCounts,
      eventsPdfCount: pdfCounts.Events_Announcements ?? 0,
      masterDataPresent,
      masterDataFile: expected.masterData,
      extractsPresent,
      extractsAllPresent,
      projectAReady: extractsAllPresent,
      dashboardInApp: hasUploadedDashboard(sym),
    },
  });
}

/**
 * POST /api/research-pipeline/workspace/:symbol/events-pdfs
 * Body: same as POST /api/announcements/:symbol/download — `announcements`, optional `search`
 */
async function saveEventsPdfsToWorkspace(req, res, next) {
  try {
    const parsed = parseResearchSymbol(req.params.symbol);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    const sym = parsed.symbol;
    const { announcements: items, search: searchRaw } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'No announcements provided' });
    }

    const pdfs = items.filter((item) => item.url);
    if (pdfs.length === 0) {
      return res.status(404).json({ success: false, error: 'No PDFs found to download' });
    }

    const { workspace } = ensureLayout(sym);
    const eventsDir = path.join(workspace, 'Events_Announcements');
    const fetched = await fetchAnnouncementPdfBuffers(pdfs);

    const saved = [];
    const failed = [];
    for (const r of fetched) {
      if (r.ok) {
        const written = writePdfBufferUnique(eventsDir, r.filename, r.buffer);
        saved.push(written);
      } else {
        failed.push({ url: r.url, error: r.error });
      }
    }

    return res.json({
      success: true,
      data: {
        workspace,
        eventsDir,
        searchLabel: searchRaw != null ? String(searchRaw).trim() : '',
        saved,
        failed,
        savedCount: saved.length,
        failedCount: failed.length,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/research-pipeline/workspace/:symbol/stockscans-pack
 * Body: { timeSpan: 'm3'|'m6'|'y1'|'y3'|'y5'|'all' }
 * Fetches PDFs via StockScans (per category) for the window and writes under workspace folders.
 */
async function postStockscansPack(req, res, next) {
  try {
    const parsed = parseResearchSymbol(req.params.symbol);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    const raw = req.body?.timeSpan ?? req.body?.time_span;
    const timeSpan = raw != null ? String(raw).trim().toLowerCase() : '';
    const result = await runStockscansPack({ symbol: parsed.symbol, timeSpan });
    return res.json({ success: true, data: result });
  } catch (err) {
    if (err.code === 'INVALID_TIME_SPAN') {
      return res.status(400).json({
        success: false,
        error: err.message || 'Invalid timeSpan',
        code: err.code,
      });
    }
    if (err.code === 'STOCKSCANS_AUTH_REQUIRED') {
      return res.status(503).json({
        success: false,
        error: err.message,
        code: err.code,
      });
    }
    if (
      err.code === 'STOCKSCANS_BAD_COMPANY' ||
      err.code === 'STOCKSCANS_API_ERROR' ||
      err.code === 'STOCKSCANS_HTTP_ERROR'
    ) {
      return res.status(502).json({
        success: false,
        error: err.message,
        code: err.code,
      });
    }
    next(err);
  }
}

module.exports = {
  listPrompts,
  getPromptById,
  initWorkspace,
  getWorkspaceStatus,
  saveEventsPdfsToWorkspace,
  postStockscansPack,
  PROMPTS_MANIFEST,
  applyPlaceholders,
};
