#!/usr/bin/env node
'use strict';

/**
 * Watchlist Insights Engine — Node port of watchlist_insights.py.
 *
 * CLI utility for the daily watchlist insights task: handles all I/O-heavy work
 * (Stockscans API, PDF parsing, notes JSON I/O, email). Claude orchestrates the AI
 * analysis. All Stockscans access goes through @stock/api.
 *
 * Usage: node watchlistInsights.js <command> [args]
 *   fetch-announcements | read-pdf <url> | get-company-notes <id> | add-note [json]
 *   mark-processed <companyId> <announcementId> | list-companies | insight-template <cat>
 *   send-summary [html] | build-digest | send-digest | init-notes
 */

const fs = require('fs');
const path = require('path');
const { stockscans, S3_BASE_URL } = require('@stock/api');
const { sendHtmlEmail } = require('./lib/emailService');
const { NotesDb } = require('./lib/notesDb');
const { pdfToText } = require('./lib/pdfText');
const { loadEnv, argValue } = require('./lib/env');
const ist = require('./lib/ist');

const SCRIPT_DIR = process.env.WI_DATA_DIR || process.cwd();
const NOTES_DIR = process.env.WI_NOTES_DIR || path.join(SCRIPT_DIR, 'notes');
const VALIDATION_DIR = process.env.WI_VALIDATION_DIR || path.join(SCRIPT_DIR, 'validation');

const db = new NotesDb(NOTES_DIR);

const ANNOUNCEMENTS_PAYLOAD = {
  scan: {
    scanId: '04706a679c7508e4b17f9565',
    scanName: 'Watchlist Scan',
    filters: [], industry: [], index: [],
    watchlistIds: ['0a365ec2139aa6ca7f74c250', '7ca0e1a60c3fd0d8b1ab61ce'],
    searchFilters: [], announcementType: 'All', alerts: false, searchMode: 'full',
    companyIds: [], companyFilters: [],
  },
  offset: 0,
  quarterDate: '',
};

// ── Insignificance filter ─────────────────────────────────────────────────────
const INSIGNIFICANT_KEYWORDS = [
  'clarification', 'closure of trading window', 'scrutinizer', 'code of conduct',
  'reg. 57', 'regulation 47', 'saksham niveshak', '100 day campaign', 'brsr',
  'business responsibility and sustainability', 'book closure', 'corrigendum',
  'cut off date', 'allotment of esop', 'allotment of esps', 'iepf', 'unclaimed dividend',
  'kyc details', 'non-email shareholders', 'physical letter to shareholders',
  'letter sent to shareholders', 'email communication to shareholders regarding dividend taxation',
  'communication to shareholders regarding tax deduction', 'tax deduction on dividend',
  'deduction of tax at source on dividend', 'grant of stock options', 'grant of options',
  'notice of postal ballot', 'intimation of record date', 'change in directorate',
  'annual general meeting',
];

// ── Categorisation (first match wins; catch-all 'general' last) ───────────────
const CATEGORY_RULES = [
  ['order_book', ['award_of_order', 'award of order', 'receipt of order', 'bagging',
    'receiving of order', 'order win', 'letter of intent', 'work order', 'new order',
    'order book', 'contract award', 'order from']],
  ['investor_meet', ['investor meet', 'analyst meet', 'one-on-one meeting',
    'institutional investor', 'investors meeting', 'fund manager']],
  ['shareholding_change', ['sast', 'takeover regulation', 'takeovers',
    'substantial acquisition of shares', 'substantial acquisition', 'open market purchase',
    'open market sale', 'pledge', 'encumbrance', 'bulk deal', 'block deal', 'reg. 29',
    'reg. 31', 'regulation 29', 'regulation 31', 'disclosure under regulation 29',
    'disclosure under sast', 'promoter bought', 'promoter sold', 'promoter purchased',
    'acquirer', 'acquisition of shares']],
  ['credit_rating', ['credit rating', 'crisil', 'icra', 'care ratings', 'india ratings',
    'fitch', 'rating upgrade', 'rating downgrade', 'rating watch']],
  ['fundraise', ['qip', 'preferential allotment', 'preferential issue', 'ncd',
    'non-convertible debenture', 'warrant', 'rights issue', 'fund rais', 'raising of fund',
    'private placement', 'issue of securities']],
  ['management_change', ['resignation of director', 'appointment of director',
    'change in management', 'change in directorate', 'completion of tenure', 'cessation',
    'new ceo', 'new cfo', 'new md']],
  ['results', ['financial results', 'quarterly results', 'annual results',
    'unaudited results', 'audited results']],
  ['agm_egm', ['outcome of agm', 'outcome of egm', 'outcome of postal ballot',
    'extraordinary general meeting', 'extra-ordinary general meeting', 'shareholder meeting',
    'annual general meeting']],
  ['regulatory', ['gst', 'income tax', 'tax demand', 'tax order', 'anti-evasion',
    'search and seizure', 'show cause', 'sebi order', 'cci approval', 'nclt',
    'adjudication', 'penalty', 'navratna', 'miniratna']],
  ['capacity', ['commercial operations', 'commissioning', 'capacity addition', 'new plant',
    'plant expansion', 'new facility', 'capex', 'production commence']],
  ['dividend', ['dividend', 'record date for payment']],
  ['acquisition', ['acquisition', 'merger', 'amalgamation', 'demerger', 'joint venture',
    ' jv ', 'takeover', 'slump sale']],
  ['buyback', ['buyback', 'buy-back', 'extinguishment of shares', 'share repurchase']],
  ['general', []],
];

