'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { nowIstIso, notesTimestamp } = require('./ist');

const emptyNotes = () => ({
  meta: { version: '1.0', lastRun: null, totalCompanies: 0, totalNotes: 0 },
  companies: {},
});

/**
 * Notes DB — port of the watchlist_insights.py notes layer.
 *
 * Each run writes to a fresh timestamped `notes_*.json` inside `notesDir`; the
 * previous run's file is never modified. `.current_run` holds this run's filename
 * so every command in the run shares one destination file.
 */
class NotesDb {
  constructor(notesDir) {
    this.dir = notesDir;
    this.pointer = path.join(notesDir, '.current_run');
  }

  getLatestFile() {
    if (!fs.existsSync(this.dir)) return null;
    const files = fs
      .readdirSync(this.dir)
      .filter((f) => /^notes_.*\.json$/.test(f))
      .map((f) => ({ f, mtime: fs.statSync(path.join(this.dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return files.length ? path.join(this.dir, files[0].f) : null;
  }

  /** Start a new run: copy the latest notes into a fresh timestamped file. */
  initRun() {
    fs.mkdirSync(this.dir, { recursive: true });
    const newName = `notes_${notesTimestamp()}.json`;
    const newPath = path.join(this.dir, newName);
    const latest = this.getLatestFile();
    if (latest) fs.copyFileSync(latest, newPath);
    else fs.writeFileSync(newPath, JSON.stringify(emptyNotes(), null, 2));
    fs.writeFileSync(this.pointer, newName);
    return newPath;
  }

  currentRunFile() {
    if (fs.existsSync(this.pointer)) {
      const name = fs.readFileSync(this.pointer, 'utf8').trim();
      const candidate = path.join(this.dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    const latest = this.getLatestFile();
    return latest || this.initRun();
  }

  load() {
    return JSON.parse(fs.readFileSync(this.currentRunFile(), 'utf8'));
  }

  save(notes) {
    const file = this.currentRunFile();
    const companies = notes.companies || {};
    notes.meta.totalCompanies = Object.keys(companies).length;
    notes.meta.totalNotes = Object.values(companies).reduce(
      (s, c) => s + (c.notes || []).length,
      0
    );
    notes.meta.lastRun = nowIstIso();
    fs.writeFileSync(file, JSON.stringify(notes, null, 2));
  }

  static getCompany(notes, companyId) {
    return (notes.companies || {})[companyId] || null;
  }

  static ensureCompany(notes, companyId, ticker = '', name = '') {
    notes.companies ||= {};
    if (!notes.companies[companyId]) {
      notes.companies[companyId] = {
        companyId,
        ticker,
        name,
        lastUpdated: nowIstIso(),
        businessSummary: '',
        notes: [],
        processedAnnouncements: [],
      };
    } else {
      const co = notes.companies[companyId];
      if (ticker && !co.ticker) co.ticker = ticker;
      if (name && !co.name) co.name = name;
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

module.exports = { NotesDb, emptyNotes };
