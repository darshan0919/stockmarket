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

const { nse, bse, stockscans } = require('@stock/api');
const { loadEnv, argValue } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const { sendHtmlEmail, stockscansUrl, pdfToTextWithMeta } = require('@stock/cloud-utils');
const StorageService = require('@stock/cloud-utils').StorageService;
const dbV2 = require('./lib/db');
const { tagEntityTypes, ENTITY_TYPE_LABELS } = require('./lib/entityClassifier');
const { resolveCompanyIdentity } = require('./lib/companyMaster');

// Companies on this Stockscans watchlist must never be dropped from the
// digest by the ₹5cr net-value threshold or the top-N cutoff in
// groupAndTop10ByNetValue — if they show up in a category's raw rows, they
// stay in that category's output regardless of rank/value. Requested after
// the 28-Jul-2026 run silently skipped Gandhar Oil (below both cutoffs).
const NEVER_FILTER_WATCHLIST_ID = '7ca0e1a60c3fd0d8b1ab61ce';

// Both overridable via CLI flags on main() (see bottom of file), same pattern as the
// existing --max-xbrl: `--top-n <n>` (default 10), `--sast-quote-limit <n>` (default 40).
const TOP_N = 25; // watchlist (never-filter) companies are added on top of this, not counted against it
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

/**
 * Same-day intraday-churn detector, mirroring the "Remove all same-day
 * Buy+Sell traders" (default-on) rule from the extensions/intraday-deal-filter
 * Chrome extension: group deals by (symbol, client) — the whole fetch is
 * already scoped to a single trading day — and if a group has at least one
 * Buy/Acq leg AND at least one Sell/Sale/Dispos leg, that client is treated
 * as an intraday trader (prop desk/HFT/arb square-off) for that symbol.
 * Unlike the old removeIntradayPairs() (which only cancelled exact-quantity
 * opposite-side pairs, leaving lopsided legs behind), this drops every leg
 * for that (symbol, client) unconditionally — the group never enters the
 * net-value calculation at all.
 */
function buildIntradayTraderGroups(deals) {
  const groups = new Map();
  for (const d of deals) {
    const key = `${d.symbol}|${d.client}`;
    const isBuy = /buy|acq/i.test(d.side || '');
    const isSell = /sell|sale|dispos/i.test(d.side || '');
    const g = groups.get(key) || { buy: false, sell: false };
    if (isBuy) g.buy = true;
    if (isSell) g.sell = true;
    groups.set(key, g);
  }
  return groups;
}

