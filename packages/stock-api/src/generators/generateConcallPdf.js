'use strict';

const { wrapHtml, markdownToHtml, renderPdf } = require('../utils/pdfRenderer');
const { INSTITUTIONAL_LIGHT, formatInlineMarkdown, styledTableHtml } = require('../utils/pdfUtils');

function flagColor(rating) {
    if (!rating) return INSTITUTIONAL_LIGHT.muted;
    const r = rating.toUpperCase();
    if (r.includes('RED') || r === 'MISSED' || r === 'DODGED' || r === 'NO') return INSTITUTIONAL_LIGHT.bad;
    if (r.includes('YELLOW') || r === 'MISSING' || r === 'TOO EARLY' || r === 'PARTIAL') return INSTITUTIONAL_LIGHT.warn;
    if (r.includes('GREEN') || r === 'DELIVERED' || r === 'ON TRACK' || r === 'BEAT' || r === 'YES' || r === 'ANSWERED') return INSTITUTIONAL_LIGHT.good;
    return INSTITUTIONAL_LIGHT.muted;
}

function flagLabel(rating) {
    if (!rating) return '';
    return rating.toUpperCase();
}

function _toneBox(tone) {
    let c = INSTITUTIONAL_LIGHT.muted;
    const t = (tone || '').toUpperCase().trim();
    if (t === 'BULLISH' || t === 'POSITIVE') c = INSTITUTIONAL_LIGHT.good;
    else if (t === 'NEUTRAL') c = INSTITUTIONAL_LIGHT.secondary;
    else if (t === 'CAUTIOUS' || t === 'DEFENSIVE') c = INSTITUTIONAL_LIGHT.warn;
    else if (t === 'NEGATIVE') c = INSTITUTIONAL_LIGHT.bad;
    
    return `
    <div style="background-color: ${c}; color: #ffffff; padding: 5px; font-weight: bold; text-align: center; width: 4cm; margin-bottom: 5mm; border-radius: 2px;">
        ${t || '—'}
    </div>
    `;
}

