'use strict';

/**
 * Per-period XBRL resolver for quarterly results: NSE first, BSE second, and a
 * clear "not found" so the caller falls back to the PDF path for that period.
 * All I/O goes through injected clients so it is unit-testable and safe to run
 * concurrently (no module-level state; caller passes its own issue log).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { parseXbrl, detectResultFamily, compareFacts } = require('./parse');
const A = require('./resultsAdapter');
const { resolveBseScrip, searchScripIssue } = require('./scrip');

const MONTHS = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
};

/**
 * Convert NSE `30-JUN-2026` / `28-Jul-2026 13:23:53` to ISO date.
 * @param {string} s
 * @returns {string|null}
 */
function nseDateToIso(s) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(String(s || ''));
  if (!m || MONTHS[m[2].toUpperCase()] === undefined) return null;
  const d = new Date(Date.UTC(Number(m[3]), MONTHS[m[2].toUpperCase()], Number(m[1])));
  return d.toISOString().slice(0, 10);
}

/**
 * Milliseconds for an NSE/BSE broadcast timestamp (for choosing the latest revision).
 * @param {string} s
 * @returns {number}
 */
function broadcastMs(s) {
  const iso = nseDateToIso(s);
  if (!iso) {
    const t = Date.parse(String(s || '').replace(/\s+/g, ' '));
    return Number.isNaN(t) ? 0 : t;
  }
  const tm = /(\d{2}):(\d{2}):(\d{2})/.exec(String(s));
  return Date.parse(iso) + (tm ? ((+tm[1] * 60 + +tm[2]) * 60 + +tm[3]) * 1000 : 0);
}

/**
 * Month-end date shifted by whole months.
 * @param {string} iso - `YYYY-MM-DD`
 * @param {number} months
 * @returns {string}
 */
function shiftMonthEnd(iso, months) {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + months + 1, 0)).toISOString().slice(0, 10);
}

/**
 * Quarter-end an NSE row reports for.
 * @param {Object} row
 * @returns {string|null}
 */
const nseRowEnd = (row) => nseDateToIso(row.qe_Date);

/**
 * Best NSE Integrated-Filing row for a period and basis (latest broadcast wins,
 * so revisions supersede originals).
 * @param {Array<Object>} rows
 * @param {string} periodEnd - ISO date.
 * @param {'consolidated'|'standalone'} basis
 * @returns {{row: Object|null, count: number}}
 */
function pickNseRow(rows, periodEnd, basis) {
  const want = basis === 'consolidated' ? 'consolidated' : 'standalone';
  const hits = (rows || []).filter(
    (r) =>
      r.xbrl && nseRowEnd(r) === periodEnd && String(r.consolidated || '').toLowerCase() === want
  );
  hits.sort((a, b) => broadcastMs(b.broadcast_Date) - broadcastMs(a.broadcast_Date));
  return { row: hits[0] || null, count: hits.length };
}

/**
 * Period end from a BSE quarter code (`JQ2026-2027` Jun quarter, `SQ` Sep, `DQ` Dec, `MQ` Mar).
 * Half-year (`SH`) and annual (`MC`) codes return null: they are cumulative rows.
 * @param {string} code
 * @returns {string|null}
 */
function bseQuarterEnd(code) {
  const m = /^(JQ|SQ|DQ|MQ)(\d{4})-(\d{4})$/.exec(String(code || ''));
  if (!m) return null;
  const [, k, a, b] = m;
  if (k === 'JQ') return `${a}-06-30`;
  if (k === 'SQ') return `${a}-09-30`;
  if (k === 'DQ') return `${a}-12-31`;
  return `${b}-03-31`;
}

/**
 * Period end and preference rank for any BSE quarter code. Quarter codes rank 0; half-year (`SH`,
 * `MH`) rank 1 and annual (`MC`) rank 2 are the ONLY rows a half-yearly filer has, so they are
 * used as a fallback when no quarter row exists for the period.
 * @param {string} code
 * @returns {{end: string, rank: number}|null}
 */
function bsePeriod(code) {
  const q = bseQuarterEnd(code);
  if (q) return { end: q, rank: 0 };
  const m = /^(SH|MH|MC)(\d{4})-(\d{4})$/.exec(String(code || ''));
  if (!m) return null;
  const [, k, a, b] = m;
  return k === 'SH'
    ? { end: `${a}-09-30`, rank: 1 }
    : { end: `${b}-03-31`, rank: k === 'MH' ? 1 : 2 };
}

