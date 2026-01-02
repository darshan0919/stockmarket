const express = require('express');
const router = express.Router();
const axios = require('axios');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  parseOrderFromPdf,
  parseAmountFromText,
  parseCapacityFromText,
} = require('../api/orderParser');
const { getOrderbookBaseline } = require('../api/orderbookBaselineParser');

// NSE API headers
const NSE_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

/**
 * Fetch order announcements from NSE India API
 * Filters on our side instead of passing subject to NSE
 * @param {string} symbol - Stock symbol
 * @returns {Array} List of order announcements
 */
const fetchOrderAnnouncements = async (symbol) => {
  try {
    // Fetch ALL announcements from NSE (no subject filter)
    const allAnnouncementsUrl = `https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=${encodeURIComponent(
      symbol
    )}`;

    const response = await axios.get(allAnnouncementsUrl, {
      headers: NSE_HEADERS,
      timeout: 15000,
    });

    const allAnnouncements = response.data || [];

    // Filter on our side for order-related announcements
    // Filter 1: Subject/Description contains "Bagging/Receiving of orders/contracts" (case insensitive)
    // Filter 2: Attachment URL contains "Tender_intimation" (case insensitive)
    const orderAnnouncements = allAnnouncements.filter((ann) => {
      const subject = (ann.subject || '').toLowerCase();
      const desc = (ann.desc || '').toLowerCase();
      const attachmentUrl = (ann.attchmntFile || '').toLowerCase();

      // Check if subject or description contains the order subject
      const hasOrderSubject =
        subject.includes('bagging/receiving of orders/contracts') ||
        desc.includes('bagging/receiving of orders/contracts');

      // Check if attachment URL contains "Tender_intimation"
      const hasTenderIntimation = attachmentUrl.includes('tender_intimation');

      // Return true if EITHER condition is met
      return hasOrderSubject || hasTenderIntimation;
    });

    return orderAnnouncements;
  } catch (error) {
    console.error('Error fetching order announcements:', error.message);
    return [];
  }
};

/**
 * Parse NSE date format to ISO date
 * @param {string} dateStr - Date string like "31-Dec-2025 10:30:00"
 * @returns {string} ISO date string
 */
