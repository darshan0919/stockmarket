'use strict';

/**
 * @fileoverview Result timing analyzer — extracts, matches, and statistically
 * analyzes quarterly financial results declaration timestamps for any Indian
 * listed company. Uses official exchange data (NSE primary, BSE fallback)
 * to determine typical declaration windows, market session distribution
 * (during market hours vs post-market / off-market), day-of-week preferences,
 * and reporting turnaround velocity.
 */

const { resolveCompanyIdentity } = require('../utils/companyId');

const MONTH_NAMES = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Parse date string in various formats (YYYY-MM-DD, DD-Mon-YYYY, DD-MM-YYYY) into Date object.
 * @param {string} str
 * @returns {Date|null}
 */
function parseDateFlexible(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.split(/[- ]/);
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }

  // DD-Mon-YYYY (e.g. 15-Jul-2026 or 30-JUN-2026)
  const monMatch = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(s);
  if (monMatch) {
    const day = Number(monMatch[1]);
    const month = MONTH_NAMES[monMatch[2].toLowerCase()];
    const year = Number(monMatch[3]);
    if (month) return new Date(Date.UTC(year, month - 1, day));
  }

  // DD-MM-YYYY
  const ddmmyyyy = /^(\d{1,2})-(\d{1,2})-(\d{4})/.exec(s);
  if (ddmmyyyy) {
    return new Date(Date.UTC(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1])));
  }

  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Format Date to YYYY-MM-DD string.
 * @param {Date} date
 * @returns {string}
 */
function toIsoDate(date) {
  if (!date || isNaN(date.getTime())) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse time string (HH:mm:ss or HH:mm) into minutes from midnight (0.0 to 1440.0).
 * @param {string} timeStr
 * @returns {{ hours: number, minutes: number, seconds: number, totalMinutes: number }|null}
 */
function parseTimeMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(timeStr);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;
  const totalMinutes = hours * 60 + minutes + seconds / 60;

  return { hours, minutes, seconds, totalMinutes };
}

/**
 * Format fractional minutes from midnight back to HH:mm:ss and 12-hour AM/PM string.
 * @param {number} mins
 * @returns {string}
 */
function formatMinutesToTime(mins) {
  if (mins == null || isNaN(mins)) return '-';
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  const s = Math.round((mins * 60) % 60);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')} (${h12}:${String(m).padStart(2, '0')} ${ampm})`;
}

/**
 * Classify market session based on time of day and day of week.
 * Market Hours in India: 09:15 to 15:30 IST on Monday–Friday.
 * @param {number} totalMinutes
 * @param {string} dayOfWeek
 * @returns {'During Market Hours'|'Post Market Hours'|'Pre Market Hours'|'Weekend'}
 */
function classifyMarketSession(totalMinutes, dayOfWeek) {
  if (dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday') {
    return 'Weekend';
  }
  if (totalMinutes >= 9 * 60 + 15 && totalMinutes <= 15 * 60 + 30) {
    return 'During Market Hours';
  }
  if (totalMinutes > 15 * 60 + 30) {
    return 'Post Market Hours';
  }
  return 'Pre Market Hours';
}

/**
 * Derive quarter label (e.g. Q1 FY27, Q4 FY26) from quarter-end date.
 * Indian Financial Year:
 * - QE 30-Jun: Q1 FY(Year+1)
 * - QE 30-Sep: Q2 FY(Year+1)
 * - QE 31-Dec: Q3 FY(Year+1)
 * - QE 31-Mar: Q4 FY(Year)
 * @param {Date} qeDate
 * @returns {string}
 */
function deriveQuarterLabel(qeDate) {
  if (!qeDate || isNaN(qeDate.getTime())) return 'Unknown';
  const month = qeDate.getUTCMonth() + 1; // 1-12
  const year = qeDate.getUTCFullYear();
  const yy = (y) => String(y).slice(-2);

  if (month === 6) return `Q1 FY${yy(year + 1)}`;
  if (month === 9) return `Q2 FY${yy(year + 1)}`;
  if (month === 12) return `Q3 FY${yy(year + 1)}`;
  if (month === 3) return `Q4 FY${yy(year)}`;
  return `QE ${toIsoDate(qeDate)}`;
}

