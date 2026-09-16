'use strict';

/**
 * priceSpikeSignals — find trading days where a stock gained more than a
 * threshold (default +5%) on volume that was significantly above its own
 * recent normal, from NSE's price/volume/deliverable history.
 *
 * This is the deterministic half of the `rerating-catalysts` skill's
 * "Price-Volume Spike Days" sub-section (Phase 2.5): it answers "which days
 * were unusual" with pure arithmetic — no judgment, no LLM. The judgment step
 * (why did THIS day spike — reading announcements/filings) is a separate
 * concern, handled by resolveSpikeDayWhy() using the same WHY-ladder pattern
 * `gainers-signal`/`volume-rocketing` already use (see
 * skills/equity-research/_shared/scan-signal-pipeline.md Step 5).
 *
 * Source: NseClient.getPriceVolumeDeliverable(symbol, from, to) — same
 * endpoint priceMetrics.js already wraps for liquidity/candle purposes; this
 * module reuses its row-normalisation (normalizePvd) rather than re-parsing
 * NSE's date/number formats a second time (conventions §17 — never
 * re-implement a fact-extraction step a shared module already owns).
 *
 * Confirmed live 2026-09-15 against NSE:EMUDHRA, 15-Jun-2026..15-Sep-2026 —
 * 64 rows returned, EQ series only (no ALL-series dedup issue observed for a
 * single-series name; a multi-series name, e.g. one with both EQ and BE
 * listings, would need series-aware dedup before this module trusts a single
 * `close`/`volume` per calendar date — not yet exercised, flag if it comes up).
 */

const { normalizePvd } = require('./priceMetrics');

/**
 * Median of a numeric array. Returns NaN for an empty array.
 * @param {number[]} arr
 * @returns {number}
 */
function median(arr) {
  const vals = arr
    .filter(Number.isFinite)
    .slice()
    .sort((a, b) => a - b);
  if (!vals.length) return NaN;
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 === 0 ? (vals[mid - 1] + vals[mid]) / 2 : vals[mid];
}

/**
 * Attach, to each normalised PVD row, its 1-day return (close vs. prior
 * close) and the median traded quantity over the trailing N *calendar* days
 * (default 31, per Darshan's 2026-09-15 call — a calendar window rather than
 * a trailing-N-trading-day window, so the baseline is literally "this
 * month's typical volume" regardless of how many sessions fell in it).
 *
 * The trailing window for day D includes every row with
 * `date > D - windowDays` and `date <= D` (i.e. D's own volume counts toward
 * its own baseline — deliberate: a multi-day spike should still compare
 * against a baseline that includes the earlier spike days, since those are
 * real market history, not an artifact to exclude. If you want the baseline
 * to exclude D's own volume, pass `excludeSelf: true`.)
 *
 * @param {Array} pvdRows - raw rows from NseClient.getPriceVolumeDeliverable.
 * @param {Object} [opts]
 * @param {number} [opts.windowDays=31] - trailing calendar-day window for the volume median.
 * @param {boolean} [opts.excludeSelf=false] - exclude the day's own volume from its baseline.
 * @returns {Array<{date, close, prevClose, returnPct, volume, tradedValueCr, delivPerc, medianVolume, volumeMultiple}>}
 */
function computeDailyMetrics(pvdRows, { windowDays = 31, excludeSelf = false } = {}) {
  const rows = normalizePvd(pvdRows); // ascending by date, { date, close, tradedValue, qty, delivPerc }
  const out = rows.map((r, i) => {
    const prev = i > 0 ? rows[i - 1] : null;
    const returnPct = prev && prev.close > 0 ? (r.close / prev.close - 1) * 100 : null;
    return {
      date: r.date,
      close: r.close,
      prevClose: prev ? prev.close : null,
      returnPct,
      volume: r.qty,
      tradedValueCr: Number.isFinite(r.tradedValue) ? r.tradedValue / 1e7 : null,
      delivPerc: Number.isFinite(r.delivPerc) ? r.delivPerc : null,
    };
  });

  const dateMs = (d) => Date.parse(`${d}T00:00:00+05:30`);

  for (let i = 0; i < out.length; i++) {
    const d = out[i];
    const dMs = dateMs(d.date);
    const windowStartMs = dMs - windowDays * 86400000;
    const windowVols = [];
    for (let j = 0; j <= i; j++) {
      const cand = out[j];
      const cMs = dateMs(cand.date);
      if (cMs <= windowStartMs || cMs > dMs) continue;
      if (excludeSelf && j === i) continue;
      if (Number.isFinite(cand.volume)) windowVols.push(cand.volume);
    }
    d.medianVolume = windowVols.length ? median(windowVols) : null;
    d.medianVolumeWindowDays = windowDays;
    d.medianVolumeSampleSize = windowVols.length;
    d.volumeMultiple =
      d.medianVolume && d.medianVolume > 0 && Number.isFinite(d.volume)
        ? d.volume / d.medianVolume
        : null;
  }
  return out;
}

