#!/usr/bin/env node
'use strict';

/**
 * pead-predictor — Step 1 (Extraction, deterministic, no LLM).
 *
 * Assembles EVERYTHING the reasoning step needs for one company into a single input bundle, so the
 * agent reads one JSON instead of re-fetching (conventions §17: extraction first, cached):
 *
 *   actuals      company-financials (12 quarters / ~7 FYs / TTM / baselines; 24h cache)
 *   shares       implied share count per quarter (PAT ÷ EPS) + dilution filings
 *   priceAction  Pre-result price action, volume explosion & delivery accumulation (Onward Tech pattern,
 *                SureshKBN Gate 3: return5d/10d/20d, volume surge multiplier vs 20d median, delivery %,
 *                delivery ₹ Cr, pattern, expectation hurdle & sell-the-news risk)
 *   guidance     Stockscans concall-notes "Guidance & Commitments" + "Key Metrics" tables (parsed),
 *                growth-catalysts + business-overview text (stockscansContext, 7-day cache),
 *                guidance tables of up to 4 PRIOR concalls (concallNotesStore) for walk-the-talk,
 *                stored forward-guidance DTOs
 *   transcript   keyword windows from the latest concall transcript (guidance/margin/capacity/debt…)
 *   filings      every announcement since the latest reported quarter's end, classified
 *                (announcementTaxonomy + dot-connect tags), split KNOWN (before the concall) vs NEW,
 *                with cached PDF text for the material ones
 *   orderBook    orderBookLedger cumulative (if the order-book pipeline tracks the company)
 *   monthly      parsed monthly business updates (auto/metals volumes) inside the window
 *   macro        TradingView performance for the industry's commodity basket + always-on macro
 *                (skills/_shared/macro/commodity-basket.json), latest market_snapshot, and whether
 *                the shared quarterly macro log already covers the target quarter
 *   history      our own prior pead-prediction DTOs + their post-result scores (calibration)
 *   context      buildCompanyContext ids (conventions §8 → contextUsed)
 *
 * Usage:
 *   node skills/equity-research/pead-predictor/scripts/gather_inputs.js --company NSE:ONWARDTEC \
 *     [--as-of 2026-10-16] [--extra-tickers MCX:NICKEL1!,SGX:TF1!] [--force] [--max-filing-text 15]
 *     [--out <path>] [--job <name>]
 * Writes data/runs/pead-predictor_<companySafe>-<asOf>_inputs.json (re-derivable → runs/, DATA_RULES §1)
 * and prints a one-line JSON summary {out, …counts, errors}.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const req = (p) => require(path.join(REPO, p));

const STOCK_SECTION_RE = /^(#{1,4})\s*(.+?)\s*$/;
const GUIDANCE_HEAD_RE = /guidance|commitment|outlook/i;
const METRICS_HEAD_RE = /key metrics/i;

/** Dot-connect tags: which P&L lever a filing could move (deterministic title/description regex). */
const DOT_TAGS = [
  [
    'capacity',
    /capacity|commission|commercial production|plant|expansion|greenfield|brownfield|debottleneck|new line|trial run/i,
  ],
  [
    'debt',
    /\bdebt\b|repay|prepay|borrowing|\bloan\b|\bncd\b|credit rating|rating.{0,40}(upgrade|downgrade|reaffirm|assign|revis)|\bicra\b|care ratings|india ratings/i,
  ],
  [
    'dilution',
    /\bqip\b|qualified institution|preferential|warrant|rights issue|allotment|\besop\b|\besps\b|conversion of/i,
  ],
  ['order', /\border\b|contract|letter of award|\bloa\b|work order|purchase order|award/i],
  [
    'inorganic',
    /acquisition|acquire|merger|amalgamation|stake|joint venture|\bjv\b|demerger|scheme of arrangement/i,
  ],
  ['pricing', /price (increase|hike|revision)|tariff|realisation|realization/i],
  [
    'disruption',
    /fire|shutdown|strike|accident|force majeure|flood|lockout|suspension of operations/i,
  ],
  ['incentive', /\bpli\b|subsidy|incentive|tax (holiday|refund|demand)|gst/i],
  ['volume_update', /monthly|production|sales volume|business update|dispatch/i],
  ['guidance', /guidance|outlook/i],
  ['management', /resign|appointment|cessation|\bceo\b|\bcfo\b|managing director/i],
];
const ROUTINE_RE =
  /\besg\b|trading window|investor meet|analyst.*meet|newspaper|loss of share certificate|duplicate share|postal ballot|scrutini[sz]er|memorandum|articles of association|record date|book closure|compliance certificate|regulation 74|74\(5\)|change of address|ksm|kmp contact/i;

/** The base documents themselves (already read via concall notes / transcript) — never re-read as "filings". */
const BASE_DOC_CATEGORIES = new Set([
  'results',
  'concall_transcript',
  'investor_presentation',
  'anticipation',
  'annual_report',
]);

