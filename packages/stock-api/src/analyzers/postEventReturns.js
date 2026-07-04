'use strict';

/**
 * postEventReturns — historical post-event drift for the pre-PEAD surprise scanner.
 *
 * The pre-PEAD edge is not just "will they beat?" but "does a beat actually MOVE
 * this stock?". Two companies can both beat; one drifts +8% over the next month
 * (positive PEAD — the market under-reacts and rewards the surprise) while the
 * other gives it all back (the beat was already priced, or the stock is a
 * "sell-the-news" name). This module quantifies that history so the ranking can
 * weight names whose surprises have historically been *tradeable*.
 *
 * `Returns after last result` is available directly as a Stockscans scan column
 * (read it in runScan). This module handles what the scan does NOT give you:
 * the forward return measured from the *concall* date and the *transcript-release*
 * date — which differ from the result date (a company reports numbers on day T,
 * holds the concall on T+0..T+2, and the transcript lands a few days later). Each
 * event reveals different information, so each has its own drift signature.
 *
 * Price-action is Stockscans' `prices()` endpoint (list-of-candles). We never
 * fabricate a price — if the series doesn't cover the window, the window returns
 * null and the caller reports "insufficient history" rather than a guessed number.
 */

/**
 * Normalise the many shapes Stockscans `prices()` can return into a sorted
 * ascending array of { date: 'YYYY-MM-DD', close: Number }.
 *
 * Observed shapes:
 *   - [[tsMillisOrSec, open, high, low, close, volume], ...]
 *   - { prices|data|candles: [ ...as above... ] }
 *   - [{ date|time|t, close|c }, ...]
 */
