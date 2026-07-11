'use strict';
// Workaround for known bug: cmdSendDigest/collectDigest call gatherInwindowRaw(client)
// with no watchlistIds arg and throw. See memory watchlist-send-digest-broken-2026-07-06.
require(__dirname + '/lib/env').loadEnv();
const wi = require(__dirname + '/watchlistInsights.js');
const { NotesDb } = require(__dirname + '/lib/notesDb.js');
const { sendHtmlEmail } = require('@stock/cloud-utils');

async function main() {
  const watchlistIds = wi.parseWatchlistIds('0a365ec2139aa6ca7f74c250,7ca0e1a60c3fd0d8b1ab61ce,51a196a79dbc0296493e5174');
  const db = new NotesDb();
  const notes = db.load();
  const idx = NotesDb.buildNoteIndex(notes);
  const seen = new Set();
  const digest = [];
  const raw = await wi.gatherInwindowRaw(undefined, new Date(), watchlistIds);
  for (const ann of raw) {
    const title = ann.title || ann.subject || ann.headline || '';
    const description = ann.description || '';
    const aid = ann.announcementId || ann.ssUrl || '';
    if (seen.has(aid)) continue;
    seen.add(aid);
    const [note] = idx[aid] || [null];
    digest.push({
      announcementId: aid, companyId: ann.companyId || '', ticker: ann.companyId || '',
      name: ann.name || ann.companyName || '', title, description,
      date: ann.date || ann.createdAt || '',
      pdfUrl: ann.pdfUrl || '',
      category: ann.category || '',
      insight: (note || {}).insight || '',
      significance: note ? (note.significance || '') : '',
      tags: note ? (note.tags || []) : [],
      hasInsight: Boolean(note && note.insight),
      needsInsight: !(note && note.insight),
    });
  }
  const html = wi.buildDigestHtml(digest);
  const missing = digest.filter((d) => d.needsInsight).map((d) => d.announcementId);
  const status = await sendHtmlEmail({ subject: `📊 Watchlist Insights — ${new Date().toISOString().slice(0,10)}`, htmlBody: html });
  Object.assign(status, {
    totalAnnouncements: digest.length,
    withInsight: digest.filter((d) => d.hasInsight).length,
    missingInsight: missing.length,
    missingIds: missing,
  });
  console.log(JSON.stringify(status, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
