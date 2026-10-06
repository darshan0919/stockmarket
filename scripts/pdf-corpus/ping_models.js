#!/usr/bin/env node
'use strict';

/**
 * Pre-flight for bench.js: can this machine reach each model, and does it answer?
 *   node scripts/pdf-corpus/ping_models.js ollama:glm-ocr ollama:qwen2.5:7b ollama:qwen3-vl:8b
 * Prints the endpoint's installed model names, then per model: reachable, latency, reply head, or the exact error.
 */

const { providerFromSpec } = require('../../packages/jobs-runtime/lib/pdfExtract/tier3');

// 1x1 transparent PNG, enough to check that a vision model accepts an image
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

async function main() {
  const specs = process.argv.slice(2);
  if (!specs.length) throw new Error('usage: ping_models.js <ollama:tag|openai:model@url> ...');
  const seen = new Set();
  for (const spec of specs) {
    const p = providerFromSpec(spec.replace(/[/#].*$/, ''));
    if (p.baseUrl && !seen.has(p.baseUrl)) {
      seen.add(p.baseUrl);
      try {
        const res = await fetch(`${p.baseUrl.replace(/\/v1$/, '')}/api/tags`);
        const j = await res.json();
        console.log(
          `${p.baseUrl} installed: ${(j.models || []).map((m) => m.name).join(', ') || '(none listed)'}`
        );
      } catch (e) {
        console.log(
          `${p.baseUrl} NOT REACHABLE: ${e.cause ? e.cause.code || e.cause.message : e.message}`
        );
      }
    }
    const t0 = Date.now();
    try {
      const r = await p.chat({
        system: null,
        user: 'Reply with the single word: ready',
        images: /vl|ocr/.test(spec) ? [PNG] : [],
        maxTokens: 16,
      });
      console.log(
        `OK    ${spec}  ${Date.now() - t0} ms  reply=${JSON.stringify(String(r.content).slice(0, 40))}`
      );
    } catch (e) {
      console.log(`FAIL  ${spec}  ${Date.now() - t0} ms  ${String(e.message).slice(0, 200)}`);
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
