'use strict';

const fs = require('fs');
const path = require('path');

const _CSS = `
:root {
    --primary: #1a365d;
    --secondary: #2b6cb0;
    --tint: #ebf8ff;
    --good: #276749;
    --warn: #c05621;
    --bad: #9b2c2c;
    --muted: #4a5568;
    --surface: #f7fafc;
    --border: #e2e8f0;
    --text: #1a202c;
    --bg: #ffffff;
    --row-alt: #f7fafc;
}
[data-theme="dark"] {
    --primary: #4299e1;
    --secondary: #63b3ed;
    --tint: #1a365d;
    --good: #48bb78;
    --warn: #ed8936;
    --bad: #f56565;
    --muted: #a0aec0;
    --surface: #1a202c;
    --border: #2d3748;
    --text: #e2e8f0;
    --bg: #171923;
    --row-alt: #1a202c;
}

* { box-sizing: border-box; }
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text);
    background: var(--bg);
    margin: 0;
    padding: 16px;
}
.container { max-width: 1180px; margin: 0 auto; }

/* Header */
.report-header { border-bottom: 2px solid var(--primary); padding-bottom: 8px; margin-bottom: 12px; }
.report-title { font-size: 22px; font-weight: 700; color: var(--primary); margin: 0 0 4px 0; }
.report-meta { font-size: 11px; color: var(--muted); }
.classification-banner {
    background: var(--primary); color: white; padding: 6px 12px;
    border-radius: 3px; font-size: 11px; margin: 8px 0;
    text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;
}

/* Verification block (Part 0) — always visible at top */
.verification-block {
    background: var(--surface); border: 1px solid var(--border);
    border-left: 4px solid var(--primary);
    padding: 12px 16px; margin: 12px 0; border-radius: 3px;
}
.verification-block h3 {
    margin: 0 0 8px 0; font-size: 13px; color: var(--primary);
    text-transform: uppercase; letter-spacing: 0.5px;
}
.verification-grid {
    display: grid; grid-template-columns: 180px 1fr; gap: 4px 12px;
    font-size: 12px;
}
.verification-grid .label { color: var(--muted); font-weight: 600; }
.verification-grid .value { color: var(--text); }

/* KPI strip */
.kpi-strip {
    display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px;
    margin: 12px 0;
}
.kpi {
    background: var(--surface); border: 1px solid var(--border);
    padding: 8px 10px; border-radius: 3px; text-align: center;
}
.kpi-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.4px; }
.kpi-value { font-size: 18px; font-weight: 700; color: var(--primary); margin-top: 2px; }
.kpi-sub { font-size: 10px; color: var(--muted); margin-top: 2px; }

/* HHI badge color-coding */
.hhi-badge {
    display: inline-block; padding: 2px 8px; border-radius: 10px;
    font-size: 11px; font-weight: 600; text-transform: uppercase;
}
.hhi-fragmented { background: #c6f6d5; color: #22543d; }
.hhi-moderate { background: #feebc8; color: #7b341e; }
.hhi-high { background: #fed7d7; color: #742a2a; }
.hhi-monopoly { background: #2d3748; color: #fafafa; }

.confidence-badge {
    display: inline-block; padding: 1px 8px; border-radius: 10px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.4px;
}
.confidence-HIGH { background: #c6f6d5; color: #22543d; }
.confidence-MEDIUM { background: #feebc8; color: #7b341e; }
.confidence-LOW { background: #fed7d7; color: #742a2a; }

/* Section headers */
h2.section-title {
    font-size: 15px; color: var(--primary); margin: 22px 0 8px 0;
    padding-bottom: 4px; border-bottom: 1px solid var(--border);
    font-weight: 700;
}
.section-intro { color: var(--muted); font-size: 12px; margin-bottom: 8px; }

/* Sortable tables */
table.report-table {
    width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0;
}
table.report-table th {
    background: var(--primary); color: white; padding: 6px 8px;
    text-align: left; font-weight: 600; font-size: 11px;
    border: 1px solid var(--primary); cursor: pointer; user-select: none;
    text-transform: uppercase; letter-spacing: 0.3px;
}
table.report-table th.sortable:hover { background: var(--secondary); }
table.report-table th .sort-indicator { float: right; opacity: 0.6; font-size: 9px; }
table.report-table td {
    padding: 5px 8px; border: 1px solid var(--border);
    vertical-align: top;
}
table.report-table tr:nth-child(even) td { background: var(--row-alt); }
table.report-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
table.report-table td.center { text-align: center; }

/* Source tags */
.tag {
    display: inline-block; padding: 1px 5px; border-radius: 3px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.5px;
}
.tag-R { background: #c6f6d5; color: #22543d; }
.tag-D { background: #bee3f8; color: #2a4365; }
.tag-D-segment { background: #b2f5ea; color: #234e52; }
.tag-E { background: #feebc8; color: #7b341e; }
.tag-E-floor { background: #fbd38d; color: #7b341e; }
.tag-D-stale { background: #fed7d7; color: #742a2a; }

/* Delta bps coloring */
.delta-pos { color: var(--good); font-weight: 600; }
.delta-neg { color: var(--bad); font-weight: 600; }
.delta-zero { color: var(--muted); }

/* Moat heatmap */
.moat-cell {
    text-align: center; font-weight: 700; color: white;
    padding: 8px 4px; min-width: 50px;
}
.moat-5 { background: #276749; }
.moat-4 { background: #48bb78; }
.moat-3 { background: #ecc94b; color: #1a202c; }
.moat-2 { background: #ed8936; }
.moat-1 { background: #c53030; }
.moat-cell .evidence {
    font-size: 9px; font-weight: 400; color: rgba(255,255,255,0.85);
    margin-top: 2px; line-height: 1.2;
}
.moat-3 .evidence { color: rgba(0,0,0,0.7); }

/* Probability x impact for disruption */
.prob-impact-cell {
    padding: 2px 6px; border-radius: 3px; font-weight: 700; font-size: 11px;
    display: inline-block;
}
.pi-low { background: #c6f6d5; color: #22543d; }
.pi-med { background: #feebc8; color: #7b341e; }
.pi-high { background: #fed7d7; color: #742a2a; }

/* Asymmetric flag */
.asymmetric-flag {
    background: var(--secondary); color: white;
    padding: 2px 6px; border-radius: 3px; font-weight: 700;
    font-size: 10px; letter-spacing: 0.4px;
}

/* Chart containers */
.chart-container { background: var(--surface); padding: 12px;
    border: 1px solid var(--border); border-radius: 3px; margin: 8px 0; }
.chart-container canvas { max-height: 240px; }

/* Analyst view */
.analyst-view {
    background: var(--tint); border-left: 4px solid var(--secondary);
    padding: 12px 16px; margin: 12px 0; border-radius: 3px;
    font-size: 12.5px; line-height: 1.55;
}
.analyst-view::before {
    content: "[ANALYST VIEW]"; display: block; font-size: 10px;
    color: var(--secondary); font-weight: 700; letter-spacing: 1px;
    margin-bottom: 6px;
}

/* Source list */
.source-list { font-size: 11px; color: var(--muted); }
.source-list li { margin: 2px 0; }

/* Footer / disclaimer */
.disclaimer {
    margin-top: 24px; padding-top: 12px; border-top: 1px solid var(--border);
    font-size: 10px; color: var(--muted); font-style: italic; line-height: 1.4;
}

/* Theme toggle */
.theme-toggle {
    position: fixed; top: 16px; right: 16px;
    background: var(--surface); border: 1px solid var(--border);
    padding: 6px 12px; cursor: pointer; border-radius: 3px;
    font-size: 11px; color: var(--text);
}

@media (max-width: 720px) {
    .kpi-strip { grid-template-columns: repeat(2, 1fr); }
    .verification-grid { grid-template-columns: 1fr; }
    table.report-table { font-size: 11px; }
    table.report-table th, table.report-table td { padding: 4px 6px; }
}
`;

