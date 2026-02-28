/**
 * Order-related utility functions. Generic formatters are re-exported from lib/utils/formatters.
 * @module components/stock/orders/orderUtils
 * @see {@link lib/utils/formatters} for shared formatting utilities
 */

export {
  formatCurrencyWithUnit as formatCurrency,
  formatCapacity,
  formatDate,
  timeAgo,
  formatDuration,
} from '../../../lib/utils/formatters';

/**
 * Get current fiscal quarter info.
 * India follows April-March fiscal year: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar.
 * @param {Date} [date=new Date()] - Date to compute quarter for
 * @returns {Object} Quarter info with quarter, fiscalYear, periodLabel, startDate, endDate
 */
export const getCurrentFiscalQuarter = (date = new Date()) => {
  const month = date.getMonth(); // 0-11
  const year = date.getFullYear();

  let quarter, fiscalYear, startDate, endDate;

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

  return {
    quarter,
    fiscalYear,
    periodLabel,
    startDate,
    endDate,
  };
};

/**
 * Check if a date falls within the current fiscal quarter.
 * @param {string} dateStr - ISO date string
 * @returns {boolean}
 */
export const isInCurrentQuarter = (dateStr) => {
  if (!dateStr) return false;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;

    const { startDate, endDate } = getCurrentFiscalQuarter();
    return date >= startDate && date <= endDate;
  } catch (e) {
    return false;
  }
};

/**
 * Get the unannounced quarter info based on transcript announcement date.
 * The quarter in which the transcript was released is the "announced quarter";
 * the next quarter is the "unannounced quarter" whose orders we need to fetch.
 * @param {Date} transcriptDate - The date the transcript was announced
 * @returns {Object} Unannounced quarter info with startDate and periodLabel
 */
export const getUnannouncedQuarter = (transcriptDate) => {
  if (!transcriptDate || !(transcriptDate instanceof Date) || isNaN(transcriptDate.getTime())) {
    return getCurrentFiscalQuarter();
  }

  const month = transcriptDate.getMonth(); // 0-11
  const year = transcriptDate.getFullYear();

  let unannouncedQuarter, unannouncedFiscalYear, startDate;

  if (month >= 3 && month <= 5) {
    unannouncedQuarter = 1;
    unannouncedFiscalYear = year + 1;
    startDate = new Date(year, 3, 1);
  } else if (month >= 6 && month <= 8) {
    unannouncedQuarter = 2;
    unannouncedFiscalYear = year + 1;
    startDate = new Date(year, 6, 1);
  } else if (month >= 9 && month <= 11) {
    unannouncedQuarter = 3;
    unannouncedFiscalYear = year + 1;
    startDate = new Date(year, 9, 1);
  } else {
    unannouncedQuarter = 4;
    unannouncedFiscalYear = year;
    startDate = new Date(year, 0, 1);
  }

  const fiscalYearShort = String(unannouncedFiscalYear).slice(-2);
  const periodLabel = `Q${unannouncedQuarter} FY${fiscalYearShort}`;

  return {
    quarter: unannouncedQuarter,
    fiscalYear: unannouncedFiscalYear,
    periodLabel,
    startDate,
  };
};
