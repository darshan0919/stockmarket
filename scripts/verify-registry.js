#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const REGISTRY_PATH = path.join(REPO_ROOT, 'skills/registry.json');

function verifyRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    console.error(`Registry file not found at: ${REGISTRY_PATH}`);
    process.exit(1);
  }

  const registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  let missingPaths = [];
  
  // Also get the list of files in the current git working tree
  let gitFiles = new Set();
  try {
    const gitOutput = execSync('git ls-files --cached --others --exclude-standard', { cwd: REPO_ROOT, encoding: 'utf-8' });
    gitFiles = new Set(gitOutput.split('\n').filter(Boolean));
  } catch (error) {
    console.warn("Warning: Could not read git tree. Skipping git validation.");
  }

  function checkPath(relPath) {
    const absPath = path.join(REPO_ROOT, relPath);
    const existsOnDisk = fs.existsSync(absPath);
    const existsInGit = gitFiles.size > 0 ? gitFiles.has(relPath) : true;
    
    if (!existsOnDisk || !existsInGit) {
      missingPaths.push(relPath);
    }
  }

  // Check shared paths at root
  if (registry.shared) {
    registry.shared.forEach(checkPath);
  }

  // Check each skill
  for (const [skillName, skillData] of Object.entries(registry.skills || {})) {
    if (skillData.skill_md) checkPath(skillData.skill_md);
    if (skillData.scripts) skillData.scripts.forEach(checkPath);
    if (skillData.references) skillData.references.forEach(checkPath);
    if (skillData.shared) skillData.shared.forEach(checkPath);
    if (skillData.assets) skillData.assets.forEach(checkPath);
    if (skillData.prompts) skillData.prompts.forEach(checkPath);
    if (skillData.templates) skillData.templates.forEach(checkPath);
    if (skillData.modules) skillData.modules.forEach(checkPath); // For Phase 1
    if (skillData.entry) checkPath(skillData.entry);             // For Phase 1
  }

  // Deduplicate
  missingPaths = [...new Set(missingPaths)];

  if (missingPaths.length > 0) {
    console.error(`Verification Failed. Found ${missingPaths.length} missing paths:`);
    missingPaths.forEach(p => console.error(` - ${p}`));
    
    // Check if python migration constraint is met (only fail in future, right now just warn)
    const pythonPaths = missingPaths.filter(p => p.includes('python/'));
    if (pythonPaths.length > 0) {
      console.error(`\nFound ${pythonPaths.length} missing Python paths which likely need repointing.`);
    }

    if (process.argv.includes('--check')) {
      process.exit(1);
    }
  } else {
    console.log("Registry verification passed! All paths exist.");
  }
}

verifyRegistry();
