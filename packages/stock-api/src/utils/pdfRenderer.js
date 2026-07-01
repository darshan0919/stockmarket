'use strict';

const fs = require('fs');
const path = require('path');
const { INSTITUTIONAL_DARK, parseMarkdownTable, formatInlineMarkdown, styledTableHtml } = require('./pdfUtils');

/**
 * Common HTML wrapping for deep dive reports, using INSTITUTIONAL_DARK palette.
 */
function wrapHtml(title, subtitle, bodyHtml, options = {}) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Helvetica:wght@400;700&display=swap');
            
            body {
                font-family: 'Helvetica', Arial, sans-serif;
                color: #000;
                margin: 0;
                padding: 0;
                font-size: 9pt;
                line-height: 1.4;
            }
            .header-line {
                border-top: 1px solid ${INSTITUTIONAL_DARK.primary};
                margin-top: 10px;
                margin-bottom: 5px;
            }
            .title {
                font-size: 22pt;
                color: ${INSTITUTIONAL_DARK.primary};
                margin-bottom: 4mm;
            }
            .subtitle {
                font-size: 11pt;
                color: ${INSTITUTIONAL_DARK.muted};
                margin-bottom: 8mm;
            }
            .thick-line {
                border-top: 1.5pt solid ${INSTITUTIONAL_DARK.primary};
                margin-bottom: 6mm;
            }
            h2 {
                font-size: 14pt;
                color: ${INSTITUTIONAL_DARK.primary};
                margin-top: 10mm;
                margin-bottom: 4mm;
                border-bottom: 0.5pt solid ${INSTITUTIONAL_DARK.primary};
                padding-bottom: 3mm;
            }
            h3 {
                font-size: 11pt;
                color: ${INSTITUTIONAL_DARK.secondary};
                margin-top: 6mm;
                margin-bottom: 3mm;
            }
            p {
                margin-bottom: 3mm;
                text-align: justify;
            }
            ul, ol {
                margin-top: 0;
                margin-bottom: 3mm;
                padding-left: 8mm;
            }
            li {
                margin-bottom: 1.5mm;
            }
            .red-flag {
                color: ${INSTITUTIONAL_DARK.bad};
                font-weight: bold;
            }
            .quote {
                color: ${INSTITUTIONAL_DARK.muted};
                font-style: italic;
                margin-left: 10mm;
                margin-right: 10mm;
                margin-top: 2mm;
                margin-bottom: 3mm;
            }
            .verdict-buy { color: ${INSTITUTIONAL_DARK.good}; font-size: 14pt; font-weight: bold; margin-top: 4mm; margin-bottom: 2mm; }
            .verdict-hold { color: ${INSTITUTIONAL_DARK.warn}; font-size: 14pt; font-weight: bold; margin-top: 4mm; margin-bottom: 2mm; }
            .verdict-avoid { color: ${INSTITUTIONAL_DARK.bad}; font-size: 14pt; font-weight: bold; margin-top: 4mm; margin-bottom: 2mm; }
            
            .disclaimer {
                font-size: 7.5pt;
                color: ${INSTITUTIONAL_DARK.muted};
                margin-top: 10mm;
                border-top: 0.5pt solid ${INSTITUTIONAL_DARK.border};
                padding-top: 3mm;
            }
        </style>
    </head>
    <body>
        <div class="title">${title}</div>
        <div class="subtitle">${subtitle}</div>
        <div class="thick-line"></div>
        ${bodyHtml}
        
        <div class="disclaimer">
            <p><b>Disclaimer:</b> This report is for informational and educational purposes only. It does not constitute investment advice. The author may have positions in securities discussed. Always conduct your own due diligence and consult a registered investment advisor before making investment decisions. Past performance is not indicative of future results.</p>
            <p>Report generated on ${new Date().toLocaleString('en-GB')} using AI-assisted research. Data sourced from public filings, screener.in, company presentations, and web research. All figures in INR unless stated otherwise.</p>
        </div>
    </body>
    </html>
    `;
}

/**
 * Converts markdown subset to HTML.
 */
function markdownToHtml(md) {
    const lines = md.split('\
');
    let html = '';
    let inTable = false;
    let tbuf = [];

    const flushTable = () => {
        if (tbuf.length > 0) {
            const tableText = tbuf.join('\
');
            const { headers, rows } = parseMarkdownTable(tableText);
            if (headers && rows) {
                html += styledTableHtml([headers, ...rows], INSTITUTIONAL_DARK);
                html += '<br/>';
            }
            tbuf = [];
        }
    };

    let inList = false;
    let listType = '';

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trimEnd();
        const trimmed = line.trim();

        if (!trimmed) {
            if (inTable) { flushTable(); inTable = false; }
            if (inList) { html += `</${listType}>\
