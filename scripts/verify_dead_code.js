const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCRATCH_DIR =
  '/Users/darshan.patel/.gemini/antigravity/brain/b3891b9a-1382-4ca7-9979-0e969ae76f94/scratch';

const knipFiles = ['screener-api-knip.txt', 'screener-web-knip.txt', 'jobs-knip.txt'];

function searchPattern(pattern) {
  try {
    // using git grep which is extremely fast and ignores node_modules natively
    // We run it inside PROJECT_ROOT
    const escapedPattern = pattern.replace(/"/g, '\\"');
    const cmd = `git grep -l "${escapedPattern}"`;
    const output = execSync(cmd, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((f) => path.join(PROJECT_ROOT, f));
  } catch (e) {
    if (e.stdout) {
      return e.stdout
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((f) => path.join(PROJECT_ROOT, f));
    }
    return [];
  }
}

function parseKnipOutput(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const results = {
    files: [],
    dependencies: [],
    exports: [],
  };

  let currentSection = null;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    if (line.startsWith('Unused files')) {
      currentSection = 'files';
      continue;
    } else if (
      line.startsWith('Unused dependencies') ||
      line.startsWith('Unused devDependencies')
    ) {
      currentSection = 'dependencies';
      continue;
    } else if (line.startsWith('Unused exports')) {
      currentSection = 'exports';
      continue;
    } else if (line.startsWith('Unlisted') || line.startsWith('Unresolved')) {
      currentSection = 'ignore';
      continue;
    }

    if (currentSection === 'files') {
      const match = line.match(/^([a-zA-Z0-9_./-]+)/);
      if (match) results.files.push(match[1]);
    } else if (currentSection === 'dependencies') {
      const match = line.match(/^([a-zA-Z0-9_./-@]+)\s+package\.json/);
      if (match) results.dependencies.push(match[1]);
    } else if (currentSection === 'exports') {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const exportName = parts[0];
        if (exportName !== 'default' && exportName.match(/^[a-zA-Z0-9_]+$/)) {
          results.exports.push(exportName);
        }
      }
    }
  }

  return results;
}

// Output DTO Standard envelope: this skill is about dead CODE, not companies, so
// `companyId` is a semantic stretch here — we reuse it to carry the unique identifier
// of the flagged record (file path / dependency name / export name), per
// skills/tooling/output-dto-standard/SKILL.md's field-naming convention for non-company skills.
function withEnvelope(companyId, timestamp) {
  return {
    companyId,
    creationTime: timestamp,
    modifiedTime: timestamp,
    creator: 'dead-code-scanner',
  };
}

function runVerification() {
  const now = new Date().toISOString();
  const verified = {
    unusedFiles: [],
    unusedDependencies: [],
    unusedExports: [],
  };

  const allCandidates = {
    files: new Set(),
    dependencies: new Set(),
    exports: new Set(),
  };

  for (const file of knipFiles) {
    if (fs.existsSync(path.join(SCRATCH_DIR, file))) {
      const parsed = parseKnipOutput(path.join(SCRATCH_DIR, file));
      parsed.files.forEach((f) => allCandidates.files.add(f));
      parsed.dependencies.forEach((d) => allCandidates.dependencies.add(d));
      parsed.exports.forEach((e) => allCandidates.exports.add(e));
    }
  }

  console.log(`Verifying ${allCandidates.files.size} files...`);
  for (const file of allCandidates.files) {
    const baseName = path.basename(file, path.extname(file));
    if (baseName === 'index') continue;
    const hits = searchPattern(baseName);
    const outsideHits = hits.filter((h) => !h.includes(file));
    if (outsideHits.length === 0) {
      verified.unusedFiles.push({ file, ...withEnvelope(file, now) });
    }
  }

  console.log(`Verifying ${allCandidates.dependencies.size} dependencies...`);
  for (const dep of allCandidates.dependencies) {
    const pattern = `['"\`]${dep}['"\`]`;
    const hits = searchPattern(pattern);
    const actualUsage = hits.filter((h) => !h.endsWith('package.json') && !h.endsWith('yarn.lock'));
    if (actualUsage.length === 0) {
      verified.unusedDependencies.push({ dependency: dep, ...withEnvelope(dep, now) });
    }
  }

  console.log(`Verifying ${allCandidates.exports.size} exports...`);
  for (const exp of allCandidates.exports) {
    const hits = searchPattern(exp);
    // If we only find 1 file, and it's the file where it's defined, it's unused.
    if (hits.length <= 1) {
      verified.unusedExports.push({ export: exp, ...withEnvelope(exp, now) });
    }
  }

  fs.writeFileSync(
    path.join(SCRATCH_DIR, 'verified_dead_code.json'),
    JSON.stringify(verified, null, 2)
  );
  console.log('Verification complete. Results saved to verified_dead_code.json');
}

runVerification();
