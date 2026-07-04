/**
 * Equity research workspace paths — aligned with `.agents/skills/equity-research` folder layout.
 * @module utils/researchWorkspace
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/** @type {readonly string[]} */
const CATEGORY_FOLDERS = Object.freeze([
  'Annual_Reports',
  'Concalls',
  'Investor_Presentations',
  'Credit_Rating_Reports',
  'Events_Announcements',
]);

const CACHE_DIR = '_cache';

/**
 * Resolve RESEARCH_ROOT from env (default ~/Research). Leading ~ expands to home dir.
 * @returns {string}
 */
function getResearchRoot() {
  const raw = (process.env.RESEARCH_ROOT || '').trim() || path.join(os.homedir(), 'Research');
  if (raw.startsWith('~/') || raw === '~') {
    return path.join(os.homedir(), raw === '~' ? '' : raw.slice(2));
  }
  return path.resolve(raw);
}

/**
 * NSE-style symbol: letters/digits only, 1–30 chars (defensive).
 * @param {unknown} symbol
 * @returns {{ ok: true, symbol: string } | { ok: false, error: string }}
 */
function parseResearchSymbol(symbol) {
  const s = symbol != null ? String(symbol).trim().toUpperCase() : '';
  if (!s || !/^[A-Z0-9]{1,30}$/.test(s)) {
    return { ok: false, error: 'Invalid symbol' };
  }
  return { ok: true, symbol: s };
}

/**
 * Absolute path to ticker workspace: RESEARCH_ROOT/[TICKER]/
 * @param {string} upperSymbol
 * @returns {string}
 */
function getTickerWorkspacePath(upperSymbol) {
  return path.join(getResearchRoot(), upperSymbol);
}

/**
 * Expected Project A output filenames (NSE ticker in uppercase).
 * @param {string} upperSymbol
 * @returns {{ masterData: string, extracts: Record<string, string> }}
 */
function getExpectedWorkspaceFiles(upperSymbol) {
  const t = upperSymbol.toUpperCase();
  return {
    masterData: `${t}_MasterData.xlsx`,
    extracts: {
      ar: `${t}_AR_Extracts.txt`,
      concall: `${t}_Concall.txt`,
      investorPres: `${t}_InvestorPres.txt`,
      ratingReports: `${t}_RatingReports.txt`,
      events: `${t}_Events.txt`,
    },
  };
}

/**
 * Create RESEARCH_ROOT/[SYMBOL]/{category folders,_cache} if missing.
 * @param {string} upperSymbol
 * @returns {{ workspace: string, created: string[] }}
 */
function ensureLayout(upperSymbol) {
  const workspace = getTickerWorkspacePath(upperSymbol);
  const created = [];
  const mkdir = (p) => {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      created.push(p);
    }
  };
  mkdir(workspace);
  for (const f of CATEGORY_FOLDERS) {
    mkdir(path.join(workspace, f));
  }
  mkdir(path.join(workspace, CACHE_DIR));
  return { workspace, created };
}

/**
 * Count PDFs recursively in a directory (non-recursive: top-level only for speed).
 * @param {string} dir
 * @returns {number}
 */
function countPdfsInDir(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return 0;
  return fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.pdf')).length;
}

/**
 * @param {string} upperSymbol
 * @returns {import('fs').Stats | null}
 */
function statIfExists(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

/**
 * Write PDF buffer to dir; if filename exists, append _2, _3, ...
 * @param {string} dir
 * @param {string} filename
 * @param {Buffer} buffer
 * @returns {string} final filename written
 */
function writePdfBufferUnique(dir, filename, buffer) {
  let name = filename;
  let full = path.join(dir, name);
  if (!fs.existsSync(full)) {
    fs.writeFileSync(full, buffer);
    return name;
  }
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  for (let i = 2; i < 10000; i += 1) {
    name = `${stem}_${i}${ext}`;
    full = path.join(dir, name);
    if (!fs.existsSync(full)) {
      fs.writeFileSync(full, buffer);
      return name;
    }
  }
  throw new Error('Could not find unique filename');
}

module.exports = {
  CATEGORY_FOLDERS,
  CACHE_DIR,
  getResearchRoot,
  parseResearchSymbol,
  getTickerWorkspacePath,
  getExpectedWorkspaceFiles,
  ensureLayout,
  countPdfsInDir,
  statIfExists,
  writePdfBufferUnique,
};
