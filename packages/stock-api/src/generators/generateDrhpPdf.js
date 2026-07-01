'use strict';

const { wrapHtml, markdownToHtml, renderPdf } = require('../utils/pdfRenderer');
const { INSTITUTIONAL_LIGHT, formatInlineMarkdown, styledTableHtml } = require('../utils/pdfUtils');

const VIEW_COLORS = {
    'SUBSCRIBE': INSTITUTIONAL_LIGHT.good,
    'SUBSCRIBE-FOR-LISTING-GAINS-ONLY': INSTITUTIONAL_LIGHT.warn,
    'WATCH-POST-LISTING': INSTITUTIONAL_LIGHT.warn,
    'AVOID': INSTITUTIONAL_LIGHT.bad,
};

function flagColor(rating) {
    if (rating === 'RED') return INSTITUTIONAL_LIGHT.bad;
    if (rating === 'YELLOW') return INSTITUTIONAL_LIGHT.warn;
    if (rating === 'GREEN') return INSTITUTIONAL_LIGHT.good;
    return INSTITUTIONAL_LIGHT.muted;
}

function flagLabel(rating) {
    if (rating === 'RED') return 'FAIL';
    if (rating === 'YELLOW') return 'WARN';
    if (rating === 'GREEN') return 'PASS';
    return rating;
}

function _verdictBox(view, rationale) {
    const v = (view || '').toUpperCase().trim();
    const color = VIEW_COLORS[v] || INSTITUTIONAL_LIGHT.muted;
    return `
    <table style="width: 100%; border: 1px solid ${color}; border-collapse: collapse; margin-bottom: 5mm;">
        <tr>
            <td style="background-color: ${color}; color: #ffffff; font-size: 18pt; font-weight: bold; text-align: center; padding: 10px;">
                ${v}
            </td>
        </tr>
        <tr>
            <td style="background-color: ${INSTITUTIONAL_LIGHT.tint}; padding: 12px; text-align: justify; font-size: 9pt;">
                ${markdownToHtml(rationale || '')}
            </td>
        </tr>
    </table>
    `;
}

function _issueSummaryTable(data) {
    const ofsPct = data.issue_size_cr ? ((data.ofs_cr || 0) / data.issue_size_cr * 100).toFixed(0) : 0;
    const rows = [
        ['Issue type', data.issue_type || '—', 'Filing date', data.filing_date || '—'],
        ['Issue size (Rs Cr)', String(data.issue_size_cr || '—'), 'Price band', data.price_band || '—'],
        ['Fresh issue (Rs Cr)', String(data.fresh_issue_cr || '—'), 'Lot size', String(data.lot_size || '—')],
        ['OFS (Rs Cr)', String(data.ofs_cr || '—'), 'OFS as % of issue', `${ofsPct}%`]
    ];
    
    // We can't directly use styledTableHtml since we want specific columns to be headers
    let html = `<table style="width: 100%; border-collapse: collapse; border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border}; font-size: 9pt; font-family: Helvetica, sans-serif; margin-bottom: 5mm;">`;
    
    rows.forEach(row => {
        html += `<tr>`;
        row.forEach((cell, i) => {
            if (i === 0 || i === 2) {
                html += `<td style="background-color: ${INSTITUTIONAL_LIGHT.primary}; color: #fff; font-weight: bold; border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border}; padding: 5px 8px;">${formatInlineMarkdown(cell)}</td>`;
            } else {
                html += `<td style="border: 0.5pt solid ${INSTITUTIONAL_LIGHT.border}; padding: 5px 8px;">${formatInlineMarkdown(cell)}</td>`;
            }
        });
        html += `</tr>`;
    });
    
    html += `</table>`;
    return html;
}

function _financialsTable(finData) {
    if (!finData) return '';
    const headers = ['Metric', ...(finData.headers || [])];
    const rows = [headers];
    for (const r of finData.rows || []) {
        rows.push([r.metric || '', ...(r.values || []).map(String)]);
    }
    return styledTableHtml(rows, INSTITUTIONAL_LIGHT);
}

