#!/usr/bin/env node
'use strict';

/**
 * @fileoverview CLI entry point for grill-skill.
 * Executes static inspection and domain knowledge retrieval for a target skill.
 *
 * Conforms to Monorepo Principle 17 and Workspace Facade Pattern.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadEnv, argValue, hasFlag } = require('../../packages/jobs-runtime/lib/env');
const db = require('../../packages/jobs-runtime/lib/db');

const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * Computes a deterministic SHA-256 hash across SKILL.md, references, and companion scripts.
 * @param {string} [skillDir]
 * @param {string} [skillMdPath]
 * @returns {string} SHA-256 hex digest
 */
function computeSkillContentHash(skillDir, skillMdPath) {
  const hash = crypto.createHash('sha256');
  if (skillMdPath && fs.existsSync(skillMdPath)) {
    hash.update(fs.readFileSync(skillMdPath));
  }
  if (skillDir && fs.existsSync(skillDir)) {
    const refsDir = path.join(skillDir, 'references');
    if (fs.existsSync(refsDir) && fs.statSync(refsDir).isDirectory()) {
      const refFiles = fs.readdirSync(refsDir).sort();
      for (const f of refFiles) {
        const fullPath = path.join(refsDir, f);
        if (fs.statSync(fullPath).isFile()) {
          hash.update(f);
          hash.update(fs.readFileSync(fullPath));
        }
      }
    }
  }
  return hash.digest('hex');
}

function main() {
  loadEnv(argValue('--env-file', process.argv));

  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.length === 0) {
    console.log(`Usage: grill-skill <target-skill-name> [options]
Options:
  --target <name>   Target skill name to grill
  --json            Output results as JSON
  --with-kb         Retrieve domain context from ask-soic / ask-expert / DB (default true)
  --help            Show this help message`);
    process.exit(0);
  }

  const targetSkill = argValue('--target', argv) || argv.find((a) => !a.startsWith('--'));
  if (!targetSkill) {
    console.error(JSON.stringify({ ok: false, error: 'Missing target skill name' }));
    process.exit(1);
  }

  const asJson = hasFlag('--json', argv);
  const withKb = !hasFlag('--no-kb', argv);

  // 1. Run static inspection
  const inspectScript = path.join(REPO_ROOT, 'scripts/inspect-skill.js');
  const inspectResult = spawnSync('node', [inspectScript, targetSkill, '--json'], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });

  let inspectionData = null;
  if (inspectResult.status === 0 && inspectResult.stdout) {
    try {
      inspectionData = JSON.parse(inspectResult.stdout);
    } catch {
      inspectionData = { raw: inspectResult.stdout };
    }
  } else {
    console.error(
      JSON.stringify({ ok: false, error: inspectResult.stderr || 'Inspection failed' })
    );
    process.exit(1);
  }

  // 2. Compute deterministic content hash of skill artifacts
  const skillMdPath = inspectionData.skillMdPath || null;
  const skillDir = skillMdPath ? path.dirname(skillMdPath) : null;
  const contentHash = computeSkillContentHash(skillDir, skillMdPath);

  // 3. Query DB for prior skill-review report (Living Thinking Ledger)
  let priorReview = null;
  try {
    const previousReviews = db.find('reports', { type: 'skill-review', targetSkill });
    if (previousReviews && previousReviews.length > 0) {
      priorReview = previousReviews[previousReviews.length - 1];
    }
  } catch {
    // Non-fatal if DB read fails
  }

  const hashMatched = Boolean(
    priorReview && priorReview.contentHash && priorReview.contentHash === contentHash
  );

  // 4. Knowledge Base Retrieval (ask-soic + ask-expert + DB reports)
  let kbResults = { soic: [], expert: [], dbReports: [] };
  if (withKb) {
    try {
      // Query ask-soic
      const soicScript = path.join(REPO_ROOT, 'skills/tooling/ask-soic/scripts/search_soic.py');
      const soicQuery = `${targetSkill.replace(/-/g, ' ')} framework quality red flags`;
      const soicProc = spawnSync(
        'python3',
        [soicScript, '--query', soicQuery, '--data-root', 'data', '--top', '3'],
        {
          encoding: 'utf8',
          cwd: REPO_ROOT,
        }
      );

      if (soicProc.status === 0 && soicProc.stdout) {
        try {
          const parsed = JSON.parse(soicProc.stdout);
          kbResults.soic = parsed.results || [];
        } catch {}
      }

      // Query DB for historical reports matching target skill
      const matchingReports = db.find('reports', { type: targetSkill });
      if (matchingReports && matchingReports.length > 0) {
        kbResults.dbReports = matchingReports.slice(-3).map((r) => ({
          id: r.id,
          companyId: r.companyId,
          date: r.date,
          creationTime: r.creationTime,
        }));
      }
    } catch (err) {
      // Non-fatal KB retrieval error
      kbResults.error = err.message;
    }
  }

  const output = {
    ok: true,
    targetSkill,
    contentHash,
    priorReview: priorReview
      ? {
          id: priorReview.id,
          creationTime: priorReview.creationTime,
          contentHash: priorReview.contentHash,
          status: priorReview.status,
          settledDecisions: priorReview.settledDecisions || null,
          thinkingRationale: priorReview.thinkingRationale || null,
          invariantsAudit: priorReview.invariantsAudit || null,
        }
      : null,
    hashMatched,
    inspection: inspectionData,
    domainKnowledge: kbResults,
  };

  if (asJson) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    // Print human-readable summary
    console.log(`\n======================================================`);
    console.log(`🔍 GRILL PREPARATION: /${targetSkill}`);
    console.log(`======================================================`);
    console.log(`• Content Hash: ${contentHash.slice(0, 16)}...`);
    if (priorReview) {
      console.log(
        `• Prior Review: Found (${priorReview.creationTime || 'Previous run'}, Status: ${priorReview.status || 'SETTLED'})`
      );
      console.log(
        `• Prior Hash Match: ${hashMatched ? '✅ MATCH (Deterministic code unchanged)' : '🔄 CHANGED (Diff detected)'}`
      );
    } else {
      console.log(`• Prior Review: None (First-time review)`);
    }
    const lines = inspectionData.progressiveDisclosure
      ? inspectionData.progressiveDisclosure.lineCount
      : inspectionData.size
        ? inspectionData.size.totalLines
        : 'N/A';
    console.log(`• Lines: ${lines}`);
    console.log(
      `• Script Candidates Detected: ${inspectionData.scriptCandidatesFound ? inspectionData.scriptCandidatesFound.length : 0}`
    );
    console.log(
      `• Domain Knowledge Hits: ${kbResults.soic.length} SOIC teachings, ${kbResults.dbReports.length} DB reports`
    );
    console.log(`\nReady for Round 1: Pre-Human Exhaustive Review (Holistic Baseline Probe).\n`);
  }
}

if (require.main === module) {
  main();
}

module.exports = { computeSkillContentHash };
