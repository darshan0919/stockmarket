const fs = require('fs');
const path = require('path');
const { parsePdfWithGemini, hashPrompt } = require('./geminiClient');

// Read the earning call prompt from file
const earningCallPrompt = fs.readFileSync(
  path.join(__dirname, '../prompts/earning_call.txt'),
  'utf-8'
);

const promptHash = hashPrompt(earningCallPrompt);

/**
 * Analyze earnings call transcript PDF using Gemini AI
 * @param {string} attachmentName - BSE attachment filename (e.g. EarningsCall_Q1FY24.pdf)
 * @returns {Object} Parsed analysis object with _cache_metadata
 * @see {@link docs/API_REFERENCE.md#transcript-apis} for Transcript API docs
 * @see {@link docs/backend/README.md} for backend API overview
 */
const geminiResultAnalysis = async (attachmentName) => {
  const fileUri = `https://www.bseindia.com/xml-data/corpfiling/AttachHis/${attachmentName}`;

  return parsePdfWithGemini({
    attachmentUrl: fileUri,
    prompt: earningCallPrompt,
    promptHash,
    timeout: 200000,
    parseJson: true,
  });
};

module.exports = {
  geminiResultAnalysis,
};