/**
 * Check if announcement description/text pertains to primary financial results outcome.
 * @param {Object} ann
 * @returns {boolean}
 */
function isPrimaryResultAnnouncement(ann) {
  const desc = String(ann.desc || '').toLowerCase();
  const text = String(ann.attchmntText || '').toLowerCase();

  // Exclude non-results or secondary PR/concall filings
  if (
    desc.includes('newspaper') ||
    desc.includes('analyst') ||
    desc.includes('loss of share') ||
    desc.includes('prior intimation')
  ) {
    return false;
  }
  if (
    text.includes('newspaper') ||
    text.includes('audio recording') ||
    text.includes('transcript of conference call') ||
    text.includes('notice of board meeting')
  ) {
    return false;
  }

  // Must indicate outcome of board meeting or financial results submission
  const isOutcomeOrResultsDesc =
    desc.includes('outcome of board meeting') ||
    desc.includes('financial result') ||
    desc.includes('board meeting');

  const hasResultKeywords =
    text.includes('financial result') ||
    text.includes('submitted to the exchange, the financial results') ||
    text.includes('outcome of the board meeting') ||
    text.includes('outcome of board meeting') ||
    text.includes('approval of un-audited') ||
    text.includes('approval of audited') ||
    text.includes('approved the financial') ||
    text.includes('stand-alone and consolidated') ||
    text.includes('standalone and consolidated');

  return isOutcomeOrResultsDesc && hasResultKeywords;
}

/**
 * Calculate statistical distribution over result timing records.
 * @param {Array<Object>} records
 * @returns {Object}
 */
