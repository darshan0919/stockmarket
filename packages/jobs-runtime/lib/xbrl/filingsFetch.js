'use strict';

/**
 * Fetch + parse series of non-results XBRL filings (shareholding, voting
 * results, governance, insider trading) for a symbol. NSE first, BSE second;
 * when both fail the caller gets an empty series and the issue log says why,
 * so the calling skill can fall back to reading the PDF. All I/O is injected.
 */

const { parseXbrl } = require('./parse');
const F = require('./filings');
const { resolveBseScrip, searchScripIssue } = require('./scrip');
const { makeTextCache, nseDateToIso } = require('./resultsResolver');

/** BSE `GetCorXbrlDetails_ng/w` category flags (names inferred from file prefixes and element domains). */
const BSE_FLAGS = Object.freeze({ pit: 1, voting: 6, governance: 8, shareholding: 23, brsr: 43 });

const PARSERS = {
  shareholding: F.parseShareholding,
  voting: F.parseVotingResults,
  governance: F.parseGovernance,
  pit: F.parsePit,
  brsr: F.parseBrsr,
};

const isoOrNull = (s) =>
  nseDateToIso(s) || (/^\d{4}-\d{2}-\d{2}/.test(String(s || '')) ? String(s).slice(0, 10) : null);

/**
 * DD-MM-YYYY -> BSE `YYYY/M/D` for the day AFTER (BSE's todate is exclusive of that day's timestamps),
 * capped at today (IST): a future todate makes the endpoint return nothing at all.
 * @param {string} ddmmyyyy
 * @param {Date} [now]
 */
function bseDayAfter(ddmmyyyy, now = new Date()) {
  const [d, m, y] = ddmmyyyy.split('-').map(Number);
  const after = Date.UTC(y, m - 1, d + 1);
  const ist = new Date(now.getTime() + 5.5 * 3600000);
  const today = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  const t = new Date(Math.min(after, today));
  return `${t.getUTCFullYear()}/${t.getUTCMonth() + 1}/${t.getUTCDate()}`;
}

/** Normalise NSE rows of each kind to `{url, ref, broadcast}` newest first. */
function nseItems(kind, rows) {
  const out = [];
  for (const r of rows || []) {
    if (kind === 'shareholding' && r.xbrl)
      out.push({ url: r.xbrl, ref: isoOrNull(r.date), broadcast: r.broadcastDate });
    else if (kind === 'voting' && r.metadata?.vrXbrlFilename)
      out.push({
        url: r.metadata.vrXbrlFilename,
        ref: isoOrNull(r.metadata.vrTimestamp),
        broadcast: r.metadata.vrbroadcastDt,
      });
    else if (kind === 'governance' && r.xbrl)
      out.push({ url: r.xbrl, ref: isoOrNull(r.qe_Date), broadcast: r.broadcast_Date });
    else if (kind === 'pit' && r.xmlFileName)
      out.push({
        url: r.xmlFileName,
        ref: isoOrNull(r.broadcastDateTime),
        broadcast: r.broadcastDateTime,
      });
    else if (kind === 'brsr' && r.xbrlFile)
      out.push({ url: r.xbrlFile, ref: String(r.fyTo || ''), broadcast: r.submissionDate });
  }
  return out;
}

/** Normalise BSE index rows (prefer iXBRL/XML, newest first). */
function bseItems(rows) {
  return (rows || [])
    .filter((r) => r.xbrlurl)
    .map((r) => ({ url: r.xbrlurl, ref: isoOrNull(r.xbrldate), broadcast: r.xbrldate }));
}

/**
 * @param {Object} o
 * @param {'shareholding'|'voting'|'governance'|'pit'} o.kind
 * @param {string} o.symbol
 * @param {number} [o.limit=4]
 * @param {string} [o.from] - DD-MM-YYYY (pit only)
 * @param {string} [o.to] - DD-MM-YYYY (pit only)
 * @param {Object} o.nse - NseClient-like
 * @param {Object} o.bse - BseClient-like
 * @param {ReturnType<import('./issues').createIssueLog>} o.issues
 * @param {{get:Function,set:Function}} [o.cache]
 * @param {string|number} [o.bseScrip] - BSE scrip override (default: stored on the company record, then name search).
 * @param {Function} [o.scripLookup] - test hook replacing the companies.json lookup.
 * @returns {Promise<{kind:string, symbol:string, exchange:('NSE'|'BSE'|null), items:Array<Object>}>}
 */
