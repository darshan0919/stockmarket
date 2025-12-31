const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ModelResponse = require('../models/ModelResponse');

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// Read the order extraction prompt from file
const orderExtractionPrompt = fs.readFileSync(
  path.join(__dirname, '../prompts/order_extraction.txt'),
  'utf-8'
);

const promptHash = crypto.createHash('sha256').update(orderExtractionPrompt).digest('hex');

/**
 * Parse order details from a PDF attachment using Gemini AI
 * @param {string} attachmentUrl - URL to the PDF attachment
 * @returns {Object} Extracted order details with cache metadata
 */
const parseOrderFromPdf = async (attachmentUrl) => {
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
      // If cached response is invalid JSON, continue to re-fetch
      console.log('Cached response invalid, re-fetching:', attachmentUrl);
    }
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  try {
    const response = await axios.post(
      GEMINI_API_URL,
      {
        contents: [
          {
            parts: [
              { text: orderExtractionPrompt },
              {
                file_data: {
                  mime_type: 'application/pdf',
                  file_uri: attachmentUrl,
                },
              },
            ],
          },
        ],
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey,
        },
        timeout: 120000, // 2 minutes timeout
      }
    );

    const extractedText = response.data.candidates[0].content.parts[0].text;

    // Clean the response - remove any markdown formatting if present
    let cleanedText = extractedText.trim();
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.slice(7);
    }
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.slice(3);
    }
    if (cleanedText.endsWith('```')) {
      cleanedText = cleanedText.slice(0, -3);
    }
    cleanedText = cleanedText.trim();

    // Parse JSON
    let parsedData;
    try {
      parsedData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse Gemini response as JSON:', cleanedText);
      parsedData = {
        extraction_success: false,
        error: 'Failed to parse PDF content',
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
    console.error('Error parsing PDF with Gemini:', error.message);

    const parseTime = Date.now() - startTime;

    // Return a structured error response
    return {
      extraction_success: false,
      error: error.message,
      order_details: null,
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
 * Parse amount from announcement text (fallback method)
 * @param {string} text - Text to parse
 * @returns {Object} Extracted amount details
 */
const parseAmountFromText = (text) => {
  if (!text) return null;

  // Pattern for INR amounts
  const patterns = [
    // Rs. X Crore/Cr
    /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d+)?)\s*(Cr(?:ore)?|Lakh|Million|Billion)/gi,
    // X Crore/Lakh
    /([\d,]+(?:\.\d+)?)\s*(Cr(?:ore)?|Lakh)\s*(?:INR|Rs\.?)?/gi,
    // USD/$ amounts
    /(?:USD|\$)\s*([\d,]+(?:\.\d+)?)\s*(Million|Mn|Billion|Bn)?/gi,
    // Amount of Rs. X Cr
    /(?:amount|value|worth)\s+(?:of\s+)?(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d+)?)\s*(Cr(?:ore)?|Lakh)?/gi,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      let amount = parseFloat(match[1].replace(/,/g, ''));
      let unit = (match[2] || 'Crore').toLowerCase();

      // Normalize to Crores
      if (unit.includes('lakh')) {
        amount = amount / 100;
        unit = 'Crore';
      } else if (unit.includes('million') || unit === 'mn') {
        // If USD, convert to INR Crores (1 USD = ~83 INR, 10 million USD = ~83 Crore)
        if (text.toLowerCase().includes('usd') || text.includes('$')) {
          amount = amount * 8.3; // Approximate conversion
        }
        unit = 'Crore';
      } else if (unit.includes('billion') || unit === 'bn') {
        amount = amount * 100; // Approximate for USD billion to INR Crore
        unit = 'Crore';
      }

      return {
        amount,
        currency: 'INR',
        unit: 'Crore',
        value_in_crore_inr: amount,
      };
    }
  }

  return null;
};

/**
 * Parse capacity from announcement text
 * @param {string} text - Text to parse
 * @returns {Object} Extracted capacity details
 */
const parseCapacityFromText = (text) => {
  if (!text) return null;

  const patterns = [
    // X MW/MWp/GW
    /([\d,]+(?:\.\d+)?)\s*(MW|MWp|GW|GWp|MWh)/gi,
    // X tonnes/MT
    /([\d,]+(?:\.\d+)?)\s*(tonnes?|MT|KT)/gi,
    // X units/pieces
    /([\d,]+(?:\.\d+)?)\s*(units?|pcs|pieces)/gi,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      return {
        value: parseFloat(match[1].replace(/,/g, '')),
        unit: match[2].toUpperCase(),
      };
    }
  }

  return null;
};

module.exports = {
  parseOrderFromPdf,
  parseAmountFromText,
  parseCapacityFromText,
};
