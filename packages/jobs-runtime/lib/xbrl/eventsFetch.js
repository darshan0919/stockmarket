'use strict';

/**
 * Fetch + parse Reg-30 event XBRL for one company. NSE first (director/KMP changes, resignations, auditor
 * resignations are the only event families NSE publishes as XBRL), BSE for those families when NSE is empty
 * and for every other event family (orders, litigation, ratings, board meetings, analyst meets, ...).
 */

const { parseXbrl } = require('./parse');
const { makeTextCache } = require('./resultsResolver');
const { resolveBseScrip, searchScripIssue } = require('./scrip');
const { bseDayAfter } = require('./filingsFetch');
const {
  EVENT_KINDS,
  FLAG_TO_KIND,
  NSE_SUBJECT_TO_KIND,
  parseEvent,
  normDate,
} = require('./events');

const DEFAULT_WINDOW_DAYS = 90;

const pad = (n) => String(n).padStart(2, '0');
const toDmy = (d) => `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
const dmyToDate = (s) => {
  const [d, m, y] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
/** DD-MM-YYYY -> BSE `YYYY/M/D`. */
const bseDay = (dmy) => dmy.split('-').reverse().map(Number).join('/');
const isoFromBroadcast = (s) => {
  const t = String(s || '');
  const iso = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const m = t.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})/);
  if (!m) return null;
  const mon = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ].indexOf(m[2].toLowerCase());
  return mon < 0 ? null : `${m[3]}-${pad(mon + 1)}-${m[1]}`;
};

/** BSE `xbrlurl` (`/XBRLFILES/<name>`, any case) -> the name `fetchXbrlFile` expects. */
const bseName = (u) => String(u).replace(/^\/?xbrlfiles\//i, '');

/**
 * @param {Object} o
 * @param {string} o.symbol
 * @param {string[]} [o.kinds] keys of EVENT_KINDS; default all.
 * @param {string} [o.from] DD-MM-YYYY; default `to` minus 90 days.
 * @param {string} [o.to] DD-MM-YYYY; default today.
 * @param {number} [o.limit=10] per kind.
 * @param {Object} o.nse - NseClient-like (getXbrlAnnouncements, fetchArchiveXml).
 * @param {Object} o.bse - BseClient-like (getScripCode, getXbrlFilings, fetchXbrlFile).
 * @param {ReturnType<import('./issues').createIssueLog>} o.issues
 * @param {{get:Function,set:Function}} [o.cache]
 * @param {string|number} [o.bseScrip]
 * @param {Function} [o.scripLookup]
 * @returns {Promise<{symbol:string, from:string, to:string, kinds:Record<string,{exchange:string|null,items:Array<Object>}>}>}
 */
async function fetchEventSeries({
  symbol,
  kinds,
  from,
  to,
  limit = 10,
  nse,
  bse,
  issues,
  cache = makeTextCache(),
  bseScrip,
  scripLookup,
}) {
  const log = (i) => issues.add({ symbol, filingType: 'events', ...i });
  const wanted = (kinds && kinds.length ? kinds : Object.keys(EVENT_KINDS)).filter((k) => {
    if (EVENT_KINDS[k]) return true;
    log({
      category: 'MISSING_FIELD',
      severity: 'minor',
      message: `unknown event kind "${k}" ignored`,
    });
    return false;
  });
  const toDmyStr = to || toDmy(new Date());
  const fromDmyStr =
    from || toDmy(new Date(dmyToDate(toDmyStr).getTime() - DEFAULT_WINDOW_DAYS * 86400000));

  const fromIso = normDate(fromDmyStr);
  const toIso = normDate(toDmyStr);

  const load = async (exchange, kind, item) => {
    const key = `${exchange}:${item.url}`;
    let raw = cache.get(key);
    if (!raw) {
      try {
        // NSE's archive fetch swallows errors and returns null under throttling: retry before calling it missing.
        const get = () =>
          exchange === 'NSE' ? nse.fetchArchiveXml(item.url) : bse.fetchXbrlFile(item.url);
        raw = await get();
        for (let n = 1; !raw && n <= 2; n++) {
          await new Promise((r) => setTimeout(r, 1500 * n));
          raw = await get();
        }
      } catch (e) {
        raw = null;
        log({
          category: 'MISSING_FILING',
          severity: 'major',
          exchange,
          message: `${kind} file download failed: ${e.message}`,
          detail: { url: item.url },
        });
        return null;
      }
      if (raw) cache.set(key, raw);
    }
    if (!raw) {
      log({
        category: 'MISSING_FILING',
        severity: 'major',
        exchange,
        message: `${kind} XBRL listed but download failed`,
        detail: { url: item.url },
      });
      return null;
    }
    const ev = parseEvent(parseXbrl(raw), kind);
    if (!ev.ok) {
      log({
        category: 'PARSE_ERROR',
        severity: 'major',
        exchange,
        message: `${kind} event parse: ${ev.reason}`,
        detail: { url: item.url },
      });
      return null;
    }
    return { ...item, exchange, ...ev, ref: ev.ref || item.ref };
  };

  // ---- NSE: one listing call covers all three families.
  const nseByKind = {};
  const nseKinds = wanted.filter((k) => EVENT_KINDS[k].nseSubjects);
  if (nseKinds.length) {
    const rows = [];
    for (const index of ['equities', 'sme']) {
      try {
        rows.push(
          ...(await nse.getXbrlAnnouncements({
            symbol,
            fromDate: fromDmyStr,
            toDate: toDmyStr,
            index,
          }))
        );
        if (rows.length) break;
      } catch (e) {
        log({
          category: 'ENDPOINT_CHANGE',
          severity: 'major',
          exchange: 'NSE',
          message: `NSE XBRL-announcements (${index}) failed: ${e.message}`,
        });
      }
    }
    for (const r of rows) {
      const kind = NSE_SUBJECT_TO_KIND[r.subject];
      if (!kind || !nseKinds.includes(kind)) continue;
      if (String(r.symbol).toUpperCase() !== String(symbol).toUpperCase()) continue;
      // Resignation rows attach a ZIP of PDFs; the iXBRL HTML carries the structured data.
      const url = /\.xml$/i.test(r.attachment || '') ? r.attachment : r.ixbrl || null;
      if (!url) continue;
      (nseByKind[kind] = nseByKind[kind] || []).push({
        url,
        ref: isoFromBroadcast(r.broadcastDateTime),
        broadcast: r.broadcastDateTime,
        revision: r.revision || r.typeOfAnn || null,
      });
    }
  }

  // ---- BSE: resolved lazily, once.
  let scripInfo = null;
  const getScrip = async () => {
    if (scripInfo) return scripInfo;
    scripInfo = await resolveBseScrip({ symbol, bseScrip, bse, lookup: scripLookup });
    if (scripInfo.source === 'search') log(searchScripIssue(symbol, scripInfo.scrip));
    if (!scripInfo.scrip)
      log({
        category: 'MISSING_FILING',
        severity: 'minor',
        exchange: 'BSE',
        message: 'BSE scrip code not found; BSE-only event kinds unavailable',
      });
    return scripInfo;
  };
  const bseItemsFor = async (kind) => {
    const { scrip } = await getScrip();
    if (!scrip) return [];
    const out = [];
    for (const flag of EVENT_KINDS[kind].flags) {
      try {
        const rows = await bse.getXbrlFilings(
          flag,
          bseDay(fromDmyStr),
          bseDayAfter(toDmyStr),
          scrip
        );
        for (const r of rows || []) {
          if (!r.xbrlurl || String(r.scripcode) !== String(scrip)) continue;
          out.push({
            url: bseName(r.xbrlurl),
            ref: isoFromBroadcast(r.xbrldate),
            broadcast: r.xbrldate || null,
            flag,
          });
        }
      } catch (e) {
        log({
          category: 'ENDPOINT_CHANGE',
          severity: 'major',
          exchange: 'BSE',
          message: `BSE ${kind} (flag ${flag}) listing failed: ${e.message}`,
        });
      }
    }
    return out;
  };

  const result = {};
  for (const kind of wanted) {
    let exchange = null;
    let items = nseByKind[kind] || [];
    if (items.length) exchange = 'NSE';
    else {
      items = await bseItemsFor(kind);
      if (items.length) {
        exchange = 'BSE';
        if (EVENT_KINDS[kind].nseSubjects)
          log({
            category: 'FALLBACK_USED',
            severity: 'info',
            exchange: 'BSE',
            message: `${kind} taken from BSE (NSE had none in the window)`,
          });
      }
    }
    const seen = new Set();
    // Some BSE flags (e.g. 45 orders) ignore the date window, so enforce it on the broadcast date here.
    const inWindow = (i) => !i.ref || (i.ref >= fromIso && i.ref <= toIso);
    const uniq = items
      .filter(inWindow)
      .filter((i) => (seen.has(i.url) ? false : seen.add(i.url)))
      .sort((a, b) => String(b.ref || '').localeCompare(String(a.ref || '')))
      .slice(0, limit);
    const loaded = [];
    for (const it of uniq) {
      const r = await load(exchange, kind, it);
      if (r) {
        if (
          exchange === 'BSE' &&
          r.company?.scrip &&
          scripInfo?.scrip &&
          String(r.company.scrip) !== String(scripInfo.scrip)
        )
          log({
            category: 'EXCHANGE_DISAGREE',
            severity: 'minor',
            exchange: 'BSE',
            message: `${kind}: file scrip ${r.company.scrip} differs from requested ${scripInfo.scrip} (filed about a subsidiary/related entity, or a wrong-company row: check)`,
            detail: { url: it.url },
          });
        loaded.push(r);
      }
    }
    result[kind] = { exchange, items: loaded };
  }
  return { symbol, from: fromDmyStr, to: toDmyStr, kinds: result };
}

module.exports = { fetchEventSeries, bseName, isoFromBroadcast, normDate, FLAG_TO_KIND };