function categoriseAnnouncement(title, description) {
  const combined = `${title} ${description}`.toLowerCase();
  for (const [category, keywords] of CATEGORY_RULES) {
    if (!keywords.length) return category;
    if (keywords.some((kw) => combined.includes(kw))) return category;
  }
  return 'general';
}

// ── Insight templates (verbatim single source of truth) ───────────────────────
const INSIGHT_GLOBAL_RULES = `═══════════════════════════════════════════════════════════════════════════════
INSIGHT GENERATION — GLOBAL RULES (apply to EVERY announcement, every category)
═══════════════════════════════════════════════════════════════════════════════
1. READ THE ACTUAL PDF FIRST. Run \`read-pdf <pdfUrl>\` and base the insight on the
   document body. NEVER write an insight from the title/description alone — that is
   the #1 quality failure. If the PDF is empty/404/unparseable, say so explicitly
   in the insight, then fall back to the description.
2. BE ACTIONABLE AND SPECIFIC. Pull the hard facts out of the PDF: names, absolute
   numbers, percentages, ₹ amounts, dates, counterparties, thresholds. Generic
   restatements like "the exchange has received a disclosure" or "the company made
   an announcement" are NOT acceptable — they carry zero decision value.
3. STRUCTURE (3–6 sentences):
   (a) What happened — with the extracted numbers.
   (b) Why it matters — shareholder impact, direction (positive/negative/neutral)
       AND magnitude.
   (c) Connection to prior notes — trend, consistency, or contradiction vs this
       company's earlier notes.
   (d) What to watch next — one concrete, monitorable point.
4. CLASSIFY significance: high | medium | low | routine.
     high   — M&A, large capex, major order win (>10% of revenue), regulatory
              action, management change, equity dilution, change of control.
     medium — strategic subsidiaries, smaller acquisitions, analyst/investor meets,
              new product launches, credit-rating changes, capacity commissioning.
     low    — minor disclosures, press releases with limited new information.
     routine— passed the noise filter but carries no real signal (state why).
5. TAG from: capex, order_win, acquisition, subsidiary, management_change,
   equity_dilution, debt, credit_rating, capacity, international_expansion,
   regulatory, dividend, buyback, agm_outcome, concall, investor_meet,
   press_release, demerger, fundraise.
`;

