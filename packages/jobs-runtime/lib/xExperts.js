'use strict';

/**
 * xExperts — registry of followed X accounts + per-account capture coverage ("cache map").
 *
 * Lives at data/x-experts.json (syncs with the rest of data/). It is the single source of truth for:
 *   - which accounts the capture extension offers / selects by default (`selected`)
 *   - which ask-expert expert each account maps to (`expertKey`, or `mergeInto: "soic"`)
 *   - what time range of each account is already captured (`coverage`), so it is never fetched twice
 *
 * coverage = { fromMs, toMs, exhausted, olderCursor, updatedAt }
 *   [fromMs, toMs] is a CONTIGUOUS range that has been paged completely (newest -> oldest).
 *   exhausted: the timeline ended (nothing older exists / is reachable).
 *   olderCursor: X's bottom cursor at fromMs, lets a later run continue older without re-paging.
 *
 * Pure helpers (applyCoverage, defaults) are unit-tested; file I/O is atomic (tmp + rename).
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');

const FILE = 'x-experts.json';
const lc = (s) => String(s || '').toLowerCase();

const DEFAULT_EXPERTS = [
  { handle: 'SureshKBN', name: 'Suresh K', expertKey: 'suresh-kbn' },
  { handle: 'Shashank1171', name: 'Shashank', expertKey: 'shashank' },
  { handle: 'thechartist26', name: 'The Chartist', expertKey: 'thechartist' },
  // Ishmohit Arora founded SOIC: his posts are folded into the existing SOIC expert.
  { handle: 'ishmohit1', name: 'Ishmohit Arora (SOIC)', expertKey: 'soic', mergeInto: 'soic' },
];

function registryPath() {
  return path.join(db.dataRoot(), FILE);
}

function slugKey(handle) {
  return lc(handle)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function defaults() {
  const experts = {};
  for (const e of DEFAULT_EXPERTS) {
    experts[lc(e.handle)] = { ...e, selected: true, coverage: null };
  }
  return { version: 1, settings: { autoRefresh: false }, experts };
}

function load() {
  try {
    const reg = JSON.parse(fs.readFileSync(registryPath(), 'utf8'));
    reg.settings = { autoRefresh: false, ...(reg.settings || {}) };
    reg.experts = reg.experts || {};
    return reg;
  } catch (_) {
    return defaults();
  }
}

function save(reg) {
  const file = registryPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(reg, null, 2));
  fs.renameSync(tmp, file);
  return reg;
}

/** Add a followed account (idempotent). Returns the registry. */
function addExpert(handle, name) {
  const h = String(handle || '').replace(/^@+/, '');
  if (!/^\w{1,15}$/.test(h)) throw new Error(`invalid X handle: ${handle}`);
  const reg = load();
  const k = lc(h);
  if (!reg.experts[k]) {
    reg.experts[k] = {
      handle: h,
      name: name || h,
      expertKey: slugKey(h),
      selected: true,
      coverage: null,
    };
  } else if (name) {
    reg.experts[k].name = name;
  }
  return save(reg);
}

/** Replace the selection: handles in `handles` become selected, all others unselected. */
function setSelected(handles) {
  const want = new Set((handles || []).map(lc));
  const reg = load();
  for (const [k, e] of Object.entries(reg.experts)) e.selected = want.has(k);
  return save(reg);
}

function setSettings(patch) {
  const reg = load();
  reg.settings = { ...reg.settings, ...patch };
  return save(reg);
}

/**
 * Merge a freshly captured contiguous range into existing coverage.
 * patch = { fromMs, toMs, exhausted?, olderCursor? }
 * Overlapping/adjacent ranges union; a disjoint range replaces the old one only if it is newer
 * (we never claim contiguity we did not page).
 */
function applyCoverage(existing, patch, nowIso = new Date().toISOString()) {
  const p = {
    fromMs: patch.fromMs,
    toMs: patch.toMs,
    exhausted: !!patch.exhausted,
    olderCursor: patch.olderCursor || null,
    updatedAt: nowIso,
  };
  if (!existing) return p;
  const overlaps = p.fromMs <= existing.toMs && existing.fromMs <= p.toMs;
  if (!overlaps) return p.toMs >= existing.toMs ? p : existing;
  const older = p.fromMs <= existing.fromMs ? p : existing;
  return {
    fromMs: Math.min(p.fromMs, existing.fromMs),
    toMs: Math.max(p.toMs, existing.toMs),
    exhausted: older.exhausted,
    olderCursor: older.olderCursor,
    updatedAt: nowIso,
  };
}

/** stream: 'main' (UserRepliesTimeline: replies etc., e.coverage) | 'posts' (UserTweets, the Posts tab) | 'reposts' | 'articles' (e.coverageBy[stream]). */
function updateCoverage(handle, patch, stream = 'main') {
  const reg = load();
  const e = reg.experts[lc(handle)];
  if (!e) throw new Error(`unknown expert @${handle}`);
  if (stream === 'main') {
    e.coverage = applyCoverage(e.coverage, patch);
    save(reg);
    return e.coverage;
  }
  if (!['posts', 'reposts', 'articles'].includes(stream)) throw new Error(`unknown stream: ${stream}`);
  e.coverageBy = e.coverageBy || {};
  e.coverageBy[stream] = applyCoverage(e.coverageBy[stream], patch);
  save(reg);
  return e.coverageBy[stream];
}

/** Replace (not union) a stream's coverage, used by Verify to shrink a range that did not hold up. */
function replaceCoverage(handle, stream, coverage) {
  const reg = load();
  const e = reg.experts[lc(handle)];
  if (!e) throw new Error(`unknown expert @${handle}`);
  if (stream === 'main') e.coverage = coverage;
  else if (['posts', 'reposts', 'articles'].includes(stream)) {
    e.coverageBy = e.coverageBy || {};
    if (coverage) e.coverageBy[stream] = coverage;
    else delete e.coverageBy[stream];
  } else throw new Error(`unknown stream: ${stream}`);
  save(reg);
  return coverage;
}

function setStats(handle, stats) {
  const reg = load();
  const e = reg.experts[lc(handle)];
  if (!e) throw new Error(`unknown expert @${handle}`);
  e.stats = stats;
  save(reg);
  return stats;
}

/** Shape sent to the extension. */
function publicConfig() {
  const reg = load();
  return {
    settings: reg.settings,
    experts: Object.values(reg.experts)
      .map((e) => ({
        handle: e.handle,
        name: e.name,
        selected: !!e.selected,
        coverage: e.coverage || null,
        coverageBy: e.coverageBy || {},
        stats: e.stats || null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

module.exports = {
  FILE,
  DEFAULT_EXPERTS,
  load,
  save,
  addExpert,
  setSelected,
  setSettings,
  applyCoverage,
  updateCoverage,
  replaceCoverage,
  setStats,
  publicConfig,
  registryPath,
  slugKey,
};
