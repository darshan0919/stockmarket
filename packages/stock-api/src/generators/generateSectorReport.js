'use strict';

const { wrapHtml, markdownToHtml, renderPdf } = require('../utils/pdfRenderer');
const { INSTITUTIONAL_DARK, formatInlineMarkdown } = require('../utils/pdfUtils');

/**
 * createSectorReport converts markdown to an institutional PDF sector primer.
 */
async function createSectorReport(sectorName, subTheme, reportMarkdown, outputPath) {
    let bodyHtml = '';
    
    // Custom replacements for sector report
    const lines = reportMarkdown.split('\n');
    let customizedMd = [];
    for (let line of lines) {
        if (line.trim().startsWith('[Analyst View]') || line.trim().toLowerCase().startsWith('**[analyst view]**')) {
            const txt = line.trim().replace(/^\\*\\*\\[analyst view\\]\\*\\*/i, '[Analyst View]');
            customizedMd.push(`<div style="color: ${INSTITUTIONAL_DARK.secondary}; font-weight: bold; margin-bottom: 2mm; margin-left: 4mm;">${formatInlineMarkdown(txt)}</div>`);
        } else {
            customizedMd.push(line);
        }
    }
    
    bodyHtml += markdownToHtml(customizedMd.join('\n'));
    
    const title = sectorName;
    const subtitleParts = ["Sector Research Deep Dive"];
    if (subTheme) subtitleParts.push(subTheme);
    subtitleParts.push(new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' }));
    
    const subtitle = subtitleParts.join(' | ');
    let headerText = `${sectorName} — Sector Deep Dive`;
    if (subTheme) headerText += ` | ${subTheme}`;
    
    const footerLeft = "Internal — for investment conviction building; not a published recommendation.";
    
    // Override some wrapHtml styles with classification
    let htmlContent = wrapHtml(title, subtitle, bodyHtml, { headerBg: INSTITUTIONAL_DARK.primary });
    
    const classificationHtml = `
    <div style="font-size: 8.5pt; color: ${INSTITUTIONAL_DARK.bad}; font-weight: bold; margin-bottom: 8mm;">
        Classification: INTERNAL — for investment conviction building; not a published recommendation.
    </div>
    <div style="font-size: 7.5pt; color: ${INSTITUTIONAL_DARK.muted}; margin-bottom: 4mm;">
        <b>Data current as of:</b> ${new Date().toLocaleString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
    </div>
    <hr style="border-top: 1.5pt solid ${INSTITUTIONAL_DARK.primary}; margin-bottom: 6mm;" />
    `;
    
    htmlContent = htmlContent.replace('<div class="thick-line"></div>', classificationHtml);
    
    await renderPdf(htmlContent, outputPath, headerText, footerLeft);
    console.log(`✅ Sector primer saved to: ${outputPath}`);
    return outputPath;
}

module.exports = { createSectorReport };
