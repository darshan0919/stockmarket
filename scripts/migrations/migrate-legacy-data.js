const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../../packages/jobs-runtime/lib/env');
const { StorageService } = require('@stock/cloud-utils');

loadEnv(path.join(__dirname, '..', '.env'));
StorageService.init();

const baseDir = path.join(__dirname, '..', 'data');
const notesDir = path.join(baseDir, 'notes');
const validationDir = path.join(baseDir, 'validation');
const gainersDir = path.join(baseDir, 'daily_gainers');
const cacheDir = path.join(baseDir, 'delivery_cache');

async function migrateNotes() {
  if (!fs.existsSync(notesDir)) return;
  const files = fs.readdirSync(notesDir)
    .filter(f => /^notes_.*\.json$/.test(f))
    .map(f => ({ f, mtime: fs.statSync(path.join(notesDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
    
  if (files.length > 0) {
    const latest = path.join(notesDir, files[0].f);
    console.log(`Migrating notes from ${latest}`);
    const notesData = JSON.parse(fs.readFileSync(latest, 'utf8'));
    await StorageService.saveEntity('watchlist-notes', 'main', 'current', notesData);
  }
}

async function migrateValidation() {
  if (!fs.existsSync(validationDir)) return;
  
  // Ledger
  const ledgerPath = path.join(validationDir, 'ledger.json');
  if (fs.existsSync(ledgerPath)) {
    console.log('Migrating validation ledger');
    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    await StorageService.saveEntity('validation', 'main', 'ledger', ledger);
  }
  
  // Proposals
  const proposalsPath = path.join(validationDir, 'proposals.md');
  if (fs.existsSync(proposalsPath)) {
    console.log('Migrating proposals');
    const props = fs.readFileSync(proposalsPath, 'utf8');
    await StorageService.saveContent('documents/validation/proposals/proposals.md', props, true);
  }
  
  // Sector Context
  const files = fs.readdirSync(validationDir);
  for (const f of files) {
    if (f.startsWith('sector_context_')) {
      const match = f.match(/sector_context_(\d{4})(\d{2})(\d{2})\.json/);
      if (match) {
        const [_, yyyy, mm, dd] = match;
        const d = new Date(Date.UTC(parseInt(yyyy), parseInt(mm)-1, parseInt(dd)));
        const dtoPaths = StorageService.getEventDtoPaths('sector_context', d, 'events/validation/sector-context');
        console.log(`Migrating ${f} -> ${dtoPaths.jsonPath}`);
        const data = JSON.parse(fs.readFileSync(path.join(validationDir, f), 'utf8'));
        await StorageService.saveJson(dtoPaths.jsonPath, data, true);
      }
    } else if (f.startsWith('ignored_log_')) {
      const match = f.match(/ignored_log_(\d{4})(\d{2})(\d{2})\.json/);
      if (match) {
        const [_, yyyy, mm, dd] = match;
        const logPath = `events/validation/ignored-log/${yyyy}/${mm}/${dd}_log.json`;
        console.log(`Migrating ${f} -> ${logPath}`);
        const data = JSON.parse(fs.readFileSync(path.join(validationDir, f), 'utf8'));
        await StorageService.saveJson(logPath, data, true);
      }
    }
  }
}

async function migrateGainers() {
  if (!fs.existsSync(gainersDir)) return;
  const files = fs.readdirSync(gainersDir);
  for (const f of files) {
    const match = f.match(/(\d{4})-(\d{2})-(\d{2})_gainers_raw\.json/);
    if (match) {
      const [_, yyyy, mm, dd] = match;
      const d = new Date(parseInt(yyyy), parseInt(mm)-1, parseInt(dd));
      const dtoPaths = StorageService.getEventDtoPaths('gainers_raw', d, 'events/gainers');
      console.log(`Migrating ${f} -> ${dtoPaths.jsonPath}`);
      const data = JSON.parse(fs.readFileSync(path.join(gainersDir, f), 'utf8'));
      await StorageService.saveJson(dtoPaths.jsonPath, data, true);
    }
  }
}

async function migrateCache() {
  if (!fs.existsSync(cacheDir)) return;
  const files = fs.readdirSync(cacheDir);
  for (const f of files) {
    if (f === 'bse_scrip_codes.json') {
      console.log('Migrating BSE Scrip Cache');
      const data = JSON.parse(fs.readFileSync(path.join(cacheDir, f), 'utf8'));
      await StorageService.saveEntity('reference', 'bse', 'scrip_codes', data);
    } else if (f.startsWith('sec_bhavdata_full_')) {
      const match = f.match(/sec_bhavdata_full_(\d{2})(\d{2})(\d{4})\.csv/);
      if (match) {
        const [_, dd, mm, yyyy] = match;
        const relPath = `events/market-data/nse-delivery/${yyyy}/${mm}/sec_bhavdata_full_${yyyy}${mm}${dd}.csv`;
        console.log(`Migrating ${f} -> ${relPath}`);
        const text = fs.readFileSync(path.join(cacheDir, f), 'utf8');
        await StorageService.saveContent(relPath, text, true);
      }
    }
  }
}

async function run() {
  console.log('Starting migration to new StorageService format...');
  await migrateNotes();
  await migrateValidation();
  await migrateGainers();
  await migrateCache();
  console.log('Migration complete.');
}

run().catch(console.error);
