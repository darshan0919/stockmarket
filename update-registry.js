const fs = require('fs');
const path = 'skills/registry.manifest.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

// Change report generators to bundle mode
const generators = [
  'drhp-ipo-analysis',
  'forensic-accounting',
  'growth-triggers-1pager',
  'market-share-analysis',
  'management-credibility-tracker',
  'sector-research-deepdive',
  'peer-comparison',
  'concall-analysis'
];

for (const g of generators) {
  if (data.skills[g] && data.skills[g].mode === 'clone') {
    data.skills[g].mode = 'bundle';
  }
}

// Add render-pdf
data.skills['render-pdf'] = {
  "skill_md": "skills/render-pdf/SKILL.md",
  "entry": "stock-api/bin/render-pdf.js",
  "mode": "clone",
  "modules": [
    "stock-api/src/utils/pdfRenderer.js"
  ],
  "references": [],
  "shared": [],
  "aliases": [
    "render pdf",
    "html to pdf"
  ]
};

fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
console.log('Updated registry.manifest.json');
