'use strict';

/**
 * eventReactionMetrics — end-to-end orchestration: symbol + event category (+
 * optional time window) → exact event timestamp → minute-level reaction
 * metrics. This is the callable core the `event-reaction-signals` skill wraps.
 *
 * Pipeline:
 *   1. Resolve the BSE scrip code for the symbol (BSE search — NSE's is
 *      broken; see NseClient's header comment).
 *   2. Fetch NSE + BSE corporate announcements over a date range wide enough
 *      to contain the requested window (or the last `lookbackDays` if no
 *      window given).
 *   3. Classify + merge them (eventReactionSignals.mergeAnnouncements),
 *      find the latest event of the requested category within the window
 *      (findLatestEvent), and take the earliest cross-exchange timestamp for
 *      it (earliestEventTimestamp — BSE sometimes tags the same event ~1min
 *      earlier via a separate sub-announcement; see the module's header note).
 *   4. Fetch just enough OHLCV (reactionCandlesFetcher.fetchReactionCandles —
 *      3 API calls typically, via right-sized `tf`/`before` per horizon, not
 *      blind pagination).
 *   5. computeReactionMetrics for sinceResult / 1hr / 1day / 1month.
 *
 * Validated live 10-Jul-2026 against Elecon Engineering's actual result (same
 * day) and TCS's April 2026 result (3 months back, all 4 windows resolved).
 */

const {
  mergeAnnouncements,
  findLatestEvent,
  earliestEventTimestamp,
} = require('../analyzers/eventReactionSignals');
const { computeReactionMetrics } = require('../analyzers/eventReactionSignals');
const { fetchReactionCandles } = require('../fetchers/reactionCandlesFetcher');

/** NSE wants DD-MM-YYYY; BSE wants YYYYMMDD. */
function fmtNse(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}
function fmtBse(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/**
 * @param {Object} clients - { nse: NseClient, bse: BseClient, stockscans: StockscansClient }
 * @param {string} symbol - bare NSE symbol, e.g. "ELECON".
 * @param {'result'|'concall'|'order'|'monthly_update'} category
 * @param {Object} [opts]
 * @param {string} [opts.start] - ISO timestamp, restrict search to events at/after this.
 * @param {string} [opts.end]   - ISO timestamp, restrict search to events at/before this.
 * @param {number} [opts.lookbackDays=120] - how far back to search when no `start` is given.
 * @param {string} [opts.bseScripCode] - skip the BSE search round-trip if already known.
 * @returns {Promise<{
 *   symbol: string, category: string,
 *   event: {source:string,category:string,headline:string,timestamp:string}|null,
 *   metrics: Object|null,
 *   apiCalls: {announcements:number, ohlcv:number},
 *   note: string|null,
 * }>}
 */
async function fetchEventReactionMetrics(clients, symbol, category, opts = {}) {
  const { nse, bse, stockscans } = clients;
  const { start, end, lookbackDays = 120, bseScripCode } = opts;

  const now = new Date();
  const from = start ? new Date(start) : new Date(now.getTime() - lookbackDays * 86400000);
  const to = end ? new Date(end) : now;

  const [nseRows, scripCode] = await Promise.all([
    nse.getCorporateAnnouncements(fmtNse(from), fmtNse(to), symbol),
    bseScripCode ? Promise.resolve(bseScripCode) : bse.getScripCode(symbol),
  ]);

  const bseRows = scripCode ? await bse.getAnnouncements(scripCode, fmtBse(from), fmtBse(to)) : [];
  const apiCalls = { announcements: 2 + (bseScripCode ? 0 : 1) };

  const events = mergeAnnouncements(nseRows, bseRows);

  // earliestEventTimestamp wants the per-exchange latest-in-window pick so it
  // can compare "the same event" across sources, not just the globally latest
  // (which could already be a BSE-only sub-announcement).
  const nseEvent = findLatestEvent(
    events.filter((e) => e.source === 'NSE'),
    category,
    { start, end }
  );
  const bseEvent = findLatestEvent(
    events.filter((e) => e.source === 'BSE'),
    category,
    { start, end }
  );

  if (!nseEvent && !bseEvent) {
    return {
      symbol,
      category,
      event: null,
      metrics: null,
      apiCalls,
      note: `no ${category} event found for ${symbol} in the requested window`,
    };
  }

  const timestamp = earliestEventTimestamp(nseEvent, bseEvent);
  const chosen = (nseEvent?.timestamp === timestamp && nseEvent) || bseEvent || nseEvent;

  const ticker = `NSE:${symbol.toUpperCase()}`;
  const { candles, calls } = await fetchReactionCandles(stockscans, ticker, timestamp);
  apiCalls.ohlcv = calls;

  const metrics = computeReactionMetrics(candles, timestamp);

  return {
    symbol,
    category,
    event: {
      source: chosen.source,
      category: chosen.category,
      headline: chosen.headline,
      timestamp,
    },
    metrics,
    apiCalls,
    note: null,
  };
}

module.exports = { fetchEventReactionMetrics, fmtNse, fmtBse };
