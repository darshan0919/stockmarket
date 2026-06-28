#!/usr/bin/env node
'use strict';

/**
 * Insight Validator — Node port of insight_validator.py.
 *
 * Daily companion to watchlistInsights.js: validates the morning's insights against
 * the SAME day's STRUCTURAL (delivery-backed) price action, appends a ledger, and
 * PROPOSES (never auto-applies) refinements to the per-category insight prompts.
 *
 * All upstream access goes through @stock/api: NSE delivery bhavcopy via NseClient
 * (price-action); live Returns 1D + the sector universe via StockscansClient.
 *
 * Commands: run | fetch-delivery [DDMMYYYY] | score <SYMBOL> | show-ledger
 */

const fs = require('fs');
const path = require('path');
const { nse, stockscans } = require('@stock/api');
const { sendHtmlEmail } = require('./lib/emailService');
const { NotesDb } = require('./lib/notesDb');
const { loadEnv, argValue } = require('./lib/env');
const ist = require('./lib/ist');

// ── Paths & config ────────────────────────────────────────────────────────────
const DATA_DIR = process.env.WI_DATA_DIR || process.cwd();
const NOTES_DIR = process.env.WI_NOTES_DIR || path.join(DATA_DIR, 'notes');
const CACHE_DIR = process.env.IV_CACHE_DIR || path.join(DATA_DIR, 'delivery_cache');
const VAL_DIR = process.env.WI_VALIDATION_DIR || path.join(DATA_DIR, 'validation');
const LEDGER_PATH = path.join(VAL_DIR, 'ledger.json');
const PROPOSALS_PATH = path.join(VAL_DIR, 'proposals.md');

const EQUITY_SERIES = new Set(['EQ', 'BE', 'BZ', 'SM', 'ST']);
const BASELINE_DAYS = 20;
const WATCHLISTS = ['0a365ec2139aa6ca7f74c250', '7ca0e1a60c3fd0d8b1ab61ce'];

const SECTOR_MCAP_FLOOR = 300;
const SECTOR_MAX_PAGES = 45;
const IND_MIN_N = 5;
const SEC_MIN_N = 8;
const SECTOR_MOVE_MIN = 1.5;

const MOVE_MIN = 2.0;
const TURNOVER_FLOOR_L = 200.0;

// ── small helpers ─────────────────────────────────────────────────────────────
const round = (x, n) => {
  if (x === null || x === undefined || Number.isNaN(x)) return null;
  const f = 10 ** n;
  return Math.round(x * f) / f;
};

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function toSymbol(companyId) {
  if (!companyId || !companyId.includes(':')) return companyId || null;
  const [exch, sym] = companyId.split(/:(.+)/);
  if (exch.toUpperCase() !== 'NSE') return null;
  return sym.trim().toUpperCase();
}

