#!/usr/bin/env node
'use strict';

/**
 * policyEventsDaily — policy-event register + absorption gauge. Script part is zero-LLM; the agent only
 * DISCOVERS events (WebSearch) and maps them to sector baskets, then calls `add`.
 *
 *   node policyEventsDaily.js add --file events.json [--dry-run]
 *       events.json = [{date:'YYYY-MM-DD', title, kind, sectors:[..], basket:['NSE:X',..], sourceUrls:['https://..'], summary?}]
 *       Validation: date, title, >=1 https source URL, 3..25 NSE/BSE basket tickers. Re-adding the same title+type = upsert.
 *   node policyEventsDaily.js run [--dry-run] [--email]
 *       --email: also mails the absorption table + source links (weekly discovery run only; the daily run stays silent).
 *       For every open policy_event (<=120d): basket equal-weight return since the event date minus CNX500,
 *       -> signal-ledger 'P1-policy-absorption' (entityType sector, entityId = event id), detector `policy-event-tracker`.
 *
 * Thresholds (5% / 20% excess, 120-day age-out) are ASSUMPTIONS (lib/policyEvents.js). A price response proves
 * nothing about orders/earnings: 'confirmed' means "go check orders/earnings", not "buy".
 */

const fs = require('fs');
const { stockscans } = require('@stock/api');
const { sendHtmlEmail } = require('@stock/cloud-utils');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const signalLedger = require('./lib/signalLedger');
const { absorption, stateFor, ageDays, THRESH } = require('./lib/policyEvents');

const DETECTOR = 'policy-event-tracker';
const BENCH = 'NSE:CNX500';
const KINDS = [
  'budget',
  'tax',
  'tariff',
  'subsidy',
  'regulation',
  'rate',
  'trade',
  'capex',
  'other',
];

function validate(e) {
  const err = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) err.push('date must be YYYY-MM-DD');
  if (!e.title || e.title.length < 8) err.push('title too short');
  if (!KINDS.includes(e.kind)) err.push(`kind must be one of ${KINDS.join('|')}`);
  if (
    !Array.isArray(e.sourceUrls) ||
    !e.sourceUrls.length ||
    !e.sourceUrls.every((u) => /^https:\/\//.test(u))
  )
    err.push('need >=1 https sourceUrls');
  if (
    !Array.isArray(e.basket) ||
    e.basket.length < 3 ||
    e.basket.length > 25 ||
    !e.basket.every((t) => /^(NSE|BSE):[A-Z0-9&-]+$/.test(t))
  )
    err.push('basket must be 3..25 tickers like NSE:XYZ');
  if (!Array.isArray(e.sectors) || !e.sectors.length) err.push('sectors required');
  return err;
}

async function add(db, dryRun) {
  const events = JSON.parse(fs.readFileSync(argValue('--file'), 'utf8'));
  const rejected = [];
  const ok = [];
  for (const e of events) {
    const err = validate(e);
    if (err.length) rejected.push({ title: e.title, errors: err });
    else
      ok.push({
        type: 'policy_event',
        creator: DETECTOR,
        date: e.date,
        summary: e.title,
        kind: e.kind,
        sectors: e.sectors,
        basket: e.basket,
        sourceUrls: e.sourceUrls,
        note: e.summary || undefined,
      });
  }
  const stats = !dryRun && ok.length ? db.appendEvents(ok) : null;
  console.log(
    JSON.stringify(
      { added: ok.length, rejected, stats, dryRun, filesTouched: dryRun ? [] : db.touchedFiles() },
      null,
      2
    )
  );
}

async function candles(t) {
  const d = await stockscans.ohlcv(t, { tf: '1D' });
  return d.prices;
}


const esc = (x) =>
  String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function buildEmail(today, rows) {
  const tr = rows
    .map((r) => {
      const links = (r.sourceUrls || [])
        .map((u, i) => `<a href="${esc(u)}">src${i + 1}</a>`)
        .join(' ');
      return `<tr><td>${esc(r.date)}</td><td>${esc(r.title)}</td><td>${esc(r.state)}</td><td>${r.basketRetPct}%</td><td>${r.benchRetPct}%</td><td><b>${r.excessPct}%</b></td><td>${r.names}</td><td>${links}</td></tr>`;
    })
    .join('');
  const html = `<p>Policy event absorption vs CNX500 as of ${esc(today)}. Thresholds (5%/20%) are uncalibrated assumptions; <i>confirmed</i> means "check orders/earnings", not "buy". Excess sign is not direction-adjusted (victim baskets read inverted). Research aid, not investment advice.</p><table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;font-size:13px"><tr><th>Event date</th><th>Event</th><th>State</th><th>Basket</th><th>CNX500</th><th>Excess</th><th>Names</th><th>Sources</th></tr>${tr}</table>`;
  return { subject: `Policy events absorption - ${today} (${rows.length} open)`, html };
}

async function run(db, dryRun, sendEmail) {
  const events = db.find('events', { type: 'policy_event' });
  const bench = await candles(BENCH);
  const today = bench[bench.length - 1][0];
  const observations = [];
  const report = [];
  const mailRows = [];
  const cache = new Map();
  for (const ev of events) {
    const age = ageDays(ev.date, today);
    const basket = {};
    for (const t of ev.basket) {
      if (!cache.has(t)) {
        try {
          cache.set(t, await candles(t));
        } catch (e) {
          cache.set(t, null);
        }
      }
      if (cache.get(t)) basket[t] = cache.get(t);
    }
    const a = absorption({ basket, bench, eventDate: ev.date });
    if (!a) continue; // no data: omit rather than flip state
    const state = stateFor(a.excessPct, age);
    observations.push({
      signalId: 'P1-policy-absorption',
      entityType: 'sector',
      entityId: ev.id,
      state,
      minMisses: 1,
      evidence: {
        title: ev.summary,
        kind: ev.kind,
        sectors: ev.sectors,
        eventDate: ev.date,
        ageDays: age,
        ...a,
        sourceUrls: ev.sourceUrls,
        calibrated: false,
      },
    });
    report.push({ id: ev.id, title: ev.summary, age, state, ...a });
    mailRows.push({ date: ev.date, title: ev.title, sourceUrls: ev.sourceUrls, state, ...a });
  }
  const ledger = !dryRun
    ? signalLedger.applyObservations(observations, { detector: DETECTOR, date: today })
    : null;
  let email = { status: 'skipped', reason: sendEmail ? 'dry-run or no rows' : 'no --email' };
  if (sendEmail && !dryRun && mailRows.length) {
    const m = buildEmail(today, mailRows);
    email = await sendHtmlEmail({
      subject: m.subject,
      htmlBody: m.html,
      to: process.env.DEALS_DIGEST_TO || undefined,
    });
  }
  console.log(
    JSON.stringify(
      {
        today,
        email,
        thresholds: THRESH,
        events: events.length,
        report,
        ledger,
        dryRun,
        filesTouched: dryRun ? [] : db.touchedFiles(),
      },
      null,
      2
    )
  );
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dryRun = process.argv.includes('--dry-run');
  const db = require('./lib/db');
  const cmd = process.argv[2];
  if (cmd === 'add') return add(db, dryRun);
  if (cmd === 'run') return run(db, dryRun, process.argv.includes('--email'));
  throw new Error('usage: policyEventsDaily.js add --file f.json | run  [--dry-run]');
}

if (require.main === module) {
  const jobName = resolveJobName(DETECTOR);
  stockscans.setJobName(jobName);
  main()
    .catch((e) => {
      console.error('policyEventsDaily failed:', e.message);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}
module.exports = { validate, buildEmail };