`; inList = false; }
            html += '<br/>\
';
            continue;
        }

        if (line.includes('|') && (line.startsWith('|') || (line.match(/\\|/g) || []).length >= 2)) {
            if (inList) { html += `</${listType}>\
`; inList = false; }
            inTable = true;
            tbuf.push(line);
            continue;
        }

        if (inTable) {
            if (line.includes('|')) {
                tbuf.push(line);
                continue;
            }
            flushTable();
            inTable = false;
        }

        if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) continue;

        if (inList && !trimmed.startsWith('- ') && !trimmed.startsWith('* ') && !/^\\d+\\.\\s/.test(trimmed)) {
            html += `</${listType}>\
`;
            inList = false;
        }

        if (line.startsWith('## ')) {
            html += `<h2>${formatInlineMarkdown(line.substring(3).trim())}</h2>\
`;
        } else if (line.startsWith('### ')) {
            html += `<h3>${formatInlineMarkdown(line.substring(4).trim())}</h3>\
`;
        } else if (/^---+$/.test(trimmed)) {
            html += `<hr style="border-top: 0.5pt solid ${INSTITUTIONAL_DARK.border}; margin: 3mm 0;">\
`;
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            if (!inList) { inList = true; listType = 'ul'; html += '<ul>\
'; }
            html += `<li>${formatInlineMarkdown(trimmed.substring(2))}</li>\
`;
        } else if (/^\\d+\\.\\s+(.*)/.test(trimmed)) {
            if (!inList) { inList = true; listType = 'ol'; html += '<ol>\
'; }
            const match = trimmed.match(/^\\d+\\.\\s+(.*)/);
            html += `<li>${formatInlineMarkdown(match[1])}</li>\
`;
        } else if (trimmed.startsWith('>')) {
            html += `<div class="quote">${formatInlineMarkdown(trimmed.substring(1).trim())}</div>\
`;
        } else if (line.includes('🚩') || line.toUpperCase().includes('RED FLAG')) {
            const t = trimmed.replace('🚩', '').trim();
            html += `<p class="red-flag">⚠ ${formatInlineMarkdown(t)}</p>\
`;
        } else if (trimmed.startsWith('**BUY**') || trimmed.startsWith('**HOLD**') || trimmed.startsWith('**AVOID**')) {
            let cls = 'verdict-buy';
            if (trimmed.startsWith('**HOLD**')) cls = 'verdict-hold';
            else if (trimmed.startsWith('**AVOID**')) cls = 'verdict-avoid';
            html += `<div class="${cls}">${formatInlineMarkdown(trimmed)}</div>\
`;
        } else {
            html += `<p>${formatInlineMarkdown(trimmed)}</p>\
`;
        }
    }

    if (inTable) flushTable();
    if (inList) html += `</${listType}>\
`;

    return html;
}

async function renderPdf(htmlContent, outputPath, headerText, footerLeftText) {
    let puppeteer;
    try {
        puppeteer = require('puppeteer');
    } catch (err) {
        throw new Error('puppeteer is required to generate PDFs. Please install it.');
    }
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await page.pdf({
        path: outputPath,
        format: 'A4',
        margin: { top: '18mm', bottom: '18mm', left: '15mm', right: '15mm' },
        displayHeaderFooter: true,
        headerTemplate: `
            <div style="width: 100%; font-size: 7px; color: ${INSTITUTIONAL_DARK.muted}; padding: 0 15mm; display: flex; justify-content: space-between; border-bottom: 1px solid ${INSTITUTIONAL_DARK.primary}; margin-bottom: 10px;">
                <span>${headerText}</span>
                <span>${new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })}</span>
            </div>
        `,
        footerTemplate: `
            <div style="width: 100%; font-size: 7px; color: ${INSTITUTIONAL_DARK.muted}; padding: 0 15mm; display: flex; justify-content: space-between; border-top: 0.5px solid ${INSTITUTIONAL_DARK.primary}; margin-top: 10px;">
                <span>${footerLeftText || 'For informational purposes only. Not investment advice.'}</span>
                <span>Page <span class="pageNumber"></span></span>
            </div>
        `
    });
    
    await browser.close();
    return outputPath;
}

module.exports = {
    wrapHtml,
    markdownToHtml,
    renderPdf
};