function normalizeCandles(raw) {
  let arr = raw;
  if (raw && !Array.isArray(raw)) {
    arr = raw.prices || raw.data || raw.candles || raw.result || [];
  }
  if (!Array.isArray(arr)) return [];

  const out = [];
  for (const row of arr) {
    let date = null;
    let close = null;

    if (Array.isArray(row)) {
      // [ts, o, h, l, c, v] — close is index 4, fall back to last element.
      const ts = row[0];
      close = Number(row[4] != null ? row[4] : row[row.length - 1]);
      date = tsToDate(ts);
    } else if (row && typeof row === 'object') {
      close = Number(
        row.close != null ? row.close
          : row.c != null ? row.c
            : row.Close != null ? row.Close : NaN
      );
      const ts = row.date != null ? row.date
        : row.time != null ? row.time
          : row.t != null ? row.t
            : row.Date != null ? row.Date : null;
      date = tsToDate(ts);
    }

    if (date && Number.isFinite(close)) out.push({ date, close });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/** Coerce a timestamp (ms epoch, sec epoch, or date string) to 'YYYY-MM-DD'. */
function tsToDate(ts) {
  if (ts == null) return null;
  if (typeof ts === 'string') {
    // Already a date-like string.
    const m = ts.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  let n = Number(ts);
  if (!Number.isFinite(n)) return null;
  if (n < 1e12) n *= 1000; // seconds → ms
  const d = new Date(n);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * Index of the first candle on or after `dateStr` (the event's "anchor" close).
 * Events often fall on a holiday/weekend or after market close; we anchor on the
 * first trading day whose close reflects the event, then measure forward from it.
 * Returns -1 if no candle is on/after the date.
 */
function anchorIndex(candles, dateStr) {
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].date >= dateStr) return i;
  }
  return -1;
}

/**
 * Forward return from the anchor over `n` trading days.
 * Uses trading-day offsets (candle steps), not calendar days, so windows are
 * comparable across names regardless of holidays. Returns a fraction (0.05 = +5%)
 * or null if the series doesn't extend far enough.
 */
function forwardReturn(candles, anchorIdx, n) {
  if (anchorIdx < 0) return null;
  const base = candles[anchorIdx];
  const target = candles[anchorIdx + n];
  if (!base || !target || !(base.close > 0)) return null;
  return target.close / base.close - 1;
}

/**
 * Compute forward returns for one event across the standard windows.
 * @param {Array<{date,close}>} candles - normalised, ascending.
 * @param {string} eventDate - 'YYYY-MM-DD'.
 * @param {number[]} [windows=[1,5,20]] - trading-day horizons.
 * @returns {{ anchorDate:string|null, windows: Object<string, number|null> }}
 */
function eventReturns(candles, eventDate, windows = [1, 5, 20]) {
  const idx = anchorIndex(candles, eventDate);
  const anchorDate = idx >= 0 ? candles[idx].date : null;
  const out = {};
  for (const w of windows) out[`d${w}`] = forwardReturn(candles, idx, w);
  return { anchorDate, windows: out };
}

/**
 * Main entry: given a price series and a set of dated events, return the forward
 * drift for each. `events` is a map of label → dateStr, e.g.
 *   { result: '2026-01-28', concall: '2026-01-29', transcript: '2026-02-03' }
 *
 * Design note — why measure all three: the *gap* between them is itself signal.
 * If the stock is flat into the result but drifts up only after the transcript
 * lands, the market is reacting to Q&A detail that headline numbers missed — a
 * pattern that tends to repeat and is exactly what a pre-PEAD scan wants to catch.
 *
 * @param {*} rawPrices - raw Stockscans prices() response.
 * @param {Object<string,string>} events - label → 'YYYY-MM-DD'.
 * @param {number[]} [windows=[1,5,20]]
 * @returns {{ nCandles:number, coverage:{first:string,last:string}|null, events: Object }}
 */
function postEventReturns(rawPrices, events, windows = [1, 5, 20]) {
  const candles = normalizeCandles(rawPrices);
  const coverage = candles.length
    ? { first: candles[0].date, last: candles[candles.length - 1].date }
    : null;

  const result = {};
  for (const [label, date] of Object.entries(events || {})) {
    if (!date) { result[label] = { anchorDate: null, windows: emptyWindows(windows), note: 'no event date' }; continue; }
    const er = eventReturns(candles, date, windows);
    // If we couldn't anchor, or the last window is null, say why.
    const insufficient = er.anchorDate == null
      || er.windows[`d${windows[windows.length - 1]}`] == null;
    result[label] = {
      eventDate: date,
      ...er,
      note: insufficient ? 'insufficient price history for full window' : null,
    };
  }
  return { nCandles: candles.length, coverage, events: result };
}

function emptyWindows(windows) {
  const o = {};
  for (const w of windows) o[`d${w}`] = null;
  return o;
}

/**
 * Summarise repeated post-result behaviour across several past quarters into a
 * one-line drift signature the ranking can consume. Pass an array of the `d20`
 * (or chosen window) returns from consecutive results.
 * @param {Array<number|null>} rets
 * @returns {{ n:number, mean:number|null, hitRate:number|null, label:string }}
 *   label ∈ { 'strong-positive-drift', 'positive-drift', 'noisy', 'fade', 'insufficient' }
 */
function driftSignature(rets) {
  const clean = (rets || []).filter((r) => Number.isFinite(r));
  if (clean.length < 2) return { n: clean.length, mean: null, hitRate: null, label: 'insufficient' };
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  const hitRate = clean.filter((r) => r > 0).length / clean.length;
  let label;
  if (mean >= 0.05 && hitRate >= 0.6) label = 'strong-positive-drift';
  else if (mean > 0.01 && hitRate >= 0.5) label = 'positive-drift';
  else if (mean <= -0.02) label = 'fade';
  else label = 'noisy';
  return { n: clean.length, mean, hitRate, label };
}

module.exports = {
  postEventReturns,
  eventReturns,
  driftSignature,
  normalizeCandles,
  anchorIndex,
  forwardReturn,
  tsToDate,
};
