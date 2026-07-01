'use strict';

const { wrapHtml, markdownToHtml, renderPdf } = require('../utils/pdfRenderer');
const { INSTITUTIONAL_LIGHT, formatInlineMarkdown, styledTableHtml } = require('../utils/pdfUtils');

function flagColor(rating) {
    if (!rating) return INSTITUTIONAL_LIGHT.muted;
    const r = rating.toUpperCase();
    if (r.includes('RED') || r === 'MATCH' || r === 'YES') return INSTITUTIONAL_LIGHT.bad;
    if (r.includes('YELLOW') || r === 'PARTIAL' || r === 'PARTIAL MATCH') return INSTITUTIONAL_LIGHT.warn;
    if (r.includes('GREEN') || r === 'NO MATCH' || r === 'NO' || r === 'N/A') return INSTITUTIONAL_LIGHT.good;
    return INSTITUTIONAL_LIGHT.muted;
}

function flagLabel(rating) {
    if (!rating) return '';
    return rating.toUpperCase();
}

function _ratingBox(rating, rationale) {
    const c = flagColor(rating);
    return `
    <table style="width: 100%; border: 1px solid ${c}; border-collapse: collapse; margin-bottom: 5mm;">
        <tr>
            <td style="background-color: ${c}; color: #ffffff; font-size: 22pt; font-weight: bold; text-align: center; padding: 10px;">
                ${rating}
            </td>
        </tr>
        <tr>
            <td style="padding: 12px; text-align: justify; font-size: 9pt;">
                ${markdownToHtml(rationale || '')}
            </td>
        </tr>
    </table>
    `;
}

function _checklistTable(items) {
    if (!items || !items.length) return '';
    const headers = ['#', 'Area', 'Flag', 'Evidence', 'Page'];
    let html = `<table style="width: 100%; border-collapse: collapse; font-size: 7pt; font-family: Helvetica, sans-serif; border: 1px solid ${INSTITUTIONAL_LIGHT.border};">`;
    
    html += `<tr style="background-color: ${INSTITUTIONAL_LIGHT.primary}; color: #fff; font-weight: bold;">`;
    headers.forEach(h => html += `<th style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${h}</th>`);
    html += `</tr>`;
    
    items.forEach((item, idx) => {
        const bg = idx % 2 === 0 ? INSTITUTIONAL_LIGHT.alt_row || INSTITUTIONAL_LIGHT.tint : '#ffffff';
        html += `<tr style="background-color: ${bg}; color: ${INSTITUTIONAL_LIGHT.text};">`;
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${idx + 1}</td>`;
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown((item.area || ''))}</td>`;
        
        const c = flagColor(item.flag);
        const l = flagLabel(item.flag);
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px; background-color: ${c}; color: #fff; font-weight: bold; text-align: center;">${l}</td>`;
        
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown((item.evidence || '').substring(0, 80))}</td>`;
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown(item.page || '')}</td>`;
        html += `</tr>`;
    });
    
    html += `</table>`;
    return html;
}

function _sectionBlock(section) {
    const flag = flagLabel(section.flag);
    const flagC = flagColor(flag);
    let html = `<h2>${formatInlineMarkdown(section.title || '')} &nbsp; <span style="color: ${flagC}; font-weight: bold;">[${flag}]</span></h2>`;
    if (section.body) {
        html += markdownToHtml(section.body);
    }
    if (section.evidence && section.evidence.length) {
        html += `<p><b>Evidence:</b></p><ul style="font-size: 8pt; color: ${INSTITUTIONAL_LIGHT.muted};">`;
        for (const e of section.evidence) {
            html += `<li>${formatInlineMarkdown(e)}</li>`;
        }
        html += `</ul>`;
    }
    return html;
}

