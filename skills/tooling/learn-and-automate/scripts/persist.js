#!/usr/bin/env node
'use strict';
/**
 * persist.js — the ONLY write path of learn-and-automate (DATA_RULES §5: only lib/db.js touches
 * collections). Upserts kb-unit / kb-question / kb-framework / kb-automation / kb-learner-profile
 * records into the `knowledge-units` collection, or a `learning-run` report into reports.json.
 *
 *   yarn learn-and-automate:persist --file <records.jsonl> [--patch]
 *   yarn learn-and-automate:persist --report <run.json>
 *
 * Without --patch, user-owned fields (userStance, userNote, status, supersededBy) of an existing
 * record are preserved — a re-verified unit can never wipe Darshan's decisions. Use --patch for
 * stance / supersession / profile updates (partial records: {id, type, sourceKey, ...changed}).
 */
const fs = require('fs');
const path = require('path');
const db = require('../../../../packages/jobs-runtime/lib/db');

const CREATOR = 'learn-and-automate';
const COLLECTION = 'knowledge-units';
const TYPES = new Set([
  'kb-unit',
  'kb-question',
  'kb-framework',
  'kb-automation',
  'kb-learner-profile',
]);
const USER_FIELDS = ['userStance', 'userNote', 'status', 'supersededBy'];

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
}

function readJsonl(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

const today = () => new Date().toISOString().slice(0, 10);

/** Normalise one record for the collection; returns null (with reason) when invalid. */
function prepare(rec, { patch, existing }) {
  if (!rec.id || !TYPES.has(rec.type) || !rec.sourceKey) {
    return [
      null,
      `invalid record (needs id, type in ${[...TYPES].join('|')}, sourceKey): ${rec.id}`,
    ];
  }
  const out = {};
  for (const [k, v] of Object.entries(rec)) if (!k.startsWith('_')) out[k] = v;
  out.creator = CREATOR;
  if (!out.date) out.date = out.lastSeen || out.answeredAt || today();
  if (!patch && existing) for (const f of USER_FIELDS) delete out[f];
  return [out, null];
}

function main() {
  const reportFile = arg('--report');
  if (reportFile) {
    const dto = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    const id = db.saveReport({
      ...dto,
      type: 'learning-run',
      creator: CREATOR,
      date: dto.date || today(),
    });
    console.log(JSON.stringify({ report: id, touched: db.touchedFiles() }, null, 2));
    return;
  }
  const file = arg('--file');
  if (!file)
    throw new Error('usage: persist.js --file <records.jsonl> [--patch] | --report <run.json>');
  const patch = process.argv.includes('--patch');
  const records = [];
  const errors = [];
  const existingById = new Map(db.find(COLLECTION, { creator: CREATOR }).map((r) => [r.id, r]));
  for (const rec of readJsonl(path.resolve(file))) {
    const existing = rec.id ? existingById.get(rec.id) : null;
    if (patch && !existing && rec.type !== 'kb-learner-profile') {
      errors.push(`patch target not found: ${rec.id}`);
      continue;
    }
    const [out, err] = prepare(rec, { patch, existing });
    if (err) errors.push(err);
    else records.push(out);
  }
  const stats = records.length
    ? db.upsertMany(COLLECTION, records)
    : { inserted: 0, updated: 0, unchanged: 0 };
  console.log(JSON.stringify({ ...stats, errors, touched: db.touchedFiles() }, null, 2));
  if (errors.length && !records.length) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { prepare, USER_FIELDS, TYPES };