function _guidanceTable(rows) {
    if (!rows || !rows.length) return '';
    const headers = ['Metric', 'Guidance', 'Timeline', 'Confidence', 'Source quote'];
    let html = `<table style="width: 100%; border-collapse: collapse; font-size: 7pt; font-family: Helvetica, sans-serif; border: 1px solid ${INSTITUTIONAL_LIGHT.border};">`;
    html += `<tr style="background-color: ${INSTITUTIONAL_LIGHT.primary}; color: #fff; font-weight: bold;">`;
    headers.forEach(h => html += `<th style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${h}</th>`);
    html += `</tr>`;
    
    rows.forEach((r, idx) => {
        const bg = idx % 2 === 0 ? INSTITUTIONAL_LIGHT.tint : '#ffffff';
        html += `<tr style="background-color: ${bg}; color: ${INSTITUTIONAL_LIGHT.text};">`;
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown(r.metric || '')}</td>`;
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown(r.guidance || '')}</td>`;
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown(r.timeline || '')}</td>`;
        
        const conf = flagLabel(r.confidence);
        const c = flagColor(r.confidence);
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px; background-color: ${c}; color: #fff; font-weight: bold; text-align: center;">${conf}</td>`;
        
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown((r.source_quote || '').substring(0, 70))}</td>`;
        html += `</tr>`;
    });
    html += `</table>`;
    return html;
}

function _qaTable(rows) {
    if (!rows || !rows.length) return '';
    const headers = ['Analyst', 'Question (paraphrase)', 'Answered?', 'Note'];
    let html = `<table style="width: 100%; border-collapse: collapse; font-size: 7pt; font-family: Helvetica, sans-serif; border: 1px solid ${INSTITUTIONAL_LIGHT.border};">`;
    html += `<tr style="background-color: ${INSTITUTIONAL_LIGHT.primary}; color: #fff; font-weight: bold;">`;
    headers.forEach(h => html += `<th style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${h}</th>`);
    html += `</tr>`;
    
    rows.forEach((r, idx) => {
        const bg = idx % 2 === 0 ? INSTITUTIONAL_LIGHT.tint : '#ffffff';
        html += `<tr style="background-color: ${bg}; color: ${INSTITUTIONAL_LIGHT.text};">`;
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown(r.analyst || '')}<br/>${formatInlineMarkdown(r.firm || '')}</td>`;
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown((r.question || '').substring(0, 80))}</td>`;
        
        const stat = flagLabel(r.status);
        const c = flagColor(r.status);
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px; background-color: ${c}; color: #fff; font-weight: bold; text-align: center;">${stat}</td>`;
        
        html += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown((r.note || '').substring(0, 50))}</td>`;
        html += `</tr>`;
    });
    html += `</table>`;
    return html;
}

function _themeTrackerTable(themes, quarters) {
    if (!themes || !themes.length) return '';
    const headers = ['Theme', ...quarters, 'Trend'];
    const rows = [headers];
    themes.forEach(t => {
        const row = [t.theme || ''];
        quarters.forEach(q => row.push((t.stances && t.stances[q] ? String(t.stances[q]) : '').substring(0, 30)));
        row.push(flagLabel(t.trend));
        rows.push(row);
    });
    return styledTableHtml(rows, INSTITUTIONAL_LIGHT, { headerBg: INSTITUTIONAL_LIGHT.primary });
}

function _peerCompareTable(headers, rowsData) {
    if (!rowsData || !rowsData.length) return '';
    const rows = [headers, ...rowsData];
    return styledTableHtml(rows, INSTITUTIONAL_LIGHT, { headerBg: INSTITUTIONAL_LIGHT.primary });
}

function _renderDeep(data) {
    let html = '';
    const tone = data.tone_analysis ? data.tone_analysis.overall : null;
    html += _toneBox(tone);
    
    if (data.executive_summary) {
        html += `<h2>§1 Executive Summary</h2>`;
        html += markdownToHtml(data.executive_summary);
    }
    
    if (data.guidance_table && data.guidance_table.length) {
        html += `<h2>§4 Forward Guidance</h2>`;
        html += _guidanceTable(data.guidance_table);
    }
    
    const sections = data.sections || [];
    for (const section of sections) {
        html += `<h2>${formatInlineMarkdown(section.title || '')}</h2>`;
        html += markdownToHtml(section.body || '');
        if (section.quotes) {
            section.quotes.forEach(q => {
                html += `<div class="quote">"${formatInlineMarkdown(q)}"</div>`;
            });
        }
    }
    
    if (data.dodged_questions || (data.qa_table && data.qa_table.length)) {
        html += `<div style="page-break-before: always;"></div>`;
        html += `<h2>§8 Analyst Q&A</h2>`;
        if (data.qa_table && data.qa_table.length) {
            html += _qaTable(data.qa_table);
        }
    }
    
    if (data.quant_table && data.quant_table.length) {
        html += `<h2>§9 Quantitative Data</h2>`;
        const headers = ['Metric', 'Value', 'Source', 'Significance'];
        const rows = [headers];
        data.quant_table.forEach(r => {
            rows.push([r.metric || '', r.value || '', r.source || '', r.significance || '']);
        });
        html += styledTableHtml(rows, INSTITUTIONAL_LIGHT);
    }
    
    if (data.connecting_dots) {
        html += `<h2>§11 Connecting the Dots</h2>`;
        html += markdownToHtml(data.connecting_dots);
    }
    
    if (data.analysts_on_call && data.analysts_on_call.length) {
        html += `<h2>§12 Analysts on Call</h2>`;
        const txt = data.analysts_on_call.map(a => `${a.name || ''} (${a.firm || ''})`).join(', ');
        html += `<p>${formatInlineMarkdown(txt)}</p>`;
    }
    
    return html;
}

function _renderBrief(data) {
    let html = '';
    const tone = data.tone_analysis ? data.tone_analysis.overall : null;
    html += _toneBox(tone);
    
    const sectionTitles = [
        '§1 Management Commentary',
        '§2 Future Outlook & Guidance',
        '§3 Industry & Macro Trends',
        '§4 Competitive Landscape',
        '§5 Risks & Concerns',
        '§6 Growth Drivers & Strategic Initiatives',
        '§7 Product Mix & Portfolio',
        '§8 Financial Highlights',
        '§9 Sentiment Analysis',
    ];
    
    const sections = data.sections || [];
    for (let i = 0; i < sectionTitles.length; i++) {
        const body = i < sections.length ? sections[i] : null;
        if (!body) continue;
        
        html += `<h2>${sectionTitles[i]}</h2>`;
        if (typeof body === 'object') {
            html += markdownToHtml(body.body || '');
        } else {
            html += markdownToHtml(String(body));
        }
    }
    return html;
}

function _renderMultiQuarter(data) {
    let html = '';
    const quarters = data.quarters || [];
    if (data.executive_summary) {
        html += `<h2>Executive Summary</h2>`;
        html += markdownToHtml(data.executive_summary);
    }
    if (data.themes && data.themes.length) {
        html += `<h2>Theme Tracker</h2>`;
        html += _themeTrackerTable(data.themes, quarters);
    }
    
    if (data.promises && data.promises.length) {
        html += `<h2>Promises Made & Outcomes</h2>`;
        let phtml = `<table style="width: 100%; border-collapse: collapse; font-size: 7pt; font-family: Helvetica, sans-serif; border: 1px solid ${INSTITUTIONAL_LIGHT.border};">`;
        phtml += `<tr style="background-color: ${INSTITUTIONAL_LIGHT.primary}; color: #fff; font-weight: bold;">
            <th style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">Quarter</th>
            <th style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">Promise</th>
            <th style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">Due / Outcome</th>
            <th style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">Status</th>
        </tr>`;
        data.promises.forEach((p, idx) => {
            const bg = idx % 2 === 0 ? INSTITUTIONAL_LIGHT.tint : '#ffffff';
            phtml += `<tr style="background-color: ${bg}; color: ${INSTITUTIONAL_LIGHT.text};">`;
            phtml += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown(p.quarter || '')}</td>`;
            phtml += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown((p.promise || '').substring(0, 60))}</td>`;
            phtml += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px;">${formatInlineMarkdown((p.outcome || '').substring(0, 50))}</td>`;
            
            const stat = flagLabel(p.status);
            const c = flagColor(p.status);
            phtml += `<td style="border: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding: 4px; background-color: ${c}; color: #fff; font-weight: bold; text-align: center;">${stat}</td>`;
            phtml += `</tr>`;
        });
        phtml += `</table>`;
        html += phtml;
    }
    
    if (data.dropped_topics && data.dropped_topics.length) {
        html += `<h2>Topics Dropped or Muted</h2>`;
        const headers = ['Topic', 'First mentioned', 'Last mentioned', 'Reason given'];
        const rows = [headers];
        data.dropped_topics.forEach(t => {
            rows.push([t.topic || '', t.first || '', t.last || '', (t.reason || '—').substring(0, 40)]);
        });
        html += styledTableHtml(rows, INSTITUTIONAL_LIGHT, { headerBg: INSTITUTIONAL_LIGHT.primary });
    }
    
    if (data.confidence_counter && data.confidence_counter.length) {
        html += `<h2>Confidence-Language Counter</h2>`;
        const headers = ['Quarter', '"We will"', '"Target is"', '"We expect"', '"Likely to"', '"May" / "Aspire"'];
        const rows = [headers];
        data.confidence_counter.forEach(c => {
            rows.push([
                c.quarter || '',
                String(c.we_will || ''),
                String(c.target_is || ''),
                String(c.we_expect || ''),
                String(c.likely_to || ''),
                String(c.may_aspire || '')
            ]);
        });
        html += styledTableHtml(rows, INSTITUTIONAL_LIGHT, { headerBg: INSTITUTIONAL_LIGHT.primary });
    }
    return html;
}