/** DDMMYYYY for a Date (UTC fields). */
function ddmmyyyy(date) {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${d}${m}${date.getUTCFullYear()}`;
}

/** Date (UTC midnight) from an ISO yyyy-mm-dd. */
function dateFromIso(isoDay) {
  return new Date(`${isoDay}T00:00:00Z`);
}

// ── NSE delivery (bhavdata) ───────────────────────────────────────────────────

/** Fetch the delivery CSV for a Date, using a local disk cache. null if unpublished. */
async function fetchDeliveryCsv(date, client = nse) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cache = path.join(CACHE_DIR, `sec_bhavdata_full_${ddmmyyyy(date)}.csv`);
  if (fs.existsSync(cache) && fs.statSync(cache).size > 1000) return fs.readFileSync(cache, 'utf8');
  const text = await client.getDeliveryBhavcopy(ddmmyyyy(date));
  if (text) fs.writeFileSync(cache, text);
  return text;
}

/** Parse bhavdata CSV → { SYMBOL: { ret, deliv_per, deliv_qty, trd_qty, turnover, trades, close } }. */
function parseDelivery(csvText) {
  const out = {};
  const lines = csvText.split(/\r?\n/);
  if (!lines.length) return out;
  const header = lines[0].split(',').map((h) => h.trim());
  const idx = {};
  header.forEach((c, i) => { idx[c] = i; });
  const g = (row, key) => (key in idx && idx[key] < row.length ? row[idx[key]].trim() : '');
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const row = lines[i].split(',');
    const series = g(row, 'SERIES');
    if (!EQUITY_SERIES.has(series)) continue;
    const sym = g(row, 'SYMBOL');
    const prev = parseFloat(g(row, 'PREV_CLOSE'));
    const close = parseFloat(g(row, 'CLOSE_PRICE'));
    const trd = parseFloat(g(row, 'TTL_TRD_QNTY'));
    const dq = parseFloat(g(row, 'DELIV_QTY') || '0');
    const dper = parseFloat(g(row, 'DELIV_PER') || '0');
    const turn = parseFloat(g(row, 'TURNOVER_LACS') || '0');
    const trades = parseFloat(g(row, 'NO_OF_TRADES') || '0');
    if ([prev, close, trd].some((x) => Number.isNaN(x))) continue;
    if (Number.isNaN(dq) || Number.isNaN(dper) || Number.isNaN(turn) || Number.isNaN(trades)) continue;
    out[sym] = {
      ret: prev ? ((close - prev) / prev) * 100 : 0.0,
      deliv_per: dper, deliv_qty: dq, trd_qty: trd, turnover: turn, trades, close,
    };
  }
  return out;
}

/** Up to n+6 weekday dates strictly before `end`. */
function recentTradingDays(end, n) {
  const days = [];
  const d = new Date(end.getTime());
  d.setUTCDate(d.getUTCDate() - 1);
  while (days.length < n + 6 && Math.round((end - d) / 86400000) < n + 14) {
    const wd = d.getUTCDay();
    if (wd >= 1 && wd <= 5) days.push(new Date(d.getTime()));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return days;
}

/** Trailing averages of traded/delivery qty + delivery % per symbol. */
async function buildBaselines(symbols, end, n = BASELINE_DAYS, client = nse) {
  const acc = {};
  for (const s of symbols) acc[s] = { trd: [], dq: [], dper: [] };
  let got = 0;
  for (const d of recentTradingDays(end, n + 8)) {
    if (got >= n) break;
    const csv = await fetchDeliveryCsv(d, client);
    if (!csv) continue;
    const day = parseDelivery(csv);
    got += 1;
    for (const s of symbols) {
      if (day[s]) {
        acc[s].trd.push(day[s].trd_qty);
        acc[s].dq.push(day[s].deliv_qty);
        acc[s].dper.push(day[s].deliv_per);
      }
    }
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0.0);
  const base = {};
  for (const [s, v] of Object.entries(acc)) {
    base[s] = { avg_trd: avg(v.trd), avg_dq: avg(v.dq), avg_dper: avg(v.dper), days: v.trd.length };
  }
  return base;
}

// ── Structural strength scoring ───────────────────────────────────────────────
function structuralSignal(day, base) {
  const ret = day.ret;
  const dper = day.deliv_per;
  const volSpike = base.avg_trd ? day.trd_qty / base.avg_trd : null;
  const delivSpike = base.avg_dq ? day.deliv_qty / base.avg_dq : null;
  const dperVsAvg = base.avg_dper ? dper - base.avg_dper : null;
  const conviction = ret * (dper / 100.0);

  const bigMove = Math.abs(ret) >= MOVE_MIN;
  const liquid = day.turnover >= TURNOVER_FLOOR_L;
  const volConf = volSpike !== null && volSpike >= 2.0;
  const volSoft = volSpike !== null && volSpike >= 1.5;
  const delivConf = (dperVsAvg !== null && dperVsAvg >= 0) || dper >= 55;
  const delivSoft = (dperVsAvg !== null && dperVsAvg >= -5) || dper >= 45;

  let label;
  if (bigMove && liquid && volConf && delivConf) label = 'STRONG';
  else if (bigMove && liquid && volSoft && delivSoft) label = 'MODERATE';
  else if (bigMove && !delivSoft && !volSoft) label = 'NOISE';
  else label = 'WEAK';

  return {
    ret: round(ret, 2), deliv_per: round(dper, 1),
    vol_spike: volSpike !== null ? round(volSpike, 2) : null,
    deliv_spike: delivSpike !== null ? round(delivSpike, 2) : null,
    dper_vs_avg: dperVsAvg !== null ? round(dperVsAvg, 1) : null,
    conviction: round(conviction, 2),
    turnover_lacs: round(day.turnover, 0),
    label,
    baseline_days: base.days || 0,
  };
}

function verdict(significance, label) {
  const strong = label === 'STRONG' || label === 'MODERATE';
  if (label === 'NOISE') return 'noise_move';
  if (significance === 'high') return strong ? 'confirmed' : 'overrated';
  if (significance === 'medium') return strong ? 'confirmed' : 'soft';
  return label === 'STRONG' ? 'underrated' : 'confirmed';
}

// ── Sector attribution ────────────────────────────────────────────────────────
function sectorAttribution(stockRet, companyId, ctx) {
  if (stockRet === null || stockRet === undefined || !ctx || !Object.keys(ctx).length) {
    return {
      reference: null, ref_move: null, excess: null, industry_1d: null, sector_1d: null,
      market_1d: ctx ? ctx.market_median_1d : null, label: 'no_context',
    };
  }
  const comp = (ctx.companies || {})[companyId] || {};
  const ind = comp.industry || '';
  const sec = comp.sector || '';
  const indM = (ctx.industry || {})[ind];
  const secM = (ctx.sector || {})[sec];
  const mkt = ctx.market_median_1d ?? null;

  let refMove = null;
  let reference = null;
  if (indM && indM.n >= IND_MIN_N) { refMove = indM.median; reference = `industry:${ind}`; }
  else if (secM && secM.n >= SEC_MIN_N) { refMove = secM.median; reference = `sector:${sec}`; }
  else if (mkt !== null) { refMove = mkt; reference = 'market'; }

  let label;
  let excess = null;
  if (refMove === null) {
    label = 'no_context';
  } else {
    excess = stockRet - refMove;
    const bigSector = Math.abs(refMove) >= SECTOR_MOVE_MIN;
    const sameSign = stockRet >= 0 === refMove >= 0;
    if (bigSector && sameSign && Math.abs(excess) < 1.0) label = 'sector-driven';
    else if (bigSector && sameSign && excess * (refMove >= 0 ? 1 : -1) >= 1.5) label = 'amplified-by-sector';
    else if (bigSector && !sameSign) label = 'against-sector';
    else if (Math.abs(excess) >= 2.0) label = 'stock-specific';
    else label = 'in-line';
  }
  return {
    reference, ref_move: refMove,
    excess: excess !== null ? round(excess, 2) : null,
    industry_1d: indM ? indM.median : null,
    sector_1d: secM ? secM.median : null,
    market_1d: mkt, label,
  };
}

// ── Stockscans: live returns + sector context ─────────────────────────────────
async function fetchLiveReturns(client = stockscans) {
  const out = {};
  for (const wl of WATCHLISTS) {
    try {
      const data = await client.watchlistTable(wl, { orderBy: 'Returns 1D' });
      const tbl = data.table || [];
      if (tbl.length < 2) continue;
      const ci = tbl[0].indexOf('companyId');
      const ri = tbl[0].indexOf('Returns 1D');
      for (const row of tbl.slice(1)) {
        const v = parseFloat(row[ri]);
        if (!Number.isNaN(v)) out[row[ci]] = v;
      }
    } catch { /* skip */ }
  }
  return out;
}

async function fetchSectorContext(target, client = stockscans) {
  fs.mkdirSync(VAL_DIR, { recursive: true });
  // Cache key uses the target trading date in YYYYMMDD.
  const isoCompact = `${target.getUTCFullYear()}${String(target.getUTCMonth() + 1).padStart(2, '0')}${String(target.getUTCDate()).padStart(2, '0')}`;
  const cacheFile = path.join(VAL_DIR, `sector_context_${isoCompact}.json`);
  if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 200) {
    try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { /* refetch */ }
  }

  const companies = {};
  const baseScan = {
    ratiosType: 'Default', timePeriod: 'Latest',
    scan: {
      industry: [], index: [], sector: [], tags: [], watchlistIds: [],
      filters: [{ left: 'Market Capitalization', sign: '>=', right: String(SECTOR_MCAP_FLOOR) }],
      alertFrequency: null,
    },
    watchlistIds: [], order: 'desc', orderBy: 'Market Capitalization', offset: 0,
  };
  let offset = 0;
  let total = null;
  for (let p = 0; p < SECTOR_MAX_PAGES; p++) {
    const payload = JSON.parse(JSON.stringify(baseScan));
    payload.offset = offset;
    let d;
    try { d = await client.runScan(payload); } catch { break; }
    const tbl = d.table || [];
    if (tbl.length < 2) break;
    if (total === null) total = d.total || 0;
    const ci = tbl[0].indexOf('companyId');
    const ri = tbl[0].indexOf('Returns 1D');
    const ii = tbl[0].indexOf('Industry');
    const si = tbl[0].indexOf('Sector');
    if ([ci, ri, ii, si].some((x) => x < 0)) break;
    for (const row of tbl.slice(1)) {
      const ret = parseFloat(row[ri]);
      companies[row[ci]] = { ret: Number.isNaN(ret) ? null : ret, industry: row[ii] || '', sector: row[si] || '' };
    }
    offset += tbl.length - 1;
    if (total && offset >= total) break;
  }

  const medians = (key) => {
    const groups = {};
    for (const v of Object.values(companies)) {
      if (v.ret === null || !v[key]) continue;
      (groups[v[key]] ||= []).push(v.ret);
    }
    const res = {};
    for (const [grp, rs] of Object.entries(groups)) res[grp] = { median: round(median(rs), 2), n: rs.length };
    return res;
  };
  const allRets = Object.values(companies).map((v) => v.ret).filter((r) => r !== null);
  const ctx = {
    date: target.toISOString().slice(0, 10),
    universe: Object.keys(companies).length,
    market_median_1d: allRets.length ? round(median(allRets), 2) : null,
    industry: medians('industry'),
    sector: medians('sector'),
    companies,
  };
  try { fs.writeFileSync(cacheFile, JSON.stringify(ctx)); } catch { /* ignore */ }
  return ctx;
}

// ── Notes / category mapping ──────────────────────────────────────────────────
function latestNotesFile() {
  const db = new NotesDb(NOTES_DIR);
  const latest = db.getLatestFile();
  if (latest) return [path.basename(latest), JSON.parse(fs.readFileSync(latest, 'utf8'))];
  const flat = path.join(DATA_DIR, 'company_notes.json');
  if (fs.existsSync(flat)) return [path.basename(flat), JSON.parse(fs.readFileSync(flat, 'utf8'))];
  return ['', { companies: {} }];
}

const CATEGORY_FROM_TAGS_RULES = [
  ['shareholding_change', ['sast', 'pledge']],
  ['order_book', ['order_win']],
  ['acquisition', ['acquisition', 'demerger']],
  ['fundraise', ['fundraise', 'equity_dilution']],
  ['buyback', ['buyback']],
  ['capacity', ['capacity', 'capex']],
  ['credit_rating', ['credit_rating', 'debt']],
  ['management_change', ['management_change']],
  ['dividend', ['dividend']],
  ['investor_meet', ['investor_meet', 'concall']],
  ['regulatory', ['regulatory']],
];

function categoryFromTags(tags) {
  const tagset = new Set(tags);
  for (const [cat, keys] of CATEGORY_FROM_TAGS_RULES) {
    if (keys.some((k) => tagset.has(k))) return cat;
  }
  return 'general';
}

function categoryFromNote(note) {
  return note.category || categoryFromTags(note.tags || []);
}

function insightsFromNotes(notes) {
  const out = [];
  for (const [cid, co] of Object.entries(notes.companies || {})) {
    for (const n of co.notes || []) {
      if (n.type !== 'announcement') continue;
      if (n.significance === null || n.significance === '' || n.significance === 'routine') continue;
      out.push({
        companyId: cid, name: co.name || cid, noteId: n.id || '',
        title: n.announcementTitle || '', significance: n.significance,
        tags: n.tags || [], category: categoryFromNote(n), createdAt: n.createdAt || '',
      });
    }
  }
  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return out;
}

function insightTargetDate(insights) {
  for (const ins of insights) {
    const ca = (ins.createdAt || '').slice(0, 10);
    if (ca && /^\d{4}-\d{2}-\d{2}$/.test(ca)) return dateFromIso(ca);
  }
  return dateFromIso(ist.istDate().toISOString().slice(0, 10));
}

// ── Validation ────────────────────────────────────────────────────────────────
async function runValidation(insights, target, clients = { nse, stockscans }) {
  const ctx = await fetchSectorContext(target, clients.stockscans);
  let liveRet = {};
  for (const [c, v] of Object.entries(ctx.companies || {})) if (v.ret !== null) liveRet[c] = v.ret;
  if (!Object.keys(liveRet).length) liveRet = await fetchLiveReturns(clients.stockscans);

  const symbols = new Set(insights.map((i) => toSymbol(i.companyId)).filter(Boolean));
  const todayCsv = await fetchDeliveryCsv(target, clients.nse);
  const deliveryPending = todayCsv === null || todayCsv === undefined;
  const dayData = todayCsv ? parseDelivery(todayCsv) : {};
  const base = symbols.size ? await buildBaselines(symbols, target, BASELINE_DAYS, clients.nse) : {};

  const results = [];
  for (const ins of insights) {
    const sym = toSymbol(ins.companyId);
    const live = liveRet[ins.companyId] ?? null;
    const rec = { ...ins, symbol: sym, live_return_1d: live };
    let moveForAttr;
    if (sym && dayData[sym]) {
      const sig = structuralSignal(dayData[sym], base[sym] || {});
      rec.structural = sig;
      rec.verdict = verdict(ins.significance, sig.label);
      moveForAttr = sig.ret;
    } else {
      rec.structural = null;
      if (live === null) rec.verdict = 'no_data';
      else if (Math.abs(live) >= MOVE_MIN) rec.verdict = 'moved_pending_delivery';
      else rec.verdict = ins.significance === 'high' ? 'flat_pending_delivery' : 'confirmed_flat';
      moveForAttr = live;
    }
    rec.sector = sectorAttribution(moveForAttr, ins.companyId, ctx);
    results.push(rec);
  }

  return {
    date: target.toISOString().slice(0, 10),
    deliveryPending,
    insightCount: insights.length,
    scoredWithDelivery: results.filter((r) => r.structural).length,
    marketMedian1d: ctx.market_median_1d ?? null,
    sectorUniverse: ctx.universe || 0,
    results,
  };
}

// ── Ledger + proposals ────────────────────────────────────────────────────────
function loadLedger() {
  if (fs.existsSync(LEDGER_PATH)) {
    try { return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8')); } catch { /* fall through */ }
  }
  return { days: {}, byCategory: {}, validatedNotesFiles: [] };
}

function isAlreadyValidated(notesFilename) {
  if (!notesFilename) return false;
  return (loadLedger().validatedNotesFiles || []).includes(notesFilename);
}

function updateLedger(run, notesFilename) {
  fs.mkdirSync(VAL_DIR, { recursive: true });
  const led = loadLedger();
  const compact = (run.results || []).map((r) => {
    const sec = r.sector || {};
    const st = r.structural || {};
    return {
      companyId: r.companyId, name: r.name, noteId: r.noteId || '',
      title: (r.title || '').slice(0, 80), category: r.category, significance: r.significance,
      verdict: r.verdict, live_ret: r.live_return_1d, deliv_per: st.deliv_per,
      vol_spike: st.vol_spike, strength: st.label, sector_label: sec.label, industry_1d: sec.industry_1d,
    };
  });
  led.days[run.date] = {
    notesFile: notesFilename, validatedAt: ist.nowIstIso(), insightCount: run.insightCount,
    scoredWithDelivery: run.scoredWithDelivery, deliveryPending: run.deliveryPending,
    marketMedian1d: run.marketMedian1d ?? null, results: compact,
  };
  led.validatedNotesFiles ||= [];
  if (notesFilename && !led.validatedNotesFiles.includes(notesFilename)) led.validatedNotesFiles.push(notesFilename);

  led.byCategory ||= {};
  for (const r of run.results || []) {
    if (!r.structural) continue;
    const cat = r.category;
    const c = (led.byCategory[cat] ||= {
      confirmed: 0, overrated: 0, underrated: 0, noise_move: 0, soft: 0, samples: 0,
      sector_driven: 0, against_sector: 0,
    });
    if (r.verdict in c) c[r.verdict] += 1;
    c.samples += 1;
    const sl = (r.sector || {}).label;
    if (sl === 'sector-driven' || sl === 'amplified-by-sector') c.sector_driven = (c.sector_driven || 0) + 1;
    else if (sl === 'against-sector') c.against_sector = (c.against_sector || 0) + 1;
  }
  led.lastUpdated = ist.nowIstIso();
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(led, null, 2));
  return led;
}

function makeProposals(led, minSamples = 6) {
  const props = [];
  for (const cat of Object.keys(led.byCategory || {}).sort()) {
    const c = led.byCategory[cat];
    const n = c.samples || 0;
    if (n < minSamples) continue;
    const over = c.overrated;
    const under = c.underrated;
    const noise = c.noise_move;
    const conf = c.confirmed;
    const secDriven = c.sector_driven || 0;
    const against = c.against_sector || 0;
    const overR = over / n;
    const underR = under / n;
    const noiseR = noise / n;
    const confR = conf / n;
    let secCaveat = '';
    if (secDriven) {
      secCaveat = ` CAVEAT: ${secDriven}/${n} of these moves were sector/market-driven ` +
        `(the stock moved largely with its sector, not on the announcement) — ` +
        `discount these before concluding the insight was mis-rated.`;
    }
    if (against) {
      secCaveat += ` Note: ${against}/${n} moved AGAINST their sector — those are the ` +
        `strongest stock-specific (announcement-driven) signals.`;
    }
    if (overR >= 0.5) {
      props.push(`\`${cat}\`: ${over}/${n} insights rated high but NOT delivery-confirmed ` +
        `(over-rated). Propose TIGHTENING significance — require a hard, quantified trigger ` +
        `(₹ value / % of revenue / threshold crossed) before tagging \`high\`; default ` +
        `borderline cases to \`medium\`.${secCaveat}`);
    }
    if (underR >= 0.3) {
      props.push(`\`${cat}\`: ${under}/${n} low-rated insights saw STRONG delivery-backed moves ` +
        `(under-rated). Propose RAISING emphasis — add the missed catalyst type to this ` +
        `category's extraction checklist and lift its baseline significance.${secCaveat}`);
    }
    if (noiseR >= 0.4) {
      props.push(`\`${cat}\`: ${noise}/${n} reactions were NOISE (move on low delivery/volume). ` +
        `Propose adding a caution line: price pops in this category are often non-structural — ` +
        `weight the insight to fundamentals, not the tape.${secCaveat}`);
    }
    if (n >= minSamples && confR >= 0.7) {
      props.push(`\`${cat}\`: healthy — ${conf}/${n} delivery-confirmed. No change proposed.`);
    }
  }
  if (!props.length) {
    props.push('Not enough delivery-confirmed samples yet to propose changes ' +
      '(need a few trading days of post-publish data). Accumulating.');
  }
  return props;
}