const TRANSCRIPT_KW =
  /guid|outlook|target|expect|margin|ebitda|capacity|utili[sz]|commission|capex|plant|debt|borrow|interest cost|repay|qip|raise|order book|order inflow|price (increase|hike)|raw material|input cost|realisation|realization|h2|second half|next quarter|q[1-4]\b|fy2[6-9]|fy3[0-1]|tax rate|depreciation|other income|seasonal|monsoon|tariff|export/i;

// ---------------------------------------------------------------- pure helpers (unit-tested)

/** Parse markdown tables that sit under headings matching `headRe`. -> [{section, cells:[…]}] */
function parseTablesUnder(markdown, headRe) {
  const rows = [];
  let current = null;
  let header = null;
  for (const raw of String(markdown || '').split(/\r?\n/)) {
    const line = raw.trim();
    const h = line.match(STOCK_SECTION_RE);
    if (h && !line.startsWith('|')) {
      current = headRe.test(h[2]) ? h[2] : null;
      header = null;
      continue;
    }
    if (!current || !line.startsWith('|')) continue;
    const cells = line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.replace(/\*\*/g, '').trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) continue; // separator row
    if (!header) {
      header = cells;
      continue;
    }
    const rec = { section: current };
    header.forEach((k, i) => {
      rec[k || `col${i}`] = cells[i] ?? '';
    });
    rows.push(rec);
  }
  return rows;
}

/** Keyword windows (±1 paragraph) from transcript text, capped to `maxChars`. */
function keywordWindows(text, re = TRANSCRIPT_KW, maxChars = 16000) {
  const paras = String(text || '')
    .split(/\n\s*\n|(?<=[.?!])\s{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 40);
  const keep = new Set();
  paras.forEach((p, i) => {
    const hits = (p.match(new RegExp(re.source, 'gi')) || []).length;
    if (hits >= 2) [i - 1, i, i + 1].forEach((j) => j >= 0 && j < paras.length && keep.add(j));
  });
  let out = '';
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (out.length + paras[i].length > maxChars) break;
    out += `${paras[i]}\n\n`;
  }
  return { excerpt: out.trim(), paragraphsKept: keep.size, paragraphsTotal: paras.length };
}

function dotTags(title, description) {
  const s = `${title || ''} ${description || ''}`;
  return DOT_TAGS.filter(([, re]) => re.test(s)).map(([t]) => t);
}

