'use strict';

/**
 * db.js — Data Ecosystem v2 collection store (docs/DATA_ECOSYSTEM.md).
 *
 * Flat, single-file JSON collections at <repo>/data/, id-keyed objects, with:
 *  - envelope enforcement: id, creationTime, modifiedTime, creator, modelUsed (+
 *    date/companyId retrieval fields where applicable). modelUsed is passed through,
 *    never invented — most collections mix script-only and LLM-authored records.
 *  - deterministic ids → re-runs upsert instead of duplicating
 *  - atomicity: tmp-file + rename; isolation: per-collection advisory lockfile;
 *    durability: pre-mutation checkpoints with auto-restore on corrupt JSON
 *  - company link maintenance (companies.json) — derived, rebuildable (rebuildLinks.js)
 *
 * This is the ONLY module that may touch data/*.json. Skills/jobs import this.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { nowIstIso } = require('./ist');

// ── Roots ────────────────────────────────────────────────────────────────────

function dataRoot() {
  const explicit = process.env.DATA_V2_DIR;
  return path.resolve(explicit || path.join(__dirname, '..', '..', '..', 'data'));
}

const DIRS = {
  reports: () => path.join(dataRoot(), 'reports'),
  conversations: () => path.join(dataRoot(), 'conversations'),
  assets: () => path.join(dataRoot(), 'assets'),
  runs: () => path.join(dataRoot(), 'runs'),
  cache: () => path.join(dataRoot(), 'cache'),
  locks: () => path.join(dataRoot(), '.locks'),
  meta: () => path.join(dataRoot(), '_meta'),
  checkpoints: () => path.join(dataRoot(), '_meta', 'checkpoints'),
};

const SINGLE_FILE_COLLECTIONS = [
  'companies',
  'reports',
  'notes',
  'theses',
  'validation',
  'conversations',
  'prompts',
];
const LINK_CAP = 200; // max event/note/insight ids kept on a company object
const LOCK_STALE_MS = 5 * 60 * 1000;
const LOCK_WAIT_MS = 30 * 1000;

function init() {
  for (const d of Object.values(DIRS)) fs.mkdirSync(d(), { recursive: true });
}

// ── Envelope ─────────────────────────────────────────────────────────────────

function hash8(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 8);
}

/**
 * Deterministic id: same logical output → same id → upsert, never a duplicate.
 * kind: rpt|evt|note|ths|val ; scope: companyId or free scope (sector, list name).
 */
function makeId(kind, creator, scope, date, discriminator = '') {
  const parts = [kind, creator, scope || 'global', date || ''];
  const base = parts.join('_');
  return discriminator ? `${base}_${hash8(discriminator)}` : base;
}

/**
 * Enforce the record envelope. Mutates + returns the record.
 * Throws if `creator` is missing (must be explicit: skill/script/job name or "user").
 *
 * `modelUsed` (string or string[]) is NOT required or defaulted here — unlike
 * `creator`, whether a record needs it is content-dependent (see
 * skills/tooling/output-dto-standard/SKILL.md "modelUsed"): pure-script records
 * correctly have none, LLM-authored ones must set it themselves before calling
 * this. This function only passes it through untouched if present, and normalizes
 * a single string into itself (arrays for multi-model records are left as-is).
 */
function ensureEnvelope(record, { kind, scope, discriminator } = {}) {
  if (!record || typeof record !== 'object') throw new Error('record must be an object');
  if (!record.creator)
    throw new Error('record.creator is required (skill/script/job name or "user")');
  if (!record.id) {
    if (!kind) throw new Error('record.id missing and no `kind` given to derive one');
    record.id = makeId(kind, record.creator, scope || record.companyId, record.date, discriminator);
  }
  const now = nowIstIso();
  if (!record.creationTime) record.creationTime = now;
  record.modifiedTime = record.modifiedTime || now;
  return record;
}

// ── Locking (isolation) ──────────────────────────────────────────────────────

function sleep(ms) {
  const arr = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(arr, 0, 0, ms);
}

// Lock protocol is delete-free (works on delete-restricted mounts): a lock file
// always exists once created; its CONTENT says whether it is held.
// acquire = atomically claim via O_EXCL create, or overwrite when the current
// content is {released:true} or stale. release = overwrite with {released:true}.
function lockToken() {
  return JSON.stringify({
    pid: process.pid,
    ts: Date.now(),
    host: require('os').hostname(),
    nonce: crypto.randomBytes(8).toString('hex'),
    released: false,
  });
}

