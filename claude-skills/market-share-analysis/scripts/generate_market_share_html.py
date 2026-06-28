"""Market Share Analysis — HTML Widget Generator.

Renders a self-contained, interactive market share report as a single HTML file.
Features: sortable tables, color-coded R/D/E tags, HHI classification badge,
confidence-rated verification block, Chart.js historical & projection charts,
moat heatmap, disruption matrix, asymmetric-bet flagging.

Usage:
    import sys; sys.path.insert(0, '<skill_path>/scripts')
    from generate_market_share_html import create_market_share_widget

    create_market_share_widget(data)   # writes HTML to data['output_path']

See SKILL.md Phase 5 for the full input schema.
"""
from __future__ import annotations
import json
import os
from datetime import datetime
from html import escape


# ---------- CSS palette (institutional, matches _shared/pdf_utils.py LIGHT) -----

_CSS = """
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
"""

# ---------- JavaScript (vanilla, embedded) ------------------------------------

_JS = r"""
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
    if (ind) ind.textContent = newDir === 'asc' ? '\u25B2' : '\u25BC';
    rows.sort((a, b) => {
        const av = (a.cells[colIdx] || {}).textContent || '';
        const bv = (b.cells[colIdx] || {}).textContent || '';
        if (isNumeric) {
            const af = parseFloat(av.replace(/[^0-9.\-]/g, '')) || 0;
            const bf = parseFloat(bv.replace(/[^0-9.\-]/g, '')) || 0;
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
                    label: (c) => `${c.parsed.y.toLocaleString('en-IN')} (YoY ${historical[c.dataIndex].yoy != null ? historical[c.dataIndex].yoy + '%' : '-'})`
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
"""

# ---------- HTML builders -----------------------------------------------------

def _esc(value) -> str:
    if value is None:
        return "---------"
    return escape(str(value))


def _fmt_num(value, decimals=1, unit=""):
    if value is None or value == "":
        return "---------"
    try:
        f = float(value)
    except (TypeError, ValueError):
        return _esc(value)
    if decimals == 0:
        s = f"{f:,.0f}"
    else:
        s = f"{f:,.{decimals}f}"
    return f"{s}{unit}"


def _fmt_delta_bps(bps):
    if bps is None:
        return '<span class="delta-zero">---</span>'
    try:
        f = float(bps)
    except (TypeError, ValueError):
        return _esc(bps)
    if f > 0:
        return f'<span class="delta-pos">+{f:,.0f}</span>'
    if f < 0:
        return f'<span class="delta-neg">{f:,.0f}</span>'
    return '<span class="delta-zero">0</span>'


def _source_tag(tag):
    if not tag:
        return ""
    safe = escape(str(tag))
    css_class = "tag-" + safe.replace("-", "-")
    return f'<span class="tag {css_class}">{safe}</span>'


def _hhi_badge(hhi_value, classification):
    if hhi_value is None:
        return ""
    if classification == "Competitive/Fragmented":
        cls = "hhi-fragmented"
    elif classification == "Moderately Concentrated":
        cls = "hhi-moderate"
    elif classification == "Highly Concentrated":
        cls = "hhi-high"
    else:
        cls = "hhi-monopoly"
    return f'<span class="hhi-badge {cls}">{_esc(classification)}</span>'


def _confidence_badge(level):
    level_str = (level or "MEDIUM").upper()
    return f'<span class="confidence-badge confidence-{level_str}">{level_str}</span>'


def _build_verification(data) -> str:
    v = data.get("verification") or {}
    rde = v.get("rde_mix") or {}
    r, d, e = rde.get("R", 0), rde.get("D", 0), rde.get("E", 0)
    total = r + d + e
    e_pct = round((e / total * 100), 1) if total > 0 else 0.0
    tam_sources = v.get("tam_sources") or []
    open_qs = v.get("open_definition_questions") or []
    rows = [
        ("Industry", _esc(data.get("industry"))),
        ("Geography", _esc(data.get("geography"))),
        ("Definition scope", _esc(data.get("definition_scope"))),
        ("TAM sources", _esc(" | ".join(tam_sources)) if tam_sources else "---"),
        ("TAM gap (across sources)", _esc(v.get("tam_gap") or "n/a")),
        ("R / D / E mix", f"R={r}, D={d}, E={e} ({e_pct}% estimate-heavy)"),
        ("Confidence rating", _confidence_badge(v.get("confidence"))),
    ]
    if open_qs:
        rows.append(("⚠ Open definition questions",
                     "<br>".join(_esc(q) for q in open_qs)))
    grid_html = "\n".join(
        f'<div class="label">{lbl}</div><div class="value">{val}</div>'
        for lbl, val in rows
    )
    return f"""
    <div class="verification-block">
        <h3>Part 0 — Data Verification Block</h3>
        <div class="verification-grid">{grid_html}</div>
    </div>
    """


