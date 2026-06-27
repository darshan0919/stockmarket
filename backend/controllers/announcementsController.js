/**
 * @fileoverview Announcements controller — StockScans company announcements search (proxied)
 * @module controllers/announcementsController
 * @see {@link docs/API_REFERENCE.md#announcements-apis} for API docs
 */

const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const axios = require('axios');
const archiver = require('archiver');
const { NSE_HEADERS, parseNseDate } = require('../utils/nseHelpers');
const { getCorporateAnnouncements } = require('../api/nseIndiaApi');
const { ensureRepoDownloadsRoot } = require('../utils/repoDownloads');
const { searchCompanyAnnouncements } = require('../services/stockscansAnnouncements');
const {
  currentQuarterDate,
  resolveLatestEarningsCalls,
} = require('../services/stockscansAnnouncementScan');
const { fetchCompanyIdsFromSavedScanUrl } = require('../services/stockscansSavedScan');
const { fetchAnnouncementPdfBuffers } = require('../services/announcementPdfFetch');
const announcementScansPage = require('../services/stockscansAnnouncementScansPage');
const announcementScanIgnoreStore = require('../services/announcementScanIgnoreStore');

/** @typedef {'auto'|'stockscans'|'nse'} AnnouncementsProviderMode */

/**
 * Normalize `provider` query: explicit stockscans/nse or legacy auto.
 * @param {unknown} raw
 * @returns {AnnouncementsProviderMode}
 */
function normalizeAnnouncementsProvider(raw) {
  const p = raw == null ? '' : String(raw).trim().toLowerCase();
  if (p === 'stockscans' || p === 'nse') return p;
  return 'auto';
}

/**
 * JSON error for forced StockScans mode failures (no NSE fallback).
 * @param {import('express').Response} res
 * @param {Error} err
 * @param {string} companyId
 * @param {string} upperSymbol
 */
function respondStockScansError(res, err, companyId, upperSymbol) {
  const status = err.code === 'STOCKSCANS_AUTH_REQUIRED' ? 503 : 502;
  return res.status(status).json({
    success: false,
    error: err.message || 'StockScans announcements failed',
    code: err.code,
    meta: { provider: 'stockscans', companyId, symbol: upperSymbol },
    details: err.details,
  });
}

/**
 * Sanitize optional search text for ZIP / folder names (matches frontend helper).
 * @param {unknown} raw
 * @returns {string}
 */
