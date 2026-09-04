#!/usr/bin/env node

/**
 * Cross-Platform Development Rules Synchronization and Verification Script
 *
 * Ensures that development rules across Claude (CLAUDE.md), Cursor (.cursorrules,
 * .cursor/rules/*.mdc), and Antigravity (.gemini/rules/, .agents/rules/, ~/.gemini/config/rules/)
 * are 100% aligned with the canonical AGENTS.md, and verifies that permanent rules
 * in data/tasks.json match AGENTS.md §12.
 *
 * Usage:
 *   node scripts/sync-rules.js --check   (Validate sync, exit 1 if drifted)
 *   node scripts/sync-rules.js --fix     (Auto-sync rules across platforms)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT_DIR = path.resolve(__dirname, '..');
const AGENTS_PATH = path.join(ROOT_DIR, 'AGENTS.md');
const TASKS_PATH = path.join(ROOT_DIR, 'data', 'tasks.json');
const CLAUDE_PATH = path.join(ROOT_DIR, 'CLAUDE.md');
const CURSORRULES_PATH = path.join(ROOT_DIR, '.cursorrules');
const CURSOR_GENERAL_PATH = path.join(ROOT_DIR, '.cursor', 'rules', 'general.mdc');
const GEMINI_RULES_DIR = path.join(ROOT_DIR, '.gemini', 'rules');
const AGENTS_RULES_DIR = path.join(ROOT_DIR, '.agents', 'rules');
const GLOBAL_GEMINI_RULES_DIR = path.join(os.homedir(), '.gemini', 'config', 'rules');

const isCheckOnly = process.argv.includes('--check');
const isFix = process.argv.includes('--fix') || !isCheckOnly;

function log(msg) {
  console.log(msg);
}

function copyFileIfChanged(src, dest) {
  if (!fs.existsSync(src)) return false;
  const content = fs.readFileSync(src, 'utf8');
  let existing = null;
  if (fs.existsSync(dest)) {
    existing = fs.readFileSync(dest, 'utf8');
  }
  if (content !== existing) {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(dest, content, 'utf8');
    return true;
  }
  return false;
}

function verifyFileExists(filePath, name, errors) {
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing required file: ${name} (${path.relative(ROOT_DIR, filePath)})`);
    return false;
  }
  return true;
}

function checkContentIncludes(filePath, searchString, errorMsg, errors) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(searchString)) {
    errors.push(errorMsg);
    return false;
  }
  return true;
}

function runVerification() {
  const errors = [];

  // 1. Verify AGENTS.md
  if (verifyFileExists(AGENTS_PATH, 'Canonical AGENTS.md', errors)) {
    checkContentIncludes(
      AGENTS_PATH,
      '## 12. Permanent Development Rules & Multi-Platform Parity',
      'AGENTS.md is missing Section 12 for Permanent Development Rules.',
      errors
    );
    checkContentIncludes(
      AGENTS_PATH,
      'yarn rules:check',
      'AGENTS.md is missing reference to yarn rules:check.',
      errors
    );
  }

  // 2. Verify data/tasks.json has rules array
  if (verifyFileExists(TASKS_PATH, 'data/tasks.json', errors)) {
    try {
      const data = JSON.parse(fs.readFileSync(TASKS_PATH, 'utf8'));
      if (!Array.isArray(data.rules) || data.rules.length === 0) {
        errors.push('data/tasks.json does not contain a populated "rules" array.');
      } else {
        const requiredRuleIds = [
          'rule-clean-code',
          'rule-facade-pattern',
          'rule-data-layer',
          'rule-mandatory-quality',
          'rule-api-integrations',
          'rule-safety-rails',
          'rule-platform-sync',
        ];
        const existingIds = new Set(data.rules.map((r) => r.id));
        for (const reqId of requiredRuleIds) {
          if (!existingIds.has(reqId)) {
            errors.push(`data/tasks.json is missing required permanent rule: "${reqId}".`);
          }
        }
      }
    } catch (e) {
      errors.push(`Failed to parse data/tasks.json: ${e.message}`);
    }
  }

  // 3. Verify Claude (CLAUDE.md)
  if (verifyFileExists(CLAUDE_PATH, 'CLAUDE.md', errors)) {
    checkContentIncludes(
      CLAUDE_PATH,
      '@AGENTS.md',
      'CLAUDE.md does not import @AGENTS.md.',
      errors
    );
    checkContentIncludes(
      CLAUDE_PATH,
      'Permanent Development Rules',
      'CLAUDE.md is missing reference to Permanent Development Rules.',
      errors
    );
  }

  // 4. Verify Cursor (.cursorrules & .cursor/rules/general.mdc)
  if (verifyFileExists(CURSORRULES_PATH, '.cursorrules', errors)) {
    checkContentIncludes(
      CURSORRULES_PATH,
      'AGENTS.md',
      '.cursorrules does not point to AGENTS.md.',
      errors
    );
  }
  if (verifyFileExists(CURSOR_GENERAL_PATH, '.cursor/rules/general.mdc', errors)) {
    checkContentIncludes(
      CURSOR_GENERAL_PATH,
      'AGENTS.md',
      '.cursor/rules/general.mdc does not point to AGENTS.md.',
      errors
    );
    checkContentIncludes(
      CURSOR_GENERAL_PATH,
      'Permanent Development Rules',
      '.cursor/rules/general.mdc is missing Permanent Development Rules section.',
      errors
    );
  }

  // 5. Verify Antigravity (.gemini/rules/ and .agents/rules/)
  const geminiConventions = path.join(GEMINI_RULES_DIR, '00-repo-conventions.md');
  const geminiTasksSync = path.join(GEMINI_RULES_DIR, 'scheduled-tasks-sync.md');
  const geminiRulesSync = path.join(GEMINI_RULES_DIR, 'rules-sync.md');

  verifyFileExists(geminiConventions, '.gemini/rules/00-repo-conventions.md', errors);
  verifyFileExists(geminiTasksSync, '.gemini/rules/scheduled-tasks-sync.md', errors);
  verifyFileExists(geminiRulesSync, '.gemini/rules/rules-sync.md', errors);

  const agentsConventions = path.join(AGENTS_RULES_DIR, '00-repo-conventions.md');
  const agentsTasksSync = path.join(AGENTS_RULES_DIR, 'scheduled-tasks-sync.md');
  const agentsRulesSync = path.join(AGENTS_RULES_DIR, 'rules-sync.md');

  verifyFileExists(agentsConventions, '.agents/rules/00-repo-conventions.md', errors);
  verifyFileExists(agentsTasksSync, '.agents/rules/scheduled-tasks-sync.md', errors);
  verifyFileExists(agentsRulesSync, '.agents/rules/rules-sync.md', errors);

  return errors;
}

function syncFiles() {
  let changed = 0;

  // Mirror .gemini/rules/ -> .agents/rules/
  if (fs.existsSync(GEMINI_RULES_DIR)) {
    if (!fs.existsSync(AGENTS_RULES_DIR)) {
      fs.mkdirSync(AGENTS_RULES_DIR, { recursive: true });
    }
    const files = fs.readdirSync(GEMINI_RULES_DIR);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const src = path.join(GEMINI_RULES_DIR, file);
        const dest = path.join(AGENTS_RULES_DIR, file);
        if (copyFileIfChanged(src, dest)) {
          log(`  🔄 Synchronized to .agents/rules/${file}`);
          changed++;
        }

        // Also sync outward to user's global config if exists
        if (fs.existsSync(path.dirname(GLOBAL_GEMINI_RULES_DIR))) {
          const globalDest = path.join(GLOBAL_GEMINI_RULES_DIR, file);
          if (copyFileIfChanged(src, globalDest)) {
            log(`  🔄 Synchronized to ~/.gemini/config/rules/${file}`);
            changed++;
          }
        }
      }
    }
  }

  return changed;
}

function main() {
  log('🛡️  Checking Multi-Platform Development Rules Sync...');

  if (isFix) {
    const syncedCount = syncFiles();
    if (syncedCount > 0) {
      log(`✅ Updated ${syncedCount} rule file(s) across platform mirrors.`);
    }
  }

  const errors = runVerification();

  if (errors.length > 0) {
    console.error('\n❌ Rules synchronization check FAILED with the following errors:');
    errors.forEach((err, i) => console.error(`   ${i + 1}. ${err}`));
    console.error('\n💡 To resolve: run `yarn rules:sync` or update AGENTS.md and run again.\n');
    process.exit(1);
  }

  log('✅ All development rules and platform mirrors are 100% synchronized!\n');
}

main();
