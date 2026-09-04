'use strict';
/**
 * Persistence + DTO assembly for the monthly-updates tracker.
 *
 * DATA_RULES compliance:
 *  - §1/§2: no new collection. Each filing's reading is an `events` record with
 *    a new `type` ('monthly-business-update'), which the rules prefer over a
 *    new collection. The rendered page is an asset built from a report DTO.
 *  - §4: every record carries the envelope via the db.js helpers, creator
 *    'monthly-updates'.
 *  - §5: writes go through db.js only; no deletes anywhere.
 */

const db = require('../lib/db.js');
const { loadAllParsed } = require('./parseFiling.js');
const { buildCompanySeries } = require('./buildSeries.js');

const CREATOR = 'monthly-updates';
const EVENT_TYPE = 'monthly-business-update';
const REPORT_TYPE = 'monthly-updates-tracker';

/** One event per filing reading. Deterministic id ⇒ re-runs upsert, never duplicate. */
function persistEvents(parsedRecords) {
  const records = parsedRecords
    .filter((r) => r.parsed && r.parsed.usable)
    .map((r) => ({
      type: EVENT_TYPE,
      creator: CREATOR,
      companyId: r.companyId,
      // `date` is the market/business date the record is ABOUT — the reporting
      // month, not the filing date (which is kept separately as filedOn).
      date: `${r.parsed.periodLabel}-01`,
      filedOn: r.date,
      period: r.parsed.periodLabel,
      periodInferred: !!r.parsed.periodInferred,
      metricName: r.parsed.metricName,
      unit: r.parsed.unit,
      value: r.parsed.currentValue,
      priorYearValue: r.parsed.priorYearValue,
      ytdValue: r.parsed.ytdValue,
      ytdPriorYearValue: r.parsed.ytdPriorYearValue,
      scope: r.parsed.scope,
      segments: r.parsed.segments,
      confidence: r.parsed.confidence,
      notes: r.parsed.notes,
      ssUrl: r.ssUrl,
      docUrl: r.ssUrl ? `https://www.stockscans.in/document/${r.ssUrl}` : null,
    }));
  return { stats: db.appendEvents(records, { creator: CREATOR }), count: records.length };
}

/**
 * The canonical DTO. The HTML page is a pure render of this (conventions §5),
 * so the page can always be regenerated without re-reading a single PDF.
 */
function buildDto(series, meta = {}) {
  const asOf = new Date().toISOString().slice(0, 10);
  const withHistory = series.filter((c) => c.months >= 2);
  return {
    type: REPORT_TYPE,
    creator: CREATOR,
    date: asOf,
    scope: 'monthly-updates',
    title: 'Monthly Business Updates — Sales Tracker',
    generatedAt: new Date().toISOString(),
    companyIds: series.map((c) => c.companyId),
    summary: {
      companies: series.length,
      companiesWithHistory: withHistory.length,
      companiesWith12m: series.filter((c) => c.months >= 12).length,
      filingsParsed: meta.filingsParsed || null,
      latestPeriod: series.reduce((a, c) => (c.latestPeriod > a ? c.latestPeriod : a), ''),
      units: [...new Set(series.map((c) => c.unit).filter(Boolean))],
    },
    companies: series,
    provenance: {
      source: 'Stockscans saved announcement scan "Monthly Updates" (0b85d5ecbd43531ee2f10213)',
      cohort: 'announcements filed on day 1-3 of a month',
      extraction: 'pdftotext -layout, tesseract OCR fallback',
      parse:
        'agent-read (no model API); growth computed deterministically in JS from stored levels',
      ...meta,
    },
  };
}

function persistAll({ dryRun = false } = {}) {
  const parsed = loadAllParsed();
  const series = buildCompanySeries(parsed);
  const dto = buildDto(series, { filingsParsed: parsed.length });
  if (dryRun) return { dto, series, eventStats: null };
  const ev = persistEvents(parsed);
  const saved = db.saveReport(dto);
  return {
    dto,
    series,
    eventStats: ev,
    reportId: saved && saved.id ? saved.id : dto.id,
    touched: db.touchedFiles(),
  };
}

module.exports = { persistAll, persistEvents, buildDto, EVENT_TYPE, REPORT_TYPE, CREATOR };
