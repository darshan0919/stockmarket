/**
 * @fileoverview Orders service - business logic for NSE order announcements
 * @module services/ordersService
 * @see {@link docs/API_REFERENCE.md#orders-apis} for Orders API docs
 * @see {@link docs/backend/README.md} for backend overview
 * @see {@link docs/backend/services/ordersService.md} for service docs
 */

const { parseNseDate, isOrderAnnouncement } = require('../../core/utils/nseHelpers');
const { getCorporateAnnouncements } = require('../../core/api/nseIndiaApi');

/**
 * Fetch all announcements from NSE India API
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Array>} List of all announcements
 */
async function fetchAllAnnouncements(symbol) {
  try {
    return await getCorporateAnnouncements(symbol);
  } catch (error) {
    console.error('Error fetching announcements:', error.message);
    return [];
  }
}

/**
 * Filter announcements to only include order-related ones
 * Uses isOrderAnnouncement from nseHelpers
 * @param {Array} announcements - All announcements
 * @returns {Array} Order-related announcements
 * @see {@link module:utils/nseHelpers.isOrderAnnouncement}
 */
function filterOrderAnnouncements(announcements) {
  return announcements.filter(isOrderAnnouncement);
}

/**
 * Fetch order announcements from NSE India API
 * Filters on our side instead of passing subject to NSE
 * @param {string} symbol - Stock symbol
 * @returns {Promise<Array>} List of order announcements
 */
async function fetchOrderAnnouncements(symbol) {
  try {
    const allAnnouncements = await fetchAllAnnouncements(symbol);
    return filterOrderAnnouncements(allAnnouncements);
  } catch (error) {
    console.error('Error fetching order announcements:', error.message);
    return [];
  }
}

/**
 * Find transcript announcements from all announcements (last 1 year)
 * @param {Array} allAnnouncements - All announcements
 * @returns {Array} List of transcript announcements from last 1 year, sorted by date descending
 */
function findTranscriptAnnouncements(allAnnouncements) {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const transcripts = allAnnouncements.filter((ann) => {
    const annDate = parseNseDate(ann.an_dt);
    if (!annDate || new Date(annDate) < oneYearAgo) {
      return false;
    }

    const attachmentText = (ann.attchmntText || '').toLowerCase();
    const attachmentFile = (ann.attchmntFile || '').toLowerCase();

    return attachmentText.includes('transcript') || attachmentFile.includes('transcript');
  });

  transcripts.sort((a, b) => {
    const dateA = new Date(parseNseDate(a.an_dt) || 0);
    const dateB = new Date(parseNseDate(b.an_dt) || 0);
    return dateB - dateA;
  });

  return transcripts;
}

/**
 * Parse amount from announcement text (regex helper)
 * @param {string} text - Text to parse
 * @returns {Object|null} Extracted amount details
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
 * @returns {Object|null} Extracted capacity details
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
  fetchAllAnnouncements,
  filterOrderAnnouncements,
  fetchOrderAnnouncements,
  findTranscriptAnnouncements,
  parseAmountFromText,
  parseCapacityFromText,
};
