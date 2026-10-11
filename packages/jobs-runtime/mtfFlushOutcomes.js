#!/usr/bin/env node
'use strict';

/**
 * mtfFlushOutcomes — scores the mtf-flush-daily signals against what happened next. Zero LLM.
 * Reads `mtf_flush_scan` events (last 180 days), fetches NSE daily candles for each signalled stock and
 * NIFTYBEES (benchmark), and computes 5/10/20-session returns from the NEXT close after the signal day
 * (the back-test entry), excess vs NIFTYBEES and 10-session max adverse excursion. Signals whose 20d
 * window is complete are written once as `mtf_flush_outcome` events (idempotent); the email/JSON shows the
 * per-tier summary (n, median 20d excess, hit rate) so the score weights and A-vs-B can be calibrated.
 * NOTE the benchmark here is NIFTYBEES, while the back-test used the median eligible stock — compare
 * levels loosely, tiers against each other firmly.
 *
 *   node mtfFlushOutcomes.js [--dry-run] [--no-email] [--since YYYY-MM-DD] [--env-file path]
 */

const { nse } = require('@stock/api');
const { sendHtmlEmail } = require('@stock/cloud-utils');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const m = require('./lib/mtfFlush');

const DETECTOR = 'mtf-flush-outcomes';
const BENCH = 'NIFTYBEES';
const addDays = (iso, n) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

async function history(symbol, fromIso, toIso) {
  const byDate = new Map();
  const months = Math.ceil((Date.parse(toIso) - Date.parse(fromIso)) / 86400000 / 91) + 1;
  for (let k = 0; k < months; k++) {
    const end = k === 0 ? toIso : addDays(toIso, -91 * k);
    let rows;
    for (let a = 0; ; a++) {
      try {
        rows = await nse.getHistoricalOhlcv(symbol, { months: 3, endDate: end });
        break;
      } catch (e) {
        if (a >= 2) throw e;
        await new Promise((r) => setTimeout(r, 1500 * (a + 1)));
      }
    }
    for (const r of rows) byDate.set(r.date, r);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const noEmail = process.argv.includes('--no-email');
  const jobName = resolveJobName(DETECTOR);
  const db = require('./lib/db');
  const today = new Date().toISOString().slice(0, 10);
  const since = argValue('--since') || addDays(today, -180);

  const scans = db.find('events', { type: 'mtf_flush_scan', since });
  const done = new Set(
    db
      .find('events', { type: 'mtf_flush_outcome', since })
      .map((e) => `${e.signalDate}|${e.symbol}`)
  );
  // a re-run on the same MTF date writes a second scan event: keep the latest per (date, symbol)
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
    console.log(JSON.stringify({ signals: 0, note: 'no mtf_flush_scan signals yet' }));
    return;
  }
  const first = signals.reduce((a, s) => (s.signalDate < a ? s.signalDate : a), today);
  const bench = await history(BENCH, first, today);
  const cache = new Map();
  const rows = [];
  const errors = [];
  for (const s of signals) {
    try {
      if (!cache.has(s.symbol)) cache.set(s.symbol, await history(s.symbol, first, today));
      const o = m.computeOutcome(s.signalDate, cache.get(s.symbol), bench);
      rows.push({ ...s, outcome: o });
    } catch (e) {
      errors.push(`${s.symbol}: ${e.message}`);
    }
  }
  const complete = rows.filter((r) => r.outcome && r.outcome.complete);
  const fresh = complete.filter((r) => !done.has(`${r.signalDate}|${r.symbol}`));
  let written = null;
  if (!dryRun && fresh.length) {
    written = db.appendEvents(
      fresh.map((r) => ({
        type: 'mtf_flush_outcome',
        creator: DETECTOR,
        date: addDays(r.signalDate, 0),
        signalDate: r.signalDate,
        symbol: r.symbol,
        tier: r.tier,
        score: r.score,
        summary: `MTF flush outcome ${r.symbol} ${r.signalDate} tier ${r.tier}`,
        outcome: r.outcome,
      })),
      { creator: DETECTOR }
    );
  }
  const summary = {
    all: m.summarizeOutcomes(rows.filter((r) => r.outcome)),
    h10: m.summarizeOutcomes(
      rows.filter((r) => r.outcome),
      10
    ),
  };
  const pending = rows.filter((r) => r.outcome && !r.outcome.complete).length;
  const fmt = (x) => (typeof x === 'number' ? `${(x * 100).toFixed(1)}%` : '–');
  const trs = Object.entries(summary.all)
    .map(
      ([t, v]) =>
        `<tr><td>${t}</td><td>${v.n}</td><td>${fmt(v.medianExcess)}</td><td>${fmt(v.hit)}</td></tr>`
    )
    .join('');
  let email = {
    status: 'skipped',
    reason: noEmail ? '--no-email' : dryRun ? '--dry-run' : 'nothing new',
  };
  if (!noEmail && !dryRun && fresh.length) {
    email = await sendHtmlEmail({
      subject: `MTF flush outcomes: ${fresh.length} newly matured (20d)`,
      htmlBody:
        `<div style="font:13px Arial"><h3>MTF flush — realised 20-session outcomes by tier</h3>` +
        `<table cellpadding="5" border="1" style="border-collapse:collapse"><tr><th>Tier</th><th>n</th><th>Median 20d excess vs ${BENCH}</th><th>Hit rate</th></tr>${trs}</table>` +
        `<p>${pending} signals still maturing. Back-test benchmark: median 20d excess ≈ +1.0% / hit 56-58% (vs median stock). ` +
        `Small n — do not re-weight the score until each tier has 30+ matured signals.</p></div>`,
      to: process.env.DEALS_DIGEST_TO || undefined,
      jobName,
    });
  }
  console.log(
    JSON.stringify(
      {
        signals: signals.length,
        matured: complete.length,
        newlyWritten: fresh.length,
        pending,
        summary,
        errors,
        written,
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
      console.error('mtfFlushOutcomes failed:', e);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}

module.exports = { main };
