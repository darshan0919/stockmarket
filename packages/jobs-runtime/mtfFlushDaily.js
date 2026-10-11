#!/usr/bin/env node
'use strict';

/**
 * mtfFlushDaily — script-only daily detector for Shashank's "MTF flush-out + rejection" entry
 * (back-tested rule G4, docs/mtf-flush-signal/SPEC.md). Zero LLM.
 *   1. indiamtf.com per-scrip daily funded book (NSE+BSE disclosure, one session lag) -> rolling
 *      q cache (cache/mtf-flush-book.json, self-bootstrapping, disposable).
 *   2. Stage-1 screen: book >= Rs 20 Cr and shares financed down >= 15% over 10 sessions.
 *   3. Stage-2 (screen survivors only): NSE daily candles (wicks, EMA20, 50-DMA, 250d high), NSE
 *      bhavcopy at D and ~120 sessions earlier for the universe 120-session-return rank.
 *   4. lib/mtfFlush.evaluateStock -> score 0-100 + tier A (prime) / B (core) / C (near-miss watch).
 *   5. signal-ledger (detector `mtf-flush`, signalId `MTF-flush`), one `mtf_flush_scan` event, and a
 *      SCORED + CATEGORISED email for NEW signals only (silent otherwise unless --always-email).
 *
 *   node mtfFlushDaily.js [--dry-run] [--no-email] [--always-email] [--date YYYY-MM-DD]
 *                         [--max-candidates N] [--env-file path]
 */

const { indiamtf, nse } = require('@stock/api');
const { sendHtmlEmail, stockscansLink, StorageService } = require('@stock/cloud-utils');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const signalLedger = require('./lib/signalLedger');
const m = require('./lib/mtfFlush');
const { formatEmail } = require('./lib/mtfFlushEmail');

const DETECTOR = 'mtf-flush';
const SIGNAL_ID = 'MTF-flush';
const CACHE_PATH = 'cache/mtf-flush-book.json';
const CONCURRENCY = 3;
const BOOTSTRAP_CAL_DAYS = 130;
const MIN_SESSIONS = 62;

const DAY = 86400000;
const addDays = (iso, n) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const ddmmyyyy = (iso) => `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`;

async function pool(items, worker, size) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await worker(items[k]);
      }
    })
  );
  return out;
}

/** Bring the rolling q cache up to `signalDate`. Returns {cache, fetched, missing}. */
async function refreshBook(cache, signalDate) {
  const have = new Set(cache.dates);
  const last = cache.dates[cache.dates.length - 1];
  const start =
    cache.dates.length >= MIN_SESSIONS && last
      ? addDays(last, 1)
      : addDays(signalDate, -BOOTSTRAP_CAL_DAYS);
  const wanted = [];
  for (let d = start; d <= signalDate; d = addDays(d, 1)) if (!have.has(d)) wanted.push(d);
  const files = await pool(
    wanted,
    async (d) => ({
      d,
      rows: await indiamtf.scripwiseDaily(d).catch((e) => ({ error: e.message })),
    }),
    CONCURRENCY
  );
  let c = cache;
  let fetched = 0;
  const errors = [];
  for (const f of files.sort((a, b) => a.d.localeCompare(b.d))) {
    if (f.rows && f.rows.error) errors.push(`${f.d}: ${f.rows.error}`);
    else if (f.rows) {
      c = m.mergeBook(c, f.d, f.rows);
      fetched++;
    }
  }
  return { cache: c, fetched, errors };
}

