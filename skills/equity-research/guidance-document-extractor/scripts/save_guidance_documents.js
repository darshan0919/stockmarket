#!/usr/bin/env node
'use strict';

/**
 * Persist guidance-document-extractor's per-company output (fetch manifest +
 * cheap-model relevance-filtered excerpts) as a durable DB record, so a
 * later, separate invocation of forward-guidance-extractor can read it
 * without depending on the same /tmp files still existing.
 *
 * Saves ONE record per company, ALWAYS -- including companies where nothing
 * was found at all (found: {Transcript:false, PPT:false, Result:false}).
 * This is deliberate: it lets Stage 3 (forward-guidance-extractor)
 * distinguish "this company was never run through guidance-document-extractor"
 * (no record at all -> prompt the user to run it) from "it WAS run, but no
 * documents/guidance exist for it" (record exists with empty excerpts ->
 * just note a no-visibility exclusion, never re-prompt).
 *
 * Usage:
 *   node save_guidance_documents.js --manifest /tmp/guidance_fetch_manifest.json \
 *     --excerpts-dir /tmp/guidance_excerpts   # optional, one <ticker>_relevant_excerpts.json per company
 *
 * `--manifest` is the JSON array fetch_guidance_documents.js printed to
 * stdout (save it to a file first: `... > manifest.json`).
 */
const fs = require('fs');
const path = require('path');
const db = require('../../../../packages/jobs-runtime/lib/db.js');

/**
 * Best-effort repair for the common ways an LLM-authored relevance-filter
 * JSON file comes out syntactically invalid (confirmed root cause of the
 * 2026-08-09 NSE:REDTAPE incident: a missing opening quote before a
 * `"context"` key, e.g. `context": "..."` instead of `"context": "..."`).
 * No external dependency (jsonrepair) is pulled in here deliberately -- this
 * repo's yarn cache has cross-platform (darwin-built cache artifacts synced
 * into a linux sandbox) EPERM issues that make an ad-hoc `yarn add` unsafe to
 * run unattended (confirmed 2026-08-09) -- these are the handful of concrete
 * failure shapes actually seen from the relevance-filter model, applied as
 * targeted, auditable regex passes rather than a black-box repair library.
 * Returns { ok: true, value } on success (parsed, possibly after repair) or
 * { ok: false, error, attemptedRepair } on failure -- NEVER throws, and NEVER
 * silently returns null so the caller can always tell what happened.
 */