function readLock(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function acquireLock(name) {
  init();
  const lockPath = path.join(DIRS.locks(), `${name}.lock`);
  const deadline = Date.now() + LOCK_WAIT_MS;
  let backoff = 50;
  for (;;) {
    const token = lockToken();
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, token);
      fs.closeSync(fd);
      return { lockPath, token };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const cur = readLock(lockPath);
      const free = !cur || cur.released === true || Date.now() - (cur.ts || 0) > LOCK_STALE_MS;
      if (free) {
        // Claim by overwrite, then verify we won any race.
        try {
          fs.writeFileSync(lockPath, token);
        } catch (_) {
          /* retry */
        }
        const now = readLock(lockPath);
        if (now && JSON.stringify(now) === token) return { lockPath, token };
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Could not acquire lock ${name} within ${LOCK_WAIT_MS}ms — another writer is active.`
        );
      }
      sleep(backoff);
      backoff = Math.min(backoff * 2, 2000);
    }
  }
}

function releaseLock(lock) {
  try {
    const cur = readLock(lock.lockPath);
    // Only release if we still own it (a staler-than-stale steal may have occurred).
    if (cur && JSON.stringify(cur) === lock.token) {
      fs.writeFileSync(lock.lockPath, JSON.stringify({ released: true, ts: Date.now() }));
    }
  } catch (_) {
    /* best effort */
  }
}

/** Run fn while holding the collection lock. */
function withLock(name, fn) {
  const lock = acquireLock(name);
  try {
    return fn();
  } finally {
    releaseLock(lock);
  }
}

// ── File IO (atomicity + durability) ─────────────────────────────────────────

function collectionFile(collection, { date } = {}) {
  if (collection === 'events') {
    const d = date || nowIstIso().slice(0, 10);
    const ym = String(d).slice(0, 7); // YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(ym))
      throw new Error(`events need a valid date (YYYY-MM-DD), got: ${date}`);
    return path.join(dataRoot(), `events-${ym}.json`);
  }
  if (!SINGLE_FILE_COLLECTIONS.includes(collection)) {
    throw new Error(`Unknown collection: ${collection}`);
  }
  return path.join(dataRoot(), `${collection}.json`);
}

function checkpoint(file) {
  if (!fs.existsSync(file)) return;
  fs.mkdirSync(DIRS.checkpoints(), { recursive: true });
  const name = `${path.basename(file, '.json')}.${Date.now()}.json`;
  fs.copyFileSync(file, path.join(DIRS.checkpoints(), name));
  // No pruning here by design: checkpoints/, like the rest of data/, is kept as a
  // full local mirror rather than deleted from (see docs/DATA_ECOSYSTEM.md §5 — push
  // never deletes local files). Deleting old checkpoints previously used fs.rmSync,
  // which throws EPERM in the Cowork sandbox (mounted repo folders there forbid
  // deleting a file once written) and would abort the entire save() that triggered
  // it. If checkpoints/ ever needs bounding, do it out-of-band (a separate,
  // best-effort maintenance script the user runs locally) — never inline in the
  // write path, so a save can never fail because a delete failed.
}

function latestCheckpoint(file) {
  const prefix = `${path.basename(file, '.json')}.`;
  if (!fs.existsSync(DIRS.checkpoints())) return null;
  const all = fs
    .readdirSync(DIRS.checkpoints())
    .filter((f) => f.startsWith(prefix))
    .sort();
  return all.length ? path.join(DIRS.checkpoints(), all[all.length - 1]) : null;
}

/** Load a collection file → plain object keyed by id. Auto-restores corrupt files. */
function loadFile(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    const cp = latestCheckpoint(file);
    if (cp) {
      console.error(
        `[db] CORRUPT ${path.basename(file)} — restoring from checkpoint ${path.basename(cp)}`
      );
      fs.copyFileSync(file, `${file}.corrupt.${Date.now()}`); // keep evidence
      fs.copyFileSync(cp, file);
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    throw new Error(`Corrupt collection ${file} and no checkpoint to restore: ${e.message}`);
  }
}

// ── Run manifest: every file this process created/modified via db.js ─────────
// (docs/DATA_RULES.md §8 — skills/jobs must list all files touched at run end.)
const _touched = new Set();
function trackTouched(absFile) {
  try {
    _touched.add(path.relative(dataRoot(), absFile).split(path.sep).join('/'));
  } catch (_) {
    /* best effort */
  }
}
/** Sorted data-root-relative paths of every file written by this process. */
function touchedFiles() {
  return [..._touched].sort();
}

/** Atomic write: tmp + rename. Callers must hold the collection lock. */
function writeFileAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1) + '\n');
  fs.renameSync(tmp, file);
  trackTouched(file);
}

// ── Core API ─────────────────────────────────────────────────────────────────

/**
 * Upsert records into a collection (batch — one lock window, one checkpoint,
 * one atomic rename). Merge semantics per record id:
 *  - new id → inserted as-is
 *  - existing id → fields shallow-merged, creationTime preserved,
 *    modifiedTime bumped ONLY if content actually changed.
 * Returns { inserted, updated, unchanged }.
 */
function upsertMany(collection, records, opts = {}) {
  if (!Array.isArray(records)) records = [records];
  if (!records.length) return { inserted: 0, updated: 0, unchanged: 0 };
  for (const r of records) ensureEnvelope(r, opts);

  // events records may span months — group per target file.
  const groups = new Map();
  for (const r of records) {
    const file = collectionFile(collection, { date: r.date });
    if (!groups.has(file)) groups.set(file, []);
    groups.get(file).push(r);
  }

  const stats = { inserted: 0, updated: 0, unchanged: 0 };
  for (const [file, recs] of groups) {
    withLock(path.basename(file, '.json'), () => {
      checkpoint(file);
      const db = loadFile(file);
      for (const r of recs) {
        // undefined values must never clobber existing fields on merge.
        for (const k of Object.keys(r)) if (r[k] === undefined) delete r[k];
        const prev = db[r.id];
        if (!prev) {
          db[r.id] = r;
          stats.inserted++;
          continue;
        }
        const merged = { ...prev, ...r, creationTime: prev.creationTime };
        const a = JSON.stringify({ ...prev, modifiedTime: null });
        const b = JSON.stringify({ ...merged, modifiedTime: null });
        if (a === b) {
          stats.unchanged++;
          continue;
        }
        merged.modifiedTime = nowIstIso();
        db[r.id] = merged;
        stats.updated++;
      }
      writeFileAtomic(file, db);
    });
  }
  return stats;
}

function upsert(collection, record, opts = {}) {
  return upsertMany(collection, [record], opts);
}

function get(collection, id, { date } = {}) {
  if (collection === 'events' && !date) {
    // id embeds the date; try to extract YYYY-MM-DD.
    const m = String(id).match(/(\d{4}-\d{2}-\d{2})/);
    date = m ? m[1] : undefined;
    if (!date) throw new Error('get(events, id) needs { date } when id has no date');
  }
  const db = loadFile(collectionFile(collection, { date }));
  return db[id] || null;
}

/**
 * Query a collection. filter: { companyId, date, type, creator, since (ISO date),
 * limit, sort ("date"|"modifiedTime", desc) }. For events, scans the partition
 * files covered by date/since (or the last 3 months by default).
 */
function find(collection, filter = {}) {
  const files = [];
  if (collection === 'events') {
    files.push(...eventFilesInRange(filter));
  } else {
    files.push(collectionFile(collection));
  }
  let out = [];
  for (const f of files) {
    out = out.concat(Object.values(loadFile(f)));
  }
  const matchCompany = (r) =>
    !filter.companyId ||
    r.companyId === filter.companyId ||
    (Array.isArray(r.companyIds) && r.companyIds.includes(filter.companyId));
  out = out.filter(
    (r) =>
      matchCompany(r) &&
      (!filter.date || r.date === filter.date) &&
      (!filter.type || r.type === filter.type) &&
      (!filter.creator || r.creator === filter.creator) &&
      (!filter.since || (r.date || r.creationTime || '') >= filter.since)
  );
  const key = filter.sort || 'date';
  out.sort((x, y) =>
    String(y[key] || y.modifiedTime || '').localeCompare(String(x[key] || x.modifiedTime || ''))
  );
  return filter.limit ? out.slice(0, filter.limit) : out;
}

function eventFilesInRange({ date, since } = {}) {
  const root = dataRoot();
  if (!fs.existsSync(root)) return [];
  let months = fs
    .readdirSync(root)
    .filter((f) => /^events-\d{4}-\d{2}\.json$/.test(f))
    .sort();
  if (date) {
    months = months.filter((f) => f === `events-${String(date).slice(0, 7)}.json`);
  } else if (since) {
    months = months.filter((f) => f.slice(7, 14) >= String(since).slice(0, 7));
  } else {
    months = months.slice(-3); // default window: last 3 partitions
  }
  return months.map((f) => path.join(root, f));
}

// ── Company links (derived; rebuildable via scripts/rebuildLinks.js) ─────────

const LINK_KIND = {
  rpt: 'reports',
  evt: 'events',
  note: 'notes',
  val: 'insights',
  conv: 'conversations',
};

/** Batch: one lock window + one atomic write for any number of records. */
function linkToCompanies(records) {
  if (!Array.isArray(records)) records = [records];
  const work = [];
  for (const record of records) {
    const ids = record.companyIds || (record.companyId ? [record.companyId] : []);
    const kind = LINK_KIND[String(record.id).split('_')[0]];
    if (kind && ids.length) work.push({ record, ids, kind });
  }
  if (!work.length) return;
  withLock('companies', () => {
    const file = collectionFile('companies');
    checkpoint(file);
    const db = loadFile(file);
    let dirty = false;
    for (const { record, ids, kind } of work) {
      for (const cid of ids) {
        const c = db[cid] || {
          id: cid,
          name: null,
          links: {},
          manual: {},
          creationTime: nowIstIso(),
          modifiedTime: nowIstIso(),
          creator: record.creator,
        };
        c.links = c.links || {};
        const arr = c.links[kind] || [];
        if (!arr.includes(record.id)) {
          arr.unshift(record.id);
          c.links[kind] = arr.slice(0, LINK_CAP);
          c.modifiedTime = nowIstIso();
          dirty = true;
        }
        db[cid] = c;
      }
    }
    if (dirty) writeFileAtomic(file, db);
  });
}

// ── High-level helpers (what skills actually call) ───────────────────────────

/**
 * Save an analysis report: full DTO body → reports/<id>.json, slim index entry →
 * reports.json, id linked into companies.json. `dto` must include creator, type,
 * date, companyId or companyIds, and SHOULD include summary (string) + contextUsed[].
 */
function saveReport(dto) {
  ensureEnvelope(dto, { kind: 'rpt', discriminator: dto.type });
  init();
  const bodyPath = path.join(DIRS.reports(), `${dto.id}.json`);
  withLock('report-bodies', () => {
    writeFileAtomic(bodyPath, dto);
  });
  const {
    id,
    type,
    date,
    companyId,
    companyIds,
    creator,
    creationTime,
    modifiedTime,
    modelUsed,
    summary,
    contextUsed,
  } = dto;
  upsertMany('reports', [
    {
      id,
      type,
      date,
      companyId,
      companyIds,
      creator,
      creationTime,
      modifiedTime,
      ...(modelUsed !== undefined ? { modelUsed } : {}),
      summary: summary || null,
      contextUsed: contextUsed || [],
      body: `reports/${id}.json`,
    },
  ]);
  linkToCompanies(dto);
  return dto.id;
}

/**
 * Save a captured chat: full DTO body (incl. turns) → conversations/<id>.json,
 * slim index entry → conversations.json, id linked into companies.json.
 * `dto` must include creator (= "conversation-capture"), type ("cowork"|"cloud"),
 * date, and SHOULD include companyIds[], title, summary, tags[], artifacts[].
 * Deterministic id (conv_<source>_<sessionId8>) ⇒ re-capture upserts, never dupes.
 * The full turn-by-turn transcript may be passed as dto._body.turns or dto.turns;
 * it is stored only in the body file, never in the slim index.
 */
function saveConversation(dto) {
  ensureEnvelope(dto, { kind: 'conv', discriminator: dto.type });
  init();
  const turns = (dto._body && dto._body.turns) || dto.turns || [];
  const body = { ...dto, turns };
  delete body._body;
  const bodyPath = path.join(DIRS.conversations(), `${dto.id}.json`);
  withLock('conversation-bodies', () => {
    writeFileAtomic(bodyPath, body);
  });
  const {
    id,
    type,
    date,
    companyIds,
    creator,
    creationTime,
    modifiedTime,
    title,
    sessionId,
    tags,
    summary,
    artifacts,
    contentHash,
    dirty,
  } = dto;
  upsertMany('conversations', [
    {
      id,
      type,
      date,
      companyIds: companyIds || [],
      creator,
      creationTime,
      modifiedTime,
      title: title || null,
      sessionId: sessionId || null,
      tags: tags || [],
      summary: summary || null,
      artifactCount: Array.isArray(artifacts) ? artifacts.length : 0,
      contentHash: contentHash || null,
      // `dirty` = content changed (new turns) since the enrichment job last
      // processed this conversation. Capture sets it true on an update; the
      // enrichment job clears it back to false once re-processed.
      dirty: !!dirty,
      body: `conversations/${id}.json`,
    },
  ]);
  linkToCompanies(dto);
  return dto.id;
}

function readConversation(id) {
  const p = path.join(DIRS.conversations(), `${id}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

/**
 * Prompt library (docs/CONVERSATION_CAPTURE_PLAN.md): store a reusable prompt/question
 * with its thinking + answer + skill/task link, to help ask better questions over time.
 * `dto` should include creator, text (the prompt), date; MAY include title, intent,
 * linkedSkill/linkedTask, inputs[], tags[], status (draft|approved|deprecated),
 * improvedVersion, thinking, answerSummary, companyIds[], sourceConversationId.
 * Deterministic id (hash of text) ⇒ same prompt upserts, never duplicates.
 */
function savePrompt(dto) {
  const scope = dto.linkedSkill || dto.linkedTask || 'general';
  ensureEnvelope(dto, { kind: 'prompt', scope, discriminator: dto.text || dto.title || '' });
  const stats = upsertMany('prompts', [dto]);
  return { id: dto.id, ...stats };
}
function savePrompts(dtos) {
  if (!Array.isArray(dtos)) dtos = [dtos];
  for (const d of dtos) {
    const scope = d.linkedSkill || d.linkedTask || 'general';
    ensureEnvelope(d, { kind: 'prompt', scope, discriminator: d.text || d.title || '' });
  }
  return upsertMany('prompts', dtos);
}

function readReport(id) {
  const p = path.join(DIRS.reports(), `${id}.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

/** Append market events (gainer|deal|tweet|announcement|watchlist-sync records). */
function appendEvents(records, { creator } = {}) {
  for (const r of records) {
    if (creator && !r.creator) r.creator = creator;
    if (!r.date) throw new Error('event records require `date` (market date YYYY-MM-DD)');
    if (!r.type) throw new Error('event records require `type`');
    ensureEnvelope(r, {
      kind: 'evt',
      discriminator: `${r.type}|${r.companyId || ''}|${r.headline || r.summary || ''}`,
    });
  }
  const stats = upsertMany('events', records);
  linkToCompanies(records);
  return stats;
}

function appendNotes(notes) {
  if (!Array.isArray(notes)) notes = [notes];
  for (const note of notes) {
    if (!note.companyId) throw new Error('notes require companyId');
    ensureEnvelope(note, { kind: 'note', discriminator: note.text || note.summary || '' });
  }
  const stats = upsertMany('notes', notes);
  linkToCompanies(notes);
  return stats;
}

function appendNote(note) {
  const stats = appendNotes([note]);
  return { id: note.id, ...stats };
}

/** Thesis: current object in theses.json (id = companyId) + append-only history line. */
function saveThesis(companyId, thesis, { creator } = {}) {
  thesis.id = companyId;
  thesis.companyId = companyId;
  if (creator && !thesis.creator) thesis.creator = creator;
  ensureEnvelope(thesis, { kind: 'ths', scope: companyId });
  const stats = upsert('theses', thesis);
  if (stats.inserted || stats.updated) {
    const line = JSON.stringify({ companyId, at: nowIstIso(), creator: thesis.creator, thesis });
    withLock('thesis-history', () => {
      const histFile = path.join(dataRoot(), 'thesis-history.jsonl');
      fs.appendFileSync(histFile, line + '\n');
      trackTouched(histFile);
    });
  }
  return stats;
}

function appendValidations(records) {
  if (!Array.isArray(records)) records = [records];
  for (const record of records) {
    if (!record.date) throw new Error('validation records require `date`');
    ensureEnvelope(record, { kind: 'val', discriminator: record.insightId || record.symbol || '' });
  }
  const stats = upsertMany('validation', records);
  linkToCompanies(records);
  return stats;
}

const appendValidation = (record) => appendValidations([record]);

/** Path helpers for non-collection artifacts (assets/runs/cache). */
function assetPath(name) {
  init();
  return path.join(DIRS.assets(), name);
}
function runPath(skill, runId, name) {
  init();
  return path.join(DIRS.runs(), `${skill}_${runId}_${name}`);
}
function cachePath(name) {
  init();
  return path.join(DIRS.cache(), name);
}

module.exports = {
  dataRoot,
  init,
  makeId,
  ensureEnvelope,
  upsert,
  upsertMany,
  get,
  find,
  saveReport,
  readReport,
  saveConversation,
  readConversation,
  savePrompt,
  savePrompts,
  appendEvents,
  appendNote,
  appendNotes,
  saveThesis,
  appendValidation,
  appendValidations,
  linkToCompanies,
  assetPath,
  runPath,
  cachePath,
  touchedFiles,
  trackTouched, // run manifest (docs/DATA_RULES.md §8)
  withLock,
  collectionFile,
  loadFile,
  writeFileAtomic, // exposed for scripts/tests
  SINGLE_FILE_COLLECTIONS,
  LINK_CAP,
};