function computeTimingStats(records) {
  if (!records || records.length === 0) {
    return null;
  }

  const minutesList = records.map((r) => r.totalMinutes).sort((a, b) => a - b);
  const count = minutesList.length;

  const minMin = minutesList[0];
  const maxMin = minutesList[count - 1];
  const sumMin = minutesList.reduce((acc, v) => acc + v, 0);
  const meanMin = sumMin / count;

  let medianMin;
  if (count % 2 === 1) {
    medianMin = minutesList[Math.floor(count / 2)];
  } else {
    medianMin = (minutesList[count / 2 - 1] + minutesList[count / 2]) / 2;
  }

  const variance = minutesList.reduce((acc, v) => acc + Math.pow(v - meanMin, 2), 0) / count;
  const stdDevMinutes = Math.sqrt(variance);

  // Market Session Breakdown
  const sessionCounts = {
    'Post Market Hours': 0,
    'During Market Hours': 0,
    Weekend: 0,
    'Pre Market Hours': 0,
  };
  records.forEach((r) => {
    if (sessionCounts[r.marketSession] !== undefined) {
      sessionCounts[r.marketSession]++;
    }
  });

  const offMarketCount = sessionCounts['Post Market Hours'] + sessionCounts['Weekend'];
  const offMarketPct = Number(((offMarketCount / count) * 100).toFixed(1));

  // Day of Week Breakdown
  const dayCounts = {};
  DAYS_OF_WEEK.forEach((d) => {
    dayCounts[d] = 0;
  });
  records.forEach((r) => {
    if (r.dayOfWeek) {
      dayCounts[r.dayOfWeek] = (dayCounts[r.dayOfWeek] || 0) + 1;
    }
  });

  // Time Buckets
  const timeBuckets = {
    morningMidday: 0, // Before 15:30
    immediatePostClose: 0, // 15:30 - 17:00
    primeEvening: 0, // 17:00 - 19:30
    lateNight: 0, // After 19:30
  };

  records.forEach((r) => {
    if (r.totalMinutes < 15 * 60 + 30) {
      timeBuckets.morningMidday++;
    } else if (r.totalMinutes <= 17 * 60) {
      timeBuckets.immediatePostClose++;
    } else if (r.totalMinutes <= 19 * 60 + 30) {
      timeBuckets.primeEvening++;
    } else {
      timeBuckets.lateNight++;
    }
  });

  // Turnaround Days Velocity
  const turnaroundList = records.map((r) => r.turnaroundDays).filter((v) => v != null && !isNaN(v));
  const avgTurnaroundDays = turnaroundList.length
    ? Number((turnaroundList.reduce((a, b) => a + b, 0) / turnaroundList.length).toFixed(1))
    : null;
  const minTurnaroundDays = turnaroundList.length ? Math.min(...turnaroundList) : null;
  const maxTurnaroundDays = turnaroundList.length ? Math.max(...turnaroundList) : null;

  // Turnaround trend: Compare recent 4 vs earlier
  let turnaroundTrend = 'steady';
  if (turnaroundList.length >= 8) {
    const recent4Avg = turnaroundList.slice(0, 4).reduce((a, b) => a + b, 0) / 4;
    const earlierAvg =
      turnaroundList.slice(4).reduce((a, b) => a + b, 0) / (turnaroundList.length - 4);
    if (recent4Avg < earlierAvg - 3) turnaroundTrend = 'accelerating';
    else if (recent4Avg > earlierAvg + 3) turnaroundTrend = 'decelerating';
  }

  // Quarterly Seasonality
  const seasonality = {
    Q1: { count: 0, sumMin: 0, sessions: {} },
    Q2: { count: 0, sumMin: 0, sessions: {} },
    Q3: { count: 0, sumMin: 0, sessions: {} },
    Q4: { count: 0, sumMin: 0, sessions: {} },
  };

  records.forEach((r) => {
    const qPrefix = r.quarter.slice(0, 2);
    if (seasonality[qPrefix]) {
      seasonality[qPrefix].count++;
      seasonality[qPrefix].sumMin += r.totalMinutes;
      seasonality[qPrefix].sessions[r.marketSession] =
        (seasonality[qPrefix].sessions[r.marketSession] || 0) + 1;
    }
  });

  const seasonalSummary = {};
  Object.entries(seasonality).forEach(([k, v]) => {
    if (v.count > 0) {
      seasonalSummary[k] = {
        quartersCount: v.count,
        meanTime: formatMinutesToTime(v.sumMin / v.count),
        dominantSession:
          Object.entries(v.sessions).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown',
      };
    }
  });

  // Synthesize Typical Window description
  let typicalWindow = '';
  if (offMarketPct >= 70) {
    if (timeBuckets.primeEvening >= count * 0.35) {
      typicalWindow = `Post-Market Prime Evening between 17:00 and 19:30 IST (${offMarketPct}% outside market hours, median ${formatMinutesToTime(medianMin)})`;
    } else if (timeBuckets.lateNight >= count * 0.35) {
      typicalWindow = `Post-Market Late Evening between 19:30 and 22:00 IST (${offMarketPct}% outside market hours, median ${formatMinutesToTime(medianMin)})`;
    } else {
      typicalWindow = `Post-Market Hours after 15:30 IST (${offMarketPct}% outside market hours, median ${formatMinutesToTime(medianMin)})`;
    }
  } else if (sessionCounts['During Market Hours'] >= count * 0.5) {
    typicalWindow = `During Active Market Hours (09:15 – 15:30 IST, median ${formatMinutesToTime(medianMin)})`;
  } else {
    typicalWindow = `Mixed timing: ${sessionCounts['Post Market Hours']} post-market, ${sessionCounts['During Market Hours']} market hours (median ${formatMinutesToTime(medianMin)})`;
  }

  return {
    totalAnalyzed: count,
    earliest: formatMinutesToTime(minMin),
    latest: formatMinutesToTime(maxMin),
    median: formatMinutesToTime(medianMin),
    mean: formatMinutesToTime(meanMin),
    stdDevMinutes: Number(stdDevMinutes.toFixed(1)),
    stdDevHours: Number((stdDevMinutes / 60).toFixed(2)),
    marketSessionBreakdown: {
      postMarketCount: sessionCounts['Post Market Hours'],
      postMarketPct: Number(((sessionCounts['Post Market Hours'] / count) * 100).toFixed(1)),
      marketHoursCount: sessionCounts['During Market Hours'],
      marketHoursPct: Number(((sessionCounts['During Market Hours'] / count) * 100).toFixed(1)),
      weekendCount: sessionCounts['Weekend'],
      weekendPct: Number(((sessionCounts['Weekend'] / count) * 100).toFixed(1)),
      preMarketCount: sessionCounts['Pre Market Hours'],
      preMarketPct: Number(((sessionCounts['Pre Market Hours'] / count) * 100).toFixed(1)),
      offMarketPct,
    },
    dayOfWeekBreakdown: dayCounts,
    timeBuckets: {
      morningMidday: {
        count: timeBuckets.morningMidday,
        pct: Number(((timeBuckets.morningMidday / count) * 100).toFixed(1)),
      },
      immediatePostClose: {
        count: timeBuckets.immediatePostClose,
        pct: Number(((timeBuckets.immediatePostClose / count) * 100).toFixed(1)),
      },
      primeEvening: {
        count: timeBuckets.primeEvening,
        pct: Number(((timeBuckets.primeEvening / count) * 100).toFixed(1)),
      },
      lateNight: {
        count: timeBuckets.lateNight,
        pct: Number(((timeBuckets.lateNight / count) * 100).toFixed(1)),
      },
    },
    turnaroundVelocity: {
      avgDays: avgTurnaroundDays,
      minDays: minTurnaroundDays,
      maxDays: maxTurnaroundDays,
      trend: turnaroundTrend,
    },
    seasonality: seasonalSummary,
    typicalWindow,
  };
}

