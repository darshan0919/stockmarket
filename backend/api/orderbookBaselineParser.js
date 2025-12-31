const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ModelResponse = require("../models/ModelResponse");
const { getNseCookies } = require("./nseIndiaApi");

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// Read the orderbook baseline prompt from file
const orderbookBaselinePrompt = fs.readFileSync(
  path.join(__dirname, "../prompts/orderbook_baseline.txt"),
  "utf-8"
);

const promptHash = crypto
  .createHash("sha256")
  .update(orderbookBaselinePrompt)
  .digest("hex");

// NSE API headers (base headers, cookies added per request)
const getNseHeaders = async () => {
  const cookies = await getNseCookies();
  return {
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://www.nseindia.com/",
    Connection: "keep-alive",
    ...(cookies && { Cookie: cookies }),
  };
};

/**
 * Fetch annual reports for a symbol from NSE
 * @param {string} symbol - Stock symbol
 * @returns {Array} List of annual reports
 */
const fetchAnnualReports = async (symbol) => {
  try {
    const headers = await getNseHeaders();
    const url = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getCorpAnnualReport&symbol=${encodeURIComponent(
      symbol
    )}&marketApiType=equities`;

    const response = await axios.get(url, {
      headers,
      timeout: 15000,
    });

    return response.data?.data || response.data || [];
  } catch (error) {
    console.error("Error fetching annual reports:", error.message);
    return [];
  }
};

/**
 * Fetch investor presentations for a symbol from NSE
 * @param {string} symbol - Stock symbol
 * @param {number} monthsBack - How many months back to look
 * @returns {Array} List of investor presentations
 */
const fetchInvestorPresentations = async (symbol, monthsBack = 12) => {
  try {
    const headers = await getNseHeaders();
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - monthsBack);

    const formatDate = (date) => {
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };

    const url = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getCorporateAnnouncement&symbol=${encodeURIComponent(
      symbol
    )}&marketApiType=equities&subject=Investor%20Presentation&fromDate=${formatDate(
      fromDate
    )}&toDate=${formatDate(toDate)}`;

    const response = await axios.get(url, {
      headers,
      timeout: 15000,
    });

    return response.data?.data || response.data || [];
  } catch (error) {
    console.error("Error fetching investor presentations:", error.message);
    return [];
  }
};

/**
 * Fetch quarterly/financial results for a symbol from NSE
 * These often contain order book information
 * @param {string} symbol - Stock symbol
 * @param {number} monthsBack - How many months back to look
 * @returns {Array} List of financial results
 */
