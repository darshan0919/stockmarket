'use strict';

/**
 * Task: delivery-volume-tracker
 * Purpose: Intraday delivery-vs-traded-volume reality check for Darshan's
 * portfolio watchlist. Runs in two modes from the same script:
 *
 *   snapshot  — fetch each portfolio company's live NSE symbol data
 *               (price, traded qty, delivery qty/%) and persist ONE
 *               events-collection record per company for this run-slot.
 *               Invoked 6x/day (10:10, 11:10, 12:10, 13:10, 14:10, 15:10 IST).
 *
 *   report    — read back today's snapshot records, build the hourly
 *               breakdown table (price move + delivery% per slot per
 *               stock), render an HTML email, and send it. Does NOT
 *               fetch/store its own data point — use snapshot-then-report
 *               for that (see below). Kept standalone for re-sending an
 *               email/backfill without re-fetching NSE.
 *
 *   snapshot-then-report — the actual final/7th run-slot of the day:
 *               runs snapshot for its OWN slot first (so the day has 7 real
 *               data points, not 6), then report over all of today's
 *               records including that one, then emails. Invoked once at
 *               the end of the day (16:10 IST) — this is what the
 *               scheduled task actually calls, not bare "report".
 *
 * Storage: NSE's live intraday symbol-data snapshot is NOT re-fetchable
 * after the fact for a past timestamp (it's a live/mutating endpoint, not
 * an archived file) — non-regenerable → stored as an events-collection
 * record (`type: "delivery-snapshot"`) via `lib/db.js`, per
 * docs/DATA_RULES.md §1.4/§2. No new collection: existing `events-YYYY-MM`
 * store + a new `type`.
 *
 * v1 — initial version (2026-09-17).
 */

const { loadEnv, argValue, hasFlag } = require('./lib/env');

function nowIst(date = new Date()) {
  // IST = UTC+5:30, no DST.
  return new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
}

function istDateString(date = new Date()) {
  const ist = nowIst(date);
  return ist.toISOString().slice(0, 10);
}