const parseNseDate = (dateStr) => {
  if (!dateStr) return null;

  try {
    const parts = dateStr.split(' ');
    const dateParts = parts[0].split('-');
    const months = {
      Jan: '01',
      Feb: '02',
      Mar: '03',
      Apr: '04',
      May: '05',
      Jun: '06',
      Jul: '07',
      Aug: '08',
      Sep: '09',
      Oct: '10',
      Nov: '11',
      Dec: '12',
    };

    if (dateParts.length === 3) {
      const day = dateParts[0].padStart(2, '0');
      const month = months[dateParts[1]] || '01';
      const year = dateParts[2];
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    console.error('Error parsing date:', dateStr);
  }

  return dateStr;
};

/**
 * GET /api/orders/:symbol
 * Fetch order announcements for a stock (Non-AI mode - no PDF parsing)
 * Returns basic announcement data with attachment URLs and baseline document URL
 */
router.get('/:symbol', async (req, res, next) => {
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

    // Fetch order announcements from NSE
    const announcements = await fetchOrderAnnouncements(upperSymbol);

    // Limit the results
    const limitedAnnouncements = announcements.slice(0, parseInt(limit));

    // Process announcements - NO AI PARSING
    const orders = [];

    for (const ann of limitedAnnouncements) {
      const order = {
        id: `${ann.an_dt}-${ann.seq_id || orders.length}`,
        announcement_date: parseNseDate(ann.an_dt),
        subject: ann.subject || 'Order Announcement',
        description: ann.desc || '',
        attachment_url: ann.attchmntFile || null,
        attachment_text: ann.attchmntText || null,
        company_name: ann.sm_name || symbol,

        // No AI parsing - just raw data
        order_details: null,
        pdf_parsed: false,
        parsing_error: null,
      };

      orders.push(order);
    }

    // Try to get baseline document info (non-AI, just metadata)
    let baselineDocumentUrl = null;
    let baselineDocumentTitle = null;

    try {
      // Attempt to fetch latest annual report or investor presentation
      const annualReportUrl = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getCorpAnnualReport&symbol=${encodeURIComponent(
        upperSymbol
      )}&marketApiType=equities`;

      const annualReportResponse = await axios.get(annualReportUrl, {
        headers: NSE_HEADERS,
        timeout: 5000,
      });

      const annualReports = annualReportResponse.data || [];
      if (annualReports.length > 0) {
        // Get the most recent annual report
        const latestReport = annualReports[0];
        baselineDocumentUrl = latestReport.attchmntFile || null;
        baselineDocumentTitle = latestReport.attchmntText
          ? `Annual Report - ${latestReport.attchmntText}`
          : 'Latest Annual Report';
      }
    } catch (error) {
      console.log('Could not fetch baseline document for', upperSymbol, ':', error.message);
      // Not a critical error, continue without baseline
    }

    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        total_orders: orders.length,
        orders,
        baseline_document_url: baselineDocumentUrl,
        baseline_document_title: baselineDocumentTitle,
        mode: 'non-ai',
      },
    });
  } catch (error) {
    console.error('Error fetching orders:', error.message);
    next(error);
  }
});

/**
 * POST /api/orders/:symbol/parse-pdf
 * Parse a specific PDF attachment to extract order details
 */
router.post('/:symbol/parse-pdf', async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const { attachmentUrl } = req.body;

    if (!attachmentUrl) {
      return res.status(400).json({
        success: false,
        error: 'attachmentUrl is required',
      });
    }

    // Parse the PDF using Gemini AI
    const parsedData = await parseOrderFromPdf(attachmentUrl);

    res.json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        attachment_url: attachmentUrl,
        parsed_data: parsedData,
      },
    });
  } catch (error) {
    console.error('Error parsing PDF:', error.message);
    next(error);
  }
});

/**
 * GET /api/orders/:symbol/full
 * Fetch orders with full PDF parsing (slower but more accurate)
 */
router.get('/:symbol/full', async (req, res, next) => {
  const requestStartTime = Date.now();

  try {
    const { symbol } = req.params;
    const { limit = '20' } = req.query;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required',
      });
    }

    const upperSymbol = symbol.toUpperCase();

    // Fetch order announcements from NSE
    const fetchStartTime = Date.now();
    const announcements = await fetchOrderAnnouncements(upperSymbol);
    const fetchTime = Date.now() - fetchStartTime;

    // Limit for full parsing (as it's expensive)
    const limitedAnnouncements = announcements.slice(0, Math.min(parseInt(limit), 30));

    // Process announcements with PDF parsing
    const orders = [];
    let cacheHits = 0;
    let cacheMisses = 0;
    let totalParseTime = 0;

    const parseStartTime = Date.now();

    for (const ann of limitedAnnouncements) {
      let parsedPdfData = null;
      let parsingError = null;
      let fromCache = false;
      let parseTime = 0;

      // Only parse PDFs that have attachment URLs
      if (ann.attchmntFile) {
        try {
          parsedPdfData = await parseOrderFromPdf(ann.attchmntFile);

          // Extract cache metadata
          if (parsedPdfData?._cache_metadata) {
            fromCache = parsedPdfData._cache_metadata.from_cache;
            parseTime = parsedPdfData._cache_metadata.parse_time_ms || 0;
            totalParseTime += parseTime;

            if (fromCache) {
              cacheHits++;
            } else {
              cacheMisses++;
            }
          }
        } catch (e) {
          parsingError = e.message;
          cacheMisses++;
        }
      }

      // Merge text-based parsing with PDF parsing
      const textOrderValue = parseAmountFromText(ann.desc) || parseAmountFromText(ann.attchmntText);
      const textCapacity =
        parseCapacityFromText(ann.desc) || parseCapacityFromText(ann.attchmntText);

      const pdfOrderDetails = parsedPdfData?.order_details || {};

      const order = {
        id: `${ann.an_dt}-${ann.seq_id || orders.length}`,
        announcement_date: parseNseDate(ann.an_dt),
        subject: ann.subject || 'Order Announcement',
        description: ann.desc || '',
        attachment_url: ann.attchmntFile || null,
        attachment_text: ann.attchmntText || null,
        company_name: ann.sm_name || symbol,

        // Order details - prefer PDF parsed data, fallback to text parsing
        order_details: {
          order_value: pdfOrderDetails.order_value || textOrderValue,
          order_capacity: pdfOrderDetails.order_capacity || textCapacity,
          customer_name: pdfOrderDetails.customer_name || null,
          customer_type: pdfOrderDetails.customer_type || null,
          order_type: pdfOrderDetails.order_type || null,
          project_description: pdfOrderDetails.project_description || ann.desc || null,
          project_location: pdfOrderDetails.project_location || null,
          timeline: pdfOrderDetails.timeline || null,
          payment_terms: pdfOrderDetails.payment_terms || null,
          additional_details: pdfOrderDetails.additional_details || null,
        },

        // PDF parsing metadata
        pdf_parsed: !!parsedPdfData?.extraction_success,
        confidence_score: parsedPdfData?.confidence_score || 0,
        parsing_error: parsingError || parsedPdfData?.error || null,
        from_cache: fromCache,
        parse_time_ms: parseTime,

        // Document info from PDF
        document_info: parsedPdfData?.document_info || null,
      };

      orders.push(order);
    }

    const totalParsingTime = Date.now() - parseStartTime;
    const totalRequestTime = Date.now() - requestStartTime;

    // Calculate summary statistics
    const ordersWithValues = orders.filter((o) => o.order_details?.order_value?.value_in_crore_inr);
    const totalOrderValue = ordersWithValues.reduce(
      (sum, o) => sum + (o.order_details.order_value.value_in_crore_inr || 0),
      0
    );

    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        total_orders: orders.length,
        orders_with_parsed_values: ordersWithValues.length,
        total_order_value_crores: totalOrderValue,
        orders,
        // Timing and cache statistics
        timing: {
          total_request_time_ms: totalRequestTime,
          nse_fetch_time_ms: fetchTime,
          pdf_parsing_time_ms: totalParsingTime,
          average_parse_time_ms: orders.length > 0 ? Math.round(totalParseTime / orders.length) : 0,
        },
        cache_stats: {
          cache_hits: cacheHits,
          cache_misses: cacheMisses,
          cache_hit_rate:
            cacheHits + cacheMisses > 0
              ? Math.round((cacheHits / (cacheHits + cacheMisses)) * 100)
              : 0,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching full orders:', error.message);
    next(error);
  }
});

/**
 * GET /api/orders/:symbol/orderbook
 * Get accumulated order book: baseline + new orders after baseline date
 * No limit - fetches ALL outstanding orders
 */
router.get('/:symbol/orderbook', async (req, res, next) => {
  const requestStartTime = Date.now();

  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required',
      });
    }

    const upperSymbol = symbol.toUpperCase();

    // Step 1: Get baseline order book from annual report / investor presentation
    const baselineResult = await getOrderbookBaseline(upperSymbol);

    if (!baselineResult.success) {
      return res.json({
        success: false,
        error: baselineResult.error,
        documents_checked: baselineResult.documents_checked,
        documents_fetched: baselineResult.documents_fetched,
        parse_errors: baselineResult.parse_errors,
        message:
          'Could not find baseline order book. This company may not publish order book details in their corporate filings. Showing all order announcements instead.',
      });
    }

    const baseline = baselineResult.baseline;
    const baselineDate = new Date(baseline.as_of_date);

    // Step 2: Fetch order announcements from NSE
    const announcements = await fetchOrderAnnouncements(upperSymbol);

    // Step 3: Filter announcements to only include those AFTER the baseline date
    const filteredAnnouncements = announcements.filter((ann) => {
      const annDate = parseNseDate(ann.an_dt);
      if (!annDate) return false;
      return new Date(annDate) > baselineDate;
    });

    // NO LIMIT - Parse ALL announcements for complete order book
    const limitedAnnouncements = filteredAnnouncements;

    // Step 4: Parse order announcements with AI
    const newOrders = [];
    let cacheHits = 0;
    let cacheMisses = 0;
    let totalParseTime = 0;
    let totalNewOrderValue = 0;

    for (const ann of limitedAnnouncements) {
      let parsedPdfData = null;
      let parsingError = null;
      let fromCache = false;
      let parseTime = 0;

      if (ann.attchmntFile) {
        try {
          parsedPdfData = await parseOrderFromPdf(ann.attchmntFile);

          if (parsedPdfData?._cache_metadata) {
            fromCache = parsedPdfData._cache_metadata.from_cache;
            parseTime = parsedPdfData._cache_metadata.parse_time_ms || 0;
            totalParseTime += parseTime;

            if (fromCache) {
              cacheHits++;
            } else {
              cacheMisses++;
            }
          }
        } catch (e) {
          parsingError = e.message;
          cacheMisses++;
        }
      }

      // Get order value from PDF or text parsing
      const textOrderValue = parseAmountFromText(ann.desc) || parseAmountFromText(ann.attchmntText);
      const textCapacity =
        parseCapacityFromText(ann.desc) || parseCapacityFromText(ann.attchmntText);

      const pdfOrderDetails = parsedPdfData?.order_details || {};
      const orderValue = pdfOrderDetails.order_value || textOrderValue;

      // Add to total new order value
      if (orderValue?.value_in_crore_inr) {
        totalNewOrderValue += orderValue.value_in_crore_inr;
      }

      const order = {
        id: `${ann.an_dt}-${ann.seq_id || newOrders.length}`,
        announcement_date: parseNseDate(ann.an_dt),
        subject: ann.subject || 'Order Announcement',
        description: ann.desc || '',
        attachment_url: ann.attchmntFile || null,
        company_name: ann.sm_name || symbol,
        order_details: {
          order_value: orderValue,
          order_capacity: pdfOrderDetails.order_capacity || textCapacity,
          customer_name: pdfOrderDetails.customer_name || null,
          customer_type: pdfOrderDetails.customer_type || null,
          order_type: pdfOrderDetails.order_type || null,
          project_description: pdfOrderDetails.project_description || ann.desc || null,
        },
        pdf_parsed: !!parsedPdfData?.extraction_success,
        confidence_score: parsedPdfData?.confidence_score || 0,
        from_cache: fromCache,
        parse_time_ms: parseTime,
      };

      newOrders.push(order);
    }

    // Step 5: Calculate accumulated order book
    // Note: This is a simplified calculation. In reality, you'd also need to
    // subtract executed orders, but that information is typically not available
    // in order receipt announcements.
    const baselineValue = baseline.order_book_value_crores;
    const accumulatedOrderBook = baselineValue + totalNewOrderValue;

    const totalRequestTime = Date.now() - requestStartTime;

    res.json({
      success: true,
      data: {
        symbol: upperSymbol,

        // Order book summary
        orderbook_summary: {
          baseline_order_book_crores: baselineValue,
          baseline_as_of_date: baseline.as_of_date,
          baseline_reporting_period: baseline.reporting_period,
          baseline_source: baseline.document.type,
          baseline_document: baseline.document.description,

          new_orders_since_baseline_crores: totalNewOrderValue,
          new_orders_count: newOrders.filter(
            (o) => o.order_details?.order_value?.value_in_crore_inr
          ).length,

          // Accumulated = Baseline + New Orders (simplified, doesn't account for executed orders)
          accumulated_order_book_crores: accumulatedOrderBook,
          calculation_note:
            'Accumulated = Baseline + New Orders. Does not subtract executed orders.',
        },

        // Order inflow for the reporting period (latest quarter/year)
        order_inflow: baseline.order_inflow,
        order_book_commentary: baseline.order_book_commentary,

        // Segment breakdown if available
        segment_breakdown: baseline.segment_breakdown,
        execution_timeline: baseline.execution_timeline,

        // New orders since baseline
        new_orders: newOrders,
        total_announcements_after_baseline: filteredAnnouncements.length,

        // Timing and cache stats
        timing: {
          total_request_time_ms: totalRequestTime,
          average_parse_time_ms:
            newOrders.length > 0 ? Math.round(totalParseTime / newOrders.length) : 0,
        },
        cache_stats: {
          cache_hits: cacheHits,
          cache_misses: cacheMisses,
          cache_hit_rate:
            cacheHits + cacheMisses > 0
              ? Math.round((cacheHits / (cacheHits + cacheMisses)) * 100)
              : 0,
          baseline_from_cache: baselineResult._cache_metadata?.from_cache,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching order book:', error.message);
    next(error);
  }
});

/**
 * POST /api/orders/:symbol/download-all
 * Download all order announcement PDFs as a ZIP file
 */
router.post('/:symbol/download-all', async (req, res, next) => {
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

    // Fetch order announcements from NSE
    const announcements = await fetchOrderAnnouncements(upperSymbol);
    const limitedAnnouncements = announcements.slice(0, parseInt(limit));

    // Filter announcements with PDF attachments
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

    // Set response headers for ZIP download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${folderName}.zip"`);

    // Create ZIP archive
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    // Pipe archive to response
    archive.pipe(res);

    // Error handling
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      throw err;
    });

    // Download and add each PDF to the archive
    let successCount = 0;
    let failCount = 0;

    for (const pdf of pdfsToDownload) {
      try {
        console.log(`Downloading PDF ${pdf.index}/${pdfsToDownload.length}: ${pdf.url}`);

        // Download PDF from NSE
        const pdfResponse = await axios.get(pdf.url, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: NSE_HEADERS,
        });

        // Create safe filename
        const safeDescription = pdf.description
          .replace(/[^a-z0-9]/gi, '_')
          .replace(/_+/g, '_')
          .substring(0, 50);

        const filename = `${pdf.date}_${safeDescription}.pdf`;

        // Add file to archive inside the folder
        archive.append(Buffer.from(pdfResponse.data), {
          name: `${folderName}/${filename}`,
        });

        successCount++;
      } catch (err) {
        console.error(`Failed to download PDF ${pdf.index}:`, err.message);
        failCount++;
      }
    }

    // Add a summary file
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

    // Finalize the archive
    await archive.finalize();

    console.log(`ZIP created successfully: ${successCount} files, ${failCount} failed`);
  } catch (error) {
    console.error('Error creating ZIP:', error.message);
    if (!res.headersSent) {
      next(error);
    }
  }
});

