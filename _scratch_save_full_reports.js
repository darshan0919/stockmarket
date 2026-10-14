const { loadEnv } = require('./packages/jobs-runtime/lib/env');
loadEnv();
const fs = require('fs');
const db = require('./packages/jobs-runtime/lib/db');
const files = [
  ['NSE:TCS', '_scratch_dto_tcs.json', 'summary_tcs'],
  ['NSE:HCLTECH', '_scratch_dto_hcltech.json', 'summary_hcl'],
  ['NSE:SHRIRAMFIN', '_scratch_dto_shriramfin.json', 'summary_sf'],
];
for (const [companyId, file] of files) {
  const dto = JSON.parse(fs.readFileSync(file, 'utf8'));
  dto.id = dto.id || `rpt_rerating-catalysts_${companyId.replace(/[^A-Za-z0-9]/g, '_')}_20261012`;
  dto.type = 'rerating-catalysts';
  dto.companyId = companyId;
  dto.summary = dto.verdict ? dto.verdict.slice(0, 400) : '';
  const id = db.saveReport(dto);
  console.log('saved', companyId, '->', id);
}
