'use strict';

/**
 * Shared NSE/BSE equity-market trading-holiday calendar.
 *
 * Single source of truth for "is <date> a trading day", used by any script
 * that needs to walk back to the last real market close (post-close scan
 * windows, gainers/volume scanners, etc.) instead of just skipping weekends.
 * Weekend-only date math was a known, explicitly-flagged gap in both
 * `postCloseScanInsights.js` (fixed 2026-08-23, weekends only) and
 * `gainersScanner.js` (flagged 2026-08-xx, never fixed) — this module exists
 * so the holiday fix happens ONCE, shared, per
 * `skills/_shared/conventions.md` §17 ("never think or write the same thing
 * twice"), instead of being re-solved per script.
 *
 * Source: NSE's public holiday-master API (`equity` / "CM" segment — capital
 * market, i.e. the cash-equity segment announcements/results actually get
 * filed against). Cached to `data/cache/trading-holidays-<year>.json` so a
 * normal nightly run never makes a network call; refetches automatically
 * once a year rolls over or the cache is missing/stale.
 *
 * Fail-open, not fail-closed: if the network fetch fails and there's no
 * usable cache, every date is treated as a trading day (i.e. we fall back to
 * the old weekend-only behavior) rather than the pipeline erroring out or
 * silently skipping a real trading day because a holiday API call timed out.
 * A warning is printed either way so a persistent failure is visible in logs.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const db = require('./db');
const ist = require('./ist');

const NSE_HOLIDAY_URL = 'https://www.nseindia.com/api/holiday-master?type=trading';
// NSE's holiday-master groups holidays by segment; "CM" = Capital Market
// (equity cash segment) — the segment corporate announcements/results are
// filed against, so it's the right list for "is this a day announcements
// could be filed on".
const SEGMENT = 'CM';

function cacheFileFor(year) {
  return path.join(db.cachePath(''), `trading-holidays-${year}.json`);
}

function parseNseDate(tradingDate) {
  // "26-Jan-2026" -> Date at UTC midnight of that IST calendar date.
  const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const m = String(tradingDate).match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const [, dd, mon, yyyy] = m;
  if (!(mon in MONTHS)) return null;
  return Date.UTC(Number(yyyy), MONTHS[mon], Number(dd));
}

/**
 * Fetch the holiday-master list for one calendar year from NSE and cache it.
 * Returns a Set of "YYYY-MM-DD" (IST calendar date) strings, or null on
 * failure (caller decides the fail-open fallback).
 */
async function fetchAndCacheYear(year) {
  let res;
  try {
    res = await axios.get(NSE_HOLIDAY_URL, {
      timeout: 15000,
      headers: {
        accept: 'application/json',
        'user-agent': 'Mozilla/5.0 (compatible; stockmarket-jobs-runtime/1.0)',
      },
    });
  } catch (err) {
    console.warn(`[tradingCalendar] NSE holiday-master fetch failed: ${err.message}`);
    return null;
  }
  const segmentList = res.data && res.data[SEGMENT];
  if (!Array.isArray(segmentList)) {
    console.warn('[tradingCalendar] NSE holiday-master response missing expected "CM" segment array');
    return null;
  }
  const isoDates = [];
  for (const row of segmentList) {
    const utcMs = parseNseDate(row.tradingDate);
    if (utcMs === null) continue;
    const d = new Date(utcMs);
    if (d.getUTCFullYear() !== year) continue; // NSE sometimes returns a rolling window, not exactly one calendar year
    isoDates.push({
      date: d.toISOString().slice(0, 10),
      description: row.description || null,
    });
  }
  const record = { year, fetchedAtUtc: new Date().toISOString(), source: NSE_HOLIDAY_URL, segment: SEGMENT, holidays: isoDates };
  try {
    fs.mkdirSync(path.dirname(cacheFileFor(year)), { recursive: true });
    fs.writeFileSync(cacheFileFor(year), JSON.stringify(record, null, 2));
  } catch (err) {
    console.warn(`[tradingCalendar] failed to write cache for ${year}: ${err.message}`);
  }
  return new Set(isoDates.map((h) => h.date));
}

