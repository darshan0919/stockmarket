#!/usr/bin/env node
'use strict';

/**
 * mtfFlushRecovery — daily review of the last 7 days of mtf-flush-daily signals: did the flush-driven
 * recovery happen as expected? Zero LLM. For each signal (latest `mtf_flush_scan` per date+symbol, signal date
 * within --days, default 7) it fetches NSE candles + NIFTYBEES and reads the rolling MTF book cache, then
 * lib/mtfFlush.assessRecovery grades price (signal-day low held, EMA20 / 50-EMA, return, excess) and the funded
 * book (rebuilding / flat / still unwinding). Verdicts: on-track | mixed | weak | failed | too-early.
 * Complements the weekly mtf-flush-outcomes (which only scores matured 20d windows). Writes one
 * `mtf_flush_recovery` event per run date (idempotent) and emails a per-signal table.
 *
 *   node mtfFlushRecovery.js [--dry-run] [--no-email] [--days N] [--env-file path]
 */

const { nse } = require('@stock/api');
const { sendHtmlEmail, stockscansLink, StorageService } = require('@stock/cloud-utils');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const m = require('./lib/mtfFlush');
const { history } = require('./mtfFlushOutcomes');

const DETECTOR = 'mtf-flush-recovery';
const CACHE_PATH = 'cache/mtf-flush-book.json';
const BENCH = 'NIFTYBEES';
const CONCURRENCY = 3;
const addDays = (iso, n) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const pct = (x, d = 1) => (typeof x === 'number' ? `${(x * 100).toFixed(d)}%` : '–');
const ORDER = { failed: 0, weak: 1, mixed: 2, 'on-track': 3, 'too-early': 4, 'no-data': 5 };
const COLOR = {
  'on-track': '#0b7a3b',
  mixed: '#8a6d00',
  weak: '#b25b00',
  failed: '#a00',
  'too-early': '#666',
  'no-data': '#666',
};

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

function countBy(rows, key) {
  const o = {};
  for (const r of rows) o[r[key]] = (o[r[key]] || 0) + 1;
  return o;
}

