#!/usr/bin/env node
'use strict';

/**
 * dealsDigest.js — Daily NSE/BSE deals digest (task: daily-deals-digest).
 *
 * Fetches the four "Latest Trades" categories that screener.in/filings shows,
 * from the exchanges directly, sorts each by deal VALUE (₹) descending, keeps
 * the top 10, and emails an HTML digest.
 *
 *   1. Bulk deals   — NSE /api/snapshot-capital-market-largedeal (+ BSE BulkDealData_ng DealType=1)
 *   2. Block deals  — same NSE snapshot (+ BSE DealType=2)
 *   3. SAST Reg 29  — NSE /api/corporate-sast-reg29 (₹ value ≈ shares × last close)
 *   4. Insider PIT  — NSE /api/corporates-pit-gg → parse each filing's XBRL for
 *                     person, qty and ₹ value (old /api/corporates-pit is dead
 *                     since NSE's 2026 GIGW revamp — verified 04-Jul-2026)
 *
 * Usage:
 *   node dealsDigest.js [--date YYYY-MM-DD] [--no-email] [--max-xbrl N] [--top-n N]
 *                       [--sast-quote-limit N] [--env-file <path>]
 *
 * # SETUP
 *   - GOOGLE_APP_PASSWORD in repo .env (used by lib/emailService.js; email is
 *     skipped gracefully when missing)
 *   - DEALS_DIGEST_TO (optional, defaults to GMAIL_USER in emailService)
 *   - No other credentials: NSE/BSE endpoints are public (cookie warmup handled
 *     by @stock/api NseSession)
 *
 * Output: prints JSON summary to stdout and writes
 *   data/deals_digest/{date}_deals.json  (raw + top10 per category)
 */

const fs = require('fs');
const path = require('path');
const { nse, bse } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const { sendHtmlEmail, stockscansUrl } = require('@stock/cloud-utils');
const StorageService = require('@stock/cloud-utils').StorageService;
const dbV2 = require('./lib/db');
const { tagEntityTypes, ENTITY_TYPE_LABELS } = require('./lib/entityClassifier');

// Both overridable via CLI flags on main() (see bottom of file), same pattern as the
// existing --max-xbrl: `--top-n <n>` (default 10), `--sast-quote-limit <n>` (default 40).
const TOP_N = 10;
const XBRL_CONCURRENCY = 8;
const SAST_QUOTE_LIMIT = 40; // max unique symbols priced for SAST value estimate
const CRORE = 1e7;

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

    return {
      companyName: match.name,
      marketCap: mcapCr ? mcapCr * 1e7 : null,
    };
  } catch (e) {
    return null;
  }
}

let dualListedBseScrips = null;
async function isAvailableOnNSE(scripCode) {
  if (!scripCode) return false;

  if (!dualListedBseScrips) {
    try {
      const res = await fetch('https://api.kite.trade/instruments');
      const csv = await res.text();

      const nseSymbols = new Set();
      dualListedBseScrips = new Set();

      const lines = csv.split('\n');
      for (const l of lines) {
        if (l.includes(',EQ,') && (l.trim().endsWith(',NSE') || l.trim().endsWith('NSE'))) {
          const p = l.split(',');
          let symbol = p[2].trim();
          symbol = symbol.replace(/-(EQ|BE|BZ|SM|ST|IQ|IL)$/i, '');
          nseSymbols.add(symbol);
        }
      }
      for (const l of lines) {
        if (l.includes(',EQ,') && (l.trim().endsWith(',BSE') || l.trim().endsWith('BSE'))) {
          const p = l.split(',');
          const symbol = p[2].trim();
          if (nseSymbols.has(symbol)) {
            dualListedBseScrips.add(p[1]); // exchange_token is BSE scrip code
          }
        }
      }
    } catch (e) {
      dualListedBseScrips = new Set(); // fallback to empty set on error
    }
  }

  return dualListedBseScrips.has(String(scripCode));
}

function removeIntradayPairs(deals) {
  const result = [];
  const unmatched = new Map();

  for (const d of deals) {
    const isBuy = /buy|acq/i.test(d.side || '');
    const sideKey = isBuy ? 'BUY' : 'SELL';
    const oppositeSideKey = isBuy ? 'SELL' : 'BUY';
    const matchKey = `${d.symbol}_${d.client}_${d.qty}_${oppositeSideKey}`;
    const myKey = `${d.symbol}_${d.client}_${d.qty}_${sideKey}`;

    if (unmatched.has(matchKey) && unmatched.get(matchKey).length > 0) {
      unmatched.get(matchKey).pop();
    } else {
      if (!unmatched.has(myKey)) unmatched.set(myKey, []);
      unmatched.get(myKey).push(d);
    }
  }

  for (const list of unmatched.values()) {
    result.push(...list);
  }

  return result;
}

