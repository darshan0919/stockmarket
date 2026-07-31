#!/usr/bin/env node
'use strict';

/**
 * extractOrderBook.js — script-first order-book VALUE + UNIT extraction CLI.
 * This is the ONLY entry point a skill should call. It never calls an LLM
 * itself — on failure it prints a small `llmFallbackPrompt` payload designed
 * to be handed to a cheap model (Haiku/Gemini per project convention), and
 * exits non-zero so the calling skill knows to fall back.
 *
 * Usage:
 *   node extractOrderBook.js <TICKER> [--quarter YYYYMM] [--last-n N] [--force-fetch]
 *
 * Flow per quarter requested:
 *   1. fetchConcallNotes.js's store lookup (DB-first, no network if cached)
 *   2. lib/orderBookExtractor.extractOrderBook() — deterministic regex pass
 *   3. On OrderBookNotFoundError/OrderBookAmbiguousError: emit a compact
 *      fallback payload (just the order-book bullet lines, not the whole
 *      report — this is what keeps the fallback prompt token-cheap) and
 *      mark needsLlmFallback: true instead of throwing, so a batch run over
 *      many tickers doesn't die on the first hard case.
 *
 * After a skill resolves a needsLlmFallback case via LLM, call
 *   node extractOrderBook.js --learn-segment "<keyword>"
 * to persist the new segment keyword into lib/orderBookPatterns.js so the
 * regex catches that phrasing next time without the LLM.
 */

const path = require('path');
const fs = require('fs');
const { loadEnv, argValue } = require('../../lib/env');
loadEnv(argValue('--env-file'));
const store = require('../../lib/concallNotesStore');
const {
  extractOrderBook,
  findCandidates,
  OrderBookNotFoundError,
  OrderBookAmbiguousError,
} = require('../../lib/orderBookExtractor');
const { resolveTargets, fetchOne } = require('./fetchConcallNotes');

function learnSegment(keyword) {
  const file = path.join(__dirname, '..', '..', 'lib', 'orderBookPatterns.js');
  const src = fs.readFileSync(file, 'utf8');
  const marker = "  'power t&d', 'international', 'wagon', 'o&m', '(ads)', 'ads)',\n];";
  if (!src.includes(marker)) {
    console.error(
      '[learn-segment] anchor line not found — patterns file has drifted, edit manually.'
    );
    process.exit(1);
  }
  const kw = String(keyword).toLowerCase().trim();
  const addition = `  '${kw.replace(/'/g, "\\'")}',\n];`;
  const updated = src.replace(marker, marker.replace('];', '') + addition);
  fs.writeFileSync(file, updated);
  console.log(
    `[learn-segment] added "${kw}" to SEGMENT_KEYWORDS in ${path.relative(process.cwd(), file)}`
  );
}

/** Build a small, token-cheap payload for an LLM fallback call. */
function buildFallbackPrompt(companyId, date, candidates) {
  const lines = candidates.map((c) => c.rawLine).slice(0, 12);
  return {
    companyId,
    date,
    instructions:
      'Below are every "order book"/"backlog" bullet from this company\'s concall notes. ' +
      'Return ONLY JSON: {"valueCr": <number|null>, "unit": "Cr", "label": "<which bullet you used>", "reasoning": "<max 15 words>"}. ' +
      'Pick the single company-WIDE outstanding order book total (not a JV/segment/product-line/vertical sub-figure, not guidance, not a percentage or ratio). ' +
      'If no such total is stated (only segments/qualitative text), return {"valueCr": null}.',
    bullets: lines,
  };
}

/**
 * Cache-first: an `orderBook` result already stored on the concall-note
 * record (see concallNotesStore.getOrderBook/saveOrderBook) is authoritative
 * and is NEVER recomputed — even a prior LLM-fallback resolution (with
 * `needsLlmFallback: false` set by the caller after resolving it) short-
 * circuits here. Only a companyId+date with no stored result at all reaches
 * the extractor.
 */
