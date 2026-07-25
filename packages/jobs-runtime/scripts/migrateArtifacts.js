#!/usr/bin/env node
'use strict';

/**
 * migrateArtifacts.js — one-time migration of Cowork session artifacts from a copied
 * session archive into the DB. See docs/CONVERSATION_CAPTURE_PLAN.md §1.6.
 *
 * Classification (see the artifact-gap decision, 2026-07-17):
 *   - GENERATED analysis (mapped to a kept conversation) → STORE: copy bytes to
 *     data/assets/, write a reports.json record type="artifact" (metadata DTO in
 *     reports/<id>.json, actual file in assets/), linked to conversation + companies.
 *   - SOURCE docs (fetched filings under pead_docs/, referenced by stable Stockscans
 *     doc-id in manifest.json) → REFERENCE only (regenerable via stock-documents-fetcher):
 *     a reports.json record type="artifact-ref" with { ssUrl, regenerable:true }, no bytes.
 *   - TOOLING (SKILL-*.md, conventions/framework/template md) with a repo counterpart,
 *     and AUTOMATED-JOB renders (gainers/tweet emails whose data is in events) → EXCLUDE.
 *   - Dedup by content hash against existing assets + within the run.
 *
 * Usage: node migrateArtifacts.js --archive <dir> [--dry-run] [--include-salvage]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../lib/db');

const ART = /\.(pdf|html|docx|xlsx|csv|md|txt|pptx)$/i;
const IMG = /\.(png|jpg|jpeg|gif|webp|svg)$/i;

function isTooling(p, base) {
  return (
    /\/(node_modules|\.claude|skills|references)\//.test(p) ||
    /SKILL\.md$/i.test(base) ||
    /^SKILL(-[0-9a-f]+)?\.md$/i.test(base) ||
    /^(conventions|README|DEPENDENCIES)\.md$/i.test(base) ||
    /_(framework|template|methodology|calibration|rules|taxonomy|schema)\.md$/i.test(base) ||
    // templates/widgets in any extension are scaffolding, not analysis output
    /(template|widget)\.(html|md|txt|json)$/i.test(base)
  );
}
function isSource(p, base) {
  return (
    /\/(pead_docs|docs|downloads|source|filings)\//i.test(p) ||
    /_(Transcript|PPT|Result|AnnualReport)_/i.test(base)
  );
}
function isAutomatedRender(base) {
  return /^(gainers_email|gainers_no_signal|tweet_signals_email|scanner_out)/i.test(base);
}

function walk(d, out) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (!/node_modules|\.git/.test(e.name)) walk(p, out);
    } else out.push(p);
  }
}
function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
function safeName(s) {
  return s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
}

// company-master NSE tickers, for attributing an artifact to a company by FILENAME
// (avoids blindly inheriting the conversation's companyIds, which mis-links).
function masterTickers() {
  try {
    const rows = JSON.parse(fs.readFileSync(db.cachePath('company-master.json'), 'utf8'));
    const arr = rows.companies || (Array.isArray(rows) ? rows : []);
    const set = new Set();
    for (const r of arr) if (r.nseTicker) set.add(String(r.nseTicker).toUpperCase());
    return set;
  } catch (_) {
    return new Set();
  }
}
// Attribute an artifact to companies by FILENAME tokens. A token counts if it is a
// real master ticker OR it appears in the SOURCE conversation's companyIds (the
// conversation validates the token without blindly inheriting all its companies —
// this catches real tickers missing from the incomplete master, e.g. AASTHA).
function coFromName(base, tickers, convCids = []) {
  const convTickers = new Set(
    convCids.filter((c) => c.startsWith('NSE:')).map((c) => c.slice(4).toUpperCase())
  );
  const tokens = base.replace(/\.[^.]+$/, '').split(/[^A-Za-z0-9]+/);
  const hits = new Set();
  for (const t of tokens) {
    const u = t.toUpperCase();
    if (u.length >= 3 && (tickers.has(u) || convTickers.has(u))) hits.add('NSE:' + u);
  }
  return [...hits];
}

// Dedup against already-STORED artifact RECORDS (by contentHash), not raw asset
// files — so re-running after a record wipe correctly re-creates records (the
// asset copy is an idempotent overwrite).
function existingArtifactHashes() {
  const set = new Map(); // hash -> id
  for (const r of db.find('reports', { type: 'artifact' })) {
    if (r.artifact && r.artifact.contentHash) set.set(r.artifact.contentHash, r.id);
  }
  return set;
}

function run() {
  const args = process.argv.slice(2);
  const archive = args[args.indexOf('--archive') + 1];
  const dryRun = args.includes('--dry-run');
  const includeSalvage = args.includes('--include-salvage');
  if (!archive || !fs.existsSync(archive)) {
    console.error('need --archive <dir>');
    process.exit(2);
  }

  const convHex = new Map(); // hex8 -> conversation index record
  for (const c of db.find('conversations', {})) {
    if (c.type === 'cowork') convHex.set(c.id.replace('conv_cowork_', ''), c);
  }

  const all = [];
  walk(archive, all);
  const tickers = masterTickers();
  const nowIso = new Date().toISOString();
  const seenHash = existingArtifactHashes();
  const stats = {
    stored: 0,
    referenced: 0,
    dedup: 0,
    excludedTooling: 0,
    excludedAuto: 0,
    unmappedSkipped: 0,
    salvaged: 0,
  };
  const toStore = [];
  const toRef = [];

  for (const p of all) {
    const base = path.basename(p);
    if (!ART.test(p)) continue;
    if (isTooling(p, base)) {
      stats.excludedTooling++;
      continue;
    }
    if (isAutomatedRender(base)) {
      stats.excludedAuto++;
      continue;
    }

    const m = p.match(/local_([0-9a-f]{8})/);
    const hex = m && m[1];
    const conv = hex && convHex.get(hex);

    if (isSource(p, base)) {
      // reference-only (regenerable). Attach to conv if mapped.
      toRef.push({ p, base, conv });
      continue;
    }
    if (!conv) {
      // generated but unmapped → salvage only if flagged (the SOIC PDFs session)
      if (includeSalvage && /local_598a858c/.test(p)) {
        toStore.push({ p, base, conv: null, salvage: true });
      } else {
        stats.unmappedSkipped++;
      }
      continue;
    }
    toStore.push({ p, base, conv });
  }

  const records = [];
  // GENERATED → store bytes + a reports record (unique id = content hash; the asset
  // file IS the body, so no reports/<id>.json). Company attributed from FILENAME.
  for (const it of toStore) {
    const hash = sha256File(it.p);
    if (seenHash.has(hash)) {
      stats.dedup++;
      continue;
    }
    seenHash.set(hash, it.base);
    const cid = it.conv ? it.conv.id : 'conv_cowork_598a858c';
    const companyIds = coFromName(it.base, tickers, it.conv ? it.conv.companyIds : []); // filename validated by conv
    const assetName = safeName(`${cid}__${it.base}`);
    const rec = {
      id: `rpt_artifact-migration_${hash.slice(0, 12)}`,
      creator: 'artifact-migration',
      type: 'artifact',
      date: (it.conv && it.conv.date) || '2026-01-01',
      creationTime: nowIso,
      modifiedTime: nowIso,
      companyIds,
      sourceConversationId: cid,
      summary: `Artifact: ${it.base}`,
      artifact: {
        originalName: it.base,
        assetPath: `assets/${assetName}`,
        contentHash: hash,
        sizeBytes: fs.statSync(it.p).size,
        kind: it.salvage ? 'salvage' : 'generated',
        ext: path.extname(it.base).slice(1),
      },
      body: `assets/${assetName}`,
      contextUsed: [cid],
    };
    if (!dryRun) {
      fs.mkdirSync(path.join(db.dataRoot(), 'assets'), { recursive: true });
      fs.copyFileSync(it.p, path.join(db.dataRoot(), 'assets', assetName));
      records.push(rec);
    }
    if (it.salvage) stats.salvaged++;
    else stats.stored++;
  }
  // SOURCE docs → reference only (regenerable). Unique id from conv+filename.
  for (const it of toRef) {
    const cid = it.conv ? it.conv.id : null;
    if (!cid) {
      stats.unmappedSkipped++;
      continue;
    }
    const refHash = crypto
      .createHash('sha256')
      .update(cid + '|' + it.base)
      .digest('hex')
      .slice(0, 12);
    records.push({
      id: `rpt_artifact-migration_ref_${refHash}`,
      creator: 'artifact-migration',
      type: 'artifact-ref',
      date: (it.conv && it.conv.date) || '2026-01-01',
      creationTime: nowIso,
      modifiedTime: nowIso,
      companyIds: coFromName(it.base, tickers, it.conv ? it.conv.companyIds : []),
      sourceConversationId: cid,
      summary: `Source doc (regenerable via stock-documents-fetcher): ${it.base}`,
      artifact: {
        originalName: it.base,
        regenerable: true,
        source: 'stock-documents-fetcher',
        kind: 'source',
      },
      contextUsed: [cid],
    });
    stats.referenced++;
  }
  if (!dryRun && records.length) {
    db.upsertMany('reports', records);
    db.linkToCompanies(records);
  }

  console.log('[artifact-migration]', JSON.stringify(stats, null, 0));
  if (args.includes('--verbose')) {
    console.log('\nSTORE (bytes → assets):');
    for (const it of toStore)
      console.log(
        '  •',
        it.base,
        it.conv ? `[${(it.conv.title || '').slice(0, 28)}]` : '[salvage]'
      );
    console.log('\nREFERENCE (source docs, re-fetchable):', toRef.length);
  }
  if (dryRun) console.log('(dry-run — nothing written)');
  return stats;
}

if (require.main === module) run();
module.exports = { run };
