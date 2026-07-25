'use strict';
const { loadEnv } = require('./lib/env');
loadEnv();
const { NotesDb } = require('./lib/notesDb');
const db = new NotesDb();
const { sendHtmlEmail, stockscansLink } = require('@stock/cloud-utils');
const ist = require('./lib/ist.js');

const NEW_ANNOUNCEMENT_IDS = [
  '2mpvj0nyh73ux2w81v2ri6gl.pdf',
  'kwuuyulqt1revg618ddfyunu.pdf',
  'ziaj3r6x9ykpxtn8wkw91n27.pdf',
  'x14qop3qgcd4s4kzwryar5lw.pdf',
  'it09495z9zq4f2d1q6fuxf5g.pdf',
  'xk7iwi5lafu3wkferhb6dqor.pdf',
  'sga142rb33t5jt9a26muwcoo.pdf',
  'x3obzqqf5zwwajeskgip34gj.pdf',
  '5k6c3im5lhactkq2zux5w997.pdf',
];

(async () => {
  const notes = db.load();
  const digest = [];
  for (const co of Object.values(notes.companies || {})) {
    for (const n of co.notes || []) {
      if (n.announcementId && NEW_ANNOUNCEMENT_IDS.includes(n.announcementId)) {
        digest.push({
          announcementId: n.announcementId,
          companyId: co.companyId,
          ticker: co.ticker || co.companyId,
          name: co.name || co.companyId,
          title: n.announcementTitle || '',
          description: n.announcementDescription || '',
          pdfUrl: n.pdfUrl || '',
          category: n.category || '',
          insight: n.insight || '',
          significance: n.significance || '',
          tags: n.tags || [],
          hasInsight: Boolean(n.insight),
          needsInsight: !n.insight,
        });
      }
    }
  }

  const dateStr = ist.nowIstDate();
  const buckets = { high: [], medium: [], low: [] };
  for (const d of digest) {
    const sig = (d.significance || 'low').toLowerCase();
    if (sig === 'routine') continue;
    (buckets[sig] || buckets.low).push(d);
  }
  const sections = [
    ['high', '🔴 High Significance', '#e53e3e'],
    ['medium', '🟡 Medium Significance', '#d69e2e'],
    ['low', '🟢 Low Significance', '#38a169'],
  ];
  const nCompanies = new Set(digest.map((d) => d.companyId)).size;
  const nRoutine = digest.length - Object.values(buckets).reduce((s, a) => s + a.length, 0);
  const parts = [
    `<p><b>${digest.length} new announcements across ${nCompanies} companies</b> — incremental items processed since the earlier digest sent today (~03:08 UTC, 38 items). ${nRoutine} additional routine item(s) suppressed.</p>`,
  ];
  for (const [key, heading, color] of sections) {
    const items = buckets[key];
    if (!items.length) continue;
    parts.push(`<h3>${heading}</h3>`);
    for (const d of items) {
      const insight = d.insight || d.description || '(no stored insight)';
      const tags = (d.tags || []).join(', ');
      const pdf = d.pdfUrl ? ` | <a href="${d.pdfUrl}">PDF</a>` : '';
      parts.push(
        `<div style="margin-bottom:16px;border-left:3px solid ${color};padding-left:12px"><b>${stockscansLink(`${d.name} (${d.ticker})`, d.ticker, 'NSE')} — ${d.title}</b><br>${insight}<br><small>Tags: ${tags}${pdf}</small></div>`
      );
    }
  }
  parts.push(
    '<p style="color:#999;font-size:12px">Routine announcements suppressed. This is a supplemental digest for items processed after the earlier run today.</p>'
  );
  const html = parts.join('\n');

  const status = await sendHtmlEmail({
    subject: `📊 Watchlist Insights (Supplemental) — ${ist.nowIstHuman()}`,
    htmlBody: html,
  });
  const missing = digest.filter((d) => d.needsInsight).map((d) => d.announcementId);
  Object.assign(status, {
    totalAnnouncements: digest.length,
    withInsight: digest.filter((d) => d.hasInsight).length,
    missingInsight: missing.length,
    missingIds: missing,
  });
  console.log(JSON.stringify(status, null, 2));
})().catch((e) => {
  console.error('DIGEST_ERROR', e);
  process.exit(1);
});
