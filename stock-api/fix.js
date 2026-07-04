const fs = require('fs');

// Fix pdfRenderer.js
let p = 'src/utils/pdfRenderer.js';
let c = fs.readFileSync(p, 'utf8');
c = c.replace(/\\\$\{/g, '${');
fs.writeFileSync(p, c);

// Fix generateMarketShareHtml.js
p = 'src/generators/generateMarketShareHtml.js';
c = fs.readFileSync(p, 'utf8');
// Fix the backticks inside _JS that were unescaped
c = c.replace(/label: \(c\) => `\$\{/g, "label: (c) => \\`\\${");
c = c.replace(/ \? historical\[c\.dataIndex\]\.yoy \+ '%' : '-'\}\)`/g, " ? historical[c.dataIndex].yoy + '%' : '-'}\\`");
fs.writeFileSync(p, c);