// ── date helpers ──────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function istNow() {
  return new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000);
}

/** @param {Date} d */
function fmt(d, sep) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return [dd, mm, d.getFullYear()].join(sep);
}

/** '03-Jul-2026' → Date (or null) */
function parseNseDate(s) {
  if (!s) return null;
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})/.exec(String(s).trim());
  if (!m) return null;
  const mon = MONTHS.findIndex((x) => x.toLowerCase() === m[2].toLowerCase());
  return mon < 0 ? null : new Date(Number(m[3]), mon, Number(m[1]));
}

function num(x) {
  if (x === null || x === undefined || x === '' || x === '-') return null;
  const n = Number(String(x).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function crores(v) {
  if (v === null || v === undefined) return '—';
  return `₹${(v / CRORE).toLocaleString('en-IN', { maximumFractionDigits: 2 })} cr`;
}

// ── category fetchers (all errors contained per category) ─────────────────────

/**
 * NSE + BSE bulk/block deals for the latest available trading day.
 * @returns {{bulk: Array, block: Array, asOnDate: string|null}}
 */
async function fetchBulkBlock(targetIst) {
  const out = { bulk: [], block: [], asOnDate: null, errors: [] };

  try {
    const snap = await nse.getLargeDeals();
    out.asOnDate = snap.as_on_date || null;
    // Snapshot rows trail over several days; keep only the target date's rows
    // (screener-style: a category is empty when there were no deals that day).
    const targetTime = new Date(
      targetIst.getFullYear(),
      targetIst.getMonth(),
      targetIst.getDate()
    ).getTime();
    const forTarget = (rows) =>
      (rows || []).filter((r) => parseNseDate(r.date)?.getTime() === targetTime);
    for (const [key, list] of [
      ['bulk', forTarget(snap.BULK_DEALS_DATA)],
      ['block', forTarget(snap.BLOCK_DEALS_DATA)],
    ]) {
      for (const r of list) {
        const qty = num(r.qty);
        const price = num(r.watp);
        out[key].push({
          exchange: 'NSE',
          date: r.date,
          symbol: r.symbol,
          name: r.name,
          client: r.clientName,
          side: r.buySell,
          qty,
          price,
          value: qty !== null && price !== null ? qty * price : null,
        });
      }
    }
  } catch (e) {
    out.errors.push(`NSE large deals: ${e.message}`);
  }

  try {
    const dmy = fmt(targetIst, '/');
    for (const [key, type] of [
      ['bulk', 'bulk'],
      ['block', 'block'],
    ]) {
      const rows = await bse.getBulkBlockDeals(type, dmy, dmy);
      for (const r of rows) {
        const qty = num(r.QUANTITY);
        const price = num(r.PRICE);
        out[key].push({
          exchange: 'BSE',
          date: r.DEAL_DATE ? String(r.DEAL_DATE).slice(0, 10) : null,
          symbol: r.scripname,
          name: r.scripname,
          client: r.CLIENT_NAME,
          side: r.TRANSACTION_TYPE === 'S' ? 'SELL' : 'BUY',
          qty,
          price,
          value: qty !== null && price !== null ? qty * price : null,
        });
      }
    }
  } catch (e) {
    out.errors.push(`BSE bulk/block: ${e.message}`);
  }

  // Tag HFT/Facilitator vs Broker vs Institution/FPI vs Other BEFORE dropping
  // exact-match intraday pairs, but combine bulk+block so a desk that crosses
  // a block via one leg in each category still nets out correctly. This is
  // the same-day buy≈sell detection that separates riskless facilitation
  // (HFT/prop desks warehousing a VC/anchor block and re-distributing it)
  // from real directional buyers/sellers — see lib/entityClassifier.js.
  tagEntityTypes([...out.bulk, ...out.block]);

  out.bulk = removeIntradayPairs(out.bulk);
  out.block = removeIntradayPairs(out.block);
  return out;
}

/**
 * SAST Reg 29 disclosures; ₹ value estimated as shares moved × NSE last close.
 */
async function fetchSast(targetIst, sastQuoteLimit = SAST_QUOTE_LIMIT) {
  const out = { rows: [], errors: [] };
  let raw = [];
  const dmy = fmt(targetIst, '-');
  try {
    raw = await nse.getSastReg29(dmy, dmy, 'equities');
  } catch (e) {
    out.errors.push(`NSE SAST reg29 (equities): ${e.message}`);
  }
  // NSE SME-segment filers report on a SEPARATE index and are omitted from
  // index=equities entirely (verified 2026-07-25 — 2 filings existed on
  // 24-Jul-2026 that the equities index never returned). Merge both.
  try {
    const smeRaw = await nse.getSastReg29(dmy, dmy, 'sme');
    raw = raw.concat(smeRaw);
  } catch (e) {
    out.errors.push(`NSE SAST reg29 (sme): ${e.message}`);
  }
  // KNOWN GAP: this covers NSE-listed companies only (both segments). BSE's
  // only public SAST endpoint (Corp_Sast_disclosure_ng/w) is scoped per
  // scrip+year, not market-wide by date — there is no cheap way to ask BSE
  // "who filed SAST today" without looping every listed BSE scrip (thousands
  // of calls/day). So SAST disclosures from companies listed ONLY on BSE
  // (not dual-listed on NSE) will still be missing here. See
  // [[deals-digest-system]] memory for the investigation trail.

  // NOTE: `acquirerDate` is the underlying transaction date range (when the
  // acquisition/sale actually happened), which frequently lags the filing
  // date by 1-2 days (or, for old "inter-se transfer" disclosures, spans
  // years). It must NOT be used to re-filter for "today's" deals. The NSE
  // API's from_date/to_date params already server-side filter by `timestamp`
  // (the broadcast/filing date), so every row `raw` returns is already
  // correctly scoped — filter defensively on `timestamp` instead, matching
  // what screener.in/trades/sast shows for the day. Fixed 2026-07-25: the
  // previous acquirerDate-based filter zeroed out every row, every day.
  const rows = raw
    .filter((r) => {
      if (!r.timestamp) return false;
      const datePart = r.timestamp.split(' ')[0]; // "24-Jul-2026"
      const filingDate = new Date(datePart.toUpperCase());
      const t = new Date(targetIst.getFullYear(), targetIst.getMonth(), targetIst.getDate());
      return (
        filingDate.getUTCFullYear() === t.getFullYear() &&
        filingDate.getUTCMonth() === t.getMonth() &&
        filingDate.getUTCDate() === t.getDate()
      );
    })
    .map((r) => {
      const acq = num(r.noOfShareAcq);
      const sale = num(r.noOfShareSale);
      const shares = (acq || 0) + (sale || 0);
      return {
        exchange: 'NSE',
        symbol: r.symbol,
        company: r.company,
        acquirer: r.acquirerName,
        side: r.acqSaleType,
        regType: r.regType,
        shares: shares || null,
        pctPost: r.totAftShare ?? null,
        timestamp: r.timestamp,
        attachment: r.attachement || null,
        value: null,
      };
    });

  // Price the symbols (bounded) to estimate value = shares × last close.
  const symbols = [...new Set(rows.filter((r) => r.shares).map((r) => r.symbol))].slice(
    0,
    sastQuoteLimit
  );
  const prices = {};
  for (const sym of symbols) {
    try {
      // NOTE: /api/quote-equity 403s since NSE's 2026 GIGW revamp; the NextApi
      // getSymbolData endpoint is the live quote source (verified 04-Jul-2026).
      const s = await nse.getSymbolData(sym);
      const p = num(s?.priceInfo?.lastPrice ?? s?.orderBook?.lastPrice ?? s?.priceInfo?.close);
      if (p) prices[sym] = p;
    } catch {
      /* leave unpriced — sorts last */
    }
  }
  for (const r of rows) {
    if (r.shares && prices[r.symbol]) r.value = r.shares * prices[r.symbol];
  }
  out.rows = rows;
  return out;
}

// XBRL tag extractor: <in-bse-co:Tag ...>value</...>
function xbrlAll(xml, tag) {
  const re = new RegExp(`<(?:[\\w-]+:)?${tag}(?:\\s[^>]*)?>([^<]*)<`, 'g');
  const vals = [];
  let m;
  while ((m = re.exec(xml)) !== null) vals.push(m[1].trim());
  return vals;
}

/**
 * Insider (PIT Reg 7(2)) trades: filing index from corporates-pit-gg, details
 * parsed from each filing's XBRL (person, category, qty, ₹ value).
 */
async function fetchInsider(targetIst, maxXbrl) {
  const out = { rows: [], totalFilings: 0, parsed: 0, errors: [] };
  let filings = [];
  try {
    const dmy = fmt(targetIst, '-');
    filings = await nse.getInsiderFilings(dmy, dmy);
  } catch (e) {
    out.errors.push(`NSE corporates-pit-gg: ${e.message}`);
    return out;
  }

  const originals = filings.filter(
    (f) => f.xmlFileName && (f.typeOfSubmission || 'Original') === 'Original'
  );
  out.totalFilings = originals.length;
  const todo = originals.slice(0, maxXbrl);

  let i = 0;
  const results = [];
  async function worker() {
    while (i < todo.length) {
      const f = todo[i++];
      const xml = await nse.fetchArchiveXml(f.xmlFileName);
      if (!xml) continue;
      const values = xbrlAll(xml, 'SecuritiesAcquiredOrDisposedValueOfSecurity').map(num);
      const qtys = xbrlAll(xml, 'SecuritiesAcquiredOrDisposedNumberOfSecurity').map(num);
      const types = xbrlAll(xml, 'SecuritiesAcquiredOrDisposedTransactionType');
      const persons = xbrlAll(xml, 'NameOfThePerson');
      const cats = xbrlAll(xml, 'CategoryOfPerson');
      const modes = xbrlAll(xml, 'ModeOfAcquisitionOrDisposal');

      // A single PIT filing can carry multiple legs, and not all legs are
      // economic ownership changes:
      //  - "conversion of security" = dispose of warrants/prefs + acquire
      //    equity of ~equal value → legs should cancel out (net ~0).
      //  - "pledge"/"revoke of pledge"/"invocation" = encumbrance status
      //    change, not a purchase or sale → should contribute 0 to net,
      //    not be added as if it were a buy (that flips sale-heavy filings
      //    like "Sell/Pledge Revoke" from net-negative to net-positive).
      // So: only buy/acq legs add, only sell/sale/dispos legs subtract;
      // every other leg type (pledge, revoke, invocation, gift, etc.) is
      // excluded from netValue but still included in the gross `value`
      // shown in the digest for transparency on total filing activity.
      let buyValue = 0,
        sellValue = 0;
      types.forEach((t, idx) => {
        const v = values[idx] || 0;
        if (/buy|acq/i.test(t)) buyValue += v;
        else if (/sell|sale|dispos/i.test(t)) sellValue += v;
        // else: neutral leg (pledge/revoke/invocation/etc.) — excluded from net
      });
      const netValue = buyValue - sellValue;
      const totalValue = values.reduce((a, b) => a + (b || 0), 0) || null;
      const totalQty = qtys.reduce((a, b) => a + (b || 0), 0) || null;
      results.push({
        exchange: 'NSE',
        symbol: f.symbol,
        company: f.companyName,
        person: persons[0] || null,
        personCount: new Set(persons).size,
        category: cats[0] || null,
        side: [...new Set(types)].join('/') || null,
        mode: [...new Set(modes)].join('/') || null,
        qty: totalQty,
        value: totalValue,
        netValue, // signed; used for group-level Net Value aggregation instead of value+side
        regulation: f.regulation,
        broadcast: f.broadcastDateTime,
        link: f.ixbrl || f.xmlFileName,
      });
    }
  }
  await Promise.all(Array.from({ length: XBRL_CONCURRENCY }, worker));
  out.parsed = results.length;

  try {
    const dmyBse = fmt(targetIst, '/');
    const bseFilings = await bse.getInsiderFilings(dmyBse, dmyBse);
    for (const b of bseFilings) {
      const qty = num(b.Fld_SecurityNo) || 0;
      const val = num(b.Fld_SecurityValue) || 0;
      if (!qty || !val) continue;

      const bseComp = (b.Companyname || '').toLowerCase().trim();
      const nseMatch = results.some(
        (r) => r.exchange === 'NSE' && (r.company || '').toLowerCase().trim() === bseComp
      );
      if (nseMatch) {
        continue;
      }

      if (await isAvailableOnNSE(b.Fld_ScripCode)) {
        continue;
      }

      const bseIsBuy =
        b.Fld_TransactionType === 'Acquisition' || b.ModeOfAquisation === 'Market Purchase';
      results.push({
        exchange: 'BSE',
        symbol: b.Companyname || String(b.Fld_ScripCode),
        company: b.Companyname,
        person: b.Fld_PromoterName || null,
        personCount: 1,
        category: b.Fld_PersonCatgName || null,
        side: bseIsBuy ? 'Buy' : 'Sell',
        mode: b.ModeOfAquisation || null,
        qty: qty,
        value: val,
        netValue: bseIsBuy ? val : -val, // single-leg filing; sign matches side
        regulation: 'PIT',
        broadcast: b.Fld_CreateDate,
        link: b.xbrlurl ? `https://www.bseindia.com${b.xbrlurl}` : null,
      });
      out.parsed++;
      out.totalFilings++;
    }
  } catch (e) {
    out.errors.push(`BSE InsiderTrade15/w: ${e.message}`);
  }

  // Deduplicate cross-listed filings (same person, side, qty, value)
  const uniqueResults = [];
  const seenKeys = new Set();
  for (const r of results) {
    const p = String(r.person || '')
      .substring(0, 15)
      .toLowerCase();
    const key = `${p}_${r.side}_${r.qty}_${r.value}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      uniqueResults.push(r);
    }
  }

  out.rows = uniqueResults;
  return out;
}

// ── ranking + rendering ───────────────────────────────────────────────────────

async function groupAndTop10ByNetValue(rows, topN = TOP_N) {
  const groupsBySym = {};
  for (const r of rows) {
    if (!r.symbol) continue;
    if (!groupsBySym[r.symbol]) {
      groupsBySym[r.symbol] = { symbol: r.symbol, netValue: 0, deals: [] };
    }
    groupsBySym[r.symbol].deals.push(r);

    // Prefer a row's own signed netValue when the fetcher already computed
    // one (insider PIT rows can mix buy + sell legs within a single filing,
    // so side-string sniffing on the joined "Buy/Sell" label would wrongly
    // treat it as a pure buy). Fall back to side-based signing of `value`
    // for rows that only ever carry a single side (bulk/block/SAST).
    if (r.netValue !== undefined && r.netValue !== null) {
      groupsBySym[r.symbol].netValue += r.netValue;
    } else {
      const isBuy = /buy|acq/i.test(r.side || '');
      const isSell = /sell|sale|dispos/i.test(r.side || '');
      if (isBuy) groupsBySym[r.symbol].netValue += r.value || 0;
      else if (isSell) groupsBySym[r.symbol].netValue -= r.value || 0;
      else groupsBySym[r.symbol].netValue += r.value || 0;
    }
  }

  let allGroups = Object.values(groupsBySym);
  allGroups = allGroups.filter((g) => Math.abs(g.netValue) >= 50000000);
  allGroups.sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue));
  const top10 = allGroups.slice(0, topN);

  await Promise.all(
    top10.map(async (g) => {
      g.deals.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
      let nseData = null;
      try {
        nseData = await nse.getSymbolData(g.symbol);
      } catch {}

      g.companyName = nseData?.metaData?.companyName || g.symbol;
      g.marketCap = nseData?.tradeInfo?.totalMarketCap || null;

      if (!g.marketCap || g.companyName === g.symbol) {
        const scr = await getScreenerData(g.symbol);
        if (scr) {
          if (!g.marketCap && scr.marketCap) g.marketCap = scr.marketCap;
          if (g.companyName === g.symbol && scr.companyName) g.companyName = scr.companyName;
        }
      }
    })
  );

  return top10;
}

function pctMcap(netValue, mcap) {
  if (!mcap || isNaN(mcap)) return '—';
  const pct = (Math.abs(netValue) / mcap) * 100;
  return pct.toFixed(4) + '%';
}

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

function renderEmail(dateLabel, digest, topN = TOP_N) {
  const sideColor = (s) => {
    const hasBuy = /buy|acq/i.test(s || '');
    const hasSell = /sell|sale|dispos/i.test(s || '');
    if (hasBuy && hasSell) return '#333'; // mixed legs (e.g. conversion) — neutral, not green
    return hasBuy ? '#1b5e20' : hasSell ? '#b71c1c' : '#333';
  };
  // Net value color: neutral gray at exactly zero (canceling legs), not green.
  const netColor = (v) => (v > 0 ? '#1b5e20' : v < 0 ? '#b71c1c' : '#888');

  const entityTag = (entityType) => {
    if (!entityType) return '';
    const meta = ENTITY_TYPE_LABELS[entityType] || ENTITY_TYPE_LABELS.OTHER;
    return ` <span style="font-size:10px;padding:1px 5px;border-radius:8px;color:#fff;background:${meta.color}">${meta.label}</span>`;
  };

  const dealRows = (groups) =>
    groups.flatMap((g, gIdx) =>
      g.deals.map((r, idx) => {
        const isFirst = idx === 0;
        const rs = g.deals.length;
        const numCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee">${gIdx + 1}</td>`
          : '';
        const symCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee"><a href="${stockscansUrl(g.symbol, r.exchange || 'NSE')}" style="text-decoration:none;color:#1a237e"><b>${esc(g.companyName || g.symbol)}</b></a> <span style="color:#888">${esc(r.exchange)}</span></td>`
          : '';
        const netCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee;text-align:right;color:${netColor(g.netValue)}"><b>${crores(g.netValue)}</b></td>`
          : '';
        const mcapPctCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee;text-align:right">${pctMcap(g.netValue, g.marketCap)}</td>`
          : '';
        return `<tr>${numCol}${symCol}${netCol}${mcapPctCol}${td(esc(r.client) + entityTag(r.entityType), false, true)}${td(`<span style="color:${sideColor(r.side)}">${esc(r.side)}</span>`)}${td(r.qty?.toLocaleString('en-IN') ?? '—', 1)}${td(r.price?.toLocaleString('en-IN') ?? '—', 1)}${td(`<b>${crores(r.value)}</b>`, 1)}</tr>`;
      })
    );

  const sastRows = (groups) =>
    groups.flatMap((g, gIdx) =>
      g.deals.map((r, idx) => {
        const isFirst = idx === 0;
        const rs = g.deals.length;
        const numCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee">${gIdx + 1}</td>`
          : '';
        const symCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee"><a href="${stockscansUrl(g.symbol, r.exchange || 'NSE')}" style="text-decoration:none;color:#1a237e"><b>${esc(g.companyName || g.symbol)}</b></a></td>`
          : '';
        const netCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee;text-align:right;color:${netColor(g.netValue)}"><b>${crores(g.netValue)}</b></td>`
          : '';
        const mcapPctCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee;text-align:right">${pctMcap(g.netValue, g.marketCap)}</td>`
          : '';
        return `<tr>${numCol}${symCol}${netCol}${mcapPctCol}${td(esc(r.acquirer), false, true)}${td(`<span style="color:${sideColor(r.side)}">${esc(r.side)}</span>`)}${td(r.shares?.toLocaleString('en-IN') ?? '—', 1)}${td(`<b>${crores(r.value)}</b>`, 1)}</tr>`;
      })
    );

  const insiderRows = (groups) =>
    groups.flatMap((g, gIdx) =>
      g.deals.map((r, idx) => {
        const isFirst = idx === 0;
        const rs = g.deals.length;
        const numCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee">${gIdx + 1}</td>`
          : '';
        const symCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee"><a href="${stockscansUrl(g.symbol, r.exchange || 'NSE')}" style="text-decoration:none;color:#1a237e"><b>${esc(g.companyName || g.symbol)}</b></a></td>`
          : '';
        const isActualTransaction = g.deals.some((d) =>
          /buy|sell|acq|sale|dispos/i.test(d.side || '')
        );
        const insiderNetColor = isActualTransaction ? netColor(g.netValue) : '#888';
        const netCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee;text-align:right;color:${insiderNetColor}"><b>${crores(g.netValue)}</b></td>`
          : '';
        const mcapPctCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee;text-align:right">${pctMcap(g.netValue, g.marketCap)}</td>`
          : '';
        return `<tr>${numCol}${symCol}${netCol}${mcapPctCol}${td(esc(r.person) + (r.personCount > 1 ? ` <span style="color:#888">+${r.personCount - 1}</span>` : ''), false, true)}${td(esc(r.category))}${td(`<span style="color:${sideColor(r.side)}">${esc(r.side)}</span>`)}${td(r.qty?.toLocaleString('en-IN') ?? '—', 1)}${td(`<b>${crores(r.value)}</b>`, 1)}</tr>`;
      })
    );

  const errs = [...digest.bulkBlock.errors, ...digest.sast.errors, ...digest.insider.errors];

  return `
<div style="max-width:1600px;width:100%;margin:0 auto">
  ${tableHtml(`1️⃣ Bulk Deals (${digest.bulk10.reduce((a, g) => a + g.deals.length, 0)}/${digest.bulkBlock.bulk.length})`, ['#', 'Stock', 'Net Value', '% of Mcap', 'Client', 'Side', 'Qty', 'Price', 'Value'], dealRows(digest.bulk10))}
  ${tableHtml(`2️⃣ Block Deals (${digest.block10.reduce((a, g) => a + g.deals.length, 0)}/${digest.bulkBlock.block.length})`, ['#', 'Stock', 'Net Value', '% of Mcap', 'Client', 'Side', 'Qty', 'Price', 'Value'], dealRows(digest.block10))}
  ${tableHtml(`3️⃣ SAST Trades (${digest.sast10.reduce((a, g) => a + g.deals.length, 0)}/${digest.sast.rows.length})`, ['#', 'Stock', 'Net Value', '% of Mcap', 'Acquirer', 'Type', 'Shares', 'Est. Value'], sastRows(digest.sast10), 'Value estimated as shares × NSE last close (SAST filings don’t carry ₹ value).')}
  ${tableHtml(`4️⃣ Insider Trades (${digest.insider10.reduce((a, g) => a + g.deals.length, 0)}/${digest.insider.parsed} parsed of ${digest.insider.totalFilings})`, ['#', 'Stock', 'Net Value', '% of Mcap', 'Person', 'Category', 'Side', 'Qty', 'Value'], insiderRows(digest.insider10))}
  ${errs.length ? `<p style="font:12px Arial;color:#b71c1c"><b>Fetch warnings:</b> ${errs.map(esc).join(' · ')}</p>` : ''}
  <p style="font:11px Arial;color:#999;margin:24px 0 0;border-top:1px solid #eee;padding-top:8px">Top ${topN} companies per category by net value. Sources: <a href="https://www.nseindia.com/market-data/bulk-deals" style="color:#999;text-decoration:none">NSE Bulk/Block</a> &nbsp;·&nbsp; <a href="https://www.nseindia.com/companies-listing/corporate-filings-sast" style="color:#999;text-decoration:none">NSE SAST Reg 29</a> &nbsp;·&nbsp; <a href="https://www.nseindia.com/companies-listing/corporate-filings-insider-trading-disclosures" style="color:#999;text-decoration:none">NSE PIT</a> &nbsp;·&nbsp; <a href="https://www.bseindia.com/markets/equity/EQReports/BulkDealData_New.aspx" style="color:#999;text-decoration:none">BSE BulkDeal</a>. Like <a href="https://www.screener.in/filings" style="color:#999;text-decoration:none">screener.in/filings</a>, but ours.</p>
</div>`;
}

