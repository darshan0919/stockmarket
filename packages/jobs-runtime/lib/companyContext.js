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
 */
function buildCompanyContext(companyId, opts = {}) {
  const {
    reports = 5, notes = 20, eventDays = 90, conversations = 10,
    fullLatestReports = true, maxChars = 120000,
  } = opts;

  const company = db.get('companies', companyId);

  // Identity: prefer companies.json, fall back to Kite master cache.
  let identity = company
    ? { id: company.id, name: company.name, nseTicker: company.nseTicker, bseScripCode: company.bseScripCode, isin: company.isin, sector: company.sector, industry: company.industry, keywords: company.keywords, watchlist: company.watchlist }
    : null;
  if (!identity && master()) {
    const ticker = companyId.split(':')[1];
    const m = companyId.startsWith('NSE:') ? master().findByTicker(ticker) : master().findByScripCode(ticker);
    if (m) identity = { id: companyId, name: m.companyName, nseTicker: m.nseTicker, bseScripCode: m.bseTicker, keywords: m.keywords };
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
  const conversationRecords = db.find('conversations', { companyId, limit: conversations, sort: 'date' });

  const bundle = {
    companyId,
    identity,
    manual: company ? company.manual : {},
    thesis,
    reports: reportIndex.map((r) => ({ ...r, summary: clip(r.summary, 2000) })),
    latestFullByType,
    events: events.map((e) => ({ id: e.id, date: e.date, type: e.type, summary: clip(e.summary || e.headline, 500), conviction: e.conviction })),
    notes: noteRecords.map((n) => ({ id: n.id, date: n.date, creator: n.creator, text: clip(n.text || n.summary, 1500) })),
    insights: insights.map((v) => ({ id: v.id, date: v.date, verdict: v.verdict, symbol: v.symbol })),
    conversations: conversationRecords.map((c) => ({ id: c.id, date: c.date, type: c.type, title: c.title, summary: clip(c.summary, 800) })),
    availableIds: [], // filled below — everything a skill can cite in contextUsed
  };

  // Enforce the size budget: drop the heaviest parts first (full DTOs → old events).
  const size = () => JSON.stringify(bundle).length;
  if (size() > maxChars) {
    const types = Object.keys(bundle.latestFullByType);
    while (size() > maxChars && types.length > 1) delete bundle.latestFullByType[types.pop()];
  }
  while (size() > maxChars && bundle.events.length > 20) bundle.events.length = Math.floor(bundle.events.length / 2);
  while (size() > maxChars && bundle.notes.length > 5) bundle.notes.length = Math.floor(bundle.notes.length / 2);

  bundle.availableIds = [
    ...(thesis ? [thesis.id] : []),
    ...bundle.reports.map((r) => r.id),
    ...bundle.events.map((e) => e.id),
    ...bundle.notes.map((n) => n.id),
    ...bundle.insights.map((v) => v.id),
    ...bundle.conversations.map((c) => c.id),
  ];
  return bundle;
}

module.exports = { buildCompanyContext };
