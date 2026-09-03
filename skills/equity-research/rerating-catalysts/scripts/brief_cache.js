#!/usr/bin/env node
'use strict';

/**
 * brief_cache.js — the caching layer behind `rerating-catalysts --mode brief`.
 *
 * ── The problem this solves ─────────────────────────────────────────────────
 * `gainers-signal` and `volume-rocketing` each attach an EPS thesis to their
 * top 10 names by delivery value, every trading morning. Built naively that is
 * 20 full rerating-catalysts runs a day — each one fetching 14 days of
 * announcements, 4 transcripts, 4 quarterly results and 2 investor PPTs, then
 * reading them with a flagship model. Most of that work would be re-reading
 * documents that had already been read: the same liquid mid-caps recur in these
 * scans day after day, a company files something material a few times a
 * quarter, and a transcript read in June says exactly the same thing in July.
 *
 * Darshan's requirement, stated directly: the skill "should not re-process
 * already processed corporate filings and reuse the extract & insights from
 * already processed filings". This is `skills/_shared/conventions.md` §17(a)
 * — cache the Extraction result, keyed by what makes it unique — applied at
 * two levels, because there are two different things worth not redoing.
 *
 * ── Two caches, deliberately ────────────────────────────────────────────────
 *
 * 1. FILING-LEVEL (`data/cache/rerating-catalysts/filings/<hash>.json`)
 *    One record per individual document (announcement, transcript, result,
 *    PPT), keyed by its stable Stockscans id. Holds the catalyst signature
 *    extracted FROM that document: which "new" categories it carries, the
 *    quantified impact, timeline, conviction, source line. A document is read
 *    exactly once, ever — by whichever company's run reaches it first — and
 *    every later run reuses that extract. This survives across companies too:
 *    a transcript is a transcript regardless of which scan surfaced the name.
 *
 * 2. COMPANY-LEVEL (`data/cache/rerating-catalysts/briefs/<companyId>.json`)
 *    One record per company: the synthesised brief (J-curve tag, reason, the
 *    one-sentence EPS thesis, ranked catalyst names). Synthesis is the
 *    expensive judgment step, and it only needs redoing when the underlying
 *    document set actually changed.
 *
 * ── When a brief is stale ───────────────────────────────────────────────────
 * A cached brief is REUSED when both hold:
 *   (a) nothing new has been filed for the company since it was built, and
 *   (b) it is younger than MAX_BRIEF_AGE_DAYS.
 *
 * (a) is the real test, and it is NOT re-implemented here: it is exactly the
 * question `prefilter_rerating_candidates.js` (Stage 0) already answers, so
 * this script calls that logic rather than growing a second, subtly different
 * notion of "has anything changed" — the failure mode §17 warns about.
 *
 * (b) exists because "no new filing" is not the same as "still true". A thesis
 * built on a capacity commissioning guided for Q3FY27 quietly decays as Q3FY27
 * approaches without confirmation, and no filing event marks that. 30 days is
 * roughly a monthly re-read, comfortably inside a quarterly reporting rhythm,
 * and it bounds how wrong a silently-reused thesis can get.
 *
 * Every served brief carries `cacheHit` and `asOf`, and the email renders
 * `asOf` whenever `cacheHit` is true — a cached thesis is fine, a cached thesis
 * presented as this morning's fresh read is not.
 *
 * ── This script never calls a model ─────────────────────────────────────────
 * It plans (what is stale, what must be read) and it stores. The reading and
 * the synthesis are the skill's judgment steps and stay in the SKILL.md. Same
 * Extraction/Analysis split as everywhere else in this repo.
 *
 * Usage:
 *   node brief_cache.js plan --tickers NSE:A,NSE:B [--max-age-days 30] [--date YYYY-MM-DD]
 *       -> { serve: [<cached brief>], build: [{companyId, reason, cachedFilingIds}] }
 *   node brief_cache.js get --ticker NSE:A
 *   node brief_cache.js put --ticker NSE:A --file brief.json
 *   node brief_cache.js get-filing --id <announcementId>
 *   node brief_cache.js put-filing --id <announcementId> --file extract.json
 *   node brief_cache.js stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../../../../packages/jobs-runtime/lib/db.js');

// See the header note on why an age bound exists at all alongside the
// filing-change test. Overridable per run via --max-age-days for a deliberate
// force-refresh, but the default is what the daily scans use.
const MAX_BRIEF_AGE_DAYS = 30;

function briefsDir() {
  const d = db.cachePath(path.join('rerating-catalysts', 'briefs'));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function filingsDir() {
  const d = db.cachePath(path.join('rerating-catalysts', 'filings'));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// A companyId ("NSE:M&M", "BSE:500325") is not a safe filename — colons and
// ampersands are legal in tickers and hostile in paths. Slugify for
// readability, then append a short hash of the ORIGINAL id so two tickers that
// slugify identically can never collide onto one cache file.
function safeKey(id) {
  const slug = String(id)
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  const h = crypto.createHash('sha1').update(String(id)).digest('hex').slice(0, 8);
  return `${slug}_${h}`;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(file, obj) {
  // Write-then-rename: a run interrupted mid-write must not leave a truncated
  // cache file that every later run then fails to parse (and, worse, silently
  // treats as a miss forever).
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

function getBrief(companyId) {
  return readJson(path.join(briefsDir(), `${safeKey(companyId)}.json`));
}

function putBrief(companyId, brief) {
  const now = new Date().toISOString();
  const record = {
    ...brief,
    companyId,
    creator: 'rerating-catalysts',
    mode: 'brief',
    builtAt: brief.builtAt || now,
    modifiedTime: now,
  };
  const file = path.join(briefsDir(), `${safeKey(companyId)}.json`);
  writeJson(file, record);
  return { file, record };
}

function getFilingExtract(filingId) {
  return readJson(path.join(filingsDir(), `${safeKey(filingId)}.json`));
}

function putFilingExtract(filingId, extract) {
  const record = {
    ...extract,
    filingId,
    extractedAt: extract.extractedAt || new Date().toISOString(),
  };
  const file = path.join(filingsDir(), `${safeKey(filingId)}.json`);
  writeJson(file, record);
  return { file, record };
}

function ageDays(iso, nowMs = Date.now()) {
  const t = Date.parse(iso || '');
  if (Number.isNaN(t)) return Infinity;
  return (nowMs - t) / 86400000;
}

/**
 * Has anything been filed for this company since `sinceDate`?
 *
 * Delegates to Stage 0's own report-vs-filings comparison rather than
 * duplicating it. Loaded lazily so `get`/`put`/`stats` — which never need this
 * — don't pay for its Stockscans client imports, and so a network failure in
 * the prefilter can't stop a pure cache read from working.
 *
 * On ANY error the answer is "assume changed": a false negative here means
 * serving a stale thesis silently, which is the one outcome this whole design
 * exists to prevent. A false positive just costs a rebuild.
 */