const fetchFinancialResults = async (symbol, monthsBack = 12) => {
  try {
    const headers = await getNseHeaders();
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - monthsBack);

    const formatDate = (date) => {
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    };

    const url = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getCorporateAnnouncement&symbol=${encodeURIComponent(
      symbol
    )}&marketApiType=equities&subject=Financial%20Results&fromDate=${formatDate(
      fromDate
    )}&toDate=${formatDate(toDate)}`;

    const response = await axios.get(url, {
      headers,
      timeout: 15000,
    });

    return response.data?.data || response.data || [];
  } catch (error) {
    console.error("Error fetching financial results:", error.message);
    return [];
  }
};

/**
 * Parse NSE date format to Date object
 * @param {string} dateStr - Date string like "31-Dec-2025" or "31-12-2025"
 * @returns {Date} Date object
 */
const parseNseDate = (dateStr) => {
  if (!dateStr) return null;

  try {
    // Handle format: "31-Dec-2025"
    const months = {
      Jan: 0,
      Feb: 1,
      Mar: 2,
      Apr: 3,
      May: 4,
      Jun: 5,
      Jul: 6,
      Aug: 7,
      Sep: 8,
      Oct: 9,
      Nov: 10,
      Dec: 11,
    };

    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const day = parseInt(parts[0]);
      const month =
        months[parts[1]] !== undefined
          ? months[parts[1]]
          : parseInt(parts[1]) - 1;
      const year = parseInt(parts[2]);
      return new Date(year, month, day);
    }
  } catch (e) {
    console.error("Error parsing date:", dateStr);
  }

  return null;
};

/**
 * Parse order book baseline from a PDF document using Gemini AI
 * @param {string} attachmentUrl - URL to the PDF attachment
 * @returns {Object} Extracted order book baseline data
 */
const parseOrderbookBaseline = async (attachmentUrl) => {
  const startTime = Date.now();

  // Check if we already have a cached response
  const existingResponse = await ModelResponse.findOne({
    attachment_name: attachmentUrl,
    prompt: promptHash,
  });

  if (existingResponse) {
    try {
      const cachedData = JSON.parse(existingResponse.response);
      const parseTime = Date.now() - startTime;
      return {
        ...cachedData,
        _cache_metadata: {
          from_cache: true,
          cached_at: existingResponse.created_at,
          parse_time_ms: parseTime,
        },
      };
    } catch (e) {
      console.log("Cached response invalid, re-fetching:", attachmentUrl);
    }
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  try {
    const response = await axios.post(
      GEMINI_API_URL,
      {
        contents: [
          {
            parts: [
              { text: orderbookBaselinePrompt },
              {
                file_data: {
                  mime_type: "application/pdf",
                  file_uri: attachmentUrl,
                },
              },
            ],
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        timeout: 180000, // 3 minutes for larger documents
      }
    );

    const extractedText = response.data.candidates[0].content.parts[0].text;

    // Clean the response
    let cleanedText = extractedText.trim();
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.slice(7);
    }
    if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.slice(3);
    }
    if (cleanedText.endsWith("```")) {
      cleanedText = cleanedText.slice(0, -3);
    }
    cleanedText = cleanedText.trim();

    // Parse JSON
    let parsedData;
    try {
      parsedData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("Failed to parse Gemini response as JSON:", cleanedText);
      parsedData = {
        extraction_success: false,
        error: "Failed to parse document content",
        raw_text: cleanedText.substring(0, 500),
      };
    }

    // Cache the response
    const newModelResponse = new ModelResponse({
      attachment_name: attachmentUrl,
      prompt: promptHash,
      response: JSON.stringify(parsedData),
    });
    await newModelResponse.save();

    const parseTime = Date.now() - startTime;

    return {
      ...parsedData,
      _cache_metadata: {
        from_cache: false,
        cached_at: new Date(),
        parse_time_ms: parseTime,
      },
    };
  } catch (error) {
    console.error("Error parsing document with Gemini:", error.message);

    const parseTime = Date.now() - startTime;

    return {
      extraction_success: false,
      error: error.message,
      order_book: null,
      document_info: null,
      confidence_score: 0,
      _cache_metadata: {
        from_cache: false,
        cached_at: null,
        parse_time_ms: parseTime,
      },
    };
  }
};

/**
 * Get the best baseline document (most recent annual report, investor presentation, or financial result)
 * @param {string} symbol - Stock symbol
 * @returns {Object} Best baseline document info with parsed order book
 */