function parseJsonWithRepair(raw) {
  try {
    return { ok: true, value: JSON.parse(raw), repaired: false };
  } catch (originalError) {
    // Pass 1: missing opening quote before a bare `key": ` pattern, e.g.
    //   context": "..."   ->   "context": "..."
    // Only matches keys preceded by whitespace/`{`/`,` and not already quoted.
    let repaired = raw.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(":\s*)/g, '$1"$2$3');
    // Pass 2: trailing commas before a closing } or ] (also common in
    // hand-truncated/streamed LLM JSON).
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
    try {
      const value = JSON.parse(repaired);
      return { ok: true, value, repaired: true };
    } catch (repairError) {
      return {
        ok: false,
        error: originalError.message,
        attemptedRepairError: repairError.message,
      };
    }
  }
}

function parseArgs(argv) {
  const out = { manifest: null, excerptsDir: null, creator: 'guidance-document-extractor' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest') out.manifest = argv[++i];
    else if (a === '--excerpts-dir') out.excerptsDir = argv[++i];
    else if (a === '--creator') out.creator = argv[++i];
  }
  return out;
}

function safeName(ticker) {
  return ticker.replace(/[:\-]/g, '_');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.manifest) {
    console.error(
      'Usage: save_guidance_documents.js --manifest <fetch-output.json> [--excerpts-dir <dir>]'
    );
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8'));
  const today = new Date().toISOString().slice(0, 10);

  // SAFETY CHECK (2026-08-12): Prevent saving incomplete extraction runs
  // If --excerpts-dir is provided but no excerpt files exist, this likely means
  // Step 2 (cheap-model extraction) failed or was skipped. Abort rather than
  // persisting records that will sit stuck with excerptsPending=true forever.
  if (args.excerptsDir && fs.existsSync(args.excerptsDir)) {
    const excerptFiles = fs.readdirSync(args.excerptsDir).filter((f) => f.endsWith('.json'));
    if (excerptFiles.length === 0) {
      console.error('[FATAL] --excerpts-dir was provided but contains NO excerpt files.');
      console.error('This likely means Step 2 (excerpt extraction) did not complete.');
      console.error('Do not persist incomplete records — re-run the extraction and try again.');
      process.exit(1);
    }
  }

  const saved = [];
  const parseFailures = []; // loud-surfacing list (SKILL.md fix, 2026-08-09 REDTAPE incident)
  for (const entry of manifest) {
    let excerpts = null;
    let extractionFailed = null;
    let excerptsRepaired = false;
    if (args.excerptsDir) {
      const p = path.join(args.excerptsDir, `${safeName(entry.ticker)}_relevant_excerpts.json`);
      if (fs.existsSync(p)) {
        const result = parseJsonWithRepair(fs.readFileSync(p, 'utf8'));
        if (result.ok) {
          excerpts = result.value;
          excerptsRepaired = result.repaired;
        } else {
          // Previously: silently `excerpts = null`, which left excerptsPending
          // permanently true with no indication WHY -- a company could sit
          // "stuck" indefinitely with no signal to re-run or investigate.
          // Now: surface it loudly, both on stderr (so the invoking run sees
          // it immediately) and inside the persisted DTO itself, so any later
          // consumer (forward-guidance-extractor's smart-check, a human
          // reviewing the DB) can tell "relevance-filter ran and produced
          // unparseable JSON" apart from "genuinely no guidance found".
          extractionFailed = `Invalid JSON from relevance filter, repair attempt also failed: ${result.error} (repair error: ${result.attemptedRepairError})`;
          console.error(
            `[save_guidance_documents] PARSE FAILURE for ${entry.ticker}: ${extractionFailed}`
          );
          parseFailures.push({
            companyId: entry.companyId || entry.ticker,
            path: p,
            error: extractionFailed,
          });
        }
      }
    }
    const anyFound = Object.values(entry.found || {}).some(Boolean);
    const dto = {
      creator: args.creator,
      type: 'guidance-documents',
      date: today,
      companyId: entry.companyId || entry.ticker,
      quarter: entry.quarter,
      quarterYyyymm: entry.quarterYyyymm,
      found: entry.found,
      textPaths: entry.textPaths,
      retriedPriorQuarter: !!entry.retriedPriorQuarter,
      excerpts: excerpts ? excerpts.excerpts || [] : [],
      // Still true (relevance-filter step hasn't produced usable output yet)
      // both when the file is simply absent AND when it exists but failed to
      // parse even after repair -- extractionFailed is what now tells these
      // two cases apart, instead of both looking identically "pending".
      excerptsPending: args.excerptsDir ? !excerpts : true,
      excerptsRepaired, // true if valid only after the auto-repair pass -- worth a look even though it saved the run
      extractionFailed, // null on success; a human-readable reason string when parsing genuinely failed
      scanRow: entry.scanRow || null,
      // no LLM involvement in THIS record's authorship (fetch is pure script;
      // excerpts, if present, were authored by the cheap-model filter pass
      // and that model should be attributed by whatever writes --excerpts-dir,
      // not invented here) -- explicitly no `modelUsed` on the fetch-only path.
      summary: extractionFailed
        ? `Relevance-filter output for ${entry.quarter} failed to parse: ${extractionFailed}`
        : anyFound
          ? `Fetched: ${Object.entries(entry.found)
              .filter(([, v]) => v)
              .map(([k]) => k)
              .join('+')} for ${entry.quarter}`
          : `No Transcript/PPT/Result found for ${entry.quarter} (attempted, genuinely unavailable)`,
      contextUsed: [],
    };
    const id = db.saveReport(dto);
    saved.push({ companyId: dto.companyId, id, anyFound, extractionFailed: !!extractionFailed });
  }

  if (parseFailures.length > 0) {
    console.error(
      `\n[save_guidance_documents] ${parseFailures.length} compan${parseFailures.length === 1 ? 'y' : 'ies'} had unparseable relevance-filter JSON even after auto-repair -- these are saved with extractionFailed set, NOT silently dropped. Fix the source file and re-run save_guidance_documents.js for just that company, or re-run the relevance-filter step:`
    );
    for (const f of parseFailures) console.error(`  - ${f.companyId}: ${f.path}`);
  }

  console.log(JSON.stringify({ saved: saved.length, records: saved, parseFailures }, null, 2));
}

main();