const CATEGORY_INSIGHT_TEMPLATES = {
  shareholding_change: `CATEGORY: shareholding_change  (SAST / Substantial Acquisition of Shares & Takeovers / pledge)
From the PDF, STATE EXPLICITLY (a bare "exchange received the disclosure" is a FAIL):
  • WHO transacted — acquirer/seller name; promoter or non-promoter; PACs if any.
  • DIRECTION — acquired / sold / pledge created / pledge released / pledge invoked /
    encumbrance created or released.
  • ABSOLUTE quantity of shares (number) AND % of total share capital — give BOTH the
    change (Δ) AND the resulting holding (pre-% → post-%).
  • MODE & price — open market / bulk / block / preferential / inter-se / off-market,
    and the consideration or price per share if disclosed.
  • TRIGGER & dates — regulation/threshold crossed (Reg 29(1)/29(2)/31, 5%/25% etc.)
    and the transaction date(s).
Then assess: promoter accumulation (bullish) vs exit/pledge (bearish)? Any 25% / 26% /
open-offer threshold crossed? How does it move the cumulative promoter/major-holder
trend vs prior notes?`,

  order_book: `CATEGORY: order_book
Extract: order value (₹), client/counterparty name & tier (hyperscaler/MAG7/defence/
PSU/govt/private), scope of work, execution start & end dates, execution period (months).
Compute implied quarterly revenue = value ÷ execution months × 3; estimate book-to-bill
vs trailing revenue if prior notes provide it. Flag marquee counterparties and whether
it is a repeat client or a new logo.`,

  investor_meet: `CATEGORY: investor_meet
List EVERY institution/fund named (no cap). Note meeting date and format (1:1 / group /
conference / plant visit). Scan this company's investor_meet notes over the last ~30 days
and report the cumulative visit count per institution. Many DII/FII visits in a short
window = accumulation signal. Capture any new guidance, numbers, or disclosures shared.`,

  credit_rating: `CATEGORY: credit_rating
Extract: agency, instrument & amount rated, OLD rating → NEW rating, OLD outlook → NEW
outlook, and the agency's key rationale (verbatim drivers). State upgrade / downgrade /
reaffirmation and the cost-of-debt or refinancing implication.`,

  fundraise: `CATEGORY: fundraise
Extract: instrument (QIP / preferential / warrants / NCD / rights / private placement),
quantum (₹ and number of securities), issue/conversion price, allottee names & type
(promoter / institutional / strategic / retail), resulting dilution %, and the stated
use of funds. Flag promoter-skin-in-the-game vs pure dilution.`,

  management_change: `CATEGORY: management_change
Extract: role, incumbent name, effective date, reason (resignation / retirement /
removal / term-end), and successor if named. FLAG governance risk if a CEO/CFO/MD or an
independent director leaves before term end, or any abrupt/unexplained exit, auditor
resignation, or "personal reasons" with no successor.`,

  results: `CATEGORY: results
Extract: period; Revenue, EBITDA, EBITDA margin, PAT — both YoY and QoQ; EPS; key segment
drivers; and any outlook commentary. Flag beats/misses vs guidance captured in prior notes.`,

  agm_egm: `CATEGORY: agm_egm
Extract: meeting type (AGM / EGM / postal-ballot OUTCOME), resolutions passed/rejected
with vote %, and FLAG special resolutions (borrowing limits, fundraise authority, buyback,
related-party, capital reorganisation, auditor change).`,

  regulatory: `CATEGORY: regulatory
Extract: authority (GST / IT / SEBI / CCI / NCLT / customs), nature (demand / search /
order / penalty / approval / show-cause), the QUANTIFIED financial impact (₹), the period
involved, and the company's stated response/appeal. Assess P&L and contingent-liability
impact and whether it is a one-off or recurring exposure.`,

  capacity: `CATEGORY: capacity
Extract: asset/plant, capacity added (units / MW / TPA / sq ft), location, commissioning /
COD date, capex spent, and incremental revenue potential at full utilisation. Note the
ramp-up timeline and any change to total installed capacity.`,

  dividend: `CATEGORY: dividend
Extract: amount per share (and % of face value), interim/final/special, record & payment
dates, total payout (₹), and yield at the prevailing price. Note payout-ratio trend vs prior.`,

  acquisition: `CATEGORY: acquisition
Extract: target name & business, stake % acquired, deal value & structure (cash / stock /
earn-out), valuation multiple (EV/revenue or EV/EBITDA) if computable, funding source,
strategic rationale, and expected close / consolidation date. Flag related-party deals.`,

  buyback: `CATEGORY: buyback
Extract: method (tender / open-market), size (₹ Cr AND % of paid-up capital AND % of market
cap), price / ceiling price, buyback yield, record date, and the capital-allocation signal
(does the promoter participate or tender?).`,

  general: `CATEGORY: general
No category-specific template. Read the PDF, identify the single most decision-relevant
fact, quantify it, and follow the global rules. If after reading the document is genuinely
immaterial, mark significance \`routine\` and state in one line why it carries no signal.`,
};

function insightTemplate(category) {
  const cat = (category || 'general').trim().toLowerCase();
  const body = CATEGORY_INSIGHT_TEMPLATES[cat] || CATEGORY_INSIGHT_TEMPLATES.general;
  return `${INSIGHT_GLOBAL_RULES}\n${body}\n`;
}

// ── Announcement helpers ──────────────────────────────────────────────────────

function announcementId(ann) {
  const companyId = ann.companyId || '';
  const title = ann.title || ann.subject || ann.headline || '';
  const dateStr = ann.date || ann.createdAt || '';
  const ssUrl = ann.ssUrl || '';
  return ssUrl || `${companyId}_${dateStr}_${title.slice(0, 30)}`;
}

