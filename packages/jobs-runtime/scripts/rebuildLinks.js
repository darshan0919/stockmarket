#!/usr/bin/env node
'use strict';

/**
 * rebuildLinks.js — regenerate companies.json `links` (and counts) from the
 * collections themselves. Company links are DERIVED state; this script is the
 * self-healing guarantee for crashes between record-write and link-update.
 * Idempotent: running twice produces byte-identical companies.json.
 *
 * Preserves per-company: identity fields, manual{}, watchlist/conviction,
 * creationTime. Rebuilds: links{}, modifiedTime (only when links changed).
 *
 * Usage: node rebuildLinks.js [--dry-run]
 */

const { loadEnv, hasFlag } = require('../lib/env');
loadEnv();
const db = require('../lib/db');

const KIND_OF = {
  rpt: 'reports',
  evt: 'events',
  note: 'notes',
  val: 'insights',
  conv: 'conversations',
};

function collect() {
  /** companyId -> { reports:[], events:[], notes:[], insights:[], conversations:[] } */
  const links = new Map();
  const push = (cid, kind, id, date) => {
    if (!cid || !kind) return;
    if (!links.has(cid))
      links.set(cid, { reports: [], events: [], notes: [], insights: [], conversations: [] });
    links.get(cid)[kind].push({ id, date: date || '' });
  };
  const route = (r) => {
    const kind =
      KIND_OF[String(r.id).split('_')[0]] || (r.verdict !== undefined ? 'insights' : null);
    const ids = r.companyIds || (r.companyId ? [r.companyId] : []);
    for (const cid of ids) push(cid, kind, r.id, r.date || r.creationTime);
  };

  for (const r of db.find('reports', {})) route(r);
  for (const r of db.find('notes', {})) route(r);
  for (const r of db.find('validation', {})) route(r);
  for (const r of db.find('conversations', {})) route(r);
  for (const r of db.find('events', { since: '1900-01' })) route(r);
  return links;
}

function run() {
  const dry = hasFlag('--dry-run');
  const links = collect();
  const file = db.collectionFile('companies');
  let changed = 0;

  db.withLock('companies', () => {
    const companies = db.loadFile(file);

    // Ensure every linked company exists (lazily created stub if not).
    for (const cid of links.keys()) {
      if (!companies[cid]) {
        const now = require('../lib/ist').nowIstIso();
        companies[cid] = {
          id: cid,
          name: null,
          links: {},
          manual: {},
          creationTime: now,
          modifiedTime: now,
          creator: 'rebuild-links',
        };
      }
    }

    for (const [cid, byKind] of links) {
      const c = companies[cid];
      const fresh = {};
      for (const kind of Object.keys(byKind)) {
        const sorted = byKind[kind]
          .sort((a, b) => String(b.date).localeCompare(String(a.date)))
          .map((x) => x.id);
        // Deterministic order + cap; dedupe just in case.
        fresh[kind] = [...new Set(sorted)].slice(0, db.LINK_CAP);
      }
      if (db.get('theses', cid)) fresh.thesis = cid;
      const before = JSON.stringify(c.links || {});
      if (before !== JSON.stringify(fresh)) {
        c.links = fresh;
        c.modifiedTime = require('../lib/ist').nowIstIso();
        changed++;
      }
    }

    // Companies with links pointing at now-deleted records: fresh rebuild above
    // already reflects reality, nothing else to prune.

    if (!dry) db.writeFileAtomic(file, companies);
  });

  console.log(
    `[rebuildLinks] companies with links: ${links.size}; updated: ${changed}${dry ? ' (dry-run, not written)' : ''}`
  );
}

run();