// ── output DTO envelope (skills/tooling/output-dto-standard) ──────────────────

const DEALS_DIGEST_CREATOR = 'daily-deals-digest';

/**
 * Stamp each per-company group record (bulk10/block10/sast10/insider10) with
 * the standard record-level envelope: companyId (canonical EXCH:SYMBOL),
 * creationTime, modifiedTime, creator. Applied in place before the JSON DTO
 * is written to disk, so the persisted file — not the email — is the source
 * of truth.
 */
function applyDtoEnvelope(digest) {
  const now = new Date().toISOString();
  for (const key of ['bulk10', 'block10', 'sast10', 'insider10']) {
    for (const g of digest[key] || []) {
      const exch = (g.deals && g.deals[0] && g.deals[0].exchange) || 'NSE';
      g.companyId = g.companyId || `${exch}:${g.symbol}`;
      g.creationTime = g.creationTime || now;
      g.modifiedTime = now;
      g.creator = DEALS_DIGEST_CREATOR;
    }
  }
  return digest;
}

// ── main ──────────────────────────────────────────────────────────────────────

function parseDateArg(s) {
  if (!s) return null;
  const str = String(s).trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(str);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(str);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const d = new Date(str.includes('T') ? str : `${str}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  loadEnv(argValue('--env-file'));
  const dateArg = argValue('--date');
  const noEmail = process.argv.includes('--no-email');
  const force = process.argv.includes('--force');
  const maxXbrl = Number(argValue('--max-xbrl')) || 600;
  const topN = Number(argValue('--top-n')) || TOP_N;
  const sastQuoteLimit = Number(argValue('--sast-quote-limit')) || SAST_QUOTE_LIMIT;

  const target = parseDateArg(dateArg) || istNow();
  const dateLabel = fmt(target, '-');

  // Idempotency guard: a run snapshot already existing for this date means a
  // digest email was already sent today (e.g. scheduler double-fire, or a
  // manual re-run on top of the scheduled one). Skip re-sending unless
  // --force is passed. StorageService.init() is required before readJson.
  StorageService.init();
  const dtoPathsForCheck = StorageService.getEventDtoPaths('digest', target);
  const alreadySent =
    !force && !noEmail && StorageService.readJson(dtoPathsForCheck.jsonPath) !== null;
  if (alreadySent) {
    console.log(
      JSON.stringify(
        {
          date: dateLabel,
          email: {
            status: 'skipped',
            reason: `digest already sent for ${dateLabel} (snapshot exists at ${dtoPathsForCheck.jsonPath}); pass --force to resend`,
          },
          snapshot: dtoPathsForCheck.jsonPath,
        },
        null,
        2
      )
    );
    return;
  }

  const [bulkBlock, sast, insider] = [
    await fetchBulkBlock(target),
    await fetchSast(target, sastQuoteLimit),
    await fetchInsider(target, maxXbrl),
  ];

  const digest = {
    date: dateLabel,
    bulkBlock,
    sast,
    insider,
    bulk10: await groupAndTop10ByNetValue(bulkBlock.bulk, topN),
    block10: await groupAndTop10ByNetValue(bulkBlock.block, topN),
    sast10: await groupAndTop10ByNetValue(sast.rows, topN),
    insider10: await groupAndTop10ByNetValue(insider.rows, topN),
  };

  // Output DTO standard (skills/tooling/output-dto-standard): every record
  // (one per company/symbol group here) carries companyId/creationTime/
  // modifiedTime/creator so the JSON is the canonical source the email is
  // rendered FROM, not a byproduct of it.
  applyDtoEnvelope(digest);

  // Prepare DTO assets using StorageService helper (runs/ + assets/ zones)
  const dtoPaths = StorageService.getEventDtoPaths('digest', target);

  digest.assets = dtoPaths.assetsMap;

  // Write the JSON DTO FIRST — the email is a render step derived from it,
  // never a second, independent source of facts (output-dto-standard).
  StorageService.init();
  await StorageService.saveJson(dtoPaths.jsonPath, digest);

  // Canonical store (Data Ecosystem v2): one event record per deal row in the
  // events collection, deterministic ids → scheduler double-fires upsert.
  const isoDate = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
  const dealRows = [];
  const addRows = (arr, subtype) => (arr || []).forEach((r) => dealRows.push({ ...r, subtype }));
  addRows(bulkBlock.bulk, 'bulk');
  addRows(bulkBlock.block, 'block');
  addRows(sast.rows, 'sast');
  addRows(insider.rows, 'insider');
  const { findInText } = require('./lib/companyMaster');
  const dealEvents = dealRows.map((r) => ({
    ...r,
    type: 'deal',
    date: isoDate,
    companyId:
      r.companyId ||
      (r.symbol ? `NSE:${String(r.symbol).toUpperCase()}` : null) ||
      (() => {
        try {
          const hit = findInText(r.companyName || r.company || r.name || '');
          return hit ? hit.companyId : null;
        } catch (_) {
          return null;
        }
      })(),
    creator: 'daily-deals-digest',
    summary: [
      r.subtype,
      r.symbol || r.companyName || r.company,
      r.client || r.clientName || r.acquirer || r.personName,
      r.qty || r.quantity,
      r.price || r.avgPrice,
    ]
      .filter(Boolean)
      .join(' | ')
      .slice(0, 300),
  }));
  if (dealEvents.length) dbV2.appendEvents(dealEvents);

  const htmlBody = renderEmail(dateLabel, digest, topN);

  // Email
  let email = { status: 'skipped', reason: '--no-email' };
  if (!noEmail) {
    email = await sendHtmlEmail({
      subject: `📊 Deals Digest ${dateLabel} — Bulk/Block/SAST/Insider top ${topN} companies by value`,
      htmlBody: htmlBody,
      to: process.env.DEALS_DIGEST_TO || undefined,
    });
  }

  console.log(
    JSON.stringify(
      {
        date: dateLabel,
        counts: {
          bulk: bulkBlock.bulk.length,
          block: bulkBlock.block.length,
          sast: sast.rows.length,
          insiderFilings: insider.totalFilings,
          insiderParsed: insider.parsed,
        },
        top: {
          bulk: digest.bulk10.map((g) => ({
            symbol: g.symbol,
            netValue: crores(g.netValue),
            mcapPct: pctMcap(g.netValue, g.marketCap),
            deals: g.deals.map((r) => `${r.side || ''} ${crores(r.value)}`.trim()),
          })),
          block: digest.block10.map((g) => ({
            symbol: g.symbol,
            netValue: crores(g.netValue),
            mcapPct: pctMcap(g.netValue, g.marketCap),
            deals: g.deals.map((r) => `${r.side || ''} ${crores(r.value)}`.trim()),
          })),
          sast: digest.sast10.map((g) => ({
            symbol: g.symbol,
            netValue: crores(g.netValue),
            mcapPct: pctMcap(g.netValue, g.marketCap),
            deals: g.deals.map((r) => `${r.side || ''} ${crores(r.value)}`.trim()),
          })),
          insider: digest.insider10.map((g) => ({
            symbol: g.symbol,
            netValue: crores(g.netValue),
            mcapPct: pctMcap(g.netValue, g.marketCap),
            deals: g.deals.map((r) => `${r.side || ''} ${crores(r.value)}`.trim()),
          })),
        },
        errors: [...bulkBlock.errors, ...sast.errors, ...insider.errors],
        email,
        snapshot: dtoPaths.jsonPath,
      },
      null,
      2
    )
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error('dealsDigest failed:', e);
    process.exit(1);
  });
}

module.exports = { main };
