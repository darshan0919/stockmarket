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
 *   historyPack  the quarterly-result-history pack (verified prior-call digests: tone/topic arc,
 *                one-off recurrence, known catalysts, prior-guidance ledger), when one exists
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

const {
  GUIDANCE_HEAD_RE,
  METRICS_HEAD_RE,
  ROUTINE_RE,
  parseTablesUnder,
  keywordWindows,
  dotTags,
  quarterEndIso,
  impliedShares,
  basketFor,
  macroRead,
  analyzePreResultPriceAction,
  toNseDate,
  summariseResultScan,
  priorAnalyses,
  fetchAnnouncementsSince,
  classifyFilings,
  materialFilings,
  concallGuidanceHistory,
} = req('packages/jobs-runtime/lib/resultHistory/inputs.js');
const { REPORT_TYPE: HISTORY_TYPE, historyContextOf } = req(
  'packages/jobs-runtime/lib/resultHistory/historyPack.js'
);

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
    concallGuidanceHistory(concallNotesStore, companyId, 5)
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

  // quarterly-result-history pack (quarterly-result-extractor Step 0), when one exists: the
  // verified prior-call digests' reading (tone/topic arc, one-off recurrence, known catalysts,
  // prior-guidance ledger) — reused here instead of re-reading old transcripts.
  out.historyPack = await safe(errors, 'history-pack', () => {
    const idx = (db.find('reports', { type: HISTORY_TYPE, companyId }) || []).sort((a, b) =>
      String(b.date).localeCompare(String(a.date))
    )[0];
    const pack = idx ? db.readReport(idx.id) : null;
    return pack
      ? { ...historyContextOf(pack), walkTheTalkSkeleton: pack.walkTheTalkSkeleton }
      : null;
  });

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
  const anns =
    (await safe(errors, 'announcements', () =>
      fetchAnnouncementsSince(client, companyId, windowStart)
    )) || [];
  const classified = classifyFilings(anns, tax, { concallIso, windowStart });
  const filings = classified.items;
  const material = materialFilings(filings, maxFilingText);
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
  out.filings = { ...classified, material: material.length };

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
      historyPack: out.historyPack ? out.historyPack.packId : null,
      macroLogCoversTarget: out.macro ? out.macro.quarterLogCoversTarget : false,
      errors: errors.map((e) => e.source),
    })
  );
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
