'use strict';

const {
  parseTimeMinutes,
  classifyMarketSession,
  deriveQuarterLabel,
  isPrimaryResultAnnouncement,
  computeTimingStats,
  analyzeResultTimings,
  formatSummaryTable,
} = require('../src/analyzers/resultTimingAnalyzer');

describe('resultTimingAnalyzer', () => {
  describe('parseTimeMinutes', () => {
    it('parses HH:mm:ss correctly', () => {
      const res = parseTimeMinutes('19:28:45');
      expect(res).not.toBeNull();
      expect(res.hours).toBe(19);
      expect(res.minutes).toBe(28);
      expect(res.seconds).toBe(45);
      expect(res.totalMinutes).toBeCloseTo(19 * 60 + 28 + 45 / 60);
    });

    it('parses HH:mm correctly', () => {
      const res = parseTimeMinutes('15:30');
      expect(res).not.toBeNull();
      expect(res.hours).toBe(15);
      expect(res.minutes).toBe(30);
      expect(res.seconds).toBe(0);
      expect(res.totalMinutes).toBe(930);
    });

    it('returns null on invalid input', () => {
      expect(parseTimeMinutes(null)).toBeNull();
      expect(parseTimeMinutes('')).toBeNull();
      expect(parseTimeMinutes('invalid-time')).toBeNull();
    });
  });

  describe('classifyMarketSession', () => {
    it('classifies weekend regardless of time', () => {
      expect(classifyMarketSession(14 * 60 + 28, 'Saturday')).toBe('Weekend');
      expect(classifyMarketSession(10 * 60, 'Sunday')).toBe('Weekend');
    });

    it('classifies during market hours (09:15 to 15:30)', () => {
      expect(classifyMarketSession(9 * 60 + 15, 'Monday')).toBe('During Market Hours');
      expect(classifyMarketSession(12 * 60 + 47, 'Wednesday')).toBe('During Market Hours');
      expect(classifyMarketSession(15 * 60 + 18, 'Friday')).toBe('During Market Hours');
      expect(classifyMarketSession(15 * 60 + 30, 'Friday')).toBe('During Market Hours');
    });

    it('classifies post market hours (after 15:30)', () => {
      expect(classifyMarketSession(15 * 60 + 33, 'Friday')).toBe('Post Market Hours');
      expect(classifyMarketSession(19 * 60 + 28, 'Wednesday')).toBe('Post Market Hours');
      expect(classifyMarketSession(21 * 60 + 23, 'Wednesday')).toBe('Post Market Hours');
    });

    it('classifies pre market hours (before 09:15)', () => {
      expect(classifyMarketSession(8 * 60 + 30, 'Monday')).toBe('Pre Market Hours');
    });
  });

  describe('deriveQuarterLabel', () => {
    it('derives correct Indian FY quarter labels', () => {
      expect(deriveQuarterLabel(new Date(Date.UTC(2026, 5, 30)))).toBe('Q1 FY27');
      expect(deriveQuarterLabel(new Date(Date.UTC(2025, 8, 30)))).toBe('Q2 FY26');
      expect(deriveQuarterLabel(new Date(Date.UTC(2025, 11, 31)))).toBe('Q3 FY26');
      expect(deriveQuarterLabel(new Date(Date.UTC(2026, 2, 31)))).toBe('Q4 FY26');
    });
  });

  describe('isPrimaryResultAnnouncement', () => {
    it('matches board meeting outcomes containing financial results', () => {
      const ann = {
        desc: 'Outcome of Board Meeting',
        attchmntText:
          'Mangalore Refinery and Petrochemicals Limited has submitted to the Exchange, the financial results for the period ended Jun 30, 2026.',
      };
      expect(isPrimaryResultAnnouncement(ann)).toBe(true);
    });

    it('rejects newspaper publications and analyst calls', () => {
      const news = {
        desc: 'Copy of Newspaper Publication',
        attchmntText: 'Newspaper Publication of Un-Audited Financial Results...',
      };
      expect(isPrimaryResultAnnouncement(news)).toBe(false);

      const call = {
        desc: 'Analysts/Institutional Investor Meet/Con. Call Updates',
        attchmntText:
          'Audio Recording of Conference Call held with Analysts to discuss the financial results...',
      };
      expect(isPrimaryResultAnnouncement(call)).toBe(false);
    });
  });

  describe('computeTimingStats', () => {
    const mockHistory = [
      {
        quarter: 'Q1 FY27',
        totalMinutes: 19 * 60 + 28,
        marketSession: 'Post Market Hours',
        dayOfWeek: 'Wednesday',
        turnaroundDays: 15,
      },
      {
        quarter: 'Q4 FY26',
        totalMinutes: 19 * 60 + 1,
        marketSession: 'Post Market Hours',
        dayOfWeek: 'Friday',
        turnaroundDays: 24,
      },
      {
        quarter: 'Q3 FY26',
        totalMinutes: 15 * 60 + 18,
        marketSession: 'During Market Hours',
        dayOfWeek: 'Wednesday',
        turnaroundDays: 14,
      },
      {
        quarter: 'Q2 FY26',
        totalMinutes: 21 * 60 + 23,
        marketSession: 'Post Market Hours',
        dayOfWeek: 'Wednesday',
        turnaroundDays: 15,
      },
      {
        quarter: 'Q1 FY26',
        totalMinutes: 19 * 60 + 11,
        marketSession: 'Post Market Hours',
        dayOfWeek: 'Friday',
        turnaroundDays: 18,
      },
      {
        quarter: 'Q4 FY25',
        totalMinutes: 14 * 60 + 28,
        marketSession: 'Weekend',
        dayOfWeek: 'Saturday',
        turnaroundDays: 26,
      },
      {
        quarter: 'Q3 FY25',
        totalMinutes: 12 * 60 + 47,
        marketSession: 'During Market Hours',
        dayOfWeek: 'Monday',
        turnaroundDays: 20,
      },
      {
        quarter: 'Q2 FY25',
        totalMinutes: 15 * 60 + 33,
        marketSession: 'Post Market Hours',
        dayOfWeek: 'Friday',
        turnaroundDays: 18,
      },
    ];

    it('computes accurate statistical metrics', () => {
      const stats = computeTimingStats(mockHistory);
      expect(stats).not.toBeNull();
      expect(stats.totalAnalyzed).toBe(8);
      expect(stats.marketSessionBreakdown.postMarketCount).toBe(5);
      expect(stats.marketSessionBreakdown.marketHoursCount).toBe(2);
      expect(stats.marketSessionBreakdown.weekendCount).toBe(1);
      // Off-market = 5 post-market + 1 weekend = 6 / 8 = 75.0%
      expect(stats.marketSessionBreakdown.offMarketPct).toBe(75);
      expect(stats.turnaroundVelocity.avgDays).toBe(18.8);
      expect(stats.turnaroundVelocity.minDays).toBe(14);
      expect(stats.turnaroundVelocity.maxDays).toBe(26);
      expect(stats.typicalWindow).toContain('Post-Market');
    });
  });

  describe('analyzeResultTimings and formatSummaryTable', () => {
    it('analyzes company via mock NSE client and renders summary table', async () => {
      const mockNseClient = {
        getCorporateAnnouncements: jest.fn().mockResolvedValue([
          {
            sort_date: '2026-07-15 19:28:45',
            exchdisstime: '15-Jul-2026 19:28:45',
            desc: 'Outcome of Board Meeting',
            attchmntText:
              'Submitted to the Exchange, the financial results for the period ended Jun 30, 2026.',
            attchmntFile: 'https://nsearchives.nseindia.com/corporate/MRPL_RESULT.pdf',
          },
        ]),
        getFinancialResults: jest.fn().mockResolvedValue([
          {
            toDate: '30-Jun-2026',
            broadCastDate: '15-Jul-2026 19:28:45',
            audited: 'Un-Audited',
          },
        ]),
        getIntegratedFilings: jest.fn().mockResolvedValue([
          {
            qe_Date: '30-JUN-2026',
            broadcast_Date: '15-Jul-2026 19:35:17',
            type_Sub: 'Original',
            audited: 'Un-Audited',
          },
        ]),
      };

      const dto = await analyzeResultTimings('MRPL', {
        quarters: 1,
        nseClient: mockNseClient,
      });

      expect(dto.symbol).toBe('MRPL');
      expect(dto.quartersFound).toBe(1);
      expect(dto.history[0].quarter).toBe('Q1 FY27');
      expect(dto.history[0].marketSession).toBe('Post Market Hours');

      const table = formatSummaryTable(dto);
      expect(table).toContain('Results Declaration Timing:');
      expect(table).toContain('Q1 FY27');
      expect(table).toContain('19:28:45');
      expect(table).toContain('Post Market Hours');
    });
  });
});
