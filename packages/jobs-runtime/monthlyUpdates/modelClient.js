'use strict';
/**
 * RETIRED 2026-09-04 — intentionally left as a tombstone.
 *
 * This module used to call Gemini/Anthropic HTTP APIs to parse filings. That
 * was the wrong architecture for this repo: reading a sales table and deciding
 * which row is the headline metric is a JUDGMENT step, and judgment belongs to
 * the agent executing the skill prompt — not to a script holding an API key.
 *
 * The parse pass now works as a handoff: `buildParseBatches()` in
 * parseFiling.js emits pre-sliced, token-lean batches for the agent to read,
 * and `ingestParsedBatch()` validates and stores what the agent returns.
 *
 * Do not reintroduce a model-API call here.
 */
module.exports = {};
