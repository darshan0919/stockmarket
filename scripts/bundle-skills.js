const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const MANIFEST_PATH = path.join(__dirname, '../skills/registry.manifest.json');
const DIST_DIR = path.join(__dirname, '../packages/stock-api/dist-skills');

if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));

async function buildSkills() {
  const promises = [];
  for (const [skillName, skillData] of Object.entries(manifest.skills)) {
    if (skillData.entry && skillData.mode === 'bundle') {
      const entryPath = path.join(__dirname, '..', skillData.entry);
      const outPath = path.join(DIST_DIR, `${skillName}.cjs`);

      console.log(`Bundling ${skillName}...`);
      promises.push(
        esbuild.build({
          entryPoints: [entryPath],
          bundle: true,
          platform: 'node',
          target: 'node18',
          outfile: outPath,
          // externalize common deps if needed, but the prompt says 'inlined'
          // let's externalize puppeteer because it cannot be bundled well 
          // although bundle mode shouldn't have puppeteer.
          external: ['puppeteer']
        }).then(() => {
          console.log(`Successfully bundled ${skillName}`);
        }).catch(err => {
          console.error(`Failed to bundle ${skillName}:`, err);
        })
      );
    }
  }

  await Promise.all(promises);
  console.log('Finished bundling skills.');
}

buildSkills();
