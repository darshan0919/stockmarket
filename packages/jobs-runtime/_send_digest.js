process.env.COWORK_DRIVE_SYNC = '0';
const wi = require('./watchlistInsights.js');
const { NotesDb } = require('./lib/notesDb');
const { stockscans, S3_BASE_URL } = require('@stock/api');
const { sendHtmlEmail, stockscansLink } = require('@stock/cloud-utils');
const ist = require('./lib/ist');
const { loadEnv } = require('./lib/env');
loadEnv();

const WATCHLIST_IDS = '0a365ec2139aa6ca7f74c250,7ca0e1a60c3fd0d8b1ab61ce,51a196a79dbc0296493e5174';

async function collectDigest() {
  const notes = wi.db.load();
  const idx = NotesDb.buildNoteIndex(notes);
  const seen = new Set();
  const digest = [];
  const anns = await wi.gatherInwindowRaw(stockscans, new Date(), wi.parseWatchlistIds(WATCHLIST_IDS));
  for (const ann of anns) {
    const title = ann.title || ann.subject || ann.headline || '';
    const description = ann.description || '';
    if (wi.isNoise(title, description)) continue;
    const aid = wi.announcementId(ann);
    if (seen.has(aid)) continue;
    seen.add(aid);
    const ssUrl = ann.ssUrl || '';
    const [note] = idx[aid] || [null];
    digest.push({
      announcementId: aid, companyId: ann.companyId || '', ticker: ann.companyId || '',
      name: ann.name || ann.companyName || '', title, description,
      date: ann.date || ann.createdAt || '',
      pdfUrl: ssUrl ? `${S3_BASE_URL}${ssUrl}` : '',
      category: wi.categoriseAnnouncement(title, description),
      insight: (note || {}).insight || '',
      significance: note ? (note.significance || '') : '',
      tags: note ? (note.tags || []) : [],
      hasInsight: Boolean(note && note.insight),
      needsInsight: !(note && note.insight),
    });
  }
  return digest;
}

(async () => {
  const digest = await collectDigest();
  const missing = digest.filter(d => d.needsInsight).map(d => d.announcementId);
  const html = wi.buildDigestHtml(digest);
  const status = await sendHtmlEmail({ subject: `📊 Watchlist Insights — ${ist.nowIstHuman()}`, htmlBody: html });
  Object.assign(status, {
    totalAnnouncements: digest.length,
    withInsight: digest.filter(d => d.hasInsight).length,
    missingInsight: missing.length,
    missingIds: missing,
  });
  console.log(JSON.stringify(status));
  process.exit(0);
})().catch(e => { console.error(e.stack || e); process.exit(1); });
