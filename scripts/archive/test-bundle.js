const fs = require('fs');
const path = require('path');
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'skills/registry.manifest.json'), 'utf-8')
);
for (const [name, data] of Object.entries(manifest.skills)) {
  console.log(name, data.entry, data.mode);
}