/** 3 x 4-month chunks -> ascending, de-duplicated candles up to signalDate. */
async function fetchCandles(symbol, signalDate) {
  const byDate = new Map();
  for (let k = 0; k < 4; k++) {
    const end = k === 0 ? signalDate : addDays(signalDate, -91 * k);
    let rows;
    for (let attempt = 0; ; attempt++) {
      try {
        rows = await nse.getHistoricalOhlcv(symbol, { months: 3, endDate: end });
        break;
      } catch (e) {
        if (attempt >= 2) throw e; // transient 5xx from the bhavcopy MCP: retry twice, then surface
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    for (const r of rows) if (r.date <= signalDate && r.close > 0) byDate.set(r.date, r);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Closes map for `signalDate` and the nearest earlier published bhavcopy ~120 sessions back. */
async function universeReturns(signalDate) {
  const now = await nse.getDeliveryBhavcopy(ddmmyyyy(signalDate));
  if (!now) return null;
  let old = null;
  for (let back = 174; back <= 180 && !old; back++) {
    const iso = addDays(signalDate, -back);
    const txt = await nse.getDeliveryBhavcopy(ddmmyyyy(iso), 1);
    if (txt) old = m.parseBhavCloses(txt);
  }
  if (!old) return null;
  const cur = m.parseBhavCloses(now);
  const rets = [];
  for (const [s, px] of cur) if (old.has(s)) rets.push(px / old.get(s) - 1);
  return { sorted: rets.sort((a, b) => a - b), cur, old, size: rets.length };
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

async function main() {
  loadEnv(argValue('--env-file'));
  const argv = process.argv;
  const dryRun = argv.includes('--dry-run');
  const noEmail = argv.includes('--no-email');
  const alwaysEmail = argv.includes('--always-email');
  const maxCand = Number(argValue('--max-candidates') || 0) || 80;
  const jobName = resolveJobName(DETECTOR);
  const db = require('./lib/db');
  StorageService.init();

  const signalDate = argValue('--date') || (await indiamtf.latestDate());
  if (!signalDate) throw new Error('could not determine latest MTF date from indiamtf.com');

  // 1) book cache
  const cached = StorageService.readJson(CACHE_PATH) || { version: 1, dates: [], q: {}, meta: {} };
  const { cache, fetched, errors: bookErrors } = await refreshBook(cached, signalDate);
  const lastDate = cache.dates[cache.dates.length - 1];
  if (lastDate !== signalDate) {
    throw new Error(
      `book cache ends ${lastDate}, expected ${signalDate} (file unpublished?) — aborting without signals`
    );
  }
  if (cache.dates.length < 11)
    throw new Error(`only ${cache.dates.length} MTF sessions cached; need >= 11`);
  if (!dryRun && fetched) await StorageService.saveJson(CACHE_PATH, cache);

  // 2) stage-1 screen (+ contextual baseline: flush count over the previous 20 sessions)
  const isFlush = (series) => {
    const q = m.qFeatures(series);
    return q.q10 != null && q.q10 <= m.THRESH.q10Max;
  };
  const syms = Object.keys(cache.q);
  const stage1Syms = syms.filter(
    (s) =>
      cache.q[s][cache.dates.length - 1] != null &&
      (cache.meta[s]?.cr ?? 0) >= m.THRESH.minBookCr &&
      isFlush(cache.q[s])
  );
  const history = [];
  for (let back = 1; back <= 20 && cache.dates.length - back >= 11; back++) {
    const end = cache.dates.length - back;
    history.push(
      syms.filter((s) => cache.q[s][end - 1] != null && isFlush(cache.q[s].slice(0, end))).length
    );
  }
  const flushMedian = median(history);

  // 3) stage-2 data, only for survivors
  const universe = await universeReturns(signalDate).catch(() => null);
  const toFetch = [...stage1Syms]
    .sort((a, b) => m.qFeatures(cache.q[a]).q10 - m.qFeatures(cache.q[b]).q10)
    .slice(0, maxCand);
  const evals = await pool(
    toFetch,
    async (symbol) => {
      try {
        const candles = await fetchCandles(symbol, signalDate);
        if (!candles.length || candles[candles.length - 1].date !== signalDate) {
          return { symbol, error: `no candle for ${signalDate}` };
        }
        let rank120 = null;
        if (universe && universe.old.has(symbol) && candles.length) {
          rank120 = m.pctRank(
            candles[candles.length - 1].close / universe.old.get(symbol) - 1,
            universe.sorted
          );
        }
        const ev = m.evaluateStock({
          symbol,
          bookCr: cache.meta[symbol].cr,
          qSeries: cache.q[symbol],
          candles,
          rank120,
        });
        return { ...ev, name: cache.meta[symbol].n, lastLow: candles[candles.length - 1].low };
      } catch (e) {
        return { symbol, error: e.message };
      }
    },
    CONCURRENCY
  );
  const fetchErrors = evals.filter((e) => e.error);
  const ok = evals.filter((e) => !e.error);
  const tiered = ok
    .filter((e) => e.tier)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.symbol.localeCompare(b.symbol));

  // 4) ledger
  const prev = new Map(
    signalLedger
      .getStates({ signalIds: [SIGNAL_ID], entityType: 'company', activeOnly: true })
      .map((r) => [r.entityId, r])
  );
  const stateOf = (t) => (t === 'C' ? 'detected' : 'entry-ready');
  for (const t of tiered)
    t.isNew =
      !prev.has(t.symbol) ||
      (stateOf(t.tier) === 'entry-ready' && prev.get(t.symbol).state !== 'entry-ready');
  const failedSyms = new Set(fetchErrors.map((e) => e.symbol));
  const observations = ok.map((e) => ({
    signalId: SIGNAL_ID,
    entityType: 'company',
    entityId: e.symbol,
    state: e.tier ? stateOf(e.tier) : null,
    minMisses: 5,
    levels: e.tier ? { signalDayLow: e.lastLow, signalDayClose: e.features.close } : undefined,
    evidence: e.tier
      ? {
          tier: e.tier,
          score: e.score,
          q10: e.features.q10,
          qpk: e.features.qpk,
          lowWick: e.features.lowWick,
          dist20: e.features.dist20,
          rank120: e.features.rank,
          mtfDate: signalDate,
        }
      : undefined,
  }));
  // previously active names that dropped out of stage-1 are explicit misses (but never when we could not fetch them)
  for (const s of prev.keys()) {
    if (!toFetch.includes(s) && !failedSyms.has(s)) {
      observations.push({
        signalId: SIGNAL_ID,
        entityType: 'company',
        entityId: s,
        state: null,
        minMisses: 5,
      });
    }
  }
  let ledger = null;
  let event = null;
  if (!dryRun) {
    ledger = signalLedger.applyObservations(observations, { detector: DETECTOR, date: signalDate });
    event = db.appendEvents(
      [
        {
          type: 'mtf_flush_scan',
          creator: DETECTOR,
          date: signalDate,
          summary: `MTF flush scan ${signalDate}: stage1=${stage1Syms.length} A=${tiered.filter((t) => t.tier === 'A').length} B=${tiered.filter((t) => t.tier === 'B').length} C=${tiered.filter((t) => t.tier === 'C').length}`,
          stage1: stage1Syms.length,
          stage1Median20: flushMedian,
          rankUniverse: universe ? universe.size : 0,
          signals: tiered.map((t) => ({
            symbol: t.symbol,
            tier: t.tier,
            score: t.score,
            isNew: t.isNew,
          })),
        },
      ],
      { creator: DETECTOR }
    );
  }

  // 5) email (scored + categorised; new signals only)
  const newCount = tiered.filter((t) => t.isNew).length;
  let email = {
    status: 'skipped',
    reason: noEmail ? '--no-email' : dryRun ? '--dry-run' : 'no new signals',
  };
  const mail = formatEmail(
    {
      signalDate,
      rows: tiered,
      stage1: stage1Syms.length,
      flushMedian,
      rankSize: universe ? universe.size : 0,
      newCount,
      fetchErrors: fetchErrors.map((e) => e.symbol),
    },
    stockscansLink
  );
  if (!noEmail && !dryRun && (newCount > 0 || alwaysEmail)) {
    email = await sendHtmlEmail({
      subject: mail.subject,
      htmlBody: mail.html,
      to: process.env.DEALS_DIGEST_TO || undefined,
      jobName,
    });
  }

  console.log(
    JSON.stringify(
      {
        signalDate,
        dryRun,
        bookSessions: cache.dates.length,
        bookFetched: fetched,
        bookErrors,
        stage1: stage1Syms.length,
        stage1Median20: flushMedian,
        stage2Evaluated: ok.length,
        rankUniverse: universe ? universe.size : 0,
        excluded: ok.filter((e) => e.excluded).map((e) => `${e.symbol}: ${e.excluded}`),
        fetchErrors: fetchErrors.map((e) => `${e.symbol}: ${e.error}`),
        tiers: {
          A: tiered
            .filter((t) => t.tier === 'A')
            .map((t) => ({ s: t.symbol, score: t.score, new: t.isNew })),
          B: tiered
            .filter((t) => t.tier === 'B')
            .map((t) => ({ s: t.symbol, score: t.score, new: t.isNew })),
          C: tiered
            .filter((t) => t.tier === 'C')
            .map((t) => ({ s: t.symbol, failed: t.failed, new: t.isNew })),
        },
        ledger,
        event: event && { upserted: event },
        email,
        filesTouched: dryRun
          ? []
          : [
              ...new Set([
                ...db.touchedFiles(),
                ...(StorageService.touchedFiles ? StorageService.touchedFiles() : []),
              ]),
            ],
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  const jobName = resolveJobName(DETECTOR);
  indiamtf.setJobName(jobName);
  nse.setJobName && nse.setJobName(jobName);
  main()
    .catch((e) => {
      console.error('mtfFlushDaily failed:', e);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}

module.exports = { main, refreshBook };