const getOrderbookBaseline = async (symbol) => {
  const upperSymbol = symbol.toUpperCase();

  // Fetch annual reports, investor presentations, and financial results in parallel
  const [annualReports, investorPresentations, financialResults] =
    await Promise.all([
      fetchAnnualReports(upperSymbol),
      fetchInvestorPresentations(upperSymbol, 18), // Extended to 18 months
      fetchFinancialResults(upperSymbol, 12),
    ]);

  console.log(
    `[${upperSymbol}] Fetched documents - Annual Reports: ${
      Array.isArray(annualReports) ? annualReports.length : 0
    }, Investor Presentations: ${
      Array.isArray(investorPresentations) ? investorPresentations.length : 0
    }, Financial Results: ${
      Array.isArray(financialResults) ? financialResults.length : 0
    }`
  );

  // Combine and sort by date (most recent first)
  const allDocuments = [];

  // Process annual reports (priority 1 - most likely to have order book)
  if (Array.isArray(annualReports)) {
    for (const report of annualReports) {
      const date = parseNseDate(report.an_dt || report.date);
      if (date && report.attchmntFile) {
        allDocuments.push({
          type: "Annual Report",
          priority: 1,
          date,
          dateStr: report.an_dt || report.date,
          attachmentUrl: report.attchmntFile,
          description: report.desc || report.subject || "Annual Report",
        });
      }
    }
  }

  // Process investor presentations (priority 2)
  if (Array.isArray(investorPresentations)) {
    for (const pres of investorPresentations) {
      const date = parseNseDate(pres.an_dt || pres.date);
      if (date && pres.attchmntFile) {
        allDocuments.push({
          type: "Investor Presentation",
          priority: 2,
          date,
          dateStr: pres.an_dt || pres.date,
          attachmentUrl: pres.attchmntFile,
          description: pres.desc || pres.subject || "Investor Presentation",
        });
      }
    }
  }

  // Process financial results (priority 3 - may contain order book info)
  if (Array.isArray(financialResults)) {
    for (const result of financialResults) {
      const date = parseNseDate(result.an_dt || result.date);
      if (date && result.attchmntFile) {
        allDocuments.push({
          type: "Financial Results",
          priority: 3,
          date,
          dateStr: result.an_dt || result.date,
          attachmentUrl: result.attchmntFile,
          description: result.desc || result.subject || "Financial Results",
        });
      }
    }
  }

  // Sort by priority first, then by date descending (most recent first)
  allDocuments.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return b.date - a.date;
  });

  if (allDocuments.length === 0) {
    return {
      success: false,
      error:
        "No annual reports, investor presentations, or financial results found for this company",
      baseline: null,
      documents_fetched: {
        annual_reports: Array.isArray(annualReports) ? annualReports.length : 0,
        investor_presentations: Array.isArray(investorPresentations)
          ? investorPresentations.length
          : 0,
        financial_results: Array.isArray(financialResults)
          ? financialResults.length
          : 0,
      },
    };
  }

  // Try to parse documents that might have order book info (try up to 5 documents)
  const documentsToTry = allDocuments.slice(0, 5);
  const errors = [];

  for (const doc of documentsToTry) {
    try {
      console.log(
        `[${upperSymbol}] Trying to parse ${doc.type}: ${doc.description}`
      );
      const parsedData = await parseOrderbookBaseline(doc.attachmentUrl);

      if (
        parsedData.extraction_success &&
        parsedData.order_book?.total_value?.value_in_crore_inr
      ) {
        console.log(
          `[${upperSymbol}] Successfully extracted order book from ${doc.type}`
        );
        return {
          success: true,
          baseline: {
            document: doc,
            parsed_data: parsedData,
            order_book_value_crores:
              parsedData.order_book.total_value.value_in_crore_inr,
            as_of_date: parsedData.order_book.as_of_date,
            reporting_period: parsedData.order_book.reporting_period,
            segment_breakdown: parsedData.order_book.segment_breakdown,
            execution_timeline: parsedData.order_book.execution_timeline,
            // Order inflow for the current period (quarter/year)
            order_inflow: parsedData.order_book.order_inflow_current_period,
            order_book_commentary: parsedData.order_book.order_book_commentary,
          },
          _cache_metadata: parsedData._cache_metadata,
        };
      } else {
        errors.push(`${doc.type}: No order book data found`);
      }
    } catch (e) {
      console.error("Error parsing document:", doc.attachmentUrl, e.message);
      errors.push(`${doc.type}: ${e.message}`);
    }
  }

  return {
    success: false,
    error:
      "Could not extract order book information from available documents. This company may not publish order book details in their filings.",
    documents_checked: documentsToTry.map((d) => `${d.type}: ${d.description}`),
    parse_errors: errors,
    baseline: null,
  };
};

module.exports = {
  fetchAnnualReports,
  fetchInvestorPresentations,
  fetchFinancialResults,
  parseOrderbookBaseline,
  getOrderbookBaseline,
};
