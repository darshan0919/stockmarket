'use strict';

const crypto = require('crypto');
const { nowIstIso } = require('./ist');
const StorageService = require('@stock/cloud-utils').StorageService;

const emptyNotes = () => ({
  meta: { version: '1.0', lastRun: null, totalCompanies: 0, totalNotes: 0 },
  companies: {},
});

/**
 * Notes DB — now backed by StorageService entities architecture.
 *
 * It uses the single entity path `entities/watchlist-notes/main/current`.
 * StorageService.saveEntity automatically creates history backups on every save.
 */
class NotesDb {
  constructor(notesDir) {
    StorageService.init();
  }

  getLatestFile() {
    // Return standard entity path for legacy compat if requested
    return 'entities/watchlist-notes/main/current/meta.json';
  }

  initRun() {
    StorageService.init();
    return this.getLatestFile();
  }

  currentRunFile() {
    return this.getLatestFile();
  }

  load() {
    const data = StorageService.readJson(this.getLatestFile());
    return data || emptyNotes();
  }

  async save(notes) {
    const companies = notes.companies || {};
    notes.meta.totalCompanies = Object.keys(companies).length;
    notes.meta.totalNotes = Object.values(companies).reduce(
      (s, c) => s + (c.notes || []).length,
      0
    );
    notes.meta.lastRun = nowIstIso();
    await StorageService.saveEntity('watchlist-notes', 'main', 'current', notes);
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
        // Output DTO standard envelope (skills/tooling/output-dto-standard):
        // this record IS the canonical JSON DTO for this company's watchlist
        // insights — the digest email is rendered FROM it, never drafted
        // separately. `lastUpdated` (pre-existing) is kept alongside
        // `modifiedTime` for backward compatibility with existing readers.
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

module.exports = { NotesDb, };