/**
 * Main analysis function: fetches official announcements and filings from NSE/BSE,
 * matches quarter outcomes, and computes statistical timing profile.
 *
 * @param {string|Object} input - Symbol, companyId, or company master object (e.g. 'MRPL', 'NSE:MRPL', 'BSE:500109')
 * @param {Object} [options]
 * @param {number} [options.quarters=12] - Number of quarters to analyze (default: 12)
 * @param {Object} [options.nseClient] - Optional injected NseClient instance
 * @param {Object} [options.bseClient] - Optional injected BseClient instance
 * @returns {Promise<Object>}
 */
async function analyzeResultTimings(input, options = {}) {
  const quartersToFetch = options.quarters || 12;
  const identity = resolveCompanyIdentity(typeof input === 'string' ? { symbol: input } : input);

  const { nse, bse } = require('../index');
  const nseClient = options.nseClient || nse;
  const bseClient = options.bseClient || bse;

  // Determine primary exchange
  const hasNse = Boolean(
    identity.nseTicker ||
    (identity.companyId && identity.companyId.startsWith('NSE:')) ||
    (!identity.bseTicker && !identity.companyId?.startsWith('BSE:'))
  );
  const nseSymbol =
    identity.nseTicker ||
    (identity.companyId?.startsWith('NSE:')
      ? identity.companyId.replace('NSE:', '')
      : identity.displaySymbol || identity.symbol || input);
  const bseScrip =
    identity.bseTicker ||
    (identity.companyId?.startsWith('BSE:') ? identity.companyId.replace('BSE:', '') : null);

  let rawQuarterEntries = [];

  if (hasNse && nseSymbol) {
    // 1. Fetch from NSE
    const [announcements, finResults, intFilings] = await Promise.all([
      nseClient.getCorporateAnnouncements({ symbol: nseSymbol }).catch(() => []),
      nseClient.getFinancialResults(nseSymbol, 'Quarterly').catch(() => []),
      nseClient
        .getIntegratedFilings(nseSymbol, 'Financials', Math.max(quartersToFetch * 2, 25))
        .catch(() => []),
    ]);

    // Build unique quarterly date targets from finResults and intFilings
    const quarterMap = new Map();

    // Ingest integrated filings (most recent system)
    for (const filing of intFilings) {
      if (!filing.qe_Date) continue;
      const qeDate = parseDateFlexible(filing.qe_Date);
      if (!qeDate) continue;
      const qeKey = toIsoDate(qeDate);

      // Prefer Original filing broadcast date if available
      const declDate = parseDateFlexible(filing.broadcast_Date || filing.creation_Date);
      const declDateIso = declDate ? toIsoDate(declDate) : null;

      if (!quarterMap.has(qeKey) || filing.type_Sub === 'Original') {
        quarterMap.set(qeKey, {
          qeDate,
          qeDateIso: qeKey,
          declarationDateIso: declDateIso,
          broadcastTimestamp: filing.broadcast_Date || filing.creation_Date,
          audited: filing.audited,
          quarterLabel: deriveQuarterLabel(qeDate),
        });
      }
    }

    // Ingest financial results filings (covers older history)
    for (const res of finResults) {
      if (!res.toDate) continue;
      const qeDate = parseDateFlexible(res.toDate);
      if (!qeDate) continue;
      const qeKey = toIsoDate(qeDate);

      const declDate = parseDateFlexible(res.broadCastDate || res.filingDate);
      const declDateIso = declDate ? toIsoDate(declDate) : null;

      if (!quarterMap.has(qeKey)) {
        quarterMap.set(qeKey, {
          qeDate,
          qeDateIso: qeKey,
          declarationDateIso: declDateIso,
          broadcastTimestamp: res.broadCastDate || res.filingDate,
          audited: res.audited,
          quarterLabel: deriveQuarterLabel(qeDate),
        });
      }
    }

    // Also scan announcements directly for any quarter ends not caught
    for (const ann of announcements) {
      if (isPrimaryResultAnnouncement(ann)) {
        const d = parseDateFlexible(ann.sort_date || ann.an_dt);
        if (!d) continue;
        const text = String(ann.attchmntText || '').toLowerCase();

        // Extract quarter end if mentioned in text
        const m =
          /(?:period ended|quarter ended|half year ended|year ended)\s+([A-Za-z0-9, ]+?)(?:\.|\n|$)/i.exec(
            text
          );
        if (m) {
          const candQe = parseDateFlexible(m[1]);
          if (candQe) {
            const qeKey = toIsoDate(candQe);
            if (!quarterMap.has(qeKey)) {
              quarterMap.set(qeKey, {
                qeDate: candQe,
                qeDateIso: qeKey,
                declarationDateIso: toIsoDate(d),
                broadcastTimestamp: ann.sort_date || ann.an_dt,
                audited: text.includes('un-audited') ? 'Un-Audited' : 'Audited',
                quarterLabel: deriveQuarterLabel(candQe),
              });
            }
          }
        }
      }
    }

    // Sort quarters chronologically descending (newest first)
    const sortedQuarterKeys = Array.from(quarterMap.keys()).sort((a, b) => (a < b ? 1 : -1));

    // Match each quarter with the exact primary board meeting outcome announcement on that date
    for (const qeKey of sortedQuarterKeys) {
      const qInfo = quarterMap.get(qeKey);
      let matchAnn = null;

      if (qInfo.declarationDateIso) {
        // Look for announcements on this declaration date
        const dayAnns = announcements.filter((a) =>
          (a.sort_date || '').startsWith(qInfo.declarationDateIso)
        );
        // Sort ascending by time to capture the earliest outcome
        dayAnns.sort((a, b) => (a.sort_date > b.sort_date ? 1 : -1));

        matchAnn = dayAnns.find(isPrimaryResultAnnouncement) || dayAnns[0];
      }

      // If no day announcement matched, check by text mentioning quarter end
      if (!matchAnn) {
        matchAnn = announcements.find((a) => {
          if (!isPrimaryResultAnnouncement(a)) return false;
          const t = String(a.attchmntText || '');
          return t.includes(qInfo.qeDateIso) || t.includes(qeKey);
        });
      }

      // Timestamp resolution
      let timeStr = null;
      let exchdisstime = null;
      let declDateObj = null;
      let attchmntFile = null;
      let subject = null;

      if (matchAnn) {
        timeStr = matchAnn.sort_date
          ? matchAnn.sort_date.split(' ')[1]
          : matchAnn.an_dt?.split(' ')[1];
        exchdisstime = matchAnn.exchdisstime ? matchAnn.exchdisstime.split(' ')[1] : timeStr;
        declDateObj = parseDateFlexible(matchAnn.sort_date || matchAnn.an_dt);
        attchmntFile = matchAnn.attchmntFile !== '-' ? matchAnn.attchmntFile : null;
        subject = matchAnn.desc;
      } else if (qInfo.broadcastTimestamp) {
        timeStr = qInfo.broadcastTimestamp.split(' ')[1];
        exchdisstime = timeStr;
        declDateObj = parseDateFlexible(qInfo.broadcastTimestamp);
      }

      if (declDateObj && timeStr) {
        const timeParsed = parseTimeMinutes(timeStr);
        if (timeParsed) {
          const dayName = DAYS_OF_WEEK[declDateObj.getUTCDay()];
          const turnaround = Math.round((declDateObj - qInfo.qeDate) / (1000 * 60 * 60 * 24));
          const session = classifyMarketSession(timeParsed.totalMinutes, dayName);

          rawQuarterEntries.push({
            quarter: qInfo.quarterLabel,
            quarterEnd: qInfo.qeDateIso,
            declarationDate: toIsoDate(declDateObj),
            dayOfWeek: dayName,
            announcementTime: timeStr,
            disseminationTime: exchdisstime || timeStr,
            totalMinutes: timeParsed.totalMinutes,
            marketSession: session,
            turnaroundDays: turnaround >= 0 ? turnaround : null,
            attachmentUrl: attchmntFile,
            description: subject || 'Financial Results',
            audited: qInfo.audited || null,
          });
        }
      }
    }
  } else if (bseScrip) {
    // 2. BSE Fallback for BSE-only companies
    const xbrlRows = await bseClient.getResultXbrlRows(bseScrip).catch(() => []);
    for (const row of xbrlRows) {
      if (!row.DT_TM) continue;
      const declDateObj = parseDateFlexible(row.DT_TM);
      const timeStr = row.DT_TM.includes(' ') ? row.DT_TM.split(' ')[1] : null;
      if (!declDateObj || !timeStr) continue;

      const timeParsed = parseTimeMinutes(timeStr);
      if (!timeParsed) continue;

      const dayName = DAYS_OF_WEEK[declDateObj.getUTCDay()];
      const session = classifyMarketSession(timeParsed.totalMinutes, dayName);

      rawQuarterEntries.push({
        quarter: row.quarter_code || 'BSE Result',
        quarterEnd: null,
        declarationDate: toIsoDate(declDateObj),
        dayOfWeek: dayName,
        announcementTime: timeStr,
        disseminationTime: timeStr,
        totalMinutes: timeParsed.totalMinutes,
        marketSession: session,
        turnaroundDays: null,
        attachmentUrl: row.XMLName
          ? `https://www.bseindia.com/xml-data/corpfiling/AttachHis/${row.XMLName}`
          : null,
        description: 'Financial Results (BSE)',
        audited: row.audited || null,
      });
    }
  }

  // Deduplicate by quarter and slice to requested count
  const seenQuarters = new Set();
  const history = [];
  for (const entry of rawQuarterEntries) {
    if (!seenQuarters.has(entry.quarter)) {
      seenQuarters.add(entry.quarter);
      history.push(entry);
      if (history.length >= quartersToFetch) break;
    }
  }

  const stats = computeTimingStats(history);

  return {
    companyId: identity.companyId || (hasNse ? `NSE:${nseSymbol}` : `BSE:${bseScrip}`),
    companyName: identity.companyName || identity.displaySymbol || nseSymbol,
    symbol: nseSymbol || bseScrip,
    exchange: hasNse ? 'NSE' : 'BSE',
    quartersRequested: quartersToFetch,
    quartersFound: history.length,
    typicalWindow: stats?.typicalWindow || 'Insufficient filing history',
    stats,
    history,
  };
}

