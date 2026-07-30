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
const { stockscans } = require('@stock/api');
const {
  loadCompanyMaster: cmLoad,
  findByTicker: cmFindByTicker,
  findByScripCode: cmFindByScripCode,
  findByBseTicker: cmFindByBseTicker,
  normalizeName: cmNormalizeName,
} = require('./lib/companyMaster');

// Companies on this Stockscans watchlist must never be dropped from the
// digest by the ₹5cr net-value threshold or the top-N cutoff in
// groupAndTop10ByNetValue — if they show up in a category's raw rows, they
// stay in that category's output regardless of rank/value. Requested after
// the 28-Jul-2026 run silently skipped Gandhar Oil (below both cutoffs).
const NEVER_FILTER_WATCHLIST_ID = '72e883fd788a4039780be18c';

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
 *
 * Resolution order:
 *   1. NSE ticker lookup (`shared/companyMaster`, sourced from Kite
 *      instruments + reconciled truncation-merge in companyMasterSync.js).
 *   2. BSE scrip-code lookup, when the row carries a numeric scrip code.
 *   3. companyMaster's own normalizeName() on the company/display name —
 *      still returns a good cross-exchange-stable key even when the master
 *      has no ticker/scrip record for this company at all (e.g. RMCL/Radha
 *      Madhav Corp isn't in Kite's instruments dump — verified 2026-07-30 —
 *      so master lookups (1) and (2) both miss it, but normalizeName still
 *      collapses "RADHA MADHAV CORPORATION LIMITED" and "Radha Madhav
 *      Corporation Ltd" to the same key).
 *
 * Returns { key, displaySymbol, companyName, nseTicker, bseTicker }.
 */
function resolveCompanyIdentity({ symbol, company, companyName, exchange }) {
  const name = companyName || company || symbol || '';
  let rec = null;

  if (exchange === 'NSE' && symbol) {
    rec = cmFindByTicker(symbol);
  }
  if (!rec && exchange === 'BSE' && symbol && /^\d+$/.test(String(symbol).trim())) {
    rec = cmFindByScripCode(symbol);
  }
  if (!rec && exchange === 'BSE' && symbol && !/^\d+$/.test(String(symbol).trim())) {
    // BSE bulk/block-deal rows report BSE's own alpha tradingsymbol as
    // `scripname` (e.g. "AQYLON") rather than the numeric scrip code or the
    // full legal name — try that before falling through to name matching.
    rec = cmFindByBseTicker(symbol);
  }
  if (!rec && name) {
    // BSE bulk/block rows key off `scripname` text rather than a numeric
    // scrip code, so neither lookup above fires. Fall back to an EXACT
    // normalized-name match against the master's name index (deliberately
    // exact, not the substring/keyword scan companyMaster's findInText()
    // does elsewhere — a substring match here risks silently merging two
    // unrelated companies whose short normalized names happen to be
    // contained in one another, which would be worse than the missed dedup
    // this whole change is meant to fix).
    try {
      const master = cmLoad();
      rec = master._byNormName.get(cmNormalizeName(name)) || null;
    } catch {
      rec = null;
    }
  }

  const key = rec ? rec.companyId : `NAME:${cmNormalizeName(name)}`;
  const displaySymbol = (rec && (rec.nseTicker || rec.bseTicker)) || symbol || name;

  return {
    key,
    displaySymbol,
    companyName: (rec && rec.companyName) || name,
    nseTicker: rec ? rec.nseTicker : null,
    bseTicker: rec ? rec.bseTicker : null,
  };
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

  // Combine bulk+block before grouping so a desk that crosses a block via
  // one leg in each category is still caught as a same-day Buy+Sell trader.
  const intradayGroups = buildIntradayTraderGroups([...out.bulk, ...out.block]);
  out.bulk = removeIntradayTraders(out.bulk, intradayGroups);
  out.block = removeIntradayTraders(out.block, intradayGroups);
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

      const bseKey = resolveCompanyIdentity({
        symbol: b.Fld_ScripCode,
        companyName: b.Companyname,
        exchange: 'BSE',
      }).key;
      const nseMatch = results.some(
        (r) =>
          r.exchange === 'NSE' &&
          resolveCompanyIdentity({ symbol: r.symbol, companyName: r.company, exchange: 'NSE' })
            .key === bseKey
      );
      if (nseMatch) {
        continue;
      }

      // NOTE: we intentionally do NOT also skip dual-listed-on-NSE symbols
      // here just because isAvailableOnNSE() says the company trades on NSE.
      // That used to be the second dedup gate, on the assumption that any
      // dual-listed company's insider filing would always also show up in
      // the NSE corporates-pit-gg feed the same day. It doesn't: NSE and BSE
      // disclose PIT filings independently and one exchange can legitimately
      // lag or altogether miss a same-day filing the other has (verified
      // 2026-07-30 — Novartis India's ₹1,377cr promoter stake-sale filing
      // was on BSE only; NSE's feed never carried it that day). Gating on
      // isAvailableOnNSE silently dropped the row instead of keeping the one
      // real filing we have. The nseMatch name check above is the only
      // dedup we need: it already skips this row when NSE truly reported the
      // same filing that day.
      // Same "release/revoke of pledge counts toward net value like a buy"
      // rule as the NSE XBRL path above — checked across both the
      // transaction-type and mode fields since BSE splits the signal across
      // Fld_TransactionType ("Revoke") and ModeOfAquisation ("Revocation Of
      // Pledge") depending on the filing.
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
        symbol: b.Companyname || String(b.Fld_ScripCode),
        company: b.Companyname,
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

/**
 * Bare NSE/BSE symbols (no "NSE:"/"BSE:" prefix) of companies on the
 * never-filter watchlist. Fetched once per run; failures degrade to an
 * empty set (never-filter is a safety net, not a hard dependency).
 */
async function getNeverFilterSymbols() {
  try {
    const data = await stockscans.watchlistTable(NEVER_FILTER_WATCHLIST_ID);
    const rows = (data.table || []).slice(1); // row[0] = headers
    return new Set(
      rows.map((r) => String(r[0]).split(':').pop().toUpperCase()).filter(Boolean)
    );
  } catch (e) {
    console.error(`Warning: could not fetch never-filter watchlist: ${e.message}`);
    return new Set();
  }
}

// ── ranking + rendering ───────────────────────────────────────────────────────

async function groupAndTop10ByNetValue(rows, topN = TOP_N, neverFilterSymbols = new Set()) {
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
  allGroups = allGroups.filter(
    (g) =>
      Math.abs(g.netValue) >= 5000000 ||
      neverFilterSymbols.has(String(g.symbol).toUpperCase())
  );
  allGroups.sort(
    (a, b) => Math.abs(b.netValue) - Math.abs(a.netValue)
  );
  const top10 = allGroups.slice(0, topN);

  // Re-add any never-filter symbols that made it past the threshold filter
  // above but fell outside the top-N cutoff — they must remain in the
  // results even if not currently ranked in the top N by value.
  for (const g of allGroups) {
    if (neverFilterSymbols.has(String(g.symbol).toUpperCase()) && !top10.includes(g)) {
      top10.push(g);
    }
  }
  top10.sort(
    (a, b) => Math.abs(b.netValue) - Math.abs(a.netValue)
  );

  await Promise.all(
    top10.map(async (g) => {
      g.deals.sort((a, b) => (b.value ?? -1) - (a.value ?? -1));

      // Only hit NSE's quote API when we actually resolved an NSE ticker for
      // this group — a BSE-only company's scrip code isn't a valid NSE
      // symbol and would just silently 404/catch below anyway.
      let nseData = null;
      if (g.nseTicker) {
        try {
          nseData = await nse.getSymbolData(g.nseTicker);
        } catch { }
      }

      if (nseData?.metaData?.companyName) g.companyName = nseData.metaData.companyName;
      g.marketCap = nseData?.tradeInfo?.totalMarketCap || null;

      // g.companyName already came from companyMaster (resolveCompanyIdentity)
      // when available; only fall through to screener.in scraping when we
      // still don't have a real name (i.e. it fell back to the raw symbol).
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
  ${rowsHtml.length
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
    sast10: await groupAndTop10ByNetValue(sast.rows, topN, neverFilterSymbols),
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

module.exports = {
  main,
  // Exported for verifyDealsDigest.js (the post-run reconciliation script) so
  // it re-derives identity/grouping using the EXACT same rules as the digest
  // itself, instead of a second hand-rolled copy that could silently drift
  // out of sync with real fixes made here.
  resolveCompanyIdentity,
  groupAndTop10ByNetValue,
  getNeverFilterSymbols,
  parseDateArg,
  fmt,
};
