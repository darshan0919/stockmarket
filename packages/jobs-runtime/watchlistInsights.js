#!/usr/bin/env node
'use strict';

/**
 * Watchlist Insights Engine — Node port of watchlist_insights.py.
 *
 * CLI utility for the daily watchlist insights task: handles all I/O-heavy work
 * (Stockscans API, PDF parsing, notes JSON I/O, email). Claude orchestrates the AI
 * analysis. All Stockscans access goes through @stock/api.
 *
 * Usage: node watchlistInsights.js <command> [args] [--window-hours <n>] [--env-file <path>]
 *   fetch-announcements <watchlistIds> | read-pdf <url> | get-company-notes <id> | add-note [json]
 *   mark-processed <companyId> <announcementId> | list-companies | insight-template <cat> [--depth quick|standard|deep]
 *   send-summary [html] | build-digest <watchlistIds> | send-digest <watchlistIds> | init-notes
 *
 * insight-template's actual template CONTENT lives in the announcement-insights skill
 * (skills/equity-research/announcement-insights/references/templates/) — this command is
 * just an I/O loader for it, shared by watchlist-insights, gainers-signal, and any other
 * caller. --depth defaults to 'standard'; demerger/merger/acquisition/management_change
 * are HIGH_CONVICTION_CATEGORIES (see lib/announcementTaxonomy.js) with their own 'deep'
 * variant — see skills/equity-research/announcement-insights/SKILL.md.
 *
 * <watchlistIds> is a required, comma-separated list of watchlist IDs (e.g. "id1,id2,id3").
 * This job is agnostic of which watchlists it scans — the caller (skill/task) decides.
 *
 * --window-hours <n> (optional, default 24) widens/narrows the lookback window for
 * fetch-announcements / build-digest / send-digest — e.g. a missed-day catch-up run:
 *   node watchlistInsights.js send-digest id1,id2,id3 --window-hours 72
 * No flag = identical behavior to before this was added (24h).
 */

const fs = require('fs');
const path = require('path');
const { stockscans, S3_BASE_URL } = require('@stock/api');
const { sendHtmlEmail, stockscansLink } = require('@stock/cloud-utils');
const { NotesDb } = require('./lib/notesDb');
const { pdfToText } = require('@stock/cloud-utils');
const { loadEnv, argValue } = require('./lib/env');
const StorageService = require('@stock/cloud-utils').StorageService;
const ist = require('./lib/ist');
const {
  loadNoiseKeywords,
  shouldIgnoreAnnouncement: sharedShouldIgnoreAnnouncement,
  matchedNoiseKeyword: sharedMatchedNoiseKeyword,
} = require('@stock/api/utils/announcementNoiseFilter');

// Data Ecosystem v2: notes → notes collection (via NotesDb→lib/db.js),
// ignored-announcements log → data/cache/ (regenerable review aid).
const db = new NotesDb();

// NOTE: this job is agnostic of which watchlists it scans — watchlistIds must be passed
// in by the caller (CLI arg / skill input), never hardcoded here. See parseWatchlistIds().
function buildAnnouncementsPayload(watchlistIds) {
  return {
    scan: {
      scanId: '',
      scanName: 'Watchlist Scan',
      filters: [],
      industry: [],
      index: [],
      watchlistIds,
      searchFilters: [],
      announcementType: 'All',
      alerts: false,
      searchMode: 'full',
      companyIds: [],
      companyFilters: [],
    },
    offset: 0,
    quarterDate: '',
  };
}

/** Parse a comma-separated watchlistIds string (CLI arg) into a non-empty array. Throws if empty/missing. */
function parseWatchlistIds(raw) {
  const ids = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!ids.length) {
    throw new Error(
      'watchlistIds required: pass one or more comma-separated watchlist IDs, e.g. "fetch-announcements id1,id2,id3"'
    );
  }
  return ids;
}

/**
 * Read the optional `--window-hours <n>` CLI flag (falls back to DEFAULT_WINDOW_HOURS,
 * currently 24). Lets any run (scheduled or ad-hoc) widen the lookback window — e.g. a
 * missed-day catch-up — without a bespoke script: `send-digest <ids> --window-hours 72`.
 */