async function processQuarter(ticker, doc, { forceRecompute = false } = {}) {
  if (!store.has(ticker, doc.date)) await fetchOne(ticker, doc, { force: false });

  if (!forceRecompute) {
    const cached = store.getOrderBook(ticker, doc.date);
    if (cached) return { ...cached, fromCache: true };
  }

  const bundle = store.get(ticker, doc.date);
  try {
    const result = extractOrderBook(bundle.finalReport, { companyId: ticker, date: doc.date });
    const record = { ...result, needsLlmFallback: false, fromCache: false };
    store.saveOrderBook(ticker, doc.date, record);
    return record;
  } catch (e) {
    if (e instanceof OrderBookNotFoundError || e instanceof OrderBookAmbiguousError) {
      const candidates = findCandidates(bundle.finalReport);

      // Zero candidate bullets means this company never mentioned an order
      // book at all — which is a real ANSWER, not a parsing failure. Order
      // book is an EPC/defence/capital-goods concept; an IT services firm, a
      // lender or a marketplace will never report one. Sending those to an
      // LLM asks it to find a number that does not exist, and because the
      // verdict would never resolve, a daily job would re-queue them forever.
      // Recording it as a terminal fact keeps the fallback queue meaningful.
      if (!candidates.length) {
        const record = {
          companyId: ticker,
          date: doc.date,
          needsLlmFallback: false,
          noOrderBookDisclosed: true,
          fromCache: false,
          reason: 'concall notes contain no order-book/backlog bullet',
        };
        store.saveOrderBook(ticker, doc.date, record);
        return record;
      }

      const record = {
        companyId: ticker,
        date: doc.date,
        needsLlmFallback: true,
        fromCache: false,
        errorType: e.name,
        errorMessage: e.message,
        llmFallbackPrompt: buildFallbackPrompt(ticker, doc.date, candidates),
      };
      // Cache the "needs LLM help" state too — a batch re-run shouldn't burn
      // regex cycles re-discovering the same miss every time. Once a skill
      // resolves it via LLM, it should call recordLlmResolution() (below) to
      // overwrite this with a real value, permanently.
      store.saveOrderBook(ticker, doc.date, record);
      return record;
    }
    throw e;
  }
}

/**
 * A skill calls this after an LLM fallback resolves a needsLlmFallback case,
 * so the resolution is cached exactly like a deterministic hit and never
 * re-asked of the LLM again.
 */
function recordLlmResolution(ticker, date, { valueCr, unit = 'cr', label, reasoning }) {
  const record = {
    companyId: ticker,
    date,
    value: valueCr,
    unit,
    valueCr,
    label,
    sourceLine: null,
    confidence: 'llm-resolved',
    reasoning,
    needsLlmFallback: false,
    fromCache: false,
  };
  store.saveOrderBook(ticker, date, record);
  return record;
}

async function main() {
  const argv = process.argv;
  const learnFlagIdx = argv.indexOf('--learn-segment');
  if (learnFlagIdx !== -1) {
    learnSegment(argv[learnFlagIdx + 1]);
    return;
  }

  const ticker = argv[2];
  if (!ticker || ticker.startsWith('--')) {
    throw new Error(
      'Usage: extractOrderBook.js <TICKER> [--quarter YYYYMM] [--last-n N]  |  --learn-segment "<keyword>"'
    );
  }
  const lastN = argValue('--last-n') ? parseInt(argValue('--last-n'), 10) : 1;
  const quarter = argValue('--quarter');

  const targets = await resolveTargets(ticker, { lastN, quarter });
  if (!targets.length) {
    process.stdout.write(
      JSON.stringify(
        { companyId: ticker, results: [], note: 'no Transcript with hasNotes:true found' },
        null,
        2
      ) + '\n'
    );
    return;
  }

  const forceRecompute = argv.includes('--force-recompute');
  const results = [];
  for (const doc of targets) results.push(await processQuarter(ticker, doc, { forceRecompute }));
  process.stdout.write(JSON.stringify({ companyId: ticker, results }, null, 2) + '\n');
  if (results.some((r) => r.needsLlmFallback)) process.exitCode = 2; // distinct code: "ran fine, but needs LLM help"
}

module.exports = { processQuarter, buildFallbackPrompt, learnSegment, recordLlmResolution };

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
