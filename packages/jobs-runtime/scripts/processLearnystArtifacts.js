'use strict';

/**
 * processLearnystArtifacts.js — converts non-text Learnyst attachments (PDF, XLSX,
 * DOCX, PPTX) and media (audio, video) into properly formatted txt, md, or json files,
 * tags them in learnyst-lessons DB, and reclaims disk space.
 *
 * Usage:
 *   node scripts/processLearnystArtifacts.js [--clean-raw] [--skip-audio] [--limit N]
 */

const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const {
  processAttachmentFile,
  processAudioFile,
  updateLearnystLessonsDb,
} = require('../lib/learnystArtifactProcessor');

function parseArgs(argv) {
  return {
    cleanRaw: !argv.includes('--no-clean-raw'),
    skipAudio: argv.includes('--skip-audio'),
    limit: argv.find((a) => a.startsWith('--limit='))
      ? Number(argv.find((a) => a.startsWith('--limit=')).split('=')[1])
      : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log('=== Learnyst Artifact Processing ===');
  console.log(`Configuration: cleanRaw=${args.cleanRaw}, skipAudio=${args.skipAudio}`);

  const attachDir = path.join(db.dataRoot(), 'assets', 'learnyst-attachments');
  const audioDir = path.join(db.dataRoot(), 'assets', 'learnyst-audio');
  const videoDir = path.join(db.dataRoot(), 'assets', 'learnyst-videos');

  const processedMap = new Map();
  const mediaMap = new Map();

  let initialBytes = 0;
  function getDirSize(dir) {
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).reduce((acc, f) => {
      try {
        return acc + fs.statSync(path.join(dir, f)).size;
      } catch {
        return acc;
      }
    }, 0);
  }

  initialBytes += getDirSize(attachDir);
  initialBytes += getDirSize(audioDir);
  initialBytes += getDirSize(videoDir);
  console.log(
    `Initial total size of media & attachments: ${(initialBytes / 1024 / 1024).toFixed(1)} MB`
  );

  // 1. Process Attachments
  if (fs.existsSync(attachDir)) {
    // First, populate processedMap from existing metadata json files
    const metaFiles = fs
      .readdirSync(attachDir)
      .filter((f) => f.endsWith('.json') && !f.endsWith('.transcript.json'));
    for (const mf of metaFiles) {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(attachDir, mf), 'utf8'));
        if (meta && meta.sourceFile) {
          const relPath = path.join('assets', 'learnyst-attachments', meta.processedFile || mf);
          processedMap.set(meta.sourceFile, {
            processedFile: meta.processedFile || mf,
            processedPath: relPath,
            newPath: relPath,
            format: meta.format || 'txt',
            chars: meta.chars || 0,
          });
        }
      } catch {}
    }
    console.log(`Loaded ${processedMap.size} previously processed attachment(s) from disk.`);

    const rawFiles = fs
      .readdirSync(attachDir)
      .filter((f) => ['.pdf', '.xlsx', '.docx', '.pptx'].includes(path.extname(f).toLowerCase()))
      .filter((f) => !f.startsWith('.'))
      .filter((f) => !processedMap.has(f));

    const toProcess = args.limit ? rawFiles.slice(0, args.limit) : rawFiles;
    if (toProcess.length > 0) {
      console.log(
        `\nFound ${rawFiles.length} unprocessed raw attachment(s). Processing ${toProcess.length}...`
      );

      let done = 0;
      let failed = 0;
      for (const [idx, f] of toProcess.entries()) {
        const absPath = path.join(attachDir, f);
        try {
          const res = await processAttachmentFile(absPath, { cleanRaw: args.cleanRaw });
          processedMap.set(f, res);
          done++;
          if ((idx + 1) % 25 === 0 || idx + 1 === toProcess.length) {
            console.log(
              `  [${idx + 1}/${toProcess.length}] Processed ${f} (${res.format}, ${res.chars} chars)`
            );
          }
        } catch (err) {
          failed++;
          console.error(`  [${idx + 1}/${toProcess.length}] FAILED ${f}: ${err.message}`);
        }
      }
      console.log(`Attachments completed: ${done} succeeded, ${failed} failed.`);
    } else {
      console.log('All attachments already processed.');
    }
  }

  // 2. Process Audio & Video
  if (!args.skipAudio && fs.existsSync(audioDir)) {
    const audioFiles = fs
      .readdirSync(audioDir)
      .filter((f) => f.endsWith('.m4a') && !f.startsWith('.'));

    console.log(`\nFound ${audioFiles.length} audio file(s) to transcribe...`);

    // Map audio files to lesson IDs
    // Audio filename format: <lessonId>_<title>.m4a
    for (const af of audioFiles) {
      const match = af.match(/^(\d+)_(.+)\.m4a$/);
      if (!match) continue;
      const lessonId = Number(match[1]);
      const title = match[2].replace(/_/g, ' ');
      const absPath = path.join(audioDir, af);
      const base = path.basename(af, '.m4a');
      const existingTxt = path.join(audioDir, `${base}.transcript.txt`);

      // Check if duplicate lesson transcript can be reused
      const titleSlug = af.replace(/^\d+_/, '').replace(/\.m4a$/, '');
      const matchingExisting = fs
        .readdirSync(audioDir)
        .find(
          (f) =>
            f.includes(titleSlug) && f.endsWith('.transcript.txt') && f !== `${base}.transcript.txt`
        );

      if (
        matchingExisting &&
        (!fs.existsSync(existingTxt) || fs.statSync(existingTxt).size === 0)
      ) {
        console.log(`Copying existing transcript from ${matchingExisting} for ${af}...`);
        const srcText = fs.readFileSync(path.join(audioDir, matchingExisting), 'utf8');
        fs.writeFileSync(existingTxt, srcText, 'utf8');
        const jsonPath = path.join(audioDir, `${base}.transcript.json`);
        fs.writeFileSync(
          jsonPath,
          JSON.stringify(
            {
              sourceFile: af,
              processedFile: `${base}.transcript.txt`,
              copiedFrom: matchingExisting,
              chars: srcText.length,
              extractedAt: new Date().toISOString(),
            },
            null,
            2
          ),
          'utf8'
        );
      }

      // Check if transcript already exists
      if (fs.existsSync(existingTxt) && fs.statSync(existingTxt).size > 0) {
        console.log(`Audio ${af} already has transcript on disk, loading...`);
        const transcriptText = fs.readFileSync(existingTxt, 'utf8');
        const relPath = path.join('assets', 'learnyst-audio', `${base}.transcript.txt`);
        mediaMap.set(lessonId, {
          processedFile: `${base}.transcript.txt`,
          processedPath: relPath,
          newPath: relPath,
          transcript: transcriptText,
        });
        if (args.cleanRaw) {
          try {
            fs.unlinkSync(absPath);
          } catch {}
          const vPath = path.join(videoDir, `${base}.mp4`);
          try {
            if (fs.existsSync(vPath)) fs.unlinkSync(vPath);
          } catch {}
        }
        continue;
      }

      console.log(`Transcribing audio for lesson ${lessonId} ("${title}")...`);
      try {
        const res = await processAudioFile(absPath, title, { cleanRaw: args.cleanRaw });
        mediaMap.set(lessonId, res);
        console.log(`Successfully transcribed ${af} (${res.transcript.length} chars).`);

        // Also clean raw video if cleanRaw is enabled
        if (args.cleanRaw) {
          const vPath = path.join(videoDir, `${base}.mp4`);
          try {
            if (fs.existsSync(vPath)) fs.unlinkSync(vPath);
          } catch {}
        }

        // Rate limit cooldown between audio files
        await new Promise((r) => setTimeout(r, 10000));
      } catch (err) {
        console.error(`FAILED to transcribe ${af}: ${err.message}`);
      }
    }
  }

  // 3. Clean up any remaining raw video files if cleanRaw
  if (args.cleanRaw && fs.existsSync(videoDir)) {
    const videoFiles = fs
      .readdirSync(videoDir)
      .filter((f) => f.endsWith('.mp4') && !f.startsWith('.'));
    for (const vf of videoFiles) {
      const vPath = path.join(videoDir, vf);
      try {
        fs.unlinkSync(vPath);
        console.log(`Removed raw video file: ${vf}`);
      } catch {}
    }
  }

  // 4. Update Database
  console.log('\nUpdating learnyst-lessons DB with processed paths...');
  const { lessonsUpdated, attachmentsTagged } = updateLearnystLessonsDb(processedMap, mediaMap);
  console.log(
    `Database updated: ${lessonsUpdated} lessons modified, ${attachmentsTagged} attachment artifacts tagged.`
  );

  let finalBytes = 0;
  finalBytes += getDirSize(attachDir);
  finalBytes += getDirSize(audioDir);
  finalBytes += getDirSize(videoDir);
  const savedMB = ((initialBytes - finalBytes) / 1024 / 1024).toFixed(1);
  console.log(`\nFinal size of media & attachments: ${(finalBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Total disk space reclaimed: ${savedMB} MB!`);

  console.log('\nFiles touched:');
  for (const f of db.touchedFiles()) console.log(`  ${f}`);
}

main().catch((err) => {
  console.error('Fatal error in processLearnystArtifacts:', err);
  process.exit(1);
});
