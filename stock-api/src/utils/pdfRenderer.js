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
            @page {
                size: A4;
                margin: 14mm 12mm;
            }
            * {
                box-sizing: border-box;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                color: #1e293b;
                margin: 0;
                padding: 0;
                font-size: 10px;
                line-height: 1.45;
                background: #ffffff;
            }
            .eyebrow {
                font-size: 8.5px;
                letter-spacing: 0.12em;
                text-transform: uppercase;
                color: #64748b;
                font-family: 'SF Mono', Menlo, Consolas, monospace;
                margin-bottom: 4px;
                font-weight: 600;
            }
            .title {
                font-size: 18pt;
                font-weight: 700;
                color: #0f172a;
                margin-bottom: 2mm;
                line-height: 1.2;
            }
            .subtitle {
                font-size: 9px;
                font-family: 'SF Mono', Menlo, Consolas, monospace;
                color: #64748b;
                margin-bottom: 6mm;
            }
            .thick-line {
                border-top: 2.5pt solid #0f172a;
                margin-bottom: 5mm;
            }
            h2 {
                font-size: 10.5pt;
                font-family: 'SF Mono', Menlo, Consolas, monospace;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: #334155;
                margin-top: 7mm;
                margin-bottom: 3.5mm;
                border-bottom: 1.5px solid #cbd5e1;
                padding-bottom: 2.5mm;
                font-weight: 700;
            }
            h3 {
                font-size: 11pt;
                font-weight: 700;
                color: #0f172a;
                margin-top: 5mm;
                margin-bottom: 2.5mm;
            }
            p {
                margin-bottom: 3mm;
                text-align: justify;
            }
            ul, ol {
                margin-top: 0;
                margin-bottom: 3mm;
                padding-left: 6mm;
            }
            li {
                margin-bottom: 1.5mm;
            }
            .red-flag {
                color: #dc2626;
                font-weight: 700;
            }
            .quote {
                font-style: italic;
                font-size: 9.5px;
                color: #475569;
                border-left: 3px solid #cbd5e1;
                padding: 4px 10px;
                margin: 6px 0;
                background: #f8fafc !important;
                border-radius: 0 4px 4px 0;
            }
            .verdict-buy { color: #16a34a; font-size: 13pt; font-weight: 700; margin-top: 4mm; margin-bottom: 2mm; }
            .verdict-hold { color: #d97706; font-size: 13pt; font-weight: 700; margin-top: 4mm; margin-bottom: 2mm; }
            .verdict-avoid { color: #dc2626; font-size: 13pt; font-weight: 700; margin-top: 4mm; margin-bottom: 2mm; }

            .sec {
                margin-top: 14px;
                page-break-inside: avoid;
            }
            .sec-hd {
                font-size: 10.5px;
                font-family: 'SF Mono', Menlo, Consolas, monospace;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: #334155;
                border-bottom: 1.5px solid #cbd5e1;
                padding-bottom: 3px;
                margin-bottom: 8px;
                font-weight: 700;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0; }
            .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 8px 0; }
            .grid2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin: 8px 0; }

            .kpi {
                background: #f8fafc !important;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                padding: 8px 10px;
                box-shadow: 0 1px 2px rgba(0,0,0,0.02);
                page-break-inside: avoid;
            }
            .kpi-g { border-left: 3.5px solid #16a34a !important; background: #f0fdf4 !important; }
            .kpi-r { border-left: 3.5px solid #dc2626 !important; background: #fef2f2 !important; }
            .kpi-y { border-left: 3.5px solid #d97706 !important; background: #fffbeb !important; }
            .kpi-b { border-left: 3.5px solid #2563eb !important; background: #eff6ff !important; }

            .label {
                font-size: 8px;
                font-family: 'SF Mono', Menlo, Consolas, monospace;
                color: #64748b;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                margin-bottom: 3px;
                font-weight: 600;
            }
            .bignum {
                font-size: 16px;
                font-weight: 700;
                color: #0f172a;
                line-height: 1.2;
            }
            .subnum {
                font-size: 8.5px;
                font-family: 'SF Mono', Menlo, Consolas, monospace;
                color: #64748b;
                margin-top: 2px;
            }

            .chip {
                display: inline-block;
                font-size: 8px;
                font-family: 'SF Mono', Menlo, Consolas, monospace;
                padding: 2.5px 7px;
                border-radius: 4px;
                font-weight: 600;
                margin: 1.5px 3px 1.5px 0;
                border: 1px solid transparent;
            }
            .chip-g { background: #dcfce7 !important; color: #15803d !important; border-color: #bbf7d0 !important; }
            .chip-r { background: #fee2e2 !important; color: #b91c1c !important; border-color: #fecaca !important; }
            .chip-y { background: #fef3c7 !important; color: #b45309 !important; border-color: #fde68a !important; }
            .chip-b { background: #dbeafe !important; color: #1d4ed8 !important; border-color: #bfdbfe !important; }

            .hl {
                padding: 8px 12px;
                border-radius: 5px;
                margin: 7px 0;
                font-size: 10px;
                line-height: 1.5;
                border: 1px solid transparent;
                page-break-inside: avoid;
            }
            .hl-g { background: #f0fdf4 !important; border-left: 3.5px solid #16a34a !important; border-color: #bbf7d0 !important; color: #14532d !important; }
            .hl-r { background: #fef2f2 !important; border-left: 3.5px solid #dc2626 !important; border-color: #fecaca !important; color: #7f1d1d !important; }
            .hl-y { background: #fffbeb !important; border-left: 3.5px solid #d97706 !important; border-color: #fde68a !important; color: #78350f !important; }
            .hl-b { background: #eff6ff !important; border-left: 3.5px solid #2563eb !important; border-color: #bfdbfe !important; color: #1e3a8a !important; }

            .up { color: #16a34a !important; font-weight: 700; }
            .dn { color: #dc2626 !important; font-weight: 700; }

            .verdict-band {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                margin: 4px 0 10px 0;
            }

            .vmatrix {
                display: grid;
                border: 1px solid #e2e8f0;
                border-radius: 5px;
                overflow: hidden;
                font-size: 9px;
                margin: 6px 0;
            }
            .vmatrix > div {
                padding: 6px 8px;
                border-bottom: 1px solid #e2e8f0;
            }

            table {
                width: 100%;
                border-collapse: collapse;
                font-size: 9.5px;
                margin: 6px 0;
                border: 1px solid #e2e8f0;
                border-radius: 4px;
                overflow: hidden;
                page-break-inside: auto;
            }
            tr {
                page-break-inside: avoid;
                page-break-after: auto;
            }
            th {
                font-family: 'SF Mono', Menlo, Consolas, monospace;
                font-size: 8px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: #334155;
                background: #f1f5f9 !important;
                padding: 6px 8px;
                text-align: left;
                border-bottom: 1.5px solid #cbd5e1;
                font-weight: 700;
            }
            td {
                padding: 5.5px 8px;
                border-bottom: 0.5px solid #e2e8f0;
                vertical-align: top;
                color: #1e293b;
            }
            tr:nth-child(even) td {
                background: #f8fafc !important;
            }

            .disclaimer {
                font-size: 7.5pt;
                color: #64748b;
                margin-top: 10mm;
                border-top: 0.5pt solid #cbd5e1;
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
            <p>Report generated on ${new Date().toLocaleString('en-GB')} using AI-assisted research${options.modelUsed ? ` (model: ${Array.isArray(options.modelUsed) ? options.modelUsed.join(' + ') : options.modelUsed})` : ''}. Data sourced from public filings, screener.in, company presentations, and web research. All figures in INR unless stated otherwise.</p>
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
    margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="width: 100%; font-size: 7.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #64748b; padding: 0 12mm; display: flex; justify-content: space-between; border-bottom: 0.5px solid #cbd5e1; margin-bottom: 8px; -webkit-print-color-adjust: exact;">
        <span style="font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;">${headerText || 'INSTITUTIONAL EQUITY RESEARCH'}</span>
        <span>${new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })}</span>
      </div>
    `,
    footerTemplate: `
      <div style="width: 100%; font-size: 7.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #64748b; padding: 0 12mm; display: flex; justify-content: space-between; border-top: 0.5px solid #cbd5e1; margin-top: 8px; -webkit-print-color-adjust: exact;">
        <span>${footerLeftText || 'Strictly Private & Confidential · For Research Purposes Only'}</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
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
