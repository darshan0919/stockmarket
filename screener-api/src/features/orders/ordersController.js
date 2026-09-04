/**
 * @fileoverview Orders controller - HTTP handlers for order-related endpoints
 * @module controllers/ordersController
 * @see {@link docs/API_REFERENCE.md#orders-apis} for API documentation
 * @see {@link docs/backend/controllers/ordersController.md} for controller docs
 */

const axios = require('axios');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const { PassThrough } = require('stream');
const {
  fetchAllAnnouncements,
  filterOrderAnnouncements,
  fetchOrderAnnouncements,
  findTranscriptAnnouncements,
} = require('./ordersService');
const {
  NSE_HEADERS,
  parseNseDate,
  parseNseDateToTimestamp,
  isOrderAnnouncement,
} = require('../../core/utils/nseHelpers');
const { getQuoteApi } = require('../../core/api/nseIndiaApi');
const { ensureRepoDownloadsRoot } = require('../../core/utils/repoDownloads');

/**
 * GET /api/orders/:symbol
 * Fetch order announcements for a stock (Non-AI mode - no PDF parsing)
 * @route GET /api/orders/:symbol
 * @see {@link docs/API_REFERENCE.md#orders-apis}
 */
async function getOrders(req, res, next) {
  try {
    const { symbol } = req.params;
    const { limit = '50' } = req.query;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required',
      });
    }

    const upperSymbol = symbol.toUpperCase();

    const allAnnouncements = await fetchAllAnnouncements(upperSymbol);
    const orderAnnouncements = filterOrderAnnouncements(allAnnouncements);
    const transcriptAnnouncements = findTranscriptAnnouncements(allAnnouncements);

    const limitedAnnouncements = orderAnnouncements.slice(0, parseInt(limit));

    const orders = [];
    for (const ann of limitedAnnouncements) {
      orders.push({
        id: `${ann.an_dt}-${ann.seq_id || orders.length}`,
        announcement_date: parseNseDate(ann.an_dt),
        subject: ann.subject || 'Order Announcement',
        description: ann.desc || '',
        attachment_url: ann.attchmntFile || null,
        attachment_text: ann.attchmntText || null,
        company_name: ann.sm_name || symbol,
        order_details: null,
        pdf_parsed: false,
        parsing_error: null,
      });
    }

    let baselineDocumentUrl = null;
    let baselineDocumentTitle = null;

    try {
      const annualReports = await getQuoteApi('getCorpAnnualReport', upperSymbol);
      if (annualReports.length > 0) {
        const latestReport = annualReports[0];
        baselineDocumentUrl = latestReport.attchmntFile || null;
        baselineDocumentTitle = latestReport.attchmntText
          ? `Annual Report - ${latestReport.attchmntText}`
          : 'Latest Annual Report';
      }
    } catch (error) {
      console.log('Could not fetch baseline document for', upperSymbol, ':', error.message);
    }

    const latestTranscript = transcriptAnnouncements.length > 0 ? transcriptAnnouncements[0] : null;
    const transcriptData = latestTranscript
      ? {
          announcement_date: parseNseDate(latestTranscript.an_dt),
          attachment_url: latestTranscript.attchmntFile || null,
          attachment_text: latestTranscript.attchmntText || null,
          subject: latestTranscript.subject || 'Earnings Call Transcript',
        }
      : null;

    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        total_orders: orders.length,
        orders,
        baseline_document_url: baselineDocumentUrl,
        baseline_document_title: baselineDocumentTitle,
        latest_transcript: transcriptData,
        mode: 'non-ai',
      },
    });
  } catch (error) {
    console.error('Error fetching orders:', error.message);
    next(error);
  }
}

/**
 * POST /api/orders/:symbol/download-all
 * Download all order announcement PDFs as a ZIP file; also saves a copy under repo `downloads/`.
 * @route POST /api/orders/:symbol/download-all
 * @see {@link docs/API_REFERENCE.md#orders-apis}
 */
