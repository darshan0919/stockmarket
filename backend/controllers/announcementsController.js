/**
 * @fileoverview Announcements controller - HTTP handler for NSE corporate announcements
 * @module controllers/announcementsController
 * @see {@link docs/API_REFERENCE.md#announcements-apis} for API docs
 */

const axios = require('axios');
const archiver = require('archiver');
const { NSE_HEADERS, parseNseDate } = require('../utils/nseHelpers');

/**
 * Get company announcements from NSE India
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next middleware
 * @route GET /api/announcements/:symbol
 * @see {@link docs/API_REFERENCE.md#announcements-apis} for API docs
 */
const getAnnouncements = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const { index = 'equities' } = req.query;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required',
      });
    }

    const upperSymbol = symbol.toUpperCase();

    const response = await axios.get(`https://www.nseindia.com/api/corporate-announcements`, {
      params: {
        index,
        symbol: upperSymbol,
      },
      headers: NSE_HEADERS,
      timeout: 15000,
    });

    res.json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error('Error fetching announcements:', error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        error: 'Failed to fetch announcements from NSE India',
        details: error.response.data,
      });
    }

    next(error);
  }
};

/**
 * Download announcement PDFs as a ZIP archive
 * Proxies PDF fetches through the server to bypass browser CORS restrictions
 * @param {Object} req - Express request with body.urls array of {url, subject, date}
 * @param {Object} res - Express response (streams ZIP)
 * @param {Function} next - Express next middleware
 * @route POST /api/announcements/:symbol/download
 * @see {@link docs/API_REFERENCE.md#announcements-apis} for API docs
 */
const downloadAnnouncements = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const { announcements: items } = req.body;

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
    const folderName = `${upperSymbol}_announcements_${new Date().toISOString().split('T')[0]}`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);

    const archive = archiver('zip', { zlib: { level: 5 } });
    archive.pipe(res);

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      throw err;
    });

    let successCount = 0;
    let failCount = 0;

    for (const pdf of pdfs) {
      try {
        const pdfResponse = await axios.get(pdf.url, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: NSE_HEADERS,
        });

        const safeSubject = (pdf.subject || 'announcement')
          .replace(/[^a-z0-9]/gi, '_')
          .replace(/_+/g, '_')
          .substring(0, 60);
        const date = parseNseDate(pdf.date) || 'unknown';
        const filename = `${date}_${safeSubject}.pdf`;

        archive.append(Buffer.from(pdfResponse.data), {
          name: `${folderName}/${filename}`,
        });

        successCount++;
      } catch (err) {
        console.error(`Failed to download PDF: ${pdf.url}`, err.message);
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
