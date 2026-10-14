const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const WI_JOB = path.resolve('packages/jobs-runtime/watchlistInsights.js');
const RD = process.argv[2];
const items = require(path.resolve(RD, 'categorise-output.json'));
const need = items.filter((it) => it.isDuplicateLead !== false);
const outPath = path.join(RD, 'pdf-texts.json');
let out = [];
if (fs.existsSync(outPath)) {
  try {
    out = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  } catch (e) {
    out = [];
  }
}
const doneKeys = new Set(out.map((o) => o.pdfUrl));
for (const it of need) {
  if (doneKeys.has(it.pdfUrl)) continue;
  let res;
  try {
    const raw = execFileSync('node', [WI_JOB, 'read-pdf-with-meta', it.pdfUrl], {
      maxBuffer: 1024 * 1024 * 50,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let parsed = null;
    for (const line of raw.toString('utf8').split(/\n(?=\{)/)) {
      try {
        parsed = JSON.parse(line);
      } catch (e) {}
    }
    res = parsed;
  } catch (e) {
    res = { error: String(e).slice(0, 500) };
  }
  out.push({
    companyId: it.companyId,
    name: it.name,
    announcementId: it.ssUrl,
    pdfUrl: it.pdfUrl,
    category: it.category,
    title: it.title,
    description: it.description,
    date: it.date,
    highConviction: it.highConviction,
    heavyDocument: it.heavyDocument,
    text: res && res.text ? res.text : null,
    numPages: res && res.numPages,
    isHeavyParse: res && res.isHeavyParse,
    ocrFailed: res && res.ocrFailed,
    readError: res && res.error,
  });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.error('done:', it.companyId, it.ssUrl);
}
console.log('wrote', out.length, 'entries total');