async function downloadAll(req, res, next) {
  try {
    const { symbol } = req.params;
    const { limit = '100' } = req.body;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required',
      });
    }

    const upperSymbol = symbol.toUpperCase();
    const folderName = `${upperSymbol}_${new Date().toISOString().split('T')[0]}`;

    const announcements = await fetchOrderAnnouncements(upperSymbol);
    const limitedAnnouncements = announcements.slice(0, parseInt(limit));

    const pdfsToDownload = limitedAnnouncements
      .filter((ann) => ann.attchmntFile)
      .map((ann, index) => ({
        url: ann.attchmntFile,
        date: parseNseDate(ann.an_dt),
        description: ann.attchmntText || ann.desc || 'Order Announcement',
        index: index + 1,
      }));

    if (pdfsToDownload.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No PDFs found to download',
      });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);

    const downloadsRoot = ensureRepoDownloadsRoot();
    const zipFileName = `${folderName}.zip`;
    const zipPath = path.join(downloadsRoot, zipFileName);
    const fileOut = fs.createWriteStream(zipPath);
    const pass = new PassThrough();

    const archive = archiver('zip', {
      zlib: { level: 9 },
    });

    archive.pipe(pass);
    pass.pipe(res);
    pass.pipe(fileOut);

    res.setHeader('X-Saved-To-Repo', path.join('downloads', zipFileName));

    fileOut.on('finish', () => {
      console.log(`Orders ZIP saved to repo: ${zipPath}`);
    });
    fileOut.on('error', (err) => {
      console.error('Failed to write orders ZIP under repo downloads:', err.message);
    });

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      throw err;
    });

    let successCount = 0;
    let failCount = 0;

    for (const pdf of pdfsToDownload) {
      try {
        console.log(`Downloading PDF ${pdf.index}/${pdfsToDownload.length}: ${pdf.url}`);

        const pdfResponse = await axios.get(pdf.url, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: NSE_HEADERS,
        });

        const safeDescription = pdf.description
          .replace(/[^a-z0-9]/gi, '_')
          .replace(/_+/g, '_')
          .substring(0, 50);

        const filename = `${pdf.date}_${safeDescription}.pdf`;

        archive.append(Buffer.from(pdfResponse.data), {
          name: `${folderName}/${filename}`,
        });

        successCount++;
      } catch (err) {
        console.error(`Failed to download PDF ${pdf.index}:`, err.message);
        failCount++;
      }
    }

    const summary = `Order PDFs for ${upperSymbol}
Downloaded: ${new Date().toISOString()}
Total Files: ${successCount}
Failed Downloads: ${failCount}

Files in this folder:
${pdfsToDownload
  .map((pdf, i) => `${i + 1}. ${pdf.date} - ${pdf.description.substring(0, 100)}`)
  .join('\n')}
`;

    archive.append(summary, { name: `${folderName}/README.txt` });

    await archive.finalize();

    console.log(`ZIP created successfully: ${successCount} files, ${failCount} failed`);
  } catch (error) {
    console.error('Error creating ZIP:', error.message);
    if (!res.headersSent) {
      next(error);
    }
  }
}

/**
 * POST /api/orders/:symbol/download-direct
 * Download order (and optional transcript) PDFs into the repository `downloads/` folder
 * @route POST /api/orders/:symbol/download-direct
 * @see {@link docs/API_REFERENCE.md#orders-apis}
 */
