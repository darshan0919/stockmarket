'use strict';

const { wrapHtml, markdownToHtml, renderPdf } = require('../utils/pdfRenderer');

/**
 * createResearchReport converts markdown to an institutional PDF report.
 */
async function createResearchReport(companyName, ticker, reportMarkdown, outputPath) {
    const bodyHtml = markdownToHtml(reportMarkdown);
    const title = companyName;
    const subtitle = `${ticker} | Equity Research Deep Dive | ${new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })}`;
    const headerText = `${companyName} (${ticker}) — Equity Research Deep Dive`;
    
    const htmlContent = wrapHtml(title, subtitle, bodyHtml);
    
    await renderPdf(htmlContent, outputPath, headerText);
    console.log(`✅ Report saved to: ${outputPath}`);
    return outputPath;
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
    createResearchReport("Test Company Ltd", "NSE: TEST", sample, "/tmp/test_report.pdf")
        .then(() => process.exit(0))
        .catch(console.error);
}

module.exports = { createResearchReport };
