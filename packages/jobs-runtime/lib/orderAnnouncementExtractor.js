'use strict';

/**
 * orderAnnouncementExtractor.js — deterministic order-VALUE extraction from
 * a single Stockscans corporate announcement (title + description only;
 * see "Known limitation" below re: PDF body text).
 *
 * Mined from live announcements (2026-07-19, NCC/RVNL/PNCINFRA/KEC): order
 * wins are filed under a fixed SEBI LODR Reg-30 category —
 * title === "Announcement under Regulation 30 (LODR)-Award_of_Order_Receipt_of_Order"
 * (sometimes without the "Announcement under..." prefix). This title match
 * is a highly reliable, free CLASSIFIER for "this is an order-win filing" —
 * far more reliable than keyword-searching description text, which varies a
 * lot ("Order(s) received during June 2026", "Receipt of LOA from NMDC
 * Limited", "as per attachment", vs. occasionally "new orders of Rs. 1,180
 * Crores secured by the...").
 *
 * Known limitation: roughly half of real filings put the value ONLY in the
 * attached PDF, not in title/description. This module intentionally does
 * NOT parse PDFs (pdf-parse errored unpredictably in this environment when
 * tried — see docs/ORDER_BOOK_EXTRACTION.md). Those cases surface as
 * AnnouncementValueNotFoundError with `isOrderAnnouncement: true` so the
 * caller knows "this IS an order win, but the value needs the PDF or an
 * LLM read" rather than "this isn't an order announcement at all".
 */

const TITLE_RE = /award.{0,3}of.{0,3}order|receipt.{0,3}of.{0,3}order|award_of_order|receipt_of_order/i;

// e.g. "Rs. 1,180 Crores", "Rs 1180 Cr", "₹798 crore", "worth Rs. 45.6 Cr"
const VALUE_RE = /(?:Rs\.?|₹|INR)\s*([\d][\d,]*\.?\d*)\s*(Cr\.?|Crore|Crores|Lakh|Lakhs|Lac|Lacs|Mn|Million|Bn|Billion)\b/i;

const UNIT_TO_CR = {
  cr: 1, 'cr.': 1, crore: 1, crores: 1,
  lakh: 0.01, lakhs: 0.01, lac: 0.01, lacs: 0.01,
  mn: 0.1, million: 0.1,
  bn: 1000, billion: 1000,
};

class AnnouncementValueNotFoundError extends Error {
  constructor(message, { isOrderAnnouncement }) {
    super(message);
    this.name = 'AnnouncementValueNotFoundError';
    this.isOrderAnnouncement = isOrderAnnouncement;
  }
}

/** True if this announcement's title marks it as an order-win/receipt filing. */
function isOrderAnnouncement(title) {
  return TITLE_RE.test(String(title || ''));
}

/**
 * @param {Object} ann - {title, description, date, ssUrl}
 * @returns {{deltaCr, unit, value, confidence, sourceText}}
 * @throws {AnnouncementValueNotFoundError}
 */
function extractOrderValue(ann) {
  const title = ann.title || '';
  const description = ann.description || '';
  if (!isOrderAnnouncement(title)) {
    throw new AnnouncementValueNotFoundError(
      `Not an order-win/receipt filing (title: "${title}")`, { isOrderAnnouncement: false }
    );
  }
  const m = VALUE_RE.exec(description) || VALUE_RE.exec(title);
  if (!m) {
    throw new AnnouncementValueNotFoundError(
      `Order-win filing but no Rs/₹ value in title+description (likely stated only in the attached PDF): "${description || title}"`,
      { isOrderAnnouncement: true }
    );
  }
  const numeric = parseFloat(m[1].replace(/,/g, ''));
  const unitRaw = m[2].toLowerCase();
  const crMultiplier = UNIT_TO_CR[unitRaw];
  return {
    value: numeric, unit: unitRaw,
    deltaCr: Math.round(numeric * crMultiplier * 100) / 100,
    confidence: 'high',
    sourceText: description || title,
  };
}

module.exports = { isOrderAnnouncement, extractOrderValue, AnnouncementValueNotFoundError, VALUE_RE, TITLE_RE };
