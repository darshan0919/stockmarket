const fs = require('fs');
const { verifyIncomeStatement } = require('../../packages/jobs-runtime/lib/pdfExtract/verify.js');
const rows = fs
  .readFileSync(process.argv[2], 'utf8')
  .trim()
  .split('\n')
  .map(JSON.parse)
  .filter((r) => r.found && r.got);
const agg = {};
for (const r of rows) {
  const v = verifyIncomeStatement(r.got).verdict;
  const a = agg[v] || (agg[v] = { docs: 0, cmp: 0, cor: 0, perfect: 0, wrongFields: 0 });
  a.docs++;
  a.cmp += r.compared;
  a.cor += r.correct;
  a.wrongFields += r.wrong;
  if (r.correct === r.compared) a.perfect++;
}
for (const [k, a] of Object.entries(agg)) console.log(k, a, (a.cor / a.cmp).toFixed(3));
