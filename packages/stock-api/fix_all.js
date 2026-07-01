const fs = require('fs');
const path = require('path');
const dir = 'src/generators';
fs.readdirSync(dir).forEach(file => {
    if (file.endsWith('.js')) {
        let p = path.join(dir, file);
        let c = fs.readFileSync(p, 'utf8');
        let old = c;
        c = c.replace(/\\\`/g, '`');
        c = c.replace(/\\\\n/g, '\\n');
        if (old !== c) {
            fs.writeFileSync(p, c);
            console.log('Fixed', p);
        }
    }
});
