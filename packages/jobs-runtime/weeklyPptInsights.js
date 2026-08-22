#!/usr/bin/env node
'use strict';

/**
 * weeklyPptInsights.js — Weekly StockScans PPT Fetcher & Insight Generator
 *
 * Fetches the latest weekly PPTs, extracts text using pdf-parse, and uses AI
 * to generate a structured markdown report for Macro Developments, Sector Rotation,
 * M&A, and Order Book updates.
 *
 * PROCESSED-FILE CURSOR (added 2026-08-23): this job used to always process
 * "the latest 2 Drive folders" from scratch on every run — it skipped
 * re-DOWNLOADING a PDF already on disk, but always re-PARSED every PDF and
 * always re-ran the full LLM summarization over the combined text, even
 * when the same 2 folders were the latest on a re-run with no new content
 * since. Fixed per `skills/_shared/conventions.md` §19's "avoid paying for
 * the expensive work again" principle.
 *
 * This job's data isn't naturally time-windowed the way an announcement
 * scan is (Drive's `drive-folder-proxy` items don't have a request-side
 * cutoff param, and folder-name chronological ordering isn't confirmed live
 * — see fetchStockscansPpts.js for the same "latest 2 folders" shape used
 * elsewhere), so this uses the identity-based sibling of the resumable
 * cursor pattern: a persisted SET of already-summarized `fileId`s
 * (`data/cache/weekly-ppt-insights-processed-files.json`) rather than
 * `lib/windowCursor.js`'s timestamp-based cursor. Same principle, same
 * "commit only after the LLM call succeeds" rule — just keyed by file
 * identity instead of a time cutoff, since that's the axis this job's
 * source data is actually structured on.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const pdf = require('pdf-parse');
const { loadEnv } = require('./lib/env');
const { callAnthropic } = require('./lib/anthropicClient');
const db = require('./lib/db');

loadEnv(path.join(__dirname, '../../.env'));

const outputDir = path.join(__dirname, '..', '..', 'jobs', 'data', 'stockscans-ppts');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const PROCESSED_FILES_PATH = path.join(db.dataRoot(), 'cache', 'weekly-ppt-insights-processed-files.json');

/** Returns a Set of fileIds already summarized in a prior successful run. */
function loadProcessedFileIds() {
  if (!fs.existsSync(PROCESSED_FILES_PATH)) return new Set();
  try {
    const record = JSON.parse(fs.readFileSync(PROCESSED_FILES_PATH, 'utf8'));
    return new Set(Array.isArray(record.fileIds) ? record.fileIds : []);
  } catch {
    return new Set(); // corrupt/unreadable cache fails open — worst case this run re-processes, never worse than before this fix
  }
}

/**
 * Persist the updated processed-file set. Call ONLY after the LLM
 * summarization call for this run's new PDFs has succeeded — committing
 * after a failed/partial run would permanently skip files that were never
 * actually summarized.
 */
function saveProcessedFileIds(fileIdSet) {
  fs.mkdirSync(path.dirname(PROCESSED_FILES_PATH), { recursive: true });
  fs.writeFileSync(
    PROCESSED_FILES_PATH,
    JSON.stringify({ fileIds: [...fileIdSet], updatedAtIso: new Date().toISOString() }, null, 2)
  );
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 303) {
          downloadFile(response.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      })
      .on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

/**
 * Build the weekly-PPT-insights prompt for a batch of extracted PPT text.
 * @param {string} text - Combined extracted text from the week's PPTs.
 * @returns {string} Prompt ready to pass to `callAnthropic`.
 */
function buildWeeklyPptPrompt(text) {
  return `You are a financial analyst. Summarize the following extracted text from weekly market presentations into these categories:
1. Macro Developments & Sector Rotation
2. Order Book Updates
3. Financials (Banks and NBFCs)
4. Mergers, Demergers & Spin-offs
5. Interesting DRHPs/IPOs
6. Technical Setups & Scans

Text:
${text.substring(0, 80000)} // Truncating to avoid massive token usage for now
`;
}

async function run({ force = false } = {}) {
  console.log('Fetching root folder...');
  const rootUrl =
    'https://www.stockscans.in/drive-folder-proxy?folderId=1eaCLucSjMY895w4ngLzUxDXnafbIA1Jw';

  const processedFileIds = loadProcessedFileIds();

  try {
    const rootData = await fetchJson(rootUrl);
    const folders = rootData.items.filter((item) => item.isFolder);
    console.log(`Found ${folders.length} folders.`);

    // Fetch the latest 2 folders
    let allPdfs = [];
    for (const folder of folders.slice(-2)) {
      console.log(`Fetching files for folder: ${folder.name} (${folder.id})`);
      const folderUrl = `https://www.stockscans.in/drive-folder-proxy?folderId=${folder.id}`;
      const folderData = await fetchJson(folderUrl);
      const files = folderData.items.filter(
        (item) => !item.isFolder && item.name.toLowerCase().endsWith('.pdf')
      );

      for (const file of files) {
        allPdfs.push({
          folderName: folder.name,
          fileName: file.name,
          fileId: file.id,
        });
      }
    }

    // Skip files already summarized in a prior successful run — this is
    // the actual fix: without `force`, a re-run over the same 2 folders
    // with no new decks does zero PDF-parsing and zero LLM calls, instead
    // of silently redoing both.
    const newPdfs = force ? allPdfs : allPdfs.filter((p) => !processedFileIds.has(p.fileId));
    const skippedCount = allPdfs.length - newPdfs.length;
    if (skippedCount > 0) {
      console.log(`Skipping ${skippedCount} file(s) already summarized in a prior run.`);
    }

    if (newPdfs.length === 0) {
      console.log('No new PPTs since the last successful run — skipping parse and LLM call entirely.');
      console.log('Weekly PPT Insights pipeline completed (no-op).');
      return;
    }

    let combinedText = '';

    for (const pdfItem of newPdfs) {
      const destPath = path.join(outputDir, pdfItem.fileName);
      if (!fs.existsSync(destPath)) {
        console.log(`Downloading ${pdfItem.fileName}...`);
        const downloadUrl = `https://drive.google.com/uc?export=download&id=${pdfItem.fileId}`;
        await downloadFile(downloadUrl, destPath);
      }

      console.log(`Parsing ${pdfItem.fileName}...`);
      const dataBuffer = fs.readFileSync(destPath);
      try {
        const parsed = await pdf(dataBuffer);
        combinedText += `\n\n=== ${pdfItem.fileName} ===\n\n${parsed.text}`;
      } catch (e) {
        console.error(`Error parsing ${pdfItem.fileName}:`, e.message);
      }
    }

    console.log('Generating AI Insights...');
    const insights = await callAnthropic(buildWeeklyPptPrompt(combinedText));

    if (insights) {
      const outPath = path.join(db.dataRoot(), 'runs', 'latest_stockscans_insights.md');
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, insights);
      console.log(`Saved insights to ${outPath}`);
    }

    // Commit only after the summarization call above completed without
    // throwing — an error before this line leaves processedFileIds
    // unchanged, so the next run retries exactly these same files instead
    // of silently marking them done when they weren't actually summarized.
    for (const p of newPdfs) processedFileIds.add(p.fileId);
    saveProcessedFileIds(processedFileIds);

    console.log('Weekly PPT Insights pipeline completed.');
  } catch (error) {
    console.error('Error running pipeline:', error);
    console.error('Processed-file cursor NOT updated — next run will retry any files not yet confirmed summarized.');
  }
}

if (require.main === module) {
  const force = process.argv.includes('--force');
  run({ force });
}

module.exports = { run };