/**
 * Best BSE result-file name for a period/basis. Prefers iXBRL `.html`, then the
 * newest upload.
 * @param {Array<Object>} rows
 * @param {string} periodEnd
 * @param {'consolidated'|'standalone'} basis
 * @returns {{file: string|null, row: Object|null}}
 */
function pickBseFile(rows, periodEnd, basis) {
  const key = basis === 'consolidated' ? 'Consol_XMLName' : 'XMLName';
  const rk = (r) => bsePeriod(r.quarter_code)?.rank ?? 9;
  const hits = (rows || []).filter((r) => bsePeriod(r.quarter_code)?.end === periodEnd && r[key]);
  hits.sort((a, b) => {
    if (rk(a) !== rk(b)) return rk(a) - rk(b);
    const ha = /\.html?$/i.test(a[key]) ? 1 : 0;
    const hb = /\.html?$/i.test(b[key]) ? 1 : 0;
    if (ha !== hb) return hb - ha;
    return Date.parse(b.Fld_CreateDate || 0) - Date.parse(a.Fld_CreateDate || 0);
  });
  return { file: hits[0]?.[key] || null, row: hits[0] || null };
}

/** File-backed text cache under a temp dir (raw filings are re-fetchable; never stored under data/). */
function makeTextCache(dir) {
  const d = dir || path.join(os.tmpdir(), 'xbrl_cache');
  fs.mkdirSync(d, { recursive: true });
  return {
    get(key) {
      const f = path.join(d, crypto.createHash('sha1').update(key).digest('hex'));
      return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
    },
    set(key, text) {
      const f = path.join(d, crypto.createHash('sha1').update(key).digest('hex'));
      fs.writeFileSync(f, text);
    },
  };
}

/**
 * @typedef {Object} LoadedPeriod
 * @property {boolean} ok
 * @property {string} periodEnd
 * @property {'NSE'|'BSE'} [exchange]
 * @property {string} [file]
 * @property {string} [family]
 * @property {Record<string,number>} [is]   Quarter income statement (Rs Cr).
 * @property {Record<string,number>} [cum]  Cumulative income statement.
 * @property {Record<string,number>} [bs]   Balance sheet at period end.
 * @property {Record<string,number>} [cf]   Cash flow (cumulative window).
 * @property {number|null} [cumulativeDays]
 * @property {string} [reason]
 */

/**
 * Resolve the current, prior-quarter and year-ago periods (and the comparative
 * balance sheet when the current filing carries one) from XBRL.
 * @param {Object} o
 * @param {string} o.symbol - NSE symbol.
 * @param {string} [o.quarterEnd] - ISO date; default: latest on NSE.
 * @param {'consolidated'|'standalone'|'auto'} [o.basis='auto']
 * @param {Object} o.nse - NseClient-like (getIntegratedFilings, fetchArchiveXml).
 * @param {Object} o.bse - BseClient-like (getScripCode, getResultXbrlRows, fetchXbrlFile).
 * @param {ReturnType<import('./issues').createIssueLog>} o.issues
 * @param {{get:Function,set:Function}} [o.cache]
 * @param {boolean} [o.crossCheck=true] - Compare NSE vs BSE facts for the current period.
 * @param {string|number} [o.bseScrip] - BSE scrip override; default: `bseScripCode` on the company record, then name search.
 * @param {Function} [o.scripLookup] - test hook replacing the companies.json lookup.
 * @returns {Promise<Object>}
 */