async function downloadDirect(req, res, next) {
  try {
    const { symbol } = req.params;
    const {
      limit = '100',
      transcriptUrl = null,
      quarterStartDate = null,
      transcriptDate = null,
    } = req.body;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required',
      });
    }

    const upperSymbol = symbol.toUpperCase();

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const folderName = `${upperSymbol}_${timestamp}`;

    const downloadsRoot = ensureRepoDownloadsRoot();
    const targetPath = path.join(downloadsRoot, folderName);

    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    let announcements = await fetchOrderAnnouncements(upperSymbol);

    if (quarterStartDate) {
      const quarterStart = new Date(quarterStartDate);
      announcements = announcements.filter((ann) => {
        const annDate = parseNseDate(ann.an_dt);
        if (!annDate) return false;
        return new Date(annDate) >= quarterStart;
      });
    }

    const limitedAnnouncements = announcements.slice(0, parseInt(limit));

    const pdfsToDownload = limitedAnnouncements
      .filter((ann) => ann.attchmntFile)
      .map((ann, index) => ({
        url: ann.attchmntFile,
        date: parseNseDate(ann.an_dt),
        timestamp: parseNseDateToTimestamp(ann.an_dt),
        originalDate: ann.an_dt,
        description: ann.attchmntText || ann.desc || 'Order Announcement',
        index: index + 1,
        type: 'order',
      }));

    let successCount = 0;
    let failCount = 0;
    const downloadedFiles = [];

    if (transcriptUrl) {
      try {
        console.log(`Downloading transcript: ${transcriptUrl}`);

        const transcriptResponse = await axios.get(transcriptUrl, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: {
            Referer: 'https://www.bseindia.com/',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });

        let transcriptTimestamp;
        if (transcriptDate) {
          const tDate = new Date(transcriptDate);
          transcriptTimestamp = tDate.toISOString().replace(/[:.]/g, '-').slice(0, -5);
        } else {
          transcriptTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        }

        const transcriptFilename = `${transcriptTimestamp}_Earnings_Call_Transcript.pdf`;
        const transcriptFilePath = path.join(targetPath, transcriptFilename);

        fs.writeFileSync(transcriptFilePath, Buffer.from(transcriptResponse.data));

        successCount++;
        downloadedFiles.push(transcriptFilename);
        console.log(`Transcript downloaded successfully: ${transcriptFilename}`);
      } catch (err) {
        console.error(`Failed to download transcript:`, err.message);
        failCount++;
      }
    }

    for (const pdf of pdfsToDownload) {
      try {
        console.log(`Downloading PDF ${pdf.index}/${pdfsToDownload.length}: ${pdf.url}`);

        const pdfResponse = await axios.get(pdf.url, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: NSE_HEADERS,
        });

        const filename = pdf.timestamp ? `${pdf.timestamp}.pdf` : `${pdf.date}.pdf`;
        const filePath = path.join(targetPath, filename);

        fs.writeFileSync(filePath, Buffer.from(pdfResponse.data));

        successCount++;
        downloadedFiles.push(filename);
      } catch (err) {
        console.error(`Failed to download PDF ${pdf.index}:`, err.message);
        failCount++;
      }
    }

    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        folder_name: folderName,
        folder_path: targetPath,
        total_pdfs: pdfsToDownload.length + (transcriptUrl ? 1 : 0),
        downloaded: successCount,
        failed: failCount,
        files: downloadedFiles,
      },
    });

    console.log(`Download complete: ${successCount} files saved to ${targetPath}`);
  } catch (error) {
    console.error('Error downloading PDFs:', error.message);
    next(error);
  }
}

/**
 * GET /api/orders/:symbol/quarters
 * Get last 8 quarters' order announcements and transcripts
 * @route GET /api/orders/:symbol/quarters
 * @see {@link docs/API_REFERENCE.md#orders-apis}
 */
async function getQuarters(req, res, next) {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required',
      });
    }

    const upperSymbol = symbol.toUpperCase();

    const allAnnouncements = await fetchAllAnnouncements(upperSymbol);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const quarters = [];
    for (let i = 0; i < 8; i++) {
      let quarter, fiscalYear, startDate, endDate;

      const targetMonth = currentMonth - i * 3;
      const targetYear = currentYear;
      const adjustedDate = new Date(targetYear, targetMonth, 1);
      const month = adjustedDate.getMonth();
      const year = adjustedDate.getFullYear();

      if (month >= 3 && month <= 5) {
        quarter = 1;
        fiscalYear = year + 1;
        startDate = new Date(year, 3, 1);
        endDate = new Date(year, 5, 30, 23, 59, 59);
      } else if (month >= 6 && month <= 8) {
        quarter = 2;
        fiscalYear = year + 1;
        startDate = new Date(year, 6, 1);
        endDate = new Date(year, 8, 30, 23, 59, 59);
      } else if (month >= 9 && month <= 11) {
        quarter = 3;
        fiscalYear = year + 1;
        startDate = new Date(year, 9, 1);
        endDate = new Date(year, 11, 31, 23, 59, 59);
      } else {
        quarter = 4;
        fiscalYear = year;
        startDate = new Date(year, 0, 1);
        endDate = new Date(year, 2, 31, 23, 59, 59);
      }

      const fiscalYearShort = String(fiscalYear).slice(-2);
      const periodLabel = `Q${quarter} FY${fiscalYearShort}`;

      quarters.push({
        quarter,
        fiscalYear,
        fiscalYearShort,
        periodLabel,
        startDate,
        endDate,
      });
    }

    const quartersData = quarters.map((q) => {
      const quarterOrders = allAnnouncements
        .filter((ann) => {
          const annDate = parseNseDate(ann.an_dt);
          if (!annDate) return false;
          const date = new Date(annDate);
          return date >= q.startDate && date <= q.endDate;
        })
        .filter(isOrderAnnouncement);

      const quarterTranscripts = allAnnouncements.filter((ann) => {
        const annDate = parseNseDate(ann.an_dt);
        if (!annDate) return false;
        const date = new Date(annDate);
        if (date < q.startDate || date > q.endDate) return false;

        const attachmentText = (ann.attchmntText || '').toLowerCase();
        const attachmentFile = (ann.attchmntFile || '').toLowerCase();

        return attachmentText.includes('transcript') || attachmentFile.includes('transcript');
      });

      const orders = quarterOrders.map((ann) => ({
        announcement_date: parseNseDate(ann.an_dt),
        timestamp: parseNseDateToTimestamp(ann.an_dt),
        subject: ann.subject || 'Order Announcement',
        attachment_url: ann.attchmntFile || null,
        attachment_text: ann.attchmntText || null,
      }));

      const transcripts = quarterTranscripts.map((ann) => ({
        announcement_date: parseNseDate(ann.an_dt),
        timestamp: parseNseDateToTimestamp(ann.an_dt),
        subject: ann.subject || 'Earnings Call Transcript',
        attachment_url: ann.attchmntFile || null,
        attachment_text: ann.attchmntText || null,
      }));

      return {
        quarter: q.quarter,
        fiscalYear: q.fiscalYear,
        fiscalYearShort: q.fiscalYearShort,
        periodLabel: q.periodLabel,
        startDate: q.startDate.toISOString(),
        endDate: q.endDate.toISOString(),
        orders: orders,
        transcripts: transcripts,
        totalOrders: orders.length,
        totalTranscripts: transcripts.length,
      };
    });

    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        quarters: quartersData,
      },
    });
  } catch (error) {
    console.error('Error fetching quarters data:', error.message);
    next(error);
  }
}