function _redFlagsTable(redFlags) {
    if (!redFlags) return '';
    const headers = ['#', 'Red flag', 'Rating', 'Evidence', 'Page'];
    
    let html = `<table style="width: 100%; border-collapse: collapse; font-size: 7pt; font-family: Helvetica, sans-serif; border: 1px solid ${INSTITUTIONAL_LIGHT.border};">`;
    
    html += `<tr style="background-color: ${INSTITUTIONAL_LIGHT.primary}; color: #fff; font-weight: bold;">`;
    headers.forEach(h => html += `<th style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${h}</th>`);
    html += `</tr>`;
    
    redFlags.forEach((rf, idx) => {
        const bg = idx % 2 === 0 ? INSTITUTIONAL_LIGHT.alt_row || INSTITUTIONAL_LIGHT.tint : '#ffffff';
        html += `<tr style="background-color: ${bg}; color: ${INSTITUTIONAL_LIGHT.text};">`;
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${idx + 1}</td>`;
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown((rf.flag || '').substring(0, 50))}</td>`;
        
        const c = flagColor(rf.rating);
        const l = flagLabel(rf.rating);
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px; background-color: ${c}; color: #fff; font-weight: bold; text-align: center;">${l}</td>`;
        
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown((rf.evidence || '').substring(0, 60))}</td>`;
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown(rf.page || '')}</td>`;
        html += `</tr>`;
    });
    
    html += `</table>`;
    return html;
}

function _sectionBlock(section) {
    let html = `<h2>${formatInlineMarkdown(section.title || '')}</h2>`;
    if (section.body) {
        html += markdownToHtml(section.body);
    }
    if (section.evidence && section.evidence.length) {
        html += `<ul style="font-size: 8pt; color: ${INSTITUTIONAL_LIGHT.muted};">`;
        for (const e of section.evidence) {
            html += `<li>${formatInlineMarkdown(e)}</li>`;
        }
        html += `</ul>`;
    }
    return html;
}

async function createDrhpPdf(data) {
    const outputPath = data.output_path;
    
    let bodyHtml = '';
    
    bodyHtml += _issueSummaryTable(data);
    bodyHtml += _verdictBox(data.subscription_view, data.verdict_rationale);
    
    if (data.executive_summary) {
        bodyHtml += `<h2>Executive Summary</h2>`;
        bodyHtml += markdownToHtml(data.executive_summary);
    }
    
    if (data.sections && data.sections.length) {
        bodyHtml += `<div style="page-break-before: always;"></div>`;
        bodyHtml += `<div class="title">10-Section Synthesis</div>`;
        for (const s of data.sections) {
            bodyHtml += _sectionBlock(s);
        }
    }
    
    if (data.financial_table) {
        bodyHtml += `<div style="page-break-before: always;"></div>`;
        bodyHtml += `<div class="title">Financial Highlights (Restated)</div><br/>`;
        bodyHtml += _financialsTable(data.financial_table);
    }
    
    if (data.red_flags && data.red_flags.length) {
        bodyHtml += `<br/><br/>`;
        bodyHtml += `<div class="title">Red Flag Checklist</div><br/>`;
        bodyHtml += _redFlagsTable(data.red_flags);
    }
    
    if (data.peer_comparison_table || data.valuation_summary) {
        bodyHtml += `<div style="page-break-before: always;"></div>`;
        bodyHtml += `<div class="title">Peer Comparison & Valuation</div><br/>`;
        if (data.valuation_summary) {
            bodyHtml += markdownToHtml(data.valuation_summary);
        }
        if (data.peer_comparison_table) {
            bodyHtml += styledTableHtml(data.peer_comparison_table, INSTITUTIONAL_LIGHT);
        }
    }
    
    if (data.sources) {
        bodyHtml += `<h2>Sources</h2>`;
        bodyHtml += markdownToHtml(data.sources);
    }

    const title = `${data.company_name || ''} — DRHP / IPO Analysis`;
    const subtitle = `${data.issue_type || ''} • Filing ${data.filing_date || ''}`;
    const headerText = title;
    
    const htmlContent = wrapHtml(title, subtitle, bodyHtml);
    
    await renderPdf(htmlContent, outputPath, headerText);
    console.log(`✅ DRHP Report saved to: ${outputPath}`);
    return outputPath;
}

module.exports = { createDrhpPdf };