function writeProposals(props, target, qr) {
  fs.mkdirSync(VAL_DIR, { recursive: true });
  const iso = target.toISOString().slice(0, 10);
  let s = `\n## ${iso} — proposed insight-prompt refinements\n`;
  for (const p of props) s += `- ${p}\n`;
  if (qr) {
    s += `\n### ${iso} — insight quality review\n`;
    const iq = qr.insightQuality || {};
    for (const [cat, b] of Object.entries(iq.byCategory || {})) {
      for (const sug of b.suggestions || []) s += `- [${cat}] ${sug}\n`;
    }
    for (const sug of iq.overallSuggestions || []) s += `- ${sug}\n`;
    s += `\n### ${iso} — categorisation review\n`;
    const cr = qr.categorisation || {};
    for (const sug of cr.suggestions || []) s += `- ${sug}\n`;
    for (const mm of cr.mismatches || []) s += `  • MISMATCH: ${mm}\n`;
    s += `\n### ${iso} — ignored-announcements review\n`;
    const irr = qr.ignoredLog || {};
    for (const sug of irr.suggestions || []) s += `- ${sug}\n`;
    for (const mf of (irr.potentialMisfilters || []).slice(0, 10)) s += `  • POSSIBLE MIS-FILTER: ${mf}\n`;
  }
  fs.appendFileSync(PROPOSALS_PATH, s);
}

