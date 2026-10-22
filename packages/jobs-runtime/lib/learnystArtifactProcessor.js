'use strict';

/**
 * learnystArtifactProcessor.js — converts non-text Learnyst attachments (PDF, XLSX,
 * DOCX, PPTX) and media (M4A audio, MP4 video) into properly formatted .txt, .md,
 * and .json files, tags them as processed in the learnyst-lessons DB, and safely
 * frees repository disk space.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const db = require('./db');
const { pdfToTextWithMeta } = require('@stock/cloud-utils');
const { uploadFileToGemini, transcribeAudio } = require('./geminiMediaTranscriber');

const PYTHON_EXTRACTOR = path.join(__dirname, 'documentExtractors.py');

/**
 * Extract text from a PDF file using pdftotext -layout with OCR fallback.
 * Writes <base>.txt and <base>.json alongside the file.
 *
 * @param {string} absPath Absolute path to PDF
 * @returns {Promise<{ processedFile: string, processedPath: string, newPath: string, format: string, chars: number, numPages: number }>}
 */
async function processPdf(absPath) {
  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  const base = path.basename(absPath, ext);
  const txtPath = path.join(dir, `${base}.txt`);
  const jsonPath = path.join(dir, `${base}.json`);

  let text = '';
  let numPages = null;
  let ocrUsed = false;

  try {
    text = execFileSync('pdftotext', ['-layout', absPath, '-'], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      timeout: 30000,
    });
  } catch (_err) {
    text = '';
  }

  // If text is thin, fallback to OCR
  if (!text || text.trim().length < 40) {
    try {
      const buf = fs.readFileSync(absPath);
      const meta = await pdfToTextWithMeta(buf, { maxChars: Infinity });
      text = meta.text || '';
      numPages = meta.numPages;
      ocrUsed = Boolean(meta.isScannedDocument);
    } catch (_ocrErr) {
      // Keep best effort
    }
  }

  // Approximate page count from form-feed delimiters if not from meta
  if (!numPages && text) {
    const pages = text.split('\f');
    numPages = pages.length;
  }

  const cleanText = (text || '').trim();
  fs.writeFileSync(txtPath, cleanText, 'utf8');

  const metaRecord = {
    sourceFile: path.basename(absPath),
    processedFile: `${base}.txt`,
    format: 'txt',
    chars: cleanText.length,
    numPages: numPages || 1,
    ocrUsed,
    extractedAt: new Date().toISOString(),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(metaRecord, null, 2), 'utf8');

  const relProcessedPath = path.join('assets', 'learnyst-attachments', `${base}.txt`);
  return {
    processedFile: `${base}.txt`,
    processedPath: relProcessedPath,
    newPath: relProcessedPath,
    format: 'txt',
    chars: cleanText.length,
    numPages: numPages || 1,
  };
}

/**
 * Extract an XLSX spreadsheet into structured JSON and Markdown tables.
 *
 * @param {string} absPath
 * @returns {Promise<{ processedFile: string, processedPath: string, newPath: string, format: string, chars: number }>}
 */
