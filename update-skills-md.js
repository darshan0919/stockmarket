const fs = require('fs');
const glob = require('glob');

const files = glob.sync('skills/*/SKILL.md');

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Replace references to packages/stock-api/python/generators/generate_..._pdf.py
  // with packages/stock-api/src/generators/generate...Pdf.js
  content = content.replace(/packages\/stock-api\/python\/generators\/generate_([a-z_]+)\.py/g, (match, p1) => {
    const camel = p1.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    return `packages/stock-api/src/generators/generate${camel.charAt(0).toUpperCase() + camel.slice(1)}.js`;
  });

  // Specifically, we will replace the python code blocks with node equivalents.
  content = content.replace(/```python[\s\S]*?import sys[\s\S]*?sys\.path\.insert[\s\S]*?(data = \{[\s\S]*?\})[\s\S]*?```/, 
`Write the following JSON to a temporary file (e.g. \`data.json\`):

\`\`\`json
$1
\`\`\`

Then execute the two-step HTML-to-PDF pipeline:

\`\`\`bash
# 1. Generate HTML (Bundle Mode)
bash ./skills/_shared/resolve.sh $(basename $(dirname ${file})) --input data.json --output report.html

# 2. Render PDF (Clone Mode)
bash ./skills/_shared/resolve.sh render-pdf --html report.html --pdf "<Company>_Output.pdf"
\`\`\``);

  fs.writeFileSync(file, content, 'utf8');
}
console.log('Updated all SKILL.md files');
