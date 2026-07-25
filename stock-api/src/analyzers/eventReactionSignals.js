'use strict';

/**
 * eventReactionSignals — exact-timestamp event detection + minute-level price
 * reaction metrics.
 *
 * Differs from {@link module:postEventReturns} (which anchors on a *date* and
 * measures forward in trading-day steps against daily closes) — this module
 * anchors on the *exact minute* an event was disseminated (NSE `exchdisstime` /
 * BSE `DissemDT`) and measures the reaction in wall-clock windows (1hr, 1day,
 * 1month) against Stockscans 1-minute OHLCV candles. It answers "what actually
 * moved in the minutes/hours after this specific announcement", which a
 * day-close anchor can't — e.g. an after-hours result shows zero same-day
 * reaction on a daily series but a same-day reaction is exactly what you'd want
 * to capture for a during-market-hours event (concall commentary, order win).
 *
 * Validated live 10-Jul-2026 against Elecon Engineering's actual result:
 *   - NSE: "Outcome of Board Meeting" disseminated 11:47:46 IST.
 *   - BSE: same event split into "Board Meeting Outcome" (11:46:21.317) and a
 *     separately-tagged "Financial Results" (11:53:30.63) — BSE's board-meeting
 *     sub-announcement was the earliest signal, 85s ahead of NSE's combined one.
 *   - Stockscans 1m candles show the reaction starting exactly there: volume
 *     331 (11:45) → 44,508 (11:46) → 129,326 (11:47), price 515 → 485 (~-6%).
 * This cross-validation is why `earliestEventTimestamp` takes the min() across
 * both exchanges rather than trusting either alone.
 */

// ── Event classification ────────────────────────────────────────────────────

/**
 * Category → matcher patterns tested against the NSE `desc` field and the BSE
 * `CATEGORYNAME`/`NEWSSUB` fields. Order matters: more specific patterns first.
 */
const CATEGORY_PATTERNS = {
  result: [/financial results?/i, /outcome of board meeting/i, /board meeting outcome/i],
  concall: [
    /analysts?\/institutional investor meet/i,
    /con\.?\s*call/i,
    /investor presentation/i,
    /earnings conference call/i,
  ],
  order: [/award(ing)? of order/i, /order\s*\/?\s*contract/i, /receipt of order/i, /bags? order/i],
  monthly_update: [
    /monthly business update/i,
    /business update/i,
    /sales update/i,
    /monthly (sales|production) update/i,
  ],
};

/**
 * Classify a single announcement's category from whatever text fields are
 * available (NSE `desc`, or BSE `CATEGORYNAME` + `NEWSSUB`).
 * @param {string} text
 * @returns {'result'|'concall'|'order'|'monthly_update'|null}
 */
function classifyEventText(text) {
  const s = String(text || '');
  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    if (patterns.some((p) => p.test(s))) return category;
  }
  return null;
}

// ── Timestamp parsing ───────────────────────────────────────────────────────

const MONTHS = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/**
 * Parse NSE's 'DD-Mon-YYYY HH:mm:ss' (assumed IST, UTC+5:30) into an ISO
 * string with the IST offset preserved.
 * @param {string} s - e.g. "10-Jul-2026 11:47:46"
 * @returns {string|null} ISO 8601, e.g. "2026-07-10T11:47:46+05:30"
 */
function parseNseTimestamp(s) {
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(
    String(s || '').trim()
  );
  if (!m) return null;
  const [, dd, mon, yyyy, hh, mi, ss] = m;
  const month = MONTHS[mon.toLowerCase()];
  if (month == null) return null;
  return `${yyyy}-${String(month + 1).padStart(2, '0')}-${dd}T${hh}:${mi}:${ss}+05:30`;
}

/**
 * Parse BSE's 'YYYY-MM-DDTHH:mm:ss[.SSS]' (assumed IST, no offset in payload)
 * into an ISO string with the IST offset appended.
 * @param {string} s - e.g. "2026-07-10T11:46:21.317"
 * @returns {string|null}
 */
function parseBseTimestamp(s) {
  const str = String(s || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str)) return null;
  return /[+-]\d{2}:\d{2}$|Z$/.test(str) ? str : `${str}+05:30`;
}

// ── Normalisation ────────────────────────────────────────────────────────────

/**
 * Normalise a raw NSE `getCorporateAnnouncements` row into
 * { source:'NSE', category, headline, timestamp, raw }.
 * Uses `exchdisstime` (exchange dissemination time) as canonical, falling back
 * to `an_dt` (submission time) if dissemination time is missing.
 */
function normalizeNseAnnouncement(row) {
  const category = classifyEventText(row.desc);
  if (!category) return null;
  const timestamp = parseNseTimestamp(row.exchdisstime) || parseNseTimestamp(row.an_dt);
  if (!timestamp) return null;
  return { source: 'NSE', category, headline: row.desc, timestamp, raw: row };
}

/**
 * Normalise a raw BSE `getAnnouncements` row (AnnSubCategoryGetData Table row)
 * into { source:'BSE', category, headline, timestamp, raw }.
 * Uses `DissemDT` (millisecond-precision dissemination time) as canonical.
 */