// ── Quality review ────────────────────────────────────────────────────────────
const GENERIC_PHRASES = [
  'the company announced', 'the exchange has received', 'exchange received',
  'a disclosure has been', 'the company has disclosed', 'no upsi', 'no material information',
  'the board has', 'it is informed', 'pursuant to regulation', 'in compliance with',
  'as per the', 'please refer', 'to be disclosed', 'will be informed', 'no specific',
  'general overview', 'no new information',
];
const WEAK_TITLE_PHRASES = [
  'outcome of agm', 'outcome of egm', 'intimation', 'update', 'information', 'disclosure',
  'announcement', 'communication', 'submission', 'clarification',
];
const TITLE_INFO_RE = /(₹|\brs\.?\s*\d|\d+\s*(cr|lakh|%|mw|mva|tpa|mton|km|sq|units?)\b|\bq[1-4]\b|fye?\d{2,4}|\bfy\d{2,4}\b|\b\d{2,}\b)/i;

const hasSpecifics = (text) => TITLE_INFO_RE.test(text);

function titleInfoDensity(title) {
  if (TITLE_INFO_RE.test(title) && title.length > 30) return 'RICH';
  const t = title.toLowerCase();
  if (WEAK_TITLE_PHRASES.some((p) => t.includes(p)) || title.length < 25) return 'WEAK';
  return 'OK';
}