function sanitizeSearchForFilename(raw) {
  const t = raw !== undefined && raw !== null ? String(raw).trim() : '';
  if (!t) return '';
  const s = t
    .replace(/[/\\:*?"<>|\x00-\x1f]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 60);
  return s || '';
}

/**
 * Convert StockScans proxy errors to app JSON responses.
 * @param {import('express').Response} res
 * @param {Error} err
 * @returns {import('express').Response}
 */
function respondAnnouncementScanError(res, err) {
  const status =
    err.code === 'STOCKSCANS_AUTH_REQUIRED'
      ? 503
      : err.code === 'STOCKSCANS_SUBSCRIPTION_REQUIRED'
        ? 402
        : err.code === 'INVALID_SCAN_ID' ||
            err.code === 'COMPANY_KEY_REQUIRED' ||
            err.code === 'SCAN_KEY_REQUIRED'
          ? 400
          : 502;
  return res.status(status).json({
    success: false,
    error: err.message || 'StockScans announcement scan failed',
    code: err.code,
    details: err.details,
  });
}

/**
 * Fetch raw corporate announcements from NSE (used when StockScans is unavailable)
 * @param {string} upperSymbol - Uppercase NSE symbol
 * @returns {Promise<Array>} NSE announcement objects
 */
async function fetchNseCorporateAnnouncements(upperSymbol) {
  return getCorporateAnnouncements(upperSymbol);
}

/**
 * Get company announcements via StockScans search API (`companyId` = `NSE:{symbol}`)
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 * @route GET /api/announcements/:symbol
 * @query {string} [search] - Search text (≥3 chars); omitted or shorter uses a broad default on the server
 * @query {number} [offset=0] - Pagination offset
 * @query {string} [provider] - `stockscans` | `nse` | omit/`auto` (try StockScans then NSE)
 * @see {@link docs/API_REFERENCE.md#announcements-apis} for API docs
 */
const getAnnouncements = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const { search = '', offset: offsetRaw, provider: providerRaw } = req.query;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required',
      });
    }

    const upperSymbol = symbol.toUpperCase();
    const companyId = `NSE:${upperSymbol}`;
    const offset = Math.max(0, parseInt(String(offsetRaw), 10) || 0);
    const searchStr = search !== undefined && search !== null ? String(search) : '';
    const providerMode = normalizeAnnouncementsProvider(providerRaw);

    const hasStockScansToken = !!(process.env.STOCKSCANS_AUTH_TOKEN || '').trim();

    if (providerMode === 'nse') {
      const data = await fetchNseCorporateAnnouncements(upperSymbol);
      return res.json({
        success: true,
        data,
        meta: {
          provider: 'nse',
          companyId,
          symbol: upperSymbol,
          note: 'NSE corporate announcements (single page). Use provider=stockscans for full search and pagination.',
        },
      });
    }

    if (providerMode === 'stockscans') {
      try {
        const { data, meta } = await searchCompanyAnnouncements({
          companyId,
          search: searchStr,
          offset,
        });

        return res.json({
          success: true,
          data,
          meta: { ...meta, provider: 'stockscans' },
        });
      } catch (stockErr) {
        console.warn('StockScans announcements failed (provider=stockscans):', stockErr.message);
        return respondStockScansError(res, stockErr, companyId, upperSymbol);
      }
    }

    // providerMode === 'auto'
    if (hasStockScansToken) {
      try {
        const { data, meta } = await searchCompanyAnnouncements({
          companyId,
          search: searchStr,
          offset,
        });

        return res.json({
          success: true,
          data,
          meta: { ...meta, provider: 'stockscans' },
        });
      } catch (stockErr) {
        console.warn('StockScans announcements failed; falling back to NSE:', stockErr.message);
      }
    }

    const data = await fetchNseCorporateAnnouncements(upperSymbol);
    res.json({
      success: true,
      data,
      meta: {
        provider: 'nse',
        companyId,
        symbol: upperSymbol,
        note: hasStockScansToken
          ? 'StockScans unavailable; showing NSE corporate announcements.'
          : 'Set STOCKSCANS_AUTH_TOKEN for StockScans search; showing NSE corporate announcements.',
      },
    });
  } catch (error) {
    console.error('Error fetching announcements:', error.message);

    if (error.response) {
      const upstream = error.response.data;
      const message =
        upstream && typeof upstream === 'object' && typeof upstream.message === 'string'
          ? upstream.message
          : 'Failed to fetch announcements';
      return res.status(502).json({
        success: false,
        error: message,
        details: upstream,
        upstreamStatus: error.response.status,
      });
    }

    next(error);
  }
};

/**
 * Metadata for the announcement-scans clone.
 * @route GET /api/announcements/scans/metadata
 */
const getAnnouncementScanMetadata = async (req, res) => {
  try {
    const data = await announcementScansPage.fetchAnnouncementScanMetadata();
    res.json({ success: true, data });
  } catch (err) {
    respondAnnouncementScanError(res, err);
  }
};

/**
 * Company search used by @company filters.
 * @route GET /api/announcements/scans/company-search?q=
 */
const searchAnnouncementScanCompanies = async (req, res) => {
  try {
    const companies = await announcementScansPage.searchCompanies(req.query.q);
    res.json({ success: true, data: { companies } });
  } catch (err) {
    respondAnnouncementScanError(res, err);
  }
};

/**
 * Authenticated StockScans watchlists for announcement-scan filters.
 * @route GET /api/announcements/scans/watchlists
 */
const getAnnouncementScanWatchlists = async (req, res) => {
  try {
    const watchlists = await announcementScansPage.fetchWatchlists();
    res.json({ success: true, data: { watchlists } });
  } catch (err) {
    respondAnnouncementScanError(res, err);
  }
};