function _piotroskiTable(piotroski) {
    if (!piotroski) return '';
    const headers = ['#', 'Component', 'Metric', 'FY Curr', 'FY Prior', 'Score'];
    const rows = [headers];
    const comps = piotroski.components || [];
    for (let i = 0; i < comps.length; i++) {
        const c = comps[i];
        rows.push([String(i + 1), c.name || '', c.metric || '', c.fy_curr || '', c.fy_prior || '', String(c.score || 0)]);
    }
    
    const score = piotroski.score || 0;
    
    let html = `<table style="width: 100%; border-collapse: collapse; font-size: 7pt; font-family: Helvetica, sans-serif; border: 1px solid ${INSTITUTIONAL_LIGHT.border};">`;
    rows.forEach((row, rowIndex) => {
        const isHeader = rowIndex === 0;
        const bg = isHeader ? INSTITUTIONAL_LIGHT.primary : (rowIndex % 2 === 0 ? INSTITUTIONAL_LIGHT.tint : '#ffffff');
        const color = isHeader ? '#ffffff' : INSTITUTIONAL_LIGHT.text;
        const fw = isHeader ? 'bold' : 'normal';
        html += `<tr style="background-color: ${bg}; color: ${color}; font-weight: ${fw};">`;
        row.forEach(cell => {
            html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown(cell)}</td>`;
        });
        html += `</tr>`;
    });
    
    let scoreColor = INSTITUTIONAL_LIGHT.bad;
    if (score >= 7) scoreColor = INSTITUTIONAL_LIGHT.good;
    else if (score >= 4) scoreColor = INSTITUTIONAL_LIGHT.warn;
    
    html += `<tr style="background-color: ${INSTITUTIONAL_LIGHT.tint}; font-weight: bold;">
        <td colspan="5" style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">TOTAL</td>
        <td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px; color: ${scoreColor};">${score}</td>
    </tr></table>`;
    return html;
}

function _dupontTable(dupont) {
    if (!dupont || !dupont.rows) return '';
    const headers = ['Year', 'ROE', 'NPM', 'AT', 'EM', 'Driver of change'];
    const rows = [headers];
    for (const r of dupont.rows) {
        rows.push([r.year || '', r.roe || '', r.npm || '', r.at || '', r.em || '', (r.driver || '').substring(0, 40)]);
    }
    return styledTableHtml(rows, INSTITUTIONAL_LIGHT, { headerBg: INSTITUTIONAL_LIGHT.primary });
}

function _fraudPatternTable(items) {
    if (!items || !items.length) return '';
    const headers = ['Pattern', 'Match', 'Evidence'];
    let html = `<table style="width: 100%; border-collapse: collapse; font-size: 7pt; font-family: Helvetica, sans-serif; border: 1px solid ${INSTITUTIONAL_LIGHT.border};">`;
    html += `<tr style="background-color: ${INSTITUTIONAL_LIGHT.primary}; color: #fff; font-weight: bold;">`;
    headers.forEach(h => html += `<th style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${h}</th>`);
    html += `</tr>`;
    
    items.forEach((it, idx) => {
        const bg = idx % 2 === 0 ? INSTITUTIONAL_LIGHT.tint : '#ffffff';
        html += `<tr style="background-color: ${bg}; color: ${INSTITUTIONAL_LIGHT.text};">`;
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown(it.pattern || '')}</td>`;
        
        const m = flagLabel(it.match);
        const c = flagColor(it.match);
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px; background-color: ${c}; color: #fff; font-weight: bold; text-align: center;">${m}</td>`;
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown((it.evidence || '').substring(0, 90))}</td>`;
        html += `</tr>`;
    });
    
    html += `</table>`;
    return html;
}

function getForensicSchema(data) {
    return {
        company_name: data.company_name,
        ticker: data.ticker,
        overall_rating: data.overall_rating,
        rating_rationale: data.rating_rationale,
        checklist: data.checklist || [],
        sections_summary: (data.sections || []).map(s => ({ title: s.title, flag: s.flag })),
        piotroski_score: data.piotroski ? data.piotroski.score : null,
        dupont_summary: data.dupont ? data.dupont.interpretation : null,
        fraud_patterns_matched: (data.fraud_pattern_check || []).filter(it => {
            const m = (it.match || '').toUpperCase();
            return m === 'MATCH' || m === 'YES' || m === 'PARTIAL' || m === 'PARTIAL MATCH';
        })
    };
}

async function createForensicPdf(data) {
    const outputPath = data.output_path;
    let bodyHtml = '';
    
    if (data.snapshot) {
        bodyHtml += markdownToHtml(data.snapshot);
    }
    
    if (data.kpi_headers && data.kpi_values) {
        // Build generic KPI table
        bodyHtml += `<table style="width: 100%; border-collapse: collapse; font-size: 8pt; margin-bottom: 5mm; border: 1px solid ${INSTITUTIONAL_LIGHT.border};"><tr>`;
        data.kpi_headers.forEach(h => {
            bodyHtml += `<th style="background-color: ${INSTITUTIONAL_LIGHT.primary}; color: #fff; padding: 4px; border: 1px solid ${INSTITUTIONAL_LIGHT.border};">${h}</th>`;
        });
        bodyHtml += `</tr><tr>`;
        data.kpi_values.forEach(v => {
            bodyHtml += `<td style="padding: 4px; border: 1px solid ${INSTITUTIONAL_LIGHT.border}; text-align: center;">${v}</td>`;
        });
        bodyHtml += `</tr></table>`;
    }
    
    bodyHtml += _ratingBox(data.overall_rating, data.rating_rationale);
    
    if (data.checklist && data.checklist.length) {
        bodyHtml += `<h2>§1 — Green / Yellow / Red Checklist</h2>`;
        bodyHtml += _checklistTable(data.checklist);
    }
    
    if (data.sections && data.sections.length) {
        bodyHtml += `<div style="page-break-before: always;"></div>`;
        bodyHtml += `<div class="title">Forensic Sections</div>`;
        for (const s of data.sections) {
            bodyHtml += _sectionBlock(s);
        }
    }
    
    if (data.piotroski) {
        bodyHtml += `<div style="page-break-before: always;"></div>`;
        bodyHtml += `<div class="title">Piotroski F-Score</div>`;
        bodyHtml += _piotroskiTable(data.piotroski);
        if (data.piotroski.interpretation) {
            bodyHtml += markdownToHtml(data.piotroski.interpretation);
        }
    }
    
    if (data.dupont) {
        bodyHtml += `<h2>DuPont Decomposition</h2>`;
        bodyHtml += _dupontTable(data.dupont);
        if (data.dupont.interpretation) {
            bodyHtml += markdownToHtml(data.dupont.interpretation);
        }
    }
    
    if (data.fraud_pattern_check && data.fraud_pattern_check.length) {
        bodyHtml += `<h2>Documented Fraud Pattern Match</h2>`;
        bodyHtml += _fraudPatternTable(data.fraud_pattern_check);
    }
    
    if (data.sources) {
        bodyHtml += `<h2>Sources</h2>`;
        bodyHtml += markdownToHtml(data.sources);
    }
    
    const title = `${data.company_name || ''} — Forensic Accounting Review`;
    const subtitle = `${data.ticker || ''} • ${data.date || ''} • Period: ${data.fy_range || ''}`;
    const headerText = title;
    
    const htmlContent = wrapHtml(title, subtitle, bodyHtml);
    
    await renderPdf(htmlContent, outputPath, headerText);
    console.log(`✅ Forensic Report saved to: ${outputPath}`);
    return outputPath;
}

module.exports = { createForensicPdf, getForensicSchema };
