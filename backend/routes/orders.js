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
 * Fetch all announcements from NSE India API
 * @param {string} symbol - Stock symbol
 * @returns {Array} List of all announcements
 */
const fetchAllAnnouncements = async (symbol) => {
  try {
    // Fetch ALL announcements from NSE (no subject filter)
    const allAnnouncementsUrl = `https://www.nseindia.com/api/corporate-announcements?index=equities&symbol=${encodeURIComponent(
      symbol
    )}`;

    const response = await axios.get(allAnnouncementsUrl, {
      headers: NSE_HEADERS,
      timeout: 15000,
    });

    return response.data || [];
  } catch (error) {
    console.error('Error fetching announcements:', error.message);
    return [];
  }
};

/**
 * Fetch order announcements from NSE India API
 * Filters on our side instead of passing subject to NSE
 * @param {string} symbol - Stock symbol
 * @returns {Array} List of order announcements
 */
const fetchOrderAnnouncements = async (symbol) => {
  try {
    const allAnnouncements = await fetchAllAnnouncements(symbol);

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
 * Find transcript announcements from all announcements
 * @param {Array} allAnnouncements - All announcements
 * @returns {Array} List of transcript announcements from last 1 year
 */
const findTranscriptAnnouncements = (allAnnouncements) => {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const transcripts = allAnnouncements.filter((ann) => {
    // Check date - only last 1 year
    const annDate = parseNseDate(ann.an_dt);
    if (!annDate || new Date(annDate) < oneYearAgo) {
      return false;
    }

    const attachmentText = (ann.attchmntText || '').toLowerCase();
    const attachmentFile = (ann.attchmntFile || '').toLowerCase();

    // Check if attchmntText or attchmntFile contains "transcript"
    return attachmentText.includes('transcript') || attachmentFile.includes('transcript');
  });

  // Sort by date descending (newest first)
  transcripts.sort((a, b) => {
    const dateA = new Date(parseNseDate(a.an_dt) || 0);
    const dateB = new Date(parseNseDate(b.an_dt) || 0);
    return dateB - dateA;
  });

  return transcripts;
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
 * Parse NSE date format to timestamp format for filenames
 * @param {string} dateStr - Date string like "31-Dec-2025 10:30:00"
 * @returns {string} Timestamp string like "2025-12-31T10-30-00"
 */
const parseNseDateToTimestamp = (dateStr) => {
  if (!dateStr) return null;

  try {
    const parts = dateStr.split(' ');
    const dateParts = parts[0].split('-');
    const timePart = parts[1] || '00:00:00';

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
      const time = timePart.replace(/:/g, '-');
      return `${year}-${month}-${day}T${time}`;
    }
  } catch (e) {
    console.error('Error parsing date to timestamp:', dateStr);
  }

  return null;
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

    // Fetch all announcements from NSE
    const allAnnouncements = await fetchAllAnnouncements(upperSymbol);

    // Filter for order announcements
    const orderAnnouncements = allAnnouncements.filter((ann) => {
      const subject = (ann.subject || '').toLowerCase();
      const desc = (ann.desc || '').toLowerCase();
      const attachmentUrl = (ann.attchmntFile || '').toLowerCase();

      const hasOrderSubject =
        subject.includes('bagging/receiving of orders/contracts') ||
        desc.includes('bagging/receiving of orders/contracts');

      const hasTenderIntimation = attachmentUrl.includes('tender_intimation');

      return hasOrderSubject || hasTenderIntimation;
    });

    // Find transcript announcements
    const transcriptAnnouncements = findTranscriptAnnouncements(allAnnouncements);

    // Limit the order results
    const limitedAnnouncements = orderAnnouncements.slice(0, parseInt(limit));

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

    // Format transcript data
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
 * Optionally includes transcript PDF and filters by quarter start date
 */
router.post('/:symbol/download-direct', async (req, res, next) => {
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

    // Use timestamp for folder name to allow multiple downloads per day
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: 2025-01-02T14-30-45
    const folderName = `${upperSymbol}_${timestamp}`;

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
    let announcements = await fetchOrderAnnouncements(upperSymbol);

    // Filter by quarter start date if provided
    if (quarterStartDate) {
      const quarterStart = new Date(quarterStartDate);
      announcements = announcements.filter((ann) => {
        const annDate = parseNseDate(ann.an_dt);
        if (!annDate) return false;
        return new Date(annDate) >= quarterStart;
      });
    }

    const limitedAnnouncements = announcements.slice(0, parseInt(limit));

    // Filter announcements with PDF attachments
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

    // Download and save each PDF
    let successCount = 0;
    let failCount = 0;
    const downloadedFiles = [];

    // Download transcript first if provided
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

        // Format transcript date for filename with timestamp
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

    // Download order PDFs
    for (const pdf of pdfsToDownload) {
      try {
        console.log(`Downloading PDF ${pdf.index}/${pdfsToDownload.length}: ${pdf.url}`);

        // Download PDF from NSE
        const pdfResponse = await axios.get(pdf.url, {
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: NSE_HEADERS,
        });

        // Use timestamp for filename to handle multiple files on same day
        const filename = pdf.timestamp ? `${pdf.timestamp}.pdf` : `${pdf.date}.pdf`;
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

    // Return success response
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
});

/**
 * GET /api/orders/:symbol/quarters
 * Get last 8 quarters' order announcements and transcripts
 */
router.get('/:symbol/quarters', async (req, res, next) => {
  try {
    const { symbol } = req.params;

    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required',
      });
    }

    const upperSymbol = symbol.toUpperCase();

    // Fetch all announcements from NSE
    const allAnnouncements = await fetchAllAnnouncements(upperSymbol);

    // Get current date
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Calculate last 8 quarters
    // Q1 = Apr-Jun, Q2 = Jul-Sep, Q3 = Oct-Dec, Q4 = Jan-Mar
    const quarters = [];
    for (let i = 0; i < 8; i++) {
      let quarter, fiscalYear, startDate, endDate;

      // Calculate quarter based on current month minus i quarters
      const targetMonth = currentMonth - i * 3;
      const targetYear = currentYear;
      const adjustedDate = new Date(targetYear, targetMonth, 1);
      const month = adjustedDate.getMonth();
      const year = adjustedDate.getFullYear();

      if (month >= 3 && month <= 5) {
        // Q1: Apr-Jun
        quarter = 1;
        fiscalYear = year + 1;
        startDate = new Date(year, 3, 1);
        endDate = new Date(year, 5, 30, 23, 59, 59);
      } else if (month >= 6 && month <= 8) {
        // Q2: Jul-Sep
        quarter = 2;
        fiscalYear = year + 1;
        startDate = new Date(year, 6, 1);
        endDate = new Date(year, 8, 30, 23, 59, 59);
      } else if (month >= 9 && month <= 11) {
        // Q3: Oct-Dec
        quarter = 3;
        fiscalYear = year + 1;
        startDate = new Date(year, 9, 1);
        endDate = new Date(year, 11, 31, 23, 59, 59);
      } else {
        // Q4: Jan-Mar
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

    // For each quarter, find orders and transcripts
    const quartersData = quarters.map((q) => {
      // Filter orders for this quarter
      const quarterOrders = allAnnouncements
        .filter((ann) => {
          const annDate = parseNseDate(ann.an_dt);
          if (!annDate) return false;
          const date = new Date(annDate);
          return date >= q.startDate && date <= q.endDate;
        })
        .filter((ann) => {
          // Check if it's an order announcement
          const subject = (ann.subject || '').toLowerCase();
          const desc = (ann.desc || '').toLowerCase();
          const attachmentUrl = (ann.attchmntFile || '').toLowerCase();

          const hasOrderSubject =
            subject.includes('bagging/receiving of orders/contracts') ||
            desc.includes('bagging/receiving of orders/contracts');
          const hasTenderIntimation = attachmentUrl.includes('tender_intimation');

          return hasOrderSubject || hasTenderIntimation;
        });

      // Filter transcripts for this quarter
      const quarterTranscripts = allAnnouncements.filter((ann) => {
        const annDate = parseNseDate(ann.an_dt);
        if (!annDate) return false;
        const date = new Date(annDate);
        if (date < q.startDate || date > q.endDate) return false;

        const attachmentText = (ann.attchmntText || '').toLowerCase();
        const attachmentFile = (ann.attchmntFile || '').toLowerCase();

        return attachmentText.includes('transcript') || attachmentFile.includes('transcript');
      });

      // Format the data
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
});

/**
 * POST /api/orders/:symbol/download-quarter
 * Download all order announcements and transcripts for a specific quarter
 */
router.post('/:symbol/download-quarter', async (req, res, next) => {
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

    // Use timestamp for folder name
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const folderName = `${upperSymbol}_${periodLabel}_${timestamp}`;

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

    let successCount = 0;
    let failCount = 0;
    const downloadedFiles = [];

    // Download transcripts
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

    // Download order PDFs
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
});

module.exports = router;
