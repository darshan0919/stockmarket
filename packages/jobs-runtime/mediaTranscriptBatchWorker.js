#!/usr/bin/env node
'use strict';

/**
 * mediaTranscriptBatchWorker.js — Incremental batch processor for videos and
 * media without transcripts (YouTube uncaptioned videos and X-posts media:
 * photos, screenshots, and videos).
 *
 * Runs on a recurring schedule (5x daily) to gradually drain the uncaptioned/untranscribed
 * backlog by:
 * 1. Selecting the next batch of uncaptioned YouTube videos and X-posts media.
 * 2. Downloading lightweight audio stream via yt-dlp (for YouTube & X videos).
 * 3. Downloading image files directly (for X photos/screenshots).
 * 4. Transcribing / describing media via Gemini 2.5 Flash (audio transcription + vision).
 * 5. Storing transcripts in sharded database via db.saveYoutubeTranscript() and db.saveXPosts().
 * 6. Cleaning up temporary files on disk and in Gemini Files storage.
 *
 * Usage:
 *   node packages/jobs-runtime/mediaTranscriptBatchWorker.js [--source <youtube|x-posts|all>] [--limit N] [--x-limit N] [--channel <handle>] [--handle <handle>] [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const db = require('./lib/db');
const { loadEnv } = require('./lib/env');
const {
  uploadFileToGemini,
  transcribeAudio,
  describeImage,
} = require('./lib/geminiMediaTranscriber');

const execFileAsync = promisify(execFile);
loadEnv();

const API_KEY = process.env.GEMINI_API_KEY;

function parseArgs(argv) {
  const getArg = (flag) => {
    const idx = argv.indexOf(flag);
    return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : null;
  };
  return {
    source: (getArg('--source') || 'all').toLowerCase(),
    limit: Number(getArg('--limit')) || 5,
    xLimit: Number(getArg('--x-limit')) || 10,
    channel: getArg('--channel') || getArg('--handle') || null,
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

async function downloadXVideoAudio(statusUrl) {
  const tmpTemplate = path.join(
    os.tmpdir(),
    `x_audio_${Date.now()}_${Math.random().toString(36).slice(2)}.%(ext)s`
  );
  const args = [
    '-f',
    'ba[ext=m4a]/ba/b',
    '-x',
    '--audio-format',
    'm4a',
    '--no-playlist',
    '-o',
    tmpTemplate,
    statusUrl,
  ];

  await execFileAsync('yt-dlp', args, { maxBuffer: 10 * 1024 * 1024 });

  const dir = path.dirname(tmpTemplate);
  const basePrefix = path.basename(tmpTemplate).split('.%(ext)s')[0];
  const files = fs.readdirSync(dir);
  const match = files.find((f) => f.startsWith(basePrefix));
  if (!match) {
    throw new Error(`X video audio download not found for ${statusUrl}`);
  }
  return path.join(dir, match);
}

async function downloadXPhoto(photoUrl) {
  const fullUrl = photoUrl.includes('?')
    ? `${photoUrl}&format=jpg&name=large`
    : `${photoUrl}?format=jpg&name=large`;
  const res = await fetch(fullUrl);
  if (!res.ok) {
    throw new Error(`Failed to download X photo (HTTP ${res.status}): ${fullUrl}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const tmpFile = path.join(
    os.tmpdir(),
    `x_img_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
  );
  fs.writeFileSync(tmpFile, buf);
  return tmpFile;
}

function loadExistingMediaIndex(handle, mediaDir = null) {
  const dir = mediaDir || path.resolve(__dirname, '../../data/runs/learn-and-automate/_media');
  const file = path.join(dir, `${String(handle).toLowerCase()}.index.jsonl`);
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  const content = fs.readFileSync(file, 'utf8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r.url) map.set(r.url, r);
    } catch (_) {}
  }
  return map;
}

function saveToMediaIndex(record, mediaDir = null) {
  if (!record || !record.handle) return;
  const dir = mediaDir || path.resolve(__dirname, '../../data/runs/learn-and-automate/_media');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${String(record.handle).toLowerCase()}.index.jsonl`);
  fs.appendFileSync(file, JSON.stringify(record) + '\n');
}

/**
 * Filter an array of media objects to retain actionable non-GIF media (photos, videos).
 *
 * @param {Array<{type: string, url: string}>} mediaList
 * @returns {Array<{type: string, url: string}>}
 */
function filterActionableMedia(mediaList) {
  if (!Array.isArray(mediaList)) return [];
  return mediaList.filter((m) => m && (m.type === 'photo' || m.type === 'video'));
}