def _build_kpi_strip(data) -> str:
    s = data.get("structure") or {}
    sizing = data.get("sizing") or {}
    players = data.get("players") or []
    top_player = players[0] if players else {}
    cards = [
        ("Industry Size", _fmt_num(sizing.get("sam_cr") or sizing.get("tam_cr"), 0),
         _esc(data.get("currency_unit") or "Rs Cr")),
        ("CR3", _fmt_num(s.get("CR3"), 1, "%"), ""),
        ("CR5", _fmt_num(s.get("CR5"), 1, "%"), ""),
        ("CR10", _fmt_num(s.get("CR10"), 1, "%"), ""),
        ("HHI", _fmt_num(s.get("HHI"), 0), _hhi_badge(s.get("HHI"), s.get("classification"))),
        ("Top Player",
         _esc(top_player.get("name") or "---"),
         _fmt_num(top_player.get("share_latest"), 1, "% share")),
    ]
    cells = "\n".join(
        f'<div class="kpi"><div class="kpi-label">{lbl}</div>'
        f'<div class="kpi-value">{val}</div>'
        f'<div class="kpi-sub">{sub}</div></div>'
        for lbl, val, sub in cards
    )
    return f'<div class="kpi-strip">{cells}</div>'


def _build_player_table(data) -> str:
    players = data.get("players") or []
    if not players:
        return '<p class="section-intro">No player data provided.</p>'
    cols = [
        ("Rank", "rank", True),
        ("Player", "name", False),
        ("Listed?", "listed", False),
        ("Latest Rev", "revenue_cr_latest", True),
        ("Share Latest", "share_latest", True),
        ("Share T-5", "share_t5", True),
        ("Δ bps", "delta_bps", True),
        ("Source", "source", False),
        ("Notes", "notes", False),
    ]
    th_html = "".join(
        f'<th class="sortable" onclick="sortTable(\'player-table\', {i}, {str(is_num).lower()})">{name}'
        f'<span class="sort-indicator"></span></th>'
        for i, (name, _, is_num) in enumerate(cols)
    )
    rows_html = []
    for p in players:
        cells = []
        cells.append(f'<td class="num">{_esc(p.get("rank"))}</td>')
        ticker = p.get("ticker")
        name_html = _esc(p.get("name"))
        if ticker:
            name_html += f' <span style="color:var(--muted);font-size:10px">({_esc(ticker)})</span>'
        cells.append(f'<td>{name_html}</td>')
        cells.append(f'<td>{_esc(p.get("listed"))}</td>')
        cells.append(f'<td class="num">{_fmt_num(p.get("revenue_cr_latest"), 0)}</td>')
        cells.append(f'<td class="num">{_fmt_num(p.get("share_latest"), 1, "%")}</td>')
        cells.append(f'<td class="num">{_fmt_num(p.get("share_t5"), 1, "%")}</td>')
        cells.append(f'<td class="num">{_fmt_delta_bps(p.get("delta_bps"))}</td>')
        cells.append(f'<td class="center">{_source_tag(p.get("source"))}</td>')
        cells.append(f'<td style="font-size:11px;color:var(--muted)">{_esc(p.get("notes") or "")}</td>')
        rows_html.append("<tr>" + "".join(cells) + "</tr>")
    return f"""
    <table class="report-table" id="player-table">
        <thead><tr>{th_html}</tr></thead>
        <tbody>{''.join(rows_html)}</tbody>
    </table>
    <p class="section-intro" style="margin-top:4px">
        Click any column header to sort. Source tags: R=reported by player,
        D=derived (revenue ÷ industry size), D-segment=carved out from
        conglomerate, E=analyst estimate, E-floor=minimum likely.
    </p>
    """


def _build_tier_table(data) -> str:
    s = data.get("structure") or {}
    tiers = s.get("tiers") or []
    if not tiers:
        return ""
    rows = "".join(
        f'<tr><td><b>{_esc(t.get("tier"))}</b></td>'
        f'<td>{_esc(t.get("share_range") or "")}</td>'
        f'<td>{_esc(", ".join(t.get("players") or []))}</td></tr>'
        for t in tiers
    )
    org_pct = s.get("organized_pct")
    unorg_pct = s.get("unorganized_pct")
    org_block = ""
    if org_pct is not None or unorg_pct is not None:
        org_block = f"""
        <p class="section-intro" style="margin-top:8px">
            <b>Organised vs Unorganised:</b> {_fmt_num(org_pct, 1, '%')} organised /
            {_fmt_num(unorg_pct, 1, '%')} unorganised.
            <i>{_esc(s.get('organized_drivers') or '')}</i>
        </p>"""
    return f"""
    <table class="report-table">
        <thead><tr><th>Tier</th><th>Share Range</th><th>Players</th></tr></thead>
        <tbody>{rows}</tbody>
    </table>
    {org_block}
    """