const _JS = `
function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme') || 'light';
    html.setAttribute('data-theme', current === 'light' ? 'dark' : 'light');
}

function sortTable(tableId, colIdx, isNumeric) {
    const tbl = document.getElementById(tableId);
    if (!tbl) return;
    const tbody = tbl.tBodies[0];
    const rows = Array.from(tbody.rows);
    const th = tbl.tHead.rows[0].cells[colIdx];
    const currentDir = th.getAttribute('data-sort') || 'none';
    const newDir = currentDir === 'asc' ? 'desc' : 'asc';
    Array.from(tbl.tHead.rows[0].cells).forEach(h => {
        h.setAttribute('data-sort', 'none');
        const ind = h.querySelector('.sort-indicator');
        if (ind) ind.textContent = '';
    });
    th.setAttribute('data-sort', newDir);
    const ind = th.querySelector('.sort-indicator');
    if (ind) ind.textContent = newDir === 'asc' ? '▲' : '▼';
    rows.sort((a, b) => {
        const av = (a.cells[colIdx] || {}).textContent || '';
        const bv = (b.cells[colIdx] || {}).textContent || '';
        if (isNumeric) {
            const af = parseFloat(av.replace(/[^0-9.\\-]/g, '')) || 0;
            const bf = parseFloat(bv.replace(/[^0-9.\\-]/g, '')) || 0;
            return newDir === 'asc' ? af - bf : bf - af;
        }
        return newDir === 'asc'
            ? av.localeCompare(bv)
            : bv.localeCompare(av);
    });
    rows.forEach(r => tbody.appendChild(r));
}

function renderHistoricalChart(historical) {
    const ctx = document.getElementById('historical-chart');
    if (!ctx || !historical || historical.length === 0) return;
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: historical.map(h => h.year),
            datasets: [{
                label: 'Industry Size',
                data: historical.map(h => h.size_cr),
                backgroundColor: '#2b6cb0',
                borderColor: '#1a365d',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: {
                    label: (c) => \`\${c.parsed.y.toLocaleString('en-IN')} (YoY \${historical[c.dataIndex].yoy != null ? historical[c.dataIndex].yoy + '%' : '-'})\`
                }}
            },
            scales: {
                y: { beginAtZero: true, title: { display: true, text: 'Size' } }
            }
        }
    });
}

function renderProjectionChart(projection) {
    const ctx = document.getElementById('projection-chart');
    if (!ctx || !projection || projection.length === 0) return;
    const top10 = projection.slice(0, 10);
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top10.map(p => p.player),
            datasets: [
                { label: 'Bear', data: top10.map(p => p.bear.share), backgroundColor: '#9b2c2c' },
                { label: 'Base', data: top10.map(p => p.base.share), backgroundColor: '#2b6cb0' },
                { label: 'Bull', data: top10.map(p => p.bull.share), backgroundColor: '#276749' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { ticks: { maxRotation: 45, minRotation: 30 } },
                y: { beginAtZero: true, title: { display: true, text: 'Share %' } }
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    if (typeof EMBEDDED_DATA !== 'undefined') {
        if (EMBEDDED_DATA.sizing && EMBEDDED_DATA.sizing.historical) {
            renderHistoricalChart(EMBEDDED_DATA.sizing.historical);
        }
        if (EMBEDDED_DATA.projection) {
            renderProjectionChart(EMBEDDED_DATA.projection);
        }
    }
});
`;

