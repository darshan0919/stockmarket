const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const registriesDir = path.join(rootDir, 'skills', 'registries');

// Ensure registries folder exists
if (!fs.existsSync(registriesDir)) {
  fs.mkdirSync(registriesDir, { recursive: true });
}

// 1. Fetch Skills from registry.manifest.json
let skills = {};
const manifestPath = path.join(rootDir, 'skills', 'registry.manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  skills = Object.keys(manifest.skills).map(key => {
    const s = manifest.skills[key];
    return {
      name: key,
      description: s.description || '',
      aliases: s.aliases || [],
      entry: s.entry || null,
      modules: s.modules || []
    };
  });
}

// Helper to recursively find JS files
function getJsFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getJsFiles(fullPath));
    } else if (file.endsWith('.js')) {
      results.push(fullPath);
    }
  });
  return results;
}

// Static parsing of classes, methods, and functions
const classes = [];
const apis = [];
const utilities = [];

// Scan stock-api/src
const srcDir = path.join(rootDir, 'stock-api', 'src');
const jsFiles = getJsFiles(srcDir);

jsFiles.forEach(filePath => {
  const relPath = path.relative(rootDir, filePath);
  const content = fs.readFileSync(filePath, 'utf8');

  // Extract Classes
  const classMatches = content.matchAll(/class\s+(\w+)(?:\s+extends\s+\w+)?/g);
  for (const match of classMatches) {
    const className = match[1];
    // Find methods in this class
    const methodMatches = [];
    const lines = content.split('\n');
    lines.forEach(line => {
      const methodMatch = line.match(/^\s*(async\s+)?(\w+)\s*\([^)]*\)\s*\{/);
      if (methodMatch) {
        const name = methodMatch[2];
        if (!['constructor', 'if', 'for', 'while', 'switch', 'catch'].includes(name)) {
          methodMatches.push(name);
        }
      }
    });
    classes.push({
      name: className,
      file: relPath,
      methods: [...new Set(methodMatches)]
    });
  }

  // Extract exported functions/constants as utilities or API exports
  const isUtil = relPath.includes('utils');
  const isClient = relPath.includes('clients') || relPath.includes('http') || relPath.includes('auth');
  
  // Find exports (e.g. module.exports = { ... } or exports.foo = ...)
  const exportMatches = content.matchAll(/(?:exports\.(\w+)|module\.exports\s*=\s*\{([^}]+)\})/g);
  const exportedSymbols = [];
  for (const match of exportMatches) {
    if (match[1]) {
      exportedSymbols.push(match[1]);
    } else if (match[2]) {
      const symbols = match[2].split(',').map(s => s.trim().split(':')[0].trim()).filter(s => s && !s.startsWith('//') && !s.startsWith('/*'));
      exportedSymbols.push(...symbols);
    }
  }

  if (exportedSymbols.length > 0) {
    const uniqueSymbols = [...new Set(exportedSymbols)].filter(s => !s.match(/^[A-Z]/)); // skip class/capitalized names handled above
    if (uniqueSymbols.length > 0) {
      const category = isUtil ? utilities : (isClient ? apis : utilities);
      uniqueSymbols.forEach(symbol => {
        // Only push if not already present
        if (!category.some(item => item.name === symbol)) {
          category.push({
            name: symbol,
            file: relPath,
            description: `Exported from ${path.basename(filePath)}`
          });
        }
      });
    }
  }
});

// Create comprehensive dependencies JSON
const registryData = {
  skills,
  classes,
  apis,
  utilities
};

fs.writeFileSync(
  path.join(registriesDir, 'workflow-dependencies.json'),
  JSON.stringify(registryData, null, 2),
  'utf8'
);

// Generate Markdown DEPENDENCIES.md
let markdown = `# Workflow Dependencies Registry

This registry lists all available **Skills**, **Classes**, **APIs/Clients**, and **Utility Functions** within the stockmarket monorepo. 
Use this document to check if a specific functionality, client, or skill already exists before implementing a new one or to find components to tweak.

---

## 1. Skills
Available high-level agentic skills defined in the project:

| Skill Name | Entry Point | Aliases / Keywords |
|---|---|---|
${skills.map(s => `| [${s.name}](file:///${path.join(rootDir, s.entry || '')}) | \`${s.entry || 'N/A'}\` | ${s.aliases.join(', ') || 'None'} |`).join('\n')}

---

## 2. Classes (Clients & Helpers)
Instantiable classes for DI or custom configurations:

${classes.map(c => `### ${c.name}
- **Source File**: [${path.basename(c.file)}](file:///${path.join(rootDir, c.file)})
- **Key Methods**:
${c.methods.map(m => `  - \`${m}()\``).join('\n')}
`).join('\n')}

---

## 3. APIs and Clients
Core singletons and client functions for interacting with external platforms:

| API / Client Name | Source File | Description |
|---|---|---|
${apis.map(a => `| \`${a.name}\` | [${path.basename(a.file)}](file:///${path.join(rootDir, a.file)}) | ${a.description} |`).join('\n')}

---

## 4. Utilities
Helper functions and utilities for common processes (data parsing, PDF generation, formatting, etc.):

| Utility Name | Source File | Description |
|---|---|---|
${utilities.map(u => `| \`${u.name}\` | [${path.basename(u.file)}](file:///${path.join(rootDir, u.file)}) | ${u.description} |`).join('\n')}
`;

fs.writeFileSync(
  path.join(registriesDir, 'DEPENDENCIES.md'),
  markdown,
  'utf8'
);

console.log('Successfully generated workflow-dependencies.json and DEPENDENCIES.md inside skills/registries/');
