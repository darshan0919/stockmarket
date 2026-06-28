#!/usr/bin/env node
/**
 * migrateAtlasDb.js — MongoDB Atlas Migration Script
 *
 * Copies all collections from database `test` to database `stock-screener`.
 * Merges the typo collection `modelrespnses` into `modelresponses` (dedup).
 * Optionally drops old collections after migration.
 *
 * Usage:
 *   node scripts/migrateAtlasDb.js              # dry-run (default)
 *   node scripts/migrateAtlasDb.js --dry-run     # explicit dry-run
 *   node scripts/migrateAtlasDb.js --apply       # actually perform migration
 *   node scripts/migrateAtlasDb.js --apply --drop-old  # migrate + drop old collections
 */

'use strict';

const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');

// ─── Configuration ──────────────────────────────────────────────────────────

const SOURCE_DB = 'test';
const TARGET_DB = 'stock-screener';

// The typo collection that should be merged into the canonical one
const TYPO_COLLECTION = 'modelrespnses';
const CANONICAL_COLLECTION = 'modelresponses';

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadMongoUrl() {
  const envPath = path.resolve(__dirname, '..', 'backend', '.env');
  if (!fs.existsSync(envPath)) {
    console.error(`❌  Could not find backend/.env at ${envPath}`);
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const match = envContent.match(/^MONGO_URL=(.+)$/m);
  if (!match) {
    console.error('❌  MONGO_URL not found in backend/.env');
    process.exit(1);
  }

  return match[1].trim();
}

function maskUrl(url) {
  return url.replace(
    /\/\/([^:]+):([^@]+)@/,
    (_, user) => `//${user}:****@`
  );
}

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    dryRun: true,     // default: dry-run
    dropOld: false,
  };

  for (const arg of args) {
    switch (arg) {
      case '--apply':
        flags.dryRun = false;
        break;
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--drop-old':
        flags.dropOld = true;
        break;
      default:
        console.error(`Unknown flag: ${arg}`);
        console.error('Usage: node scripts/migrateAtlasDb.js [--apply|--dry-run] [--drop-old]');
        process.exit(1);
    }
  }

  return flags;
}

/**
 * Generate a deterministic fingerprint of a document for dedup purposes.
 * We compare all fields EXCEPT _id.
 */
function docFingerprint(doc) {
  const { _id, ...rest } = doc;
  // Stable JSON: sort keys
  return JSON.stringify(rest, Object.keys(rest).sort());
}

// ─── Core Migration Logic ───────────────────────────────────────────────────

async function copyCollection(client, sourceDbName, targetDbName, collectionName, dryRun) {
  const sourceDb = client.db(sourceDbName);
  const targetDb = client.db(targetDbName);

  const sourceColl = sourceDb.collection(collectionName);
  const targetColl = targetDb.collection(collectionName);

  const sourceCount = await sourceColl.countDocuments();
  const targetCount = await targetColl.countDocuments();

  console.log(`  📦 ${collectionName}: ${sourceCount} docs in source, ${targetCount} docs in target`);

  if (sourceCount === 0) {
    console.log(`     ⏭  Skipping — no documents in source`);
    return { copied: 0, skipped: 0 };
  }

  if (targetCount > 0) {
    console.log(`     ⚠️  Target already has ${targetCount} docs — will skip duplicates`);
  }

  if (dryRun) {
    console.log(`     🔍 [DRY RUN] Would copy up to ${sourceCount} docs`);
    return { copied: sourceCount, skipped: 0, dryRun: true };
  }

  // Fetch all source docs
  const sourceDocs = await sourceColl.find({}).toArray();

  // Build fingerprints of existing target docs for dedup
  const existingDocs = await targetColl.find({}).toArray();
  const existingFingerprints = new Set(existingDocs.map(docFingerprint));

  const toInsert = [];
  let skipped = 0;

  for (const doc of sourceDocs) {
    const fp = docFingerprint(doc);
    if (existingFingerprints.has(fp)) {
      skipped++;
      continue;
    }
    // Remove _id so MongoDB assigns a new one in the target
    const { _id, ...rest } = doc;
    toInsert.push(rest);
    existingFingerprints.add(fp); // avoid intra-batch dupes
  }

  if (toInsert.length > 0) {
    await targetColl.insertMany(toInsert, { ordered: false });
  }

  console.log(`     ✅ Copied ${toInsert.length} docs, skipped ${skipped} duplicates`);
  return { copied: toInsert.length, skipped };
}

