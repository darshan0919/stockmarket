'use strict';

/**
 * companyContext.js — the context API of Data Ecosystem v2.
 *
 * Convention §8 (skills/_shared/conventions.md): every company-scoped skill that
 * generates a report/insight MUST call buildCompanyContext(companyId) before
 * generating, consider the returned artifacts, and record which ones it used in
 * its DTO as `contextUsed: [ids]`.
 */

const db = require('./db');
const { sanitizeCompanyId } = require('@stock/api/utils/companyId');
const stockscansContext = require('./stockscansContext');

let companyMaster = null;
function master() {
  if (!companyMaster) {
    try {
      companyMaster = require('./companyMaster');
    } catch (_) {
      companyMaster = false;
    }
  }
  return companyMaster || null;
}

const clip = (s, n) => (typeof s === 'string' && s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Build the research context bundle for one company.
 *
 * @param {string} companyId canonical id, e.g. "NSE:SWARAJENG"
 * @param {object} [opts]
 * @param {number} [opts.reports=5]   how many recent report index entries
 * @param {number} [opts.notes=20]    how many recent notes
 * @param {number} [opts.eventDays=90]
 * @param {boolean} [opts.fullLatestReports=true] include full DTO of the latest
 *   report per type (deepdive, concall-analysis, ...), not just summaries
 * @param {number} [opts.maxChars=120000] rough size budget for the bundle
 * @param {boolean} [opts.stockscans=false] attach Stockscans' own AI-synthesized
 *   research (business overview, growth catalysts, latest concall notes) from the
 *   local cache. CACHE-ONLY and opt-in — see the note at the attach site below.
 * @param {number} [opts.stockscansTtlDays] override the staleness bound for that
 *   cache read (defaults to stockscansContext.DEFAULT_TTL_DAYS)
 * @param {number} [opts.stockscansMaxChars=8000] per-field clip for that block —
 *   its own budget, deliberately independent of `maxChars` (see the attach site)
 */
function buildCompanyContext(companyId, opts = {}) {
  // Entry-point sanitization — every company-scoped skill calls this before
  // generating (Convention §8), so this is the highest-leverage single place
  // to guarantee a "-BE"/"-SM"-suffixed companyId never leaks into a context
  // lookup, and therefore never into a saved report/event/thesis downstream.
  companyId = sanitizeCompanyId(companyId);
  const {
    reports = 5,
    notes = 20,
    eventDays = 90,
    conversations = 10,
    fullLatestReports = true,
    maxChars = 120000,
    stockscans = false,
    stockscansTtlDays,
    stockscansMaxChars = 8000,
  } = opts;

  const company = db.get('companies', companyId);

  // Identity: prefer companies.json, fall back to Kite master cache.
  let identity = company
    ? {
        id: company.id,
        name: company.name,
        nseTicker: company.nseTicker,
        bseScripCode: company.bseScripCode,
        isin: company.isin,
        sector: company.sector,
        industry: company.industry,
        keywords: company.keywords,
        watchlist: company.watchlist,
      }
    : null;
  if (!identity && master()) {
    const ticker = companyId.split(':')[1];
    const m = companyId.startsWith('NSE:')
      ? master().findByTicker(ticker)
      : master().findByScripCode(ticker);
    if (m)
      identity = {
        id: companyId,
        name: m.companyName,
        nseTicker: m.nseTicker,
        bseScripCode: m.bseTicker,
        keywords: m.keywords,
      };
  }

  const thesis = db.get('theses', companyId);

  const reportIndex = db.find('reports', { companyId, limit: reports, sort: 'date' });
  const latestFullByType = {};
  if (fullLatestReports) {
    for (const entry of reportIndex) {
      if (!latestFullByType[entry.type]) {
        const body = db.readReport(entry.id);
        if (body) latestFullByType[entry.type] = body;
      }
    }
  }

  const sinceIso = new Date(Date.now() - eventDays * 864e5).toISOString().slice(0, 10);
  const events = db.find('events', { companyId, since: sinceIso, sort: 'date' });
  const noteRecords = db.find('notes', { companyId, limit: notes, sort: 'modifiedTime' });
  const insights = db.find('validation', { companyId, since: sinceIso, sort: 'date' });
  const conversationRecords = db.find('conversations', {
    companyId,
    limit: conversations,
    sort: 'date',
  });

  const bundle = {
    companyId,
    identity,
    manual: company ? company.manual : {},
    thesis,
    reports: reportIndex.map((r) => ({ ...r, summary: clip(r.summary, 2000) })),
    latestFullByType,
    events: events.map((e) => ({
      id: e.id,
      date: e.date,
      type: e.type,
      summary: clip(e.summary || e.headline, 500),
      conviction: e.conviction,
    })),
    notes: noteRecords.map((n) => ({
      id: n.id,
      date: n.date,
      creator: n.creator,
      text: clip(n.text || n.summary, 1500),
    })),
    insights: insights.map((v) => ({
      id: v.id,
      date: v.date,
      verdict: v.verdict,
      symbol: v.symbol,
    })),
    conversations: conversationRecords.map((c) => ({
      id: c.id,
      date: c.date,
      type: c.type,
      title: c.title,
      summary: clip(c.summary, 800),
    })),
    availableIds: [], // filled below — everything a skill can cite in contextUsed
  };

  // Enforce the size budget: drop the heaviest parts first (full DTOs → old events).
  const size = () => JSON.stringify(bundle).length;
  if (size() > maxChars) {
    const types = Object.keys(bundle.latestFullByType);
    while (size() > maxChars && types.length > 1) delete bundle.latestFullByType[types.pop()];
  }
  while (size() > maxChars && bundle.events.length > 20)
    bundle.events.length = Math.floor(bundle.events.length / 2);
  while (size() > maxChars && bundle.notes.length > 5)
    bundle.notes.length = Math.floor(bundle.notes.length / 2);

  // Stockscans' own AI-synthesized research: business overview, growth catalysts,
  // and notes from the latest concall on file. Opt-in and CACHE-ONLY.
  //
  // Opt-in because it is genuinely useful only to skills doing company-level
  // reasoning (the WHY ladder, info-classification, catalyst work) and is pure
  // weight for the many callers that just want notes and events.
  //
  // Cache-only because this function is synchronous by contract and every
  // company-scoped skill calls it (conventions §8) — awaiting three HTTP calls
  // per company here would put a network round trip on the hottest path in the
  // repo. `warmStockscansContext.js` does the fetching on a schedule; a miss here
  // is normal and the caller simply gets `stockscans: null`, which must degrade
  // to whatever it did before rather than triggering a fetch.
  //
  // Attached AFTER the maxChars enforcement above, and bounded by its own
  // per-field `stockscansMaxChars` instead: an earlier draft put it inside that
  // budget and it was silently dropped for every company with a large report DTO
  // on file (the general budget is not reliably reachable — a single full deepdive
  // DTO can exceed it on its own), which would have made the feature look like it
  // worked while delivering nothing for exactly the well-researched companies that
  // need it most. A self-contained, predictable cap is the honest fix.
  //
  // Never fabricate this content: it is Stockscans' text, carried verbatim, and a
  // skill citing it should say so (`contextUsed` picks up `stockscans:<id>`).
  if (stockscans) {
    // `!= null`, not a truthiness check — `stockscansTtlDays: 0` is a meaningful
    // value ("treat any cached bundle as stale"), and a falsy check silently
    // ignored it, which is the worst kind of override: one that looks applied.
    const ss = stockscansContext.readCached(
      companyId,
      stockscansTtlDays != null ? { ttlDays: stockscansTtlDays } : {}
    );
    const ssClip = (t) => clip(stockscansContext.plainText(t), stockscansMaxChars);
    bundle.stockscans = ss
      ? {
          fetchedAt: ss.fetchedAt,
          businessOverview: ssClip(ss.businessOverview && ss.businessOverview.finalReport),
          growthCatalysts: ssClip(ss.growthCatalysts && ss.growthCatalysts.finalReport),
          growthCatalystsAsOf: (ss.growthCatalysts && ss.growthCatalysts.dateLabel) || null,
          concallNotes: ssClip(ss.concallNotes && ss.concallNotes.finalReport),
          concallNotesQuarter: (ss.concallNotes && ss.concallNotes.date) || null,
          // A source that errored is reported, not silently dropped — "we looked
          // and this company has no transcript on file" and "we never looked" are
          // different facts, and only the first one is safe to reason from.
          unavailable: (ss.errors || []).map((e) => e.source),
        }
      : null;
  }

  bundle.availableIds = [
    ...(thesis ? [thesis.id] : []),
    ...bundle.reports.map((r) => r.id),
    ...bundle.events.map((e) => e.id),
    ...bundle.notes.map((n) => n.id),
    ...bundle.insights.map((v) => v.id),
    ...bundle.conversations.map((c) => c.id),
    ...(bundle.stockscans ? [`stockscans:${companyId}`] : []),
  ];
  return bundle;
}

module.exports = { buildCompanyContext };