function normalizeBseAnnouncement(row) {
  const category = classifyEventText(row.CATEGORYNAME) || classifyEventText(row.NEWSSUB);
  if (!category) return null;
  const timestamp = parseBseTimestamp(row.DissemDT) || parseBseTimestamp(row.News_submission_dt);
  if (!timestamp) return null;
  return { source: 'BSE', category, headline: row.NEWSSUB, timestamp, raw: row };
}

/**
 * Merge + classify raw NSE and BSE announcement rows into one ascending-by-time
 * list of normalised events. Unclassifiable/unparseable rows are dropped.
 * @param {Array} nseRows - from NseClient.getCorporateAnnouncements
 * @param {Array} bseRows - from BseClient.getAnnouncements
 * @returns {Array<{source,category,headline,timestamp,raw}>}
 */
function mergeAnnouncements(nseRows = [], bseRows = []) {
  const events = [
    ...nseRows.map(normalizeNseAnnouncement),
    ...bseRows.map(normalizeBseAnnouncement),
  ].filter(Boolean);
  events.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  return events;
}

/**
 * Find the latest event of a given category, optionally constrained to a
 * [start, end] ISO timestamp window (the "timeInterval" feature: give a start
 * and end time and only the latest event of that category within the window is
 * returned — useful for "what result did they report last quarter" style
 * lookups instead of always taking the most recent overall).
 * @param {Array} events - normalised, from mergeAnnouncements.
 * @param {'result'|'concall'|'order'|'monthly_update'} category
 * @param {Object} [opts]
 * @param {string} [opts.start] - ISO timestamp, inclusive lower bound.
 * @param {string} [opts.end]   - ISO timestamp, inclusive upper bound.
 * @returns {{source,category,headline,timestamp,raw}|null}
 */
function findLatestEvent(events, category, { start, end } = {}) {
  const matches = events.filter((e) => {
    if (e.category !== category) return false;
    if (start && e.timestamp < start) return false;
    if (end && e.timestamp > end) return false;
    return true;
  });
  if (!matches.length) return null;
  return matches[matches.length - 1];
}

/**
 * Cross-exchange earliest timestamp for "the same event" — NSE and BSE often
 * disseminate the same disclosure at slightly different times (and BSE
 * sometimes splits one event into multiple sub-announcements, e.g. board
 * meeting outcome vs. financial results tag). The earliest across both is the
 * more accurate "market could have known" anchor.
 * @param {{source,timestamp}|null} nseEvent
 * @param {{source,timestamp}|null} bseEvent
 * @returns {string|null} ISO timestamp, or null if both are missing.
 */
function earliestEventTimestamp(nseEvent, bseEvent) {
  const ts = [nseEvent?.timestamp, bseEvent?.timestamp].filter(Boolean);
  if (!ts.length) return null;
  return ts.reduce((a, b) => (a < b ? a : b));
}

// ── Candle normalisation + reaction metrics ─────────────────────────────────

/**
 * Normalise a Stockscans `ohlcv()` response's `prices` rows
 * ([isoTimestamp, o, h, l, c, v]) into ascending
 * [{ t: epochMs, open, high, low, close, volume }].
 */
function normalizeOhlcv(rawPrices) {
  const rows = Array.isArray(rawPrices) ? rawPrices : rawPrices?.prices || [];
  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) continue;
    // tf=1D rows are bare 'YYYY-MM-DD' (verified live 10-Jul-2026) — needs a
    // time component before Date.parse, unlike intraday 'YYYY-MM-DDTHH:mm:ss' rows.
    const raw = /T\d{2}:\d{2}:\d{2}/.test(row[0]) ? row[0] : `${row[0]}T00:00:00`;
    const t = Date.parse(raw.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(raw) ? raw : `${raw}+05:30`);
    if (!Number.isFinite(t)) continue;
    out.push({
      t,
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: Number(row[5] ?? 0),
    });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/** Index of the first candle at/after epoch ms `t`, or -1. */
function candleIndexAtOrAfter(candles, t) {
  for (let i = 0; i < candles.length; i++) if (candles[i].t >= t) return i;
  return -1;
}

/** Index of the last candle at/before epoch ms `t`, or -1. */
function candleIndexAtOrBefore(candles, t) {
  let idx = -1;
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].t <= t) idx = i;
    else break;
  }
  return idx;
}

/**
 * Core metric: given normalised ascending candles and an event ISO timestamp,
 * compute the four standard reaction metrics. The anchor price is the *open*
 * of the first candle at/after the event timestamp (i.e. price right as the
 * market starts reacting) — if the event lands after market hours, the anchor
 * naturally falls on the next session's first candle.
 *
 * "Since result" and "1hr/1day/1month post" all measure from that same anchor;
 * they differ only in how far forward you look, and whether "forward" means
 * wall-clock (1hr/1day/1month) or "now" (since result — the caller passes the
 * latest available candle as the reference).
 *
 * @param {Array<{t,open,high,low,close,volume}>} candles - normalised, ascending.
 * @param {string} eventTimestamp - ISO 8601.
 * @returns {{
 *   anchor: {t:number, iso:string, open:number}|null,
 *   sinceResult: number|null,
 *   oneHour: number|null,
 *   oneDay: number|null,
 *   oneWeek: number|null,
 *   oneMonth: number|null,
 *   note: string|null,
 * }}
 */