function qualityReviewInsights(notes) {
  const byCat = {};
  let total = 0;
  for (const [cid, co] of Object.entries(notes.companies || {})) {
    for (const n of co.notes || []) {
      if (n.type !== 'announcement') continue;
      if (n.significance === null || n.significance === '' || n.significance === 'routine') continue;
      const cat = categoryFromNote(n);
      const title = n.announcementTitle || '';
      const insight = n.insight || '';
      const sig = n.significance || '';
      const company = co.name || cid;
      total += 1;
      const b = (byCat[cat] ||= { samples: 0, weakTitles: [], genericBodies: [], noSpecifics: [], shortInsights: [] });
      b.samples += 1;
      if (titleInfoDensity(title) === 'WEAK') b.weakTitles.push(`${company}: "${title}"`);
      const phrases = cat !== 'investor_meet' ? GENERIC_PHRASES
        : GENERIC_PHRASES.filter((p) => p !== 'no upsi' && p !== 'no material information');
      const genericHits = phrases.filter((p) => insight.toLowerCase().includes(p)).length;
      if (genericHits >= 2) b.genericBodies.push(`${company} (${sig}): ${genericHits} generic phrase(s) — "${insight.slice(0, 120)}…"`);
      if (!hasSpecifics(insight) && insight.length > 20) b.noSpecifics.push(`${company} (${sig}): no hard numbers/₹/% found — "${insight.slice(0, 120)}…"`);
      if (insight.trim().length < 150 && (sig === 'high' || sig === 'medium')) b.shortInsights.push(`${company} (${sig}): only ${insight.trim().length} chars`);
    }
  }
  const overall = [];
  for (const b of Object.values(byCat)) {
    const n = b.samples;
    b.suggestions ||= [];
    if (b.weakTitles.length / n >= 0.4) {
      b.suggestions.push(`TITLES (${b.weakTitles.length}/${n}): titles lack key facts. Instruct Claude to front-load entity name + ₹ value/% + action verb — e.g. 'CRISIL upgrades outlook to Positive; limits enhanced to ₹600 Cr'. Weak examples: ${b.weakTitles.slice(0, 2).join('; ')}`);
    }
    if (b.genericBodies.length / n >= 0.3) {
      b.suggestions.push(`GENERIC BODY (${b.genericBodies.length}/${n}): insights contain filler phrases. Strengthen the template rule: 'DO NOT write sentences that merely restate that a disclosure was made — every sentence must carry a hard fact.' Examples: ${b.genericBodies.slice(0, 2).map((x) => x.slice(0, 80)).join('; ')}`);
    }
    if (b.noSpecifics.length / n >= 0.4) {
      b.suggestions.push(`NO SPECIFICS (${b.noSpecifics.length}/${n}): insights missing numbers/₹/%. Add to template: 'Every insight MUST contain at least one hard fact (₹ amount / % / date / counterparty name).'`);
    }
    if (b.shortInsights.length / n >= 0.3) {
      b.suggestions.push(`SHORT INSIGHTS (${b.shortInsights.length}/${n}): high/medium insights are too brief. Template should require minimum 3 substantive sentences.`);
    }
  }
  if (total === 0) overall.push('No non-routine insights found for today — quality review skipped.');
  return { byCategory: byCat, overallSuggestions: overall, total };
}

const ALL_CATS = new Set([
  'order_book', 'investor_meet', 'shareholding_change', 'credit_rating', 'fundraise',
  'management_change', 'results', 'agm_egm', 'regulatory', 'capacity', 'dividend',
  'acquisition', 'buyback', 'general',
]);