/** Quarter-end ISO date of a company-financials quarter row ({yyyymm:'202606'} -> '2026-06-30'). */
function quarterEndIso(row) {
  const y = Number(String(row.yyyymm).slice(0, 4));
  const m = Number(String(row.yyyymm).slice(4, 6));
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

/** Implied share count (crore) per quarter = PAT ÷ EPS; flags step changes > 1%. */
function impliedShares(quarters) {
  const rows = (quarters || [])
    .filter((q) => q.pat > 0 && q.eps > 0)
    .map((q) => ({ fq: q.fq, sharesCr: Math.round((q.pat / q.eps) * 1000) / 1000 }));
  const changes = [];
  for (let i = 1; i < rows.length; i++) {
    const pct = (rows[i].sharesCr / rows[i - 1].sharesCr - 1) * 100;
    if (Math.abs(pct) > 1)
      changes.push({ from: rows[i - 1].fq, to: rows[i].fq, pct: Math.round(pct * 10) / 10 });
  }
  return {
    perQuarter: rows,
    latestCr: rows.length ? rows[rows.length - 1].sharesCr : null,
    changes,
    note: 'PAT and EPS are whole-Cr / 2-dp rounded on Stockscans: treat as ±2% and cross-check with dilution filings',
  };
}

/** First-match industry rule from commodity-basket.json. */
function basketFor(basket, sector, industry) {
  const key = `${sector || ''} | ${industry || ''}`;
  const rule = (basket.industries || []).find((r) => new RegExp(r.match, 'i').test(key)) || null;
  const keys = [...new Set([...(basket.always || []), ...((rule && rule.inputs) || [])])];
  return { rule, keys };
}

/** Macro read per instrument: spot vs ~latest-quarter avg (SMA50) and ~2-quarter avg (SMA100). */
function macroRead(perf, instrument) {
  if (!perf) return { ...instrument, available: false };
  const r = (x) => (x == null ? null : Math.round(x * 10) / 10);
  const vs = (a, b) => (a != null && b ? r((a / b - 1) * 100) : null);
  return {
    ...instrument,
    available: true,
    price: perf.price,
    perf1M: r(perf.perf1M),
    perf3M: r(perf.perf3M),
    perf6M: r(perf.perf6M),
    perf1Y: r(perf.perf1Y),
    spotVsSma50Pct: vs(perf.price, perf.sma50),
    sma50VsSma100Pct: vs(perf.sma50, perf.sma100),
    note: '[approx] SMA50 ≈ latest-quarter average, SMA100 ≈ 2-quarter average (TradingView scanner, no history endpoint)',
  };
}

/** Formats an ISO date or Date to NSE format dd-mm-yyyy. */
function toNseDate(dateInput) {
  const d = new Date(dateInput);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Pre-earnings price action & volume delivery accumulation analyzer (SureshKBN Gate 3).
 *
 * Evaluates whether price/volume/delivery in the 5D/10D/20D window prior to results
 * indicates smart-money accumulation (e.g. Onward Tech pattern: 10x volume surges,
 * delivery expansion, 20%+ return) vs tight consolidation vs distribution,
 * and sets the expectation hurdle rate / sell-the-news risk.
 *
 * @param {Array<Object>} rows - Bhavcopy rows newest first from NseClient.getPriceVolumeDeliverable
 * @param {number|null} [marketCapCr]
 * @returns {Object|null}
 */
function analyzePreResultPriceAction(rows, marketCapCr = null) {
  if (!Array.isArray(rows) || rows.length < 5) return null;

  const validRows = rows.filter((r) => r && r.CH_CLOSING_PRICE != null);
  if (validRows.length < 5) return null;

  const latest = validRows[0];
  const r5 = validRows[Math.min(5, validRows.length - 1)];
  const r10 = validRows[Math.min(10, validRows.length - 1)];
  const r20 = validRows[Math.min(20, validRows.length - 1)];

  const ret5d = (latest.CH_CLOSING_PRICE / r5.CH_CLOSING_PRICE - 1) * 100;
  const ret10d = (latest.CH_CLOSING_PRICE / r10.CH_CLOSING_PRICE - 1) * 100;
  const ret20d = (latest.CH_CLOSING_PRICE / r20.CH_CLOSING_PRICE - 1) * 100;

  const last5 = validRows.slice(0, 5);
  const prior20 = validRows.slice(5, 25);

  const avgVol5d = last5.reduce((s, r) => s + (Number(r.CH_TOT_TRADED_QTY) || 0), 0) / last5.length;
  const vols20 = prior20.map((r) => Number(r.CH_TOT_TRADED_QTY) || 0).sort((a, b) => a - b);
  const medVol20d = vols20.length ? vols20[Math.floor(vols20.length / 2)] : avgVol5d;

  const avgDelivQty5d =
    last5.reduce((s, r) => s + (Number(r.COP_DELIV_QTY) || 0), 0) / last5.length;
  const delivs20 = prior20.map((r) => Number(r.COP_DELIV_QTY) || 0).sort((a, b) => a - b);
  const medDelivQty20d = delivs20.length
    ? delivs20[Math.floor(delivs20.length / 2)]
    : avgDelivQty5d;

  const avgDelivPct5d =
    last5.reduce((s, r) => s + (Number(r.COP_DELIV_PERC) || 0), 0) / last5.length;
  const totalDelivVal5dCr =
    last5.reduce(
      (s, r) => s + (Number(r.COP_DELIV_QTY) || 0) * (Number(r.CH_CLOSING_PRICE) || 0),
      0
    ) / 1e7;

  const volMult5d = medVol20d > 0 ? avgVol5d / medVol20d : 1;
  const delivMult5d = medDelivQty20d > 0 ? avgDelivQty5d / medDelivQty20d : 1;
  const maxSingleDayVolMult = Math.max(
    ...last5.map((r) => (medVol20d > 0 ? (Number(r.CH_TOT_TRADED_QTY) || 0) / medVol20d : 1))
  );

  let pattern = 'NEUTRAL_CONSOLIDATION';
  let expectationHurdle = 'LOW';
  let sellTheNewsRisk = 'LOW';
  let requiredForPead = 'BASE_CASE_BEAT';
  let hurdleVerdict = '';

  if (ret10d >= 15 || (ret5d >= 12 && volMult5d >= 2.5)) {
    pattern = 'MASSIVE_PRE_RESULT_ACCUMULATION_RUN_UP';
    expectationHurdle = 'VERY_HIGH';
    sellTheNewsRisk = 'HIGH';
    requiredForPead = 'BULL_CASE_BLOWOUT + GUIDANCE_RAISE';
    hurdleVerdict = `Stock surged +${ret10d.toFixed(1)}% (10D) / +${ret5d.toFixed(1)}% (5D) with ${volMult5d.toFixed(1)}x volume surge (peak ${maxSingleDayVolMult.toFixed(1)}x) into results. Pre-result accumulation is heavily priced in. An in-line or good base-case result faces high sell-the-news risk. To trigger a sustained PEAD drift, company needs a BULL-CASE BLOWOUT plus strong concall guidance (Suresh Gate 3).`;
  } else if (ret10d >= 7 || (ret5d >= 5 && volMult5d >= 1.8)) {
    pattern = 'INFORMED_ACCUMULATION_BREAKOUT';
    expectationHurdle = 'ELEVATED';
    sellTheNewsRisk = 'MODERATE';
    requiredForPead = 'BASE_BEAT_WITH_MARGIN_EXPANSION';
    hurdleVerdict = `Pre-result volume and price breakout (+${ret10d.toFixed(1)}% in 10D, ${volMult5d.toFixed(1)}x volume) indicates smart-money anticipation. Requires at least Base-Case Beat with expanding margins to prevent post-earnings profit booking.`;
  } else if (Math.abs(ret10d) <= 5 && avgDelivPct5d >= 50) {
    pattern = 'TIGHT_ACCUMULATION_BASE';
    expectationHurdle = 'LOW';
    sellTheNewsRisk = 'LOW';
    requiredForPead = 'BASE_CASE_BEAT';
    hurdleVerdict = `Stock is consolidating tightly (10D return ${ret10d.toFixed(1)}%) with high delivery (${avgDelivPct5d.toFixed(1)}%). Expectations are low and positioning is clean. Asymmetric PEAD springboard setup — any solid beat triggers immediate repositioning shock (Suresh Gate 1 & 3).`;
  } else if (ret10d <= -7) {
    pattern = 'PRE_RESULT_DE_RISKING';
    expectationHurdle = 'VERY_LOW';
    sellTheNewsRisk = 'LOW';
    requiredForPead = 'BASE_CASE_MEET_OR_BEAT';
    hurdleVerdict = `Stock de-risked into results (${ret10d.toFixed(1)}% over 10D). Expectations are depressed. Any operational beat will trigger sharp relief rally / short squeeze.`;
  } else {
    pattern = 'NEUTRAL_CONSOLIDATION';
    expectationHurdle = 'MODERATE';
    sellTheNewsRisk = 'MODERATE';
    requiredForPead = 'BASE_CASE_BEAT';
    hurdleVerdict = `Normal trading range into results (+${ret10d.toFixed(1)}% over 10D). A standard base-case beat with clear concall guidance is needed for PEAD drift.`;
  }

  const recentSessions = validRows.slice(0, 10).map((r) => ({
    date: r.mTIMESTAMP,
    close: r.CH_CLOSING_PRICE,
    volume: r.CH_TOT_TRADED_QTY,
    deliveryQty: r.COP_DELIV_QTY,
    deliveryPct: r.COP_DELIV_PERC,
  }));

  return {
    latestClose: latest.CH_CLOSING_PRICE,
    return5dPct: Math.round(ret5d * 10) / 10,
    return10dPct: Math.round(ret10d * 10) / 10,
    return20dPct: Math.round(ret20d * 10) / 10,
    volumeMultiplier5d: Math.round(volMult5d * 10) / 10,
    deliveryMultiplier5d: Math.round(delivMult5d * 10) / 10,
    avgDeliveryPct5d: Math.round(avgDelivPct5d * 10) / 10,
    totalDeliveryVal5dCr: Math.round(totalDelivVal5dCr * 10) / 10,
    maxSingleDayVolMult: Math.round(maxSingleDayVolMult * 10) / 10,
    pattern,
    expectationHurdle,
    sellTheNewsRisk,
    requiredForPead,
    hurdleVerdict,
    recentSessions,
  };
}

// ---------------------------------------------------------------- I/O

async function safe(errors, label, fn) {
  try {
    return await fn();
  } catch (e) {
    errors.push({ source: label, message: String((e && e.message) || e).slice(0, 300) });
    return null;
  }
}

async function main() {
  const { loadEnv, argValue, hasFlag } = req('packages/jobs-runtime/lib/env.js');
  loadEnv(argValue('--env-file'));
  const { sanitizeCompanyId } = req('stock-api/src/utils/companyId.js');
  const companyId = sanitizeCompanyId(argValue('--company') || '');
  if (!companyId) {
    console.error(
      'Usage: gather_inputs.js --company NSE:X [--as-of YYYY-MM-DD] [--extra-tickers A,B] [--force] [--out path]'
    );
    process.exit(1);
  }
  const asOf = argValue('--as-of') || new Date().toISOString().slice(0, 10);
  const force = hasFlag('--force');
  const maxFilingText = Number(argValue('--max-filing-text') || 15);
  const extraTickers = (argValue('--extra-tickers') || '').split(',').filter(Boolean);

  const { resolveJobName } = req('packages/jobs-runtime/lib/scriptJobName.js');
  const jobName = resolveJobName('pead-predictor');
  const db = req('packages/jobs-runtime/lib/db.js');
  const { StockscansClient } = req('stock-api/src/clients/StockscansClient.js');
  const { TradingViewClient } = req('stock-api/src/clients/TradingViewClient.js');
  const { NseClient } = req('stock-api/src/clients/NseClient.js');
  const { getCompanyFinancials } = req('stock-api/src/analyzers/companyFinancials.js');
  const tax = req('packages/jobs-runtime/lib/announcementTaxonomy.js');
  const stockscansContext = req('packages/jobs-runtime/lib/stockscansContext.js');
  const concallNotesStore = req('packages/jobs-runtime/lib/concallNotesStore.js');
  const pdfText = req('packages/jobs-runtime/lib/announcementPdfText.js');
  const orderBookLedger = req('packages/jobs-runtime/lib/orderBookLedger.js');
  const { buildCompanyContext } = req('packages/jobs-runtime/lib/companyContext.js');
  const companyMaster = req('packages/jobs-runtime/lib/companyMaster.js');
  const apiUsageTracker = req('packages/jobs-runtime/lib/apiUsageTracker.js');
  const incomeSignals = req('stock-api/src/analyzers/incomeStatementSignals.js');

  const client = new StockscansClient();
  client.setJobName && client.setJobName(jobName);
  const tv = new TradingViewClient();
  tv.setJobName(jobName);
  const nse = new NseClient();
  const errors = [];
  const out = {
    companyId,
    asOf,
    generatedAt: new Date().toISOString(),
    creator: 'pead-predictor',
    errors,
  };

  // identity
  await safe(errors, 'company-master', async () => {
    const hit =
      companyMaster.findByTicker(companyId) ||
      companyMaster.findByTicker(companyId.split(':').pop());
    out.identity = hit
      ? { name: hit.companyName, sector: hit.sector || null, industry: hit.industry || null }
      : { name: null, sector: null, industry: null };
  });

  // actuals
  const fin = await safe(errors, 'company-financials', () =>
    getCompanyFinancials(companyId, { client, force })
  );
  out.actuals = fin
    ? {
        layout: fin.layout,
        basis: fin.basis,
        quarters: fin.quarters,
        years: fin.years,
        ttm: fin.ttm,
        baselines: fin.baselines,
        warnings: fin.warnings,
        fetchedAt: fin.fetchedAt,
        fromCache: fin.fromCache,
      }
    : null;
  const latestQ = fin && fin.baselines && fin.baselines.latest_quarter;
  out.period = latestQ
    ? {
        latestReported: latestQ.fq,
        latestReportedEnd: quarterEndIso(latestQ),
        target: fin.baselines.next_quarter && fin.baselines.next_quarter.fq,
        targetFiscalYear: fin.baselines.next_quarter && fin.baselines.next_quarter.fiscalYear,
      }
    : null;
  out.shares = fin ? impliedShares(fin.quarters) : null;

  // pre-result price action & volume delivery accumulation (Onward Tech pattern, Suresh Gate 3)
  await safe(errors, 'price-action-delivery', async () => {
    const ticker = companyId.startsWith('NSE:') ? companyId.slice(4) : companyId.split(':').pop();
    const dTo = new Date(asOf);
    const dFrom = new Date(dTo);
    dFrom.setUTCDate(dFrom.getUTCDate() - 60);
    const rows = await nse.getPriceVolumeDeliverable(ticker, toNseDate(dFrom), toNseDate(dTo));
    out.priceAction = analyzePreResultPriceAction(rows);
  });

  // Result-quality scan of the latest reported quarter (one-off detection is mission-critical):
  // XBRL line items (NSE then BSE, PDF fallback inside the extractor) -> the shared
  // income-statement signal analyzer. Its cache is shared with quarterly-result-analysis, so a
  // quarter already scanned by that skill is a free hit (conventions §17).
  if (out.period) {
    await safe(errors, 'result-scan', () => {
      const { execFileSync } = require('child_process');
      const raw = execFileSync(
        'node',
        [
          path.join(
            REPO,
            'skills/equity-research/quarterly-result-extractor/scripts/extract_result_xbrl.js'
          ),
          '--companyId',
          companyId,
          '--quarter-end',
          out.period.latestReportedEnd,
        ],
        {
          encoding: 'utf8',
          timeout: 120000,
          maxBuffer: 64 * 1024 * 1024,
          stdio: ['ignore', 'pipe', 'ignore'],
        }
      );
      const x = JSON.parse(raw);
      const signals =
        x.found && x.lineData
          ? incomeSignals.getOrCompute(
              companyId,
              out.period.latestReportedEnd,
              x.lineData,
              x.context || {}
            )
          : null;
      out.resultScan = summariseResultScan(x, signals);
    });
  }

  // documents (latest transcript / ppt / result)
  const docs = await safe(errors, 'documents', () => client.documents(companyId));
  const docList = (docs && docs.documents) || [];
  const latestOf = (type) =>
    docList
      .filter((d) => d.documentType === type)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  out.documents = {
    latestTranscript: latestOf('Transcript'),
    latestPpt: latestOf('PPT'),
    latestResult: latestOf('Result'),
    hasGuidanceReport: !!(docs && docs.hasGuidanceReport),
    note: 'hasGuidanceReport = Stockscans native Guidance Report (Delivered/On track/Missed) exists — no client method yet; open it on stockscans.in as a credibility cross-check',
  };

  // guidance — Stockscans AI layer (7-day cache)
  const ssc = await safe(errors, 'stockscans-context', () =>
    stockscansContext.fetchStockscansContext(companyId)
  );
  const notesMd =
    ssc && ssc.concallNotes && (ssc.concallNotes.finalReport || ssc.concallNotes.text);
  out.guidance = {
    concallNotesDate:
      (ssc && ssc.concallNotes && (ssc.concallNotes.date || ssc.concallNotes.eventUtcDatetime)) ||
      null,
    guidanceRows: parseTablesUnder(notesMd, GUIDANCE_HEAD_RE),
    keyMetricRows: parseTablesUnder(notesMd, METRICS_HEAD_RE),
    growthCatalysts:
      ssc && ssc.growthCatalysts
        ? stockscansContext.plainText(ssc.growthCatalysts.finalReport).slice(0, 6000)
        : null,
    businessOverview:
      ssc && ssc.businessOverview
        ? stockscansContext.plainText(ssc.businessOverview.finalReport).slice(0, 3000)
        : null,
    fromCache: !!(ssc && ssc.fromCache),
    sourceErrors: (ssc && ssc.errors) || [],
  };

  // walk-the-talk: prior concalls' guidance tables (permanent cache, no API spend)
  out.guidanceHistory = await safe(errors, 'concall-notes-history', () =>
    (concallNotesStore.listQuarters(companyId) || [])
      .sort()
      .reverse()
      .slice(0, 5)
      .map((date) => {
        const b = concallNotesStore.get(companyId, date);
        return { date, guidanceRows: parseTablesUnder(b && b.finalReport, GUIDANCE_HEAD_RE) };
      })
  );
  out.forwardGuidanceDtos = await safe(errors, 'forward-guidance-dtos', () =>
    db
      .find('reports', { type: 'forward-guidance', companyId })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 4)
      .map((r) => {
        const full = db.readReport(r.id) || {};
        return {
          id: r.id,
          date: r.date,
          quarter: full.quarter,
          items: full.items || full.guidance || null,
        };
      })
  );

  // What our own skills already concluded about this company (data reuse, not skill invocation):
  // walk-the-talk / guidance table / monitoring checklist / PEAD read from the latest result
  // analysis, J-curve stage from rerating-catalysts, credibility score, filings diffs.
  out.priorAnalyses = await safe(errors, 'prior-analyses', () => priorAnalyses(db, companyId));

  // transcript keyword windows (cached PDF text)
  const tr = out.documents.latestTranscript;
  if (tr && tr.ssUrl) {
    const t = await safe(errors, 'transcript-text', () =>
      pdfText.fetchText(companyId, tr.ssUrl, String(tr.date), { client })
    );
    out.transcript = t
      ? {
          date: tr.date,
          url: `https://www.stockscans.in/document/${tr.ssUrl}`,
          chars: t.chars,
          scanned: t.scanned,
          ...keywordWindows(t.text),
        }
      : null;
  }

  // filings since the latest reported quarter's end
  const windowStart = out.period ? out.period.latestReportedEnd : null;
  const concallIso = (() => {
    const d = out.guidance.concallNotesDate;
    if (!d) return null;
    const s = String(d);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
  })();
  const anns = [];
  await safe(errors, 'announcements', async () => {
    for (let page = 0; page < 10; page++) {
      const data = await client.announcements([companyId], page * 30);
      const rows = (data && data.companyAnnouncements) || [];
      let stop = false;
      for (const a of rows) {
        if (windowStart && a.date && a.date < windowStart) {
          stop = true;
          break;
        }
        anns.push(a);
      }
      if (stop || rows.length < 30) break;
    }
  });
  const resultsFiling = anns
    .filter((a) => tax.categoriseAnnouncement(a.title, a.description) === 'results')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  // The concall itself is the "known" boundary: anything filed up to the transcript filing (or, failing
  // that, the results filing) was available to management/analysts on the call -> KNOWN_AT_CONCALL.
  const transcriptFiling = anns
    .filter((a) => tax.categoriseAnnouncement(a.title, a.description) === 'concall_transcript')
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
  const knownCutoff =
    concallIso ||
    (transcriptFiling && transcriptFiling.date) ||
    (resultsFiling && resultsFiling.date) ||
    null;
  const filings = anns.map((a) => {
    const category = tax.categoriseAnnouncement(a.title, a.description);
    const tags = dotTags(a.title, a.description);
    const routine =
      ROUTINE_RE.test(`${a.title} ${a.description}`) && !tags.some((x) => x !== 'management');
    return {
      date: a.date,
      title: (a.title || '').trim(),
      description: (a.description || '').trim().slice(0, 300),
      ssUrl: a.ssUrl,
      url: a.ssUrl ? `https://www.stockscans.in/document/${a.ssUrl}` : null,
      category,
      significance: tax.significanceOf(category),
      dotTags: tags,
      routine,
      status: knownCutoff && a.date <= knownCutoff ? 'KNOWN_AT_CONCALL' : 'NEW_SINCE_CONCALL',
    };
  });
  const material = filings
    .filter(
      (f) =>
        !f.routine &&
        !BASE_DOC_CATEGORIES.has(f.category) &&
        (f.dotTags.length || f.significance !== 'NORMAL')
    )
    .slice(0, maxFilingText);
  for (const f of material) {
    if (!f.ssUrl) continue;
    const t = await safe(errors, `filing-text ${f.date}`, () =>
      pdfText.fetchText(companyId, f.ssUrl, f.date, { client })
    );
    if (t && t.text) {
      f.textHead = t.text.replace(/\s+/g, ' ').slice(0, 2500);
      f.numbers = [
        ...new Set(
          (
            t.text.match(
              /(?:₹|rs\.?|inr)\s?[\d,]+(?:\.\d+)?\s*(?:cr(?:ore)?|lakh|mn|million|bn)?|[\d,.]+\s*(?:mw|mtpa|tpa|tonnes?|units|%|crore|cr)\b/gi
            ) || []
          )
            .map((s) => s.trim())
            .filter((s) => /\d/.test(s))
        ),
      ].slice(0, 25);
      f.scanned = !!t.scanned;
    }
  }
  out.filings = {
    windowStart,
    knownCutoff,
    knownCutoffBasis: concallIso
      ? 'concall date'
      : transcriptFiling
        ? 'transcript filing date'
        : resultsFiling
          ? 'results filing date'
          : 'unknown',
    resultsFilingDate: resultsFiling ? resultsFiling.date : null,
    total: filings.length,
    material: material.length,
    items: filings,
  };

  // order book ledger
  out.orderBook = await safe(errors, 'order-book-ledger', () => orderBookLedger.get(companyId));

  // monthly business updates in window
  out.monthlyUpdates = await safe(errors, 'monthly-updates', () => {
    const f = path.join(db.dataRoot(), 'cache', 'monthly-updates-parsed', 'parsed.jsonl');
    if (!fs.existsSync(f)) return [];
    return fs
      .readFileSync(f, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter(
        (r) =>
          r.companyId === companyId &&
          (!windowStart || r.date >= windowStart) &&
          r.parsed &&
          r.parsed.usable !== false
      )
      .map((r) => ({ date: r.date, title: r.title, parsed: r.parsed }));
  });

  // macro
  await safe(errors, 'macro', async () => {
    const basket = JSON.parse(
      fs.readFileSync(path.join(REPO, 'skills/_shared/macro/commodity-basket.json'), 'utf8')
    );
    const id = out.identity || {};
    const { rule, keys } = basketFor(basket, id.sector, id.industry);
    const instruments = keys
      .map((k) => ({ key: k, ...basket.instruments[k] }))
      .filter((i) => i.ticker);
    extraTickers.forEach((t) =>
      instruments.push({ key: t, ticker: t, label: t, unit: null, extra: true })
    );
    const perf = await tv.getPerformance(instruments.map((i) => i.ticker));
    const logPath = path.join(REPO, 'skills/_shared/macro/quarterly-macro-context.md');
    const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
    const target = out.period && out.period.target;
    out.macro = {
      industryRule: rule,
      instruments: instruments.map((i) => macroRead(perf[i.ticker], i)),
      quarterLogCoversTarget: !!(target && new RegExp(`^## ${target}\\b`, 'm').test(log)),
      quarterLogSections: (log.match(/^## Q[1-4]FY\d{2}.*$/gm) || []).map((s) =>
        s.replace(/^## /, '')
      ),
    };
    const snaps = db.find('events', { type: 'market_snapshot' }) || [];
    const last = snaps.sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    out.macro.marketSnapshot = last
      ? {
          date: last.date,
          macro: last.snapshot && last.snapshot.macro,
          flows: last.snapshot && last.snapshot.flows,
        }
      : null;
  });

  // our own history (calibration)
  out.history = await safe(errors, 'history', () => {
    const priorPredictions = [
      ...db.find('reports', { type: 'pead-prediction', companyId }),
      ...db.find('reports', { type: 'growth-prediction', companyId }),
    ].map((r) => ({ id: r.id, date: r.date, summary: r.summary }));

    const scores = [
      ...(db.find('validation', { type: 'pead-prediction-score', companyId }) || []),
      ...(db.find('validation', { type: 'growth-prediction-score', companyId }) || []),
    ].map((v) => ({
      id: v.id,
      date: v.date,
      targetQuarter: v.targetQuarter,
      revenueErrPct: v.errors && v.errors.revenue,
      patErrPct: v.errors && v.errors.pat,
      band: v.band,
    }));

    return { priorPredictions, scores };
  });

  // context (conventions §8)
  await safe(errors, 'company-context', () => {
    const ctx = buildCompanyContext(companyId, { reports: 5, notes: 10, eventDays: 120 });
    out.context = {
      availableIds: ctx.availableIds || [],
      reports: (ctx.reports || []).map((r) => ({
        id: r.id,
        type: r.type,
        date: r.date,
        summary: r.summary,
      })),
      notes: (ctx.notes || []).slice(0, 10).map((n) => ({
        id: n.id,
        date: n.date,
        type: n.type,
        summary: n.summary || n.insight || n.text,
      })),
      thesis: ctx.thesis || null,
    };
  });

  const safeId = companyId.replace(/[^A-Za-z0-9]+/g, '_');
  const outPath =
    argValue('--out') || db.runPath('pead-predictor', `${safeId}-${asOf}`, 'inputs.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 1));
  apiUsageTracker.flush && apiUsageTracker.flush(jobName);

  console.log(
    JSON.stringify({
      out: outPath,
      company: out.identity && out.identity.name,
      latestReported: out.period && out.period.latestReported,
      target: out.period && out.period.target,
      priceActionPattern: out.priceAction ? out.priceAction.pattern : 'none',
      expectationHurdle: out.priceAction ? out.priceAction.expectationHurdle : 'none',
      guidanceRows: out.guidance.guidanceRows.length,
      priorConcalls: (out.guidanceHistory || []).length,
      transcriptExcerptChars: out.transcript ? out.transcript.excerpt.length : 0,
      filings: out.filings.total,
      materialFilings: out.filings.material,
      macroInstruments: out.macro ? out.macro.instruments.length : 0,
      resultScan: out.resultScan
        ? out.resultScan.found
          ? `${out.resultScan.source}:${(out.resultScan.material || []).length} material`
          : 'not found'
        : 'skipped',
      priorAnalyses: (out.priorAnalyses || []).map((p) => p.type),
      macroLogCoversTarget: out.macro ? out.macro.quarterLogCoversTarget : false,
      errors: errors.map((e) => e.source),
    })
  );
}

/** Slim the XBRL extraction + signal scan to what the reasoning step needs. Pure. */
function summariseResultScan(x, signals) {
  if (!x || !x.found) return { found: false, issues: (x && x.issueSummary) || null };
  const ld = x.lineData || {};
  const exc = ld.exceptionalItems && ld.exceptionalItems.value;
  const suggestions = [];
  if (exc) {
    suggestions.push(
      `Exceptional items ${exc.toFixed(1)} cr in ${x.quarterEnd}: Stockscans folds these into other income/PAT — clean the base (pre-tax; check the after-tax figure in the concall/press release)`
    );
  }
  const oi = ld.otherIncome;
  if (oi && oi.value != null && oi.qoq != null && oi.yoy != null) {
    suggestions.push(
      `Core (XBRL) other income ${oi.value.toFixed(1)} cr vs ${oi.qoq.toFixed(1)} QoQ / ${oi.yoy.toFixed(1)} YoY — use this, not Stockscans' merged figure, as the run-rate`
    );
  }
  if (
    ld.changeInInventories &&
    ld.costOfMaterials &&
    ld.costOfMaterials.pctOfSalesQoQDeltaBps != null
  ) {
    suggestions.push(
      `RM cost ${ld.costOfMaterials.pctOfSalesQoQDeltaBps > 0 ? '+' : ''}${ld.costOfMaterials.pctOfSalesQoQDeltaBps} bps of sales QoQ; inventory change ${ld.changeInInventories.value.toFixed(1)} cr (negative = build-up = temporary margin help)`
    );
  }
  return {
    found: true,
    source: x.source,
    exchange: x.exchange,
    consolidated: x.consolidated,
    quarterEnd: x.quarterEnd,
    headline: x.headline,
    lineData: ld,
    material: signals ? signals.material : null,
    combinations: signals ? signals.combinations : null,
    signalsFromCache: signals ? !!signals.fromCache : null,
    suggestions,
    issues: x.issueSummary || null,
  };
}

const PRIOR_TYPES = [
  'quarterly-result',
  'quarterly-result-analysis',
  'rerating-catalysts',
  'management-credibility',
  'consecutive-filings-diff-forensic-check',
  'filings-diff',
  'growth-triggers-1pager',
  'investment-thesis',
];
const PRIOR_FIELDS = [
  'summary',
  'quarter',
  'verdictChips',
  'guidanceTable',
  'peadRead',
  'monitoringChecklist',
  'walkTheTalk',
  'inflectionPoint',
  'nextInflection',
  'jcurveStage',
  'credibility',
  'score',
  'rating',
  'verdict',
];

/** Latest stored analysis per type for the company, slimmed to forecasting-relevant fields. */
function priorAnalyses(db, companyId) {
  const out = [];
  for (const type of PRIOR_TYPES) {
    const r = (db.find('reports', { type, companyId }) || []).sort((a, b) =>
      String(b.date).localeCompare(String(a.date))
    )[0];
    if (!r) continue;
    const full = db.readReport(r.id) || {};
    const slim = { id: r.id, type, date: r.date };
    for (const f of PRIOR_FIELDS) if (full[f] != null) slim[f] = full[f];
    const txt = JSON.stringify(slim);
    out.push(
      txt.length > 12000
        ? { id: r.id, type, date: r.date, summary: r.summary, truncated: true }
        : slim
    );
  }
  return out;
}

module.exports = {
  summariseResultScan,
  priorAnalyses,
  parseTablesUnder,
  keywordWindows,
  dotTags,
  quarterEndIso,
  impliedShares,
  basketFor,
  macroRead,
  analyzePreResultPriceAction,
  toNseDate,
  ROUTINE_RE,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