async function fetchFilingSeries({
  kind,
  symbol,
  limit = 4,
  from,
  to,
  nse,
  bse,
  issues,
  cache = makeTextCache(),
  bseScrip,
  scripLookup,
}) {
  const log = (i) => issues.add({ symbol, filingType: kind, ...i });
  const parser = PARSERS[kind];
  if (!parser) throw new Error(`Unsupported filing kind: ${kind}`);

  const load = async (exchange, item) => {
    const key = `${exchange}:${item.url}`;
    let raw = cache.get(key);
    if (!raw) {
      raw =
        exchange === 'NSE'
          ? await nse.fetchArchiveXml(item.url)
          : await bse.fetchXbrlFile(item.url);
      if (raw) cache.set(key, raw);
    }
    if (!raw) {
      log({
        category: 'MISSING_FILING',
        severity: 'major',
        exchange,
        message: 'XBRL file listed but download failed',
        detail: { url: item.url },
      });
      return null;
    }
    const parsed = parseXbrl(raw);
    if (!parsed.facts.length && !(parsed.textList || []).length) {
      log({
        category: 'PARSE_ERROR',
        severity: 'major',
        exchange,
        message: parsed.issues[0] || 'empty parse',
        detail: { url: item.url },
      });
      return null;
    }
    const dto = parser(parsed);
    if (!dto.ok) {
      log({
        category: 'PARSE_ERROR',
        severity: 'major',
        exchange,
        message: `${kind} parser: ${dto.reason}`,
        detail: { url: item.url },
      });
      return null;
    }
    return { ...item, exchange, dto };
  };

  const fetchFrom = async (exchange) => {
    let items = [];
    try {
      if (exchange === 'NSE') {
        // SME-platform names are listed only under index=sme: try equities, then sme.
        const both = async (fn) => {
          const eq = await fn('equities');
          return eq && eq.length ? eq : fn('sme');
        };
        let rows;
        if (kind === 'shareholding')
          rows = await both((ix) => nse.getShareholdingFilings(symbol, ix));
        else if (kind === 'voting')
          rows = await both((ix) => nse.getVotingResultFilings(symbol, ix));
        else if (kind === 'governance')
          rows = await both((ix) => nse.getIntegratedFilings(symbol, 'Governance', 10, ix));
        else if (kind === 'brsr') rows = await both((ix) => nse.getBrsrFilings(symbol, ix));
        else
          rows = (await nse.getInsiderFilings(from, to)).filter(
            (r) => String(r.symbol).toUpperCase() === symbol
          );
        items = nseItems(kind, rows);
      } else {
        const { scrip, source } = await resolveBseScrip({
          symbol,
          bseScrip,
          bse,
          lookup: scripLookup,
        });
        if (source === 'search') log(searchScripIssue(symbol, scrip));
        if (!scrip) {
          log({
            category: 'MISSING_FILING',
            severity: 'minor',
            exchange: 'BSE',
            message: 'BSE scrip code not found',
          });
          return [];
        }
        const y = new Date();
        const toS = `${y.getFullYear()}/${y.getMonth() + 1}/${y.getDate()}`;
        const fromS =
          kind === 'pit' && from
            ? from.split('-').reverse().map(Number).join('/')
            : `${y.getFullYear() - 3}/1/1`;
        items = bseItems(
          await bse.getXbrlFilings(
            BSE_FLAGS[kind],
            fromS,
            kind === 'pit' && to ? bseDayAfter(to) : toS,
            scrip
          )
        );
      }
    } catch (e) {
      log({
        category: 'ENDPOINT_CHANGE',
        severity: 'major',
        exchange,
        message: `${exchange} ${kind} listing failed: ${e.message}`,
      });
      return [];
    }
    items.sort(
      (a, b) =>
        (b.ref || '').localeCompare(a.ref || '') ||
        String(b.broadcast).localeCompare(String(a.broadcast))
    );
    const seen = new Set();
    const uniq = items.filter((i) => (seen.has(i.url) ? false : seen.add(i.url)));
    const out = [];
    for (const it of uniq.slice(0, limit)) {
      const r = await load(exchange, it);
      if (r) out.push(r);
    }
    return out;
  };

  let items = await fetchFrom('NSE');
  let exchange = items.length ? 'NSE' : null;
  if (!items.length) {
    items = await fetchFrom('BSE');
    exchange = items.length ? 'BSE' : null;
    if (items.length)
      log({
        category: 'FALLBACK_USED',
        severity: 'info',
        message: `${kind} taken from BSE (NSE empty or failed)`,
      });
  }
  if (!items.length)
    log({
      category: 'MISSING_FILING',
      severity: 'major',
      message: `no ${kind} XBRL on NSE or BSE; read the PDF instead`,
    });
  return { kind, symbol, exchange, items };
}

module.exports = { fetchFilingSeries, BSE_FLAGS, nseItems, bseItems, bseDayAfter };
