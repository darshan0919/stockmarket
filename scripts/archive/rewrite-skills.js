const fs = require('fs');

const files = [
  'jobs/skills/watchlist-sync/SKILL.md',
  'jobs/skills/watchlist-insights/SKILL.md',
  'jobs/skills/gainers-signal/SKILL.md',
  'jobs/skills/insight-validation/SKILL.md',
  'skills/watchlist-sync/SKILL.md',
  'skills/watchlist-insights/SKILL.md',
  'skills/gainers-signal/SKILL.md',
  'skills/insight-validation/SKILL.md'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf-8');
    const skillName = file.split('/').slice(-2, -1)[0];
    
    // Replace the find block
    // The block usually looks like:
    // PROJECT_ROOT="$(find /sessions -maxdepth 6 -type d -name 'jobs' 2>/dev/null | grep -v node_modules | head -1 | sed 's#/jobs##')"
    // node "$PROJECT_ROOT/jobs/..."
    
    content = content.replace(/PROJECT_ROOT="\$\(find \/sessions.*?node "\$PROJECT_ROOT.*?\.js"/s, 
      `bash ./skills/_shared/resolve.sh ${skillName}`);
    
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`Rewrote ${file}`);
  }
}
