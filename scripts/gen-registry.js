#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'skills/registry.manifest.json');
const REGISTRY_PATH = path.join(REPO_ROOT, 'skills/registry.json');
const INVOKER_SKILL_MD_PATH = path.join(REPO_ROOT, 'skills/github-skill-invoker/SKILL.md');

function generateRegistry() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`Manifest file not found at: ${MANIFEST_PATH}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  
  // Clone to avoid mutation
  const registry = JSON.parse(JSON.stringify(manifest));
  
  // Convert manifest structure back to standard registry for clients
  // (Mostly they are identical, but we ensure output structure is exactly right)
  
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8');
  console.log(`Generated ${REGISTRY_PATH}`);

  // In Phase 2, we will regenerate the invoker substitution table here.
  // We can write a stub for now.
  generateInvokerTable(manifest);
}

function generateInvokerTable(manifest) {
  if (!fs.existsSync(INVOKER_SKILL_MD_PATH)) return;

  const mdContent = fs.readFileSync(INVOKER_SKILL_MD_PATH, 'utf-8');
  
  let newTable = '| Entrypoint / Mode | Cached / Execution path |\n|---|---|\n';
  
  for (const [skillName, skill] of Object.entries(manifest.skills)) {
    if (skill.mode === 'bundle') {
      newTable += `| \`dist-skills/${skillName}.cjs\` (bundle) | \`/tmp/${skillName}.cjs\` |\n`;
    } else if (skill.mode === 'clone') {
      newTable += `| \`${skill.entry}\` (clone) | \`/tmp/sm-clone/stock-api/bin/${skillName}.js\` |\n`;
    }
  }
  
  const startMarker = '## Script path substitution table';
  const endMarker = '## Branch override';
  
  const startIndex = mdContent.indexOf(startMarker);
  const endIndex = mdContent.indexOf(endMarker);
  
  if (startIndex !== -1 && endIndex !== -1) {
    const newMd = mdContent.substring(0, startIndex + startMarker.length) + 
      '\n\nAll scripts are resolved according to their mode (bundle or clone).\n\n' + 
      newTable + '\n\n' +
      mdContent.substring(endIndex);
    fs.writeFileSync(INVOKER_SKILL_MD_PATH, newMd, 'utf-8');
    console.log("Updated github-skill-invoker/SKILL.md");
  }
  if (process.argv.includes('--check')) {
    const currentRegistry = fs.existsSync(REGISTRY_PATH) ? fs.readFileSync(REGISTRY_PATH, 'utf-8') : '';
    if (currentRegistry !== JSON.stringify(manifest, null, 2)) {
       console.error("Registry is out of date. Run gen-registry.js to update.");
       process.exit(1);
    }
  }
}

generateRegistry();
