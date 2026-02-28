const fs = require('fs');
const path = require('path');
const { parsePdfWithGemini, hashPrompt } = require('./geminiClient');

// Read the order extraction prompt from file
const orderExtractionPrompt = fs.readFileSync(
  path.join(__dirname, '../prompts/order_extraction.txt'),
  'utf-8'
);

const promptHash = hashPrompt(orderExtractionPrompt);

/**
 * Parse order details from a PDF attachment using Gemini AI
 * @param {string} attachmentUrl - URL to the PDF attachment
 * @returns {Object} Extracted order details with cache metadata
 * @see {@link docs/API_REFERENCE.md#orders-apis} for Orders API docs
 * @see {@link docs/backend/api/orderParser.md} for parser docs
 * @see {@link docs/backend/README.md} for backend API overview
 */
const parseOrderFromPdf = async (attachmentUrl) => {
  return parsePdfWithGemini({
    attachmentUrl,
    prompt: orderExtractionPrompt,
    promptHash,
    timeout: 120000,
    parseJson: true,
    errorShape: { order_details: null, document_info: null },
  });
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
