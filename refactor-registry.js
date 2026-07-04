const fs = require('fs');
const path = require('path');

const root = __dirname;
const dirs = ['skills', 'scripts', 'docs', 'jobs', 'stock-api', 'screener-api', 'screener-web'];
const rootFiles = ['package.json', 'README.md', 'NODE_RUNTIME_STRATEGY.md', 'REFACTOR_PLAN.md', 'SKILLS_WORKFLOW_PLAN.md', 'rewrite-skills.js', 'update-registry.js'];

const replaceInFile = (filePath) => {
    if (!fs.existsSync(filePath)) return;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return;
    
    // skip lock files
    if (filePath.endsWith('.lock') || filePath.endsWith('-lock.json') || filePath.endsWith('.png') || filePath.endsWith('.pdf')) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    
    content = content.replace(/packages\/stock-api/g, 'stock-api');
    content = content.replace(/packages\/cowork-jobs/g, 'jobs');
    content = content.replace(/@stock\/cowork-jobs/g, '@stock/jobs');
    content = content.replace(/cowork-jobs/g, 'jobs');
    
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    }
};

const processDir = (dir) => {
    const fullDir = path.join(root, dir);
    if (!fs.existsSync(fullDir)) return;
    
    try {
        const files = fs.readdirSync(fullDir);
        files.forEach(file => {
            if (file === 'node_modules' || file === '.git' || file === '.next' || file.endsWith('.png') || file.endsWith('.pdf')) return;
            const fullPath = path.join(fullDir, file);
            try {
                if (fs.lstatSync(fullPath).isDirectory()) {
                    processDir(path.relative(root, fullPath));
                } else {
                    replaceInFile(fullPath);
                }
            } catch (e) {}
        });
    } catch (e) {}
};

dirs.forEach(processDir);
rootFiles.forEach(f => replaceInFile(path.join(root, f)));