function removeIntradayTraders(deals, groups) {
  return deals.filter((d) => {
    const g = groups.get(`${d.symbol}|${d.client}`);
    return !(g && g.buy && g.sell);
  });
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

/**
 * Resolve a deal/insider row to a canonical company identity BEFORE any
 * dedup or grouping happens, instead of grouping on whatever raw string a
 * given exchange feed happened to put in `symbol`/`company`/`name` that day.
 *
 * Two real incidents drove this (2026-07-30):
 *  - RMCL duplicate: NSE spells it "RADHA MADHAV CORPORATION LIMITED", BSE
 *    "Radha Madhav Corporation Ltd" — different strings, so the old
 *    same-string dedup kept both and grouping used the raw symbol/name as
 *    the key, producing two separate rows in the digest for one filing.
 *  - Novartis miss: unrelated bug (see fetchInsider), but reinforced that
 *    identity resolution needs to be a single, testable place rather than
 *    ad hoc string comparisons scattered through this file.
 * (resolveCompanyIdentity is imported from ./lib/companyMaster)
 */

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
  const dmyDash = fmt(targetIst, '-');
  const targetTime = new Date(
    targetIst.getFullYear(),
    targetIst.getMonth(),
    targetIst.getDate()
  ).getTime();

  let nseBulk = [];
  let nseBlock = [];

  try {
    const snap = await nse.getLargeDeals();
    out.asOnDate = snap.as_on_date || null;
    const forTarget = (rows) =>
      (rows || []).filter((r) => parseNseDate(r.date)?.getTime() === targetTime);
    nseBulk = forTarget(snap.BULK_DEALS_DATA);
    nseBlock = forTarget(snap.BLOCK_DEALS_DATA);
  } catch (e) {
    out.errors.push(`NSE large deals: ${e.message}`);
  }

  // If live rolling snapshot has 0 rows for target date (e.g. running on T+1 after rollover),
  // fall back to historical date-range endpoints in /historicalOR namespace (confirmed live).
  if (nseBulk.length === 0) {
    try {
      const histBulk = await nse.getHistoricalBulkDeals(dmyDash, dmyDash);
      for (const r of histBulk) {
        const qty = num(r.BD_QTY_TRD);
        const price = num(r.BD_TP_WATP);
        out.bulk.push({
          exchange: 'NSE',
          date: r.BD_DT_DATE,
          symbol: r.BD_SYMBOL,
          name: r.BD_SCRIP_NAME,
          client: r.BD_CLIENT_NAME,
          side: r.BD_BUY_SELL,
          qty,
          price,
          value: qty !== null && price !== null ? qty * price : null,
        });
      }
    } catch (e) {
      out.errors.push(`NSE historical bulk deals: ${e.message}`);
    }
  } else {
    for (const r of nseBulk) {
      const qty = num(r.qty);
      const price = num(r.watp);
      out.bulk.push({
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

  if (nseBlock.length === 0) {
    try {
      const histBlock = await nse.getHistoricalBlockDeals(dmyDash, dmyDash);
      for (const r of histBlock) {
        const qty = num(r.BD_QTY_TRD);
        const price = num(r.BD_TP_WATP);
        out.block.push({
          exchange: 'NSE',
          date: r.BD_DT_DATE,
          symbol: r.BD_SYMBOL,
          name: r.BD_SCRIP_NAME,
          client: r.BD_CLIENT_NAME,
          side: r.BD_BUY_SELL,
          qty,
          price,
          value: qty !== null && price !== null ? qty * price : null,
        });
      }
    } catch (e) {
      out.errors.push(`NSE historical block deals: ${e.message}`);
    }
  } else {
    for (const r of nseBlock) {
      const qty = num(r.qty);
      const price = num(r.watp);
      out.block.push({
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

  // Combine bulk+block before grouping so a desk that crosses a block via
  // one leg in each category is still caught as a same-day Buy+Sell trader.
  const intradayGroups = buildIntradayTraderGroups([...out.bulk, ...out.block]);
  out.bulk = removeIntradayTraders(out.bulk, intradayGroups);
  out.block = removeIntradayTraders(out.block, intradayGroups);
  return out;
}

/**
 * Normalize an acquirer or promoter name for deduplication.
 * Strips title prefixes, PAC suffixes, punctuation, and multiple spaces.
 */
function normalizeAcquirer(name) {
  return String(name || '')
    .replace(/[\u00a0\s]+/g, ' ')
    .replace(/^(?:mrs?\.?|ms\.?|dr\.?|m\/s\.?)\s+/i, '')
    .replace(/\s+(?:&\s+pacs?|and\s+pacs?|pacs?|donor)\b.*$/i, '')
    .replace(/[^a-z0-9]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Normalize regulatory type for deduplication across exchanges.
 */
function canonicalRegType(s) {
  const str = String(s || '');
  if (/29\s*\(\s*2\s*\)/i.test(str)) return 'Reg 29(2)';
  if (/29\s*\(\s*1\s*\)/i.test(str)) return 'Reg 29(1)';
  if (/10\s*\(\s*6\s*\)/i.test(str)) return 'Reg 10(6)';
  if (/10\s*\(\s*5\s*\)/i.test(str)) return 'Reg 10(5)';
  if (/31\s*\(\s*[12]\s*\)/i.test(str)) return 'Reg 31';
  return str.slice(0, 20).trim();
}

/**
 * Extract share count and holding percentage from a SAST filing PDF.
 * Handles both covering letters and statutory SEBI Form 29 / 10 tabular sections.
 * @param {string} pdfUrl
 * @returns {Promise<{ shares: number|null, pct: number|null }|null>}
 */
async function extractSastPdfData(pdfUrl) {
  if (!pdfUrl) return null;
  try {
    let res = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await fetch(pdfUrl, {
          signal: AbortSignal.timeout(20000),
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (res.ok) break;
      } catch (err) {
        if (attempt === 1) return null;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!res || !res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);
    // eslint-disable-next-line global-require
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse(new Uint8Array(pdfBuffer.slice()));
    await parser.load();
    const doc = await parser.getText();
    let text = doc?.text || '';
    if (!text || text.trim().length < 50) {
      try {
        const meta = await pdfToTextWithMeta(pdfBuffer, { maxChars: 50000 });
        if (meta?.text && meta.text.trim().length >= 50) {
          text = meta.text;
        }
      } catch {
        /* OCR fallback failed */
      }
    }
    if (!text || text.trim().length < 50) return null;

    const normalized = text
      .replace(/(acquisition|disposal|sale|purchase)\s+ot\s+/gi, '$1 of ')
      .replace(/([0-9]+),([0-9]+)[Oo]([0-9]*)/g, '$1,$20$3')
      .replace(/([0-9]+)[Oo]{2}/g, '$100');

    let shares = null;
    let pct = null;

    // Pattern 1: Covering letter "acquisition of X (equity) shares" or "acquired X shares" (including release/pledge)
    const mLetter =
      normalized.match(
        /(?:acquisition|disposal|sale|purchase|release|encumbrance|invocation|pledge)\s+of\s+([0-9,]{3,12})\s+(?:equity\s+)?shares/i
      ) ||
      normalized.match(
        /(?:acquired|sold|purchased|disposed\s+of|released|encumbered|invoked|pledged)\s+([0-9,]{3,12})\s+(?:equity\s+)?shares/i
      );
    if (mLetter) {
      const n = parseInt(mLetter[1].replace(/,/g, ''), 10);
      if (n > 0) shares = n;
    }

    // Pattern 2: "Total: X shares"
    if (!shares) {
      const mTotal = normalized.match(/Total\s*:\s*([0-9,]{3,12})\s+shares/i);
      if (mTotal) {
        const n = parseInt(mTotal[1].replace(/,/g, ''), 10);
        if (n > 0) shares = n;
      }
    }

    // Pattern 3: "Shares carrying voting rights ([0-9,]+) acquired / sold"
    if (!shares) {
      const mTable1 = normalized.match(
        /Shares\s+carrying\s+voting\s+rights\s+([0-9,]{3,12})\s+acquired\s*\/?\s*sold/i
      );
      if (mTable1) {
        const n = parseInt(mTable1[1].replace(/,/g, ''), 10);
        if (n > 0) shares = n;
      }
    }

    // Pattern 4: "Shares carrying voting rights acquired\s*\/?\s*(?:sold)?[\s\S]{0,150}?([0-9,]{3,12})"
    if (!shares) {
      const mTable2 = normalized.match(
        /Shares\s+carrying\s+voting\s+rights\s+acquired[\s\S]{0,150}?([0-9,]{3,12})/i
      );
      if (mTable2) {
        const val = parseInt(mTable2[1].replace(/,/g, ''), 10);
        if (val > 10 && val !== 2024 && val !== 2025 && val !== 2026) shares = val;
      }
    }

    // Pattern 5: Details of acquisition section
    if (!shares) {
      const mSec = normalized.match(
        /Details\s+of\s+acquisition\s*\/?\s*(?:sa\s*le|disposal|sale)?[\s\r\n]+([0-9,]{3,12})/i
      );
      if (mSec) {
        const val = parseInt(mSec[1].replace(/,/g, ''), 10);
        if (val > 10 && val !== 2024 && val !== 2025 && val !== 2026) shares = val;
      }
    }

    let txnDate = null;
    const isProposed =
      /Proposed\s+date\s+of\s+acquisition/i.test(normalized) ||
      /Regulation\s+10\s*\(\s*5\s*\)/i.test(normalized);

    // Pattern 1: Statutory row in Form 29: "Date of acquisition ... [Date]"
    const mStat = normalized.match(
      /Date\s+of\s+acquisition[\s\S]{0,80}?([a-zA-Z]+\s+[0-9]{1,2},?\s*[0-9]{4}|[0-9]{1,2}(?:st|nd|rd|th|m)?\s+[a-zA-Z]+,?\s*[0-9]{4}|[0-9]{1,2}[.\/-][0-9]{1,2}[.\/-][0-9]{2,4})/i
    );
    const parseSastDateStr = (str) => {
      if (!str) return null;
      const clean = str
        .replace(/(?:st|nd|rd|th|m|["'”])/gi, '')
        .replace(/,/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const mDmy = clean.match(/^([0-9]{1,2})[.\/-]([0-9]{1,2})[.\/-]([0-9]{2,4})$/);
      if (mDmy) {
        const d = parseInt(mDmy[1], 10);
        const m = parseInt(mDmy[2], 10) - 1;
        const y = parseInt(mDmy[3].length === 2 ? '20' + mDmy[3] : mDmy[3], 10);
        const dt = new Date(y, m, d);
        if (!isNaN(dt.getTime())) return dt;
      }
      const mDmonY = clean.match(/^([0-9]{1,2})-([a-zA-Z]{3})-([0-9]{2,4})$/);
      if (mDmonY) {
        const d = parseInt(mDmonY[1], 10);
        const mon = MONTHS.findIndex((x) => x.toLowerCase() === mDmonY[2].toLowerCase());
        const y = parseInt(mDmonY[3].length === 2 ? '20' + mDmonY[3] : mDmonY[3], 10);
        if (mon >= 0) {
          const dt = new Date(y, mon, d);
          if (!isNaN(dt.getTime())) return dt;
        }
      }
      const dt = new Date(clean);
      if (!isNaN(dt.getTime())) return dt;
      return null;
    };
    const fmtDisplayD = (d) => {
      if (!d) return null;
      const base = `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
      return isProposed ? `Prop: ${base}` : base;
    };

    if (mStat) {
      const d = parseSastDateStr(mStat[1]);
      if (d) txnDate = fmtDisplayD(d);
    }

    // Pattern 2: Multiple dates in JSL style: e.g. "shares on 11.09.2026"
    if (!txnDate) {
      const mDates = [
        ...normalized.matchAll(
          /(?:shares\s+on|acquired\s+on|held\s+on)\s+([0-9]{1,2}[.\/-][0-9]{1,2}[.\/-][0-9]{2,4})/gi
        ),
      ];
      if (mDates.length > 0) {
        const dList = mDates.map((m) => parseSastDateStr(m[1])).filter(Boolean);
        if (dList.length === 1) txnDate = fmtDisplayD(dList[0]);
        if (dList.length > 1) {
          dList.sort((a, b) => a - b);
          txnDate = `${fmtDisplayD(dList[0])} to ${fmtDisplayD(dList[dList.length - 1])}`;
        }
      }
    }

    // Pattern 3: Covering letter: "acquisition ... on [Date]" or "shares on [Date]"
    if (!txnDate) {
      const mLetterDate = normalized.match(
        /(?:acquisition|disposal|sale|purchase|release|shares)[\s\S]{0,180}?on\s+([0-9]{1,2}-[a-zA-Z]{3}-[0-9]{2,4}|[a-zA-Z]+\s+[0-9]{1,2},?\s*[0-9]{4}|[0-9]{1,2}(?:st|nd|rd|th|m)?\s+[a-zA-Z]+,?\s*[0-9]{4})/i
      );
      if (mLetterDate) {
        const d = parseSastDateStr(mLetterDate[1]);
        if (d) txnDate = fmtDisplayD(d);
      }
    }

    // Pattern 4: Covering letter header date or document date: e.g. "16th September, 2026" or "16-Sep-2026"
    if (!txnDate) {
      const mDocDate = normalized.match(
        /([0-9]{1,2}(?:st|nd|rd|th|m|["'”])?\s+[a-zA-Z]+,?\s*[0-9]{4}|[0-9]{1,2}-[a-zA-Z]{3}-[0-9]{2,4})/i
      );
      if (mDocDate) {
        const d = parseSastDateStr(mDocDate[1]);
        if (d) txnDate = fmtDisplayD(d);
      }
    }

    return { shares, pct, txnDate };
  } catch (_) {
    return null;
  }
}

/**
 * SAST Reg 29 / Takeover disclosures from NSE (legacy Reg 29 API + live announcements)
 * and BSE (market-wide AnnSubCategoryGetData/w). ₹ value estimated as shares moved × last close.
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

  // NOTE: `acquirerDate` is the underlying transaction date range (when the
  // acquisition/sale actually happened), which frequently lags the filing
  // date by 1-2 days (or, for old "inter-se transfer" disclosures, spans
  // years). Filter defensively on `timestamp` instead.
  const legacyRows = raw
    .filter((r) => {
      if (!r.timestamp) return false;
      const datePart = r.timestamp.split(' ')[0]; // "24-Jul-2026"
      const filingDate = parseNseDate(datePart);
      if (!filingDate) return false;
      return (
        filingDate.getFullYear() === targetIst.getFullYear() &&
        filingDate.getMonth() === targetIst.getMonth() &&
        filingDate.getDate() === targetIst.getDate()
      );
    })
    .map((r) => {
      const acq = num(r.noOfShareAcq);
      const sale = num(r.noOfShareSale);
      const shares = (acq || 0) + (sale || 0);
      const pctAfter = num(r.totAftShare);
      const pctDelta = num(r.acqSaleType === 'Sale' ? r.totSaleShare : r.totAcqShare);
      const pctBefore =
        pctAfter != null && pctDelta != null
          ? Math.round(
              (r.acqSaleType === 'Sale' ? pctAfter + pctDelta : pctAfter - pctDelta) * 100
            ) / 100
          : null;
      return {
        exchange: 'NSE',
        symbol: r.symbol,
        company: r.company,
        acquirer: r.acquirerName,
        side: r.acqSaleType,
        regType: r.regType || 'Regulation 29',
        shares: shares || null,
        pctBefore,
        pctPost: r.totAftShare ?? null,
        timestamp: r.timestamp,
        attachment: r.attachement || null,
        value: null,
        txnDate: formatTxnDateRange(
          r.acquirerDate ? [r.acquirerDate.split(' to ')[0], r.acquirerDate.split(' to ')[1]] : []
        ),
      };
    });

  // Live NSE Takeover / SAST corporate announcements (since /corporate-sast-reg29
  // only updates in sporadic delayed batches, live filings broadcast here).
  const nseAnnouncementRows = [];
  try {
    const announcements = await nse.getCorporateAnnouncements({
      fromDate: dmy,
      toDate: dmy,
      index: 'equities',
    });
    const sastAnn = (announcements || []).filter(
      (a) =>
        /takeover|sast|regulation\s*29|reg\s*29|reg\.\s*31|reg\s*10/i.test(a.desc || '') ||
        /takeover|sast|regulation\s*29|reg\s*29|reg\.\s*31|reg\s*10/i.test(a.attchmntText || '')
    );
    for (const a of sastAnn) {
      const text = a.attchmntText || '';
      const mAcq = text.match(/^\s*([^,]+?)\s+has submitted/i);
      const acquirer = mAcq ? mAcq[1].trim() : a.sm_name;
      const mReg = text.match(
        /Regulation\s+(?:29\s*\(\s*[12]\s*\)|31\s*\(\s*[12]\s*\)|10\s*\(\s*[56]\s*\))/i
      );
      const regType = mReg ? mReg[0].replace(/\s+/g, ' ') : a.desc || 'Takeover Disclosure';
      const isSale = /sale|dispos/i.test(text);
      const isAcq = /acqui/i.test(text);
      const isPledge = /pledge|encumbr/i.test(text);
      const side = isPledge
        ? 'Pledge'
        : isSale && !isAcq
          ? 'Sale'
          : isAcq && !isSale
            ? 'Acquisition'
            : 'Disclosure';

      nseAnnouncementRows.push({
        exchange: 'NSE',
        symbol: a.symbol,
        company: a.sm_name,
        acquirer,
        side,
        regType,
        shares: null,
        pctBefore: null,
        pctPost: null,
        timestamp: a.an_dt,
        attachment: a.attchmntFile || null,
        value: null,
        txnDate: null,
      });
    }
  } catch (e) {
    out.errors.push(`NSE SAST announcements: ${e.message}`);
  }

  // Live BSE market-wide SAST / Takeover announcements (AnnSubCategoryGetData/w
  // with category 'Insider Trading / SAST' and strscrip='').
  const bseAnnouncementRows = [];
  try {
    const ymd = `${targetIst.getFullYear()}${String(targetIst.getMonth() + 1).padStart(2, '0')}${String(targetIst.getDate()).padStart(2, '0')}`;
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages && page <= 5) {
      const bseRows = await bse.getSastAnnouncements(ymd, ymd, { pageNo: page });
      if (bseRows.length && bseRows[0].TotalPageCnt) {
        totalPages = bseRows[0].TotalPageCnt;
      }
      for (const r of bseRows) {
        const mAcq = (r.HEADLINE || '').match(/for\s+([^,]+)/i);
        const acquirer = mAcq ? mAcq[1].trim() : r.SLONGNAME;
        const mReg = (r.SUBCATNAME || '').match(
          /Reg\.\s*(?:29\s*\(\s*[12]\s*\)|31\s*\(\s*[12]\s*\)|10\s*\(\s*[56]\s*\))/i
        );
        const regType = mReg ? mReg[0] : r.SUBCATNAME || 'SAST Disclosure';
        const text = `${r.SUBCATNAME || ''} ${r.HEADLINE || ''}`;
        const isSale = /sale|dispos/i.test(text);
        const isAcq = /acqui/i.test(text);
        const isPledge = /pledge|encumbr/i.test(text);
        const side = isPledge
          ? 'Pledge'
          : isSale && !isAcq
            ? 'Sale'
            : isAcq && !isSale
              ? 'Acquisition'
              : 'Disclosure';
        const attachment = r.ATTACHMENTNAME
          ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${r.ATTACHMENTNAME}`
          : null;

        bseAnnouncementRows.push({
          exchange: 'BSE',
          symbol: String(r.SCRIP_CD),
          company: r.SLONGNAME,
          acquirer,
          side,
          regType,
          shares: null,
          pctBefore: null,
          pctPost: null,
          timestamp: r.DissemDT || r.DT_TM,
          attachment,
          value: null,
          txnDate: null,
        });
      }
      page++;
    }
  } catch (e) {
    out.errors.push(`BSE SAST announcements: ${e.message}`);
  }

  // Parse PDF attachments concurrently to extract share counts & percentages
  const allAnnouncementRows = [...nseAnnouncementRows, ...bseAnnouncementRows];
  const pdfRows = allAnnouncementRows.filter((r) => r.attachment && !r.shares);
  const PDF_CONCURRENCY = 6;
  let pIdx = 0;
  async function pdfWorker() {
    while (pIdx < pdfRows.length) {
      const cur = pdfRows[pIdx++];
      const parsed = await extractSastPdfData(cur.attachment);
      if (parsed) {
        if (parsed.shares) cur.shares = parsed.shares;
        if (parsed.pct) cur.pctPost = parsed.pct;
        if (parsed.txnDate) cur.txnDate = parsed.txnDate;
      }
    }
  }
  if (pdfRows.length > 0) {
    const origWarn = console.warn;
    console.warn = (...args) => {
      const msg = typeof args[0] === 'string' ? args[0] : '';
      if (
        msg.startsWith('Warning: TT:') ||
        msg.includes('standardFontDataUrl') ||
        msg.startsWith('Warning: Indexing all PDF objects')
      ) {
        return;
      }
      origWarn(...args);
    };
    try {
      await Promise.all(
        Array.from({ length: Math.min(PDF_CONCURRENCY, pdfRows.length) }, () => pdfWorker())
      );
    } finally {
      console.warn = origWarn;
    }
  }

  const allRows = [...legacyRows, ...allAnnouncementRows];

  // Stricter cross-exchange deduplication:
  // 1. Same entity + same holding delta (legacy rows with % info).
  // 2. Or same canonical company + normalized acquirer + canonical regType + date.
  const seenSast = new Map();
  for (const r of allRows) {
    const identity = resolveCompanyIdentity({
      symbol: r.symbol,
      company: r.company,
      exchange: r.exchange,
    });
    const cleanAcquirer = normalizeAcquirer(r.acquirer || r.company);
    const normReg = canonicalRegType(r.regType);
    const dNse = parseNseDate((r.timestamp || '').split(' ')[0]);
    const datePart = dNse
      ? `${dNse.getFullYear()}-${String(dNse.getMonth() + 1).padStart(2, '0')}-${String(dNse.getDate()).padStart(2, '0')}`
      : (r.timestamp || '').slice(0, 10);
    const key =
      r.pctPost !== null && r.pctBefore !== null
        ? [identity.companyId, cleanAcquirer, r.side, r.pctBefore, r.pctPost].join('|')
        : [identity.companyId, cleanAcquirer, normReg, datePart].join('|');

    const existing = seenSast.get(key);
    if (!existing) {
      seenSast.set(key, r);
    } else if (!existing.shares && r.shares) {
      seenSast.set(key, r);
    } else if (existing.shares && !r.shares) {
      // keep existing with parsed shares
    } else if (r.exchange === 'NSE' && existing.exchange !== 'NSE') {
      seenSast.set(key, r);
    }
    const merged = seenSast.get(key);
    if (merged && !merged.txnDate && r.txnDate) {
      merged.txnDate = r.txnDate;
    }
  }

  const finalRows = [...seenSast.values()];

  // Price symbols with known share counts to estimate value = shares × last close.
  const symbols = [...new Set(finalRows.filter((r) => r.shares).map((r) => r.symbol))].slice(
    0,
    sastQuoteLimit
  );
  const prices = {};
  for (const sym of symbols) {
    try {
      const identity = resolveCompanyIdentity({ symbol: sym });
      const quoteSym = identity.nseTicker || sym;
      let p = null;
      if (!/^\d+$/.test(quoteSym)) {
        try {
          const s = await nse.getSymbolData(quoteSym);
          p = num(s?.priceInfo?.lastPrice ?? s?.orderBook?.lastPrice ?? s?.priceInfo?.close);
        } catch {
          /* try BSE fallback */
        }
      }
      if (!p) {
        const bseScrip = identity.bseTicker || (/^\d+$/.test(sym) ? sym : null);
        if (bseScrip) {
          try {
            const h = await bse.getQuoteHeader(bseScrip);
            p = num(h?.CurrRate?.LTP ?? h?.Header?.PrevClose);
          } catch {
            /* leave unpriced */
          }
        }
      }
      if (p) prices[sym] = p;
    } catch {
      /* leave unpriced */
    }
  }
  for (const r of finalRows) {
    if (r.shares && prices[r.symbol]) {
      r.value = r.shares * prices[r.symbol];
      const isSell = /sell|sale|dispos/i.test(r.side || '');
      r.netValue = (isSell ? -1 : 1) * r.value;
    }
  }

  out.rows = finalRows;
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
 * Format a YYYY-MM-DD or ISO date string into DD-Mon-YYYY (e.g. 16-Sep-2026).
 * @param {string} isoStr
 * @returns {string}
 */
function formatNseDisplayDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr.includes('T') ? isoStr : `${isoStr}T00:00:00`);
  if (isNaN(d.getTime())) return isoStr;
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = MONTHS[d.getMonth()];
  const yyyy = d.getFullYear();
  return `${dd}-${mon}-${yyyy}`;
}

/**
 * Format an array of transaction date strings into a concise display date or range.
 * Examples:
 *   ['2026-09-15'] -> '15-Sep-2026'
 *   ['2026-09-11', '2026-09-16'] -> '11-Sep to 16-Sep-2026'
 *   [] -> '—'
 * @param {string[]} dates
 * @returns {string}
 */
function formatTxnDateRange(dates) {
  const valid = [
    ...new Set((dates || []).filter(Boolean).map((s) => String(s).slice(0, 10))),
  ].sort();
  if (!valid.length) return '—';
  if (valid.length === 1) return formatNseDisplayDate(valid[0]);
  const first = formatNseDisplayDate(valid[0]);
  const last = formatNseDisplayDate(valid[valid.length - 1]);
  if (first === last) return first;
  const m1 = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(first);
  const m2 = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(last);
  if (m1 && m2 && m1[2] === m2[2] && m1[3] === m2[3]) {
    return `${m1[1]}-${m1[2]} to ${m2[1]}-${m2[2]}-${m2[3]}`;
  }
  return `${first} to ${last}`;
}

/**
 * Insider (PIT Reg 7(2)) trades: filing index from corporates-pit-gg, details
 * parsed from each filing's XBRL (person, category, qty, ₹ value).
 */
async function fetchInsider(targetIst, maxXbrl) {
  const out = { rows: [], totalFilings: 0, parsed: 0, errors: [] };
  const targetIsoDate = `${targetIst.getFullYear()}-${String(targetIst.getMonth() + 1).padStart(2, '0')}-${String(targetIst.getDate()).padStart(2, '0')}`;
  let filings = [];
  try {
    const dmy = fmt(targetIst, '-');
    filings = await nse.getInsiderFilings(dmy, dmy);
  } catch (e) {
    out.errors.push(`NSE corporates-pit-gg: ${e.message}`);
    return out;
  }

  const validFilings = filings.filter((f) => f.xmlFileName);
  out.totalFilings = validFilings.length;
  const todo = validFilings.slice(0, maxXbrl);

  let i = 0;
  const results = [];
  async function worker() {
    while (i < todo.length) {
      const f = todo[i++];
      const xml = await nse.fetchArchiveXml(f.xmlFileName);
      if (!xml) continue;

      // Skip filing if the Exchange Filing Date in the XBRL does not match
      // the script's run date (e.g. rectified/revised disclosures from past quarters
      // re-broadcasted by NSE today, like NPST's 2026-07-01 filing broadcasted on 2026-09-16).
      const filingDates = xbrlAll(xml, 'DateOfFiling');
      const filingDate = filingDates[0] ? filingDates[0].slice(0, 10) : null;
      if (filingDate && filingDate !== targetIsoDate) {
        continue;
      }

      const fromDates = xbrlAll(
        xml,
        'DateOfAllotmentAdviceOrAcquisitionOfSharesOrSaleOfSharesSpecifyFromDate'
      );
      const toDates = xbrlAll(
        xml,
        'DateOfAllotmentAdviceOrAcquisitionOfSharesOrSaleOfSharesSpecifyToDate'
      );
      const txnDate = formatTxnDateRange([...fromDates, ...toDates]);

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
      //  - "pledge" (new pledge created) / "invocation" (lender seizes
      //    pledged shares) = encumbrance status change, not a purchase or
      //    sale → contribute 0 to net, not added as if a buy (that would
      //    flip sale-heavy filings like "Sell/Pledge" from net-negative to
      //    net-positive).
      //  - "revoke of pledge" / "release of pledge" is DIFFERENT: releasing
      //    a pledge is a real, meaningful signal (promoter shares becoming
      //    unencumbered again) and per Darshan's direction (2026-07-30) it
      //    should count toward netValue like a buy/acquisition — this is
      //    what makes it correctly show up as a real, colored net value
      //    instead of ₹0. (Previously it was treated as neutral, which is
      //    how Geojit's ₹56.53cr pledge-revoke got dropped by the group
      //    threshold — see groupAndTop10ByNetValue's grossValue fallback,
      //    which stays in place as a second safety net for any OTHER
      //    still-neutral leg type that turns out to be large.)
      // So: buy/acq legs add, release/revoke-of-pledge legs also add,
      // sell/sale/dispos legs subtract; every other leg type (plain pledge
      // creation, invocation, gift, etc.) is excluded from netValue but
      // still included in the gross `value` shown in the digest.
      let buyValue = 0,
        sellValue = 0;
      types.forEach((t, idx) => {
        const v = values[idx] || 0;
        if (/buy|acq/i.test(t)) buyValue += v;
        else if (/(revoke|release).*pledge|pledge.*(revoke|release)/i.test(t)) buyValue += v;
        else if (/sell|sale|dispos/i.test(t)) sellValue += v;
        // else: neutral leg (pledge creation/invocation/etc.) — excluded from net
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
        txnDate,
        filingDate,
      });
    }
  }
  await Promise.all(Array.from({ length: XBRL_CONCURRENCY }, worker));
  out.parsed = results.length;

  try {
    const dmyBse = fmt(targetIst, '/');
    const bseFilings = await bse.getInsiderFilings(dmyBse, dmyBse);
    for (const b of bseFilings) {
      const bseFilingDate = (b.Fld_StampDate || b.Fld_LetterDate || b.Fld_CreateDate || '').slice(
        0,
        10
      );
      if (bseFilingDate && bseFilingDate !== targetIsoDate) {
        continue;
      }

      const qty = num(b.Fld_SecurityNo) || 0;
      const val = num(b.Fld_SecurityValue) || 0;
      if (!qty || !val) continue;

      const bseIdentity = resolveCompanyIdentity({
        symbol: String(b.Fld_ScripCode),
        companyName: b.Companyname,
        exchange: 'BSE',
      });
      const bseKey = bseIdentity.key;
      const nseMatch = results.some(
        (r) =>
          r.exchange === 'NSE' &&
          resolveCompanyIdentity({ symbol: r.symbol, companyName: r.company, exchange: 'NSE' })
            .key === bseKey
      );
      if (nseMatch) {
        continue;
      }

      const bseFrom = b.Fld_FromDate ? b.Fld_FromDate.slice(0, 10) : null;
      const bseTo = b.Fld_ToDate ? b.Fld_ToDate.slice(0, 10) : null;
      const bseTxnDate = formatTxnDateRange([bseFrom, bseTo].filter(Boolean));

      const pledgeReleaseRe = /(revoke|release).*pledge|pledge.*(revoke|release)/i;
      const isPledgeRelease =
        pledgeReleaseRe.test(b.Fld_TransactionType || '') ||
        pledgeReleaseRe.test(b.ModeOfAquisation || '');
      const bseIsBuy =
        b.Fld_TransactionType === 'Acquisition' ||
        b.ModeOfAquisation === 'Market Purchase' ||
        isPledgeRelease;
      results.push({
        exchange: 'BSE',
        symbol: bseIdentity.displaySymbol || String(b.Fld_ScripCode),
        company: bseIdentity.companyName || b.Companyname,
        person: b.Fld_PromoterName || null,
        personCount: 1,
        category: b.Fld_PersonCatgName || null,
        side: isPledgeRelease ? 'Pledge Revoke' : bseIsBuy ? 'Buy' : 'Sell',
        mode: b.ModeOfAquisation || null,
        qty: qty,
        value: val,
        netValue: bseIsBuy ? val : -val, // single-leg filing; sign matches side
        regulation: 'PIT',
        broadcast: b.Fld_CreateDate,
        link: b.xbrlurl ? `https://www.bseindia.com${b.xbrlurl}` : null,
        txnDate: bseTxnDate,
        filingDate: bseFilingDate || null,
      });
      out.parsed++;
      out.totalFilings++;
    }
  } catch (e) {
    out.errors.push(`BSE InsiderTrade15/w: ${e.message}`);
  }

  // Deduplicate cross-listed / re-transmitted filings (same company, person, side, qty)
  function normalizePersonName(name) {
    return String(name || '')
      .replace(/\s*\((?:REVISED|REVISION|AMENDED|AMENDMENT|CORRECTED|ORIGINAL)\b[^\)]*\)/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  const uniqueResults = [];
  const seenKeys = new Map();
  for (const r of results) {
    const p = normalizePersonName(r.person);
    const idKey =
      r.companyId ||
      resolveCompanyIdentity({ symbol: r.symbol, companyName: r.company, exchange: r.exchange })
        .key;
    const key = `${idKey}_${p}_${r.side}_${r.qty}`;
    const existing = seenKeys.get(key);
    if (!existing) {
      seenKeys.set(key, r);
      uniqueResults.push(r);
    } else {
      // If this row is a revision or later broadcast, update existing
      const isRevision =
        /\brevised\b/i.test(r.person || '') ||
        String(r.broadcast || '') > String(existing.broadcast || '');
      if (isRevision) {
        const idx = uniqueResults.indexOf(existing);
        if (idx !== -1) uniqueResults[idx] = r;
        seenKeys.set(key, r);
      }
    }
  }

  out.rows = uniqueResults;
  return out;
}

/**
 * Bare NSE/BSE symbols (no "NSE:"/"BSE:" prefix) of companies on the
 * never-filter watchlist. Fetched once per run; failures degrade to an
 * empty set (never-filter is a safety net, not a hard dependency).
 */
async function getNeverFilterSymbols() {
  try {
    const data = await stockscans.watchlistTable(NEVER_FILTER_WATCHLIST_ID);
    const rows = (data.table || []).slice(1); // row[0] = headers
    return new Set(rows.map((r) => String(r[0]).split(':').pop().toUpperCase()).filter(Boolean));
  } catch (e) {
    console.error(`Warning: could not fetch never-filter watchlist: ${e.message}`);
    return new Set();
  }
}

// ── ranking + rendering ───────────────────────────────────────────────────────

async function groupAndTop10ByNetValue(
  rows,
  topN = TOP_N,
  neverFilterSymbols = new Set(),
  category = null
) {
  const groupsBySym = {};
  for (const r of rows) {
    if (!r.symbol && !r.company && !r.companyName) continue;

    // Group by canonical company identity (NSE ticker / BSE scrip code via
    // companyMaster, or a normalized-name key when the master has no record
    // at all) rather than the raw symbol/name string a given feed happened
    // to use that day — see resolveCompanyIdentity() for why: it's what
    // fixed both the RMCL cross-exchange duplicate and keeps working even
    // for companies (like RMCL) that aren't in the Kite instruments dump.
    const identity = resolveCompanyIdentity({
      symbol: r.symbol,
      company: r.company || r.name,
      companyName: r.companyName,
      exchange: r.exchange,
    });
    const groupKey = identity.key;

    if (!groupsBySym[groupKey]) {
      groupsBySym[groupKey] = {
        symbol: identity.displaySymbol,
        companyName: identity.companyName,
        nseTicker: identity.nseTicker,
        bseTicker: identity.bseTicker,
        companyId: identity.companyId,
        netValue: 0,
        grossValue: 0,
        deals: [],
      };
    }
    const g = groupsBySym[groupKey];
    g.deals.push(r);
    g.grossValue += Math.abs(r.value || 0);

    // Prefer a row's own signed netValue when the fetcher already computed
    // one (insider PIT rows can mix buy + sell legs within a single filing,
    // so side-string sniffing on the joined "Buy/Sell" label would wrongly
    // treat it as a pure buy). Fall back to side-based signing of `value`
    // for rows that only ever carry a single side (bulk/block/SAST).
    if (r.netValue !== undefined && r.netValue !== null) {
      g.netValue += r.netValue;
    } else {
      const isBuy = /buy|acq/i.test(r.side || '');
      const isSell = /sell|sale|dispos/i.test(r.side || '');
      if (isBuy) g.netValue += r.value || 0;
      else if (isSell) g.netValue -= r.value || 0;
      else g.netValue += r.value || 0;
    }
  }

  let allGroups = Object.values(groupsBySym);
  // Never-filter symbols bypass the ₹5cr threshold entirely so a small
  // (below-threshold) deal on a tracked company still surfaces.
  //
  // Threshold is checked against grossValue (sum of |value| across every
  // leg), not just netValue: a filing made up ENTIRELY of neutral legs
  // (pledge/revoke/invocation — see fetchInsider's netValue comment) nets to
  // 0 by design, which used to make the whole group vanish here regardless
  // of how large the underlying disclosure was. That's how a ₹56.53cr Geojit
  // promoter pledge-revoke got silently dropped on 2026-07-30: net value was
  // exactly 0, so it never cleared the old net-only threshold even though
  // the digest's own renderEmail() already had logic to display such
  // "no actual transaction" groups in gray. Gating on max(|net|, gross)
  // keeps material disclosures visible while still suppressing genuinely
  // tiny activity.
  //
  // For SAST, disclosures represent substantial acquisitions (>5% or >2% delta)
  // regardless of whether ₹ value could be derived from PDF metadata alone.
  // Retain all SAST groups, sorting valued deals first by |netValue| and unpriced filings next.
  allGroups = allGroups.filter(
    (g) =>
      category === 'sast' ||
      Math.abs(g.netValue) >= 5000000 ||
      neverFilterSymbols.has(String(g.symbol).toUpperCase())
  );
  allGroups.sort((a, b) => {
    const valA = Math.abs(a.netValue || 0);
    const valB = Math.abs(b.netValue || 0);
    if (valA !== valB) return valB - valA;
    const sharesA = a.deals.reduce((sum, d) => sum + (d.shares || 0), 0);
    const sharesB = b.deals.reduce((sum, d) => sum + (d.shares || 0), 0);
    if (sharesA !== sharesB) return sharesB - sharesA;
    return 0;
  });
  const top10 = allGroups.slice(0, topN);

  // Re-add any never-filter symbols that made it past the threshold filter
  // above but fell outside the top-N cutoff — they must remain in the
  // results even if not currently ranked in the top N by value.
  for (const g of allGroups) {
    if (neverFilterSymbols.has(String(g.symbol).toUpperCase()) && !top10.includes(g)) {
      top10.push(g);
    }
  }
  top10.sort((a, b) => {
    const valA = Math.abs(a.netValue || 0);
    const valB = Math.abs(b.netValue || 0);
    if (valA !== valB) return valB - valA;
    const sharesA = a.deals.reduce((sum, d) => sum + (d.shares || 0), 0);
    const sharesB = b.deals.reduce((sum, d) => sum + (d.shares || 0), 0);
    if (sharesA !== sharesB) return sharesB - sharesA;
    return 0;
  });

  await Promise.all(
    top10.map(async (g) => {
      g.deals.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

      // For groups where every single deal is unpriced, represent netValue as
      // null so renderers display '—' instead of '₹0 cr'.
      if (g.deals.length > 0 && g.deals.every((d) => d.value === null || d.value === undefined)) {
        g.netValue = null;
      }

      // Only hit NSE's quote API when we actually resolved an NSE ticker for
      // this group — a BSE-only company's scrip code isn't a valid NSE
      // symbol and would just silently 404/catch below anyway.
      let nseData = null;
      if (g.nseTicker) {
        try {
          nseData = await nse.getSymbolData(g.nseTicker);
        } catch (_) {
          // ignore quote fetch error
        }
      }

      if (nseData?.metaData?.companyName) g.companyName = nseData.metaData.companyName;
      g.marketCap = nseData?.tradeInfo?.totalMarketCap || null;

      // g.companyName already came from companyMaster (resolveCompanyIdentity)
      // when available; only fall through to screener.in scraping when we
      // still don't have a real name (i.e. it fell back to the raw symbol).
      if (!g.companyName && !g.bseTicker) {
        try {
          const s = await getScreenerData(g.symbol);
          if (s?.name) g.companyName = s.name;
        } catch (_) {
          // ignore screener scrape error
        }
      }
    })
  );

  return top10;
}

function pctMcap(netValue, mcap) {
  if (!mcap || isNaN(mcap) || netValue === null || netValue === undefined) return '—';
  const pct = (Math.abs(netValue) / mcap) * 100;
  return pct.toFixed(4) + '%';
}

function esc(s) {
  return String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
}

function tableHtml(title, headers, rowsHtml, note, screenerUrl) {
  const screenerBtn = screenerUrl
    ? ` <a href="${screenerUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;vertical-align:middle;margin-left:8px;padding:2px 6px;background:#f1f3f4;border:1px solid #dadce0;border-radius:4px;text-decoration:none;line-height:0" title="Open on Screener"><img src="https://cdn-static.screener.in/favicon/favicon-32x32.00205914303a.png" width="14" height="14" alt="Screener" style="vertical-align:middle;border:0" /></a>`
    : '';
  return `
  <h3 style="margin:24px 0 6px;font-family:Arial,sans-serif;color:#1a237e">${title}${screenerBtn}</h3>
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
    // Release/revoke of pledge now feeds netValue like a buy (fetchInsider) —
    // color it the same way here so the per-leg badge matches.
    const hasBuy =
      /buy|acq/i.test(s || '') ||
      /(revoke|release).*pledge|pledge.*(revoke|release)/i.test(s || '');
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

  const companyStockscansUrl = (g, r) => {
    if (g.nseTicker) return stockscansUrl(g.nseTicker, 'NSE');
    if (g.companyId && g.companyId.startsWith('NSE:')) return stockscansUrl(g.companyId);
    if (g.bseTicker) return stockscansUrl(g.bseTicker, 'BSE');
    if (g.companyId && g.companyId.startsWith('BSE:')) return stockscansUrl(g.companyId);
    return stockscansUrl(g.symbol, r?.exchange || 'NSE');
  };

  const dealRows = (groups) =>
    groups.flatMap((g, gIdx) =>
      g.deals.map((r, idx) => {
        const isFirst = idx === 0;
        const rs = g.deals.length;
        const numCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee">${gIdx + 1}</td>`
          : '';
        const url = companyStockscansUrl(g, r);
        const nameLink = url
          ? `<a href="${url}" style="text-decoration:none;color:#1a237e"><b>${esc(g.companyName || g.symbol)}</b></a>`
          : `<b>${esc(g.companyName || g.symbol)}</b>`;
        const symCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee">${nameLink} <span style="color:#888">${esc(r.exchange)}</span></td>`
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
        const url = companyStockscansUrl(g, r);
        const nameLink = url
          ? `<a href="${url}" style="text-decoration:none;color:#1a237e"><b>${esc(g.companyName || g.symbol)}</b></a>`
          : `<b>${esc(g.companyName || g.symbol)}</b>`;
        const symCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee">${nameLink}</td>`
          : '';
        const netCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee;text-align:right;color:${netColor(g.netValue)}"><b>${crores(g.netValue)}</b></td>`
          : '';
        const mcapPctCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee;text-align:right">${pctMcap(g.netValue, g.marketCap)}</td>`
          : '';
        return `<tr>${numCol}${symCol}${netCol}${mcapPctCol}${td(esc(r.txnDate || '—'))}${td(esc(r.acquirer), false, true)}${td(`<span style="color:${sideColor(r.side)}">${esc(r.side)}</span>`)}${td(r.shares?.toLocaleString('en-IN') ?? '—', 1)}${td(`<b>${crores(r.value)}</b>`, 1)}</tr>`;
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
        const url = companyStockscansUrl(g, r);
        const nameLink = url
          ? `<a href="${url}" style="text-decoration:none;color:#1a237e"><b>${esc(g.companyName || g.symbol)}</b></a>`
          : `<b>${esc(g.companyName || g.symbol)}</b>`;
        const symCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee">${nameLink}</td>`
          : '';
        // "Pledge Revoke"/"release of pledge" legs now feed netValue just
        // like buy/sell (see fetchInsider) — count them as an actual
        // transaction here too, or their real (now non-zero) net value would
        // still render forced gray instead of the green/red it earned.
        const isActualTransaction = g.deals.some((d) =>
          /buy|sell|acq|sale|dispos|(revoke|release).*pledge|pledge.*(revoke|release)/i.test(
            d.side || ''
          )
        );
        const insiderNetColor = isActualTransaction ? netColor(g.netValue) : '#888';
        const netCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee;text-align:right;color:${insiderNetColor}"><b>${crores(g.netValue)}</b></td>`
          : '';
        const mcapPctCol = isFirst
          ? `<td rowspan="${rs}" style="border-bottom:1px solid #eee;text-align:right">${pctMcap(g.netValue, g.marketCap)}</td>`
          : '';
        // Insider XBRL filings don't carry a price field directly (unlike
        // bulk/block, which get watp/PRICE straight from the exchange) — the
        // filing only discloses qty and ₹ value per leg-group, so derive an
        // average price the same way a per-share price is implied anywhere
        // else: value ÷ qty. `r.qty`/`r.value` here are already the summed
        // totals across every leg of one filing (see fetchInsider), so this
        // is that filing's blended average price, not a single trade tick.
        const avgPrice = r.qty && r.value ? r.value / r.qty : null;
        return `<tr>${numCol}${symCol}${netCol}${mcapPctCol}${td(esc(r.txnDate || '—'))}${td(esc(r.person) + (r.personCount > 1 ? ` <span style="color:#888">+${r.personCount - 1}</span>` : ''), false, true)}${td(esc(r.category))}${td(`<span style="color:${sideColor(r.side)}">${esc(r.side)}</span>`)}${td(r.qty?.toLocaleString('en-IN') ?? '—', 1)}${td(avgPrice?.toLocaleString('en-IN', { maximumFractionDigits: 2 }) ?? '—', 1)}${td(`<b>${crores(r.value)}</b>`, 1)}</tr>`;
      })
    );

  const errs = [...digest.bulkBlock.errors, ...digest.sast.errors, ...digest.insider.errors];

  const SCREENER_URLS = {
    bulk: 'https://www.screener.in/trades/bulk/?o=-2.-4&trade_type=exclude_intraday',
    block: 'https://www.screener.in/trades/block/?o=-2.-4',
    sast: 'https://www.screener.in/trades/sast/?o=-2.-4',
    insider: 'https://www.screener.in/trades/insiders/?o=-2.-4',
  };

  return `
<div style="max-width:1600px;width:100%;margin:0 auto">
  ${tableHtml(`1️⃣ Bulk Deals (${digest.bulk10.reduce((a, g) => a + g.deals.length, 0)}/${digest.bulkBlock.bulk.length})`, ['#', 'Stock', 'Net Value', '% of Mcap', 'Client', 'Side', 'Qty', 'Price', 'Value'], dealRows(digest.bulk10), null, SCREENER_URLS.bulk)}
  ${tableHtml(`2️⃣ Block Deals (${digest.block10.reduce((a, g) => a + g.deals.length, 0)}/${digest.bulkBlock.block.length})`, ['#', 'Stock', 'Net Value', '% of Mcap', 'Client', 'Side', 'Qty', 'Price', 'Value'], dealRows(digest.block10), null, SCREENER_URLS.block)}
  ${tableHtml(`3️⃣ SAST Trades (${digest.sast10.reduce((a, g) => a + g.deals.length, 0)}/${digest.sast.rows.length})`, ['#', 'Stock', 'Net Value', '% of Mcap', 'Txn Date', 'Acquirer', 'Type', 'Shares', 'Est. Value'], sastRows(digest.sast10), 'Value estimated as shares × NSE last close (SAST filings don’t carry ₹ value).', SCREENER_URLS.sast)}
  ${tableHtml(`4️⃣ Insider Trades (${digest.insider10.reduce((a, g) => a + g.deals.length, 0)}/${digest.insider.parsed} parsed of ${digest.insider.totalFilings})`, ['#', 'Stock', 'Net Value', '% of Mcap', 'Txn Date', 'Person', 'Category', 'Side', 'Qty', 'Avg. Price', 'Value'], insiderRows(digest.insider10), 'Avg. Price = filing’s ₹ value ÷ qty (PIT filings don’t disclose a per-trade price directly).', SCREENER_URLS.insider)}
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
      if (!g.companyId) {
        if (g.nseTicker) g.companyId = `NSE:${g.nseTicker}`;
        else if (g.bseTicker) g.companyId = `BSE:${g.bseTicker}`;
        else {
          const exch = (g.deals && g.deals[0] && g.deals[0].exchange) || 'NSE';
          g.companyId = `${exch}:${g.symbol}`;
        }
      }
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

  const [bulkBlock, sast, insider, neverFilterSymbols] = [
    await fetchBulkBlock(target),
    await fetchSast(target, sastQuoteLimit),
    await fetchInsider(target, maxXbrl),
    await getNeverFilterSymbols(),
  ];

  const digest = {
    date: dateLabel,
    bulkBlock,
    sast,
    insider,
    bulk10: await groupAndTop10ByNetValue(bulkBlock.bulk, topN, neverFilterSymbols),
    block10: await groupAndTop10ByNetValue(bulkBlock.block, topN, neverFilterSymbols),
    sast10: await groupAndTop10ByNetValue(sast.rows, topN, neverFilterSymbols, 'sast'),
    insider10: await groupAndTop10ByNetValue(insider.rows, topN, neverFilterSymbols),
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
  const dealEvents = dealRows.map((r) => {
    let companyId = r.companyId;
    if (!companyId) {
      try {
        const ident = resolveCompanyIdentity({
          symbol: r.symbol,
          company: r.company || r.name,
          companyName: r.companyName,
          exchange: r.exchange,
        });
        companyId = ident.companyId;
      } catch (_) {
        companyId = null;
      }
    }
    return {
      ...r,
      type: 'deal',
      date: isoDate,
      companyId,
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
    };
  });
  if (dealEvents.length) dbV2.appendEvents(dealEvents);

  const htmlBody = renderEmail(dateLabel, digest, topN);

  // Email
  let email = { status: 'skipped', reason: '--no-email' };
  if (!noEmail) {
    email = await sendHtmlEmail({
      subject: `📊 Deals Digest ${dateLabel} — Bulk/Block/SAST/Insider top ${topN} companies by value`,
      htmlBody: htmlBody,
      to: process.env.DEALS_DIGEST_TO || undefined,
      jobName: stockscans.http.jobName,
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
  const jobName = resolveJobName('daily-deals-digest');
  stockscans.setJobName(jobName);
  main()
    .catch((e) => {
      console.error('dealsDigest failed:', e);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}

module.exports = {
  main,
  // Exported for verifyDealsDigest.js (the post-run reconciliation script) so
  // it re-derives identity/grouping using the EXACT same rules as the digest
  // itself, instead of a second hand-rolled copy that could silently drift
  // out of sync with real fixes made here.
  resolveCompanyIdentity,
  groupAndTop10ByNetValue,
  getNeverFilterSymbols,
  renderEmail,
  parseDateArg,
  fmt,
  formatTxnDateRange,
  formatNseDisplayDate,
  fetchBulkBlock,
  fetchSast,
  extractSastPdfData,
};
