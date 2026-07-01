'use strict';

const { wrapHtml, markdownToHtml, renderPdf } = require('../utils/pdfRenderer');
const { INSTITUTIONAL_LIGHT, formatInlineMarkdown, styledTableHtml } = require('../utils/pdfUtils');

function _companyStrip(companies) {
    if (!companies || !companies.length) return '';
    const n = companies.length;
    let html = `<table style="width: 100%; border-collapse: collapse; margin-bottom: 5mm; border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border};"><tr>`;
    
    companies.forEach((c, idx) => {
        html += `<td style="width: ${100/n}%; background-color: ${INSTITUTIONAL_LIGHT.tint}; border-left: ${idx === 0 ? '0' : '0.5pt solid ' + INSTITUTIONAL_LIGHT.border}; padding: 8px 10px; vertical-align: top;">`;
        html += `<b style="font-size: 9pt;">${formatInlineMarkdown(c.name || '')}</b><br/>`;
        html += `<span style="font-size: 8pt; color: ${INSTITUTIONAL_LIGHT.muted};">`;
        html += `${c.ticker || ''} • CMP ${c.cmp || ''} • MCap Rs ${c.market_cap_cr || '—'} Cr`;
        html += `</span></td>`;
    });
    
    html += `</tr></table>`;
    return html;
}

function _dimensionTable(dimension, companies) {
    const metrics = dimension.metrics || [];
    const values = dimension.values || [];
    const headers = ['Metric', ...companies.map(c => c.name || '')];
    
    const rows = [headers];
    for (let i = 0; i < metrics.length; i++) {
        const row = [metrics[i]];
        if (i < values.length) {
            row.push(...values[i]);
        } else {
            row.push(...Array(companies.length).fill('—'));
        }
        rows.push(row);
    }
    
    return styledTableHtml(rows, INSTITUTIONAL_LIGHT, { headerBg: INSTITUTIONAL_LIGHT.primary });
}

function _dimensionBlock(dimension, companies) {
    let html = `<h2>${formatInlineMarkdown(dimension.name || '')}</h2>`;
    html += _dimensionTable(dimension, companies);
    html += `<p style="margin-top: 4px;"><b>Winner:</b> <span style="color: ${INSTITUTIONAL_LIGHT.good}; font-weight: bold;">${formatInlineMarkdown(dimension.winner || '—')}</span></p>`;
    
    if (dimension.winner_rationale) {
        html += `<p><i>Why:</i> ${formatInlineMarkdown(dimension.winner_rationale)}</p>`;
    }
    if (dimension.risk_flag) {
        html += `<p><b><span style="color: ${INSTITUTIONAL_LIGHT.bad};">Risk:</span></b> ${formatInlineMarkdown(dimension.risk_flag)}</p>`;
    }
    html += `<br/>`;
    return html;
}

function _verdictSection(verdict) {
    let html = `<div style="page-break-before: always;"></div>`;
    html += `<div class="title">Verdict</div><br/>`;
    
    const rows = [
        ['Best business', verdict.best_business || '—'],
        ['Most attractively priced', verdict.best_priced || '—'],
        ['Same company?', verdict.relative_value_setup || '—'],
        ['Preferred pick', verdict.preferred_pick || '—'],
        ['Key catalyst (12 mo)', verdict.key_catalyst || '—'],
        ['Biggest risk', verdict.biggest_risk || '—'],
    ];
    
    let tableHtml = `<table style="width: 100%; border-collapse: collapse; font-size: 9pt; font-family: Helvetica, sans-serif; border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border};">`;
    rows.forEach((r, idx) => {
        tableHtml += `<tr>`;
        tableHtml += `<td style="width: 5cm; background-color: ${INSTITUTIONAL_LIGHT.primary}; color: #fff; font-weight: bold; border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border}; padding: 6px 8px; vertical-align: top;">${formatInlineMarkdown(r[0])}</td>`;
        tableHtml += `<td style="background-color: ${INSTITUTIONAL_LIGHT.tint}; border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border}; padding: 6px 8px; vertical-align: top;">${formatInlineMarkdown(r[1])}</td>`;
        tableHtml += `</tr>`;
    });
    tableHtml += `</table>`;
    
    html += tableHtml;
    return html;
}

function getPeerSchema(data) {
    return {
        title: data.title,
        companies: (data.companies || []).map(c => c.name),
        verdict: data.verdict,
        dimension_winners: (data.dimensions || []).map(d => ({ dimension: d.name, winner: d.winner }))
    };
}

async function createPeerComparisonPdf(data) {
    const outputPath = data.output_path;
    let bodyHtml = '';
    
    if (data.companies) {
        bodyHtml += _companyStrip(data.companies);
    }
    
    if (data.executive_summary) {
        bodyHtml += `<h2>Executive Summary</h2>`;
        bodyHtml += markdownToHtml(data.executive_summary);
        bodyHtml += `<br/>`;
    }
    
    if (data.dimensions) {
        for (const dim of data.dimensions) {
            bodyHtml += _dimensionBlock(dim, data.companies || []);
        }
    }
    
    if (data.verdict) {
        bodyHtml += _verdictSection(data.verdict);
    }
    
    if (data.sources) {
        bodyHtml += `<br/><br/><h2>Sources</h2>`;
        bodyHtml += markdownToHtml(data.sources);
    }
    
    const title = data.title || 'Peer Comparison';
    const subtitle = data.date || '';
    const headerText = title;
    
    const htmlContent = wrapHtml(title, subtitle, bodyHtml);
    
    await renderPdf(htmlContent, outputPath, headerText);
    console.log(`✅ Peer Comparison saved to: ${outputPath}`);
    return outputPath;
}

module.exports = { createPeerComparisonPdf, getPeerSchema };
