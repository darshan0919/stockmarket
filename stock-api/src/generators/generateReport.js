'use strict';

const fs = require('fs');
const path = require('path');
const { wrapHtml, markdownToHtml } = require('../utils/pdfRenderer');

const CREATOR = 'equity-research-deepdive';

/**
 * writeReportDto persists the canonical JSON DTO for a deep-dive report —
 * the source of truth per skills/tooling/output-dto-standard. This MUST be
 * called BEFORE rendering; the render step below is a pure function of this
 * JSON, never a second, independent source of facts.
 *
 * Envelope fields (companyId/creationTime/modifiedTime/creator) live at the
 * record level alongside the report content.
 */
function writeReportDto(companyId, companyName, ticker, reportMarkdown, outputJsonPath, modelUsed) {
  const now = new Date().toISOString();
  let creationTime = now;

  if (fs.existsSync(outputJsonPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(outputJsonPath, 'utf8'));
      if (existing.creationTime) creationTime = existing.creationTime;
    } catch (e) {
      // unreadable/corrupt previous file — treat this write as a fresh creation
    }
  }

  const dto = {
    companyId,
    creationTime,
    modifiedTime: now,
    creator: CREATOR,
    companyName,
    ticker,
    reportMarkdown,
  };
  // modelUsed (skills/tooling/output-dto-standard/SKILL.md): the reportMarkdown here is
  // entirely LLM-authored analysis, so this DTO always needs it. The caller (the skill
  // itself, running as some model) must supply it — never invented/defaulted here.
  if (modelUsed) dto.modelUsed = modelUsed;

  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
  fs.writeFileSync(outputJsonPath, JSON.stringify(dto, null, 2), 'utf8');
  return dto;
}

/**
 * createResearchReportFromDto renders the PDF/HTML purely from a previously
 * written DTO JSON file (see writeReportDto). The render step never gathers
 * or synthesizes new facts — it only templates what's already in the JSON.
 */
async function createResearchReportFromDto(dtoPath, outputPath) {
  const dto = JSON.parse(fs.readFileSync(dtoPath, 'utf8'));

  const bodyHtml = markdownToHtml(dto.reportMarkdown);
  const title = dto.companyName;
  const subtitle = `${dto.ticker} | Equity Research Deep Dive | ${new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })}`;

  const htmlContent = wrapHtml(title, subtitle, bodyHtml, { modelUsed: dto.modelUsed });

  fs.writeFileSync(outputPath, htmlContent, 'utf8');
  console.log(`✅ Report saved to: ${outputPath}`);
  return outputPath;
}

/**
 * createResearchReport is the convenience entry point used by callers that
 * don't manage the DTO themselves: it writes the DTO JSON (source of truth)
 * and then renders from it, so JSON and render can never drift apart.
 *
 * opts.companyId defaults to `ticker` (the canonical symbol convention used
 * elsewhere in this repo, e.g. "NSE:SWARAJENG").
 * opts.dtoPath defaults to `<outputPath-without-extension>.json`.
 */
async function createResearchReport(companyName, ticker, reportMarkdown, outputPath, opts = {}) {
  const companyId = opts.companyId || ticker;
  const dtoPath = opts.dtoPath || outputPath.replace(/\.[^./]+$/, '') + '.json';

  writeReportDto(companyId, companyName, ticker, reportMarkdown, dtoPath, opts.modelUsed);
  return createResearchReportFromDto(dtoPath, outputPath);
}

if (require.main === module) {
  const sample = `
## 1. Business Deep Dive

Test paragraph.

| Metric | Value |
|--------|-------|
| Revenue | Rs 1,000 Cr |
| PAT | Rs 100 Cr |

## 2. Investment Verdict

**BUY** with a 12-month target of Rs 500.
`;
  createResearchReport('Test Company Ltd', 'NSE: TEST', sample, '/tmp/test_report.pdf')
    .then(() => process.exit(0))
    .catch(console.error);
}

module.exports = { createResearchReport, createResearchReportFromDto, writeReportDto };
