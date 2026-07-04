const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, '../skills/registry.manifest.json');
const BIN_DIR = path.join(__dirname, '../stock-api/bin');

if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

for (const [skillName, skillData] of Object.entries(manifest.skills)) {
  if (skillData.entry) {
    const entryPath = path.join(__dirname, '..', skillData.entry);
    
    let requires = '';
    if (skillData.modules) {
      requires = skillData.modules.map(mod => {
        // e.g., "stock-api/src/fetchers/documentsFetcher.js"
        // we are in "stock-api/bin"
        const relPath = '../' + mod.replace('stock-api/', '');
        return `const mod_${path.basename(mod, '.js')} = require('${relPath}');`;
      }).join('\n');
    }

    const content = `#!/usr/bin/env node
'use strict';

${requires}

function main() {
  const argv = process.argv.slice(2);
  
  if (argv.includes('--help')) {
    console.log(\`Usage: ${skillName} [options]\`);
    console.log(\`Options:
  --help     Show this help message\`);
    process.exit(0);
  }

  // TODO: implement actual parsing and logic here
  
  const result = {
    ok: true,
    outputs: [],
    warnings: []
  };

  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main();
}
`;

    fs.writeFileSync(entryPath, content, { mode: 0o755 });
    console.log(`Created ${skillData.entry}`);
  }
}