function parseWindowHours(argv = process.argv) {
  const raw = argValue('--window-hours', argv);
  if (raw === null) return DEFAULT_WINDOW_HOURS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--window-hours must be a positive number, got "${raw}"`);
  }
  return n;
}

// ── Insignificance filter ─────────────────────────────────────────────────────
// The keyword list moved to the shared, single, app-agnostic
// @stock/api/utils/announcementNoiseFilter module (backed by
// stock-api/src/data/announcement-noise-keywords.json — editable via the app UI)
// so the exact same list is used here and by the announcement-scans page. See
// isNoise/matchedNoiseKeyword below, which always re-read the file fresh via
// loadNoiseKeywords() so an app edit takes effect on this job's next run without
// a restart. INSIGNIFICANT_KEYWORDS below is only a point-in-time snapshot taken
// at process start, kept for backward compat with any external caller expecting
// this export — prefer loadNoiseKeywords() for anything that needs live values.
const INSIGNIFICANT_KEYWORDS = loadNoiseKeywords().titleKeywordsToIgnore;

// ── Categorisation ────────────────────────────────────────────────────────────
// Owned by lib/announcementTaxonomy.js so this job and the gainers pipeline share
// ONE definition of what each announcement is. Re-exported below for back-compat.
const {
  CATEGORY_RULES,
  categoriseAnnouncement,
  HIGH_CONVICTION_CATEGORIES,
} = require('./lib/announcementTaxonomy');

// ── Insight templates ───────────────────────────────────────────────────────
// Single source of truth for template CONTENT is the announcement-insights skill
// (skills/equity-research/announcement-insights/references/), not this file.
// watchlistInsights.js is a thin I/O loader: it locates the repo root and reads
// the markdown template straight from disk so watchlist-insights, gainers-signal,
// and any other caller are always reading the identical, single copy. Editing a
// template = editing the .md file in that skill's references/templates/ dir —
// never here.

const ANNOUNCEMENT_INSIGHTS_TEMPLATES_DIR = path.join(
  __dirname,
  '..',
  '..',
  'skills',
  'equity-research',
  'announcement-insights',
  'references',
  'templates'
);

function readTemplateFile(fileName) {
  const p = path.join(ANNOUNCEMENT_INSIGHTS_TEMPLATES_DIR, fileName);
  return fs.readFileSync(p, 'utf8');
}

/**
 * insightTemplate(category, depth)
 *   depth: 'quick' | 'standard' (default) | 'deep'
 * High-conviction categories (demerger/merger/acquisition/management_change) have
 * both a `<category>.standard.md` and `<category>.deep.md` file; `deep` is the
 * recommended default for those four when the caller has time to spend judgment,
 * per skills/equity-research/announcement-insights/SKILL.md. `quick` is a runtime
 * instruction (not a separate file) applied uniformly across all categories.
 */
function insightTemplate(category, depth = 'standard') {
  const cat = (category || 'general').trim().toLowerCase();
  const d = (depth || 'standard').trim().toLowerCase();
  const globalRules = readTemplateFile('_global.md');

  let body;
  const isHighConviction = HIGH_CONVICTION_CATEGORIES.has(cat);
  if (isHighConviction && d === 'deep') {
    body = readTemplateFile(`${cat}.deep.md`);
  } else if (isHighConviction) {
    body = readTemplateFile(`${cat}.standard.md`);
  } else {
    try {
      body = readTemplateFile(`${cat}.md`);
    } catch (e) {
      body = readTemplateFile('general.md');
    }
  }

  const quickSuffix =
    d === 'quick'
      ? '\n\nDEPTH OVERRIDE: quick — write 1-2 sentences only (what happened + the hard ' +
        'numbers + significance tag). Skip trend synthesis, valuation math, and the ' +
        '"what to watch" clause. Use only when explicitly time-boxed by the caller.'
      : '';

  return `${globalRules}\n${body}${quickSuffix}\n`;
}

// ── Announcement helpers ──────────────────────────────────────────────────────

function announcementId(ann) {
  const companyId = ann.companyId || '';
  const title = ann.title || ann.subject || ann.headline || '';
  const dateStr = ann.date || ann.createdAt || '';
  const ssUrl = ann.ssUrl || '';
  return ssUrl || `${companyId}_${dateStr}_${title.slice(0, 30)}`;
}

// title/description are checked separately (not as a combined blob) — see
// announcementNoiseFilter.js for why. matchedNoiseKeyword returns just the
// keyword string here (not the {keyword, field} shape) to keep this job's
// existing call sites (which only log the keyword) unchanged.
function isNoise(title, description) {
  return sharedShouldIgnoreAnnouncement({ title, description });
}

function matchedNoiseKeyword(title, description) {
  const match = sharedMatchedNoiseKeyword({ title, description });
  return match ? match.keyword : null;
}

async function logIgnoredAnnouncement(ann, matchedKw) {
  StorageService.init();
  const dateStr = ist.istYmd(); // YYYYMMDD
  const logPath = `cache/ignored-announcements_${dateStr}.json`;

  let existing = StorageService.readJson(logPath) || [];
  const title = ann.title || ann.subject || ann.headline || '';
  existing.push({
    companyId: ann.companyId || '',
    name: ann.name || ann.companyName || '',
    title,
    description: String(ann.description || '').slice(0, 300),
    matchedKeyword: matchedKw,
    createdAt: ann.createdAt || '',
  });
  await StorageService.saveJson(logPath, existing, false);
}

// Default lookback window, in hours, for gatherInwindowRaw / fetch-announcements /
// build-digest / send-digest. Override per-call via the windowHours param, or from the
// CLI via `--window-hours <n>` (see argValue in lib/env.js). Kept as a named constant
// (not re-hardcoded per call site) so a one-off catch-up run never requires a new script.
const DEFAULT_WINDOW_HOURS = 24;

async function gatherInwindowRaw(
  client = stockscans,
  now = new Date(),
  watchlistIds,
  windowHours = DEFAULT_WINDOW_HOURS
) {
  if (!Array.isArray(watchlistIds) || !watchlistIds.length) {
    throw new Error(
      'watchlistIds required: gatherInwindowRaw(client, now, watchlistIds, windowHours?)'
    );
  }
  try {
    await client.validateAuth();
  } catch (e) {
    const errorMsg = `Auth validation failed: ${e.message}`;
    await sendHtmlEmail({
      subject: `Watchlist Insights - ❌ Auth Failed`,
      htmlBody: `<p><b>Time:</b> ${ist.nowIstHuman()}</p><p><b>Error:</b> ${errorMsg}</p><p>Please update STOCKSCANS_AUTH_TOKEN in .env.</p>`,
    });
    throw e;
  }

  const cutoffMs = now.getTime() - windowHours * 60 * 60 * 1000;
  const qdate = ist.quarterDate(now);
  const allRaw = [];
  let offset = 0;
  let pageSize = null;
  // Safety guard, scaled to the requested window: a 24h window is never thousands of
  // pages, so scale the page budget linearly with windowHours. Prevents an unbounded
  // loop if the upstream keeps returning a full, in-window page.
  const MAX_PAGES = Math.max(200, Math.ceil((200 * windowHours) / DEFAULT_WINDOW_HOURS));

  for (let pageNo = 0; pageNo < MAX_PAGES; pageNo++) {
    const payload = buildAnnouncementsPayload(watchlistIds);
    payload.quarterDate = qdate;
    payload.offset = offset;
    const data = await client.scanAnnouncements(payload);
    const page =
      data && typeof data === 'object' && !Array.isArray(data)
        ? data.announcements || []
        : data || [];
    if (!page.length) break;
    if (pageSize === null) pageSize = page.length;
    allRaw.push(...page);

    const lastCreated = ist.parseCreatedAtMs(page[page.length - 1].createdAt || '');
    if (lastCreated !== null && lastCreated < cutoffMs) break;
    if (page.length < pageSize) break;
    offset += page.length;
  }

  return allRaw.filter((ann) => {
    const created = ist.parseCreatedAtMs(ann.createdAt || '');
    return !(created !== null && created < cutoffMs);
  });
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdFetchAnnouncements(watchlistIdsArg, client = stockscans) {
  const watchlistIds = parseWatchlistIds(watchlistIdsArg);
  const windowHours = parseWindowHours();
  const notes = db.load();
  const allRaw = await gatherInwindowRaw(client, new Date(), watchlistIds, windowHours);
  const results = [];
  for (const ann of allRaw) {
    const companyId = ann.companyId || '';
    const name = ann.name || ann.companyName || '';
    const title = ann.title || ann.subject || ann.headline || '';
    const dateStr = ann.date || ann.createdAt || '';
    const ssUrl = ann.ssUrl || '';
    const description = ann.description || '';
    const annId = announcementId(ann);
    const pdfUrl = ssUrl ? `${S3_BASE_URL}${ssUrl}` : '';

    const noiseKw = matchedNoiseKeyword(title, description);
    if (noiseKw !== null) {
      await logIgnoredAnnouncement(ann, noiseKw);
      continue;
    }

    const co = NotesDb.getCompany(notes, companyId);
    if (co && (co.processedAnnouncements || []).includes(annId)) continue;

    results.push({
      announcementId: annId,
      companyId,
      ticker: companyId,
      name,
      title,
      description,
      date: dateStr,
      ssUrl,
      pdfUrl,
      category: categoriseAnnouncement(title, description),
      hasNotes: co !== null,
      noteCount: co ? (co.notes || []).length : 0,
    });
  }
  process.stdout.write(JSON.stringify(results));
}

async function cmdReadPdf(url) {
  if (!url || url === 'null') {
    process.stdout.write('');
    return;
  }
  const buf = await stockscans.fetchPdf(url, 60000);
  const text = await pdfToText(buf);
  process.stdout.write(text);
}

function cmdGetCompanyNotes(companyId) {
  const co = NotesDb.getCompany(db.load(), companyId);
  process.stdout.write(JSON.stringify(co));
}

async function cmdAddNote(noteJsonStr) {
  const payload = JSON.parse(noteJsonStr);
  const notes = db.load();
  const co = NotesDb.ensureCompany(
    notes,
    payload.companyId,
    payload.ticker || '',
    payload.name || ''
  );
  if (payload.businessSummary) co.businessSummary = payload.businessSummary;
  let noteId = null;
  const noteData = payload.note;
  if (noteData) {
    // Deterministic safety net for HIGH_CONVICTION_CATEGORIES (demerger/merger/
    // acquisition/management_change): never let one slip through as low/routine
    // or untagged just because the model forgot — see the significance-floor and
    // high_conviction-tag rule in announcement-insights' _global.md template.
    // This is enforcement, not judgment — the actual analysis is still the
    // caller's job, this just guards the floor deterministically.
    const category = (noteData.category || '').trim().toLowerCase();
    let significance = noteData.significance || 'routine';
    let tags = Array.isArray(noteData.tags) ? [...noteData.tags] : [];
    if (HIGH_CONVICTION_CATEGORIES.has(category)) {
      if (significance === 'routine' || significance === 'low') significance = 'medium';
      if (!tags.includes('high_conviction')) tags.push('high_conviction');
    }
    const entry = {
      id: NotesDb.uuid(),
      createdAt: ist.nowIstIso(),
      type: noteData.type || 'manual',
      announcementId: noteData.announcementId ?? null,
      announcementTitle: noteData.announcementTitle ?? null,
      pdfUrl: noteData.pdfUrl ?? null,
      insight: noteData.insight || '',
      significance,
      tags,
      category: noteData.category || '',
      announcementDescription: noteData.announcementDescription || '',
    };
    co.notes.push(entry);
    noteId = entry.id;
  }
  co.lastUpdated = ist.nowIstIso();
  co.modifiedTime = co.lastUpdated; // output-dto-standard envelope field
  await db.save(notes);
  process.stdout.write(JSON.stringify({ status: 'ok', companyId: payload.companyId, noteId }));
}

async function cmdMarkProcessed(companyId, annId) {
  const notes = db.load();
  const co = NotesDb.ensureCompany(notes, companyId);
  if (!co.processedAnnouncements.includes(annId)) co.processedAnnouncements.push(annId);
  co.lastUpdated = ist.nowIstIso();
  co.modifiedTime = co.lastUpdated; // output-dto-standard envelope field
  await db.save(notes);
  process.stdout.write(JSON.stringify({ status: 'ok' }));
}

function cmdListCompanies() {
  const notes = db.load();
  const result = Object.values(notes.companies || {}).map((co) => ({
    companyId: co.companyId,
    ticker: co.ticker || '',
    name: co.name || '',
    noteCount: (co.notes || []).length,
    lastUpdated: co.lastUpdated,
  }));
  process.stdout.write(JSON.stringify(result));
}

function cmdInsightTemplate(category = 'general') {
  const depth = argValue('--depth', process.argv) || 'standard';
  process.stdout.write(insightTemplate(category, depth));
}

function cmdInitNotes() {
  db.initRun();
  process.stdout.write(
    JSON.stringify({ status: 'ready', file: db.getLatestFile(), dir: 'entities' })
  );
}

async function sendHtml(htmlBody, subject = `📊 Watchlist Insights — ${ist.nowIstHuman()}`) {
  return sendHtmlEmail({ subject, htmlBody });
}

async function cmdSendSummary(htmlBody) {
  process.stdout.write(JSON.stringify(await sendHtml(htmlBody)));
}

// ── Full 24h digest ───────────────────────────────────────────────────────────

async function collectDigest(client, watchlistIds, windowHours = DEFAULT_WINDOW_HOURS) {
  client = client || stockscans;
  const notes = db.load();
  const idx = NotesDb.buildNoteIndex(notes);
  const seen = new Set();
  const digest = [];
  for (const ann of await gatherInwindowRaw(client, new Date(), watchlistIds, windowHours)) {
    const title = ann.title || ann.subject || ann.headline || '';
    const description = ann.description || '';
    if (isNoise(title, description)) continue;
    const aid = announcementId(ann);
    if (seen.has(aid)) continue;
    seen.add(aid);
    const ssUrl = ann.ssUrl || '';
    const [note] = idx[aid] || [null];
    digest.push({
      announcementId: aid,
      companyId: ann.companyId || '',
      ticker: ann.companyId || '',
      name: ann.name || ann.companyName || '',
      title,
      description,
      date: ann.date || ann.createdAt || '',
      pdfUrl: ssUrl ? `${S3_BASE_URL}${ssUrl}` : '',
      category: categoriseAnnouncement(title, description),
      insight: (note || {}).insight || '',
      significance: note ? note.significance || '' : '',
      tags: note ? note.tags || [] : [],
      hasInsight: Boolean(note && note.insight),
      needsInsight: !(note && note.insight),
    });
  }
  return digest;
}

function buildDigestHtml(digest, windowHours = DEFAULT_WINDOW_HOURS, watchlistIds = []) {
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
  const windowLabel = windowHours === 24 ? 'last 24h' : `last ${windowHours}h`;
  const watchlistLinks = watchlistIds.length
    ? watchlistIds
        .map(
          (id, i) =>
            `<a href="https://www.stockscans.in/watchlist/${id}" style="color:#999;text-decoration:none">Watchlist ${i + 1}</a>`
        )
        .join(' &nbsp;·&nbsp; ')
    : '';
  const parts = [
    `<p><b>${digest.length} announcements across ${nCompanies} companies (${windowLabel}).</b></p>`,
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
        `<div style="margin-bottom:16px;border-left:3px solid ${color};padding-left:12px">` +
          `<b>${stockscansLink(`${d.name} (${d.ticker})`, d.ticker, 'NSE')} — ${d.title}</b><br>${insight}<br>` +
          `<small>Tags: ${tags}${pdf}</small></div>`
      );
    }
  }
  parts.push(
    '<p style="color:#999;font-size:12px">Routine announcements suppressed. ' +
      'Insights for previously-seen announcements are read from company_notes.json.</p>'
  );
  if (watchlistLinks) {
    parts.push(
      `<p style="font:11px Arial;color:#999;margin:16px 0 0;border-top:1px solid #eee;padding-top:8px">Source: ${watchlistLinks}</p>`
    );
  }
  return parts.join('\n');
}

async function cmdBuildDigest(watchlistIdsArg, client = stockscans) {
  const watchlistIds = parseWatchlistIds(watchlistIdsArg);
  const windowHours = parseWindowHours();
  process.stdout.write(JSON.stringify(await collectDigest(client, watchlistIds, windowHours)));
}

async function cmdSendDigest(watchlistIdsArg, client = stockscans) {
  const watchlistIds = parseWatchlistIds(watchlistIdsArg);
  const windowHours = parseWindowHours();
  const digest = await collectDigest(client, watchlistIds, windowHours);
  const missing = digest.filter((d) => d.needsInsight).map((d) => d.announcementId);
  const windowLabel = windowHours === 24 ? '' : ` (${windowHours}h)`;
  const status = await sendHtml(
    buildDigestHtml(digest, windowHours, watchlistIds),
    `📊 Watchlist Insights${windowLabel} — ${ist.nowIstDate()}`
  );
  Object.assign(status, {
    totalAnnouncements: digest.length,
    withInsight: digest.filter((d) => d.hasInsight).length,
    missingInsight: missing.length,
    missingIds: missing,
  });
  process.stdout.write(JSON.stringify(status));
}

// ── CLI dispatch ──────────────────────────────────────────────────────────────

const COMMANDS = {
  'fetch-announcements': [cmdFetchAnnouncements, 1],
  'read-pdf': [cmdReadPdf, 1],
  'get-company-notes': [cmdGetCompanyNotes, 1],
  'add-note': [cmdAddNote, 0],
  'mark-processed': [cmdMarkProcessed, 2],
  'list-companies': [cmdListCompanies, 0],
  'insight-template': [cmdInsightTemplate, 1],
  'send-summary': [cmdSendSummary, 0],
  'build-digest': [cmdBuildDigest, 1],
  'send-digest': [cmdSendDigest, 1],
  'init-notes': [cmdInitNotes, 0],
};

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

async function runCli(argv) {
  const cmd = argv[0];
  if (!cmd || !COMMANDS[cmd]) {
    process.stdout.write(
      `Usage: watchlistInsights.js <command> [args]\nCommands: ${Object.keys(COMMANDS).join(', ')}\n`
    );
    process.exit(1);
  }
  const [fn, nArgs] = COMMANDS[cmd];
  let args = nArgs ? argv.slice(1, 1 + nArgs) : [];
  // stdin-or-arg commands
  if ((cmd === 'add-note' || cmd === 'send-summary') && !argv[1]) args = [readStdin()];
  else if (cmd === 'add-note' || cmd === 'send-summary') args = [argv[1]];
  try {
    await fn(...args);
  } catch (e) {
    process.stderr.write(JSON.stringify({ error: e.message, command: cmd }));
    process.exit(1);
  }
}

module.exports = {
  categoriseAnnouncement,
  insightTemplate,
  announcementId,
  isNoise,
  matchedNoiseKeyword,
  gatherInwindowRaw,
  buildDigestHtml,
  collectDigest,
  cmdFetchAnnouncements,
  cmdBuildDigest,
  cmdSendDigest,
  parseWatchlistIds,
  parseWindowHours,
  DEFAULT_WINDOW_HOURS,
  CATEGORY_RULES,
  INSIGNIFICANT_KEYWORDS,
  runCli,
  db,
};

if (require.main === module) {
  loadEnv(argValue('--env-file'));
  // v2: no wrap-around Drive sync — run `yarn data:push` (scripts/data.js) after the job.
  runCli(process.argv.slice(2)).catch((e) => {
    process.stderr.write(JSON.stringify({ error: e.message, command: 'cli' }));
    process.exit(1);
  });
}
