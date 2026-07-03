'use strict';
process.chdir('/sessions/stoic-upbeat-edison/mnt/stockmarket/packages/cowork-jobs');
const { loadEnv } = require('/sessions/stoic-upbeat-edison/mnt/stockmarket/packages/cowork-jobs/lib/env');
loadEnv('/sessions/stoic-upbeat-edison/mnt/stockmarket/.env');
const wi = require('/sessions/stoic-upbeat-edison/mnt/stockmarket/packages/cowork-jobs/watchlistInsights.js');
const ist = require('/sessions/stoic-upbeat-edison/mnt/stockmarket/packages/cowork-jobs/lib/ist');

function addNote(payload) {
  const notesObj = wi.db.load();
  const co = NotesDb.ensureCompany(notesObj, payload.companyId, payload.ticker || '', payload.name || '');
  if (payload.businessSummary) co.businessSummary = payload.businessSummary;
  const noteData = payload.note;
  if (noteData) {
    co.notes.push({
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
    });
  }
  co.lastUpdated = ist.nowIstIso();
  wi.db.save(notesObj);
}

function markProcessed(companyId, annId) {
  const notesObj = wi.db.load();
  const co = NotesDb.ensureCompany(notesObj, companyId);
  if (!co.processedAnnouncements.includes(annId)) co.processedAnnouncements.push(annId);
  co.lastUpdated = ist.nowIstIso();
  wi.db.save(notesObj);
}

const { NotesDb } = require('/sessions/stoic-upbeat-edison/mnt/stockmarket/packages/cowork-jobs/lib/notesDb');
const { stockscans } = require('@stock/api');
const { pdfToText } = require('/sessions/stoic-upbeat-edison/mnt/stockmarket/packages/cowork-jobs/lib/pdfText');
const fs = require('fs');

const BATCH_SIZE = parseInt(process.argv[2] || '12', 10);
const LOG_PATH = '/tmp/wi_progress.log';
function log(msg) { fs.appendFileSync(LOG_PATH, msg + '\n'); console.error(msg); }

const NOISE_TITLES = /shareholder.*(email|registration)|book closure|record date only|newspaper publication|trading window/i;

function sig(category, text) {
  const t = (text || '').toLowerCase();
  if (category === 'credit_rating' && /downgrad/.test(t)) return 'high';
  if (category === 'management_change' && /(resign|removal|terminat)/.test(t)) return 'high';
  if (category === 'shareholding_change') return 'medium';
  if (['acquisition', 'fundraise', 'order_book', 'capacity'].includes(category)) return 'medium';
  if (category === 'dividend' || category === 'agm_egm') return 'low';
  return 'low';
}

function extractInsight(category, text, title, description, usedFallback) {
  let body = (text || '').replace(/\s+/g, ' ').trim();
  let excerpt = body.slice(0, 500);
  const prefix = usedFallback ? '[PDF unavailable, using description] ' : '';
  if (!excerpt) excerpt = description || title;
  return `${prefix}${excerpt}`.slice(0, 700);
}

async function main() {
  const raw = JSON.parse(fs.readFileSync('/tmp/fetch_out6.json', 'utf8'));
  let notes = wi.db.load();
  let processedCount = 0, routineCount = 0, failCount = 0, newCompanies = [];
  const anomalies = [];

  for (const ann of raw) {
    if (processedCount + routineCount >= BATCH_SIZE) break;
    const co = NotesDb.getCompany(notes, ann.companyId);
    if (co && (co.processedAnnouncements || []).includes(ann.announcementId)) continue;

    let text = '';
    let usedFallback = false;
    try {
      const buf = await stockscans.fetchPdf(ann.pdfUrl, 60000);
      text = await pdfToText(buf);
      if (!text || text.trim().length < 20) { usedFallback = true; text = ann.description; }
    } catch (e) {
      failCount++;
      usedFallback = true;
      text = ann.description;
      log(`PDF FAIL: ${ann.companyId} ${ann.announcementId} -> ${e.message}`);
    }

    if (!co && NOISE_TITLES.test(ann.title + ' ' + text)) {
      markProcessed(ann.companyId, ann.announcementId);
      routineCount++;
      log(`ROUTINE (no note): ${ann.companyId} ${ann.title}`);
      notes = wi.db.load();
      continue;
    }

    const isNew = !co;
    let businessSummary;
    if (isNew) {
      businessSummary = `${ann.name} (${ann.companyId}) - listed Indian company; auto-generated placeholder summary pending manual review (new to notes DB, general knowledge unavailable in this batch mode).`;
      newCompanies.push(ann.companyId + ' ' + ann.name);
    }

    const significance = sig(ann.category, text);
    const insight = extractInsight(ann.category, text, ann.title, ann.description, usedFallback);

    if (/downgrad|resign|removal|terminat/i.test(text)) {
      anomalies.push(`${ann.companyId} ${ann.category}: ${ann.title}`);
    }

    const payload = {
      companyId: ann.companyId,
      ticker: ann.ticker,
      name: ann.name,
      businessSummary,
      note: {
        type: 'announcement',
        announcementId: ann.announcementId,
        announcementTitle: ann.title,
        pdfUrl: ann.pdfUrl,
        insight,
        significance,
        tags: [ann.category],
        category: ann.category,
        announcementDescription: ann.description,
      },
    };
    addNote(payload);
    markProcessed(ann.companyId, ann.announcementId);
    processedCount++;
    log(`OK: ${ann.companyId} ${ann.category} sig=${significance} fallback=${usedFallback}`);
    notes = wi.db.load();
  }

  log(`BATCH DONE: processed=${processedCount} routine=${routineCount} pdfFail=${failCount} newCompanies=${JSON.stringify(newCompanies)} anomalies=${JSON.stringify(anomalies)}`);
}

main().catch(e => { log('FATAL: ' + e.stack); process.exit(1); });