async function hasNewFilingsSince(companyId, sinceDate, days) {
  try {
    const prefilter = require('./prefilter_rerating_candidates.js');
    if (typeof prefilter.newFilingsSince !== 'function') {
      return {
        changed: true,
        reason: 'prefilter unavailable — rebuilding to be safe',
        filings: [],
      };
    }
    const filings = await prefilter.newFilingsSince(companyId, sinceDate, days);
    return {
      changed: Array.isArray(filings) && filings.length > 0,
      filings: filings || [],
      reason:
        filings && filings.length
          ? `${filings.length} new filing(s) since ${sinceDate}`
          : `no new filings since ${sinceDate}`,
    };
  } catch (e) {
    return {
      changed: true,
      reason: `filing check failed (${e.message}) — rebuilding`,
      filings: [],
    };
  }
}

/**
 * Split a ticker list into "serve from cache" and "must build".
 *
 * The `build` entries carry `cachedFilingIds` — documents this company's brief
 * would need that ALREADY have a filing-level extract on disk. The skill reads
 * only what is not on that list, which is what makes a rebuild after one new
 * announcement cost one PDF read rather than a full re-acquisition of four
 * transcripts, four results and two decks.
 */
async function plan(tickers, { maxAgeDays = MAX_BRIEF_AGE_DAYS, days = 14 } = {}) {
  const serve = [];
  const build = [];

  for (const companyId of tickers) {
    const cached = getBrief(companyId);
    if (!cached) {
      build.push({ companyId, reason: 'no cached brief — first build', cachedFilingIds: [] });
      continue;
    }

    const age = ageDays(cached.builtAt);
    if (age > maxAgeDays) {
      build.push({
        companyId,
        reason: `cached brief is ${age.toFixed(0)}d old (max ${maxAgeDays}d) — a thesis decays even with no new filing`,
        cachedFilingIds: cached.sourceFilingIds || [],
      });
      continue;
    }

    const since = String(cached.builtAt || '').slice(0, 10);
    const check = await hasNewFilingsSince(companyId, since, days);
    if (check.changed) {
      build.push({
        companyId,
        reason: check.reason,
        newFilings: check.filings,
        cachedFilingIds: cached.sourceFilingIds || [],
      });
      continue;
    }

    serve.push({ ...cached, cacheHit: true, asOf: since, cacheReason: check.reason });
  }

  return { serve, build };
}

function stats() {
  const b = fs.existsSync(briefsDir())
    ? fs.readdirSync(briefsDir()).filter((f) => f.endsWith('.json'))
    : [];
  const f = fs.existsSync(filingsDir())
    ? fs.readdirSync(filingsDir()).filter((x) => x.endsWith('.json'))
    : [];
  return {
    briefs: b.length,
    filingExtracts: f.length,
    briefsDir: briefsDir(),
    filingsDir: filingsDir(),
  };
}

function argValue(flag, argv) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main() {
  const [cmd, ...argv] = process.argv.slice(2);
  const out = (o) => process.stdout.write(JSON.stringify(o, null, 2) + '\n');

  if (cmd === 'plan') {
    const tickers = String(argValue('--tickers', argv) || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (!tickers.length) throw new Error('plan requires --tickers NSE:A,NSE:B');
    const maxAgeDays = Number(argValue('--max-age-days', argv) || MAX_BRIEF_AGE_DAYS);
    return out(await plan(tickers, { maxAgeDays }));
  }
  if (cmd === 'get') return out(getBrief(argValue('--ticker', argv)) || { miss: true });
  if (cmd === 'put') {
    const ticker = argValue('--ticker', argv);
    const file = argValue('--file', argv);
    if (!ticker || !file) throw new Error('put requires --ticker and --file');
    return out(putBrief(ticker, JSON.parse(fs.readFileSync(file, 'utf8'))));
  }
  if (cmd === 'get-filing') return out(getFilingExtract(argValue('--id', argv)) || { miss: true });
  if (cmd === 'put-filing') {
    const id = argValue('--id', argv);
    const file = argValue('--file', argv);
    if (!id || !file) throw new Error('put-filing requires --id and --file');
    return out(putFilingExtract(id, JSON.parse(fs.readFileSync(file, 'utf8'))));
  }
  if (cmd === 'stats') return out(stats());

  process.stderr.write('Usage: brief_cache.js <plan|get|put|get-filing|put-filing|stats> [args]\n');
  process.exit(1);
}

module.exports = {
  getBrief,
  putBrief,
  getFilingExtract,
  putFilingExtract,
  plan,
  stats,
  safeKey,
  MAX_BRIEF_AGE_DAYS,
};

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  });
}
