/**
 * Shared Gemini AI client for PDF document parsing with caching
 * Eliminates duplication between orderParser.js, orderbookBaselineParser.js, and geminiApi.js
 * @see {@link docs/backend/api/geminiClient.md} for client docs
 */

const axios = require('axios');
const crypto = require('crypto');
const ModelResponse = require('../models/ModelResponse');

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Clean markdown-wrapped JSON from Gemini response
 * @param {string} text - Raw text from Gemini response
 * @returns {string} Cleaned JSON string
 */
const cleanGeminiJsonResponse = (text) => {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  }
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return cleaned.trim();
};

/**
 * Generate a SHA-256 hash of a prompt string for cache keys
 * @param {string} prompt - The prompt text
 * @returns {string} Hex-encoded hash
 */
const hashPrompt = (prompt) => {
  return crypto.createHash('sha256').update(prompt).digest('hex');
};

/**
 * Check the ModelResponse cache for an existing result
 * @param {string} attachmentKey - Unique identifier for the attachment
 * @param {string} promptHashValue - Hash of the prompt used
 * @returns {Object|null} Cached data with metadata, or null if not found
 */
const checkCache = async (attachmentKey, promptHashValue) => {
  const existingResponse = await ModelResponse.findOne({
    attachment_name: attachmentKey,
    prompt: promptHashValue,
  });

  if (!existingResponse) return null;

  try {
    const cachedData = JSON.parse(existingResponse.response);
    return {
      data: cachedData,
      cached_at: existingResponse.created_at,
    };
  } catch (e) {
    console.log('Cached response invalid, will re-fetch:', attachmentKey);
    return null;
  }
};

/**
 * Save a response to the ModelResponse cache
 * @param {string} attachmentKey - Unique identifier for the attachment
 * @param {string} promptHashValue - Hash of the prompt used
 * @param {Object|string} responseData - Data to cache
 */
const saveToCache = async (attachmentKey, promptHashValue, responseData) => {
  const serialized = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
  const newModelResponse = new ModelResponse({
    attachment_name: attachmentKey,
    prompt: promptHashValue,
    response: serialized,
  });
  await newModelResponse.save();
};

/**
 * Parse a PDF document using Gemini AI with caching
 * Core shared function used by orderParser, orderbookBaselineParser, and geminiApi
 *
 * @param {Object} options
 * @param {string} options.attachmentUrl - URL to the PDF document
 * @param {string} options.prompt - The prompt to send to Gemini
 * @param {string} options.promptHash - Pre-computed hash of the prompt
 * @param {number} [options.timeout=120000] - Request timeout in ms
 * @param {boolean} [options.parseJson=true] - Whether to parse response as JSON
 * @param {Object} [options.errorShape={}] - Shape of error response fields
 * @returns {Object} Parsed data with _cache_metadata
 */
const parsePdfWithGemini = async ({
  attachmentUrl,
  prompt,
  promptHash: promptHashValue,
  timeout = 120000,
  parseJson = true,
  errorShape = {},
}) => {
  const startTime = Date.now();

  const cached = await checkCache(attachmentUrl, promptHashValue);
  if (cached) {
    const parseTime = Date.now() - startTime;
    return {
      ...cached.data,
      _cache_metadata: {
        from_cache: true,
        cached_at: cached.cached_at,
        parse_time_ms: parseTime,
      },
    };
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
              { text: prompt },
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
        timeout,
      }
    );

    const extractedText = response.data.candidates[0].content.parts[0].text;

    let result;
    if (parseJson) {
      const cleanedText = cleanGeminiJsonResponse(extractedText);
      try {
        result = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error('Failed to parse Gemini response as JSON:', cleanedText.substring(0, 200));
        result = {
          extraction_success: false,
          error: 'Failed to parse document content',
          raw_text: cleanedText.substring(0, 500),
        };
      }
      await saveToCache(attachmentUrl, promptHashValue, result);
    } else {
      result = extractedText;
      await saveToCache(attachmentUrl, promptHashValue, extractedText);
    }

    const parseTime = Date.now() - startTime;
    const resultObj = typeof result === 'string' ? { text: result } : result;

    return {
      ...resultObj,
      _cache_metadata: {
        from_cache: false,
        cached_at: new Date(),
        parse_time_ms: parseTime,
      },
    };
  } catch (error) {
    console.error('Error parsing PDF with Gemini:', error.message);

    const parseTime = Date.now() - startTime;

    return {
      extraction_success: false,
      error: error.message,
      confidence_score: 0,
      ...errorShape,
      _cache_metadata: {
        from_cache: false,
        cached_at: null,
        parse_time_ms: parseTime,
      },
    };
  }
};

module.exports = {
  GEMINI_API_URL,
  cleanGeminiJsonResponse,
  hashPrompt,
  checkCache,
  saveToCache,
  parsePdfWithGemini,
};
