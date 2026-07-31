'use strict';

/**
 * Unit tests for orderAnnouncementExtractor — classifying a Stockscans
 * announcement as an order win and reading its value from title/description.
 *
 * @file packages/jobs-runtime/test/orderAnnouncementExtractor.test.js
 * @see docs/ORDER_BOOK_EXTRACTION.md
 */

const {
  isOrderAnnouncement,
  isRegulatoryOrder,
  extractOrderValue,
  AnnouncementValueNotFoundError,
} = require('../lib/orderAnnouncementExtractor');

describe('isOrderAnnouncement', () => {
  test('accepts the standard SEBI Reg-30 order-win title', () => {
    expect(
      isOrderAnnouncement('Announcement under Regulation 30 (LODR)-Award_of_Order_Receipt_of_Order')
    ).toBe(true);
  });

  test('accepts the title without the Regulation 30 prefix', () => {
    expect(isOrderAnnouncement('Award of Order / Receipt of Order')).toBe(true);
  });

  test('rejects an unrelated filing', () => {
    expect(isOrderAnnouncement('Board Meeting Intimation')).toBe(false);
  });

  test('rejects a tax authority order despite the matching wording', () => {
    // The regression: this was being added to the order book as a ₹6.47 Cr win.
    expect(isOrderAnnouncement('Intimation For Receipt Of Order From GST Authorities')).toBe(false);
  });

  test.each([
    'Receipt of Order from Income Tax Department',
    'Intimation of receipt of order from CESTAT',
    'Award of Order - penalty imposed by the Adjudicating Authority',
    'Receipt of Order passed by the High Court',
  ])('rejects regulatory/judicial order filing: %s', (title) => {
    expect(isOrderAnnouncement(title)).toBe(false);
  });
});

describe('isRegulatoryOrder', () => {
  test('identifies a GST demand', () => {
    expect(isRegulatoryOrder('Order from GST Authorities')).toBe(true);
  });

  test('leaves a commercial award alone', () => {
    expect(isRegulatoryOrder('Award_of_Order_Receipt_of_Order')).toBe(false);
  });
});

describe('extractOrderValue', () => {
  test('reads a rupee value from the description', () => {
    const r = extractOrderValue({
      title: 'Announcement under Regulation 30 (LODR)-Award_of_Order_Receipt_of_Order',
      description: 'new orders of Rs. 1,180 Crores secured by the Company',
    });
    expect(r.deltaCr).toBe(1180);
    expect(r.confidence).toBe('high');
  });

  test('throws with isOrderAnnouncement true when the value is only in the PDF', () => {
    expect.assertions(2);
    try {
      extractOrderValue({
        title: 'Announcement under Regulation 30 (LODR)-Award_of_Order_Receipt_of_Order',
        description: 'as per attachment',
      });
    } catch (e) {
      expect(e).toBeInstanceOf(AnnouncementValueNotFoundError);
      expect(e.isOrderAnnouncement).toBe(true);
    }
  });

  test('throws with isOrderAnnouncement false for a GST order', () => {
    expect.assertions(1);
    try {
      extractOrderValue({
        title: 'Intimation For Receipt Of Order From GST Authorities',
        description: 'Total – INR 6,46,87,687/-',
      });
    } catch (e) {
      expect(e.isOrderAnnouncement).toBe(false);
    }
  });
});
