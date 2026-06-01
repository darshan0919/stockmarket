/**
 * Shared NSE India API helpers
 * Consolidates date parsing, headers, and announcement filtering logic
 * used across routes/orders.js, api/orderbookBaselineParser.js, and routes/announcements.js
 * @see {@link docs/backend/utils/nseHelpers.md} for helper docs
 */

const MONTH_MAP = {
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

const MONTH_INDEX_MAP = {
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

/**
 * Static headers for NSE PDF/asset fetches only.
 * For NSE JSON API endpoints use {@link module:api/nseIndiaApi.nseGet} or {@link module:api/nseIndiaApi.getNseHeaders}
 * (session cookies are required).
 */
const NSE_HEADERS = {
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

/**
 * Parse NSE date format to ISO date string
 * @param {string} dateStr - Date string like "31-Dec-2025 10:30:00"
 * @returns {string|null} ISO date string (YYYY-MM-DD) or null
 */
const parseNseDate = (dateStr) => {
  if (!dateStr) return null;

  try {
    const parts = dateStr.split(' ');
    const dateParts = parts[0].split('-');

    if (dateParts.length === 3) {
      const day = dateParts[0].padStart(2, '0');
      const month = MONTH_MAP[dateParts[1]] || '01';
      const year = dateParts[2];
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    console.error('Error parsing NSE date:', dateStr);
  }

  return dateStr;
};

/**
 * Parse NSE date format to a Date object
 * Handles both "31-Dec-2025" and "31-12-2025" formats
 * @param {string} dateStr - Date string
 * @returns {Date|null} Date object or null
 */
const parseNseDateToObject = (dateStr) => {
  if (!dateStr) return null;

  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[0]);
      const month =
        MONTH_INDEX_MAP[parts[1]] !== undefined
          ? MONTH_INDEX_MAP[parts[1]]
          : parseInt(parts[1]) - 1;
      const year = parseInt(parts[2]);
      return new Date(year, month, day);
    }
  } catch (e) {
    console.error('Error parsing NSE date to object:', dateStr);
  }

  return null;
};

/**
 * Parse NSE date format to timestamp string for filenames
 * @param {string} dateStr - Date string like "31-Dec-2025 10:30:00"
 * @returns {string|null} Timestamp string like "2025-12-31T10-30-00"
 */
const parseNseDateToTimestamp = (dateStr) => {
  if (!dateStr) return null;

  try {
    const parts = dateStr.split(' ');
    const dateParts = parts[0].split('-');
    const timePart = parts[1] || '00:00:00';

    if (dateParts.length === 3) {
      const day = dateParts[0].padStart(2, '0');
      const month = MONTH_MAP[dateParts[1]] || '01';
      const year = dateParts[2];
      const time = timePart.replace(/:/g, '-');
      return `${year}-${month}-${day}T${time}`;
    }
  } catch (e) {
    console.error('Error parsing NSE date to timestamp:', dateStr);
  }

  return null;
};

/**
 * Check if an announcement is an order-related announcement
 * @param {Object} ann - NSE announcement object
 * @returns {boolean} True if the announcement is order-related
 */
const isOrderAnnouncement = (ann) => {
  const subject = (ann.subject || '').toLowerCase();
  const desc = (ann.desc || '').toLowerCase();
  const attachmentUrl = (ann.attchmntFile || '').toLowerCase();

  const hasOrderSubject =
    subject.includes('bagging/receiving of orders/contracts') ||
    desc.includes('bagging/receiving of orders/contracts');
  const hasTenderIntimation = attachmentUrl.includes('tender_intimation');

  return hasOrderSubject || hasTenderIntimation;
};

/**
 * Format NSE date for API requests (DD-MM-YYYY)
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
const formatNseDateForApi = (date) => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

module.exports = {
  NSE_HEADERS,
  MONTH_MAP,
  MONTH_INDEX_MAP,
  parseNseDate,
  parseNseDateToObject,
  parseNseDateToTimestamp,
  isOrderAnnouncement,
  formatNseDateForApi,
};