/**
 * Flag "spike days": return >= gainThresholdPct AND volume >= its trailing
 * median * volumeMultipleThreshold.
 *
 * Both thresholds are deliberately explicit params, not hardcoded, since
 * "significant volume" has no universal definition — 2x the trailing median
 * is this skill's starting default (loose enough to catch real accumulation
 * days without being so loose every green day qualifies); tune per company/
 * liquidity profile if a caller finds it too noisy or too quiet.
 *
 * A day needs at least `minSampleSize` prior/same-window volume observations
 * for its median to be trustworthy — a day whose trailing window has fewer
 * than `minSampleSize` observations (e.g. day 2 of a short fetch window) is
 * simply excluded from the returned array rather than flagged off a median
 * computed from 1-2 points. Callers that need to know WHY a day didn't
 * qualify (as opposed to genuinely not spiking) should inspect the
 * corresponding row in `computeDailyMetrics()`'s full output instead, where
 * `medianVolumeSampleSize` is always present.
 *
 * @param {Array} dailyMetrics - output of computeDailyMetrics().
 * @param {Object} [opts]
 * @param {number} [opts.gainThresholdPct=5] - minimum 1-day % gain to qualify.
 * @param {number} [opts.volumeMultipleThreshold=2] - minimum volume/medianVolume ratio.
 * @param {number} [opts.minSampleSize=5] - minimum trailing-window observations required.
 * @returns {Array} the subset of dailyMetrics rows that qualify, each with `volumeMultiple` set.
 */
function findSpikeDays(
  dailyMetrics,
  { gainThresholdPct = 5, volumeMultipleThreshold = 2, minSampleSize = 5 } = {}
) {
  return dailyMetrics.filter((d) => {
    if (d.returnPct == null || d.returnPct < gainThresholdPct) return false;
    if (d.medianVolumeSampleSize < minSampleSize) return false;
    if (d.volumeMultiple == null) return false;
    return d.volumeMultiple >= volumeMultipleThreshold;
  });
}

/**
 * Convenience: fetch NSE history for `symbol` over `lookbackDays` and return
 * the qualifying spike days directly. `nse` is an NseClient instance.
 * @param {import('../clients/NseClient')} nse
 * @param {string} symbol - bare NSE symbol (no NSE:/BSE: prefix).
 * @param {Object} [opts]
 * @param {number} [opts.lookbackDays=30] - how far back to fetch (per Darshan's
 *   2026-09-15 default of "last 1 month" for a bare gain-day scan request).
 * @param {number} [opts.medianWindowDays=31] - trailing calendar window for the volume median.
 * @param {number} [opts.gainThresholdPct=5]
 * @param {number} [opts.volumeMultipleThreshold=2]
 * @returns {Promise<{spikeDays: Array, allDays: Array, fetchedFrom: string, fetchedTo: string}>}
 */
async function findRecentSpikeDays(
  nse,
  symbol,
  {
    lookbackDays = 30,
    medianWindowDays = 31,
    gainThresholdPct = 5,
    volumeMultipleThreshold = 2,
    minSampleSize = 5,
  } = {}
) {
  const fmt = (dt) => {
    const p = dt.toISOString().slice(0, 10).split('-');
    return `${p[2]}-${p[1]}-${p[0]}`; // dd-mm-yyyy, NSE's expected format
  };
  const to = new Date();
  // Fetch medianWindowDays of extra history BEFORE the requested lookback
  // window so day 1 of the requested window still has a real trailing
  // baseline instead of an empty/short one.
  const from = new Date(Date.now() - (lookbackDays + medianWindowDays) * 86400000);
  const bareSymbol = symbol.replace(/^(NSE|BSE):/i, '');
  const rows = await nse.getPriceVolumeDeliverable(bareSymbol, fmt(from), fmt(to));
  const daily = computeDailyMetrics(rows, { windowDays: medianWindowDays });

  // Trim to the actually-requested lookback window for spike-flagging (the
  // extra pre-window history was fetched only to seed the median, not to be
  // itself eligible — otherwise widening medianWindowDays would silently
  // widen the reported window too).
  const cutoffMs = Date.now() - lookbackDays * 86400000;
  const inWindow = daily.filter((d) => Date.parse(`${d.date}T00:00:00+05:30`) >= cutoffMs);

  const spikeDays = findSpikeDays(inWindow, {
    gainThresholdPct,
    volumeMultipleThreshold,
    minSampleSize,
  });

  return {
    spikeDays,
    allDays: inWindow,
    fetchedFrom: fmt(from),
    fetchedTo: fmt(to),
    params: {
      lookbackDays,
      medianWindowDays,
      gainThresholdPct,
      volumeMultipleThreshold,
      minSampleSize,
    },
  };
}

module.exports = {
  median,
  computeDailyMetrics,
  findSpikeDays,
  findRecentSpikeDays,
};