function _renderMultiPeer(data) {
    let html = '';
    if (data.executive_summary) {
        html += `<h2>Sector Summary</h2>`;
        html += markdownToHtml(data.executive_summary);
    }
    const tables = data.comparison_tables || [];
    for (const tbl of tables) {
        html += `<h2>${formatInlineMarkdown(tbl.title || 'Comparison')}</h2>`;
        html += _peerCompareTable(tbl.headers || [], tbl.rows || []);
    }
    if (data.synthesis && data.synthesis.length) {
        html += `<h2>Synthesis</h2>`;
        for (const para of data.synthesis) {
            html += markdownToHtml(para);
        }
    }
    return html;
}

async function createConcallPdf(data) {
    const outputPath = data.output_path;
    const mode = data.mode || 'brief';
    
    let titleLabel = '';
    let subLabel = '';
    
    if (mode === 'deep') {
        titleLabel = `${data.company_name || ''} — Concall Deep Dive`;
        subLabel = `${data.ticker || ''} • ${data.quarter || ''} • ${data.date || ''}`;
    } else if (mode === 'brief') {
        titleLabel = `${data.company_name || ''} — Concall Brief`;
        subLabel = `${data.ticker || ''} • ${data.quarter || ''} • ${data.date || ''}`;
    } else if (mode === 'multi-quarter') {
        titleLabel = `${data.company_name || ''} — Multi-Quarter Concall Tracker`;
        const qs = data.quarters || [];
        if (qs.length) {
            subLabel = `${data.ticker || ''} • ${qs[0]}–${qs[qs.length-1]} • ${data.date || ''}`;
        }
    } else if (mode === 'multi-peer') {
        titleLabel = `${data.sector || 'Sector'} — Peer Concall Comparison`;
        const peers = data.peers || [];
        subLabel = `${data.quarter || ''} • ${peers.length} companies • ${data.date || ''}`;
    } else {
        titleLabel = `Unknown mode: ${mode}`;
    }

    let bodyHtml = '';
    
    if (data.kpi_headers && data.kpi_values) {
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
    
    if (mode === 'deep') {
        bodyHtml += _renderDeep(data);
    } else if (mode === 'brief') {
        bodyHtml += _renderBrief(data);
    } else if (mode === 'multi-quarter') {
        bodyHtml += _renderMultiQuarter(data);
    } else if (mode === 'multi-peer') {
        bodyHtml += _renderMultiPeer(data);
    } else {
        bodyHtml += `<p>Unknown mode: ${mode}</p>`;
    }
    
    if (data.sources) {
        bodyHtml += `<h2>Sources</h2>`;
        bodyHtml += markdownToHtml(data.sources);
    }
    
    const htmlContent = wrapHtml(titleLabel, subLabel, bodyHtml);
    
    await renderPdf(htmlContent, outputPath, titleLabel);
    console.log(`✅ Concall Report saved to: ${outputPath}`);
    return outputPath;
}

module.exports = { createConcallPdf };