/**
 * POST /api/orders/:symbol/download-quarter
 * Download all order announcements and transcripts for a specific quarter
 * @route POST /api/orders/:symbol/download-quarter
 * @see {@link docs/API_REFERENCE.md#orders-apis}
 */
async function downloadQuarter(req, res, next) {
  try {
    const { symbol } = req.params;
    const { quarter, fiscalYear, orders = [], transcripts = [] } = req.body;

    if (!symbol || !quarter || !fiscalYear) {
      return res.status(400).json({
        success: false,
        error: 'Symbol, quarter, and fiscalYear are required',
      });
    }

    const upperSymbol = symbol.toUpperCase();
    const fiscalYearShort = String(fiscalYear).slice(-2);
    const periodLabel = `Q${quarter}_FY${fiscalYearShort}`;

    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const folderName = `${upperSymbol}_${periodLabel}_${timestamp}`;

    const downloadsRoot = ensureRepoDownloadsRoot();
    const targetPath = path.join(downloadsRoot, folderName);

    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    let successCount = 0;
    let failCount = 0;
    const downloadedFiles = [];

    for (const transcript of transcripts) {
      if (!transcript.attachment_url) continue;

      try {
        console.log(`Downloading transcript: ${transcript.attachment_url}`);

        const response = await axios.get(transcript.attachment_url, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: transcript.attachment_url.includes('bseindia.com')
            ? {
                Referer: 'https://www.bseindia.com/',
                'User-Agent':
                  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              }
            : NSE_HEADERS,
        });

        const filename = transcript.timestamp
          ? `${transcript.timestamp}_Earnings_Call_Transcript.pdf`
          : `Transcript_${Date.now()}.pdf`;
        const filePath = path.join(targetPath, filename);

        fs.writeFileSync(filePath, Buffer.from(response.data));

        successCount++;
        downloadedFiles.push(filename);
        console.log(`Downloaded: ${filename}`);
      } catch (err) {
        console.error(`Failed to download transcript:`, err.message);
        failCount++;
      }
    }

    for (const order of orders) {
      if (!order.attachment_url) continue;

      try {
        console.log(`Downloading order: ${order.attachment_url}`);

        const response = await axios.get(order.attachment_url, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: NSE_HEADERS,
        });

        const filename = order.timestamp ? `${order.timestamp}.pdf` : `Order_${Date.now()}.pdf`;
        const filePath = path.join(targetPath, filename);

        fs.writeFileSync(filePath, Buffer.from(response.data));

        successCount++;
        downloadedFiles.push(filename);
      } catch (err) {
        console.error(`Failed to download order:`, err.message);
        failCount++;
      }
    }

    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        quarter: periodLabel,
        folder_name: folderName,
        folder_path: targetPath,
        total_pdfs: orders.length + transcripts.length,
        downloaded: successCount,
        failed: failCount,
        files: downloadedFiles,
      },
    });

    console.log(`Download complete: ${successCount} files saved to ${targetPath}`);
  } catch (error) {
    console.error('Error downloading quarter PDFs:', error.message);
    next(error);
  }
}

module.exports = {
  getOrders,
  downloadAll,
  downloadDirect,
  getQuarters,
  downloadQuarter,
};
