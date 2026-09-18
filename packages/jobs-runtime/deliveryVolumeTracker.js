'use strict';

/**
 * Task: delivery-volume-tracker
 * Purpose: Intraday delivery-vs-traded-volume reality check for Darshan's
 * portfolio watchlist. Runs via the companion script in:
 *
 *   snapshot  — fetch each portfolio company's live NSE symbol data
 *               (price, traded qty, delivery qty/%) and persist ONE
 *               events-collection record per company for this run-slot.
 *
 *   report    — read back today's snapshot records, build the hourly
 *               breakdown table (price move + delivery% per slot per
 *               stock), render an HTML email, and send it. Standalone for
 *               re-sending an email/backfill without re-fetching NSE.
 *
 *   snapshot-then-report — standard mode for every scheduled run: runs
 *               snapshot for its OWN slot first, then builds the cumulative
 *               day breakdown across all slots recorded so far, and emails
 *               the updated report. Invoked 8x/day across the session:
 *               10:25, 11:25, 12:25, 13:25, 14:25, 15:25, 16:25 (close),
 *               and 17:25 (final NCL settlement).
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
      const closePrice = toNum(metaData.closePrice);
      const previousClose = toNum(metaData.previousClose);
      const secwisedelposdate = tradeInfo.secwisedelposdate || null;
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
        closePrice,
        previousClose,
        secwisedelposdate,
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
      closePrice: r.closePrice,
      previousClose: r.previousClose,
      secwisedelposdate: r.secwisedelposdate,
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
    let prevTradedDelta = null;
    let prevDelivDelta = null;

    const slots = rows.map((r, i) => {
      const prev = i > 0 ? rows[i - 1] : null;

      // Hourly price delta (₹)
      const priceDeltaFromPrev =
        prev && typeof r.lastPrice === 'number' && typeof prev.lastPrice === 'number'
          ? +(r.lastPrice - prev.lastPrice).toFixed(2)
          : null;

      // Hourly price % change: for i > 0, % move from previous slot; for slot 0, opening pChange vs previous close
      const pricePctChange =
        prev && prev.lastPrice && typeof r.lastPrice === 'number'
          ? +(((r.lastPrice - prev.lastPrice) / prev.lastPrice) * 100).toFixed(2)
          : r.pChange != null
            ? +r.pChange.toFixed(2)
            : null;

      // Hourly incremental traded volume
      const tradedDeltaFromPrev =
        prev && typeof r.tradedQty === 'number' && typeof prev.tradedQty === 'number'
          ? r.tradedQty - prev.tradedQty
          : r.tradedQty;

      // Hourly incremental delivery volume
      const deliveryDeltaFromPrev =
        prev && typeof r.deliveryQty === 'number' && typeof prev.deliveryQty === 'number'
          ? r.deliveryQty - prev.deliveryQty
          : r.deliveryQty;

      // Hourly incremental delivery % (Δdeliv / Δtraded, capped at [0, 100]%)
      const incDeliveryVsIncTraded =
        tradedDeltaFromPrev && tradedDeltaFromPrev > 0 && deliveryDeltaFromPrev != null
          ? Math.min(
              100,
              Math.max(0, +((deliveryDeltaFromPrev / tradedDeltaFromPrev) * 100).toFixed(1))
            )
          : r.deliveryPct != null
            ? Math.min(100, Math.max(0, +r.deliveryPct.toFixed(1)))
            : null;

      // Signal Classification:
      // For Slot 0 (market opening 9:15 - 10:00):
      // - Green: price UP and positive volume & delivery on open
      // - Red: price DOWN and positive volume & delivery on open
      // - Yellow: flat / low activity
      let signal = 'YELLOW';
      if (i === 0) {
        if (
          tradedDeltaFromPrev != null &&
          tradedDeltaFromPrev > 0 &&
          deliveryDeltaFromPrev != null &&
          deliveryDeltaFromPrev > 0
        ) {
          if (pricePctChange != null && pricePctChange > 0) {
            signal = 'GREEN';
          } else if (pricePctChange != null && pricePctChange < 0) {
            signal = 'RED';
          }
        }
      } else if (
        prevTradedDelta !== null &&
        prevDelivDelta !== null &&
        tradedDeltaFromPrev != null &&
        deliveryDeltaFromPrev != null
      ) {
        const volJumpIncreasing = tradedDeltaFromPrev > prevTradedDelta;
        const delivJumpIncreasing =
          deliveryDeltaFromPrev > prevDelivDelta && deliveryDeltaFromPrev > 0;
        // Institutional activity: either dual volume+delivery acceleration, OR a massive delivery surge
        if (delivJumpIncreasing && (volJumpIncreasing || deliveryDeltaFromPrev > 0)) {
          if (pricePctChange != null && pricePctChange > 0) {
            signal = 'GREEN';
          } else if (pricePctChange != null && pricePctChange < 0) {
            signal = 'RED';
          }
        }
      }

      prevTradedDelta = tradedDeltaFromPrev;
      prevDelivDelta = deliveryDeltaFromPrev;

      return {
        slotTime: r.slotTime,
        secwisedelposdate: r.secwisedelposdate,
        lastPrice: r.lastPrice,
        closePrice: r.closePrice,
        previousClose: r.previousClose,
        pChange: r.pChange,
        priceDeltaFromPrev,
        pricePctChange,
        tradedQty: r.tradedQty,
        tradedDeltaFromPrev,
        deliveryQty: r.deliveryQty,
        deliveryPct: r.deliveryPct,
        deliveryDeltaFromPrev,
        incDeliveryVsIncTraded,
        signal,
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

/**
 * Format quantity in clean compact Indian notation.
 * @param {number|null} n
 * @returns {string}
 */