/** Returns {set, fetchedAtMs} from the on-disk cache, or null if missing/corrupt. */
function readCachedYear(year) {
  const file = cacheFileFor(year);
  if (!fs.existsSync(file)) return null;
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(record.holidays)) return null;
    const fetchedAtMs = Date.parse(record.fetchedAtUtc);
    return {
      set: new Set(record.holidays.map((h) => h.date)),
      fetchedAtMs: Number.isFinite(fetchedAtMs) ? fetchedAtMs : 0, // treat unparsable/missing timestamp as maximally stale
    };
  } catch {
    return null;
  }
}

// NSE occasionally revises its published holiday list mid-year (regional
// election days, last-minute additions) — refresh weekly even though the
// underlying calendar rarely changes, so a stale correction doesn't sit
// uncaught for up to a year. Cheap either way: this only adds one network
// call per week, not per run (still zero network calls on 6 of 7 nightly
// runs), and a failed refresh attempt just keeps using the existing cache
// (see the `set` fallback below) rather than blocking on it.
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

const _yearCache = new Map(); // year -> Set<"YYYY-MM-DD"> | 'fetch-failed'

/**
 * Get the holiday-date Set for a calendar year, cache-first. Synchronous
 * cache read; only awaits a network call on a cold, stale (>7 days old), or
 * unreadable cache. Safe to call repeatedly within one process — memoized
 * per year (the in-process memo does NOT re-check staleness mid-process;
 * each new process run re-checks the on-disk cache's age fresh).
 */
async function getHolidaySet(year) {
  if (_yearCache.has(year)) return _yearCache.get(year);
  const cached = readCachedYear(year);
  const isStale = !cached || Date.now() - cached.fetchedAtMs > REFRESH_INTERVAL_MS;

  let set = cached ? cached.set : null;
  if (isStale) {
    const refreshed = await fetchAndCacheYear(year);
    if (refreshed) {
      set = refreshed;
    } else if (set) {
      console.warn(`[tradingCalendar] weekly refresh for ${year} failed — continuing with cache last fetched ${new Date(cached.fetchedAtMs).toISOString()}.`);
    }
  }

  if (!set) {
    console.warn(
      `[tradingCalendar] no holiday data available for ${year} (network failed, no cache) — falling back to weekend-only calendar for this year. Trading-holiday-adjacent date math may be off by one trading day until this is retried.`
    );
    set = 'fetch-failed';
  }
  _yearCache.set(year, set);
  return set;
}

/**
 * Is `date` (any JS Date) an NSE trading holiday, per the IST calendar date
 * it falls on? Does NOT check weekends — combine with a weekend check
 * (see `isTradingDay`) for the full "was the market open" answer.
 */
async function isHoliday(date) {
  const d = ist.istDate(date);
  const year = d.getUTCFullYear();
  const isoDate = d.toISOString().slice(0, 10);
  const set = await getHolidaySet(year);
  if (set === 'fetch-failed') return false; // fail-open
  return set.has(isoDate);
}

/** Is `date` a real NSE trading day — not a Saturday/Sunday and not a holiday? */
async function isTradingDay(date) {
  const d = ist.istDate(date);
  const dow = d.getUTCDay(); // 0=Sun..6=Sat, computed on IST-shifted fields
  if (dow === 0 || dow === 6) return false;
  return !(await isHoliday(date));
}

/**
 * Walk `date` backward one IST calendar day at a time until landing on a
 * real trading day. Returns a new Date holding the same UTC instant as
 * midnight-IST-equivalent-shifted input, just moved back by whole days —
 * callers that need a specific wall-clock time (e.g. "3:30 PM IST on the
 * last trading day") should take only the calendar date from the result and
 * re-attach their own time-of-day, same pattern `defaultCutoffUtc` uses.
 */
async function lastTradingDayOnOrBefore(date) {
  let cursor = new Date(date.getTime());
  // Safety cap: India's longest holiday stretch is nowhere near 10 days;
  // this just prevents an infinite loop if the calendar data is malformed.
  for (let i = 0; i < 10; i++) {
    if (await isTradingDay(cursor)) return cursor;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  console.warn('[tradingCalendar] lastTradingDayOnOrBefore exhausted 10-day lookback — returning weekend-adjusted date without full holiday check');
  return cursor;
}

module.exports = {
  isHoliday,
  isTradingDay,
  lastTradingDayOnOrBefore,
  getHolidaySet, // exposed for tests / manual inspection
  _fetchAndCacheYear: fetchAndCacheYear, // exposed for a forced refresh (e.g. a yearly cron)
};