async function processXlsx(absPath) {
  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  const base = path.basename(absPath, ext);
  const jsonPath = path.join(dir, `${base}.json`);
  const mdPath = path.join(dir, `${base}.md`);

  const stdout = execFileSync('python3', [PYTHON_EXTRACTOR, 'xlsx', absPath], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  const parsed = JSON.parse(stdout);
  if (parsed.error) throw new Error(parsed.error);

  const metaRecord = {
    sourceFile: path.basename(absPath),
    processedFile: `${base}.json`,
    markdownFile: `${base}.md`,
    format: 'json',
    sheetNames: parsed.sheet_names || [],
    sheets: parsed.sheets || {},
    chars: parsed.chars || 0,
    extractedAt: new Date().toISOString(),
  };

  fs.writeFileSync(jsonPath, JSON.stringify(metaRecord, null, 2), 'utf8');
  if (parsed.text) {
    fs.writeFileSync(mdPath, parsed.text, 'utf8');
  }

  const relProcessedPath = path.join('assets', 'learnyst-attachments', `${base}.json`);
  return {
    processedFile: `${base}.json`,
    processedPath: relProcessedPath,
    newPath: relProcessedPath,
    format: 'json',
    chars: parsed.chars || 0,
  };
}

/**
 * Extract a DOCX document into Markdown and JSON.
 *
 * @param {string} absPath
 * @returns {Promise<{ processedFile: string, processedPath: string, newPath: string, format: string, chars: number }>}
 */
async function processDocx(absPath) {
  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  const base = path.basename(absPath, ext);
  const mdPath = path.join(dir, `${base}.md`);
  const jsonPath = path.join(dir, `${base}.json`);

  const stdout = execFileSync('python3', [PYTHON_EXTRACTOR, 'docx', absPath], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  const parsed = JSON.parse(stdout);
  if (parsed.error) throw new Error(parsed.error);

  const cleanText = (parsed.text || '').trim();
  fs.writeFileSync(mdPath, cleanText, 'utf8');

  const metaRecord = {
    sourceFile: path.basename(absPath),
    processedFile: `${base}.md`,
    format: 'markdown',
    paragraphs: parsed.paragraphs || 0,
    chars: cleanText.length,
    extractedAt: new Date().toISOString(),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(metaRecord, null, 2), 'utf8');

  const relProcessedPath = path.join('assets', 'learnyst-attachments', `${base}.md`);
  return {
    processedFile: `${base}.md`,
    processedPath: relProcessedPath,
    newPath: relProcessedPath,
    format: 'markdown',
    chars: cleanText.length,
  };
}

/**
 * Extract a PPTX presentation into slide-by-slide Markdown and JSON.
 *
 * @param {string} absPath
 * @returns {Promise<{ processedFile: string, processedPath: string, newPath: string, format: string, chars: number }>}
 */
async function processPptx(absPath) {
  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  const base = path.basename(absPath, ext);
  const mdPath = path.join(dir, `${base}.md`);
  const jsonPath = path.join(dir, `${base}.json`);

  const stdout = execFileSync('python3', [PYTHON_EXTRACTOR, 'pptx', absPath], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

  const parsed = JSON.parse(stdout);
  if (parsed.error) throw new Error(parsed.error);

  const cleanText = (parsed.text || '').trim();
  fs.writeFileSync(mdPath, cleanText, 'utf8');

  const metaRecord = {
    sourceFile: path.basename(absPath),
    processedFile: `${base}.md`,
    format: 'markdown',
    slides: parsed.slides || [],
    chars: cleanText.length,
    extractedAt: new Date().toISOString(),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(metaRecord, null, 2), 'utf8');

  const relProcessedPath = path.join('assets', 'learnyst-attachments', `${base}.md`);
  return {
    processedFile: `${base}.md`,
    processedPath: relProcessedPath,
    newPath: relProcessedPath,
    format: 'markdown',
    chars: cleanText.length,
  };
}

/**
 * Process any attachment file by extension.
 *
 * @param {string} absPath
 * @param {Object} [opts]
 * @param {boolean} [opts.cleanRaw=false] If true, removes the original raw binary file after successful extraction
 * @returns {Promise<Object>}
 */
async function processAttachmentFile(absPath, { cleanRaw = false } = {}) {
  const ext = path.extname(absPath).toLowerCase();
  let result;

  if (ext === '.pdf') {
    result = await processPdf(absPath);
  } else if (ext === '.xlsx') {
    result = await processXlsx(absPath);
  } else if (ext === '.docx') {
    result = await processDocx(absPath);
  } else if (ext === '.pptx') {
    result = await processPptx(absPath);
  } else {
    throw new Error(`Unsupported attachment extension: ${ext}`);
  }

  if (cleanRaw && result && result.chars > 0) {
    try {
      fs.unlinkSync(absPath);
    } catch (_err) {
      // ignore unlink error
    }
  }

  return result;
}

/**
 * Transcribe an audio file using Gemini and write .transcript.txt and .transcript.json.
 *
 * @param {string} absPath Absolute path to .m4a file
 * @param {string} [title] Optional lesson title
 * @param {Object} [opts]
 * @param {boolean} [opts.cleanRaw=false]
 * @returns {Promise<{ processedFile: string, processedPath: string, newPath: string, transcript: string }>}
 */
async function processAudioFile(absPath, title, { cleanRaw = false } = {}) {
  const dir = path.dirname(absPath);
  const ext = path.extname(absPath);
  const base = path.basename(absPath, ext);
  const txtPath = path.join(dir, `${base}.transcript.txt`);
  const jsonPath = path.join(dir, `${base}.transcript.json`);

  const fileObj = await uploadFileToGemini(absPath, 'audio/mp4', base);
  const transcriptText = await transcribeAudio(fileObj, title || base);

  fs.writeFileSync(txtPath, transcriptText, 'utf8');
  const record = {
    sourceFile: path.basename(absPath),
    processedFile: `${base}.transcript.txt`,
    format: 'txt',
    chars: transcriptText.length,
    extractedAt: new Date().toISOString(),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2), 'utf8');

  if (cleanRaw) {
    try {
      fs.unlinkSync(absPath);
    } catch (_err) {
      // ignore
    }
  }

  const relProcessedPath = path.join('assets', 'learnyst-audio', `${base}.transcript.txt`);
  return {
    processedFile: `${base}.transcript.txt`,
    processedPath: relProcessedPath,
    newPath: relProcessedPath,
    transcript: transcriptText,
  };
}

/**
 * Update the learnyst-lessons collection, marking every attachment and media
 * artifact as processed with its new path.
 *
 * @param {Map<string, Object>} processedMap Map from original attachment src to result object
 * @param {Map<number, Object>} mediaMap Map from lessonId to audio/video result object
 * @returns {{ lessonsUpdated: number, attachmentsTagged: number }}
 */
function updateLearnystLessonsDb(processedMap, mediaMap = new Map()) {
  db.init();
  const allLessons = db.find('learnyst-lessons', () => true);
  let lessonsUpdated = 0;
  let attachmentsTagged = 0;

  for (const item of allLessons) {
    const full = db.readLearnystTranscript(item.id);
    if (!full) continue;

    let modified = false;

    // Check attachments
    if (Array.isArray(full.attachments) && full.attachments.length > 0) {
      for (const att of full.attachments) {
        const proc = processedMap.get(att.src);
        if (proc) {
          att.processed = true;
          att.processedPath = proc.processedPath;
          att.newPath = proc.newPath;
          att.processedAt = new Date().toISOString();
          attachmentsTagged++;
          modified = true;
        } else {
          // Check if file already exists on disk
          const ext = path.extname(att.src);
          const base = att.src.slice(0, -ext.length);
          const candidates = [`${base}.txt`, `${base}.md`, `${base}.json`];
          for (const c of candidates) {
            const p = path.join(db.dataRoot(), 'assets', 'learnyst-attachments', c);
            if (fs.existsSync(p)) {
              att.processed = true;
              att.processedPath = path.join('assets', 'learnyst-attachments', c);
              att.newPath = att.processedPath;
              att.processedAt = new Date().toISOString();
              attachmentsTagged++;
              modified = true;
              break;
            }
          }
        }
      }
    }

    // Check media
    const lessonIdNum = Number(full.lessonId);
    const mediaProc = mediaMap.get(lessonIdNum);
    if (mediaProc) {
      if (full.video) {
        full.video.processed = true;
        full.video.processedPath = mediaProc.processedPath;
        full.video.newPath = mediaProc.newPath;
        full.video.processedAt = new Date().toISOString();
      }
      if (full.audio) {
        full.audio.processed = true;
        full.audio.processedPath = mediaProc.processedPath;
        full.audio.newPath = mediaProc.newPath;
        full.audio.processedAt = new Date().toISOString();
      }
      full.videoPath = mediaProc.processedPath;
      full.audioPath = mediaProc.processedPath;
      if (mediaProc.transcript && (!full.transcript || full.transcriptSource === 'pending')) {
        full.transcript = mediaProc.transcript;
        full.transcriptSource = 'gemini-audio';
      }
      modified = true;
    }

    if (modified) {
      db.saveLearnystTranscript(full);
      lessonsUpdated++;
    }
  }

  return { lessonsUpdated, attachmentsTagged };
}

module.exports = {
  processPdf,
  processXlsx,
  processDocx,
  processPptx,
  processAttachmentFile,
  processAudioFile,
  updateLearnystLessonsDb,
};