/**
 * Select a batch of X-posts with actionable media needing transcription or description.
 *
 * @param {Array<object>|null} [docs] Injected documents for testing, or null to read from disk.
 * @param {object} [options]
 * @param {number} [options.limit=10]
 * @param {string|null} [options.handle=null]
 * @param {string} [options.mediaDir=null]
 * @returns {{ batch: Array<object>, totalPending: number }}
 */
function selectXMediaBatch(
  docs = null,
  { limit = 10, handle = null, mediaDir: _mediaDir = null } = {}
) {
  let selectedHandles = new Set();
  const expertsPath = path.resolve(__dirname, '../../data/x-experts.json');
  if (fs.existsSync(expertsPath)) {
    try {
      const experts = JSON.parse(fs.readFileSync(expertsPath, 'utf8')).experts || {};
      for (const [k, v] of Object.entries(experts)) {
        if (v && v.selected) selectedHandles.add(k.toLowerCase());
      }
    } catch (_) {}
  }
  if (!selectedHandles.size) {
    selectedHandles = new Set([
      'sureshkbn',
      'shashank1171',
      'thechartist26',
      'ishmohit1',
      'shiladitya4u',
    ]);
  }

  const filterH = handle ? handle.toLowerCase().replace('@', '') : null;
  const candidateDocsMap = new Map();

  const checkDoc = (d) => {
    const h = (d.handle || '').toLowerCase();
    if (filterH ? h !== filterH : !selectedHandles.has(h)) return;
    if (d.mediaText && String(d.mediaText).trim().length > 0) {
      candidateDocsMap.delete(d.id);
      return;
    }

    const actionable = filterActionableMedia(d.media);
    if (!actionable.length) {
      candidateDocsMap.delete(d.id);
      return;
    }

    candidateDocsMap.set(d.id, {
      id: d.id,
      handle: d.handle,
      publishedAt: d.publishedAt || '',
      url: d.url || `https://x.com/${d.handle}/status/${d.rootId || d.key}`,
      text: d.text || '',
      likes: (d.metrics && d.metrics.likes) || 0,
      media: actionable,
      hasVideo: actionable.some((m) => m.type === 'video'),
      hasPhoto: actionable.some((m) => m.type === 'photo'),
    });
  };

  if (Array.isArray(docs)) {
    docs.forEach(checkDoc);
  } else {
    const xPostsDir = path.resolve(__dirname, '../../data/x-posts');
    if (fs.existsSync(xPostsDir)) {
      const files = fs.readdirSync(xPostsDir).filter((f) => f.endsWith('.jsonl'));
      for (const f of files) {
        const content = fs.readFileSync(path.join(xPostsDir, f), 'utf8');
        for (const line of content.split('\n')) {
          if (!line.trim()) continue;
          try {
            checkDoc(JSON.parse(line));
          } catch (_) {}
        }
      }
    }
  }

  const candidateDocs = Array.from(candidateDocsMap.values());

  // Prioritize videos and higher likes, then newest
  candidateDocs.sort((a, b) => {
    if (a.hasVideo !== b.hasVideo) return a.hasVideo ? -1 : 1;
    if (b.likes !== a.likes) return b.likes - a.likes;
    return (b.publishedAt || '').localeCompare(a.publishedAt || '');
  });

  return {
    batch: candidateDocs.slice(0, limit),
    totalPending: candidateDocs.length,
  };
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

async function processXMediaItem(item, { dryRun = false } = {}) {
  const fullDoc = db.readXPost(item.id);
  if (!fullDoc) {
    throw new Error(`Doc not found in DB: ${item.id}`);
  }

  if (dryRun) {
    return { id: item.id, mediaCount: item.media.length, dryRun: true };
  }

  const existingMap = loadExistingMediaIndex(item.handle);
  const mediaDescriptions = [];
  const updatedMedia = [];

  for (const m of item.media || []) {
    if (m.type === 'animated_gif') {
      continue; // No need to process GIFs
    }

    // Check if already has cached text in _media index
    const cached = existingMap.get(m.url);
    const cachedText =
      cached && (cached.visionText || (cached.cls === 'text' ? cached.ocrText : null));
    if (cachedText && cachedText.trim().length > 20) {
      mediaDescriptions.push(`[MEDIA: ${m.type.toUpperCase()}]\n${cachedText.trim()}`);
      updatedMedia.push({ ...m, text: cachedText.trim() });
      continue;
    }

    if (m.type === 'video') {
      let localAudioPath = null;
      let geminiFileName = null;
      try {
        localAudioPath = await downloadXVideoAudio(item.url);
        const stat = fs.statSync(localAudioPath);
        const sizeMb = (stat.size / 1024 / 1024).toFixed(1);
        console.log(`    Downloaded video audio (${sizeMb} MB) for ${item.id}`);
        const ext = path.extname(localAudioPath).toLowerCase();
        const mimeType = ext === '.m4a' ? 'audio/mp4' : 'audio/webm';

        const fileObj = await uploadFileToGemini(localAudioPath, mimeType, `x_video_${item.id}`);
        geminiFileName = fileObj.name;
        const text = await transcribeAudio(
          fileObj,
          `X post video by @${item.handle}: "${(item.text || '').slice(0, 80)}"`,
          item.handle
        );
        mediaDescriptions.push(`[VIDEO TRANSCRIPT]\n${text.trim()}`);
        updatedMedia.push({ ...m, text: text.trim() });

        saveToMediaIndex({
          url: m.url,
          docId: item.id,
          handle: item.handle,
          date: item.publishedAt ? item.publishedAt.slice(0, 10) : '',
          likes: item.likes || 0,
          tweet: (item.text || '').slice(0, 200),
          cls: 'video',
          visionText: text.trim(),
          visionModel: 'gemini-2.5-flash',
          visionKind: 'inferred',
        });
      } finally {
        if (localAudioPath && fs.existsSync(localAudioPath)) {
          try {
            fs.unlinkSync(localAudioPath);
          } catch (_) {}
        }
        if (geminiFileName) {
          await deleteGeminiFile(geminiFileName);
        }
      }
    } else if (m.type === 'photo') {
      let localImgPath = null;
      try {
        localImgPath = await downloadXPhoto(m.url);
        const stat = fs.statSync(localImgPath);
        const sizeKb = (stat.size / 1024).toFixed(1);
        console.log(`    Downloaded photo (${sizeKb} KB) for ${item.id}`);

        const text = await describeImage(localImgPath, 'image/jpeg', {
          handle: item.handle,
          tweet: item.text,
          title: `${item.handle}_${item.id}`,
        });
        mediaDescriptions.push(`[IMAGE ANALYSIS]\n${text.trim()}`);
        updatedMedia.push({ ...m, text: text.trim() });

        saveToMediaIndex({
          url: m.url,
          docId: item.id,
          handle: item.handle,
          date: item.publishedAt ? item.publishedAt.slice(0, 10) : '',
          likes: item.likes || 0,
          tweet: (item.text || '').slice(0, 200),
          cls: 'chart',
          visionText: text.trim(),
          visionModel: 'gemini-2.5-flash',
          visionKind: 'inferred',
        });
      } finally {
        if (localImgPath && fs.existsSync(localImgPath)) {
          try {
            fs.unlinkSync(localImgPath);
          } catch (_) {}
        }
      }
    }
  }

  if (mediaDescriptions.length) {
    fullDoc.mediaText = mediaDescriptions.join('\n\n---\n\n');
    if (updatedMedia.length && Array.isArray(fullDoc.media)) {
      fullDoc.media = fullDoc.media.map((orig) => {
        const match = updatedMedia.find((u) => u.url === orig.url);
        return match ? { ...orig, text: match.text } : orig;
      });
    }
    db.saveXPosts([fullDoc]);
    return {
      id: item.id,
      mediaCount: mediaDescriptions.length,
      mediaTextLength: fullDoc.mediaText.length,
    };
  }
  return { id: item.id, mediaCount: 0, mediaTextLength: 0 };
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(
    `Starting Media Transcript Batch Worker (source: ${args.source}, limit: ${args.limit}, x-limit: ${args.xLimit})...`
  );

  if (!API_KEY) {
    console.error('Fatal: GEMINI_API_KEY is not configured in .env');
    process.exitCode = 1;
    return;
  }

  const runYoutube = args.source === 'all' || args.source === 'youtube';
  const runXPosts = args.source === 'all' || args.source === 'x-posts';

  const summary = {};

  // 1. YouTube uncaptioned video processing
  if (runYoutube) {
    console.log(`\n--- [YouTube Batch Processing] ---`);
    const ytMasterPath = path.resolve(__dirname, '../../data/youtube-transcripts.json');
    if (fs.existsSync(ytMasterPath)) {
      const ytMaster = JSON.parse(fs.readFileSync(ytMasterPath, 'utf8'));
      const allEntries = Object.values(ytMaster);
      const { batch: ytBatch, uncaptioned } = selectBatch(allEntries, args);

      console.log(`Found ${uncaptioned.length} total uncaptioned video(s) in database.`);
      const ytSummary = {
        batchSize: ytBatch.length,
        processed: 0,
        succeeded: 0,
        failed: [],
        remainingUncaptioned: uncaptioned.length - ytBatch.length,
      };

      if (ytBatch.length > 0) {
        console.log(`Selected batch of ${ytBatch.length} video(s):`);
        ytBatch.forEach((item, idx) => {
          console.log(
            `  ${idx + 1}. [${item.channelTitle}] "${item.videoTitle}" (${item.videoId}) — ${item.publishedAt ? item.publishedAt.slice(0, 10) : 'N/A'}`
          );
        });

        if (!args.dryRun) {
          for (let i = 0; i < ytBatch.length; i++) {
            const item = ytBatch[i];
            const label = `[${i + 1}/${ytBatch.length}] (${item.videoId})`;
            console.log(`\n============================================================`);
            console.log(`${label} Downloading audio for "${item.videoTitle}"...`);

            let localAudioPath = null;
            let geminiFileName = null;

            try {
              localAudioPath = await downloadYoutubeAudio(item.videoId);
              const stat = fs.statSync(localAudioPath);
              const sizeMb = (stat.size / 1024 / 1024).toFixed(1);
              console.log(`${label} Downloaded audio (${sizeMb} MB)`);

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
              ytSummary.succeeded++;
            } catch (err) {
              console.error(`${label} Error processing video: ${err.message}`);
              ytSummary.failed.push({
                videoId: item.videoId,
                title: item.videoTitle,
                error: err.message,
              });
            } finally {
              if (localAudioPath && fs.existsSync(localAudioPath)) {
                try {
                  fs.unlinkSync(localAudioPath);
                } catch (_) {}
              }
              if (geminiFileName) {
                await deleteGeminiFile(geminiFileName);
              }
              ytSummary.processed++;
            }

            if (i < ytBatch.length - 1 && args.delaySec > 0) {
              console.log(`Waiting ${args.delaySec}s before next video...`);
              await new Promise((r) => setTimeout(r, args.delaySec * 1000));
            }
          }
        }
      }
      summary.youtube = ytSummary;
    }
  }

  // 2. X-Posts media processing (photos, screenshots, videos; no GIFs)
  if (runXPosts) {
    console.log(`\n--- [X-Posts Media Batch Processing] ---`);
    const { batch: xBatch, totalPending } = selectXMediaBatch(null, {
      limit: args.xLimit,
      handle: args.channel,
    });

    console.log(`Found ${totalPending} total X-post(s) with pending media in database.`);
    const xSummary = {
      batchSize: xBatch.length,
      processed: 0,
      succeeded: 0,
      failed: [],
      remainingPending: totalPending - xBatch.length,
    };

    if (xBatch.length > 0) {
      console.log(`Selected batch of ${xBatch.length} X-post(s) with media:`);
      xBatch.forEach((item, idx) => {
        const types = item.media.map((m) => m.type).join(', ');
        console.log(
          `  ${idx + 1}. [@${item.handle}] "${(item.text || '').slice(0, 60)}..." (${item.id}) [${types}] — ${item.publishedAt ? item.publishedAt.slice(0, 10) : 'N/A'}`
        );
      });

      if (!args.dryRun) {
        for (let i = 0; i < xBatch.length; i++) {
          const item = xBatch[i];
          const label = `[${i + 1}/${xBatch.length}] (@${item.handle} ${item.id})`;
          console.log(`\n============================================================`);
          console.log(`${label} Processing media attachments...`);

          try {
            const res = await processXMediaItem(item);
            console.log(
              `${label} Successfully processed ${res.mediaCount} media attachment(s), generated ${res.mediaTextLength} chars text.`
            );
            xSummary.succeeded++;
          } catch (err) {
            console.error(`${label} Error processing X media: ${err.message}`);
            xSummary.failed.push({ id: item.id, handle: item.handle, error: err.message });
          } finally {
            xSummary.processed++;
          }

          if (i < xBatch.length - 1 && args.delaySec > 0) {
            console.log(`Waiting ${args.delaySec}s before next X media item...`);
            await new Promise((r) => setTimeout(r, args.delaySec * 1000));
          }
        }
      }
    }
    summary.xPosts = xSummary;
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
  selectXMediaBatch,
  filterActionableMedia,
  processXMediaItem,
  downloadXPhoto,
  downloadXVideoAudio,
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
