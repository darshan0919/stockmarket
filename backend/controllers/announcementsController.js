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
const { ensureRepoDownloadsRoot } = require('../utils/repoDownloads');
const { searchCompanyAnnouncements } = require('../services/stockscansAnnouncements');
const { fetchAnnouncementPdfBuffers } = require('../services/announcementPdfFetch');

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
 * Fetch raw corporate announcements from NSE (used when StockScans is unavailable)
 * @param {string} upperSymbol - Uppercase NSE symbol
 * @returns {Promise<Array>} NSE announcement objects
 */
async function fetchNseCorporateAnnouncements(upperSymbol) {
  const response = await axios.get('https://www.nseindia.com/api/corporate-announcements', {
    params: {
      index: 'equities',
      symbol: upperSymbol,
    },
    headers: NSE_HEADERS,
    timeout: 15000,
  });
  const raw = response.data;
  return Array.isArray(raw) ? raw : [];
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

module.exports = {
  getAnnouncements,
  downloadAnnouncements,
};
