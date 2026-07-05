const fs = require('fs');
const path = require('path');

const basePath = path.join(__dirname, 'screener-web');
const srcPath = path.join(basePath, 'src');
const featuresPath = path.join(srcPath, 'features');
const corePath = path.join(srcPath, 'core');

// 1. Create directories
['announcements', 'dashboard', 'gainers', 'results', 'screener', 'stock', 'watchlist'].forEach(f => {
    fs.mkdirSync(path.join(featuresPath, f, 'components'), { recursive: true });
});
['common', 'shared'].forEach(f => {
    fs.mkdirSync(path.join(corePath, 'components', f), { recursive: true });
});
fs.mkdirSync(path.join(corePath, 'lib'), { recursive: true });

// 2. Define moves
const fileMoves = [];
const move = (oldPath, newPath) => fileMoves.push({ 
  old: path.join(basePath, oldPath), 
  new: path.join(basePath, newPath),
  oldDir: path.dirname(path.join(basePath, oldPath)),
  newDir: path.dirname(path.join(basePath, newPath))
});

const readdirMove = (dir, targetDir) => {
  if (fs.existsSync(path.join(basePath, dir))) {
    fs.readdirSync(path.join(basePath, dir)).forEach(file => {
      const fullPath = path.join(basePath, dir, file);
      if (fs.statSync(fullPath).isFile()) {
        move(`${dir}/${file}`, `${targetDir}/${file}`);
      } else if (fs.statSync(fullPath).isDirectory()) {
        readdirMove(`${dir}/${file}`, `${targetDir}/${file}`);
      }
    });
  }
};

readdirMove('components/dashboard', 'src/features/dashboard/components');
readdirMove('components/gainers', 'src/features/gainers/components');
readdirMove('components/results', 'src/features/results/components');
readdirMove('components/screener', 'src/features/screener/components');
readdirMove('components/stock', 'src/features/stock/components');
// Also map anything in components directly into core/components? There are no files, only folders based on my list_dir
readdirMove('components/common', 'src/core/components/common');
readdirMove('components/shared', 'src/core/components/shared');
readdirMove('lib', 'src/core/lib');

// Create lookup maps
const pathToNewPath = {};
fileMoves.forEach(m => pathToNewPath[m.old] = m.new);

function resolveImport(importPath, currentOldDir) {
    if (!importPath.startsWith('.')) return null;
    
    // Resolve old absolute path
    let oldAbs = path.resolve(currentOldDir, importPath);
    // Add .js or .jsx if not present
    if (fs.existsSync(oldAbs)) return oldAbs;
    if (fs.existsSync(oldAbs + '.js')) return oldAbs + '.js';
    if (fs.existsSync(oldAbs + '.jsx')) return oldAbs + '.jsx';
    if (fs.existsSync(path.join(oldAbs, 'index.js'))) return path.join(oldAbs, 'index.js');
    if (fs.existsSync(path.join(oldAbs, 'index.jsx'))) return path.join(oldAbs, 'index.jsx');
    
    return oldAbs; // fallback
}

// Function to process a file for regex replacements
const processFile = (filePath, fileOldDir, fileNewDir) => {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Match import ... from '...' or export ... from '...' or require('...')
    const importRegex = /(import|export)\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    
    const replacer = (match, group1, reqPath) => {
        // group1 is either 'import'/'export' or the reqPath if requireRegex
        const isRequire = match.startsWith('require');
        const p = isRequire ? group1 : reqPath;
        
        const oldAbs = resolveImport(p, fileOldDir);
        if (oldAbs && pathToNewPath[oldAbs]) {
            const newAbs = pathToNewPath[oldAbs];
            let newRel = path.relative(fileNewDir, newAbs);
            if (!newRel.startsWith('.')) {
                newRel = './' + newRel;
            }
            // Strip extensions for Next.js imports
            if (!p.endsWith('.js') && !p.endsWith('.jsx')) {
                newRel = newRel.replace(/\.jsx?$/, '');
            }
            if (isRequire) {
                return `require('${newRel}')`;
            } else {
                return match.replace(p, newRel);
            }
        }
        return match;
    };
    
    content = content.replace(importRegex, replacer);
    content = content.replace(requireRegex, replacer);
    return content;
};

// Perform moves and rewrite
fileMoves.forEach(m => {
    if (!fs.existsSync(m.old)) {
        console.log('Skipping ' + m.old + ', does not exist');
        return;
    }
    
    const content = processFile(m.old, m.oldDir, m.newDir);

    // Write to new location
    fs.mkdirSync(path.dirname(m.new), { recursive: true });
    fs.writeFileSync(m.new, content, 'utf8');
    console.log(`Moved ${m.old} -> ${m.new}`);
});

// Update pages directory
const updatePages = (dir) => {
    fs.readdirSync(path.join(basePath, dir)).forEach(file => {
        const fullPath = path.join(basePath, dir, file);
        if (fs.statSync(fullPath).isFile() && (fullPath.endsWith('.js') || fullPath.endsWith('.jsx'))) {
            const content = processFile(fullPath, path.dirname(fullPath), path.dirname(fullPath));
            fs.writeFileSync(fullPath, content, 'utf8');
            console.log(`Updated imports in ${fullPath}`);
        } else if (fs.statSync(fullPath).isDirectory()) {
            updatePages(`${dir}/${file}`);
        }
    });
};
if (fs.existsSync(path.join(basePath, 'pages'))) {
    updatePages('pages');
}

// Update tailwind config to scan src/
const twConfigPath = path.join(basePath, 'tailwind.config.js');
if (fs.existsSync(twConfigPath)) {
    let tw = fs.readFileSync(twConfigPath, 'utf8');
    tw = tw.replace("'./components/**/*.{js,ts,jsx,tsx,mdx}'", "'./src/**/*.{js,ts,jsx,tsx,mdx}'");
    fs.writeFileSync(twConfigPath, tw, 'utf8');
    console.log('Updated tailwind.config.js');
}

// Remove old files
fileMoves.forEach(m => {
    if (fs.existsSync(m.old)) {
        fs.unlinkSync(m.old);
    }
});
['components', 'lib'].forEach(d => {
    if (fs.existsSync(path.join(basePath, d))) {
        fs.rmSync(path.join(basePath, d), { recursive: true, force: true });
    }
});