def _build_dynamics(data) -> str:
    dyn = data.get("dynamics") or {}
    gainers = dyn.get("top_gainers") or []
    losers = dyn.get("top_losers") or []
    thesis = dyn.get("structural_winner_thesis")

    def _block(rows, title, delta_class):
        if not rows:
            return ""
        body = "".join(
            f'<tr><td><b>{_esc(r.get("player"))}</b></td>'
            f'<td class="num"><span class="delta-{delta_class}">{_fmt_delta_bps(r.get("delta_bps"))}</span></td>'
            f'<td>{_esc(r.get("what_they_did") or r.get("what_went_wrong") or "")}</td>'
            f'<td class="center">{_esc(r.get("structural_or_cyclical") or "")}</td>'
            f'<td>{_esc(r.get("next_3y") or "")}</td></tr>'
            for r in rows
        )
        return f"""
        <h3 style="font-size:13px;color:var(--primary);margin:12px 0 4px 0">{title}</h3>
        <table class="report-table">
            <thead><tr>
                <th>Player</th><th>Δ bps (5Y)</th><th>What happened</th>
                <th>Structural / Cyclical</th><th>Next 3 yrs</th>
            </tr></thead>
            <tbody>{body}</tbody>
        </table>
        """

    thesis_block = f'<div class="analyst-view">{_esc(thesis)}</div>' if thesis else ""
    return _block(gainers, "Top Share Gainers", "pos") + \
           _block(losers, "Top Share Losers", "neg") + thesis_block


def _build_moat_heatmap(data) -> str:
    heatmap = data.get("moat_heatmap") or []
    if not heatmap:
        return ""
    dims = ["barrier_to_entry", "pricing_power", "switching_cost", "cost_advantage"]
    dim_labels = ["Barrier to Entry", "Pricing Power", "Switching Cost", "Cost Advantage"]
    th_html = "<th>Player</th>" + "".join(f"<th>{lbl}</th>" for lbl in dim_labels) + "<th>Avg</th>"
    rows = []
    for h in heatmap:
        cells = [f"<td><b>{_esc(h.get('player'))}</b></td>"]
        scores = []
        for dim in dims:
            d = h.get(dim) or {}
            score = d.get("score")
            evidence = d.get("evidence") or ""
            if score is None:
                cells.append('<td class="moat-cell" style="background:var(--muted)">---</td>')
                continue
            try:
                score_int = int(round(float(score)))
            except (TypeError, ValueError):
                score_int = 0
            scores.append(score_int)
            cls = f"moat-{max(1, min(5, score_int))}"
            cells.append(
                f'<td class="moat-cell {cls}"><div>{score_int}</div>'
                f'<div class="evidence">{_esc(evidence)}</div></td>'
            )
        avg = round(sum(scores) / len(scores), 2) if scores else "---"
        cells.append(f'<td class="num"><b>{avg}</b></td>')
        rows.append("<tr>" + "".join(cells) + "</tr>")
    return f"""
    <table class="report-table">
        <thead><tr>{th_html}</tr></thead>
        <tbody>{''.join(rows)}</tbody>
    </table>
    """


def _build_threats(data) -> str:
    threats = data.get("threats") or []
    if not threats:
        return ""
    def pi_cell(prob):
        if not prob:
            return ""
        p = str(prob).strip().lower()
        if p.startswith("h"):
            cls = "pi-high"
        elif p.startswith("m"):
            cls = "pi-med"
        else:
            cls = "pi-low"
        return f'<span class="prob-impact-cell {cls}">{_esc(prob)}</span>'

    rows = "".join(
        f'<tr><td><b>{_esc(t.get("category"))}</b></td>'
        f'<td class="center">{pi_cell(t.get("probability"))}</td>'
        f'<td class="num">{_fmt_num(t.get("impact_bps"), 0)} bps</td>'
        f'<td>{_esc(t.get("early_warning") or "")}</td>'
        f'<td>{_esc(t.get("mitigant") or "")}</td></tr>'
        for t in threats
    )
    return f"""
    <table class="report-table">
        <thead><tr>
            <th>Threat</th><th>Probability</th><th>Impact (bps at risk)</th>
            <th>Early-warning signal</th><th>Mitigant</th>
        </tr></thead>
        <tbody>{rows}</tbody>
    </table>
    """


