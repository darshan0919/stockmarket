#!/usr/bin/env node
/**
 * find_stray_artifacts.js
 *
 * Detects downloads / generated artifacts that have landed somewhere in the
 * repo other than their designated `data/` location (see docs/DATA_RULES.md),
 * where they risk being `git add -A`'d and committed by accident.
 *
 * This is a companion script for skills/development/dead-code-scanner —
 * "dead code" and "stray artifacts" are two different smells caught by the
 * same cleanup pass, so this runs alongside knip/verify_dead_code.js rather
 * than as a separate job.
 *
 * Classification follows the DATA_RULES §1 decision tree:
 *   - raw/regenerable downloads (audio, video, zips, scraped PDFs) -> "runs"
 *     (data/runs/, transient) or "delete" (not worth keeping at all)
 *   - rendered final artifacts (PDF/HTML/MD/DOCX/PPTX/XLSX reports)  -> "assets"
 *     (data/assets/<skill>/)
 *   - heavy re-fetchable derivables (extraction text, CSVs)          -> "cache"
 *     (data/cache/)
 *   - anything that's actually meant to live in git (source, docs,
 *     templates under skills/<name>/assets/) is left alone
 *
 * Usage:
 *   node scripts/find_stray_artifacts.js            # scan + print report
 *   node scripts/find_stray_artifacts.js --json      # machine-readable only
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_JSON = path.join(ROOT_DIR, 'data', 'runs', `stray_artifacts_${dateStamp()}.json`);

// Directories we never walk into — build output, deps, vcs, and the one
// place these files are SUPPOSED to live (data/ is gitignored wholesale).
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  'data',
  '.yarn',
  '.cache',
]);

// Extensions that are almost never legitimate source/config/docs in this repo
// and are the usual signature of a skill run dumping its output in the wrong
// place. Extend this list as new skill output formats appear.
const ARTIFACT_EXT = new Set([
  '.pdf',
  '.docx',
  '.pptx',
  '.xlsx',
  '.xls',
  '.mp3',
  '.mp4',
  '.webm',
  '.wav',
  '.m4a',
  '.zip',
  '.tar',
  '.gz',
]);

// Extensions that ARE legitimate as source/docs, but become suspicious when
// the filename matches a known skill-output naming convention (ticker- or
// company-prefixed report names). Kept separate because .md/.html/.json are
// also legitimate repo content (READMEs, registry.json, etc.).
const AMBIGUOUS_EXT = new Set(['.md', '.html', '.json']);

// Filename patterns that strongly indicate a rendered skill report rather
// than repo documentation/config, e.g. "GANDHAR_Q1FY27_FilingsDiff.html",
// "LaserPower_IPO_DRHP_Analysis.md", "RRKABEL_..._ForensicCheck.pdf".
const REPORT_NAME_PATTERN =
  /(_FilingsDiff|_ForensicCheck|_DRHP_Analysis|_PrePEAD|_Roadmap|_concall|_Dashboard|_1pager|_Thesis|_MasterData)/i;

// Repo-root files that are known-good and must never be flagged, even though
// their extension is in AMBIGUOUS_EXT.
const ROOT_ALLOWLIST = new Set([
  'README.md',
  'QUICKSTART.md',
  'PROMPT.md',
  'DEAD_CODE_ACTION_ITEMS.md',
  'package.json',
  'skills-lock.json',
  'yarn.lock',
]);

// Path segments where artifact-looking files are expected on purpose
// (skill templates/fixtures shipped in git) and should be skipped.
const EXPECTED_ARTIFACT_DIRS = [
  /\/skills\/[^/]+\/[^/]+\/assets\//,
  /\/skills\/[^/]+\/[^/]+\/references\//,
  /\/docs\//,
];

function dateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function isExpectedLocation(relPath) {
  return EXPECTED_ARTIFACT_DIRS.some((re) => re.test('/' + relPath));
}

function classify(relPath, ext) {
  const base = path.basename(relPath);
  const isRoot = !relPath.includes(path.sep);

  if (['.mp3', '.mp4', '.webm', '.wav', '.m4a', '.zip', '.tar', '.gz'].includes(ext)) {
    return {
      bucket: 'runs-or-delete',
      reason:
        'raw/regenerable download (audio/video/archive) — should not be persisted at all; if needed transiently, use data/runs/',
      suggestedAction: `mv "${relPath}" data/runs/  # or delete outright — it is re-downloadable`,
    };
  }
  if (['.pdf', '.docx', '.pptx', '.xlsx', '.xls'].includes(ext)) {
    return {
      bucket: 'assets',
      reason:
        'rendered final artifact (report/deck/model) — belongs in data/assets/<skill>/, produced as a template render of a JSON DTO',
      suggestedAction: `mv "${relPath}" data/assets/misc/  # or into the producing skill's data/assets/<skill>/ dir`,
    };
  }
  // ambiguous extensions only reach here if they matched the report-name
  // pattern or are a stray root file not on the allowlist
  if (isRoot && !ROOT_ALLOWLIST.has(base)) {
    return {
      bucket: 'assets',
      reason: 'stray file at repo root matching a known skill-report naming convention',
      suggestedAction: `mv "${relPath}" data/assets/misc/`,
    };
  }
  return {
    bucket: 'assets',
    reason: 'filename matches skill-report naming convention outside data/',
    suggestedAction: `mv "${relPath}" data/assets/misc/`,
  };
}

function walk(dir, acc) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), acc);
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(ROOT_DIR, fullPath);
    if (isExpectedLocation(relPath)) continue;

    const ext = path.extname(entry.name).toLowerCase();
    const isRoot = !relPath.includes(path.sep);

    if (ARTIFACT_EXT.has(ext)) {
      acc.push({ relPath, ext });
    } else if (AMBIGUOUS_EXT.has(ext)) {
      const flagByName = REPORT_NAME_PATTERN.test(entry.name);
      const flagByRootAndUnlisted = isRoot && !ROOT_ALLOWLIST.has(entry.name);
      if (flagByName || flagByRootAndUnlisted) {
        acc.push({ relPath, ext });
      }
    }
  }
  return acc;
}

function isGitTracked(relPath) {
  try {
    execSync(`git ls-files --error-unmatch "${relPath}"`, { cwd: ROOT_DIR, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const jsonOnly = process.argv.includes('--json');
  const found = walk(ROOT_DIR, []);

  const records = found.map(({ relPath, ext }) => {
    const cls = classify(relPath, ext);
    return {
      id: `stray_artifact:${relPath}`,
      companyId: relPath, // non-company skill; field reused as record identifier per output-dto-standard
      file: relPath,
      extension: ext,
      gitTracked: isGitTracked(relPath),
      bucket: cls.bucket,
      reason: cls.reason,
      suggestedAction: cls.suggestedAction,
      creator: 'find_stray_artifacts',
      creationTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
    };
  });

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(records, null, 2));

  if (jsonOnly) {
    process.stdout.write(JSON.stringify(records));
    return;
  }

  if (records.length === 0) {
    console.log('No stray downloads/artifacts found outside data/.');
    return;
  }

  console.log(`Found ${records.length} stray artifact(s) outside data/:\n`);
  for (const r of records) {
    const trackedTag = r.gitTracked ? '[TRACKED — was committed]' : '[untracked]';
    console.log(`- ${r.file} ${trackedTag}`);
    console.log(`  reason: ${r.reason}`);
    console.log(`  fix:    ${r.suggestedAction}`);
    if (r.gitTracked) {
      console.log(`  also:   git rm --cached "${r.file}"`);
    }
    console.log('');
  }
  console.log(`Full report written to ${path.relative(ROOT_DIR, OUT_JSON)}`);
}

main();
