'use strict';

const fs = require('fs');
const path = require('path');
const {
  INSTITUTIONAL_DARK,
  parseMarkdownTable,
  formatInlineMarkdown,
  styledTableHtml,
} = require('./pdfUtils');

/**
 * Common HTML wrapping for deep dive reports, using INSTITUTIONAL_DARK palette.
 */
/**
 * Shared institutional-briefing shell. Palette + component classes match
 * skills/_shared/pdf-design-guide.md — every skill's PDF should look like it
 * came from the same desk. Generators pass markdown/HTML into `bodyHtml`;
 * they can also freely emit `.chip`, `.hl`, `.kpi`/`.grid3`/`.grid4`, and
 * `.vmatrix` markup (see pdfUtils.chipHtml / calloutHtml for JS helpers, or
 * emit the class names directly) and it will render consistently here.
 */
function wrapHtml(title, subtitle, bodyHtml, options = {}) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <style>
            * { box-sizing: border-box; }
            body {
                font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
                color: ${INSTITUTIONAL_DARK.text || '#1a1a1a'};
                margin: 0;
                padding: 0;
                font-size: 10.5px;
                line-height: 1.45;
            }
            .eyebrow {
                font-size: 9px;
                letter-spacing: 0.1em;
                text-transform: uppercase;
                color: ${INSTITUTIONAL_DARK.muted};
                font-family: monospace;
                margin-bottom: 4px;
            }
            .title {
                font-size: 20pt;
                font-weight: 600;
                color: ${INSTITUTIONAL_DARK.primary};
                margin-bottom: 2mm;
            }
            .subtitle {
                font-size: 9px;
                font-family: monospace;
                color: ${INSTITUTIONAL_DARK.muted};
                margin-bottom: 8mm;
            }
            .thick-line {
                border-top: 2.5pt solid ${INSTITUTIONAL_DARK.primary};
                margin-bottom: 6mm;
            }
            h2 {
                font-size: 10.5pt;
                font-family: monospace;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: ${INSTITUTIONAL_DARK.muted};
                margin-top: 8mm;
                margin-bottom: 4mm;
                border-bottom: 1px solid ${INSTITUTIONAL_DARK.border};
                padding-bottom: 3mm;
            }
            h3 {
                font-size: 11pt;
                font-weight: 600;
                color: ${INSTITUTIONAL_DARK.primary};
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
                font-weight: 600;
            }
            .quote {
                font-style: italic;
                font-size: 9.8pt;
                color: ${INSTITUTIONAL_DARK.muted};
                border-left: 2px solid ${INSTITUTIONAL_DARK.border};
                padding: 3px 10px;
                margin: 6px 0;
            }
            .verdict-buy { color: ${INSTITUTIONAL_DARK.good}; font-size: 13pt; font-weight: 600; margin-top: 4mm; margin-bottom: 2mm; }
            .verdict-hold { color: ${INSTITUTIONAL_DARK.warn}; font-size: 13pt; font-weight: 600; margin-top: 4mm; margin-bottom: 2mm; }
            .verdict-avoid { color: ${INSTITUTIONAL_DARK.bad}; font-size: 13pt; font-weight: 600; margin-top: 4mm; margin-bottom: 2mm; }

            .chip { display: inline-block; font-size: 7.8px; font-family: monospace; padding: 2px 6px; border-radius: 3px; font-weight: 600; margin: 1px 2px 1px 0; }
            .chip-g { background: #eaf3de; color: #27500a; }
            .chip-r { background: #fcebeb; color: #791f1f; }
            .chip-y { background: #faeeda; color: #633806; }
            .chip-b { background: #e6f1fb; color: #0c447c; }
            .hl { padding: 7px 10px; border-radius: 3px; margin: 6px 0; font-size: 10px; line-height: 1.5; }
            .hl-g { background: #eaf3de; border-left: 3px solid #5bad3a; color: #1a3d0a; }
            .hl-r { background: #fcebeb; border-left: 3px solid #e24b4a; color: #52100f; }
            .hl-y { background: #faeeda; border-left: 3px solid #ef9f27; color: #412402; }
            .hl-b { background: #e6f1fb; border-left: 3px solid #3a85c9; color: #0a2752; }
            .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0; }
            .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0; }
            .kpi { background: ${INSTITUTIONAL_DARK.tint}; border-radius: 4px; padding: 8px 10px; }
            .kpi .label { font-size: 7.5px; font-family: monospace; color: ${INSTITUTIONAL_DARK.muted}; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
            .kpi .bignum { font-size: 17px; font-weight: 600; }
            .kpi .subnum { font-size: 8.5px; font-family: monospace; color: ${INSTITUTIONAL_DARK.muted}; margin-top: 2px; }
            .vmatrix { display: grid; border: 0.5px solid ${INSTITUTIONAL_DARK.border}; border-radius: 4px; overflow: hidden; font-size: 8.8px; margin: 6px 0; }
            .vmatrix > div { padding: 5px 7px; border-bottom: 0.5px solid ${INSTITUTIONAL_DARK.border}; }

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
        <div class="eyebrow">${options.eyebrow || 'Institutional research briefing'}</div>
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
  const lines = md.split('\n');
  let html = '';
  let inTable = false;
  let tbuf = [];

  const flushTable = () => {
    if (tbuf.length > 0) {
      const tableText = tbuf.join('\n');
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
      if (inTable) {
        flushTable();
        inTable = false;
      }
      if (inList) {
        html += `</${listType}>\n`;
        inList = false;
      }
      html += '<br/>\n';
      continue;
    }

    if (line.includes('|') && (line.startsWith('|') || (line.match(/\\|/g) || []).length >= 2)) {
      if (inList) {
        html += `</${listType}>\n`;
        inList = false;
      }
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

    if (
      inList &&
      !trimmed.startsWith('- ') &&
      !trimmed.startsWith('* ') &&
      !/^\\d+\\.\\s/.test(trimmed)
    ) {
      html += `</${listType}>\n`;
      inList = false;
    }

    if (line.startsWith('## ')) {
      html += `<h2>${formatInlineMarkdown(line.substring(3).trim())}</h2>\n`;
    } else if (line.startsWith('### ')) {
      html += `<h3>${formatInlineMarkdown(line.substring(4).trim())}</h3>\n`;
    } else if (/^---+$/.test(trimmed)) {
      html += `<hr style="border-top: 0.5pt solid ${INSTITUTIONAL_DARK.border}; margin: 3mm 0;">\n`;
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) {
        inList = true;
        listType = 'ul';
        html += '<ul>\n';
      }
      html += `<li>${formatInlineMarkdown(trimmed.substring(2))}</li>\n`;
    } else if (/^\\d+\\.\\s+(.*)/.test(trimmed)) {
      if (!inList) {
        inList = true;
        listType = 'ol';
        html += '<ol>\n';
      }
      const match = trimmed.match(/^\\d+\\.\\s+(.*)/);
      html += `<li>${formatInlineMarkdown(match[1])}</li>\n`;
    } else if (trimmed.startsWith('>')) {
      html += `<div class="quote">${formatInlineMarkdown(trimmed.substring(1).trim())}</div>\n`;
    } else if (line.includes('🚩') || line.toUpperCase().includes('RED FLAG')) {
      const t = trimmed.replace('🚩', '').trim();
      html += `<p class="red-flag">⚠ ${formatInlineMarkdown(t)}</p>\n`;
    } else if (
      trimmed.startsWith('**BUY**') ||
      trimmed.startsWith('**HOLD**') ||
      trimmed.startsWith('**AVOID**')
    ) {
      let cls = 'verdict-buy';
      if (trimmed.startsWith('**HOLD**')) cls = 'verdict-hold';
      else if (trimmed.startsWith('**AVOID**')) cls = 'verdict-avoid';
      html += `<div class="${cls}">${formatInlineMarkdown(trimmed)}</div>\n`;
    } else {
      html += `<p>${formatInlineMarkdown(trimmed)}</p>\n`;
    }
  }

  if (inTable) flushTable();
  if (inList) html += `</${listType}>\n`;

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
        `,
  });

  await browser.close();
  return outputPath;
}

module.exports = {
  wrapHtml,
  markdownToHtml,
  renderPdf,
};