function qualityReviewCategorisation(notes) {
  const usedCats = new Set();
  const mismatches = [];
  const uncategorised = [];
  for (const [cid, co] of Object.entries(notes.companies || {})) {
    for (const n of co.notes || []) {
      if (n.type !== 'announcement') continue;
      if (n.significance === null || n.significance === '' || n.significance === 'routine') continue;
      const storedCat = n.category || '';
      const tagCat = categoryFromTags(n.tags || []);
      const company = co.name || cid;
      const title = n.announcementTitle || '';
      if (storedCat) usedCats.add(storedCat);
      if (tagCat) usedCats.add(tagCat);
      if (storedCat && tagCat && storedCat !== tagCat && tagCat !== 'general') {
        mismatches.push(`${company}: stored='${storedCat}' vs tags→'${tagCat}' | tags=${JSON.stringify(n.tags || [])} | title: "${title.slice(0, 60)}"`);
      }
      const effective = storedCat || tagCat;
      if (effective === 'general') {
        const desc = (n.announcementDescription || n.announcementTitle || '').slice(0, 120);
        uncategorised.push(`${company} (sig=${n.significance}): "${desc}"`);
      }
    }
  }
  const emptyCats = [...ALL_CATS].filter((c) => !usedCats.has(c) && c !== 'general').sort();
  const suggestions = [];
  if (mismatches.length) {
    suggestions.push(`CATEGORY MISMATCHES (${mismatches.length}): stored category from the insight prompt doesn't match tag-inferred category. Review whether the scheduled-task prompt is passing \`category\` correctly from fetch-announcements output, or whether CATEGORY_RULES needs new keywords.`);
  }
  if (uncategorised.length) {
    suggestions.push(`GENERAL FALLBACK (${uncategorised.length} today): these landed in 'general'. Review CATEGORY_RULES for missing keywords that could capture them: ${uncategorised.slice(0, 4).join('; ')}`);
  }
  if (emptyCats.length) {
    suggestions.push(`UNDER-REPRESENTED CATEGORIES today (zero hits): ${emptyCats.join(', ')}. Consider whether keyword coverage in CATEGORY_RULES is broad enough, especially if you hold companies that regularly file in these categories.`);
  }
  return { mismatches, uncategorised, emptyCats, suggestions };
}

