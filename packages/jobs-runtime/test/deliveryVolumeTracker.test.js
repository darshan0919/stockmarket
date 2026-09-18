'use strict';

const {
  buildHourlyBreakdown,
  renderHtml,
  formatQty,
  formatSlotHeader,
} = require('../deliveryVolumeTracker');

describe('deliveryVolumeTracker', () => {
  describe('formatQty', () => {
    it('formats null, undefined, or NaN to em-dash', () => {
      expect(formatQty(null)).toBe('—');
      expect(formatQty(undefined)).toBe('—');
      expect(formatQty(NaN)).toBe('—');
    });

    it('formats small numbers (< 1000) directly', () => {
      expect(formatQty(500)).toBe('500');
      expect(formatQty(0)).toBe('0');
    });

    it('formats thousands in k', () => {
      expect(formatQty(1500)).toBe('1.5 k');
      expect(formatQty(85200)).toBe('85.2 k');
    });

    it('formats lakhs in L', () => {
      expect(formatQty(100000)).toBe('1.00 L');
      expect(formatQty(740897)).toBe('7.41 L');
      expect(formatQty(4310981)).toBe('43.11 L');
    });

    it('formats crores in Cr', () => {
      expect(formatQty(10000000)).toBe('1.00 Cr');
      expect(formatQty(35245908)).toBe('3.52 Cr');
    });
  });

  describe('formatSlotHeader', () => {
    it('formats secwisedelposdate if provided', () => {
      expect(formatSlotHeader('10:16', '18-Sep-2026 10:00:00')).toBe('10:00 AM');
      expect(formatSlotHeader('13:11', '18-Sep-2026 13:00:00')).toBe('01:00 PM');
      expect(formatSlotHeader('15:15', '18-Sep-2026 15:00:00')).toBe('03:00 PM');
      expect(formatSlotHeader('17:25', '18-Sep-2026 00:00:00')).toBe('05:00 PM (Settled)');
    });

    it('falls back to standard slotTime hour mapping', () => {
      expect(formatSlotHeader('10:16')).toBe('10:00 AM');
      expect(formatSlotHeader('11:19')).toBe('11:00 AM');
      expect(formatSlotHeader('12:12')).toBe('12:00 PM');
      expect(formatSlotHeader('13:11')).toBe('01:00 PM');
      expect(formatSlotHeader('14:10')).toBe('02:00 PM');
      expect(formatSlotHeader('15:15')).toBe('03:00 PM');
      expect(formatSlotHeader('16:25')).toBe('03:30 PM (Close)');
      expect(formatSlotHeader('17:25')).toBe('05:00 PM (Settled)');
    });

    it('handles falsy inputs gracefully', () => {
      expect(formatSlotHeader('')).toBe('—');
      expect(formatSlotHeader(null)).toBe('—');
    });
  });

  describe('buildHourlyBreakdown & Signal Classification', () => {
    it('evaluates Green, Red, and Yellow signals correctly based on volume/delivery acceleration', () => {
      const mockSnapshots = [
        // Slot 0: 10:00 AM baseline (Yellow)
        {
          companyId: 'NSE:TESTCO',
          name: 'Test Co Ltd',
          slotTime: '10:16',
          lastPrice: 100,
          pChange: 2.5,
          tradedQty: 100000,
          deliveryQty: 30000,
          deliveryPct: 30,
        },
        // Slot 1: 11:00 AM - Price UP (100 -> 105), TradedDelta = 120k (> 100k), DelivDelta = 40k (> 30k) => GREEN
        {
          companyId: 'NSE:TESTCO',
          name: 'Test Co Ltd',
          slotTime: '11:19',
          lastPrice: 105,
          pChange: 7.5,
          tradedQty: 220000, // delta 120,000 > 100,000
          deliveryQty: 70000, // delta 40,000 > 30,000
          deliveryPct: 31.8,
        },
        // Slot 2: 12:00 PM - Price UP (105 -> 108), TradedDelta = 80k (< 120k) => YELLOW (volume decelerated)
        {
          companyId: 'NSE:TESTCO',
          name: 'Test Co Ltd',
          slotTime: '12:12',
          lastPrice: 108,
          pChange: 10.5,
          tradedQty: 300000, // delta 80,000 < 120,000
          deliveryQty: 95000, // delta 25,000
          deliveryPct: 31.6,
        },
        // Slot 3: 01:00 PM - Price DOWN (108 -> 102), TradedDelta = 150k (> 80k), DelivDelta = 60k (> 25k) => RED
        {
          companyId: 'NSE:TESTCO',
          name: 'Test Co Ltd',
          slotTime: '13:11',
          lastPrice: 102,
          pChange: 4.5,
          tradedQty: 450000, // delta 150,000 > 80,000
          deliveryQty: 155000, // delta 60,000 > 25,000
          deliveryPct: 34.4,
        },
      ];

      const breakdown = buildHourlyBreakdown(mockSnapshots);
      expect(breakdown).toHaveLength(1);
      const company = breakdown[0];
      expect(company.name).toBe('Test Co Ltd');
      expect(company.slots).toHaveLength(4);

      // Slot 0 (market open: positive price, volume, delivery -> GREEN)
      expect(company.slots[0].signal).toBe('GREEN');
      expect(company.slots[0].tradedDeltaFromPrev).toBe(100000);
      expect(company.slots[0].deliveryDeltaFromPrev).toBe(30000);

      // Slot 1 (Price UP + Vol acceleration + Deliv acceleration)
      expect(company.slots[1].signal).toBe('GREEN');
      expect(company.slots[1].pricePctChange).toBe(5.0); // (105-100)/100
      expect(company.slots[1].tradedDeltaFromPrev).toBe(120000);
      expect(company.slots[1].deliveryDeltaFromPrev).toBe(40000);
      expect(company.slots[1].incDeliveryVsIncTraded).toBe(33.3); // 40k/120k

      // Slot 2 (Price UP but Vol decelerated)
      expect(company.slots[2].signal).toBe('YELLOW');
      expect(company.slots[2].tradedDeltaFromPrev).toBe(80000);

      // Slot 3 (Price DOWN + Vol acceleration + Deliv acceleration)
      expect(company.slots[3].signal).toBe('RED');
      expect(company.slots[3].pricePctChange).toBeCloseTo(-5.56, 1); // (102-108)/108
      expect(company.slots[3].tradedDeltaFromPrev).toBe(150000);
      expect(company.slots[3].deliveryDeltaFromPrev).toBe(60000);
    });
  });

  describe('renderHtml', () => {
    it('renders delta-only cells, signals, and Day Summary column with closePrice and lastPrice', () => {
      const mockSnapshots = [
        {
          companyId: 'NSE:AVALON',
          name: 'Avalon Tech',
          slotTime: '10:16',
          secwisedelposdate: '18-Sep-2026 10:00:00',
          lastPrice: 2437.7,
          closePrice: 2537.7,
          pChange: 9.31,
          tradedQty: 709821,
          deliveryQty: 181035,
          deliveryPct: 25.5,
        },
        {
          companyId: 'NSE:AVALON',
          name: 'Avalon Tech',
          slotTime: '11:19',
          secwisedelposdate: '18-Sep-2026 11:00:00',
          lastPrice: 2442.9,
          closePrice: 2537.7,
          previousClose: 2230,
          pChange: 9.55,
          tradedQty: 1450718,
          deliveryQty: 383734,
          deliveryPct: 26.4,
        },
      ];

      const breakdown = buildHourlyBreakdown(mockSnapshots);
      const html = renderHtml(breakdown, { date: '2026-09-18' });

      // Headers
      expect(html).toContain('10:00 AM');
      expect(html).toContain('11:00 AM');
      expect(html).toContain('Day Summary');

      // Stock column shows companyId linked to Stockscans
      expect(html).toContain('>NSE:AVALON</a>');
      expect(html).not.toContain('Avalon Tech</div>');

      // Cell background colors (green tint for Green signal, white for Yellow/watch)
      expect(html).toContain('background:#f0fdf4');
      expect(html).toContain('background:#ffffff');

      // No text tags in cells
      expect(html).not.toContain('🟢 GREEN');
      expect(html).not.toContain('🟡 WATCH');

      // Footer explainer
      expect(html).toContain('Hourly Cell Color Coding:');
      expect(html).toContain('Green Cell (Institutional Accumulation)');

      // Day Summary content with 2 distinct % changes:
      // 1. lastPrice (%)
      expect(html).toContain('Last:');
      expect(html).toContain('+9.55%');
      // 2. closePrice (%)
      expect(html).toContain('Close:');
      expect(html).toContain('+13.80%');

      // Delta volume formatting
      expect(html).toContain('Vol: <b>+7.10 L</b>');
      expect(html).toContain('Vol: <b>+7.41 L</b>');
    });
  });
});
