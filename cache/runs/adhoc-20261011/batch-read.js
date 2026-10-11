const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const WI_JOB = path.resolve('packages/jobs-runtime/watchlistInsights.js');
const RD = process.argv[2];
const items = require(path.resolve(RD, 'categorise-output.json'));
const need = items.filter(it => it.isDuplicateLead !== false);
const out = [];
for (const it of need) {
  let res;
  try {
    const raw = execFileSync('node', [WI_JOB, 'read-pdf-with-meta', it.pdfUrl], {maxBuffer: 1024*1024*50, stdio: ['ignore','pipe','pipe']});
    const lines = raw.toString('utf8').split('\n').filter(l => l.trim().startsWith('{') || l.trim().startsWith('['));
    // find the JSON object - it's usually the last valid JSON blob in stdout
    let parsed = null;
    for (const line of raw.toString('utf8').split(/\n(?=\{)/)) {
      try { parsed = JSON.parse(line); } catch(e) {}
    }
    res = parsed;
  } catch (e) {
    res = { error: String(e).slice(0,500) };
  }
  out.push({ companyId: it.companyId, name: it.name, announcementId: it.ssUrl, pdfUrl: it.pdfUrl, category: it.category, title: it.title, description: it.description, date: it.date, highConviction: it.highConviction, heavyDocument: it.heavyDocument, text: res && res.text ? res.text : null, numPages: res && res.numPages, isHeavyParse: res && res.isHeavyParse, ocrFailed: res && res.ocrFailed, readError: res && res.error });
  console.error('done:', it.companyId, it.announcementId);
}
fs.writeFileSync(path.join(RD, 'pdf-texts.json'), JSON.stringify(out, null, 2));
console.log('wrote', out.length, 'entries');