def _build_projection(data) -> str:
    projection = data.get("projection") or []
    if not projection:
        return ""
    rows = []
    for p in projection:
        bear = p.get("bear") or {}
        base = p.get("base") or {}
        bull = p.get("bull") or {}
        spread = p.get("bear_bull_spread_bps")
        asym = ""
        try:
            if spread is not None and float(spread) >= 500:
                asym = '<span class="asymmetric-flag">ASYM</span>'
        except (TypeError, ValueError):
            pass
        rows.append(
            f'<tr><td><b>{_esc(p.get("player"))}</b></td>'
            f'<td class="num">{_fmt_num(bear.get("share"), 1, "%")} '
            f'<span style="color:var(--muted);font-size:10px">({_fmt_delta_bps(bear.get("delta_bps"))})</span></td>'
            f'<td class="num">{_fmt_num(base.get("share"), 1, "%")} '
            f'<span style="color:var(--muted);font-size:10px">({_fmt_delta_bps(base.get("delta_bps"))})</span></td>'
            f'<td class="num">{_fmt_num(bull.get("share"), 1, "%")} '
            f'<span style="color:var(--muted);font-size:10px">({_fmt_delta_bps(bull.get("delta_bps"))})</span></td>'
            f'<td class="num">{_fmt_num(spread, 0)} bps</td>'
            f'<td class="num">{_fmt_num(p.get("implied_cagr_base"), 1, "%")}</td>'
            f'<td class="center">{asym}</td></tr>'
        )
    return f"""
    <table class="report-table">
        <thead><tr>
            <th>Player</th><th>Bear</th><th>Base</th><th>Bull</th>
            <th>Bear-Bull Spread</th><th>Base CAGR</th><th>Asym?</th>
        </tr></thead>
        <tbody>{''.join(rows)}</tbody>
    </table>
    <div class="chart-container" style="margin-top:12px">
        <canvas id="projection-chart"></canvas>
    </div>
    <p class="section-intro" style="margin-top:6px">
        Players with Bear-vs-Bull spread ≥ 500 bps are flagged ASYM —
        these are where the asymmetric bets live.
    </p>
    """


def _build_supply_demand(data) -> str:
    sd = data.get("supply_demand") or {}
    if not sd:
        return ""
    capex = sd.get("capex_pipeline") or []
    capex_rows = "".join(
        f'<tr><td>{_esc(c.get("player"))}</td>'
        f'<td class="num">{_fmt_num(c.get("capex_cr"), 0)}</td>'
        f'<td>{_esc(c.get("capacity_add") or "")}</td></tr>'
        for c in capex
    )
    return f"""
    <table class="report-table">
        <thead><tr><th>Capacity / Pricing / Raw Material</th><th>Value</th></tr></thead>
        <tbody>
            <tr><td><b>Installed capacity</b></td><td>{_esc(sd.get('installed_capacity'))}</td></tr>
            <tr><td><b>Current utilisation</b></td><td>{_fmt_num(sd.get('utilisation_pct'), 1, '%')}</td></tr>
            <tr><td><b>Capex-to-demand ratio</b></td><td>{_esc(sd.get('capex_to_demand_ratio'))}</td></tr>
            <tr><td><b>Pricing trend</b></td><td>{_esc(sd.get('pricing_trend'))}</td></tr>
            <tr><td><b>Raw material concentration</b></td><td>{_esc(sd.get('raw_material_concentration'))}</td></tr>
        </tbody>
    </table>
    {("<h3 style='font-size:13px;color:var(--primary);margin:12px 0 4px 0'>Capex pipeline (next 3Y)</h3>"
      "<table class='report-table'><thead><tr><th>Player</th><th>Capex (Cr)</th><th>Capacity add</th></tr></thead>"
      f"<tbody>{capex_rows}</tbody></table>") if capex_rows else ''}
    """


def _build_sub_segments(data) -> str:
    sizing = data.get("sizing") or {}
    subs = sizing.get("sub_segments") or []
    if not subs:
        return ""
    rows = "".join(
        f'<tr><td><b>{_esc(s.get("name"))}</b></td>'
        f'<td class="num">{_fmt_num(s.get("share_pct"), 1, "%")}</td>'
        f'<td>{_esc(s.get("notes") or "")}</td></tr>'
        for s in subs
    )
    return f"""
    <table class="report-table">
        <thead><tr><th>Sub-segment</th><th>Share of Industry</th><th>Notes</th></tr></thead>
        <tbody>{rows}</tbody>
    </table>
    """


def _build_data_quality(data) -> str:
    dq = data.get("data_quality") or {}
    gaps = dq.get("biggest_gaps") or []
    sources = dq.get("sources_used") or []
    gaps_html = "".join(f"<li>{_esc(g)}</li>" for g in gaps)
    sources_html = "".join(
        f'<li><b>{_esc(s.get("source"))}</b> '
        f'({_esc(s.get("type") or "primary")}) — '
        f'<a href="{_esc(s.get("url") or "#")}" target="_blank" rel="noopener">link</a> · '
        f'pulled {_esc(s.get("pull_date") or "—")}</li>'
        for s in sources
    )
    return f"""
    <table class="report-table">
        <tbody>
            <tr><td style="width:25%"><b>Overall confidence</b></td>
                <td>{_confidence_badge(dq.get('confidence_overall'))}
                — {_esc(dq.get('rde_mix_summary') or '')}</td></tr>
        </tbody>
    </table>
    <h3 style="font-size:13px;color:var(--primary);margin:12px 0 4px 0">Three biggest data gaps</h3>
    <ul class="source-list">{gaps_html}</ul>
    <h3 style="font-size:13px;color:var(--primary);margin:12px 0 4px 0">Sources used</h3>
    <ul class="source-list">{sources_html}</ul>
    """


# ---------- Public API --------------------------------------------------------

