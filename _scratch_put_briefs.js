const fs = require('fs');
const bc = require('./skills/equity-research/rerating-catalysts/scripts/brief_cache.js');
const all = JSON.parse(fs.readFileSync('./_scratch_briefs.json', 'utf8'));
for (const [ticker, brief] of Object.entries(all)) {
  const { file } = bc.putBrief(ticker, brief);
  console.log('put', ticker, '->', file);
}
