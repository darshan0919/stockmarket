/**
 * Fetch announcement PDFs (NSE / StockScans S3) — shared by ZIP download and research workspace writes.
 * @module services/announcementPdfFetch
 */

const axios = require('axios');
const { NSE_HEADERS, parseNseDate } = require('../utils/nseHelpers');

/**
 * @param {{ url?: string, subject?: string, date?: string }} pdf
 * @returns {string}
 */
function buildPdfFilename(pdf) {
  const safeSubject = (pdf.subject || 'announcement')
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_+/g, '_')
    .substring(0, 60);
  const date = parseNseDate(pdf.date) || 'unknown';
  return `${date}_${safeSubject}.pdf`;
}

/**
 * Download each PDF; failures do not throw — each result is ok or failed.
 * @param {Array<{ url?: string, subject?: string, date?: string }>} pdfs
 * @returns {Promise<Array<
 *   | { ok: true, filename: string, buffer: Buffer }
 *   | { ok: false, url: string, error: string }
 * >>}
 */
async function fetchAnnouncementPdfBuffers(pdfs) {
  /** @type {Array<{ ok: true, filename: string, buffer: Buffer } | { ok: false, url: string, error: string }>} */
  const out = [];
  for (const pdf of pdfs) {
    if (!pdf.url) {
      out.push({ ok: false, url: '', error: 'Missing url' });
      continue;
    }
    try {
      const isStockScansS3 =
        typeof pdf.url === 'string' &&
        pdf.url.includes('stockscans-assets.s3.ap-south-1.amazonaws.com');
      const pdfResponse = await axios.get(pdf.url, {
        responseType: 'arraybuffer',
        timeout: 30000,
        headers: isStockScansS3 ? { Accept: 'application/pdf,*/*' } : NSE_HEADERS,
      });
      const filename = buildPdfFilename(pdf);
      out.push({
        ok: true,
        filename,
        buffer: Buffer.from(pdfResponse.data),
      });
    } catch (err) {
      console.error(`Failed to download PDF: ${pdf.url}`, err.message);
      out.push({
        ok: false,
        url: pdf.url,
        error: err.message || 'Download failed',
      });
    }
  }
  return out;
}

module.exports = {
  buildPdfFilename,
  fetchAnnouncementPdfBuffers,
};
