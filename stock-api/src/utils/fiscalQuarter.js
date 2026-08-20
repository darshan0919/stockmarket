'use strict';

/**
 * Indian-FY quarter math shared by concall-transcript-extractor (and anything
 * else that needs "the most recently COMPLETED quarter" as of today).
 *
 * Indian fiscal year, expressed as a "cycle" starting in April of calendar
 * year `cy`:
 *   Q1: Apr cy - Jun cy        Q2: Jul cy - Sep cy
 *   Q3: Oct cy - Dec cy        Q4: Jan (cy+1) - Mar (cy+1)
 * The FY "name" (what Perplexity calls `fiscalYear`, what Stockscans anchors
 * Annual Reports to) is `cy + 1` — the calendar year the FY ENDS in. Confirmed
 * live 2026-07-24: STLTECH's Apr-Jun-2026 event (cycle year 2026, Q1) came
 * back from Perplexity as `{fiscalYear: 2027, fiscalPeriod: "Q1"}`. Stockscans'
 * Result/Transcript `date` field is `"YYYYMM"` = the quarter's actual calendar
 * end month/year (e.g. `"202606"` for Apr-Jun 2026) — that part needs no cycle
 * conversion, only the `fiscalYear` label does.
 *
 * "Latest quarter" per the skill's definition = the quarter BEFORE the one
 * we're currently in (results for the current quarter don't exist yet). E.g.
 * today in July (Q2, Jul-Sep) => latest quarter is Q1 (Apr-Jun).
 */

const ORDER = ['Q1', 'Q2', 'Q3', 'Q4'];
// [monthOffsetFromCycleStart used only for identification; end month per quarter:]
const QUARTER_END_MONTH = { Q1: 6, Q2: 9, Q3: 12, Q4: 3 };

/** Given a calendar (month 1-12, year), return {period, cycleYear}. */
function calendarToQuarter(m, y) {
  if (m >= 4 && m <= 6) return { period: 'Q1', cycleYear: y };
  if (m >= 7 && m <= 9) return { period: 'Q2', cycleYear: y };
  if (m >= 10 && m <= 12) return { period: 'Q3', cycleYear: y };
  return { period: 'Q4', cycleYear: y - 1 }; // Jan-Mar belongs to the cycle that started the previous April
}

/**
 * @param {Date} [now] - Defaults to the current date. Pass explicitly in tests.
 * @returns {{yyyymm: string, fiscalYear: number, fiscalPeriod: 'Q1'|'Q2'|'Q3'|'Q4', quarterEndDate: Date}}
 *   `yyyymm` matches Stockscans' Result/Transcript `date` field format.
 *   `fiscalYear`/`fiscalPeriod` match Perplexity's earnings-event fields.
 */
function latestCompletedQuarter(now = new Date()) {
  const { period: currentPeriod, cycleYear } = calendarToQuarter(
    now.getMonth() + 1,
    now.getFullYear()
  );
  const idx = ORDER.indexOf(currentPeriod);

  let latestPeriod, latestCycleYear;
  if (idx === 0) {
    // Q1 -> Q4 of the PREVIOUS cycle
    latestPeriod = 'Q4';
    latestCycleYear = cycleYear - 1;
  } else {
    latestPeriod = ORDER[idx - 1];
    latestCycleYear = cycleYear;
  }

  const endMonth = QUARTER_END_MONTH[latestPeriod];
  // Q4's end month (March) falls in cycleYear+1; Q1/Q2/Q3 end within cycleYear itself.
  const endCalendarYear = latestPeriod === 'Q4' ? latestCycleYear + 1 : latestCycleYear;
  const yyyymm = `${endCalendarYear}${String(endMonth).padStart(2, '0')}`;
  const fiscalYear = latestCycleYear + 1; // FY name = calendar year the cycle ends in

  return {
    yyyymm,
    fiscalYear,
    fiscalPeriod: latestPeriod,
    quarterEndDate: new Date(endCalendarYear, endMonth - 1, 1),
  };
}