function formatQty(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}${(abs / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `${sign}${(abs / 100000).toFixed(2)} L`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)} k`;
  return `${sign}${abs}`;
}

/**
 * Format hourly column header from slotTime or secwisedelposdate.
 * @param {string} slotTime
 * @param {string|null} [secwisedelposdate]
 * @returns {string}
 */
function formatSlotHeader(slotTime, secwisedelposdate) {
  if (secwisedelposdate) {
    const m = String(secwisedelposdate).match(/(\d{1,2}):(\d{2}):(\d{2})/);
    if (m) {
      const h = parseInt(m[1], 10);
      const min = m[2];
      const sec = m[3];
      // Final end-of-day settlement is timestamped "00:00:00"
      if (h === 0 && min === '00' && sec === '00') {
        return '05:00 PM (Settled)';
      }
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      return `${String(h12).padStart(2, '0')}:${min} ${ampm}`;
    }
  }
  if (!slotTime) return '—';
  const [hStr] = slotTime.split(':');
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return slotTime;
  if (h === 16) {
    return '03:30 PM (Close)';
  }
  if (h >= 17) {
    return '05:00 PM (Settled)';
  }
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:00 ${ampm}`;
}

function renderHtml(breakdown, { date }) {
  const { stockscansLink } = require('@stock/cloud-utils');

  // Align rows across the union of all slot times
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
            return `<td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#94a3b8;text-align:center;background:#fafafa;">no data</td>`;
          }

          // Format delta % gain
          const pPct = s.pricePctChange;
          const pPctStr = pPct == null ? '—' : `${pPct >= 0 ? '+' : ''}${pPct.toFixed(2)}%`;
          const isUp = pPct != null && pPct > 0;
          const isDown = pPct != null && pPct < 0;
          const priceColor = isUp ? '#15803d' : isDown ? '#b91c1c' : '#64748b';

          // Format delta total volume
          const volStr =
            s.tradedDeltaFromPrev != null ? `+${formatQty(s.tradedDeltaFromPrev)}` : '—';

          // Format delta delivery %
          const delivPctVal = s.incDeliveryVsIncTraded;
          const delivStr = delivPctVal != null ? `${delivPctVal.toFixed(1)}%` : '—';

          // Signal background color coding (no text tags per user feedback)
          let cellBg = '#ffffff';
          let borderBottom = '1px solid #e2e8f0';

          if (s.signal === 'GREEN') {
            cellBg = '#f0fdf4';
            borderBottom = '1px solid #bbf7d0';
          } else if (s.signal === 'RED') {
            cellBg = '#fef2f2';
            borderBottom = '1px solid #fecaca';
          } else {
            cellBg = '#ffffff';
            borderBottom = '1px solid #e2e8f0';
          }

          return `<td style="padding:10px 8px;border-bottom:${borderBottom};font-size:12px;white-space:nowrap;background:${cellBg};text-align:center;vertical-align:middle;">
            <div style="font-weight:700;font-size:13px;color:${priceColor};margin-bottom:3px;">${esc(pPctStr)}</div>
            <div style="font-size:11px;color:#475467;margin-bottom:2px;">Vol: <b>${esc(volStr)}</b></div>
            <div style="font-size:11px;color:#334155;">Deliv: <b>${esc(delivStr)}</b></div>
          </td>`;
        })
        .join('');

      // Day cumulative summary column
      const lastSlot = c.slots[c.slots.length - 1] || {};
      const dayLastPrice =
        lastSlot.lastPrice != null ? `₹${lastSlot.lastPrice.toLocaleString('en-IN')}` : '—';
      const dayClosePrice =
        lastSlot.closePrice != null && lastSlot.closePrice > 0
          ? `₹${lastSlot.closePrice.toLocaleString('en-IN')}`
          : dayLastPrice;

      // 1. lastPrice (%)
      let lastPctStr = '—';
      let lastPctBg = '#f1f5f9';
      let lastPctFg = '#64748b';
      if (
        lastSlot.lastPrice != null &&
        lastSlot.previousClose != null &&
        lastSlot.previousClose > 0
      ) {
        const lpPct = +(
          ((lastSlot.lastPrice - lastSlot.previousClose) / lastSlot.previousClose) *
          100
        ).toFixed(2);
        lastPctStr = `${lpPct >= 0 ? '+' : ''}${lpPct.toFixed(2)}%`;
        lastPctBg = lpPct >= 0 ? '#dcfce7' : '#fee2e2';
        lastPctFg = lpPct >= 0 ? '#166534' : '#991b1b';
      } else if (lastSlot.pChange != null) {
        const lpPct = +lastSlot.pChange.toFixed(2);
        lastPctStr = `${lpPct >= 0 ? '+' : ''}${lpPct.toFixed(2)}%`;
        lastPctBg = lpPct >= 0 ? '#dcfce7' : '#fee2e2';
        lastPctFg = lpPct >= 0 ? '#166534' : '#991b1b';
      }

      // 2. closePrice (%)
      let closePctStr = '—';
      let closePctBg = '#f1f5f9';
      let closePctFg = '#64748b';
      if (
        lastSlot.closePrice != null &&
        lastSlot.previousClose != null &&
        lastSlot.previousClose > 0
      ) {
        const cpPct = +(
          ((lastSlot.closePrice - lastSlot.previousClose) / lastSlot.previousClose) *
          100
        ).toFixed(2);
        closePctStr = `${cpPct >= 0 ? '+' : ''}${cpPct.toFixed(2)}%`;
        closePctBg = cpPct >= 0 ? '#dcfce7' : '#fee2e2';
        closePctFg = cpPct >= 0 ? '#166534' : '#991b1b';
      } else {
        closePctStr = lastPctStr;
        closePctBg = lastPctBg;
        closePctFg = lastPctFg;
      }

      const totTraded = lastSlot.tradedQty;
      const totDeliv = lastSlot.deliveryQty;
      const totDelivPct =
        totTraded && totDeliv != null
          ? ((totDeliv / totTraded) * 100).toFixed(1)
          : lastSlot.deliveryPct != null
            ? lastSlot.deliveryPct.toFixed(1)
            : '—';

      const summaryCell = `<td style="padding:8px 12px;border-bottom:1px solid #cbd5e1;border-left:2px solid #cbd5e1;font-size:12px;white-space:nowrap;background:#f8fafc;vertical-align:middle;text-align:right;">
        <div style="font-size:12px;margin-bottom:3px;color:#0f172a;">
          <b>Last:</b> ${esc(dayLastPrice)}
          <span style="display:inline-block;padding:1px 5px;font-size:11px;font-weight:700;border-radius:3px;background:${lastPctBg};color:${lastPctFg};margin-left:4px;">
            ${esc(lastPctStr)}
          </span>
        </div>
        <div style="font-size:12px;margin-bottom:5px;color:#475467;">
          <b>Close:</b> ${esc(dayClosePrice)}
          <span style="display:inline-block;padding:1px 5px;font-size:11px;font-weight:700;border-radius:3px;background:${closePctBg};color:${closePctFg};margin-left:4px;">
            ${esc(closePctStr)}
          </span>
        </div>
        <div style="font-size:11px;color:#334155;">Vol: <b>${esc(formatQty(totTraded))}</b></div>
        <div style="font-size:11px;color:#334155;">Deliv: <b>${esc(totDelivPct)}%</b> <span style="color:#64748b;">(${esc(formatQty(totDeliv))})</span></div>
      </td>`;

      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;white-space:nowrap;vertical-align:middle;background:#ffffff;">
          ${stockscansLink(c.companyId, c.companyId.split(':').pop(), c.companyId.split(':')[0] || 'NSE')}
        </td>
        ${slotCells}
        ${summaryCell}
      </tr>`;
    })
    .join('');

  const slotHeaders = allSlotTimes
    .map((t) => {
      const sampleSlot = breakdown.flatMap((c) => c.slots).find((s) => s.slotTime === t);
      const label = formatSlotHeader(t, sampleSlot && sampleSlot.secwisedelposdate);
      return `<th style="padding:10px 8px;font-size:11px;font-weight:700;text-transform:uppercase;color:#475467;text-align:center;background:#f8fafc;border-bottom:2px solid #cbd5e1;white-space:nowrap;">${esc(label)}</th>`;
    })
    .join('');

  return `<!doctype html><html><body style="margin:0;padding:20px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e293b;">
    <div style="max-width:1100px;margin:0 auto;background:#ffffff;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
      <div style="padding:18px 20px 14px;border-bottom:1px solid #e2e8f0;">
        <div style="display:inline-block;padding:2px 8px;font-size:10px;font-weight:700;letter-spacing:0.5px;color:#4338ca;background:#e0e7ff;border-radius:12px;margin-bottom:6px;">
          PORTFOLIO INTRADAY TRACKER
        </div>
        <h2 style="margin:0 0 4px;font-size:20px;font-weight:800;color:#0f172a;">Delivery vs Traded Volume — ${esc(date)}</h2>
        <p style="color:#64748b;font-size:13px;margin:0;line-height:1.4;">
          Hourly delta breakdown of price % move, traded volume increment, and delivery % per portfolio stock.
        </p>
      </div>
      <div style="overflow-x:auto;">
        <table style="border-collapse:collapse;width:100%;text-align:left;">
          <thead><tr>
            <th style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#475467;text-align:left;background:#f8fafc;border-bottom:2px solid #cbd5e1;">Stock</th>
            ${slotHeaders}
            <th style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:#475467;text-align:right;background:#f8fafc;border-bottom:2px solid #cbd5e1;border-left:2px solid #cbd5e1;white-space:nowrap;">Day Summary</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <div style="padding:14px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;color:#475467;line-height:1.6;">
        <div style="font-weight:700;margin-bottom:4px;color:#0f172a;">Hourly Cell Color Coding:</div>
        <div style="margin-bottom:2px;"><span style="display:inline-block;width:12px;height:12px;background:#f0fdf4;border:1px solid #86efac;border-radius:2px;vertical-align:middle;margin-right:6px;"></span><b>Green Cell (Institutional Accumulation)</b>: Price UP &amp; Delivery Vol Jump Accelerating (ΔDeliv<sub>t</sub> &gt; ΔDeliv<sub>t-1</sub>) with volume expansion or delivery dominance (or positive price &amp; volume/delivery on open).</div>
        <div style="margin-bottom:2px;"><span style="display:inline-block;width:12px;height:12px;background:#fef2f2;border:1px solid #fca5a5;border-radius:2px;vertical-align:middle;margin-right:6px;"></span><b>Red Cell (Delivery-Backed Distribution)</b>: Price DOWN &amp; Delivery Vol Jump Accelerating (ΔDeliv<sub>t</sub> &gt; ΔDeliv<sub>t-1</sub>) with volume expansion or delivery dominance (or negative price &amp; delivery-backed selling on open).</div>
        <div><span style="display:inline-block;width:12px;height:12px;background:#ffffff;border:1px solid #cbd5e1;border-radius:2px;vertical-align:middle;margin-right:6px;"></span><b>White Cell (Watch / Churn / Drift)</b>: All other combinations (intraday churn without delivery, decelerating delivery, or flat price).</div>
      </div>
    </div>
  </body></html>`;
}

/**
 * Resolve official closing prices from NSE if not already stored on the last snapshot.
 * @param {Array<Object>} breakdown
 */
async function resolveClosingPrices(breakdown) {
  const { NseClient } = require('@stock/api');
  let nse = null;
  for (const c of breakdown) {
    const lastSlot = c.slots[c.slots.length - 1];
    if (
      lastSlot &&
      (lastSlot.closePrice == null || lastSlot.closePrice === 0 || lastSlot.previousClose == null)
    ) {
      if (!nse) nse = new NseClient();
      try {
        const symbol = bareSymbol(c.companyId);
        const data = await nse.getSymbolData(symbol);
        const meta = data?.metaData || data?.metadata || {};
        const cp = toNum(meta.closePrice);
        const prev = toNum(meta.previousClose);
        if (cp != null) {
          lastSlot.closePrice = cp;
        }
        if (prev != null) {
          lastSlot.previousClose = prev;
        }
      } catch {
        // best-effort fallback
      }
    }
  }
}

async function runReport({ date, to, jobName, noEmail }) {
  const db = require('./lib/db');
  const { sendHtmlEmail } = require('@stock/cloud-utils');

  const snapshots = loadTodaySnapshots(date);
  if (snapshots.length === 0) {
    return { ok: false, error: `No snapshot records found for ${date} — nothing to report.` };
  }
  const breakdown = buildHourlyBreakdown(snapshots);
  await resolveClosingPrices(breakdown);
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

module.exports = {
  runSnapshot,
  runReport,
  buildHourlyBreakdown,
  bareSymbol,
  renderHtml,
  formatQty,
  formatSlotHeader,
};
