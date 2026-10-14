const d = require('./packages/jobs-runtime/lib/docExtracts');
const fs = require('fs');
const urls = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let hits = [],
  misses = [];
urls.forEach((u) => {
  let r;
  try {
    r = d.get('announcement', u);
  } catch (e) {
    r = null;
  }
  if (r) hits.push(u);
  else misses.push(u);
});
console.log('hits', hits.length, 'misses', misses.length);
console.log('HIT_URLS', JSON.stringify(hits));
