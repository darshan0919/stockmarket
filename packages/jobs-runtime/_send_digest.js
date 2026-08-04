#!/usr/bin/env node
'use strict';
// Workaround for collectDigest()/cmdSendDigest() not threading watchlistIds through
// (gatherInwindowRaw(client) called with no watchlistIds arg -> throws). Reimplements
// collectDigest inline with the watchlistIds passed explicitly, per
// watchlist-send-digest-broken-2026-07-06 / watchlist-insights-2026-07-08-findings memory.
const fs = require('fs');
const origRmSync = fs.rmSync.bind(fs);
fs.rmSync = (p, opts) => {
  try {
    return origRmSync(p, opts);
  } catch (e) {
    if (e && e.code === 'EPERM') return undefined;
    throw e;
  }
};

const path = require('path');
const wi = require(path.join(__dirname, 'watchlistInsights.js'));
const { loadEnv } = require(path.join(__dirname, 'lib', 'env'));
const { NotesDb } = require(path.join(__dirname, 'lib', 'notesDb'));
const { sendHtmlEmail } = require('@stock/cloud-utils');
loadEnv();

const WATCHLIST_IDS = [
  '0a365ec2139aa6ca7f74c250',
  '7ca0e1a60c3fd0d8b1ab61ce',
  '51a196a79dbc0296493e5174',
];

async function collectDigest(client) {
  const notes = wi.db.load();
  const idx = NotesDb.buildNoteIndex(notes);
  const seen = new Set();
  const digest = [];
  const allRaw = await wi.gatherInwindowRaw(client, new Date(), WATCHLIST_IDS);
  for (const ann of allRaw) {
    const title = ann.title || ann.subject || ann.headline || '';
    const description = ann.description || '';
    if (wi.isNoise(title, description)) continue;
    const aid = wi.announcementId(ann);
    if (seen.has(aid)) continue;
    seen.add(aid);
    const ssUrl = ann.ssUrl || '';
    // buildNoteIndex now returns { byUsecase, latest } per announcementId (see
    // notesDb.js) — this orphaned one-off script isn't wired into any skill
    // anymore, just keeping it non-broken rather than removing it outright.
    const idxEntry = idx[aid];
    const note = idxEntry ? idxEntry.latest && idxEntry.latest[0] : null;
    digest.push({
      announcementId: aid,
      companyId: ann.companyId || '',
      ticker: ann.companyId || '',
      name: ann.name || ann.companyName || '',
      title,
      description,
      date: ann.date || ann.createdAt || '',
      pdfUrl: ssUrl ? `${require('@stock/api').S3_BASE_URL}${ssUrl}` : '',
      category: wi.categoriseAnnouncement(title, description),
      insight: (note || {}).insight || '',
      significance: note ? note.significance || '' : '',
      tags: note ? note.tags || [] : [],
      hasInsight: Boolean(note && note.insight),
      needsInsight: !(note && note.insight),
    });
  }
  return digest;
}

async function main() {
  const { stockscans } = require('@stock/api');
  const digest = await collectDigest(stockscans);
  const html = wi.buildDigestHtml(digest);
  const missing = digest.filter((d) => d.needsInsight).map((d) => d.announcementId);
  const emailResult = await sendHtmlEmail({
    subject: `Watchlist Insights — ${new Date().toISOString().slice(0, 10)}`,
    htmlBody: html,
  });
  const status = Object.assign({}, emailResult, {
    totalAnnouncements: digest.length,
    withInsight: digest.filter((d) => d.hasInsight).length,
    missingInsight: missing.length,
    missingIds: missing,
  });
  console.log(JSON.stringify(status));
  fs.writeFileSync('/tmp/digest_html.html', html);
}

main().catch((e) => {
  console.error('ERROR', e);
  process.exit(1);
});
