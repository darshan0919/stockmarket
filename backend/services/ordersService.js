/**
 * @fileoverview Orders service - business logic for NSE order announcements
 * @module services/ordersService
 * @see {@link docs/API_REFERENCE.md#orders-apis} for Orders API docs
 * @see {@link docs/backend/README.md} for backend overview
 * @see {@link docs/backend/services/ordersService.md} for service docs
 */

const { parseNseDate, isOrderAnnouncement } = require('../utils/nseHelpers');
const { getCorporateAnnouncements } = require('../api/nseIndiaApi');

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

module.exports = {
  fetchAllAnnouncements,
  filterOrderAnnouncements,
  fetchOrderAnnouncements,
  findTranscriptAnnouncements,
};