async function resolveResultPeriods({
  symbol,
  quarterEnd,
  basis = 'auto',
  nse,
  bse,
  issues,
  cache = makeTextCache(),
  crossCheck = true,
  bseScrip,
  scripLookup,
}) {
  const log = (i) => issues.add({ symbol, filingType: 'results', ...i });
  let nseRows = [];
  try {
    nseRows = await nse.getIntegratedFilings(symbol, 'Financials', 40);
    // SME-platform names are listed only under index=sme.
    if (!nseRows.length) nseRows = await nse.getIntegratedFilings(symbol, 'Financials', 40, 'sme');
  } catch (e) {
    log({
      category: 'ENDPOINT_CHANGE',
      severity: 'major',
      exchange: 'NSE',
      message: `NSE integrated filings failed: ${e.message}`,
    });
  }
  let bseRows = null;
  const loadBseRows = async () => {
    if (bseRows) return bseRows;
    bseRows = [];
    try {
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
          message: 'BSE scrip code not found for symbol',
        });
      } else {
        bseRows = await bse.getResultXbrlRows(scrip);
      }
    } catch (e) {
      log({
        category: 'ENDPOINT_CHANGE',
        severity: 'major',
        exchange: 'BSE',
        message: `BSE result rows failed: ${e.message}`,
      });
    }
    return bseRows;
  };

  const text = async (kind, key, fn) => {
    const ck = `${kind}:${key}`;
    const hit = cache.get(ck);
    if (hit) return hit;
    const t = await fn();
    if (t) cache.set(ck, t);
    return t;
  };

  const validate = (raw, url, periodEnd, exchange) => {
    const family = detectResultFamily(url);
    const parsed = parseXbrl(raw);
    if (parsed.issues.length && !parsed.facts.length) {
      log({
        category: 'PARSE_ERROR',
        severity: 'major',
        exchange,
        period: periodEnd,
        message: `${exchange} file unparseable: ${parsed.issues[0]}`,
        detail: { url },
      });
      return { ok: false, periodEnd, reason: 'parse-error' };
    }
    if (!A.SUPPORTED_FAMILIES.includes(family)) {
      log({
        category: 'FALLBACK_USED',
        severity: 'info',
        exchange,
        period: periodEnd,
        message: `results family "${family}" not mapped by adapter; using PDF`,
        detail: { url },
      });
      return { ok: false, periodEnd, reason: `unsupported-family:${family}` };
    }
    const c = A.pickContexts(parsed);
    if (c.periodEnd !== periodEnd) {
      log({
        category: 'PARSE_ERROR',
        severity: 'major',
        exchange,
        period: periodEnd,
        message: `file reports period ${c.periodEnd}, expected ${periodEnd}`,
        detail: { url },
      });
      return { ok: false, periodEnd, reason: 'period-mismatch' };
    }
    const is = A.incomeSnapshot(parsed, c.quarter, family);
    if (is.revenue == null || is.pbt == null) {
      log({
        category: 'MISSING_FIELD',
        severity: 'major',
        exchange,
        period: periodEnd,
        message: 'revenue or PBT missing from quarter context',
        detail: { url, have: Object.keys(is) },
      });
      return { ok: false, periodEnd, reason: 'missing-core-fields' };
    }
    const cum = A.incomeSnapshot(parsed, c.cumulative, family);
    const bs = A.balanceSheetSnapshot(parsed, c.instantCur, family);
    const cf = A.cashFlowSnapshot(parsed, c);
    for (const f of A.sumChecks({ is, bs, cf, family })) {
      log({
        category: 'SUM_CHECK',
        severity: f.severity,
        exchange,
        period: periodEnd,
        message: `${f.check}: expected ${f.expected.toFixed(2)}, got ${f.actual.toFixed(2)}`,
        detail: { url },
      });
    }
    const unmapped = A.unmappedElements(parsed, c, family);
    if (unmapped.length) {
      log({
        category: 'UNMAPPED_ELEMENT',
        severity: 'info',
        exchange,
        period: periodEnd,
        message: `${unmapped.length} numeric elements not mapped`,
        detail: { elements: unmapped },
      });
    }
    return {
      ok: true,
      periodEnd,
      exchange,
      file: url,
      family,
      parsed,
      is,
      cum,
      bs: Object.keys(bs).length ? bs : null,
      cf: Object.keys(cf).length ? cf : null,
      cumulativeDays: c.cumulativeDays,
      periodDays: c.periodDays,
    };
  };

  const memo = new Map();
  const loadPeriod = (end, b) => {
    const k = `${end}|${b}`;
    if (!memo.has(k)) memo.set(k, doLoad(end, b));
    return memo.get(k);
  };

  async function doLoad(end, b) {
    let unsupported = null;
    const { row, count } = pickNseRow(nseRows, end, b);
    if (count > 1) {
      log({
        category: 'REVISION',
        severity: 'info',
        exchange: 'NSE',
        period: end,
        message: `${count} NSE filings for ${b}; using latest broadcast`,
      });
    }
    if (row) {
      try {
        const raw = await text('nse', row.xbrl, () => nse.fetchArchiveXml(row.xbrl));
        if (raw) {
          const r = validate(raw, row.xbrl, end, 'NSE');
          if (r.ok) return { ...r, broadcast: row.broadcast_Date };
          if (String(r.reason).startsWith('unsupported-family')) unsupported = r.reason;
        } else {
          log({
            category: 'MISSING_FILING',
            severity: 'major',
            exchange: 'NSE',
            period: end,
            message: 'NSE XBRL file listed but download failed',
            detail: { url: row.xbrl },
          });
        }
      } catch (e) {
        log({
          category: 'PARSE_ERROR',
          severity: 'major',
          exchange: 'NSE',
          period: end,
          message: e.message,
        });
      }
    }
    const rows = await loadBseRows();
    const { file, row: brow } = pickBseFile(rows, end, b);
    if (file) {
      try {
        const raw = await text('bse', file, () => bse.fetchXbrlFile(file));
        if (raw) {
          const r = validate(raw, file, end, 'BSE');
          if (r.ok) return { ...r, broadcast: brow?.DT_TM };
          if (String(r.reason).startsWith('unsupported-family') && !unsupported)
            unsupported = r.reason;
        }
      } catch (e) {
        log({
          category: 'MISSING_FILING',
          severity: 'major',
          exchange: 'BSE',
          period: end,
          message: `BSE XBRL download failed: ${e.message}`,
        });
      }
    }
    if (unsupported) return { ok: false, periodEnd: end, reason: unsupported };
    const other = b === 'consolidated' ? 'standalone' : 'consolidated';
    const otherExists =
      !!pickNseRow(nseRows, end, other).row || !!pickBseFile(rows, end, other).file;
    log({
      category: 'MISSING_FILING',
      severity: 'major',
      period: end,
      message: `no ${b} XBRL for period on NSE or BSE${otherExists ? ` (a ${other} filing exists: basis mismatch)` : ''}`,
    });
    return { ok: false, periodEnd: end, reason: otherExists ? 'basis-mismatch' : 'not-found' };
  }

  // Latest quarter end when not given.
  let qEnd = quarterEnd;
  if (!qEnd) {
    const ends = nseRows.map(nseRowEnd).filter(Boolean).sort();
    qEnd = ends[ends.length - 1] || null;
    if (!qEnd) {
      const rows = await loadBseRows();
      const bends = rows
        .map((r) => bsePeriod(r.quarter_code)?.end || null)
        .filter(Boolean)
        .sort();
      qEnd = bends[bends.length - 1] || null;
    }
  }
  if (!qEnd) {
    log({
      category: 'MISSING_FILING',
      severity: 'major',
      message: 'no results XBRL found on NSE or BSE for any period',
    });
    return {
      symbol,
      quarterEnd: null,
      basis: null,
      cur: { ok: false, reason: 'not-found' },
      qoq: null,
      yoy: null,
      bsComparative: null,
    };
  }

  let useBasis = basis;
  let cur;
  if (basis === 'auto') {
    cur = await loadPeriod(qEnd, 'consolidated');
    useBasis = 'consolidated';
    if (!cur.ok && !String(cur.reason).startsWith('unsupported-family')) {
      cur = await loadPeriod(qEnd, 'standalone');
      useBasis = 'standalone';
    }
  } else {
    cur = await loadPeriod(qEnd, basis);
  }

  if (!cur.ok) {
    return {
      symbol,
      quarterEnd: qEnd,
      basis: useBasis,
      cur,
      qoq: null,
      yoy: null,
      bsComparative: null,
      exchangeCheck: null,
    };
  }
  // Half-yearly filers: the "sequential" comparative is the previous half, not the previous quarter.
  const step = cur.ok && cur.periodDays > 150 ? 6 : 3;
  if (step === 6)
    log({
      category: 'PERIODICITY',
      severity: 'info',
      period: qEnd,
      message:
        'company files half-yearly results; sequential comparative is the previous half-year',
    });
  const qoq = await loadPeriod(shiftMonthEnd(qEnd, -step), useBasis);
  const yoy = await loadPeriod(shiftMonthEnd(qEnd, -12), useBasis);

  let bsComparative = null;
  if (cur.ok && cur.bs) {
    const month = Number(qEnd.slice(5, 7));
    const back = month === 3 ? -12 : month === 9 ? -6 : null;
    if (back) bsComparative = await loadPeriod(shiftMonthEnd(qEnd, back), useBasis);
  }

  // NSE-vs-BSE agreement on the current period.
  let exchangeCheck = null;
  if (crossCheck && cur.ok) {
    const rows = await loadBseRows();
    const other =
      cur.exchange === 'NSE'
        ? pickBseFile(rows, qEnd, useBasis).file
        : pickNseRow(nseRows, qEnd, useBasis).row?.xbrl;
    if (other) {
      try {
        const raw =
          cur.exchange === 'NSE'
            ? await text('bse', other, () => bse.fetchXbrlFile(other))
            : await text('nse', other, () => nse.fetchArchiveXml(other));
        if (raw) {
          const o = parseXbrl(raw);
          // Compare by period window, not context id: the two exchanges (and filers) name contexts
          // differently and a half-yearly filing's "OneD" is 6 months while BSE's may be 3.
          const win = (p) => {
            const m = new Map();
            for (const [id, c] of Object.entries(p.contexts || {}))
              if (!c.hasDimensions) m.set(id, c.instant || `${c.start}>${c.end}`);
            return m;
          };
          const wa = win(cur.parsed);
          const wb = win(o);
          const common = new Set([...wa.values()].filter((w) => [...wb.values()].includes(w)));
          const remap = (p, w) =>
            p.facts
              .filter((f) => w.has(f.ctx) && common.has(w.get(f.ctx)))
              .map((f) => ({ ...f, ctx: w.get(f.ctx) }));
          const cmp = compareFacts(remap(cur.parsed, wa), remap(o, wb));
          if (!common.size)
            log({
              category: 'EXCHANGE_DISAGREE',
              severity: 'minor',
              period: qEnd,
              message: 'NSE and BSE files share no period window; cross-check skipped',
            });
          exchangeCheck = {
            matched: cmp.matched,
            differing: cmp.differing.length,
            onlyPrimary: cmp.onlyA.length,
            onlySecondary: cmp.onlyB.length,
          };
          // BSE files are often rounded (Rs 0.01-0.1 Cr). A gap within rounding is noise, not a disagreement.
          const isRounding = (d) => {
            const gapAbs = Math.abs(d.a - d.b);
            return gapAbs <= 1e6 || gapAbs <= 0.005 * Math.max(Math.abs(d.a), Math.abs(d.b));
          };
          const material = cmp.differing.filter((d) => !isRounding(d));
          const rounding = cmp.differing.length - material.length;
          // Ratio of exactly 10^k (k != 0) means a units/scale error in one filing, not a restatement.
          const isPow10 = (d) => {
            if (!d.a || !d.b) return false;
            const k = Math.log10(Math.abs(d.a / d.b));
            return Math.abs(k) >= 1 && Math.abs(k - Math.round(k)) < 0.005;
          };
          const scaleErrors = material.filter(isPow10).length;
          if (material.length) {
            log({
              category: 'EXCHANGE_DISAGREE',
              severity: 'major',
              period: qEnd,
              message:
                `${material.length} facts differ between NSE and BSE` +
                (scaleErrors
                  ? ` (${scaleErrors} differ by an exact power of 10: likely a units/scale error in one filing; verify against the PDF)`
                  : ''),
              detail: { sample: material.slice(0, 8), roundingOnly: rounding },
            });
          } else if (rounding) {
            log({
              category: 'EXCHANGE_DISAGREE',
              severity: 'info',
              period: qEnd,
              message: `${rounding} facts differ only by rounding between NSE and BSE`,
            });
          }
          // BSE files never carry the OtherComprehensiveIncome aggregate (seen in ~1,600 of ~1,900 runs): a known
          // structural asymmetry, not a gap worth a per-company issue.
          const benign = (k) => /^OtherComprehensiveIncome\|/.test(k);
          const onlyA = cmp.onlyA.filter((k) => !benign(k));
          const onlyB = cmp.onlyB.filter((k) => !benign(k));
          const gap = onlyA.length + onlyB.length;
          if (gap) {
            log({
              category: 'MISSING_FIELD',
              severity: 'minor',
              period: qEnd,
              message: `${gap} facts present on only one exchange`,
              detail: { onlyPrimary: onlyA.slice(0, 10), onlySecondary: onlyB.slice(0, 10) },
            });
          }
        }
      } catch (e) {
        log({
          category: 'ENDPOINT_CHANGE',
          severity: 'minor',
          period: qEnd,
          message: `cross-exchange check skipped: ${e.message}`,
        });
      }
    }
  }

  // Strip heavy parsed docs from returned periods.
  const slim = (p) => {
    if (!p || !p.ok) return p;
    const { parsed, ...rest } = p; // eslint-disable-line no-unused-vars
    return rest;
  };
  return {
    symbol,
    quarterEnd: qEnd,
    basis: useBasis,
    cur: slim(cur),
    qoq: slim(qoq),
    yoy: slim(yoy),
    bsComparative: slim(bsComparative),
    exchangeCheck,
  };
}

module.exports = {
  resolveResultPeriods,
  nseDateToIso,
  shiftMonthEnd,
  pickNseRow,
  pickBseFile,
  bseQuarterEnd,
  bsePeriod,
  makeTextCache,
  broadcastMs,
};