function formatEmail({ today, days, rows, counts, errors }) {
  const body = rows
    .map((r) => {
      const a = r.assess;
      return (
        `<tr><td>${stockscansLink(r.name || r.symbol, `NSE:${r.symbol}`, 'NSE', '#1a73e8')}</td>` +
        `<td>${r.signalDate}</td><td>${r.tier}${r.score != null ? ` (${r.score})` : ''}</td>` +
        `<td align="right">${a.sessions ?? '–'}</td>` +
        `<td style="color:${COLOR[a.verdict]}"><b>${a.verdict}</b></td>` +
        `<td align="right">${pct(a.ret)}</td><td align="right">${pct(a.excess)}</td>` +
        `<td align="right">${pct(a.maxAdverse)}</td>` +
        `<td align="right">${a.close != null ? a.close.toFixed(1) : '–'} / ${a.ema20 ? a.ema20.toFixed(1) : '–'} / ${a.ema50 ? a.ema50.toFixed(1) : '–'}</td>` +
        `<td>${a.mtfState ?? '–'} (${pct(a.qChg)})</td>` +
        `<td>${(a.reasons || []).join('; ')}${a.reason || ''}</td></tr>`
      );
    })
    .join('');
  const sum = Object.entries(counts)
    .map(([k, v]) => `<span style="color:${COLOR[k]}"><b>${v}</b> ${k}</span>`)
    .join(' · ');
  return {
    subject: `MTF flush recovery review ${today}: ${counts['on-track'] || 0} on-track, ${(counts.weak || 0) + (counts.failed || 0)} weak/failed (${rows.length} signals, ${days}d)`,
    html:
      `<div style="font:13px Arial"><h3>MTF flush — did the recovery happen? (signals from the last ${days} days)</h3><div>${sum}</div>` +
      `<table cellpadding="5" border="1" style="border-collapse:collapse;font:12px Arial;margin-top:8px"><tr style="background:#f3f3f3">` +
      `<th>Stock</th><th>Signal day</th><th>Tier</th><th>Sessions</th><th>Verdict</th><th>Ret since signal close</th><th>Excess vs ${BENCH} (from entry)</th><th>Max adverse (low)</th><th>Close / EMA20 / 50EMA</th><th>MTF book since signal</th><th>Why</th></tr>${body}</table>` +
      `<p style="color:#555"><b>Rules:</b> failed = closed below 50-EMA or below the signal-day low; weak = below EMA20 (or below the signal-day close after 3+ sessions); ` +
      `mixed = price holds but the funded book is still &gt;3% below the signal-day level; on-track = at/above EMA20 and the signal-day close with the book no longer shrinking. ` +
      `Price is as of the latest NSE close; the MTF book lags one session. Early reads on 5-10 sessions are noisy: the back-test edge is only ≈ +1% median over 20 sessions (hit 56-58%).</p>` +
      (errors.length ? `<p style="color:#a00">Fetch errors: ${errors.join(', ')}</p>` : '') +
      `</div>`,
  };
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const noEmail = process.argv.includes('--no-email');
  const days = Number(argValue('--days') || 7);
  const jobName = resolveJobName(DETECTOR);
  const db = require('./lib/db');
  const today = new Date().toISOString().slice(0, 10);
  const since = addDays(today, -days);

  const scans = db.find('events', { type: 'mtf_flush_scan', since });
  const latest = new Map();
  for (const s of [...scans].sort((a, b) =>
    String(a.modifiedTime || a.creationTime || '').localeCompare(
      String(b.modifiedTime || b.creationTime || '')
    )
  ))
    for (const x of s.signals || [])
      latest.set(`${s.date}|${x.symbol}`, { ...x, signalDate: s.date });
  const signals = [...latest.values()];
  if (!signals.length) {
    console.log(
      JSON.stringify({ today, days, signals: 0, note: 'no mtf_flush_scan signals in window' })
    );
    return;
  }

  const cache = StorageService.readJson(CACHE_PATH);
  const first = addDays(
    signals.reduce((a, s) => (s.signalDate < a ? s.signalDate : a), today),
    -150
  );
  const bench = await history(BENCH, first, today);
  const syms = [...new Set(signals.map((s) => s.symbol))];
  const candles = new Map();
  const errors = [];
  await pool(
    syms,
    async (sym) => {
      try {
        candles.set(sym, await history(sym, first, today));
      } catch (e) {
        errors.push(`${sym}: ${e.message}`);
      }
    },
    CONCURRENCY
  );

  const rows = signals.map((s) => {
    const c = candles.get(s.symbol);
    const assess = c
      ? m.assessRecovery({
          signalDate: s.signalDate,
          candles: c,
          bench,
          qDates: (cache && cache.dates) || [],
          qSeries: (cache && cache.q && cache.q[s.symbol]) || [],
        })
      : { verdict: 'no-data', reason: 'candle fetch failed' };
    return {
      ...s,
      name: cache && cache.meta && cache.meta[s.symbol] && cache.meta[s.symbol].n,
      assess,
    };
  });
  rows.sort(
    (a, b) =>
      ORDER[a.assess.verdict] - ORDER[b.assess.verdict] ||
      b.signalDate.localeCompare(a.signalDate) ||
      a.symbol.localeCompare(b.symbol)
  );
  const counts = countBy(
    rows.map((r) => ({ v: r.assess.verdict })),
    'v'
  );
  const byTier = {};
  for (const t of ['A', 'B', 'C']) {
    const tr = rows.filter((r) => r.tier === t);
    byTier[t] = countBy(
      tr.map((r) => ({ v: r.assess.verdict })),
      'v'
    );
  }
  const tracked = rows.filter((r) => r.assess.verdict !== 'no-data');
  let event = null;
  if (!dryRun && tracked.length) {
    event = db.appendEvents(
      [
        {
          type: 'mtf_flush_recovery',
          creator: DETECTOR,
          date: today,
          summary: `MTF flush recovery review ${today}: ${Object.entries(counts)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')}`,
          windowDays: days,
          counts,
          byTier,
          signals: rows.map((r) => ({
            symbol: r.symbol,
            signalDate: r.signalDate,
            tier: r.tier,
            score: r.score,
            verdict: r.assess.verdict,
            reasons: r.assess.reasons,
            sessions: r.assess.sessions,
            ret: r.assess.ret,
            excess: r.assess.excess,
            mtfState: r.assess.mtfState,
            qChg: r.assess.qChg,
          })),
        },
      ],
      { creator: DETECTOR }
    );
  }
  let email = {
    status: 'skipped',
    reason: noEmail ? '--no-email' : dryRun ? '--dry-run' : 'nothing tracked',
  };
  if (!noEmail && !dryRun && tracked.length) {
    const mail = formatEmail({ today, days, rows, counts, errors });
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
        today,
        days,
        signals: signals.length,
        symbols: syms.length,
        mtfBookLastDate: cache && cache.dates ? cache.dates[cache.dates.length - 1] : null,
        counts,
        byTier,
        rows: rows.map((r) => ({
          s: r.symbol,
          signalDate: r.signalDate,
          tier: r.tier,
          verdict: r.assess.verdict,
          reasons: r.assess.reasons,
          sessions: r.assess.sessions,
          ret: r.assess.ret,
          excess: r.assess.excess,
          mtf: r.assess.mtfState,
        })),
        errors,
        event: event && { upserted: event },
        email,
        filesTouched: dryRun ? [] : db.touchedFiles(),
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  const jobName = resolveJobName(DETECTOR);
  nse.setJobName && nse.setJobName(jobName);
  main()
    .catch((e) => {
      console.error('mtfFlushRecovery failed:', e);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}

module.exports = { main };