function istTimeLabel(date = new Date()) {
  const ist = nowIst(date);
  const h = String(ist.getUTCHours()).padStart(2, '0');
  const m = String(ist.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// ── Fetch: portfolio companies from the Stockscans watchlist ────────────────

async function fetchWatchlistCompanies(watchlistId, client) {
  const table = await client.watchlistTable(watchlistId);
  const rows = table && table.table;
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const header = rows[0];
  const idIdx = header.indexOf('companyId');
  // Watchlist table headers are display labels ("Name", not "name") — match
  // case-insensitively rather than assuming a lowercase key (live-confirmed
  // 2026-09-17: watchlistTable's header row is ['companyId','Name',...]).
  const lowerHeader = header.map((h) => String(h || '').toLowerCase());
  const nameIdx =
    lowerHeader.indexOf('name') >= 0
      ? lowerHeader.indexOf('name')
      : lowerHeader.indexOf('companyname');
  if (idIdx < 0) throw new Error('watchlistTable response missing companyId column');
  return rows.slice(1).map((row) => ({
    companyId: row[idIdx],
    name: nameIdx >= 0 ? row[nameIdx] : row[idIdx],
  }));
}

function toNum(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bareSymbol(companyId) {
  // companyId is typically "NSE:SYMBOL" or "EXCH:SYMBOL-SUFFIX" — NSE's
  // getSymbolData wants the bare trading symbol only.
  const raw = String(companyId || '')
    .split(':')
    .pop();
  return raw.split('-')[0];
}

// ── Snapshot mode ───────────────────────────────────────────────────────

async function runSnapshot({ watchlistId, jobName }) {
  const { StockscansClient } = require('@stock/api');
  const { NseClient } = require('@stock/api');
  const db = require('./lib/db');

  const stockscans = new StockscansClient();
  stockscans.setJobName(jobName);
  const nse = new NseClient();

  const companies = await fetchWatchlistCompanies(watchlistId, stockscans);
  if (companies.length === 0) {
    return {
      ok: false,
      error: 'Watchlist returned 0 companies — aborting snapshot.',
      companies: [],
    };
  }

  const now = new Date();
  const date = istDateString(now);
  const slotTime = istTimeLabel(now);

  const results = [];
  const errors = [];

  for (const { companyId, name } of companies) {
    const symbol = bareSymbol(companyId);
    try {
      const data = await nse.getSymbolData(symbol);
      if (!data) {
        errors.push({ companyId, symbol, error: 'no data returned' });
        continue;
      }
      // Field shape live-confirmed 2026-09-17 against EMUDHRA's real response
      // (see docs/nse-symbol-data-api.md, written alongside this script):
      // lastPrice/change/pChange are NOT under priceInfo (that block only
      // carries 52W high/low, volatility, price band) — they live in
      // tradeInfo.lastPrice and metaData.change/pChange. deliveryquantity
      // is ALSO a direct field on tradeInfo (lowercase key) — prefer it over
      // re-deriving from deliveryToTradedQuantity × totalTradedVolume (which
      // gainersScanner.js's deriveNseDelivery() does only because its older
      // endpoint variant lacked the direct field); fall back to the
      // derivation only if the direct field is ever absent.
      const tradeInfo = data.tradeInfo || {};
      const metaData = data.metaData || {};
      const orderBook = data.orderBook || {};
      const lastPrice = toNum(tradeInfo.lastPrice) ?? toNum(orderBook.lastPrice);
      const change = toNum(metaData.change);
      const pChange = toNum(metaData.pChange);
      const tradedQty = toNum(tradeInfo.totalTradedVolume);
      const deliveryPct = toNum(tradeInfo.deliveryToTradedQuantity);
      const deliveryQty =
        toNum(tradeInfo.deliveryquantity) ??
        (tradedQty != null && deliveryPct != null
          ? Math.round((tradedQty * deliveryPct) / 100)
          : null);

      results.push({
        companyId,
        name,
        symbol,
        date,
        slotTime,
        lastPrice,
        change,
        pChange,
        tradedQty,
        deliveryQty,
        deliveryPct,
      });
    } catch (err) {
      errors.push({ companyId, symbol, error: String(err && err.message ? err.message : err) });
    }
  }

  if (results.length > 0) {
    // IMPORTANT: appendEvents()'s auto-derived id discriminator is
    // `type|companyId|headline-or-summary` — it does NOT include slotTime.
    // Left to derive its own id, every snapshot for the same stock on the
    // same day would collide on the same id and silently OVERWRITE the
    // previous slot's record instead of creating a new one (caught live
    // 2026-09-17: three same-day test runs at different slotTimes collapsed
    // into a single stored record). ensureEnvelope() only auto-derives
    // record.id `if (!record.id)`, so setting it explicitly here — via the
    // same db.makeId() helper, with slotTime folded into the discriminator —
    // makes each slot's record genuinely distinct while staying idempotent
    // (re-running the SAME slot still upserts in place, which is the
    // intended/safe re-run behavior).
    const records = results.map((r) => ({
      id: db.makeId(
        'evt',
        'delivery-volume-tracker',
        r.companyId,
        r.date,
        `delivery-snapshot|${r.slotTime}`
      ),
      type: 'delivery-snapshot',
      creator: 'delivery-volume-tracker',
      companyId: r.companyId,
      date: r.date,
      slotTime: r.slotTime,
      symbol: r.symbol,
      name: r.name,
      lastPrice: r.lastPrice,
      change: r.change,
      pChange: r.pChange,
      tradedQty: r.tradedQty,
      deliveryQty: r.deliveryQty,
      deliveryPct: r.deliveryPct,
    }));
    db.appendEvents(records, { creator: 'delivery-volume-tracker' });
  }

  return {
    ok: errors.length === 0,
    date,
    slotTime,
    companiesFetched: results.length,
    companiesTotal: companies.length,
    errors,
    touchedFiles: db.touchedFiles(),
  };
}

// ── Report mode ───────────────────────────────────────────────────────────

function loadTodaySnapshots(date) {
  const db = require('./lib/db');
  return db.find('events', { date, type: 'delivery-snapshot' });
}

function buildHourlyBreakdown(snapshots) {
  // Group by companyId, sorted slots ascending.
  const byCompany = new Map();
  for (const s of snapshots) {
    if (!byCompany.has(s.companyId)) byCompany.set(s.companyId, []);
    byCompany.get(s.companyId).push(s);
  }
  const breakdown = [];
  for (const [companyId, rows] of byCompany.entries()) {
    rows.sort((a, b) => (a.slotTime < b.slotTime ? -1 : 1));
    const name = rows[0].name || companyId;
    const slots = rows.map((r, i) => {
      const prev = i > 0 ? rows[i - 1] : null;
      const priceDeltaFromPrev =
        prev && typeof r.lastPrice === 'number' && typeof prev.lastPrice === 'number'
          ? +(r.lastPrice - prev.lastPrice).toFixed(2)
          : null;
      const tradedDeltaFromPrev =
        prev && typeof r.tradedQty === 'number' && typeof prev.tradedQty === 'number'
          ? r.tradedQty - prev.tradedQty
          : null;
      const deliveryDeltaFromPrev =
        prev && typeof r.deliveryQty === 'number' && typeof prev.deliveryQty === 'number'
          ? r.deliveryQty - prev.deliveryQty
          : null;
      return {
        slotTime: r.slotTime,
        lastPrice: r.lastPrice,
        pChange: r.pChange,
        priceDeltaFromPrev,
        tradedQty: r.tradedQty,
        tradedDeltaFromPrev,
        deliveryQty: r.deliveryQty,
        deliveryPct: r.deliveryPct,
        deliveryDeltaFromPrev,
      };
    });
    breakdown.push({ companyId, name, slots });
  }
  breakdown.sort((a, b) => a.name.localeCompare(b.name));
  return breakdown;
}

function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function renderHtml(breakdown, { date }) {
  const { stockscansLink } = require('@stock/cloud-utils');

  // Companies can have different slot counts if a fetch failed for one of
  // them at some run — align every row against the FULL union of slot times
  // seen today, not just the first company's slots, so columns never
  // silently misalign across rows.
  const allSlotTimes = [
    ...new Set(breakdown.flatMap((c) => c.slots.map((s) => s.slotTime))),
  ].sort();

  const rowsHtml = breakdown
    .map((c) => {
      const byTime = new Map(c.slots.map((s) => [s.slotTime, s]));
      const slotCells = allSlotTimes
        .map((slotTime) => {
          const s = byTime.get(slotTime);
          if (!s) {
            return `<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#ccc;">no data</td>`;
          }
          const priceMoveStr =
            s.priceDeltaFromPrev == null
              ? '—'
              : `${s.priceDeltaFromPrev >= 0 ? '+' : ''}${s.priceDeltaFromPrev}`;
          const deliverySharePct =
            s.deliveryQty != null && s.tradedQty
              ? ((s.deliveryQty / s.tradedQty) * 100).toFixed(1)
              : null;
          const incDeliveryVsIncTraded =
            s.tradedDeltaFromPrev && s.deliveryDeltaFromPrev != null && s.tradedDeltaFromPrev > 0
              ? ((s.deliveryDeltaFromPrev / s.tradedDeltaFromPrev) * 100).toFixed(1)
              : null;
          return `<td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;white-space:nowrap;">
            <div>₹${esc(s.lastPrice ?? '—')} (${esc(priceMoveStr)})</div>
            <div style="color:#666;">Traded: ${esc(s.tradedQty ?? '—')}</div>
            <div style="color:#666;">Deliv%: ${esc(deliverySharePct ?? s.deliveryPct ?? '—')}</div>
            ${incDeliveryVsIncTraded != null ? `<div style="color:#999;">Δdeliv/Δtraded: ${esc(incDeliveryVsIncTraded)}%</div>` : ''}
          </td>`;
        })
        .join('');
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:600;white-space:nowrap;">
          ${stockscansLink(c.name, c.companyId.split(':').pop(), c.companyId.split(':')[0] || 'NSE')}
        </td>
        ${slotCells}
      </tr>`;
    })
    .join('');

  const slotHeaders = allSlotTimes
    .map((t) => `<th style="padding:6px 8px;font-size:12px;text-align:left;">${esc(t)}</th>`)
    .join('');

  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;">
    <h2 style="margin:0 0 4px;">Delivery vs Traded Volume — ${esc(date)}</h2>
    <p style="color:#555;font-size:13px;margin:0 0 16px;">
      Hourly breakdown of price move, traded quantity, and delivery quantity/% per portfolio stock.
      Use "Δdeliv/Δtraded" to see whether each hour's incremental volume was delivery-backed or
      likely intraday/algo churn.
    </p>
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr>
        <th style="padding:6px 8px;font-size:12px;text-align:left;">Stock</th>
        ${slotHeaders}
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </body></html>`;
}

async function runReport({ date, to, jobName, noEmail }) {
  const db = require('./lib/db');
  const { sendHtmlEmail } = require('@stock/cloud-utils');

  const snapshots = loadTodaySnapshots(date);
  if (snapshots.length === 0) {
    return { ok: false, error: `No snapshot records found for ${date} — nothing to report.` };
  }
  const breakdown = buildHourlyBreakdown(snapshots);
  const html = renderHtml(breakdown, { date });

  let email = { status: 'skipped', reason: 'noEmail flag set' };
  if (!noEmail) {
    email = await sendHtmlEmail({
      subject: `Delivery vs Traded Volume — ${date}`,
      htmlBody: html,
      to,
      jobName,
    });
  }

  return {
    ok: true,
    date,
    companiesReported: breakdown.length,
    snapshotRecordsUsed: snapshots.length,
    email,
    touchedFiles: db.touchedFiles(),
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────

async function main() {
  loadEnv(argValue('--env-file'));
  const mode = argValue('--mode') || 'snapshot';
  const watchlistId = argValue('--watchlist-id') || '838b3f7ec88e17ba127ba8a3';
  const jobName = argValue('--job') || 'delivery-volume-tracker';
  const date = argValue('--date') || istDateString();
  const to = argValue('--to') || 'djplearner@gmail.com';
  const noEmail = hasFlag('--no-email');

  let result;
  if (mode === 'snapshot') {
    result = await runSnapshot({ watchlistId, jobName });
  } else if (mode === 'report') {
    result = await runReport({ date, to, jobName, noEmail });
  } else if (mode === 'snapshot-then-report') {
    // The final run-slot of the day: this run's OWN slot is a real data
    // point too, so fetch/store it first (same as every earlier slot) before
    // reading back the day's records and emailing — otherwise the report
    // would silently omit its own slot's data and always lag one slot behind
    // the time the email is actually sent.
    const snapshot = await runSnapshot({ watchlistId, jobName });
    const report = await runReport({ date, to, jobName, noEmail });
    result = {
      ok: snapshot.ok !== false && report.ok !== false,
      snapshot,
      report,
      touchedFiles: [
        ...new Set([...(snapshot.touchedFiles || []), ...(report.touchedFiles || [])]),
      ],
    };
  } else {
    throw new Error(
      `Unknown --mode "${mode}" — expected "snapshot", "report", or "snapshot-then-report".`
    );
  }

  console.log(JSON.stringify(result, null, 2));
  if (result && result.ok === false) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: String(err && err.stack ? err.stack : err) }));
    process.exitCode = 1;
  });
}

module.exports = { runSnapshot, runReport, buildHourlyBreakdown, bareSymbol };