async function mergeTypoCollection(client, sourceDbName, targetDbName, dryRun) {
  const sourceDb = client.db(sourceDbName);
  const targetDb = client.db(targetDbName);

  const typoColl = sourceDb.collection(TYPO_COLLECTION);
  const canonicalColl = targetDb.collection(CANONICAL_COLLECTION);

  const typoCount = await typoColl.countDocuments();
  const canonicalCount = await canonicalColl.countDocuments();

  console.log(`\n🔀 Merging typo collection "${TYPO_COLLECTION}" (${typoCount} docs) → "${CANONICAL_COLLECTION}" (${canonicalCount} docs in target)`);

  if (typoCount === 0) {
    console.log('   ⏭  No docs in typo collection — nothing to merge');
    return { merged: 0, skipped: 0 };
  }

  if (dryRun) {
    console.log(`   🔍 [DRY RUN] Would merge up to ${typoCount} docs (with dedup)`);
    return { merged: typoCount, skipped: 0, dryRun: true };
  }

  const typoDocs = await typoColl.find({}).toArray();
  const existingDocs = await canonicalColl.find({}).toArray();
  const existingFingerprints = new Set(existingDocs.map(docFingerprint));

  const toInsert = [];
  let skipped = 0;

  for (const doc of typoDocs) {
    const fp = docFingerprint(doc);
    if (existingFingerprints.has(fp)) {
      skipped++;
      continue;
    }
    const { _id, ...rest } = doc;
    toInsert.push(rest);
    existingFingerprints.add(fp);
  }

  if (toInsert.length > 0) {
    await canonicalColl.insertMany(toInsert, { ordered: false });
  }

  console.log(`   ✅ Merged ${toInsert.length} docs, skipped ${skipped} duplicates`);
  return { merged: toInsert.length, skipped };
}

async function dropSourceCollections(client, sourceDbName, collections, dryRun) {
  const sourceDb = client.db(sourceDbName);
  console.log(`\n🗑  Dropping ${collections.length} collections from "${sourceDbName}"...`);

  for (const name of collections) {
    if (dryRun) {
      console.log(`   🔍 [DRY RUN] Would drop "${sourceDbName}.${name}"`);
    } else {
      await sourceDb.collection(name).drop();
      console.log(`   ✅ Dropped "${sourceDbName}.${name}"`);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const flags = parseArgs();
  const mongoUrl = loadMongoUrl();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       MongoDB Atlas Database Migration Script           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Mode:       ${flags.dryRun ? '🔍 DRY RUN (no changes will be made)' : '⚡ APPLY (changes WILL be made)'}`);
  console.log(`Drop old:   ${flags.dropOld ? '🗑  Yes — will drop source collections after copy' : '❌ No — source collections will be preserved'}`);
  console.log(`Source DB:  ${SOURCE_DB}`);
  console.log(`Target DB:  ${TARGET_DB}`);
  console.log(`Cluster:    ${maskUrl(mongoUrl)}`);
  console.log();

  if (!flags.dryRun) {
    console.log('⚠️  APPLY mode — changes will be written to the database!');
    console.log('   Proceeding in 3 seconds... (Ctrl+C to cancel)\n');
    await new Promise(r => setTimeout(r, 3000));
  }

  const client = new MongoClient(mongoUrl);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB Atlas\n');

    // List all collections in the source database
    const sourceDb = client.db(SOURCE_DB);
    const collections = await sourceDb.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    console.log(`📋 Found ${collectionNames.length} collections in "${SOURCE_DB}":`);
    for (const name of collectionNames) {
      const count = await sourceDb.collection(name).countDocuments();
      console.log(`   • ${name} (${count} docs)`);
    }
    console.log();

    // Determine which collections to copy (exclude typo — it gets merged)
    const toCopy = collectionNames.filter(n => n !== TYPO_COLLECTION);

    // Step 1: Copy regular collections
    console.log(`\n📥 Step 1: Copying ${toCopy.length} collections from "${SOURCE_DB}" → "${TARGET_DB}"\n`);

    const copyResults = {};
    for (const name of toCopy) {
      copyResults[name] = await copyCollection(client, SOURCE_DB, TARGET_DB, name, flags.dryRun);
    }

    // Step 2: Merge typo collection
    console.log(`\n📥 Step 2: Merging typo collection`);
    if (collectionNames.includes(TYPO_COLLECTION)) {
      await mergeTypoCollection(client, SOURCE_DB, TARGET_DB, flags.dryRun);
    } else {
      console.log(`   ⏭  Typo collection "${TYPO_COLLECTION}" not found in source — skipping`);
    }

    // Step 3: Optionally drop old collections
    if (flags.dropOld) {
      await dropSourceCollections(client, SOURCE_DB, collectionNames, flags.dryRun);
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║                    Migration Summary                    ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log(`Mode:         ${flags.dryRun ? 'DRY RUN' : 'APPLIED'}`);
    console.log(`Collections:  ${toCopy.length} copied, ${collectionNames.includes(TYPO_COLLECTION) ? '1 merged' : '0 merged'}`);
    console.log(`Drop old:     ${flags.dropOld ? 'Yes' : 'No'}`);
    console.log();

    for (const [name, result] of Object.entries(copyResults)) {
      const status = result.dryRun ? '[would copy]' : '[copied]';
      console.log(`  ${status} ${name}: ${result.copied} docs${result.skipped ? `, ${result.skipped} skipped` : ''}`);
    }

    if (flags.dryRun) {
      console.log('\n💡 To apply these changes, re-run with: node scripts/migrateAtlasDb.js --apply');
    }

  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB Atlas');
  }
}

main();
