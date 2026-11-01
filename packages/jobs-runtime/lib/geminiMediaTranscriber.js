'use strict';

const fs = require('fs');
const { loadEnv } = require('../lib/env');

loadEnv();
const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('No GEMINI_API_KEY found.');
  process.exit(1);
}

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

async function uploadFileToGemini(filePath, mimeType, displayName) {
  const stat = fs.statSync(filePath);
  console.log(`Starting upload for ${displayName} (${(stat.size / 1024 / 1024).toFixed(1)} MB)...`);

  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${API_KEY}`,
    {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(stat.size),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: displayName } }),
    }
  );

  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`Upload start failed (HTTP ${startRes.status}): ${errText}`);
  }

  const uploadUrl = startRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('No upload URL returned from Gemini');

  const stream = fs.createReadStream(filePath);
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(stat.size),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: stream,
    duplex: 'half',
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Upload bytes failed (HTTP ${uploadRes.status}): ${errText}`);
  }

  const fileData = await uploadRes.json();
  const fileObj = fileData.file;
  console.log(`Uploaded: ${fileObj.name} (${fileObj.uri})`);

  let state = fileObj.state;
  while (state === 'PROCESSING') {
    console.log(`Waiting for ${fileObj.name} to finish processing...`);
    await new Promise((r) => setTimeout(r, 5000));
    const checkRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileObj.name}?key=${API_KEY}`
    );
    const checkJson = await checkRes.json();
    state = checkJson.state;
  }

  if (state === 'FAILED') {
    throw new Error(`Gemini file processing failed for ${fileObj.name}`);
  }

  console.log(`File ${fileObj.name} is ready (state: ${state})`);
  return fileObj;
}

/**
 * Build domain-tailored prompt based on channel or source.
 *
 * @param {string} title
 * @param {string} [channel]
 * @returns {string}
 */
function buildTranscriptionPrompt(title, channel = '') {
  const ch = (channel || '').toLowerCase();

  if (ch.includes('chartitude') || ch.includes('chartist') || ch.includes('saraogi')) {
    return `You are transcribing a technical analysis, market strategy, and trading masterclass lecture from Chartitude (The Chartist / Kunal Saraogi) titled "${title}".
Please produce a comprehensive, structured output in Markdown with:
1. # ${title}
2. ## Executive Summary & Core Frameworks
3. ## Key Trading Principles, Setups & Chart Case Studies
4. ## Comprehensive Transcript & Structured Lecture Notes
Include all specific stock setups, chart patterns, support/resistance levels, indicators (RSI, moving averages, breakouts, volumes), risk management rules, and market psychology lessons taught in the session.`;
  }

  if (ch.includes('lamba')) {
    return `You are transcribing a corporate finance, accounting, and business management lecture from Dr. Anil Lamba (Romancing the Balance Sheet) titled "${title}".
Please produce a comprehensive, structured output in Markdown with:
1. # ${title}
2. ## Executive Summary & Core Frameworks
3. ## Key Financial Principles & Balance Sheet Rules
4. ## Comprehensive Transcript & Structured Lecture Notes
Include all financial rules (Rule of Two, Good/Bad borrowing, cost of capital, working capital cycle, inventory turns, cash flow vs profit, debtor management, leverage, solvency) and real business case studies explained in the session.`;
  }

  // Default: SOIC or general equity research
  return `You are transcribing an equity research and investing masterclass lecture from SOIC (School of Intrinsic Compounding) titled "${title}".
Please produce a comprehensive, structured output in Markdown with:
1. # ${title}
2. ## Executive Summary & Core Frameworks
3. ## Key Investment Principles & Case Studies
4. ## Comprehensive Transcript & Structured Lecture Notes
Include all specific company examples, financial metrics (ROCE, ROE, margins, multiples, growth rates), business models, moat definitions, and mental models taught in the session.`;
}

async function transcribeAudio(fileObj, title, channel = '') {
  console.log(`Generating transcript for ${title} using ${MODEL}...`);
  const prompt = buildTranscriptionPrompt(title, channel);

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    attempts++;
    const genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { file_data: { file_uri: fileObj.uri, mime_type: fileObj.mimeType } },
                { text: prompt },
              ],
            },
          ],
        }),
      }
    );

    if (genRes.status === 429) {
      const errJson = await genRes.json().catch(() => ({}));
      const retryDetails = errJson.error?.details?.find((d) => d.retryDelay);
      let waitSec = 25;
      if (retryDetails && retryDetails.retryDelay) {
        const parsedSec = parseInt(retryDetails.retryDelay, 10);
        if (!isNaN(parsedSec)) waitSec = parsedSec + 5;
      }
      console.log(
        `Rate limit (429) hit, waiting ${waitSec}s before retry ${attempts}/${maxAttempts}...`
      );
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }

    if (!genRes.ok) {
      const errText = await genRes.text();
      throw new Error(`Generation failed (HTTP ${genRes.status}): ${errText}`);
    }

    const genJson = await genRes.json();
    const text = genJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error(`No text returned in generation: ${JSON.stringify(genJson)}`);
    }
    return text;
  }
  throw new Error(
    `Failed to generate transcript after ${maxAttempts} attempts due to rate limits.`
  );
}

module.exports = {
  uploadFileToGemini,
  transcribeAudio,
  buildTranscriptionPrompt,
};