function computeReactionMetrics(candles, eventTimestamp) {
  const empty = (note) => ({
    anchor: null,
    sinceResult: null,
    oneHour: null,
    oneDay: null,
    oneWeek: null,
    oneMonth: null,
    note,
  });
  const eventT = Date.parse(eventTimestamp);
  if (!Number.isFinite(eventT) || !candles.length) {
    return empty('no event timestamp or no candles');
  }

  const anchorIdx = candleIndexAtOrAfter(candles, eventT);
  if (anchorIdx < 0) {
    return empty('event is after the last available candle');
  }
  const anchor = candles[anchorIdx];
  const anchorPrice = anchor.open;
  const lastCandle = candles[candles.length - 1];

  // A window is only answerable once the series actually *covers* targetT —
  // i.e. the last candle is at/after it. If targetT is still in the future
  // (event just happened, window hasn't elapsed yet) we must say "pending",
  // not silently substitute the latest close (that would make 1day/1month
  // indistinguishable from sinceResult for a same-day event, which is wrong).
  const returnAt = (targetT) => {
    if (!(anchorPrice > 0) || targetT > lastCandle.t) return null;
    const idx = candleIndexAtOrBefore(candles, targetT);
    if (idx < anchorIdx) return null;
    return candles[idx].close / anchorPrice - 1;
  };

  const WINDOWS = {
    oneHour: 60 * 60 * 1000,
    oneDay: 24 * 60 * 60 * 1000,
    oneWeek: 7 * 24 * 60 * 60 * 1000,
    oneMonth: 30 * 24 * 60 * 60 * 1000,
  };

  const sinceResult = anchorPrice > 0 ? lastCandle.close / anchorPrice - 1 : null;
  const values = {};
  for (const [key, offsetMs] of Object.entries(WINDOWS))
    values[key] = returnAt(anchor.t + offsetMs);

  const pending = [];
  const missingHistory = [];
  for (const [key, offsetMs] of Object.entries(WINDOWS)) {
    if (values[key] != null) continue;
    if (anchor.t + offsetMs > lastCandle.t) pending.push(key);
    else missingHistory.push(key);
  }

  const notes = [];
  if (pending.length) notes.push(`window not yet elapsed: ${pending.join(', ')}`);
  if (missingHistory.length)
    notes.push(
      `insufficient candle history (need to page further back/forward with 'before'): ${missingHistory.join(', ')}`
    );

  return {
    anchor: { t: anchor.t, iso: new Date(anchor.t).toISOString(), open: anchorPrice },
    sinceResult,
    oneHour: values.oneHour,
    oneDay: values.oneDay,
    oneWeek: values.oneWeek,
    oneMonth: values.oneMonth,
    note: notes.length ? notes.join('; ') : null,
  };
}

/**
 * Signal thresholds (Darshan, 10-Jul-2026 — rough starting numbers, to be
 * tuned later): a reaction counts as a "signal" (significant & sustainable
 * move) rather than noise if the return clears the bar for its window.
 * These are deliberately asymmetric-friendly — same threshold magnitude
 * applies whether the move is up or down, since a >4% single-day drop after
 * a result is just as much a "signal" as a >4% pop.
 */
const SIGNAL_THRESHOLDS = { oneDay: 0.04, oneWeek: 0.06, oneMonth: 0.1 };

/**
 * Classify a computeReactionMetrics() result against the signal thresholds.
 * @param {{oneDay:number|null, oneWeek:number|null, oneMonth:number|null}} metrics
 * @returns {{
 *   oneDay: boolean|null, oneWeek: boolean|null, oneMonth: boolean|null,
 *   any: boolean|null,
 * }} null for a window means "not yet computable" (pending/insufficient
 *   history), distinct from false ("computed, but below threshold").
 */
function classifySignal(metrics) {
  const clears = (val, threshold) => (val == null ? null : Math.abs(val) >= threshold);
  const oneDay = clears(metrics?.oneDay, SIGNAL_THRESHOLDS.oneDay);
  const oneWeek = clears(metrics?.oneWeek, SIGNAL_THRESHOLDS.oneWeek);
  const oneMonth = clears(metrics?.oneMonth, SIGNAL_THRESHOLDS.oneMonth);
  const known = [oneDay, oneWeek, oneMonth].filter((v) => v != null);
  const any = known.length ? known.some(Boolean) : null;
  return { oneDay, oneWeek, oneMonth, any };
}

module.exports = {
  classifyEventText,
  parseNseTimestamp,
  parseBseTimestamp,
  normalizeNseAnnouncement,
  normalizeBseAnnouncement,
  mergeAnnouncements,
  findLatestEvent,
  earliestEventTimestamp,
  normalizeOhlcv,
  candleIndexAtOrAfter,
  candleIndexAtOrBefore,
  computeReactionMetrics,
  SIGNAL_THRESHOLDS,
  classifySignal,
};
