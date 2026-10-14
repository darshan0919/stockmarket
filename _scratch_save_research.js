const fs = require('fs');
const { loadEnv } = require('./packages/jobs-runtime/lib/env');
loadEnv();
const db = require('./packages/jobs-runtime/lib/db');
const rows = JSON.parse(fs.readFileSync('./_scratch_research_dtos.json', 'utf8'));
const marketDate = '2026-10-12';
const nowIso = new Date().toISOString();
for (const r of rows) {
  const dto = {
    id: `gainers-trigger-research_${r.companyId.replace(/[^A-Za-z0-9]/g, '_')}_20261012`,
    creator: 'gainers-signal',
    type: 'gainers-trigger-research',
    date: marketDate,
    companyId: r.companyId,
    modelUsed: 'claude-sonnet-5',
    creationTime: nowIso,
    modifiedTime: nowIso,
    summary: r.summary,
    research_axis: r.research_axis,
    tier: r.tier,
    trigger: r.trigger,
    trigger_quantified: r.trigger_quantified,
    linkage: r.linkage,
    why: { text: r.why_text, basis: r.why_basis, sources: r.sources || [] },
    contextUsed: r.contextUsed || [],
    concallCorroboration: r.concallCorroboration !== undefined ? r.concallCorroboration : null,
  };
  const id = db.saveReport(dto);
  console.log('saved', r.companyId, '->', id);
}