/**
 * Render a markdown summary table and distribution statistics from an analysis DTO.
 * @param {Object} dto
 * @returns {string}
 */
function formatSummaryTable(dto) {
  if (!dto || !dto.stats || dto.history.length === 0) {
    return `No result timing data found for ${dto?.symbol || 'symbol'}.`;
  }

  const s = dto.stats;
  const lines = [];

  lines.push(`### Results Declaration Timing: ${dto.companyName} (${dto.companyId})`);
  lines.push('');
  lines.push(`**Typical Window**: **${dto.typicalWindow}**`);
  lines.push('');
  lines.push(
    '| # | Quarter | Quarter End | Declaration Date | Day | NSE Filing Time | Market Session | Turnaround | Official Filing |'
  );
  lines.push('|---|---|---|---|---|---|---|---|---|');

  dto.history.forEach((r, i) => {
    const fileLink = r.attachmentUrl ? `[PDF](${r.attachmentUrl})` : '-';
    const turnaround = r.turnaroundDays != null ? `${r.turnaroundDays}d` : '-';
    lines.push(
      `| ${i + 1} | ${r.quarter} | ${r.quarterEnd || '-'} | ${r.declarationDate} | ${r.dayOfWeek} | **${r.announcementTime}** | ${r.marketSession} | ${turnaround} | ${fileLink} |`
    );
  });

  lines.push('');
  lines.push('#### Statistical Distribution (Last ' + dto.history.length + ' Quarters)');
  lines.push(`- **Median Declaration Time**: ${s.median}`);
  lines.push(`- **Mean (Average) Time**: ${s.mean} (±${s.stdDevHours}h std dev)`);
  lines.push(`- **Time Range**: Earliest ${s.earliest} | Latest ${s.latest}`);
  lines.push(
    `- **Off-Market Rate**: **${s.marketSessionBreakdown.offMarketPct}%** (${s.marketSessionBreakdown.postMarketCount} Post-Market, ${s.marketSessionBreakdown.weekendCount} Weekend, ${s.marketSessionBreakdown.marketHoursCount} During Market Hours)`
  );
  lines.push(
    `- **Turnaround Velocity**: Average **${s.turnaroundVelocity.avgDays} days** post quarter-end (Range: ${s.turnaroundVelocity.minDays}d – ${s.turnaroundVelocity.maxDays}d, Trend: *${s.turnaroundVelocity.trend}*)`
  );

  lines.push('');
  lines.push('#### Day of Week Distribution');
  const daysSorted = Object.entries(s.dayOfWeekBreakdown)
    .filter(([_, cnt]) => cnt > 0)
    .sort((a, b) => b[1] - a[1]);
  lines.push(
    daysSorted
      .map(
        ([d, cnt]) =>
          `- **${d}**: ${cnt} / ${dto.history.length} (${((cnt / dto.history.length) * 100).toFixed(1)}%)`
      )
      .join('\n')
  );

  return lines.join('\n');
}

module.exports = {
  analyzeResultTimings,
  computeTimingStats,
  formatSummaryTable,
  parseTimeMinutes,
  classifyMarketSession,
  deriveQuarterLabel,
  isPrimaryResultAnnouncement,
};