function qualityReviewIgnored(target) {
  fs.mkdirSync(VAL_DIR, { recursive: true });
  const iso = `${target.getUTCFullYear()}${String(target.getUTCMonth() + 1).padStart(2, '0')}${String(target.getUTCDate()).padStart(2, '0')}`;
  const logPath = path.join(VAL_DIR, `ignored_log_${iso}.json`);
  if (!fs.existsSync(logPath)) {
    return { ignored: [], potentialMisfilters: [], suggestions: ['No ignored log found — ensure watchlistInsights.js is updated to write validation/ignored_log_YYYYMMDD.json.'] };
  }
  let ignored;
  try { ignored = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch {
    return { ignored: [], potentialMisfilters: [], suggestions: ['Could not parse ignored log.'] };
  }
  const INFORMATIVE = ['rating', 'upgrade', 'downgrade', 'order', 'capex', 'appointment',
    'resignation', 'qip', 'preferential', 'amalgamation', 'acquisition', 'demerger', 'penalty',
    'sebi', 'cci', 'nclt', 'dividend', 'buyback', 'warrant', 'ncd', 'ipo', 'open offer',
    'takeover', 'rights issue'];
  const potential = [];
  const kwCounts = {};
  for (const item of ignored) {
    const kw = item.matchedKeyword || '';
    kwCounts[kw] = (kwCounts[kw] || 0) + 1;
    const combined = `${(item.title || '').toLowerCase()} ${(item.description || '').toLowerCase()}`;
    if (INFORMATIVE.some((s) => combined.includes(s))) {
      potential.push(`${item.name || '?'} | kw='${kw}' | "${(item.title || '').slice(0, 80)}"`);
    }
  }
  const topKws = Object.entries(kwCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const suggestions = [];
  if (potential.length) suggestions.push(`POTENTIAL MIS-FILTERS (${potential.length}): ignored announcements contain informative signals — review whether these keywords are too broad. Top flagged: ${potential.slice(0, 5).join('; ')}`);
  if (topKws.length) suggestions.push(`TOP SUPPRESSED KEYWORDS today: ${topKws.map(([k, v]) => `'${k}' ×${v}`).join(', ')}. If any of these are over-suppressing, tighten the keyword (e.g. prefix/suffix anchor) in INSIGNIFICANT_KEYWORDS.`);
  if (!ignored.length) suggestions.push('No announcements were suppressed today (or log was not written).');
  return { ignored, potentialMisfilters: potential, topKeywords: topKws, suggestions };
}

function runQualityReview(notes, target) {
  return {
    insightQuality: qualityReviewInsights(notes),
    categorisation: qualityReviewCategorisation(notes),
    ignoredLog: qualityReviewIgnored(target),
  };
}

// ── Email ─────────────────────────────────────────────────────────────────────
const LABEL_COLOR = { STRONG: '#2f855a', MODERATE: '#38a169', WEAK: '#a0aec0', NOISE: '#dd6b20' };
const SECTOR_COLOR = { 'sector-driven': '#dd6b20', 'amplified-by-sector': '#d69e2e', 'against-sector': '#2f855a', 'stock-specific': '#2f855a', 'in-line': '#718096', no_context: '#a0aec0' };
const VERDICT_BADGE = {
  confirmed: '✅ confirmed', overrated: '🔴 over-rated', underrated: '🟠 under-rated',
  noise_move: '⚠️ noise move', soft: '🟡 soft', no_data: '— no data',
  moved_pending_delivery: '⏳ moved (delivery pending)', flat_pending_delivery: '⏳ flat (delivery pending)',
  confirmed_flat: '✅ flat (as expected)',
};
const signed = (x, dp) => `${x >= 0 ? '+' : ''}${x.toFixed(dp)}`;

function buildEmail(run, props, qr) {
  const d = run.date;
  const rows = [...run.results].sort((a, b) => Math.abs(b.live_return_1d || 0) - Math.abs(a.live_return_1d || 0));
  const mkt = run.marketMedian1d;
  const mktS = mkt !== null && mkt !== undefined ? `${signed(mkt, 2)}%` : 'n/a';
  const parts = [
    `<h2>🔎 Insight Validation — ${d}</h2>`,
    `<p><b>${run.insightCount} insights validated</b> · ${run.scoredWithDelivery} delivery-confirmed · ` +
    `market 1D median ${mktS} (n=${run.sectorUniverse || 0})` +
    (run.deliveryPending ? " · <span style='color:#dd6b20'>NSE delivery file still publishing — structural read provisional</span>" : '') + '</p>',
    "<table style='border-collapse:collapse;font-size:13px' cellpadding='6'>",
    "<tr style='background:#f0f0f0;text-align:left'><th>Company</th><th>Sig</th><th>1D%</th><th>Deliv%</th><th>Vol×</th><th>Strength</th><th>Verdict</th><th>Sector (ind 1D)</th></tr>",
  ];
  for (const r of rows) {
    const s = r.structural || {};
    const sec = r.sector || {};
    const color = LABEL_COLOR[s.label] || '#718096';
    const secColor = SECTOR_COLOR[sec.label] || '#718096';
    const ret = r.live_return_1d;
    const retS = ret !== null && ret !== undefined ? signed(ret, 1) : '—';
    const ind1d = sec.industry_1d;
    const indS = typeof ind1d === 'number' ? ` (${signed(ind1d, 1)})` : '';
    parts.push(
      "<tr style='border-top:1px solid #ddd'>" +
      `<td><b>${r.name}</b><br><small>${(r.title || '').slice(0, 42)}</small></td>` +
      `<td>${r.significance}</td><td>${retS}</td>` +
      `<td>${s.deliv_per ?? '—'}</td><td>${s.vol_spike ?? '—'}</td>` +
      `<td style='color:${color};font-weight:bold'>${s.label || 'pending'}</td>` +
      `<td>${VERDICT_BADGE[r.verdict] || r.verdict}</td>` +
      `<td style='color:${secColor}'>${sec.label || '—'}${indS}</td></tr>`
    );
  }
  parts.push('</table>');
  parts.push('<h3>📈 Proposed insight-prompt refinements (review before applying)</h3><ul>');
  for (const p of props) parts.push(`<li>${p}</li>`);
  parts.push('</ul>');
  if (qr) parts.push(renderQualitySection(qr));
  parts.push("<hr style='border:none;border-top:1px solid #ddd;margin-top:16px'>");
  parts.push("<p style='color:#999;font-size:11px'>Structural = delivery-backed (NSE DELIV_PER vs 20-day avg + volume spike). Sector column attributes the move vs its industry/sector/market 1D median. No stock is dropped — context for the refinement thesis. All proposals are logged to validation/proposals.md and NOT auto-applied.</p>");
  return parts.join('\n');
}

function renderQualitySection(qr) {
  const parts = ['<h3>🔬 Insight Quality Review</h3>'];
  const iq = qr.insightQuality || {};
  const total = iq.total || 0;
  if (total) {
    parts.push(`<p><b>${total} non-routine insights reviewed</b></p>`);
    parts.push("<table style='border-collapse:collapse;font-size:12px;width:100%' cellpadding='5'>");
    parts.push("<tr style='background:#f0f0f0'><th>Category</th><th>n</th><th>Weak Titles</th><th>Generic Body</th><th>No Specifics</th><th>Short</th></tr>");
    for (const cat of Object.keys(iq.byCategory || {}).sort()) {
      const b = iq.byCategory[cat];
      const n = b.samples;
      const wt = (b.weakTitles || []).length;
      const gb = (b.genericBodies || []).length;
      const ns = (b.noSpecifics || []).length;
      const si = (b.shortInsights || []).length;
      const rowBg = wt || gb || ns ? '#fff3cd' : 'transparent';
      parts.push(`<tr style='border-top:1px solid #ddd;background:${rowBg}'><td><b>${cat}</b></td><td>${n}</td>` +
        `<td style='color:${wt ? '#c53030' : '#2f855a'}'>${wt}</td><td style='color:${gb ? '#c53030' : '#2f855a'}'>${gb}</td>` +
        `<td style='color:${ns ? '#dd6b20' : '#2f855a'}'>${ns}</td><td style='color:${si ? '#718096' : '#2f855a'}'>${si}</td></tr>`);
    }
    parts.push('</table>');
    let hasSug = false;
    for (const cat of Object.keys(iq.byCategory || {}).sort()) {
      for (const s of iq.byCategory[cat].suggestions || []) {
        if (!hasSug) { parts.push("<ul style='font-size:12px'>"); hasSug = true; }
        parts.push(`<li><b>[${cat}]</b> ${s}</li>`);
      }
    }
    if (hasSug) parts.push('</ul>');
  } else {
    parts.push("<p style='color:#999'>No non-routine insights today — quality review skipped.</p>");
  }
  const cr = qr.categorisation || {};
  if ((cr.suggestions || []).length) {
    parts.push("<h4 style='margin-top:12px'>📂 Categorisation Review</h4><ul style='font-size:12px'>");
    for (const s of cr.suggestions) parts.push(`<li>${s}</li>`);
    parts.push('</ul>');
    if ((cr.mismatches || []).length) {
      parts.push(`<details><summary style='cursor:pointer;font-size:11px'>Category mismatches (${cr.mismatches.length})</summary><ul style='font-size:11px'>`);
      for (const mm of cr.mismatches) parts.push(`<li>${mm}</li>`);
      parts.push('</ul></details>');
    }
  }
  const irr = qr.ignoredLog || {};
  const ignoredCount = (irr.ignored || []).length;
  const mf = irr.potentialMisfilters || [];
  parts.push(`<h4 style='margin-top:12px'>🚫 Ignored Announcements Review (${ignoredCount} suppressed today)</h4>`);
  if ((irr.suggestions || []).length) {
    parts.push("<ul style='font-size:12px'>");
    for (const s of irr.suggestions) parts.push(`<li>${s}</li>`);
    parts.push('</ul>');
  }
  if (mf.length) {
    parts.push(`<details><summary style='cursor:pointer;font-size:11px'>Possible mis-filters (${mf.length})</summary><ul style='font-size:11px'>`);
    for (const f of mf.slice(0, 15)) parts.push(`<li>${f}</li>`);
    parts.push('</ul></details>');
  }
  return parts.join('\n');
}

async function sendEmail(html) {
  return sendHtmlEmail({ subject: `🔎 Insight Validation — ${ist.nowIstHuman()}`, htmlBody: html });
}

// ── Commands ──────────────────────────────────────────────────────────────────
async function cmdRun() {
  const [notesFilename, notes] = latestNotesFile();
  if (!notesFilename) { process.stdout.write(JSON.stringify({ skipped: true, reason: 'no notes file found' })); return; }
  if (isAlreadyValidated(notesFilename)) {
    const led = loadLedger();
    const prior = Object.values(led.days || {})
      .filter((v) => v.notesFile === notesFilename)
      .sort((a, b) => (b.validatedAt || '').localeCompare(a.validatedAt || ''))[0];
    process.stdout.write(JSON.stringify({
      skipped: true, reason: 'already_validated', notesFile: notesFilename,
      previousValidation: {
        date: prior ? prior.validatedAt || '' : '',
        insightCount: prior ? prior.insightCount || 0 : 0,
        deliveryPending: prior ? prior.deliveryPending : null,
      },
    }));
    return;
  }
  const insights = insightsFromNotes(notes);
  const target = insightTargetDate(insights);
  const run = await runValidation(insights, target);
  const led = updateLedger(run, notesFilename);
  const props = makeProposals(led);
  const qr = runQualityReview(notes, target);
  writeProposals(props, target, qr);
  const mail = await sendEmail(buildEmail(run, props, qr));
  const qrSug = Object.values(qr.insightQuality.byCategory || {}).reduce((s, b) => s + (b.suggestions || []).length, 0) +
    (qr.categorisation.suggestions || []).length + (qr.ignoredLog.suggestions || []).length;
  process.stdout.write(JSON.stringify({
    date: run.date, notesFile: notesFilename, insights: run.insightCount,
    deliveryConfirmed: run.scoredWithDelivery, deliveryPending: run.deliveryPending,
    proposals: props.length, qualitySuggestions: qrSug, email: mail,
  }));
}

async function cmdFetchDelivery(d) {
  const day = d ? new Date(Date.UTC(+d.slice(4), +d.slice(2, 4) - 1, +d.slice(0, 2))) : ist.istDate();
  const dayUtc = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const csv = await fetchDeliveryCsv(dayUtc);
  if (!csv) { process.stdout.write(JSON.stringify({ date: dayUtc.toISOString().slice(0, 10), status: 'not_published' })); return; }
  const parsed = parseDelivery(csv);
  const sample = Object.fromEntries(Object.entries(parsed).slice(0, 2));
  process.stdout.write(JSON.stringify({ date: dayUtc.toISOString().slice(0, 10), symbols: Object.keys(parsed).length, sample }));
}

async function cmdScore(symbol) {
  const sym = symbol.toUpperCase();
  const target = new Date(Date.UTC(ist.istDate().getUTCFullYear(), ist.istDate().getUTCMonth(), ist.istDate().getUTCDate()));
  let csv = await fetchDeliveryCsv(target);
  let used = target;
  if (!csv) {
    for (const d of recentTradingDays(target, 5)) {
      csv = await fetchDeliveryCsv(d);
      if (csv) { used = d; break; }
    }
  }
  const day = csv ? parseDelivery(csv) : {};
  if (!day[sym]) { process.stdout.write(JSON.stringify({ symbol: sym, status: 'not_found', date: used.toISOString().slice(0, 10) })); return; }
  const base = await buildBaselines(new Set([sym]), used);
  const sig = structuralSignal(day[sym], base[sym] || {});
  process.stdout.write(JSON.stringify({ symbol: sym, date: used.toISOString().slice(0, 10), metrics: sig }));
}

function cmdShowLedger() {
  process.stdout.write(JSON.stringify(loadLedger(), null, 2));
}

const COMMANDS = { run: [cmdRun, 0], 'fetch-delivery': [cmdFetchDelivery, 1], score: [cmdScore, 1], 'show-ledger': [cmdShowLedger, 0] };

async function runCli(argv) {
  const cmd = argv[0];
  if (!cmd || !COMMANDS[cmd]) {
    process.stdout.write(`Usage: insightValidator.js <command> [args]\nCommands: ${Object.keys(COMMANDS).join(', ')}\n`);
    process.exit(1);
  }
  const [fn, n] = COMMANDS[cmd];
  const args = n ? argv.slice(1, 1 + n) : [];
  try { await fn(...args); } catch (e) {
    process.stderr.write(JSON.stringify({ error: e.message, command: cmd }));
    process.exit(1);
  }
}

module.exports = {
  toSymbol, ddmmyyyy, parseDelivery, recentTradingDays, structuralSignal, verdict,
  sectorAttribution, median, categoryFromTags, categoryFromNote, insightsFromNotes,
  insightTargetDate, makeProposals, titleInfoDensity, hasSpecifics, qualityReviewInsights,
  qualityReviewCategorisation, qualityReviewIgnored, buildEmail, renderQualitySection,
  updateLedger, loadLedger, runValidation, runCli,
  MOVE_MIN, TURNOVER_FLOOR_L,
};

if (require.main === module) {
  loadEnv(argValue('--env-file'));
  runCli(process.argv.slice(2));
}
