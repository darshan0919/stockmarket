const fs = require('fs');
const path = require('path');

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

module.exports = {
  listPrompts,
  getPromptById,
  PROMPTS_MANIFEST,
  applyPlaceholders,
};