def create_market_share_widget(data: dict) -> str:
    """Render the data dict as an HTML market share report. Returns the
    output path on disk.
    """
    output_path = data.get("output_path")
    if not output_path:
        raise ValueError("data['output_path'] is required")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Serialize a minimal subset of data for client-side chart rendering
    chart_payload = {
        "sizing": {"historical": (data.get("sizing") or {}).get("historical") or []},
        "projection": data.get("projection") or [],
    }

    title = data.get("industry") or "Market Share Analysis"
    date_str = data.get("date") or datetime.now().strftime("%d-%b-%Y")
    geography = data.get("geography") or "India"

    sections = [
        ("Executive Summary",
         f'<p>{_esc(data.get("executive_summary") or "---")}</p>'),
        ("Part 1 — Industry Sizing",
         f'<p><b>Boundary:</b> {_esc((data.get("sizing") or {}).get("boundary") or "---")}</p>'
         f'<div class="chart-container"><canvas id="historical-chart"></canvas></div>'
         + _build_sub_segments(data)),
        ("Part 2 — Market Structure & Tiering", _build_tier_table(data)),
        ("Part 3 — Player-by-Player Market Share", _build_player_table(data)),
        ("Part 4 — Share Dynamics (the Why)", _build_dynamics(data)),
        ("Part 5 — Competitive Moat Heatmap", _build_moat_heatmap(data)),
        ("Part 6 — Supply, Demand & Pricing", _build_supply_demand(data)),
        ("Part 7 — Disruption & Threat Map", _build_threats(data)),
        ("Part 8 — Forward Share Projection (Bear / Base / Bull)", _build_projection(data)),
        ("Part 9 — Data Quality Disclosure", _build_data_quality(data)),
    ]
    body_parts = []
    for h, html_content in sections:
        body_parts.append(f'<h2 class="section-title">{h}</h2>')
        body_parts.append(html_content)
    if data.get("analyst_view"):
        body_parts.append(f'<div class="analyst-view">{_esc(data["analyst_view"])}</div>')

    body_html = "\n".join(body_parts)
    embedded_json = json.dumps(chart_payload, default=str, ensure_ascii=False)

    html = f"""<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{_esc(title)} — Market Share Analysis</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
<style>{_CSS}</style>
</head>
<body>
<button class="theme-toggle" onclick="toggleTheme()">Toggle theme</button>
<div class="container">
    <div class="report-header">
        <h1 class="report-title">{_esc(title)}</h1>
        <div class="report-meta">
            {_esc(geography)} · {_esc(data.get("definition_scope") or "scope undefined")} ·
            Historical horizon: {_esc(data.get("historical_horizon") or "")} ·
            Forward horizon: {_esc(data.get("forward_horizon") or "")} ·
            Data current as of {_esc(date_str)}
        </div>
        <div class="classification-banner">
            Internal — for investment conviction building; not a published recommendation
        </div>
    </div>
    {_build_verification(data)}
    {_build_kpi_strip(data)}
    {body_html}
    <div class="disclaimer">
        This document is for informational purposes only and does not constitute investment advice.
        Author is not a SEBI-registered investment adviser. Numbers are best-effort extracts from
        primary documents (annual reports, association reports, BSE filings) and live web research
        as of the report date; cross-verify against the source before acting. Past performance does
        not indicate future results.
    </div>
</div>
<script>
const EMBEDDED_DATA = {embedded_json};
{_JS}
</script>
</body>
</html>"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    return output_path


# ---------- Smoke test --------------------------------------------------------

if __name__ == "__main__":
    sample = {
        "industry": "Indian Stainless Steel Tubes & Pipes",
        "geography": "India",
        "definition_scope": "Welded + seamless SS tubes; excludes carbon-steel tubes and SS sheets",
        "currency_unit": "Rs Cr",
        "historical_horizon": "FY20-FY25",
        "forward_horizon": "FY26E-FY30E",
        "depth": "Tier 2 (Top 10 + tail)",
        "purpose": "Sector primer / investment memo prep",
        "date": "17-May-2026",
        "verification": {
            "tam_sources": ["JISA FY25 industry report", "Jindal Stainless Q4 FY25 IP"],
            "tam_gap": "Gap of 9% (Rs 14,500 Cr vs Rs 13,200 Cr); pick Jindal's higher figure for conservatism",
            "rde_mix": {"R": 3, "D": 7, "E": 1},
            "confidence": "MEDIUM",
            "open_definition_questions": []
        },
        "executive_summary": (
            "Indian SS tubes & pipes industry is at Rs ~14,500 Cr FY25, growing at ~12% CAGR. "
            "Top 10 players hold 89% share; Top 3 hold 55%. HHI at 1,375 keeps the industry "
            "Competitive/Fragmented despite consolidation pressure from BIS norms. The structural "
            "winner is the integrated nickel-processing leader, gaining 450 bps over FY20-FY25 "
            "with capex pipeline aligned to FY27 demand. Asymmetric bet: see Player A — Bear 21% / "
            "Bull 31% (1,000 bps spread)."
        ),
        "sizing": {
            "boundary": (
                "Indian production of welded and seamless stainless steel tubes (HS 7306). "
                "Includes domestic consumption + exports; excludes captive consumption by "
                "downstream auto / process equipment OEMs. Imports counted on demand side."
            ),
            "tam_cr": 18500, "sam_cr": 14500, "som_cr": 13200,
            "tam_methodology": (
                "TAM = global addressable for Indian players; SAM = India + accessible export "
                "markets (Middle East, Africa, SE Asia); SOM = sum of named-player revenues."
            ),
            "historical": [
                {"year": "FY20", "size_cr": 9800, "yoy": None},
                {"year": "FY21", "size_cr": 9100, "yoy": -7.1},
                {"year": "FY22", "size_cr": 11200, "yoy": 23.1},
                {"year": "FY23", "size_cr": 12500, "yoy": 11.6},
                {"year": "FY24", "size_cr": 13400, "yoy": 7.2},
                {"year": "FY25", "size_cr": 14500, "yoy": 8.2},
            ],
            "sub_segments": [
                {"name": "Decorative welded", "share_pct": 42,
                 "notes": "Largest by volume; urban consumer + railway interior"},
                {"name": "Structural welded", "share_pct": 28,
                 "notes": "Construction, fencing, infra; commodity pricing"},
                {"name": "Seamless industrial", "share_pct": 22,
                 "notes": "Highest margin segment; oil & gas + power"},
                {"name": "Specialty (instrumentation)", "share_pct": 8,
                 "notes": "Niche; export-led; few qualified players"},
            ],
        },
        "structure": {
            "CR3": 54.9, "CR5": 71.9, "CR10": 89.0, "HHI": 1375.14,
            "classification": "Competitive/Fragmented",
            "tiers": [
                {"tier": "Tier 1 - Scale leaders", "players": ["Player A", "Player B"],
                 "share_range": ">15%"},
                {"tier": "Tier 2 - Specialists",
                 "players": ["Player C", "Player D", "Player E"],
                 "share_range": "5-15%"},
                {"tier": "Tier 3 - Regional",
                 "players": ["Player F-J"], "share_range": "<5%"},
                {"tier": "Tier 4 - Unorganised / Imports",
                 "players": ["~7% unorganised", "~4% imports"],
                 "share_range": "Estimated"},
            ],
            "organized_pct": 89, "unorganized_pct": 11,
            "organized_drivers": (
                "BIS standard for SS tubes (BIS 6911) became mandatory in FY22, killing the "
                "long-tail unorganised players. GST + ITC alignment shaved another 4pp of "
                "unorganised share by FY24."
            ),
        },
        "players": [
            {"rank": 1, "name": "Player A", "listed": "Listed", "ticker": "NSE:PLAYERA",
             "revenue_cr_latest": 3262, "share_latest": 22.5, "share_t5": 18.0,
             "delta_bps": 450, "source": "D", "notes": "Carve-out from total SS revenue p.187 FY25 AR"},
            {"rank": 2, "name": "Player B", "listed": "Listed", "ticker": "NSE:PLAYERB",
             "revenue_cr_latest": 2654, "share_latest": 18.3, "share_t5": 19.0,
             "delta_bps": -70, "source": "D-segment", "notes": ""},
            {"rank": 3, "name": "Player C", "listed": "Listed", "ticker": "NSE:PLAYERC",
             "revenue_cr_latest": 2045, "share_latest": 14.1, "share_t5": 11.8,
             "delta_bps": 230, "source": "R", "notes": "Self-reported in Q4 FY25 IP"},
            {"rank": 4, "name": "Player D", "listed": "Unlisted",
             "revenue_cr_latest": 1421, "share_latest": 9.8, "share_t5": 8.2,
             "delta_bps": 160, "source": "D", "notes": "MCA filing FY25"},
            {"rank": 5, "name": "Player E", "listed": "Listed", "ticker": "NSE:PLAYERE",
             "revenue_cr_latest": 1044, "share_latest": 7.2, "share_t5": 9.5,
             "delta_bps": -230, "source": "D", "notes": "Lost a major OEM contract FY23"},
            {"rank": 6, "name": "Player F", "listed": "Unlisted",
             "revenue_cr_latest": 798, "share_latest": 5.5, "share_t5": 6.0,
             "delta_bps": -50, "source": "D", "notes": ""},
            {"rank": 7, "name": "Player G", "listed": "Unlisted",
             "revenue_cr_latest": 595, "share_latest": 4.1, "share_t5": 4.5,
             "delta_bps": -40, "source": "E", "notes": "Estimated; MCA FY24 latest"},
            {"rank": 8, "name": "Player H", "listed": "Unlisted",
             "revenue_cr_latest": 435, "share_latest": 3.0, "share_t5": 3.5,
             "delta_bps": -50, "source": "D", "notes": ""},
            {"rank": 9, "name": "Player I", "listed": "Unlisted",
             "revenue_cr_latest": 363, "share_latest": 2.5, "share_t5": 2.0,
             "delta_bps": 50, "source": "D", "notes": ""},
            {"rank": 10, "name": "Player J", "listed": "Unlisted",
             "revenue_cr_latest": 290, "share_latest": 2.0, "share_t5": 1.5,
             "delta_bps": 50, "source": "D", "notes": ""},
            {"rank": 11, "name": "Others (unorganised + imports + small unidentified)",
             "listed": "—", "revenue_cr_latest": 1595, "share_latest": 11.0, "share_t5": 16.0,
             "delta_bps": -500, "source": "E",
             "notes": "Unorganised ~7%, imports ~4%, balance unidentified small"},
        ],
        "dynamics": {
            "top_gainers": [
                {"player": "Player A", "delta_bps": 450,
                 "what_they_did": "Commissioned 200 kTpa brownfield + backward-integrated nickel processing",
                 "structural_or_cyclical": "Structural", "next_3y": "Extends — Rs 1,200 Cr more capex committed"},
                {"player": "Player C", "delta_bps": 230,
                 "what_they_did": "Won 3 large EPC contracts in seamless industrial",
                 "structural_or_cyclical": "Cyclical-leaning structural",
                 "next_3y": "Holds — capacity coming online FY27"},
            ],
            "top_losers": [
                {"player": "Player E", "delta_bps": -230,
                 "what_went_wrong": "Lost OEM contract FY23; failed BIS recertification at one plant",
                 "structural_or_cyclical": "Structural",
                 "next_3y": "Continues — would need promoter capital to recover"},
                {"player": "Player B", "delta_bps": -70,
                 "what_went_wrong": "Mix-shifted away from low-margin structural; share loss is by choice",
                 "structural_or_cyclical": "Strategic", "next_3y": "Stable at new equilibrium"},
            ],
            "structural_winner_thesis": (
                "Player A is the structural winner by FY30. Combination of backward-integrated "
                "nickel processing (8% cost edge sustained through FY22-FY24 nickel volatility), "
                "Rs 1,200 Cr capex committed for FY27 commissioning, and dealer-network depth "
                "1.6x next competitor positions them to gain ~600-800 bps more by FY30 in base case."
            ),
        },
        "moat_heatmap": [
            {"player": "Player A",
             "barrier_to_entry": {"score": 4,
                "evidence": "8 BIS-certified plants, 3 in tax-free zones, 5-year gestation to replicate"},
             "pricing_power": {"score": 3,
                "evidence": "3Y gross margin +200 bps despite nickel +30% volatility"},
             "switching_cost": {"score": 4,
                "evidence": "Qualified vendor at L&T, BHEL; 18-month re-qualification cycle"},
             "cost_advantage": {"score": 5,
                "evidence": "Captive nickel processing; cost/tonne 8% below median peer"}},
            {"player": "Player B",
             "barrier_to_entry": {"score": 3,
                "evidence": "5 plants, all BIS; standard 2-3yr replicability"},
             "pricing_power": {"score": 3,
                "evidence": "Margin held flat through cycle; no pass-through edge"},
             "switching_cost": {"score": 3,
                "evidence": "Qualified at several OEMs but not contract-locked"},
             "cost_advantage": {"score": 2,
                "evidence": "Buys nickel on spot; cost in line with median"}},
            {"player": "Player C",
             "barrier_to_entry": {"score": 4,
                "evidence": "Only seamless player approved for nuclear PSU specifications"},
             "pricing_power": {"score": 4,
                "evidence": "Seamless niche margins consistently 700 bps above welded segment"},
             "switching_cost": {"score": 5,
                "evidence": "PSU + nuclear specs - re-qualification is multi-year"},
             "cost_advantage": {"score": 2,
                "evidence": "Smaller scale; cost/tonne above median in seamless"}},
        ],
        "supply_demand": {
            "installed_capacity": "1,950 kTpa total industry; FY25 utilisation 82%",
            "utilisation_pct": 82,
            "capex_pipeline": [
                {"player": "Player A", "capex_cr": 1200, "capacity_add": "+200 kTpa by Q3 FY27"},
                {"player": "Player C", "capex_cr": 500, "capacity_add": "+80 kTpa seamless by FY28"},
                {"player": "Player D", "capex_cr": 350, "capacity_add": "+60 kTpa welded by FY27"},
            ],
            "capex_to_demand_ratio": (
                "Capacity coming online 340 kTpa over FY26-FY28 vs implied demand growth "
                "~310 kTpa — capex-to-demand 1.10x; slight over-build risk on welded, tight on seamless."
            ),
            "pricing_trend": (
                "Realisation Rs 215/kg FY25 vs Rs 178/kg FY20 (+21% over 5Y); spread vs nickel "
                "+ chrome blended cost steady at Rs 65-72/kg through cycle."
            ),
            "raw_material_concentration": (
                "Nickel (LME-traded) + ferrochrome (Indian + South African) — both commodity-traded; "
                "3-6 month pass-through lag. Backward-integrated player (A) earns the spread; others "
                "absorb volatility."
            ),
        },
        "threats": [
            {"category": "Chinese imports (welded)", "probability": "High", "impact_bps": 300,
             "early_warning": "Anti-dumping duty review outcome Q3 FY26; CBIC notification to watch",
             "mitigant": "BIS standards favour domestic; duty extension likely but not certain"},
            {"category": "EV / lightweighting substitution (auto)", "probability": "Medium",
             "impact_bps": 150,
             "early_warning": "OEM platform announcements moving auto exhaust to aluminium/composites",
             "mitigant": "Players pivoting to non-auto end-uses"},
            {"category": "New MNC entrant", "probability": "Low", "impact_bps": 200,
             "early_warning": "Aperam / Outokumpu India JV announcement",
             "mitigant": "Existing players' BIS + dealer moat would force 4-5yr build"},
            {"category": "Captive backward integration by large OEMs",
             "probability": "Low", "impact_bps": 100,
             "early_warning": "L&T or BHEL announcing in-house tube manufacturing",
             "mitigant": "Low — captive uneconomic below 100 kTpa"},
            {"category": "Environmental compliance cost shock", "probability": "Medium",
             "impact_bps": 50,
             "early_warning": "MoEF&CC tighter emission norms for stainless processing",
             "mitigant": "Already mostly compliant; capex Rs 100-150 Cr per player"},
        ],
        "projection": [
            {"player": "Player A",
             "bear": {"share": 21.0, "delta_bps": -150},
             "base": {"share": 25.5, "delta_bps": 300},
             "bull": {"share": 31.0, "delta_bps": 850},
             "bear_bull_spread_bps": 1000, "implied_cagr_base": 14.5,
             "key_assumptions": ["Capex on schedule", "Anti-dumping extended", "Margin defensible"]},
            {"player": "Player B",
             "bear": {"share": 16.0, "delta_bps": -230},
             "base": {"share": 18.5, "delta_bps": 20},
             "bull": {"share": 21.0, "delta_bps": 270},
             "bear_bull_spread_bps": 500, "implied_cagr_base": 11.0,
             "key_assumptions": ["Mix shift continues", "No new entrant"]},
            {"player": "Player C",
             "bear": {"share": 13.5, "delta_bps": -60},
             "base": {"share": 16.0, "delta_bps": 190},
             "bull": {"share": 19.0, "delta_bps": 490},
             "bear_bull_spread_bps": 550, "implied_cagr_base": 13.5,
             "key_assumptions": ["Seamless capex on track", "Nuclear PSU contracts continue"]},
            {"player": "Player D",
             "bear": {"share": 9.0, "delta_bps": -80},
             "base": {"share": 10.5, "delta_bps": 70},
             "bull": {"share": 11.5, "delta_bps": 170},
             "bear_bull_spread_bps": 250, "implied_cagr_base": 11.0,
             "key_assumptions": ["Moderate growth", "No share gain catalyst"]},
        ],
        "data_quality": {
            "confidence_overall": "MEDIUM",
            "rde_mix_summary": "3 [R], 7 [D] / [D-segment], 1 [E] — derivation-heavy but not estimate-heavy.",
            "biggest_gaps": [
                "Player A FY25 segment carve-out — based on Note 32 of AR (Segmental Reporting Ind AS 108) but the seamless / welded split is not separately disclosed",
                "Unorganised share quantification — currently [E] at 7% based on GST formalisation extrapolation; could be 5-10%",
                "Import data only quarterly; full FY25 figure is provisional",
            ],
            "sources_used": [
                {"source": "JISA FY25 industry report", "type": "Industry association",
                 "url": "https://jisaindia.in/", "pull_date": "17-May-2026"},
                {"source": "Jindal Stainless Q4 FY25 IP", "type": "Investor presentation",
                 "url": "https://bseindia.com/", "pull_date": "17-May-2026"},
                {"source": "MCA filings (Tofler)", "type": "MCA/regulatory",
                 "url": "https://tofler.in/", "pull_date": "16-May-2026"},
                {"source": "DGCIS trade data", "type": "Government",
                 "url": "https://commerce.gov.in/", "pull_date": "17-May-2026"},
            ],
        },
        "analyst_view": (
            "Industry view: Indian SS tubes is consolidating but slowly — HHI moved from ~1,100 "
            "to ~1,375 over 5 years, still firmly in Competitive territory. The asymmetric bet "
            "is Player A: their Bear-Bull spread of 1,000 bps is double the next-most-asymmetric. "
            "Variant perception: market models Player A as a cyclical commodity player; the moat "
            "evidence (4/3/4/5 average 4.0) plus capex pipeline alignment with seamless industrial "
            "demand argues they're closer to a structural compounder. The single most-watchable "
            "early-warning indicator: Q3 FY26 anti-dumping review on Chinese welded imports."
        ),
        "output_path": "/tmp/sample_market_share.html",
    }
    out = create_market_share_widget(sample)
    print(f"Generated: {out}")
    print(f"Size: {os.path.getsize(out):,} bytes")
