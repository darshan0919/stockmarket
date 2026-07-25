#!/usr/bin/env node
'use strict';

/**
 * corpActionsDigest.js — Daily Corporate Actions digest (task: daily-ca-digest).
 *
 * Fetches upcoming Corporate Actions from NSE/BSE and Board Meetings from NSE.
 * Categorizes them into Dividends, Board Meetings, and Others (Splits/Bonus).
 * Generates and emails an HTML digest.
 *
 * Usage:
 *   node corpActionsDigest.js [--no-email] [--env-file <path>]
 */

const fs = require('fs');
const path = require('path');
const { nse, bse, nseSession } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const { sendHtmlEmail, stockscansUrl } = require('@stock/cloud-utils');

// We will fetch Screener data to get market caps (for sorting/display).
async function getScreenerData(symbol) {
  try {
    const searchRes = await fetch(
      `https://www.screener.in/api/company/search/?q=${encodeURIComponent(symbol)}`
    );
    if (!searchRes.ok) return null;
    const json = await searchRes.json();
    const match =
      json.find((j) => j.url.includes(`/${symbol}/`) || j.url.includes(symbol)) || json[0];
    if (!match) return null;

    const htmlRes = await fetch(`https://www.screener.in${match.url}`);
    if (!htmlRes.ok) return null;
    const html = await htmlRes.text();
    const mcapMatch = html.match(/Market Cap[^>]*>.*?<span class="number">([^<]+)<\/span>/is);
    const mcapCr = mcapMatch ? parseFloat(mcapMatch[1].replace(/,/g, '')) : null;

    const priceMatch = html.match(/Current Price[^>]*>.*?<span class="number">([^<]+)<\/span>/is);
    const latestPrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;

    return {
      companyName: match.name,
      marketCap: mcapCr ? mcapCr * 1e7 : null,
      latestPrice,
    };
  } catch (e) {
    return null;
  }
}

// ── date helpers ──────────────────────────────────────────────────────────────

function istNow() {
  return new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000);
}

function fmt(d, sep) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return [dd, mm, d.getFullYear()].join(sep);
}

function parseNseDate(s) {
  if (!s || s === '-') return null;
  const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})/.exec(String(s).trim());
  if (!m) return null;
  const mon = MONTHS.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
  return mon < 0 ? null : new Date(Number(m[3]), mon, Number(m[1]));
}

function parseBseDate(s) {
  if (!s || s === '-') return null;
  const parts = s.split('/');
  if (parts.length === 3) {
    return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  }
  return null;
}

function crores(v) {
  if (v === null || v === undefined) return '—';
  return `₹${(v / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} cr`;
}

// ── fetchers ──────────────────────────────────────────────────────────────────

async function fetchBoardMeetings() {
  const out = { rows: [], errors: [] };
  try {
    const data = await nse.getBoardMeetings();
    for (const r of data) {
      if (!r.bm_symbol) continue;
      out.rows.push({
        exchange: 'NSE',
        symbol: r.bm_symbol,
        date: r.bm_date,
        purpose: r.bm_purpose,
        description: r.bm_desc,
        timestamp: r.bm_timestamp,
      });
    }
  } catch (e) {
    out.errors.push(`NSE Board Meetings: ${e.message}`);
  }
  return out;
}

async function fetchCorporateActions() {
  const out = { rows: [], errors: [] };

  // NSE Corporate Actions
  try {
    const data = await nse.getCorporateActions();
    for (const r of data) {
      if (!r.symbol) continue;
      out.rows.push({
        exchange: 'NSE',
        symbol: r.symbol,
        company: r.comp,
        exDate: r.exDate,
        recordDate: r.recDate,
        purpose: r.subject,
      });
    }
  } catch (e) {
    out.errors.push(`NSE Corporate Actions: ${e.message}`);
  }

  // BSE Corporate Actions
  try {
    // For BSE, we'll fetch for the next 7 days to mimic "upcoming"
    const now = istNow();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const fDate = fmt(now, '/');
    const tDate = fmt(nextWeek, '/');
    const data = await bse.getCorporateActions(fDate, tDate);
    for (const r of data) {
      if (!r.Security) continue;
      out.rows.push({
        exchange: 'BSE',
        symbol: r.Security, // BSE security ID
        company: r.Security,
        exDate: r.ExDate, // DD/MM/YYYY
        recordDate: null, // Usually BCPeriod is available, keeping simple
        purpose: r.Purpose,
      });
    }
  } catch (e) {
    out.errors.push(`BSE Corporate Actions: ${e.message}`);
  }

  return out;
}

