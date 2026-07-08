process.env.COWORK_DRIVE_SYNC = '0';
const path = require('path');
process.chdir('/sessions/kind-busy-shannon/mnt/stockmarket/packages/jobs-runtime');
const mod = require('./watchlistInsights.js');
const { NotesDb } = require('./lib/notesDb');
const db = mod.db;
const ist = require('./lib/ist');

const notesFile = db.load();

function addNote(payload) {
  const co = NotesDb.ensureCompany(notesFile, payload.companyId, payload.ticker || '', payload.name || '');
  if (payload.businessSummary) co.businessSummary = payload.businessSummary;
  const noteData = payload.note;
  const entry = {
    id: NotesDb.uuid(),
    createdAt: ist.nowIstIso(),
    type: noteData.type || 'manual',
    announcementId: noteData.announcementId ?? null,
    announcementTitle: noteData.announcementTitle ?? null,
    pdfUrl: noteData.pdfUrl ?? null,
    insight: noteData.insight || '',
    significance: noteData.significance || 'routine',
    tags: noteData.tags || [],
    category: noteData.category || '',
    announcementDescription: noteData.announcementDescription || '',
  };
  co.notes.push(entry);
  co.lastUpdated = ist.nowIstIso();
  co.modifiedTime = co.lastUpdated;
  if (!co.processedAnnouncements.includes(noteData.announcementId)) {
    co.processedAnnouncements.push(noteData.announcementId);
  }
}

function markProcessed(companyId, annId) {
  const co = NotesDb.ensureCompany(notesFile, companyId);
  if (!co.processedAnnouncements.includes(annId)) co.processedAnnouncements.push(annId);
  co.lastUpdated = ist.nowIstIso();
  co.modifiedTime = co.lastUpdated;
}

// Staging inputs moved under jobs/data/documents/ so the sync pipeline's
// classifyLocalDocument() catch-all (`^(entities|events|documents)\/`)
// picks them up and syncs them to Drive like any other structured document,
// instead of living as untracked scratch files outside the sync pipeline.
const meaningful = require('../../jobs/data/documents/insights-batch/insights_data.json');
for (const item of meaningful) {
  addNote(item);
}

const routineIds = require('../../jobs/data/documents/routine-tracking/routine_ids.json'); // [{companyId, announcementId}]
for (const r of routineIds) {
  markProcessed(r.companyId, r.announcementId);
}

db.save(notesFile).then(() => {
  console.log(JSON.stringify({ status: 'ok', notesAdded: meaningful.length, routineMarked: routineIds.length }));
  process.exit(0);
}).catch(e => {
  console.error('save error', e);
  process.exit(1);
});