function isNoise(title, description) {
  const combined = `${title} ${description}`.toLowerCase();
  return INSIGNIFICANT_KEYWORDS.some((kw) => combined.includes(kw));
}

function matchedNoiseKeyword(title, description) {
  const combined = `${title} ${description}`.toLowerCase();
  return INSIGNIFICANT_KEYWORDS.find((kw) => combined.includes(kw)) || null;
}

function logIgnoredAnnouncement(ann, matchedKw) {
  fs.mkdirSync(VALIDATION_DIR, { recursive: true });
  const logPath = path.join(VALIDATION_DIR, `ignored_log_${ist.istYmd()}.json`);
  let existing = [];
  if (fs.existsSync(logPath)) {
    try { existing = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch { existing = []; }
  }
  const title = ann.title || ann.subject || ann.headline || '';
  existing.push({
    companyId: ann.companyId || '',
    name: ann.name || ann.companyName || '',
    title,
    description: String(ann.description || '').slice(0, 300),
    matchedKeyword: matchedKw,
    createdAt: ann.createdAt || '',
  });
  fs.writeFileSync(logPath, JSON.stringify(existing, null, 2));
}

/** Paginate the announcements API → all raw announcements within the last 24h. */
async function gatherInwindowRaw(client = stockscans, now = new Date()) {
  const cutoffMs = now.getTime() - 24 * 60 * 60 * 1000;
  const qdate = ist.quarterDate(now);
  const allRaw = [];
  let offset = 0;
  let pageSize = null;
  // Safety guard: a 24h window is never thousands of pages. Prevents an
  // unbounded loop if the upstream keeps returning a full, in-window page.
  const MAX_PAGES = 200;

  for (let pageNo = 0; pageNo < MAX_PAGES; pageNo++) {
    const payload = JSON.parse(JSON.stringify(ANNOUNCEMENTS_PAYLOAD));
    payload.quarterDate = qdate;
    payload.offset = offset;
    const data = await client.scanAnnouncements(payload);
    const page = data && typeof data === 'object' && !Array.isArray(data) ? data.announcements || [] : data || [];
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

async function cmdFetchAnnouncements(client = stockscans) {
  db.initRun();
  const notes = db.load();
  const allRaw = await gatherInwindowRaw(client);
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
    if (noiseKw !== null) { logIgnoredAnnouncement(ann, noiseKw); continue; }

    const co = NotesDb.getCompany(notes, companyId);
    if (co && (co.processedAnnouncements || []).includes(annId)) continue;

    results.push({
      announcementId: annId, companyId, ticker: companyId, name, title, description,
      date: dateStr, ssUrl, pdfUrl,
      category: categoriseAnnouncement(title, description),
      hasNotes: co !== null,
      noteCount: co ? (co.notes || []).length : 0,
    });
  }
  process.stdout.write(JSON.stringify(results));
}

async function cmdReadPdf(url) {
  if (!url || url === 'null') { process.stdout.write(''); return; }
  const buf = await stockscans.fetchPdf(url, 60000);
  const text = await pdfToText(buf);
  process.stdout.write(text);
}

function cmdGetCompanyNotes(companyId) {
  const co = NotesDb.getCompany(db.load(), companyId);
  process.stdout.write(JSON.stringify(co));
}

function cmdAddNote(noteJsonStr) {
  const payload = JSON.parse(noteJsonStr);
  const notes = db.load();
  const co = NotesDb.ensureCompany(notes, payload.companyId, payload.ticker || '', payload.name || '');
  if (payload.businessSummary) co.businessSummary = payload.businessSummary;
  let noteId = null;
  const noteData = payload.note;
  if (noteData) {
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
    noteId = entry.id;
  }
  co.lastUpdated = ist.nowIstIso();
  db.save(notes);
  process.stdout.write(JSON.stringify({ status: 'ok', companyId: payload.companyId, noteId }));
}

function cmdMarkProcessed(companyId, annId) {
  const notes = db.load();
  const co = NotesDb.ensureCompany(notes, companyId);
  if (!co.processedAnnouncements.includes(annId)) co.processedAnnouncements.push(annId);
  co.lastUpdated = ist.nowIstIso();
  db.save(notes);
  process.stdout.write(JSON.stringify({ status: 'ok' }));
}

function cmdListCompanies() {
  const notes = db.load();
  const result = Object.values(notes.companies || {}).map((co) => ({
    companyId: co.companyId, ticker: co.ticker || '', name: co.name || '',
    noteCount: (co.notes || []).length, lastUpdated: co.lastUpdated,
  }));
  process.stdout.write(JSON.stringify(result));
}

function cmdInsightTemplate(category = 'general') {
  process.stdout.write(insightTemplate(category));
}

function cmdInitNotes() {
  fs.mkdirSync(NOTES_DIR, { recursive: true });
  const latest = db.getLatestFile();
  if (latest) {
    process.stdout.write(JSON.stringify({ status: 'exists', latestFile: path.basename(latest), dir: NOTES_DIR }));
    return;
  }
  const p = db.initRun();
  process.stdout.write(JSON.stringify({ status: 'created', file: path.basename(p), dir: NOTES_DIR }));
}

async function sendHtml(htmlBody) {
  return sendHtmlEmail({ subject: `📊 Watchlist Insights — ${ist.nowIstHuman()}`, htmlBody });
}

async function cmdSendSummary(htmlBody) {
  process.stdout.write(JSON.stringify(await sendHtml(htmlBody)));
}

// ── Full 24h digest ───────────────────────────────────────────────────────────

async function collectDigest(client = stockscans) {
  const notes = db.load();
  const idx = NotesDb.buildNoteIndex(notes);
  const seen = new Set();
  const digest = [];
  for (const ann of await gatherInwindowRaw(client)) {
    const title = ann.title || ann.subject || ann.headline || '';
    const description = ann.description || '';
    if (isNoise(title, description)) continue;
    const aid = announcementId(ann);
    if (seen.has(aid)) continue;
    seen.add(aid);
    const ssUrl = ann.ssUrl || '';
    const [note] = idx[aid] || [null];
    digest.push({
      announcementId: aid, companyId: ann.companyId || '', ticker: ann.companyId || '',
      name: ann.name || ann.companyName || '', title, description,
      date: ann.date || ann.createdAt || '',
      pdfUrl: ssUrl ? `${S3_BASE_URL}${ssUrl}` : '',
      category: categoriseAnnouncement(title, description),
      insight: (note || {}).insight || '',
      significance: note ? (note.significance || '') : '',
      tags: note ? (note.tags || []) : [],
      hasInsight: Boolean(note && note.insight),
      needsInsight: !(note && note.insight),
    });
  }
  return digest;
}

function buildDigestHtml(digest) {
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
  const parts = [
    `<h2>📊 Watchlist Insights — ${dateStr}</h2>`,
    `<p><b>${digest.length} announcements across ${nCompanies} companies (last 24h).</b></p>`,
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
        `<b>${d.name} (${d.ticker}) — ${d.title}</b><br>${insight}<br>` +
        `<small>Tags: ${tags}${pdf}</small></div>`
      );
    }
  }
  parts.push(
    '<p style="color:#999;font-size:12px">Routine announcements suppressed. ' +
    'Insights for previously-seen announcements are read from company_notes.json.</p>'
  );
  return parts.join('\n');
}