/**
 * POST /api/orders/:symbol/download-direct
 * Download all order announcement PDFs directly to Desktop/Stock_Data
 */
router.post('/:symbol/download-direct', async (req, res, next) => {
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

    // Get Desktop path
    const desktopPath = path.join(os.homedir(), 'Desktop');
    const stockDataPath = path.join(desktopPath, 'Stock_Data');
    const targetPath = path.join(stockDataPath, folderName);

    // Create directories if they don't exist
    if (!fs.existsSync(stockDataPath)) {
      fs.mkdirSync(stockDataPath, { recursive: true });
    }
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }

    // Fetch order announcements from NSE
    const announcements = await fetchOrderAnnouncements(upperSymbol);
    const limitedAnnouncements = announcements.slice(0, parseInt(limit));

    // Filter announcements with PDF attachments
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

    // Download and save each PDF
    let successCount = 0;
    let failCount = 0;
    const downloadedFiles = [];

    for (const pdf of pdfsToDownload) {
      try {
        console.log(`Downloading PDF ${pdf.index}/${pdfsToDownload.length}: ${pdf.url}`);

        // Download PDF from NSE
        const pdfResponse = await axios.get(pdf.url, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: NSE_HEADERS,
        });

        // Create safe filename
        const safeDescription = pdf.description
          .replace(/[^a-z0-9]/gi, '_')
          .replace(/_+/g, '_')
          .substring(0, 50);

        const filename = `${pdf.date}_${safeDescription}.pdf`;
        const filePath = path.join(targetPath, filename);

        // Save file
        fs.writeFileSync(filePath, Buffer.from(pdfResponse.data));

        successCount++;
        downloadedFiles.push(filename);
      } catch (err) {
        console.error(`Failed to download PDF ${pdf.index}:`, err.message);
        failCount++;
      }
    }

    // Create README file
    const summary = `Order PDFs for ${upperSymbol}
Downloaded: ${new Date().toISOString()}
Location: ${targetPath}
Total Files: ${successCount}
Failed Downloads: ${failCount}

Files in this folder:
${pdfsToDownload
  .map((pdf, i) => `${i + 1}. ${pdf.date} - ${pdf.description.substring(0, 100)}`)
  .join('\n')}
`;

    fs.writeFileSync(path.join(targetPath, 'README.txt'), summary);

    // Return success response
    res.json({
      success: true,
      data: {
        symbol: upperSymbol,
        folder_name: folderName,
        folder_path: targetPath,
        total_pdfs: pdfsToDownload.length,
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
});

module.exports = router;
