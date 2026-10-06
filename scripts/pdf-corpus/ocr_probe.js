#!/usr/bin/env node
'use strict';

/**
 * Look at what a model really returns for one page, to tune prompts and settings on one example instead of a 30-document run.
 *   node scripts/pdf-corpus/ocr_probe.js <docId> <page> <ollama:model> [--prompt "..."] [--dpi 200] [--text]
 * Options: --prompt, --dpi, --stop <token>, --num-predict N, --cache-bust (unique suffix per call; Ollama 0.34.x cache workaround).
 * Prints elapsed time, token counts, the raw reply head and the normalised text the parser would see. With --text the
 * extraction prompt and the page's text layer are sent instead of the page image (extraction-model mode).
 */

const L = require('./lib');
const { providerFromSpec } = require('../../packages/jobs-runtime/lib/pdfExtract/tier3');
const { modelOcrPage, promptFor } = require('../../packages/jobs-runtime/lib/pdfExtract/ocrmodel');
const { renderPagePng, pageTexts } = require('../../packages/jobs-runtime/lib/pdfExtract/pages');
const { tier1OnText } = require('../../packages/jobs-runtime/lib/pdfExtract/router');

const arg = (n, d) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : d;
};

async function main() {
  const [docId, pageStr, spec] = process.argv.slice(2);
  if (!docId || !pageStr || !spec)
    throw new Error('usage: ocr_probe.js <docId> <page> <ollama:model> [--prompt ..] [--dpi N]');
  const doc = L.readJsonl(L.p('manifest.jsonl')).find((r) => r.docId === docId);
  if (!doc) throw new Error(`unknown docId ${docId}`);
  const file = L.p(doc.file);
  const page = Number(pageStr);
  const provider = providerFromSpec(spec);
  const t0 = Date.now();
  if (process.argv.includes('--text')) {
    const text = pageTexts(file)[page - 1] || '';
    const r = await provider.chat({
      system: promptFor(provider.model).system,
      user: `PAGE TEXT (layout preserved):\n${text.slice(0, 12000)}`,
    });
    console.log(
      `${Date.now() - t0} ms tokens=${JSON.stringify(r.tokens)} thinking=${r.thinking ? r.thinking.length : 0} chars`
    );
    console.log(String(r.content).slice(0, 1500));
    return;
  }
  const extra = {};
  if (arg('--stop', null)) extra.stop = [arg('--stop')];
  if (arg('--num-predict', null)) extra.maxTokens = Number(arg('--num-predict'));
  if (process.argv.includes('--cache-bust')) extra.cacheBust = true;
  const m = await modelOcrPage({
    provider,
    file,
    page,
    prompt: arg('--prompt'),
    dpi: Number(arg('--dpi', 200)),
    extra,
  });
  console.log(
    `${Date.now() - t0} ms tokens=${JSON.stringify(m.tokens)} error=${m.error || 'none'} png=${renderPagePng(file, page, { dpi: Number(arg('--dpi', 200)) }).length} bytes`
  );
  console.log('--- normalised text (first 2500 chars) ---');
  console.log(m.text.slice(0, 2500));
  const got = tier1OnText(m.text);
  console.log('--- parser ---');
  console.log(got ? JSON.stringify(got) : 'parser found no table');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