/**
 * Authenticated saved StockScans announcement scans.
 * @route GET /api/announcements/scans/saved
 */
const getSavedAnnouncementScans = async (req, res) => {
  try {
    const scans = await announcementScansPage.fetchSavedAnnouncementScans();
    res.json({ success: true, data: { announcementScans: scans } });
  } catch (err) {
    respondAnnouncementScanError(res, err);
  }
};

/**
 * Create/update a saved StockScans announcement scan.
 * @route PUT /api/announcements/scans/saved
 */
const saveAnnouncementScan = async (req, res) => {
  try {
    const data = await announcementScansPage.saveAnnouncementScan(req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    respondAnnouncementScanError(res, err);
  }
};

/**
 * Persist StockScans announcement-scan order.
 * @route PUT /api/announcements/scans/saved/order
 */
const reorderAnnouncementScans = async (req, res) => {
  try {
    const data = await announcementScansPage.reorderAnnouncementScans(req.body?.scanIds);
    res.json({ success: true, data });
  } catch (err) {
    respondAnnouncementScanError(res, err);
  }
};

/**
 * Delete a saved StockScans announcement scan.
 * @route DELETE /api/announcements/scans/saved/:scanId
 */
const deleteAnnouncementScan = async (req, res) => {
  try {
    const data = await announcementScansPage.deleteAnnouncementScan(req.params.scanId);
    res.json({ success: true, data });
  } catch (err) {
    respondAnnouncementScanError(res, err);
  }
};

/**
 * Run StockScans announcement scan.
 * @route POST /api/announcements/scans/run
 */
const runAnnouncementScan = async (req, res) => {
  try {
    const data = await announcementScansPage.runAnnouncementScan(req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    respondAnnouncementScanError(res, err);
  }
};

/**
 * Keyword/company statistics table for a scan.
 * @route POST /api/announcements/scans/statistics
 */
const getAnnouncementScanStatistics = async (req, res) => {
  try {
    const data = await announcementScansPage.fetchAnnouncementStatistics(req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    respondAnnouncementScanError(res, err);
  }
};

/**
 * Company-level drilldown used from the statistics table.
 * @route POST /api/announcements/scans/company
 */
const getAnnouncementScanCompany = async (req, res) => {
  try {
    const data = await announcementScansPage.fetchCompanyAnnouncements(req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    respondAnnouncementScanError(res, err);
  }
};

/**
 * Local app-only ignore keyword overlays saved under the project data folder.
 * @route GET /api/announcements/scans/ignored-keywords
 */
const getAnnouncementScanIgnoredKeywords = async (req, res) => {
  try {
    const data = await announcementScanIgnoreStore.readIgnoreStore();
    res.json({ success: true, data });
  } catch (err) {
    respondAnnouncementScanError(res, err);
  }
};

/**
 * Save ignore keywords for one announcement scan to a local project file.
 * @route PUT /api/announcements/scans/ignored-keywords
 */
const saveAnnouncementScanIgnoredKeywords = async (req, res) => {
  try {
    const data = await announcementScanIgnoreStore.saveIgnoreKeywords(req.body || {});
    res.json({ success: true, data });
  } catch (err) {
    respondAnnouncementScanError(res, err);
  }
};

/**
 * Download announcement PDFs as a ZIP archive
 * Proxies PDF fetches through the server to bypass browser CORS restrictions
 * @param {Object} req - Express request with body `announcements` array of {url, subject, date}; optional `search` for filename
 * @param {Object} res - Express response (streams ZIP)
 * @param {Function} next - Express next middleware
 * @route POST /api/announcements/:symbol/download
 * Also writes the same ZIP to the repository `downloads/` folder (`utils/repoDownloads.js`).
 * Response header `X-Saved-To-Repo` is set to the relative path under the repo root when the file is written.
 * @see {@link docs/API_REFERENCE.md#announcements-apis} for API docs
 */
const downloadAnnouncements = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const { announcements: items, search: searchRaw } = req.body;

    if (!symbol) {
      return res.status(400).json({ success: false, error: 'Symbol is required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'No announcements provided' });
    }

    const pdfs = items.filter((item) => item.url);
    if (pdfs.length === 0) {
      return res.status(404).json({ success: false, error: 'No PDFs found to download' });
    }

    const upperSymbol = symbol.toUpperCase();
    const dateStr = new Date().toISOString().split('T')[0];
    const searchSeg = sanitizeSearchForFilename(searchRaw);
    const folderName = searchSeg
      ? `${upperSymbol}_announcements_${searchSeg}_${dateStr}`
      : `${upperSymbol}_announcements_${dateStr}`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);

    const downloadsRoot = ensureRepoDownloadsRoot();
    const zipFileName = `${folderName}.zip`;
    const zipPath = path.join(downloadsRoot, zipFileName);
    const fileOut = fs.createWriteStream(zipPath);
    const pass = new PassThrough();

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(pass);
    pass.pipe(res);
    pass.pipe(fileOut);

    res.setHeader('X-Saved-To-Repo', path.join('downloads', zipFileName));

    fileOut.on('finish', () => {
      console.log(`Announcements ZIP saved to repo: ${zipPath}`);
    });
    fileOut.on('error', (err) => {
      console.error('Failed to write announcements ZIP under repo downloads:', err.message);
    });

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      throw err;
    });

    const fetched = await fetchAnnouncementPdfBuffers(pdfs);
    let successCount = 0;
    let failCount = 0;

    for (const r of fetched) {
      if (r.ok) {
        archive.append(r.buffer, {
          name: `${folderName}/${r.filename}`,
        });
        successCount++;
      } else {
        failCount++;
      }
    }

    const summary = `Announcement PDFs for ${upperSymbol}
Downloaded: ${new Date().toISOString()}
Total Files: ${successCount}
Failed Downloads: ${failCount}

Files included:
${pdfs.map((pdf, i) => `${i + 1}. ${parseNseDate(pdf.date) || 'N/A'} - ${(pdf.subject || '').substring(0, 100)}`).join('\n')}
`;

    archive.append(summary, { name: `${folderName}/README.txt` });
    await archive.finalize();

    console.log(`Announcements ZIP for ${upperSymbol}: ${successCount} files, ${failCount} failed`);
  } catch (error) {
    console.error('Error creating announcements ZIP:', error.message);
    if (!res.headersSent) {
      next(error);
    }
  }
};

/**
 * Download latest earnings-call transcript PDFs for companies from a saved StockScans scan URL.
 * Loads scan filters from the saved scan page, runs `POST /api/company/scans/run`, then announcement scan + PDF ZIP.
 * @param {Object} req - Express request; body `scanUrl` (saved scan link or bare scan id); optional `quarterDate`
 * @param {Object} res - Express response (streams ZIP)
 * @param {Function} next - Express next middleware
 * @route POST /api/announcements/concalls/download
 * @see {@link docs/API_REFERENCE.md#download-latest-concall-transcripts-zip} for API docs
 */
const downloadLatestConcalls = async (req, res, next) => {
  try {
    const { scanUrl, quarterDate: quarterDateRaw } = req.body || {};

    const scanUrlStr = scanUrl !== undefined && scanUrl !== null ? String(scanUrl).trim() : '';
    if (!scanUrlStr) {
      return res.status(400).json({
        success: false,
        error: 'scanUrl is required (e.g. https://www.stockscans.in/scans/saved/{scanId})',
      });
    }

    let companyIds;
    let scanMeta;
    try {
      const resolved = await fetchCompanyIdsFromSavedScanUrl(scanUrlStr);
      companyIds = resolved.companyIds;
      scanMeta = resolved.meta;
    } catch (err) {
      if (err.code === 'INVALID_SCAN_URL') {
        return res.status(400).json({ success: false, error: err.message, code: err.code });
      }
      if (err.code === 'STOCKSCANS_SCAN_EMPTY') {
        return res.status(404).json({
          success: false,
          error: err.message,
          code: err.code,
          meta: err.meta,
        });
      }
      if (err.code === 'STOCKSCANS_AUTH_REQUIRED') {
        return res.status(503).json({
          success: false,
          error: err.message,
          code: err.code,
        });
      }
      if (err.code === 'STOCKSCANS_SCAN_NOT_FOUND') {
        return res.status(404).json({ success: false, error: err.message, code: err.code });
      }
      throw err;
    }

    const quarterDate =
      quarterDateRaw != null && String(quarterDateRaw).trim()
        ? String(quarterDateRaw).trim()
        : currentQuarterDate();

    const { announcements, missing, meta } = await resolveLatestEarningsCalls({
      companyIds,
      quarterDate,
    });

    const pdfs = announcements
      .filter((ann) => ann.attchmntFile)
      .map((ann) => ({
        url: ann.attchmntFile,
        subject: `${ann.symbol}_${ann.subject}`,
        date: ann.an_dt,
        companyId: ann.companyId,
        symbol: ann.symbol,
      }));

    if (pdfs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No earnings-call transcripts found for the given companies',
        missing,
        meta: { ...meta, quarterDate },
      });
    }

    const dateStr = new Date().toISOString().split('T')[0];
    const folderName = `concalls_${quarterDate}_${dateStr}`;
    const zipFileName = `${folderName}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    if (missing.length > 0) {
      res.setHeader('X-Concall-Missing', missing.join(','));
    }

    const downloadsRoot = ensureRepoDownloadsRoot();
    const zipPath = path.join(downloadsRoot, zipFileName);
    const fileOut = fs.createWriteStream(zipPath);
    const pass = new PassThrough();

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(pass);
    pass.pipe(res);
    pass.pipe(fileOut);

    res.setHeader('X-Saved-To-Repo', path.join('downloads', zipFileName));

    fileOut.on('finish', () => {
      console.log(`Concall ZIP saved to repo: ${zipPath}`);
    });
    fileOut.on('error', (err) => {
      console.error('Failed to write concall ZIP under repo downloads:', err.message);
    });

    archive.on('error', (err) => {
      console.error('Concall archive error:', err);
      throw err;
    });

    const fetched = await fetchAnnouncementPdfBuffers(pdfs);
    let successCount = 0;
    let failCount = 0;

    for (const r of fetched) {
      if (r.ok) {
        archive.append(r.buffer, { name: `${folderName}/${r.filename}` });
        successCount++;
      } else {
        failCount++;
      }
    }

    const summary = `Latest earnings-call transcripts
Downloaded: ${new Date().toISOString()}
Scan: ${scanMeta?.scanName || scanMeta?.scanId || 'n/a'} (${scanMeta?.scanId || ''})
Scan companies matched: ${scanMeta?.total ?? companyIds.length}
Quarter start: ${quarterDate}
Companies requested: ${companyIds.length}
PDFs saved: ${successCount}
Failed downloads: ${failCount}
Not found: ${missing.length ? missing.join(', ') : 'none'}

Files:
${pdfs.map((pdf, i) => `${i + 1}. ${pdf.symbol} — ${parseNseDate(pdf.date) || 'N/A'} — ${pdf.companyId}`).join('\n')}
`;

    archive.append(summary, { name: `${folderName}/README.txt` });
    await archive.finalize();

    console.log(
      `Concall ZIP: ${successCount} files, ${failCount} failed, ${missing.length} companies without transcript`
    );
  } catch (error) {
    console.error('Error downloading concall ZIP:', error.message);
    if (error.code === 'STOCKSCANS_AUTH_REQUIRED') {
      return res.status(503).json({
        success: false,
        error: error.message,
        code: error.code,
      });
    }
    if (!res.headersSent) {
      next(error);
    }
  }
};

module.exports = {
  getAnnouncements,
  getAnnouncementScanMetadata,
  searchAnnouncementScanCompanies,
  getAnnouncementScanWatchlists,
  getSavedAnnouncementScans,
  saveAnnouncementScan,
  reorderAnnouncementScans,
  deleteAnnouncementScan,
  runAnnouncementScan,
  getAnnouncementScanStatistics,
  getAnnouncementScanCompany,
  getAnnouncementScanIgnoredKeywords,
  saveAnnouncementScanIgnoredKeywords,
  downloadAnnouncements,
  downloadLatestConcalls,
};