function escapeHtml(unsafe) {
    if (unsafe == null) return "---------";
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function fmtNum(value, decimals = 1, unit = "") {
    if (value == null || value === "") return "---------";
    let f = parseFloat(value);
    if (isNaN(f)) return escapeHtml(value);
    
    let s = decimals === 0 
        ? Math.round(f).toLocaleString('en-US') 
        : f.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return `${s}${unit}`;
}

function fmtDeltaBps(bps) {
    if (bps == null) return '<span class="delta-zero">---</span>';
    let f = parseFloat(bps);
    if (isNaN(f)) return escapeHtml(bps);
    
    if (f > 0) return `<span class="delta-pos">+${Math.round(f).toLocaleString('en-US')}</span>`;
    if (f < 0) return `<span class="delta-neg">${Math.round(f).toLocaleString('en-US')}</span>`;
    return '<span class="delta-zero">0</span>';
}

function _sourceTag(tag) {
    if (!tag) return "";
    let safe = escapeHtml(String(tag));
    let cssClass = "tag-" + safe.replace(/-/g, "-");
    return `<span class="tag ${cssClass}">${safe}</span>`;
}

function _hhiBadge(hhiValue, classification) {
    if (hhiValue == null) return "";
    let cls = "hhi-monopoly";
    if (classification === "Competitive/Fragmented") cls = "hhi-fragmented";
    else if (classification === "Moderately Concentrated") cls = "hhi-moderate";
    else if (classification === "Highly Concentrated") cls = "hhi-high";
    
    return `<span class="hhi-badge ${cls}">${escapeHtml(classification)}</span>`;
}

function _confidenceBadge(level) {
    let levelStr = (level || "MEDIUM").toUpperCase();
    return `<span class="confidence-badge confidence-${levelStr}">${levelStr}</span>`;
}

function _buildVerification(data) {
    let v = data.verification || {};
    let rde = v.rde_mix || {};
    let r = rde.R || 0, d = rde.D || 0, e = rde.E || 0;
    let total = r + d + e;
    let ePct = total > 0 ? (e / total * 100).toFixed(1) : 0.0;
    
    let tamSources = v.tam_sources || [];
    let openQs = v.open_definition_questions || [];
    
    let rows = [
        ["Industry", escapeHtml(data.industry)],
        ["Geography", escapeHtml(data.geography)],
        ["Definition scope", escapeHtml(data.definition_scope)],
        ["TAM sources", tamSources.length > 0 ? escapeHtml(tamSources.join(" | ")) : "---"],
        ["TAM gap (across sources)", escapeHtml(v.tam_gap || "n/a")],
        ["R / D / E mix", `R=${r}, D=${d}, E=${e} (${ePct}% estimate-heavy)`],
        ["Confidence rating", _confidenceBadge(v.confidence)]
    ];
    
    if (openQs.length > 0) {
        rows.push(["⚠ Open definition questions", openQs.map(q => escapeHtml(q)).join("<br>")]);
    }
    
    let gridHtml = rows.map(([lbl, val]) => `<div class="label">${lbl}</div><div class="value">${val}</div>`).join("\n");
    
    return `
    <div class="verification-block">
        <h3>Part 0 — Data Verification Block</h3>
        <div class="verification-grid">${gridHtml}</div>
    </div>
    `;
}

function _buildKpiStrip(data) {
    let s = data.structure || {};
    let sizing = data.sizing || {};
    let players = data.players || [];
    let topPlayer = players.length > 0 ? players[0] : {};
    
    let cards = [
        ["Industry Size", fmtNum(sizing.sam_cr || sizing.tam_cr, 0), escapeHtml(data.currency_unit || "Rs Cr")],
        ["CR3", fmtNum(s.CR3, 1, "%"), ""],
        ["CR5", fmtNum(s.CR5, 1, "%"), ""],
        ["CR10", fmtNum(s.CR10, 1, "%"), ""],
        ["HHI", fmtNum(s.HHI, 0), _hhiBadge(s.HHI, s.classification)],
        ["Top Player", escapeHtml(topPlayer.name || "---"), fmtNum(topPlayer.share_latest, 1, "% share")]
    ];
    
    let cells = cards.map(([lbl, val, sub]) => 
        `<div class="kpi"><div class="kpi-label">${lbl}</div><div class="kpi-value">${val}</div><div class="kpi-sub">${sub}</div></div>`
    ).join("\n");
    
    return `<div class="kpi-strip">${cells}</div>`;
}

function _buildPlayerTable(data) {
    let players = data.players || [];
    if (!players.length) return '<p class="section-intro">No player data provided.</p>';
    
    let cols = [
        ["Rank", "rank", true],
        ["Player", "name", false],
        ["Listed?", "listed", false],
        ["Latest Rev", "revenue_cr_latest", true],
        ["Share Latest", "share_latest", true],
        ["Share T-5", "share_t5", true],
        ["Δ bps", "delta_bps", true],
        ["Source", "source", false],
        ["Notes", "notes", false]
    ];
    
    let thHtml = cols.map((col, i) => 
        `<th class="sortable" onclick="sortTable('player-table', ${i}, ${col[2]})">${col[0]}<span class="sort-indicator"></span></th>`
    ).join("");
    
    let rowsHtml = players.map(p => {
        let cells = [];
        cells.push(`<td class="num">${escapeHtml(p.rank)}</td>`);
        
        let ticker = p.ticker;
        let nameHtml = escapeHtml(p.name);
        if (ticker) nameHtml += ` <span style="color:var(--muted);font-size:10px">(${escapeHtml(ticker)})</span>`;
        cells.push(`<td>${nameHtml}</td>`);
        
        cells.push(`<td>${escapeHtml(p.listed)}</td>`);
        cells.push(`<td class="num">${fmtNum(p.revenue_cr_latest, 0)}</td>`);
        cells.push(`<td class="num">${fmtNum(p.share_latest, 1, "%")}</td>`);
        cells.push(`<td class="num">${fmtNum(p.share_t5, 1, "%")}</td>`);
        cells.push(`<td class="num">${fmtDeltaBps(p.delta_bps)}</td>`);
        cells.push(`<td class="center">${_sourceTag(p.source)}</td>`);
        cells.push(`<td style="font-size:11px;color:var(--muted)">${escapeHtml(p.notes || "")}</td>`);
        
        return `<tr>${cells.join("")}</tr>`;
    }).join("");
    
    return `
    <table class="report-table" id="player-table">
        <thead><tr>${thHtml}</tr></thead>
        <tbody>${rowsHtml}</tbody>
    </table>
    <p class="section-intro" style="margin-top:4px">
        Click any column header to sort. Source tags: R=reported by player,
        D=derived (revenue ÷ industry size), D-segment=carved out from
        conglomerate, E=analyst estimate, E-floor=minimum likely.
    </p>
    `;
}

function _buildTierTable(data) {
    let s = data.structure || {};
    let tiers = s.tiers || [];
    if (!tiers.length) return "";
    
    let rows = tiers.map(t => 
        `<tr><td><b>${escapeHtml(t.tier)}</b></td><td>${escapeHtml(t.share_range || "")}</td><td>${escapeHtml((t.players || []).join(", "))}</td></tr>`
    ).join("");
    
    let orgPct = s.organized_pct;
    let unorgPct = s.unorganized_pct;
    let orgBlock = "";
    if (orgPct != null || unorgPct != null) {
        orgBlock = `
        <p class="section-intro" style="margin-top:8px">
            <b>Organised vs Unorganised:</b> ${fmtNum(orgPct, 1, '%')} organised /
            ${fmtNum(unorgPct, 1, '%')} unorganised.
            <i>${escapeHtml(s.organized_drivers || '')}</i>
        </p>`;
    }
    
    return `
    <table class="report-table">
        <thead><tr><th>Tier</th><th>Share Range</th><th>Players</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>
    ${orgBlock}
    `;
}

function _buildDynamics(data) {
    let dyn = data.dynamics || {};
    let gainers = dyn.top_gainers || [];
    let losers = dyn.top_losers || [];
    let thesis = dyn.structural_winner_thesis;
    
    const block = (rows, title, deltaClass) => {
        if (!rows || !rows.length) return "";
        let body = rows.map(r => 
            `<tr><td><b>${escapeHtml(r.player)}</b></td>
            <td class="num"><span class="delta-${deltaClass}">${fmtDeltaBps(r.delta_bps)}</span></td>
            <td>${escapeHtml(r.what_they_did || r.what_went_wrong || "")}</td>
            <td class="center">${escapeHtml(r.structural_or_cyclical || "")}</td>
            <td>${escapeHtml(r.next_3y || "")}</td></tr>`
        ).join("");
        
        return `
        <h3 style="font-size:13px;color:var(--primary);margin:12px 0 4px 0">${title}</h3>
        <table class="report-table">
            <thead><tr>
                <th>Player</th><th>Δ bps (5Y)</th><th>What happened</th>
                <th>Structural / Cyclical</th><th>Next 3 yrs</th>
            </tr></thead>
            <tbody>${body}</tbody>
        </table>
        `;
    };
    
    let thesisBlock = thesis ? `<div class="analyst-view">${escapeHtml(thesis)}</div>` : "";
    return block(gainers, "Top Share Gainers", "pos") + block(losers, "Top Share Losers", "neg") + thesisBlock;
}

function _buildMoatHeatmap(data) {
    let heatmap = data.moat_heatmap || [];
    if (!heatmap.length) return "";
    
    let dims = ["barrier_to_entry", "pricing_power", "switching_cost", "cost_advantage"];
    let dimLabels = ["Barrier to Entry", "Pricing Power", "Switching Cost", "Cost Advantage"];
    
    let thHtml = "<th>Player</th>" + dimLabels.map(lbl => `<th>${lbl}</th>`).join("") + "<th>Avg</th>";
    
    let rows = heatmap.map(h => {
        let cells = [`<td><b>${escapeHtml(h.player)}</b></td>`];
        let scores = [];
        
        for (let dim of dims) {
            let d = h[dim] || {};
            let score = d.score;
            let evidence = d.evidence || "";
            
            if (score == null) {
                cells.push('<td class="moat-cell" style="background:var(--muted)">---</td>');
                continue;
            }
            
            let scoreInt = Math.round(parseFloat(score)) || 0;
            scores.push(scoreInt);
            let cls = `moat-${Math.max(1, Math.min(5, scoreInt))}`;
            cells.push(`<td class="moat-cell ${cls}"><div>${scoreInt}</div><div class="evidence">${escapeHtml(evidence)}</div></td>`);
        }
        
        let avg = scores.length > 0 ? (scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(2) : "---";
        cells.push(`<td class="num"><b>${avg}</b></td>`);
        
        return `<tr>${cells.join("")}</tr>`;
    }).join("");
    
    return `
    <table class="report-table">
        <thead><tr>${thHtml}</tr></thead>
        <tbody>${rows}</tbody>
    </table>
    `;
}

function _buildThreats(data) {
    let threats = data.threats || [];
    if (!threats.length) return "";
    
    const piCell = (prob) => {
        if (!prob) return "";
        let p = String(prob).trim().toLowerCase();
        let cls = p.startsWith("h") ? "pi-high" : (p.startsWith("m") ? "pi-med" : "pi-low");
        return `<span class="prob-impact-cell ${cls}">${escapeHtml(prob)}</span>`;
    };
    
    let rows = threats.map(t => 
        `<tr><td><b>${escapeHtml(t.category)}</b></td>
        <td class="center">${piCell(t.probability)}</td>
        <td class="num">${fmtNum(t.impact_bps, 0)} bps</td>
        <td>${escapeHtml(t.early_warning || "")}</td>
        <td>${escapeHtml(t.mitigant || "")}</td></tr>`
    ).join("");
    
    return `
    <table class="report-table">
        <thead><tr>
            <th>Threat</th><th>Probability</th><th>Impact (bps at risk)</th>
            <th>Early-warning signal</th><th>Mitigant</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>
    `;
}

function _buildProjection(data) {
    let projection = data.projection || [];
    if (!projection.length) return "";
    
    let rows = projection.map(p => {
        let bear = p.bear || {};
        let base = p.base || {};
        let bull = p.bull || {};
        let spread = p.bear_bull_spread_bps;
        
        let asym = "";
        if (spread != null && parseFloat(spread) >= 500) {
            asym = '<span class="asymmetric-flag">ASYM</span>';
        }
        
        return `<tr><td><b>${escapeHtml(p.player)}</b></td>
        <td class="num">${fmtNum(bear.share, 1, "%")} <span style="color:var(--muted);font-size:10px">(${fmtDeltaBps(bear.delta_bps)})</span></td>
        <td class="num">${fmtNum(base.share, 1, "%")} <span style="color:var(--muted);font-size:10px">(${fmtDeltaBps(base.delta_bps)})</span></td>
        <td class="num">${fmtNum(bull.share, 1, "%")} <span style="color:var(--muted);font-size:10px">(${fmtDeltaBps(bull.delta_bps)})</span></td>
        <td class="num">${fmtNum(spread, 0)} bps</td>
        <td class="num">${fmtNum(p.implied_cagr_base, 1, "%")}</td>
        <td class="center">${asym}</td></tr>`;
    }).join("");
    
    return `
    <table class="report-table">
        <thead><tr>
            <th>Player</th><th>Bear</th><th>Base</th><th>Bull</th>
            <th>Bear-Bull Spread</th><th>Base CAGR</th><th>Asym?</th>
        </tr></thead>
        <tbody>${rows}</tbody>
    </table>
    <div class="chart-container" style="margin-top:12px">
        <canvas id="projection-chart"></canvas>
    </div>
    <p class="section-intro" style="margin-top:6px">
        Players with Bear-vs-Bull spread ≥ 500 bps are flagged ASYM —
        these are where the asymmetric bets live.
    </p>
    `;
}

function _buildSupplyDemand(data) {
    let sd = data.supply_demand || {};
    if (!Object.keys(sd).length) return "";
    
    let capex = sd.capex_pipeline || [];
    let capexRows = capex.map(c => 
        `<tr><td>${escapeHtml(c.player)}</td>
        <td class="num">${fmtNum(c.capex_cr, 0)}</td>
        <td>${escapeHtml(c.capacity_add || "")}</td></tr>`
    ).join("");
    
    let capexTable = "";
    if (capexRows) {
        capexTable = `<h3 style='font-size:13px;color:var(--primary);margin:12px 0 4px 0'>Capex pipeline (next 3Y)</h3>
        <table class='report-table'><thead><tr><th>Player</th><th>Capex (Cr)</th><th>Capacity add</th></tr></thead>
        <tbody>${capexRows}</tbody></table>`;
    }
    
    return `
    <table class="report-table">
        <thead><tr><th>Capacity / Pricing / Raw Material</th><th>Value</th></tr></thead>
        <tbody>
            <tr><td><b>Installed capacity</b></td><td>${escapeHtml(sd.installed_capacity)}</td></tr>
            <tr><td><b>Current utilisation</b></td><td>${fmtNum(sd.utilisation_pct, 1, '%')}</td></tr>
            <tr><td><b>Capex-to-demand ratio</b></td><td>${escapeHtml(sd.capex_to_demand_ratio)}</td></tr>
            <tr><td><b>Pricing trend</b></td><td>${escapeHtml(sd.pricing_trend)}</td></tr>
            <tr><td><b>Raw material concentration</b></td><td>${escapeHtml(sd.raw_material_concentration)}</td></tr>
        </tbody>
    </table>
    ${capexTable}
    `;
}

function _buildSubSegments(data) {
    let sizing = data.sizing || {};
    let subs = sizing.sub_segments || [];
    if (!subs.length) return "";
    
    let rows = subs.map(s => 
        `<tr><td><b>${escapeHtml(s.name)}</b></td>
        <td class="num">${fmtNum(s.share_pct, 1, "%")}</td>
        <td>${escapeHtml(s.notes || "")}</td></tr>`
    ).join("");
    
    return `
    <table class="report-table">
        <thead><tr><th>Sub-segment</th><th>Share of Industry</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>
    `;
}

function _buildDataQuality(data) {
    let dq = data.data_quality || {};
    let gaps = dq.biggest_gaps || [];
    let sources = dq.sources_used || [];
    
    let gapsHtml = gaps.map(g => `<li>${escapeHtml(g)}</li>`).join("");
    let sourcesHtml = sources.map(s => 
        `<li><b>${escapeHtml(s.source)}</b> (${escapeHtml(s.type || "primary")}) — 
        <a href="${escapeHtml(s.url || "#")}" target="_blank" rel="noopener">link</a> · 
        pulled ${escapeHtml(s.pull_date || "—")}</li>`
    ).join("");
    
    return `
    <table class="report-table">
        <tbody>
            <tr><td style="width:25%"><b>Overall confidence</b></td>
                <td>${_confidenceBadge(dq.confidence_overall)} — ${escapeHtml(dq.rde_mix_summary || '')}</td></tr>
        </tbody>
    </table>
    <h3 style="font-size:13px;color:var(--primary);margin:12px 0 4px 0">Three biggest data gaps</h3>
    <ul class="source-list">${gapsHtml}</ul>
    <h3 style="font-size:13px;color:var(--primary);margin:12px 0 4px 0">Sources used</h3>
    <ul class="source-list">${sourcesHtml}</ul>
    `;
}

function createMarketShareWidget(data) {
    const outputPath = data.output_path;
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let chartPayload = {
        sizing: { historical: (data.sizing || {}).historical || [] },
        projection: data.projection || []
    };

    let title = data.industry || "Market Share Analysis";
    let dateStr = data.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    let geography = data.geography || "India";

    let sections = [
        ["Executive Summary", `<p>${escapeHtml(data.executive_summary || "---")}</p>`],
        ["Part 1 — Industry Sizing", 
         `<p><b>Boundary:</b> ${escapeHtml((data.sizing || {}).boundary || "---")}</p>
         <div class="chart-container"><canvas id="historical-chart"></canvas></div>` + _buildSubSegments(data)],
        ["Part 2 — Market Structure & Tiering", _buildTierTable(data)],
        ["Part 3 — Player-by-Player Market Share", _buildPlayerTable(data)],
        ["Part 4 — Share Dynamics (the Why)", _buildDynamics(data)],
        ["Part 5 — Competitive Moat Heatmap", _buildMoatHeatmap(data)],
        ["Part 6 — Supply, Demand & Pricing", _buildSupplyDemand(data)],
        ["Part 7 — Disruption & Threat Map", _buildThreats(data)],
        ["Part 8 — Forward Share Projection (Bear / Base / Bull)", _buildProjection(data)],
        ["Part 9 — Data Quality Disclosure", _buildDataQuality(data)]
    ];

    let bodyParts = [];
    for (let [h, htmlContent] of sections) {
        bodyParts.push(`<h2 class="section-title">${h}</h2>`);
        bodyParts.push(htmlContent);
    }
    
    if (data.analyst_view) {
        bodyParts.push(`<div class="analyst-view">${escapeHtml(data.analyst_view)}</div>`);
    }

    let bodyHtml = bodyParts.join("\n");
    let embeddedJson = JSON.stringify(chartPayload);

    let html = `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — Market Share Analysis</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>${_CSS}</style>
</head>
<body>
<button class="theme-toggle" onclick="toggleTheme()">Toggle theme</button>
<div class="container">
    <div class="report-header">
        <h1 class="report-title">${escapeHtml(title)}</h1>
        <div class="report-meta">
            ${escapeHtml(geography)} · ${escapeHtml(data.definition_scope || "scope undefined")} ·
            Historical horizon: ${escapeHtml(data.historical_horizon || "")} ·
            Forward horizon: ${escapeHtml(data.forward_horizon || "")} ·
            Data current as of ${escapeHtml(dateStr)}
        </div>
        <div class="classification-banner">
            Internal — for investment conviction building; not a published recommendation
        </div>
    </div>
    ${_buildVerification(data)}
    ${_buildKpiStrip(data)}
    ${bodyHtml}
    <div class="disclaimer">
        This document is for informational purposes only and does not constitute investment advice.
        Author is not a SEBI-registered investment adviser. Numbers are best-effort extracts from
        primary documents (annual reports, association reports, BSE filings) and live web research
        as of the report date; cross-verify against the source before acting. Past performance does
        not indicate future results.
    </div>
</div>
<script>
const EMBEDDED_DATA = ${embeddedJson};
${_JS}
</script>
</body>
</html>`;

    fs.writeFileSync(outputPath, html, 'utf-8');
    console.log(`✅ Market Share widget saved to: ${outputPath}`);
    return outputPath;
}

module.exports = { createMarketShareWidget };
