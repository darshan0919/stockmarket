'use strict';
/**
 * Agent-handoff layer for the monthly-updates parse pass.
 *
 * ARCHITECTURE NOTE (conventions §17, and a standing rule from Darshan):
 * this repo never calls an LLM HTTP API from a script. Deciding which row of
 * a heterogeneous filing is "the headline sales number", and in what unit, is
 * a judgment call — so it is performed by the AGENT running the skill prompt,
 * not by a script holding an API key.
 *
 * The split that makes that practical:
 *   1. `buildParseBatches()` — pure logic. Loads cached filing text, strips
 *      boilerplate to the numeric region, drops anything already parsed, and
 *      emits compact batches for the agent to read.
 *   2. The agent reads a batch and returns one JSON row per filing.
 *   3. `ingestParsedBatch()` — pure logic. Validates, coerces, range-checks
 *      and caches those rows.
 *
 * Growth arithmetic is deliberately NOT part of the agent's job — it happens
 * in buildSeries.js from stored levels, so a growth figure always follows from
 * the levels it was derived from.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const db = require('../lib/db.js');
const { sliceNumericRegion } = require('./tableSlice.js');

// Bumping this invalidates every cached parse — do it when the instructions
// below change in a way that would alter what the agent returns.
const PROMPT_VERSION = 'v2-agent';
const CREATOR = 'monthly-updates';

// Batch sizing: a batch must stay small enough that the agent reads every row
// carefully rather than skimming. ~12 filings x ~1.2k chars of sliced table is
// a comfortable working set; the full 372-filing backfill is ~31 batches.
const DEFAULT_BATCH_SIZE = 12;
const MAX_SLICE_CHARS = 1800;

/** The extraction contract the agent fills in, kept in one place. */
const PARSE_INSTRUCTIONS = `For EACH filing below, return one JSON object. Output a single JSON array, nothing else.

{
  "ssUrl": "<echo the filing's ssUrl exactly>",
  "periodLabel": "YYYY-MM — the month the figures are FOR (August 2026 sales filed 2026-09-01 => \\"2026-08\\"); null if genuinely unclear",
  "metricName": "short name, e.g. \\"Total vehicle sales\\", \\"Iron ore sales\\"",
  "unit": "units | tonnes | MT | Rs cr | Rs lakh | MW | other",
  "currentValue": <number for the reported month, no commas; null if absent>,
  "priorYearValue": <same month a year earlier if the filing states it, else null>,
  "ytdValue": <current-FY cumulative if stated, else null>,
  "ytdPriorYearValue": <prior-year cumulative if stated, else null>,
  "scope": "which row you took it from, e.g. \\"Total (Domestic + Export)\\"",
  "segments": [ {"name": "<row label>", "value": <number>} ],
  "confidence": "high | medium | low",
  "notes": "one short sentence ONLY if ambiguous; else null"
}

Rules:
- Prefer the most inclusive TOTAL row (Domestic + Export over Domestic alone); say which in "scope".
- Report figures EXACTLY as printed. Do NOT convert units, rescale, or compute growth — levels only.
- If the filing shows production AND sales, take SALES.
- Cover-letter-only filings with no figures: currentValue null, confidence "low".
- segments: at most 6 rows; omit the total row itself.`;

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function cacheDir() {
  const dir = db.cachePath('monthly-updates-parsed');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cacheFileFor(ssUrl) {
  const key = crypto.createHash('sha1').update(`${ssUrl}|${PROMPT_VERSION}`).digest('hex').slice(0, 16);
  return path.join(cacheDir(), `${key}.json`);
}

/**
 * A cache entry is trustworthy only if it carries a real reading, or is an
 * explicit deterministic negative. Anything else is re-derived — this is what
 * stops a transient failure from freezing into permanent "no data".
 */
function isCacheable(entry) {
  if (!entry || entry._invalidated || !entry.parsed) return false;
  // Two kinds of genuine negative are results in their own right and must be
  // cached, or they re-queue for parsing on every single run forever:
  //  - noNumericRegion: the slicer found no numbers at all (deterministic).
  //  - confirmedNoFigure: the agent READ the filing and it genuinely carries no
  //    headline figure (a cover letter, an investor-meet notice, a
  //    percentages-only update). Distinct from a failed/absent parse.
  if (entry.noNumericRegion || entry.confirmedNoFigure) return true;
  return entry.parsed.currentValue !== null && entry.parsed.currentValue !== undefined;
}

function readCached(ssUrl) {
  const f = cacheFileFor(ssUrl);
  if (!fs.existsSync(f)) return null;
  try {
    const hit = JSON.parse(fs.readFileSync(f, 'utf8'));
    return isCacheable(hit) ? hit : null;
  } catch (_) {
    return null;
  }
}

/** Normalise + range-check one agent-returned row. */
function coerce(row, rec) {
  if (!row || typeof row !== 'object') return null;
  const out = {
    periodLabel: /^\d{4}-\d{2}$/.test(String(row.periodLabel || '')) ? row.periodLabel : null,
    metricName: row.metricName ? String(row.metricName).slice(0, 80) : null,
    unit: row.unit ? String(row.unit).slice(0, 20) : null,
    currentValue: num(row.currentValue),
    priorYearValue: num(row.priorYearValue),
    ytdValue: num(row.ytdValue),
    ytdPriorYearValue: num(row.ytdPriorYearValue),
    scope: row.scope ? String(row.scope).slice(0, 80) : null,
    segments: Array.isArray(row.segments)
      ? row.segments
          .slice(0, 6)
          .map((s) => ({ name: String(s && s.name ? s.name : '').slice(0, 60), value: num(s && s.value) }))
          .filter((s) => s.name && s.value !== null)
      : [],
    confidence: ['high', 'medium', 'low'].includes(row.confidence) ? row.confidence : 'low',
    notes: row.notes ? String(row.notes).slice(0, 240) : null,
  };
  out.usable = out.currentValue !== null && out.currentValue >= 0;

  // These are month-end updates filed on the 1st-3rd, so when no period was
  // named the month before the filing date is the safe default — flagged, so
  // downstream can tell an inferred period from a stated one.
  if (!out.periodLabel && rec && rec.date) {
    const d = new Date(`${rec.date}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    out.periodLabel = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    out.periodInferred = true;
  }

  // Sanity: a segment total wildly exceeding the headline usually means the
  // wrong row was picked as the total. Flag rather than silently trust.
  const segSum = out.segments.reduce((a, s) => a + s.value, 0);
  if (out.usable && segSum > 0 && segSum > out.currentValue * 1.5) {
    out.notes = `${out.notes ? `${out.notes} ` : ''}[check] segments sum (${segSum}) exceeds headline (${out.currentValue}).`;
    if (out.confidence === 'high') out.confidence = 'medium';
  }
  return out;
}

/**
 * Build the work packets the agent reads.
 *
 * @param {Array} textRecords records from fetchUpdates (must carry ssUrl + text)
 * @returns {{batches:Array, skipped:number, pending:number, instructions:string}}
 */
function buildParseBatches(textRecords, { batchSize = DEFAULT_BATCH_SIZE, force = false } = {}) {
  const pending = [];
  let skipped = 0;

  for (const rec of textRecords) {
    if (!force && readCached(rec.ssUrl)) {
      skipped++;
      continue;
    }
    const { slice } = sliceNumericRegion(rec.text, { maxChars: MAX_SLICE_CHARS });
    if (!slice || slice.length < 40) {
      // Deterministic negative — no model judgment required, so record it now.
      writeParsed(rec, coerce({ confidence: 'low' }, rec), { noNumericRegion: true });
      skipped++;
      continue;
    }
    pending.push({
      ssUrl: rec.ssUrl,
      companyId: rec.companyId,
      name: rec.name,
      date: rec.date,
      title: rec.title,
      description: rec.description,
      table: slice,
    });
  }

  const batches = [];
  for (let i = 0; i < pending.length; i += batchSize) {
    batches.push({ index: batches.length, items: pending.slice(i, i + batchSize) });
  }
  return { batches, skipped, pending: pending.length, instructions: PARSE_INSTRUCTIONS };
}

/** Render one batch as the text block the agent reads. */
function renderBatch(batch) {
  const parts = batch.items.map(
    (it, n) => `--- FILING ${n + 1} ---
ssUrl: ${it.ssUrl}
company: ${it.companyId} (${it.name || ''})
filed: ${it.date}
title: ${it.title || ''}
description: ${it.description || ''}
table:
${it.table}`
  );
  return `${PARSE_INSTRUCTIONS}\n\n${parts.join('\n\n')}`;
}

function writeParsed(rec, parsed, extra = {}) {
  const out = {
    ssUrl: rec.ssUrl,
    companyId: rec.companyId,
    name: rec.name,
    date: rec.date,
    title: rec.title,
    promptVersion: PROMPT_VERSION,
    creator: CREATOR,
    parsed,
    parsedAt: new Date().toISOString(),
    ...extra,
  };
  if (isCacheable(out)) fs.writeFileSync(cacheFileFor(rec.ssUrl), JSON.stringify(out));
  return out;
}

/**
 * Validate + persist the agent's rows for one batch.
 * Rows are matched back by ssUrl, so order doesn't matter and a missing or
 * hallucinated ssUrl is reported rather than silently mis-assigned.
 */
function ingestParsedBatch(batch, rows) {
  const byUrl = new Map(batch.items.map((it) => [it.ssUrl, it]));
  const accepted = [];
  const rejected = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const rec = byUrl.get(row && row.ssUrl);
    if (!rec) {
      rejected.push({ ssUrl: row && row.ssUrl, reason: 'ssUrl not in this batch' });
      continue;
    }
    const parsed = coerce(row, rec);
    if (!parsed) {
      rejected.push({ ssUrl: row.ssUrl, reason: 'uncoercible row' });
      continue;
    }
    // The agent returned a row for this filing; a null level here is its
    // considered answer ("no headline figure in this document"), not a miss.
    const confirmedNoFigure = !parsed.usable;
    accepted.push(writeParsed(rec, parsed, confirmedNoFigure ? { confirmedNoFigure: true } : {}));
    byUrl.delete(row.ssUrl);
  }

  const missing = [...byUrl.keys()].map((u) => ({ ssUrl: u, reason: 'no row returned' }));
  return { accepted, rejected: rejected.concat(missing), stats: { accepted: accepted.length, rejected: rejected.length + missing.length } };
}

/** Everything parsed so far, for the series builder. */
function loadAllParsed() {
  const dir = cacheDir();
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (isCacheable(j)) out.push(j);
    } catch (_) { /* skip unreadable entry */ }
  }
  return out;
}

module.exports = {
  buildParseBatches,
  renderBatch,
  ingestParsedBatch,
  loadAllParsed,
  readCached,
  writeParsed,
  coerce,
  isCacheable,
  PARSE_INSTRUCTIONS,
  PROMPT_VERSION,
  DEFAULT_BATCH_SIZE,
};
