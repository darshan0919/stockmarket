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

    // Seed every company companies.json already knows about BEFORE folding in
    // notes. A company accumulates state (processedAnnouncements /
    // processedByUsecase) via mark-processed independently of add-note — the
    // heavy-document-skip flow calls mark-processed with NO note at all. If we
    // only created entries while iterating notes (as this used to), a
    // note-less company would be entirely invisible to the very next load():
    // getCompany() would return null, the "already processed" skip-check
    // would silently fail open, and the same announcement would be
    // re-fetched/re-skip-logged forever instead of being recognized as done.
    for (const cid of Object.keys(companies)) {
      NotesDb.ensureCompany(notes, cid);
    }

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
      // `creationTime` is the ONE canonical "when was this note written"
      // field (set by lib/db.js's ensureEnvelope, never computed a second
      // time by any caller as of the sourceSkill/timestamp fixes -- see
      // skills/_shared/conventions.md §21/§22). appendNotes() now deletes any
      // `createdAt` key at write time (the 2026-09-08 fix), so no LIVE record
      // should carry one -- but `data/notes.json` may still hold pre-fix
      // records until the one-off migration (scripts/migrateCreatedAtToCreationTime.js)
      // runs. Stripping it here too, on read, means a caller of load() never
      // sees the field even before that migration completes, and this spread
      // can never resurrect it into a freshly re-saved record either (see
      // appendNotes' own comment on why the write-side chokepoint alone
      // wasn't enough -- load() -> save() round-trips whatever load() handed
      // back).
      const { createdAt: _legacyCreatedAt, ...recWithoutLegacyTimestamp } = rec;
      co.notes.push({
        ...recWithoutLegacyTimestamp,
        insight: rec.insight || rec.text,
        announcementId: rec.announcementId || rec.sourceAnnouncement,
      });
    }

    for (const co of Object.values(notes.companies)) {
      delete co._bsTime;
      co.notes.sort((a, b) => String(a.creationTime || '').localeCompare(String(b.creationTime || '')));
      const c = companies[co.companyId];
      if (c) {
        co.ticker = co.ticker || c.nseTicker || String(co.companyId).split(':')[1] || '';
        co.name = co.name || c.name || '';
        co.processedAnnouncements = (c.state && c.state.processedAnnouncements) || [];
        // Usecase-scoped mirror of the flat list above: { usecase: [announcementId, ...] }.
        // "Processed" is meaningless in isolation — a "results" filing that
        // watchlist-insights heavy-doc-skipped is NOT processed from
        // quarterly-result-analysis's point of view, and a "standard"-depth
        // insight is a different artifact than a "deep" one for the same
        // announcement. Every mark-processed / fetch-announcements skip-check
        // must key off this, never the flat legacy array, once more than one
        // usecase touches the same announcement. See getNoteForUsecase below
        // for the equivalent scoping on the notes themselves.
        co.processedByUsecase = (c.state && c.state.processedByUsecase) || {};
        co.lastUpdated = c.modifiedTime || co.lastUpdated;
      }
      co.notes.forEach(() => {
        notes.meta.totalNotes += 1;
      });
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
        // sourceSkill (which SKILL.md orchestrated this note, e.g.
        // "post-close-scan-insights") is persisted VERBATIM — never defaulted,
        // never overwritten. `creator` below is a legacy envelope field kept
        // for backward compatibility with any code still reading it, and it
        // must NOT be conflated with attribution: this same silent
        // `creator: n.creator || 'watchlist-insights'` default is exactly the
        // bug that made every caller's notes look like they came from
        // watchlist-insights regardless of who actually ran. See
        // skills/_shared/conventions.md §21 and watchlistInsights.js's
        // cmdAddNote, which now REQUIRES sourceSkill on every note and throws
        // if it's missing, so a note reaching this point should always carry
        // one — but this layer still does not invent one if it's absent.
        noteRecords.push({
          ...n,
          companyId: cid,
          type: n.type || n.category || 'insight',
          creator: n.creator || 'watchlist-insights',
          date: String(n.date || n.creationTime || '').slice(0, 10) || undefined,
          // creationTime is the ONE canonical write-timestamp (set once by
          // ensureEnvelope on first insert, preserved by db.js's upsert on
          // every later re-save -- see lib/db.js). No `createdAt` fallback:
          // appendNotes() (lib/db.js) deletes that key outright before this
          // record ever reaches ensureEnvelope, and load() above already
          // strips it from any legacy record before it gets here as `n`, so
          // there is nothing left to fall back to.
          creationTime: n.creationTime,
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
        state: {
          processedAnnouncements: co.processedAnnouncements || [],
          processedByUsecase: co.processedByUsecase || {},
        },
      });
    }

    if (noteRecords.length) db.appendNotes(noteRecords);
    if (companyUpserts.length) db.upsertMany('companies', companyUpserts);

    notes.meta.lastRun = now;
    notes.meta.totalCompanies = Object.keys(notes.companies || {}).length;
    notes.meta.totalNotes = Object.values(notes.companies || {}).reduce(
      (s, c) => s + (c.notes || []).length,
      0
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

  /**
   * announcementId → { byUsecase: { usecase: [note, company] }, latest: [note, company] }.
   *
   * Two different skills (or the same skill at two different depths) reading
   * the SAME announcement produce genuinely different artifacts — a "standard"
   * insight is not a substitute for a "deep" one, and a quick gainers-signal
   * one-liner is not a substitute for either. Collapsing to "the single most
   * recent note per announcement" (the old behavior) meant a second usecase's
   * note would silently shadow the first one everywhere the index was read —
   * exactly the kind of silent loss this is meant to prevent. `byUsecase` is
   * the shape every usecase-aware caller should read from; `latest` exists
   * only for the rare caller that genuinely wants "whatever the newest note
   * is, don't care which usecase" (e.g. a human debugging notes.json).
   */
  static buildNoteIndex(notes) {
    const index = {};
    for (const co of Object.values(notes.companies || {})) {
      for (const n of co.notes || []) {
        const aid = n.announcementId;
        if (!aid) continue;
        const usecase = n.usecase || NotesDb.LEGACY_USECASE;
        const entry = (index[aid] ||= { byUsecase: {}, latest: null });
        const prevForUsecase = entry.byUsecase[usecase];
        const nTime = n.creationTime || '';
        if (!prevForUsecase || nTime > (prevForUsecase[0].creationTime || '')) {
          entry.byUsecase[usecase] = [n, co];
        }
        if (!entry.latest || nTime > (entry.latest[0].creationTime || '')) {
          entry.latest = [n, co];
        }
      }
    }
    return index;
  }

  /** [note, company] for one specific usecase, or null if that usecase never wrote one. */
  static getNoteForUsecase(index, announcementId, usecase) {
    const entry = index[announcementId];
    if (!entry) return null;
    return entry.byUsecase[usecase] || null;
  }

  static uuid() {
    return crypto.randomUUID();
  }
}

// Bucket for notes/processed-markers written before the usecase field existed.
// Treated as its own usecase (not merged into any specific skill's bucket) so
// old data doesn't silently masquerade as a fresh cache hit for a skill that
// never actually ran under this convention.
NotesDb.LEGACY_USECASE = 'legacy';

module.exports = { NotesDb };
