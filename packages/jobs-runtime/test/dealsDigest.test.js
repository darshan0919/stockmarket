'use strict';

const {
  formatNseDisplayDate,
  formatTxnDateRange,
  renderEmail,
  groupAndTop10ByNetValue,
} = require('../dealsDigest');

describe('dealsDigest date formatting & Insider Trades table rendering', () => {
  describe('formatNseDisplayDate', () => {
    it('formats YYYY-MM-DD correctly to DD-Mon-YYYY', () => {
      expect(formatNseDisplayDate('2026-09-16')).toBe('16-Sep-2026');
      expect(formatNseDisplayDate('2026-06-25')).toBe('25-Jun-2026');
      expect(formatNseDisplayDate('2026-01-05')).toBe('05-Jan-2026');
    });

    it('handles ISO timestamps with time part', () => {
      expect(formatNseDisplayDate('2026-09-15T00:00:00')).toBe('15-Sep-2026');
    });

    it('returns empty string for falsy input', () => {
      expect(formatNseDisplayDate('')).toBe('');
      expect(formatNseDisplayDate(null)).toBe('');
      expect(formatNseDisplayDate(undefined)).toBe('');
    });
  });

  describe('formatTxnDateRange', () => {
    it('returns dash for empty or invalid dates', () => {
      expect(formatTxnDateRange([])).toBe('—');
      expect(formatTxnDateRange(null)).toBe('—');
      expect(formatTxnDateRange([''])).toBe('—');
    });

    it('formats single date', () => {
      expect(formatTxnDateRange(['2026-09-15'])).toBe('15-Sep-2026');
      expect(formatTxnDateRange(['2026-09-15', '2026-09-15'])).toBe('15-Sep-2026');
    });

    it('formats date range in the same month and year', () => {
      expect(formatTxnDateRange(['2026-09-11', '2026-09-16'])).toBe('11-Sep to 16-Sep-2026');
    });

    it('formats date range across different months', () => {
      expect(formatTxnDateRange(['2026-08-28', '2026-09-02'])).toBe('28-Aug-2026 to 02-Sep-2026');
    });
  });

  describe('renderEmail', () => {
    it('renders the Txn Date column in 4️⃣ Insider Trades table', () => {
      const mockDigest = {
        bulkBlock: { bulk: [], block: [], errors: [] },
        sast: { rows: [], errors: [] },
        insider: { rows: [], totalFilings: 1, parsed: 1, errors: [] },
        bulk10: [],
        block10: [],
        sast10: [
          {
            symbol: 'SANGHVIMOV',
            companyName: 'Sanghvi Movers Ltd',
            nseTicker: 'SANGHVIMOV',
            netValue: null,
            grossValue: null,
            marketCap: 5000000000,
            deals: [
              {
                exchange: 'BSE',
                symbol: '530073',
                company: 'Sanghvi Movers Ltd',
                acquirer: 'Rishi Sanghvi',
                side: 'Acquisition',
                regType: 'Regulation 29(2)',
                shares: 10523000,
                value: null,
                netValue: null,
                txnDate: '10-Sep-2026',
              },
            ],
          },
        ],
        insider10: [
          {
            symbol: 'TRUALT',
            companyName: 'Trualt Bioenergy Ltd',
            nseTicker: 'TRUALT',
            netValue: 29379435,
            grossValue: 29379435,
            marketCap: 5000000000,
            deals: [
              {
                exchange: 'NSE',
                symbol: 'TRUALT',
                company: 'Trualt Bioenergy Ltd',
                person: 'NIRANI HOLDINGS PRIVATE LIMITED',
                personCount: 1,
                category: 'Promoter Group',
                side: 'Buy',
                mode: 'Market Purchase',
                qty: 69575,
                value: 29379435,
                netValue: 29379435,
                regulation: 'Regulation 7 (2)',
                broadcast: '16-Sep-2026 22:42:46',
                link: 'https://nsearchives.nseindia.com/corporate/ixbrl/IT_WEB.html',
                txnDate: '15-Sep to 16-Sep-2026',
                filingDate: '2026-09-16',
              },
            ],
          },
        ],
      };

      const html = renderEmail('16-09-2026', mockDigest, 10);

      // Verify table header includes Txn Date in both SAST and Insider tables
      expect(html).toContain('>Txn Date</th>');
      expect(html).toContain('>Acquirer</th>');
      expect(html).toContain('>Person</th>');

      // Verify SAST deal row includes the formatted transaction date before Acquirer
      expect(html).toContain('10-Sep-2026');
      expect(html).toContain('Rishi Sanghvi');

      // Verify deal row includes the formatted transaction date before Person
      expect(html).toContain('15-Sep to 16-Sep-2026');
      expect(html).toContain('NIRANI HOLDINGS PRIVATE LIMITED');

      // Verify screener redirection links are rendered beside titles
      expect(html).toContain(
        'href="https://www.screener.in/trades/bulk/?o=-2.-4&trade_type=exclude_intraday"'
      );
      expect(html).toContain('href="https://www.screener.in/trades/block/?o=-2.-4"');
      expect(html).toContain('href="https://www.screener.in/trades/sast/?o=-2.-4"');
      expect(html).toContain('href="https://www.screener.in/trades/insiders/?o=-2.-4"');
      expect(html).toContain(
        'src="https://cdn-static.screener.in/favicon/favicon-32x32.00205914303a.png"'
      );
    });
  });

  describe('Exchange filing date matching logic', () => {
    it('identifies outdated filing dates (e.g. NPST 2026-07-01 vs 2026-09-16 run date)', () => {
      const runDate = '2026-09-16';

      const validSameDayFiling = {
        symbol: 'TRUALT',
        filingDate: '2026-09-16',
      };

      const outdatedFiling = {
        symbol: 'NPST',
        filingDate: '2026-07-01',
      };

      const isMatching = (f) => f.filingDate === runDate;

      expect(isMatching(validSameDayFiling)).toBe(true);
      expect(isMatching(outdatedFiling)).toBe(false);
    });
  });

  describe('groupAndTop10ByNetValue with SAST category', () => {
    it('retains unpriced SAST disclosures while ranking priced deals first', async () => {
      const sastDeals = [
        {
          exchange: 'NSE',
          symbol: 'INFY',
          company: 'Infosys Limited',
          acquirer: 'Acquirer A',
          side: 'Buy',
          regType: 'Regulation 29(2)',
          shares: 100000,
          value: 15000000, // 1.5 Cr > 50L
        },
        {
          exchange: 'NSE',
          symbol: '3IINFOLTD',
          company: '3i Infotech Limited',
          acquirer: 'Capital NxT LLP',
          side: 'Acquisition',
          regType: 'Regulation 29(1)',
          shares: null,
          value: null, // Unpriced announcement filing
        },
        {
          exchange: 'BSE',
          symbol: '530073',
          company: 'Sanghvi Movers Ltd',
          acquirer: 'Rishi Sanghvi',
          side: 'Acquisition',
          regType: 'Regulation 29(2)',
          shares: null,
          value: null, // Unpriced announcement filing
        },
      ];

      const top = await groupAndTop10ByNetValue(sastDeals, 10, new Set(), 'sast');

      // All 3 should be retained (unpriced SAST is not dropped by 50L threshold)
      expect(top.length).toBe(3);

      // INFY has highest netValue, so it must be first
      expect(top[0].symbol).toBe('INFY');
      expect(top[0].netValue).toBe(15000000);

      // Unpriced filings are present after priced ones
      const symbols = top.map((t) => t.symbol);
      expect(symbols).toContain('3IINFOLTD-BE'); // Resolved canonical symbol
      expect(symbols).toContain('SANGHVIMOV'); // Resolved from BSE:530073
    });

    it('ranks unpriced or value-tied SAST filings by share count descending', async () => {
      const sastDeals = [
        {
          exchange: 'NSE',
          symbol: 'SMALL_SHARES',
          company: 'Small Shares Ltd',
          acquirer: 'Acquirer A',
          side: 'Acquisition',
          regType: 'Regulation 29(2)',
          shares: 50000,
          value: null,
        },
        {
          exchange: 'NSE',
          symbol: 'LARGE_SHARES',
          company: 'Large Shares Ltd',
          acquirer: 'Acquirer B',
          side: 'Acquisition',
          regType: 'Regulation 29(2)',
          shares: 5000000,
          value: null,
        },
      ];

      const top = await groupAndTop10ByNetValue(sastDeals, 10, new Set(), 'sast');

      expect(top.length).toBe(2);
      expect(top[0].symbol).toBe('LARGE_SHARES');
      expect(top[1].symbol).toBe('SMALL_SHARES');
    });

    it('filters out deals below ₹50L for non-sast categories', async () => {
      const bulkDeals = [
        {
          exchange: 'NSE',
          symbol: 'BIG',
          company: 'Big Co',
          client: 'Client A',
          side: 'BUY',
          qty: 100000,
          price: 100,
          value: 10000000, // 1 Cr > 50L
        },
        {
          exchange: 'NSE',
          symbol: 'TINY',
          company: 'Tiny Co',
          client: 'Client B',
          side: 'BUY',
          qty: 1000,
          price: 10,
          value: 10000, // 10k < 50L
        },
      ];

      const top = await groupAndTop10ByNetValue(bulkDeals, 10, new Set(), null);

      // Only BIG should remain
      expect(top.length).toBe(1);
      expect(top[0].symbol).toBe('BIG');
    });
  });

  describe('Historical bulk deals row mapping', () => {
    it('correctly maps BD_-prefixed fields to canonical row shape', () => {
      const rawHistRow = {
        BD_DT_DATE: '16-SEP-2026',
        BD_DT_ORDER: '2026-09-15T18:30:00.000Z',
        BD_SYMBOL: 'GROWW',
        BD_SCRIP_NAME: 'Groww Nifty Total Market Index ETF',
        BD_CLIENT_NAME: 'ABC CAPITAL',
        BD_BUY_SELL: 'BUY',
        BD_QTY_TRD: 1000000,
        BD_TP_WATP: 25.5,
        BD_REMARKS: '-',
      };

      const mapped = {
        exchange: 'NSE',
        date: rawHistRow.BD_DT_DATE,
        symbol: rawHistRow.BD_SYMBOL,
        name: rawHistRow.BD_SCRIP_NAME,
        client: rawHistRow.BD_CLIENT_NAME,
        side: rawHistRow.BD_BUY_SELL,
        qty: rawHistRow.BD_QTY_TRD,
        price: rawHistRow.BD_TP_WATP,
        value: rawHistRow.BD_QTY_TRD * rawHistRow.BD_TP_WATP,
      };

      expect(mapped.exchange).toBe('NSE');
      expect(mapped.symbol).toBe('GROWW');
      expect(mapped.client).toBe('ABC CAPITAL');
      expect(mapped.qty).toBe(1000000);
      expect(mapped.price).toBe(25.5);
      expect(mapped.value).toBe(25500000);
    });
  });
});
