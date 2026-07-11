'use strict';

/**
 * reactionCandlesFetcher — fetches just enough Stockscans OHLCV data to answer
 * the four event-reaction windows (sinceResult / 1hr / 1day / 1month), while
 * minimizing API calls.
 *
 * The naive approach — always fetch tf=1m and page backward with `before` one
 * page at a time until you reach the target — is correct but wasteful: a
 * single 1m page (verified live: 1000 candles per page) spans roughly 2-3
 * trading days, so covering a 1-month-out target at 1m resolution would take
 * ~10+ sequential API calls, each mostly redundant (you don't need
 * minute-level granularity a month after the event, only near it).
 *
 * Instead, this module picks ONE timeframe per target window such that a
 * SINGLE page's span (tf_minutes × PAGE_SIZE) comfortably covers the gap from
 * the event to that target, then computes a `before` cursor placed just past
 * the target so the returned page brackets it. That turns "10+ calls" into
 * "3 calls, one per tier" for the common case. Pagination only kicks in
 * (bounded by `maxPagesPerTier`) if a tier's first page doesn't reach far
 * enough back — e.g. a market holiday run, or PAGE_SIZE being smaller than
 * assumed for that instrument.
 *
 * Tiers (tf chosen so PAGE_SIZE candles >> the window being covered):
 *   - near   (tf=1m):  covers [event, event+1hr]   — 1000min ≈ 16.6h of span.
 *   - mid    (tf=15m): covers [event, event+1day]  — 1000×15min ≈ 10.4 days.
 *   - far    (tf=1d):  covers [event, event+1month] — 1000 daily candles ≈ years.
 * The far tier also doubles as the "latest price" source when the event is
 * old enough that `now` is beyond the near tier's range.
 */

const PAGE_SIZE = 1000; // verified live 10-Jul-2026 (NSE:ELECON tf=1m response).
// Valid Stockscans `tf` values (verified live 10-Jul-2026 from a 400 error's
// message): '1m','2m','3m','5m','10m','15m','30m','1h','2h','4h','1D','1W','1M'.
// Note '1D' (capital) for daily — not '1d'. '1M' means *monthly candles*, NOT
// "1 month of data" — do not use it as a lookback-window shorthand.
const TF_MINUTES = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '1D': 375 }; // 1D bucket ≈ one trading session's worth of gap-coverage per candle for this purpose — deliberately conservative (real calendar span per 1D candle is >>375min, so this only makes the "does one page cover it" check stricter, never looser.

/** Round-trip epoch-ms → the naive 'YYYY-MM-DDTHH:mm:ss' IST string Stockscans' `before` param expects for intraday timeframes (no 'Z', no offset — see verified curl samples). */
function toIstNaiveString(ms) {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const d = new Date(ms + IST_OFFSET_MS);
  return d.toISOString().slice(0, 19);
}

/**
 * Same IST round-trip as {@link toIstNaiveString} but truncated to a bare
 * date. Verified live 10-Jul-2026: `tf=1D` rejects a full timestamp `before`
 * with "Invalid before date, expected YYYY-MM-DD" — daily-candle pagination
 * needs the date-only form, unlike every intraday timeframe.
 */
function toIstDateString(ms) {
  return toIstNaiveString(ms).slice(0, 10);
}

/**
 * Normalise a Stockscans ohlcv() response's `prices` rows into ascending
 * epoch-ms candles. Duplicated here (not imported from eventReactionSignals)
 * to keep this fetcher independently testable without a circular import; the
 * shape must stay identical to eventReactionSignals.normalizeOhlcv.
 */
function normalizeRows(resp) {
  const rows = Array.isArray(resp) ? resp : resp?.prices || [];
  const out = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 5) continue;
    const raw = row[0];
    // tf=1D rows are bare 'YYYY-MM-DD' (verified live 10-Jul-2026) — no time
    // component, so Date.parse(`${raw}+05:30`) is malformed and silently
    // yields NaN, dropping every daily candle. Give it a midnight IST time
    // first. Intraday rows already have 'YYYY-MM-DDTHH:mm:ss'.
    const withTime = /T\d{2}:\d{2}:\d{2}/.test(raw) ? raw : `${raw}T00:00:00`;
    const iso = /[+-]\d{2}:\d{2}$|Z$/.test(withTime) ? withTime : `${withTime}+05:30`;
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) continue;
    out.push({ t, open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5] ?? 0) });
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * Fetch one tier: page(s) at a fixed `tf` that bracket the range
 * [stopAtMs, targetMs] — `stopAtMs` is the event/anchor time (the lower bound
 * we must page back to), `targetMs` is the forward-looking window we need a
 * candle near (event+1hr / +1day / +1month). The cursor starts just past
 * `min(targetMs, now)` — no point requesting candles after "now" or after the
 * window we actually need — and pages backward only as far as `stopAtMs`.
 * @returns {{ candles: Array, calls: number }}
 */