/**
 * Parse a quarter string like "Q1FY27", "Q4FY26", "Q2FY2025" into the same
 * shape that latestCompletedQuarter() returns.
 *
 * Rules:
 *   - Format: Q{1-4}FY{2-or-4-digit-year}
 *   - 2-digit years are treated as 2000+N (e.g. FY27 → 2027)
 *   - `fiscalYear` = the FY label (e.g. 2027 for Q1FY27)
 *   - `yyyymm`     = the calendar end-month of that quarter
 *
 * Examples:
 *   parseQuarterString("Q1FY27") → { yyyymm:"202606", fiscalYear:2027, fiscalPeriod:"Q1", ... }
 *   parseQuarterString("Q4FY26") → { yyyymm:"202603", fiscalYear:2026, fiscalPeriod:"Q4", ... }
 *   parseQuarterString("Q3FY27") → { yyyymm:"202612", fiscalYear:2027, fiscalPeriod:"Q3", ... }
 *
 * @param {string} str
 * @returns {{yyyymm: string, fiscalYear: number, fiscalPeriod: 'Q1'|'Q2'|'Q3'|'Q4', quarterEndDate: Date}}
 * @throws {Error} if the string is not a valid quarter descriptor
 */
function parseQuarterString(str) {
  if (!str || typeof str !== 'string') throw new Error(`Quarter must be a string, got: ${str}`);
  const s = str.trim();

  // Accept raw YYYYMM (e.g. "202606") — skills get this directly from the Stockscans manifest
  // and shouldn't need to compute the quarter string by hand.
  if (/^\d{6}$/.test(s)) {
    const endYear = parseInt(s.slice(0, 4), 10);
    const endMonth = parseInt(s.slice(4, 6), 10);
    const monthToQuarter = { 6: 'Q1', 9: 'Q2', 12: 'Q3', 3: 'Q4' };
    const fiscalPeriod = monthToQuarter[endMonth];
    if (!fiscalPeriod) {
      throw new Error(
        `Cannot determine quarter from yyyymm "${s}" — end month ${endMonth} is not a quarter-end month (3, 6, 9, or 12)`
      );
    }
    // Q4 ends in March of fiscalYear; Q1/Q2/Q3 end within cycleYear (= fiscalYear - 1).
    const cycleYear = fiscalPeriod === 'Q4' ? endYear - 1 : endYear;
    const fiscalYear = cycleYear + 1;
    return {
      yyyymm: s,
      fiscalYear,
      fiscalPeriod,
      quarterEndDate: new Date(endYear, endMonth - 1, 1),
    };
  }

  const m = s.toUpperCase().match(/^Q([1-4])FY(\d{2,4})$/);
  if (!m) {
    throw new Error(`Invalid quarter format "${str}" — expected Q1FY27, Q4FY26, 202606, etc.`);
  }

  const fiscalPeriod = `Q${m[1]}`;
  let fiscalYear = parseInt(m[2], 10);
  if (fiscalYear < 100) fiscalYear += 2000; // FY27 → 2027

  // cycleYear is the calendar year the FY cycle STARTED in (April of that year).
  // fiscalYear = cycleYear + 1, so cycleYear = fiscalYear - 1.
  const cycleYear = fiscalYear - 1;

  const endMonth = QUARTER_END_MONTH[fiscalPeriod];
  // Q4 ends in March of fiscalYear; Q1/Q2/Q3 end within cycleYear.
  const endCalendarYear = fiscalPeriod === 'Q4' ? fiscalYear : cycleYear;
  const yyyymm = `${endCalendarYear}${String(endMonth).padStart(2, '0')}`;

  return {
    yyyymm,
    fiscalYear,
    fiscalPeriod,
    quarterEndDate: new Date(endCalendarYear, endMonth - 1, 1),
  };
}

module.exports = {
  latestCompletedQuarter,
  parseQuarterString,
  QUARTER_END_MONTH,
  calendarToQuarter,
};
