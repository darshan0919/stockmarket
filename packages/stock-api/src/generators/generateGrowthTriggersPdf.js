'use strict';

const { wrapHtml, markdownToHtml, renderPdf } = require('../utils/pdfRenderer');
const { INSTITUTIONAL_LIGHT, formatInlineMarkdown } = require('../utils/pdfUtils');

function _convictionColor(tag) {
    const t = (tag || '').toUpperCase();
    if (t.includes('HIGH')) return INSTITUTIONAL_LIGHT.good;
    if (t.includes('MED')) return INSTITUTIONAL_LIGHT.warn;
    return INSTITUTIONAL_LIGHT.bad;
}

function _sectionHeader(text) {
    return `<div style="background-color: ${INSTITUTIONAL_LIGHT.primary}; color: #ffffff; padding: 4px 8px; font-weight: bold; font-size: 9pt; margin-top: 6mm; margin-bottom: 2mm;">${formatInlineMarkdown(text)}</div>`;
}

function _triggerParagraph(num, trig) {
    const c = _convictionColor(trig.conviction);
    let html = `<p style="font-size: 8pt; text-align: justify; margin-bottom: 3mm;">`;
    html += `<span style="color: ${INSTITUTIONAL_LIGHT.secondary}; font-weight: bold;">${num}. ${formatInlineMarkdown(trig.name || '')}</span> `;
    html += `${formatInlineMarkdown(trig.body || '')} `;
    html += `<span style="color: ${INSTITUTIONAL_LIGHT.muted};"><b>Impact:</b> ${formatInlineMarkdown(trig.impact || '')} | <b>Timeline:</b> ${formatInlineMarkdown(trig.timeline || '')} | </span>`;
    html += `<span style="color: ${c}; font-weight: bold;">[${formatInlineMarkdown(trig.conviction || '')}]</span>`;
    html += `</p>`;
    return html;
}

function _kpiTable(headers, values) {
    if (!headers || !values) return '';
    const n = headers.length;
    let html = `<table style="width: 100%; border-collapse: collapse; font-size: 7pt; text-align: center; border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border}; margin-bottom: 4mm;">`;
    
    html += `<tr>`;
    headers.forEach(h => {
        html += `<td style="background-color: ${INSTITUTIONAL_LIGHT.tint}; border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;"><b>${formatInlineMarkdown(h)}</b></td>`;
    });
    html += `</tr><tr>`;
    values.forEach(v => {
        html += `<td style="background-color: #ffffff; border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown(v)}</td>`;
    });
    html += `</tr></table>`;
    return html;
}

function _scoreboardTable(rows) {
    if (!rows || !rows.length) return '';
    let html = `<table style="width: 100%; border-collapse: collapse; font-size: 7pt; border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border};">`;
    html += `<tr>
        <th style="background-color: ${INSTITUTIONAL_LIGHT.primary}; color: #fff; padding: 4px; border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border};">#</th>
        <th style="background-color: ${INSTITUTIONAL_LIGHT.primary}; color: #fff; padding: 4px; border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border};">Trigger</th>
        <th style="background-color: ${INSTITUTIONAL_LIGHT.primary}; color: #fff; padding: 4px; border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border};">Revenue / Earnings Impact</th>
        <th style="background-color: ${INSTITUTIONAL_LIGHT.primary}; color: #fff; padding: 4px; border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border};">Timeline</th>
        <th style="background-color: ${INSTITUTIONAL_LIGHT.primary}; color: #fff; padding: 4px; border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border};">Conviction</th>
    </tr>`;
    
    rows.forEach((r, idx) => {
        const bg = idx % 2 === 0 ? INSTITUTIONAL_LIGHT.tint : '#ffffff';
        const num = r[0];
        const name = r[1];
        const impact = r[2];
        const timeline = r[3];
        const conv = r[4];
        const c = _convictionColor(conv);
        
        html += `<tr style="background-color: ${bg}; text-align: center;">`;
        html += `<td style="border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown(String(num))}</td>`;
        html += `<td style="border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px; text-align: left;">${formatInlineMarkdown(name)}</td>`;
        html += `<td style="border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px; text-align: left;">${formatInlineMarkdown(impact)}</td>`;
        html += `<td style="border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown(timeline)}</td>`;
        html += `<td style="border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;"><span style="color: ${c}; font-weight: bold;">${formatInlineMarkdown(conv)}</span></td>`;
        html += `</tr>`;
    });
    html += `</table>`;
    return html;
}

async function createGrowthTriggersPdf(data) {
    const outputPath = data.output_path || '/tmp/Growth_Triggers.pdf';
    let bodyHtml = '';
    
    bodyHtml += _sectionHeader("1 COMPANY SNAPSHOT");
    bodyHtml += `<p style="font-size: 8pt; margin-bottom: 2mm;">${formatInlineMarkdown(data.snapshot || '')}</p>`;
    
    if (data.kpi_headers && data.kpi_values) {
        bodyHtml += _kpiTable(data.kpi_headers, data.kpi_values);
    }
    
    bodyHtml += _sectionHeader("2 CORE GROWTH TRIGGERS");
    if (data.triggers) {
        data.triggers.forEach((trig, i) => {
            bodyHtml += _triggerParagraph(i + 1, trig);
        });
    }
    
    bodyHtml += _sectionHeader("3 WHAT'S IN THE PRICE? / INCREMENTAL SURPRISE");
    bodyHtml += `<p style="font-size: 8pt; margin-bottom: 2mm;">${formatInlineMarkdown(data.in_the_price || '')}</p>`;
    
    bodyHtml += _sectionHeader("4 KEY RISKS");
    if (data.risks) {
        data.risks.forEach(r => {
            bodyHtml += `<p style="font-size: 8pt; margin-top: 1mm; margin-bottom: 1mm;">• ${formatInlineMarkdown(r)}</p>`;
        });
    }
    
    bodyHtml += _sectionHeader("5 TRIGGER SCOREBOARD");
    if (data.scoreboard) {
        bodyHtml += _scoreboardTable(data.scoreboard);
    }
    
    if (data.sources) {
        bodyHtml += `<p style="font-size: 7pt; color: #a0aec0; margin-top: 4mm;">${formatInlineMarkdown(data.sources)}</p>`;
    }
    
    const title = `${data.company_name || ''} (${data.ticker || ''}) — Growth Triggers 1-Pager`;
    const subtitle = `Institutional Equity | ${data.date || ''} | CMP ${data.cmp || ''} | Mkt Cap ${data.market_cap || ''} | ${data.cap_category || ''} | Sector: ${data.sector || ''}`;
    
    const htmlContent = wrapHtml(title, subtitle, bodyHtml);
    
    await renderPdf(htmlContent, outputPath, title);
    console.log(`✅ Growth Triggers PDF saved to: ${outputPath}`);
    return outputPath;
}

module.exports = { createGrowthTriggersPdf };
