'use strict';

const crypto = require('crypto');
const { nowIstIso } = require('./ist');
const db = require('./db');

const emptyNotes = () => ({
  meta: { version: '2.0', lastRun: null, totalCompanies: 0, totalNotes: 0 },
  companies: {},
});

/**
 * Notes DB — v2 adapter (docs/DATA_ECOSYSTEM.md).
 *
 * Keeps the legacy blob API ({ meta, companies: { cid: { notes[], businessSummary,
 * processedAnnouncements[] } } }) that watchlistInsights.js / insightValidator.js
 * consume, but persists via lib/db.js flat collections:
 *   - each note            → one record in notes.json (deterministic id → no dupes)
 *   - businessSummary      → a type:"business-summary" note record (one per company)
 *   - processedAnnouncements, ticker, name
 *                          → companies.json (per-company `state.processedAnnouncements`)
 * load() recomposes the blob; save() decomposes it. No files outside data/*.json.
 */
class NotesDb {
  constructor(_notesDir) {
    db.init();
  }

  getLatestFile() {
    // Legacy-compat identifier (some callers log it / hash it for run ids).
    return 'notes.json';
  }

  initRun() {
    return this.getLatestFile();
  }

  currentRunFile() {
    return this.getLatestFile();
  }

  load() {
    const notes = emptyNotes();
    const companies = db.loadFile(db.collectionFile('companies'));

    for (const rec of db.find('notes', {})) {
      const cid = rec.companyId;
      if (!cid) continue;
      const co = NotesDb.ensureCompany(notes, cid);
      if (rec.type === 'business-summary') {
        if ((rec.modifiedTime || '') >= (co._bsTime || '')) {
          co.businessSummary = rec.text || '';
          co._bsTime = rec.modifiedTime || '';
        }
        continue;
      }
      // Recompose the note shape the jobs expect (tolerate migrated records).
      co.notes.push({
        ...rec,
        insight: rec.insight || rec.text,
        announcementId: rec.announcementId || rec.sourceAnnouncement,
        createdAt: rec.createdAt || rec.creationTime,
      });
    }

    for (const co of Object.values(notes.companies)) {
      delete co._bsTime;
      co.notes.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
      const c = companies[co.companyId];
      if (c) {
        co.ticker = co.ticker || c.nseTicker || String(co.companyId).split(':')[1] || '';
        co.name = co.name || c.name || '';
        co.processedAnnouncements = (c.state && c.state.processedAnnouncements) || [];
        co.lastUpdated = c.modifiedTime || co.lastUpdated;
      }
      co.notes.forEach(() => { notes.meta.totalNotes += 1; });
    }
    notes.meta.totalCompanies = Object.keys(notes.companies).length;
    return notes;
  }

  async save(notes) {
    const now = nowIstIso();
    const noteRecords = [];
    const companyUpserts = [];

    for (const [cid, co] of Object.entries(notes.companies || {})) {
      for (const n of co.notes || []) {
        noteRecords.push({
          ...n,
          companyId: cid,
          type: n.type || n.category || 'insight',
          creator: n.creator || 'watchlist-insights',
          date: String(n.date || n.createdAt || n.creationTime || '').slice(0, 10) || undefined,
          creationTime: n.creationTime || n.createdAt,
          text: n.text || n.insight,
          announcementId: n.announcementId || n.sourceAnnouncement,
        });
      }
      if (co.businessSummary) {
        noteRecords.push({
          companyId: cid,
          type: 'business-summary',
          creator: 'watchlist-insights',
          text: co.businessSummary,
          // Deterministic per-company id → updates in place as summary evolves.
          id: db.makeId('note', 'watchlist-insights', cid, '', 'business-summary'),
        });
      }
      companyUpserts.push({
        id: cid,
        creator: 'watchlist-insights',
        nseTicker: co.ticker || undefined,
        name: co.name || undefined,
        state: { processedAnnouncements: co.processedAnnouncements || [] },
      });
    }

    if (noteRecords.length) db.appendNotes(noteRecords);
    if (companyUpserts.length) db.upsertMany('companies', companyUpserts);

    notes.meta.lastRun = now;
    notes.meta.totalCompanies = Object.keys(notes.companies || {}).length;
    notes.meta.totalNotes = Object.values(notes.companies || {}).reduce(
      (s, c) => s + (c.notes || []).length, 0
    );
  }

  static getCompany(notes, companyId) {
    return (notes.companies || {})[companyId] || null;
  }

  static ensureCompany(notes, companyId, ticker = '', name = '') {
    notes.companies ||= {};
    if (!notes.companies[companyId]) {
      const now = nowIstIso();
      notes.companies[companyId] = {
        companyId,
        ticker,
        name,
        creationTime: now,
        modifiedTime: now,
        creator: 'watchlist-insights',
        lastUpdated: now,
        businessSummary: '',
        notes: [],
        processedAnnouncements: [],
      };
    } else {
      const co = notes.companies[companyId];
      if (ticker && !co.ticker) co.ticker = ticker;
      if (name && !co.name) co.name = name;
      if (!co.creationTime) co.creationTime = co.lastUpdated || nowIstIso();
      if (!co.creator) co.creator = 'watchlist-insights';
    }
    return notes.companies[companyId];
  }

  /** announcementId → [note, company] for the most recent note per announcement. */
  static buildNoteIndex(notes) {
    const index = {};
    for (const co of Object.values(notes.companies || {})) {
      for (const n of co.notes || []) {
        const aid = n.announcementId;
        if (!aid) continue;
        const prev = index[aid];
        if (!prev || (n.createdAt || '') > (prev[0].createdAt || '')) index[aid] = [n, co];
      }
    }
    return index;
  }

  static uuid() {
    return crypto.randomUUID();
  }
}

module.exports = { NotesDb };