async function cmdBuildDigest(client = stockscans) {
  process.stdout.write(JSON.stringify(await collectDigest(client)));
}

async function cmdSendDigest(client = stockscans) {
  const digest = await collectDigest(client);
  const missing = digest.filter((d) => d.needsInsight).map((d) => d.announcementId);
  const status = await sendHtml(buildDigestHtml(digest));
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
  'fetch-announcements': [cmdFetchAnnouncements, 0],
  'read-pdf': [cmdReadPdf, 1],
  'get-company-notes': [cmdGetCompanyNotes, 1],
  'add-note': [cmdAddNote, 0],
  'mark-processed': [cmdMarkProcessed, 2],
  'list-companies': [cmdListCompanies, 0],
  'insight-template': [cmdInsightTemplate, 1],
  'send-summary': [cmdSendSummary, 0],
  'build-digest': [cmdBuildDigest, 0],
  'send-digest': [cmdSendDigest, 0],
  'init-notes': [cmdInitNotes, 0],
};

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

async function runCli(argv) {
  const cmd = argv[0];
  if (!cmd || !COMMANDS[cmd]) {
    process.stdout.write(`Usage: watchlistInsights.js <command> [args]\nCommands: ${Object.keys(COMMANDS).join(', ')}\n`);
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
  categoriseAnnouncement, insightTemplate, announcementId, isNoise, matchedNoiseKeyword,
  gatherInwindowRaw, collectDigest, buildDigestHtml, cmdFetchAnnouncements,
  CATEGORY_RULES, INSIGNIFICANT_KEYWORDS, CATEGORY_INSIGHT_TEMPLATES, runCli, db, NOTES_DIR,
};

if (require.main === module) {
  loadEnv(argValue('--env-file'));
  runCli(process.argv.slice(2));
}