// ── processing ────────────────────────────────────────────────────────────────

function categorizeActions(actions) {
  const dividends = [];
  const others = [];

  for (const r of actions) {
    const p = String(r.purpose || '').toLowerCase();
    if (p.includes('dividend')) {
      const amtMatch = String(r.purpose || '').match(/(?:rs|re|₹|rupees)\.?\s*-?\s*([\d.]+)/i);
      r.dividendAmount = amtMatch ? parseFloat(amtMatch[1]) : null;
      dividends.push(r);
    } else {
      others.push(r);
    }
  }

  return { dividends, others };
}

// Deduplicate cross-listed events
function deduplicateEvents(events, dateField) {
  const unique = [];
  const seen = new Set();

  for (const ev of events) {
    // Basic deduplication: similar symbol prefix + similar purpose
    const sym = String(ev.symbol).substring(0, 5).toLowerCase();
    const purp = String(ev.purpose).substring(0, 15).toLowerCase();
    const d = ev[dateField] || '';
    const key = `${sym}_${d}_${purp}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(ev);
    }
  }
  return unique;
}

async function enrichWithMarketCap(events) {
  // Fetch market cap for each event
  await Promise.all(
    events.map(async (ev) => {
      let nseData = null;
      try {
        if (ev.exchange === 'NSE') {
          nseData = await nse.getSymbolData(ev.symbol);
        }
      } catch {}

      ev.companyName = nseData?.metaData?.companyName || ev.company || ev.symbol;
      ev.marketCap = nseData?.tradeInfo?.totalMarketCap || null;
      ev.latestPrice = nseData?.priceInfo?.lastPrice || nseData?.priceInfo?.close || null;

      if (!ev.marketCap || !ev.latestPrice || ev.companyName === ev.symbol) {
        const scr = await getScreenerData(ev.symbol);
        if (scr) {
          if (!ev.marketCap && scr.marketCap) ev.marketCap = scr.marketCap;
          if (!ev.latestPrice && scr.latestPrice) ev.latestPrice = scr.latestPrice;
          if (ev.companyName === ev.symbol && scr.companyName) ev.companyName = scr.companyName;
        }
      }

      if (ev.dividendAmount && ev.latestPrice) {
        ev.dividendYield = (ev.dividendAmount / ev.latestPrice) * 100;
      } else {
        ev.dividendYield = null;
      }
    })
  );

  // Sort by Market Cap descending
  events.sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
  return events;
}

// ── rendering ─────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
}

function tableHtml(title, headers, rowsHtml, note) {
  return `
  <h3 style="margin:24px 0 6px;font-family:Arial,sans-serif;color:#1a237e">${title}</h3>
  ${note ? `<p style="margin:0 0 8px;font:12px Arial;color:#666">${note}</p>` : ''}
  ${
    rowsHtml.length
      ? `<table cellpadding="6" cellspacing="0" border="0" style="border-collapse:collapse;font:13px Arial;width:100%;white-space:nowrap">
       <tr style="background:#e8eaf6;text-align:left">${headers.map((h) => `<th style="border-bottom:2px solid #9fa8da">${h}</th>`).join('')}</tr>
       ${rowsHtml.join('\n')}</table>`
      : '<p style="font:13px Arial;color:#999">No records.</p>'
  }`;
}

function td(v, right, wrap) {
  return `<td style="border-bottom:1px solid #eee${right ? ';text-align:right' : ''}${wrap ? ';white-space:normal' : ''}">${v}</td>`;
}

function renderEmail(dateLabel, digest) {
  const divRowHtml = (events, dateField) =>
    events.map((r, i) => {
      const symCol = `<a href="${stockscansUrl(r.symbol, r.exchange || 'NSE')}" style="text-decoration:none;color:#1a237e"><b>${esc(r.companyName || r.symbol)}</b></a> <span style="color:#888">${esc(r.exchange)}</span>`;
      const y = r.dividendYield !== null ? r.dividendYield.toFixed(2) + '%' : '—';
      const d = esc(r[dateField] || '—');
      const divVal = r.dividendAmount !== null ? `₹${r.dividendAmount}` : '—';
      return `<tr>${td(i + 1)}${td(symCol)}${td(y, 1)}${td(d)}${td('<b>' + divVal + '</b>', 1)}</tr>`;
    });

  const rowHtml = (events, dateField) =>
    events.map((r, i) => {
      const symCol = `<a href="${stockscansUrl(r.symbol, r.exchange || 'NSE')}" style="text-decoration:none;color:#1a237e"><b>${esc(r.companyName || r.symbol)}</b></a> <span style="color:#888">${esc(r.exchange)}</span>`;
      const mcapCol = `<b>${crores(r.marketCap)}</b>`;
      const d = esc(r[dateField] || '—');
      const p = esc(r.purpose || '—');
      return `<tr>${td(i + 1)}${td(symCol)}${td(mcapCol, 1)}${td(d)}${td(p, false, true)}</tr>`;
    });

  const errs = [...digest.boardMeetings.errors, ...digest.corporateActions.errors];

  return `
<div style="max-width:860px">
  ${tableHtml(`1️⃣ Dividends (${digest.dividends.length})`, ['#', 'Company', 'Yield', 'Ex-Date', 'Dividend'], divRowHtml(digest.dividends, 'exDate'))}
  ${tableHtml(`2️⃣ Other Corporate Actions (${digest.others.length})`, ['#', 'Company', 'Market Cap', 'Ex-Date', 'Purpose'], rowHtml(digest.others, 'exDate'), 'Splits, Bonus issues, Rights, etc.')}
  ${tableHtml(`3️⃣ Board Meetings (${digest.boardMeetingsEnriched.length})`, ['#', 'Company', 'Market Cap', 'Meeting Date', 'Purpose'], rowHtml(digest.boardMeetingsEnriched, 'date'))}
  
  ${errs.length ? `<p style="font:12px Arial;color:#b71c1c"><b>Fetch warnings:</b> ${errs.map(esc).join(' · ')}</p>` : ''}
  <p style="font:11px Arial;color:#999;margin:24px 0 0;border-top:1px solid #eee;padding-top:8px">Sources: <a href="https://www.nseindia.com/companies-listing/corporate-filings-actions" style="color:#999;text-decoration:none">NSE Corporate Actions</a> &nbsp;·&nbsp; <a href="https://www.nseindia.com/companies-listing/corporate-filings-board-meetings" style="color:#999;text-decoration:none">NSE Board Meetings</a> &nbsp;·&nbsp; <a href="https://www.bseindia.com/markets/equity/EQReports/CorporateActionCal.aspx" style="color:#999;text-decoration:none">BSE Corporate Actions</a>.</p>
</div>`;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv(argValue('--env-file'));
  const noEmail = process.argv.includes('--no-email');

  const target = istNow();
  const dateLabel = fmt(target, '-');

  // Warmup session
  await nseSession.warmup();

  const [bmData, caData] = await Promise.all([fetchBoardMeetings(), fetchCorporateActions()]);

  const uniqueBMs = deduplicateEvents(bmData.rows, 'date');
  const uniqueCAs = deduplicateEvents(caData.rows, 'exDate');

  const { dividends, others } = categorizeActions(uniqueCAs);

  const digest = {
    date: dateLabel,
    boardMeetings: bmData,
    corporateActions: caData,
    dividends: await enrichWithMarketCap(dividends),
    others: await enrichWithMarketCap(others),
    boardMeetingsEnriched: await enrichWithMarketCap(uniqueBMs),
  };

  // Sort dividends by yield descending, fallback to market cap
  digest.dividends.sort((a, b) => {
    if (a.dividendYield !== null || b.dividendYield !== null) {
      return (b.dividendYield || 0) - (a.dividendYield || 0);
    }
    return (b.marketCap || 0) - (a.marketCap || 0);
  });

  // Persist run snapshot (Data Ecosystem v2: regenerable → data/runs/)
  const outDir = path.join(require('./lib/db').dataRoot(), 'runs');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `ca_digest_${dateLabel}.json`);
  fs.writeFileSync(outFile, JSON.stringify(digest, null, 2));

  // Email
  let email = { status: 'skipped', reason: '--no-email' };
  if (!noEmail) {
    email = await sendHtmlEmail({
      subject: `📅 Corporate Actions Digest ${dateLabel} — Dividends, Splits & Board Meetings`,
      htmlBody: renderEmail(dateLabel, digest),
      to: process.env.DEALS_DIGEST_TO || undefined, // Re-use the same env var or add CA_DIGEST_TO
    });
  }

  console.log(
    JSON.stringify(
      {
        date: dateLabel,
        counts: {
          boardMeetings: digest.boardMeetingsEnriched.length,
          dividends: digest.dividends.length,
          others: digest.others.length,
        },
        errors: [...bmData.errors, ...caData.errors],
        email,
        snapshot: outFile,
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error('corpActionsDigest failed:', e);
    process.exit(1);
  });
}

module.exports = { main };