async function fetchTier(stockscans, ticker, tf, targetMs, { stopAtMs = -Infinity, maxPages = 4, bufferMinutes = 5 } = {}) {
  const formatBefore = tf === '1D' ? toIstDateString : toIstNaiveString;
  const now = Date.now();
  const cap = Math.min(targetMs, now) + bufferMinutes * 60 * 1000;
  let before = formatBefore(cap);
  const all = [];
  let calls = 0;

  for (let page = 0; page < maxPages; page++) {
    calls += 1;
    // eslint-disable-next-line no-await-in-loop
    const resp = await stockscans.ohlcv(ticker, { tf, before });
    const candles = normalizeRows(resp);
    if (!candles.length) break;
    all.unshift(...candles);
    const earliest = candles[0].t;
    const reachedAnchor = earliest <= stopAtMs;
    const exhausted = resp?.hasMore === false;
    if (reachedAnchor || exhausted) break;
    before = formatBefore(earliest);
  }

  // Dedupe (pages can overlap by one candle at the boundary).
  const seen = new Set();
  const deduped = all.filter((c) => (seen.has(c.t) ? false : (seen.add(c.t), true)));
  deduped.sort((a, b) => a.t - b.t);
  return { candles: deduped, calls };
}

/**
 * Fetch the minimal set of OHLCV pages needed to compute all four reaction
 * windows for one event, and merge them into a single ascending candle series
 * ready for eventReactionSignals.computeReactionMetrics.
 *
 * Call budget: 3 in the common case (one per tier), more only if a tier
 * needed extra pages (bounded by maxPagesPerTier, default 4 → 12 max).
 *
 * @param {import('../clients/StockscansClient').StockscansClient} stockscans
 * @param {string} ticker - e.g. "NSE:ELECON".
 * @param {string} eventTimestamp - ISO 8601 (as produced by
 *   eventReactionSignals.earliestEventTimestamp / normalizeNse|BseAnnouncement).
 * @param {Object} [opts]
 * @param {number} [opts.maxPagesPerTier=4]
 * @returns {Promise<{ candles: Array<{t,open,high,low,close,volume}>, calls: number, tiers: Object }>}
 */
async function fetchReactionCandles(stockscans, ticker, eventTimestamp, { maxPagesPerTier = 4 } = {}) {
  const t0 = Date.parse(eventTimestamp);
  if (!Number.isFinite(t0)) {
    throw new Error(`fetchReactionCandles: invalid eventTimestamp "${eventTimestamp}"`);
  }
  const now = Date.now();
  const t1 = t0 + 60 * 60 * 1000; // +1hr
  const t2 = t0 + 24 * 60 * 60 * 1000; // +1day
  const t3 = t0 + 30 * 24 * 60 * 60 * 1000; // +1month

  const near = await fetchTier(stockscans, ticker, '1m', t1, { stopAtMs: t0, maxPages: maxPagesPerTier });
  const mid = await fetchTier(stockscans, ticker, '15m', t2, { stopAtMs: t0, maxPages: maxPagesPerTier });
  // The far/1D tier always caps its cursor at "now" (not min(t3, now) like the
  // other tiers) — a single 1D page spans years, so reaching "now" costs
  // nothing extra, and doing so is what lets this tier double as (a) the
  // 1-month-post answer even when t3 is already in the past, and (b) the
  // latest-price source for `sinceResult` on an old event, where the near/mid
  // tiers (deliberately capped near the event to stay cheap) don't reach "now".
  const far = await fetchTier(stockscans, ticker, '1D', Math.max(t3, now), { stopAtMs: t0, maxPages: maxPagesPerTier });

  const merged = [...near.candles, ...mid.candles, ...far.candles];
  const seen = new Set();
  const deduped = merged.filter((c) => (seen.has(c.t) ? false : (seen.add(c.t), true)));
  deduped.sort((a, b) => a.t - b.t);

  return {
    candles: deduped,
    calls: near.calls + mid.calls + far.calls,
    tiers: {
      near: { tf: '1m', calls: near.calls, n: near.candles.length },
      mid: { tf: '15m', calls: mid.calls, n: mid.candles.length },
      far: { tf: '1D', calls: far.calls, n: far.candles.length },
    },
  };
}

module.exports = {
  PAGE_SIZE,
  TF_MINUTES,
  toIstNaiveString,
  toIstDateString,
  normalizeRows,
  fetchTier,
  fetchReactionCandles,
};
