#!/usr/bin/env node
'use strict';

/**
 * mediaTranscriptBatchWorker.js — Incremental batch processor for videos without
 * transcripts (YouTube uncaptioned videos and media).
 *
 * Runs on a recurring schedule (5x daily) to gradually drain the uncaptioned
 * backlog by:
 * 1. Selecting the next batch of uncaptioned videos (prioritizing recent uploads).
 * 2. Downloading only the lightweight audio stream via yt-dlp (no heavy video downloads).
 * 3. Uploading to Gemini Files API and generating structured transcripts with Gemini 2.5 Flash.
 * 4. Storing the transcripts in the sharded database via db.saveYoutubeTranscript().
 * 5. Cleaning up temporary files on disk and in Gemini Files storage.
 *
 * Usage:
 *   node packages/jobs-runtime/mediaTranscriptBatchWorker.js [--limit N] [--channel <handle>] [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const db = require('./lib/db');
const { loadEnv } = require('./lib/env');
const { uploadFileToGemini, transcribeAudio } = require('./lib/geminiMediaTranscriber');

const execFileAsync = promisify(execFile);
loadEnv();

const API_KEY = process.env.GEMINI_API_KEY;

function parseArgs(argv) {
  const getArg = (flag) => {
    const idx = argv.indexOf(flag);
    return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null;
  };
  return {
    limit: Number(getArg('--limit')) || 5,
    channel: getArg('--channel') || null,
    dryRun: argv.includes('--dry-run'),
    delaySec: Number(getArg('--delay-sec')) || 15,
  };
}

async function deleteGeminiFile(fileName) {
  if (!API_KEY || !fileName) return;
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${API_KEY}`, {
      method: 'DELETE',
    });
  } catch (_err) {
    // Non-blocking cleanup
  }
}

async function downloadYoutubeAudio(videoId) {
  const tmpTemplate = path.join(os.tmpdir(), `yt_audio_${videoId}_${Date.now()}.%(ext)s`);
  const args = [
    '-f',
    'ba[ext=m4a]/ba/b',
    '-x',
    '--audio-format',
    'm4a',
    '--no-playlist',
    '-o',
    tmpTemplate,
    `https://www.youtube.com/watch?v=${videoId}`,
  ];

  await execFileAsync('yt-dlp', args, { maxBuffer: 10 * 1024 * 1024 });

  // Locate the output file (could be .m4a or .opus)
  const dir = path.dirname(tmpTemplate);
  const basePrefix = path.basename(tmpTemplate).split('.%(ext)s')[0];
  const files = fs.readdirSync(dir);
  const match = files.find((f) => f.startsWith(basePrefix));
  if (!match) {
    throw new Error(`Audio download file not found for ${videoId}`);
  }
  return path.join(dir, match);
}

function getChannelPriority(item) {
  const text =
    `${item.channelTitle || ''} ${item.channelHandle || ''} ${item.videoTitle || ''}`.toLowerCase();
  // 1. Chartitude / The Chartist / Kunal Saraogi
  if (text.includes('chartitude') || text.includes('chartist') || text.includes('saraogi')) {
    return 1;
  }
  // 2. SOIC
  if (text.includes('soic')) {
    return 2;
  }
  // 3. Dr. Anil Lamba
  if (text.includes('lamba')) {
    return 3;
  }
  // 4. Others
  return 4;
}

function selectBatch(allEntries, { limit = 5, channel = null } = {}) {
  let uncaptioned = allEntries.filter((item) => !item.captionKind || item.captionKind === 'none');

  if (channel) {
    const filterCh = channel.toLowerCase().replace('@', '');
    uncaptioned = uncaptioned.filter(
      (item) =>
        (item.channelHandle && item.channelHandle.toLowerCase().includes(filterCh)) ||
        (item.channelTitle && item.channelTitle.toLowerCase().includes(filterCh))
    );
  }

  // Prioritize channel: Chartitude first (1), then SOIC (2), then Dr. Anil Lamba (3), then others (4)
  // Within same priority, sort by publishedAt descending (latest videos first)
  uncaptioned.sort((a, b) => {
    const prioA = getChannelPriority(a);
    const prioB = getChannelPriority(b);
    if (prioA !== prioB) return prioA - prioB;
    return (b.publishedAt || '').localeCompare(a.publishedAt || '');
  });

  const batch = uncaptioned.slice(0, limit);
  return { batch, uncaptioned };
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(`Starting Media Transcript Batch Worker (limit: ${args.limit})...`);

  if (!API_KEY) {
    console.error('Fatal: GEMINI_API_KEY is not configured in .env');
    process.exitCode = 1;
    return;
  }

  // Read youtube-transcripts master list
  const ytMasterPath = path.resolve(__dirname, '../../data/youtube-transcripts.json');
  if (!fs.existsSync(ytMasterPath)) {
    console.log('No youtube-transcripts.json found.');
    return;
  }

  const ytMaster = JSON.parse(fs.readFileSync(ytMasterPath, 'utf8'));
  const allEntries = Object.values(ytMaster);
  const { batch, uncaptioned } = selectBatch(allEntries, args);

  console.log(`Found ${uncaptioned.length} total uncaptioned video(s) in database.`);
  if (uncaptioned.length === 0) {
    console.log('No uncaptioned videos pending! All videos have transcripts.');
    return;
  }
  console.log(`Selected batch of ${batch.length} video(s) for this run:`);
  batch.forEach((item, idx) => {
    console.log(
      `  ${idx + 1}. [${item.channelTitle}] "${item.videoTitle}" (${item.videoId}) — ${item.publishedAt ? item.publishedAt.slice(0, 10) : 'N/A'}`
    );
  });

  if (args.dryRun) {
    console.log('\n[Dry-run] Exiting without processing.');
    return;
  }

  const summary = {
    batchSize: batch.length,
    processed: 0,
    succeeded: 0,
    failed: [],
    remainingUncaptioned: uncaptioned.length - batch.length,
  };

  for (let i = 0; i < batch.length; i++) {
    const item = batch[i];
    const label = `[${i + 1}/${batch.length}] (${item.videoId})`;
    console.log(`\n============================================================`);
    console.log(`${label} Downloading audio for "${item.videoTitle}"...`);

    let localAudioPath = null;
    let geminiFileName = null;

    try {
      localAudioPath = await downloadYoutubeAudio(item.videoId);
      const stat = fs.statSync(localAudioPath);
      const sizeMb = (stat.size / 1024 / 1024).toFixed(1);
      console.log(`${label} Downloaded audio (${sizeMb} MB)`);

      // Determine mime-type
      const ext = path.extname(localAudioPath).toLowerCase();
      const mimeType = ext === '.m4a' ? 'audio/mp4' : 'audio/webm';

      console.log(`${label} Uploading to Gemini Files API...`);
      const fileObj = await uploadFileToGemini(localAudioPath, mimeType, item.videoTitle);
      geminiFileName = fileObj.name;

      console.log(`${label} Transcribing with Gemini 2.5 Flash...`);
      const text = await transcribeAudio(
        fileObj,
        item.videoTitle,
        item.channelTitle || item.channelHandle || ''
      );
      console.log(`${label} Transcription completed! Generated ${text.length} characters.`);

      // Persist in DB and shard
      const dto = {
        id: item.id,
        type: 'youtube-transcript',
        creator: 'media-transcript-batch-worker',
        channelId: item.channelId,
        channelHandle: item.channelHandle,
        channelTitle: item.channelTitle,
        videoId: item.videoId,
        videoTitle: item.videoTitle,
        publishedAt: item.publishedAt,
        captionLang: 'en',
        captionKind: 'gemini-audio',
        transcriptPlain: text,
        transcriptTimestamped: null,
        fetchedAt: new Date().toISOString(),
      };

      db.saveYoutubeTranscript(dto);
      console.log(`${label} Saved transcript to DB & shard.`);
      summary.succeeded++;
    } catch (err) {
      console.error(`${label} Error processing video: ${err.message}`);
      summary.failed.push({ videoId: item.videoId, title: item.videoTitle, error: err.message });
    } finally {
      // Clean up local file
      if (localAudioPath && fs.existsSync(localAudioPath)) {
        try {
          fs.unlinkSync(localAudioPath);
        } catch (_cleanupErr) {
          // ignore cleanup failure
        }
      }
      // Clean up Gemini remote file
      if (geminiFileName) {
        await deleteGeminiFile(geminiFileName);
      }
      summary.processed++;
    }

    if (i < batch.length - 1 && args.delaySec > 0) {
      console.log(`Waiting ${args.delaySec}s before next video...`);
      await new Promise((r) => setTimeout(r, args.delaySec * 1000));
    }
  }

  console.log(`\n=== Batch Run Summary ===`);
  console.log(JSON.stringify(summary, null, 2));

  const touched = db.touchedFiles ? db.touchedFiles() : [];
  if (touched.length > 0) {
    console.log(`\nFiles touched:`);
    touched.forEach((f) => console.log(`  ${f}`));
  }
  return summary;
}

module.exports = {
  parseArgs,
  getChannelPriority,
  selectBatch,
  deleteGeminiFile,
  downloadYoutubeAudio,
  main,
};

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal batch worker error:', err);
    process.exitCode = 1;
  });
}
