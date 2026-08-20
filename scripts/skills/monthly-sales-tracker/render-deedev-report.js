#!/usr/bin/env node
/**
 * monthly-sales-tracker / render-deedev-report.js
 *
 * Renders an interactive HTML report for DEE Development Engineers Ltd (NSE:DEEDEV)
 * from the extracted order book & execution data.
 *
 * Unlike TMPV/M&M (unit-based regression), here:
 *   - Monthly Execution ₹ Cr  = direct revenue (no regression needed)
 *   - Closing Order Book ₹ Cr = forward revenue visibility
 *   - Order Inflow ₹ Cr       = new business momentum
 *
 * Outputs: data/assets/monthly-sales-tracker/NSE_DEEDEV_order_report_<date>.html
 */

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const DATA_DIR = path.join(REPO_ROOT, 'data/runs/monthly-sales-tracker/NSE_DEEDEV');
const ASSETS_DIR = path.join(REPO_ROOT, 'data/assets/monthly-sales-tracker');
const TODAY = new Date().toISOString().slice(0, 10);

// ── Load data ─────────────────────────────────────────────────────────────────
const salesFile = path.join(DATA_DIR, 'sales_data.json');
if (!fs.existsSync(salesFile)) {
  console.error('sales_data.json not found. Run extract-deedev-orders.py first.');
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(salesFile, 'utf8'));
const records = data.records.filter((r) => r.execution != null);

// Quarter helpers
function fiscalQuarter(month, year) {
  if ([4, 5, 6].includes(month)) return { q: 1, fy: year + 1 };
  if ([7, 8, 9].includes(month)) return { q: 2, fy: year + 1 };
  if ([10, 11, 12].includes(month)) return { q: 3, fy: year + 1 };
  return { q: 4, fy: year };
}

// ── Build quarterly rollups ───────────────────────────────────────────────────
const byQuarter = {};
for (const r of records) {
  const { q, fy } = fiscalQuarter(r.month, r.year);
  const key = `Q${q}FY${String(fy).slice(-2)}`;
  if (!byQuarter[key])
    byQuarter[key] = { q, fy, key, months: [], exec: 0, inflow: 0, closing_ob: null };
  byQuarter[key].months.push(r);
  byQuarter[key].exec += r.execution || 0;
  byQuarter[key].inflow += r.order_inflow || 0;
  // Use latest closing OB in the quarter
  if (r.closing_order_book != null) byQuarter[key].closing_ob = r.closing_order_book;
}
const quarters = Object.values(byQuarter).sort((a, b) => (a.fy !== b.fy ? a.fy - b.fy : a.q - b.q));

// ── Chart data ────────────────────────────────────────────────────────────────
const labels = records.map((r) => r.date_label);
const execData = records.map((r) => r.execution);
const inflowData = records.map((r) => r.order_inflow);
const obData = records.map((r) => r.closing_order_book);
const cumExecData = records.map((r) => r.cum_executed_fy);

// Quarterly chart data
const qLabels = quarters.map((q) => q.key);
const qExec = quarters.map((q) => +q.exec.toFixed(2));
const qInflow = quarters.map((q) => +q.inflow.toFixed(2));
const qOB = quarters.map((q) => (q.closing_ob != null ? +q.closing_ob.toFixed(2) : null));

// ── Current month summary ─────────────────────────────────────────────────────
const latest = records[records.length - 1];
const prev = records[records.length - 2];
const execYoY = null; // no year-ago data in current set

function pct(a, b) {
  if (!a || !b) return null;
  return (((a - b) / Math.abs(b)) * 100).toFixed(1);
}

const execMoM = pct(latest.execution, prev?.execution);
const inflowMoM = pct(latest.order_inflow, prev?.order_inflow);

// Q1FY27 so far (Apr + May + Jun 2026)
const q1fy27 = quarters.find((q) => q.key === 'Q1FY27');
const q1fy26 = quarters.find((q) => q.key === 'Q1FY26');
const q1yoy = q1fy27 && q1fy26 ? pct(q1fy27.exec, q1fy26.exec) : null;

// ── Annualised run-rate ───────────────────────────────────────────────────────
// Last 6 months execution annualised
const last6 = records.slice(-6).reduce((s, r) => s + (r.execution || 0), 0);
const runRate = ((last6 / 6) * 12).toFixed(0);

// ── Book-to-bill (last 6 months) ─────────────────────────────────────────────
const last6Exec = records.slice(-6).reduce((s, r) => s + (r.execution || 0), 0);
const last6Inf = records.slice(-6).reduce((s, r) => s + (r.order_inflow || 0), 0);
const bookToBill = last6Exec > 0 ? (last6Inf / last6Exec).toFixed(2) : null;

const json = (s) => JSON.stringify(s);

// ── HTML ──────────────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>NSE:DEEDEV · Monthly Order Book & Execution Tracker</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:       #0b0f1a;
    --surface:  #141927;
    --surface2: #1c2438;
    --border:   #263050;
    --accent:   #6c8cff;
    --green:    #34d399;
    --red:      #f87171;
    --amber:    #fbbf24;
    --teal:     #22d3ee;
    --text:     #e2e8f0;
    --muted:    #8899aa;
    --r:        12px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
  }

  /* ── Header ── */
  .header {
    background: linear-gradient(135deg, #0f1729 0%, #0b1424 50%, #131d35 100%);
    border-bottom: 1px solid var(--border);
    padding: 32px 40px 24px;
    position: relative;
    overflow: hidden;
  }
  .header::before {
    content: '';
    position: absolute; inset: 0;
    background: radial-gradient(ellipse at 70% 50%, rgba(108,140,255,0.08) 0%, transparent 70%);
    pointer-events: none;
  }
  .header-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
  .ticker-badge {
    display: inline-block;
    background: linear-gradient(135deg, #6c8cff22, #6c8cff11);
    border: 1px solid #6c8cff44;
    color: var(--accent);
    font-size: 11px; font-weight: 600; letter-spacing: 1.5px;
    padding: 4px 10px; border-radius: 6px; text-transform: uppercase; margin-bottom: 8px;
  }
  .header h1 { font-size: 26px; font-weight: 700; line-height: 1.2; }
  .header h1 span { color: var(--accent); }
  .header-sub { font-size: 13px; color: var(--muted); margin-top: 4px; }
  .header-meta { font-size: 12px; color: var(--muted); text-align: right; white-space: nowrap; }

  /* ── KPI strip ── */
  .kpi-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 16px;
    padding: 28px 40px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .kpi {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: var(--r);
    padding: 16px 20px;
    position: relative;
    overflow: hidden;
  }
  .kpi::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: var(--accent-color, var(--accent));
  }
  .kpi-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
  .kpi-value { font-size: 22px; font-weight: 700; color: var(--text); line-height: 1; }
  .kpi-sub   { font-size: 11px; color: var(--muted); margin-top: 4px; }
  .kpi-delta {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: 12px; font-weight: 600;
    padding: 2px 7px; border-radius: 4px; margin-top: 6px;
  }
  .up   { color: var(--green);  background: rgba(52,211,153,0.12); }
  .down { color: var(--red);    background: rgba(248,113,113,0.12); }
  .flat { color: var(--muted);  background: rgba(136,153,170,0.1); }

  /* ── Main grid ── */
  .content { padding: 32px 40px; display: grid; gap: 24px; }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r);
    overflow: hidden;
  }
  .card-header {
    padding: 18px 24px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .card-title { font-size: 14px; font-weight: 600; }
  .card-hint  { font-size: 11px; color: var(--muted); }
  .card-body  { padding: 20px 24px; }

  canvas { width: 100% !important; }

  /* ── Table ── */
  .data-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .data-table th {
    text-align: right; font-weight: 600; font-size: 11px; color: var(--muted);
    text-transform: uppercase; letter-spacing: 0.5px;
    padding: 8px 12px; border-bottom: 1px solid var(--border);
  }
  .data-table th:first-child { text-align: left; }
  .data-table td {
    padding: 8px 12px; text-align: right;
    border-bottom: 1px solid rgba(38,48,80,0.5);
  }
  .data-table td:first-child { text-align: left; font-weight: 500; }
  .data-table tr:last-child td { border-bottom: none; }
  .data-table tr:hover td { background: var(--surface2); }
  .latest-row td { background: rgba(108,140,255,0.07); font-weight: 600; }
  .note-cell { font-size: 10px; color: var(--amber); }

  /* ── Quarter table highlight ── */
  .q-highlight { color: var(--accent); font-weight: 700; }

  /* ── Footnote ── */
  .footnote {
    padding: 16px 40px;
    font-size: 11px; color: var(--muted);
    border-top: 1px solid var(--border);
    line-height: 1.6;
  }
  .tag {
    display: inline-block;
    font-size: 10px; font-weight: 600; letter-spacing: 0.5px;
    padding: 2px 6px; border-radius: 4px; margin-right: 4px;
  }
  .tag-amber { background: rgba(251,191,36,0.15); color: var(--amber); }
  .tag-green { background: rgba(52,211,153,0.15); color: var(--green); }

  @media (max-width: 768px) {
    .header, .kpi-strip, .content, .footnote { padding-left: 20px; padding-right: 20px; }
    .kpi-strip { grid-template-columns: repeat(2, 1fr); }
  }
</style>
</head>
<body>

<!-- ── Header ── -->
<div class="header">
  <div class="header-top">
    <div>
      <div class="ticker-badge">NSE:DEEDEV · Order Book Tracker</div>
      <h1>DEE Development Engineers<br><span>Monthly Execution & Order Position</span></h1>
      <div class="header-sub">Engineering EPC — Piping, Heavy Fabrication, Power Generation | INR in Crores</div>
    </div>
    <div class="header-meta">
      <div>Latest: <strong>${latest.month_name} ${latest.year}</strong></div>
      <div>Updated: ${TODAY}</div>
      <div style="margin-top:8px;font-size:11px;">
        <span style="color:var(--accent);">●</span> Execution = Direct Revenue Proxy<br>
        <span style="color:var(--green);">●</span> Closing OB = Forward Visibility
      </div>
    </div>
  </div>
</div>

<!-- ── KPI Strip ── -->
<div class="kpi-strip">

  <div class="kpi" style="--accent-color: #6c8cff;">
    <div class="kpi-label">Jun-26 Execution</div>
    <div class="kpi-value">₹${latest.execution?.toFixed(1)} Cr</div>
    <div class="kpi-sub">Monthly revenue proxy</div>
    ${execMoM != null ? `<div class="kpi-delta ${+execMoM >= 0 ? 'up' : 'down'}">${+execMoM >= 0 ? '▲' : '▼'} ${Math.abs(execMoM)}% MoM</div>` : ''}
  </div>

  <div class="kpi" style="--accent-color: #34d399;">
    <div class="kpi-label">Closing Order Book</div>
    <div class="kpi-value">₹${latest.closing_order_book?.toFixed(0)} Cr</div>
    <div class="kpi-sub">Jun-26 end</div>
    <div class="kpi-delta flat">~${(latest.closing_order_book / (last6Exec / 6)).toFixed(1)}x cover</div>
  </div>

  <div class="kpi" style="--accent-color: #fbbf24;">
    <div class="kpi-label">Jun-26 Order Inflow</div>
    <div class="kpi-value">₹${latest.order_inflow?.toFixed(1)} Cr</div>
    <div class="kpi-sub">New orders added</div>
    ${inflowMoM != null ? `<div class="kpi-delta ${+inflowMoM >= 0 ? 'up' : 'down'}">${+inflowMoM >= 0 ? '▲' : '▼'} ${Math.abs(inflowMoM)}% MoM</div>` : ''}
  </div>

  <div class="kpi" style="--accent-color: #22d3ee;">
    <div class="kpi-label">Annualised Run-Rate</div>
    <div class="kpi-value">₹${runRate} Cr</div>
    <div class="kpi-sub">6-month trailing × 12</div>
  </div>

  <div class="kpi" style="--accent-color: #a78bfa;">
    <div class="kpi-label">Book-to-Bill (6M)</div>
    <div class="kpi-value">${bookToBill}x</div>
    <div class="kpi-sub">Inflow ÷ Execution</div>
    <div class="kpi-delta ${+bookToBill >= 1 ? 'up' : 'down'}">${+bookToBill >= 1 ? 'Replenishing' : 'Depleting'}</div>
  </div>

  <div class="kpi" style="--accent-color: #f97316;">
    <div class="kpi-label">Q1FY27 Execution</div>
    <div class="kpi-value">₹${q1fy27 ? q1fy27.exec.toFixed(1) : '—'} Cr</div>
    <div class="kpi-sub">Apr + May + Jun 2026</div>
    ${q1yoy != null ? `<div class="kpi-delta ${+q1yoy >= 0 ? 'up' : 'down'}">${+q1yoy >= 0 ? '▲' : '▼'} ${Math.abs(q1yoy)}% YoY vs Q1FY26</div>` : ''}
  </div>

</div>

<!-- ── Charts ── -->
<div class="content">

  <!-- Monthly execution + order book -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">Monthly Execution & Order Book Position  <small style="color:var(--muted);font-weight:400;">(₹ Crores)</small></div>
      <div class="card-hint">Execution = invoices raised on customers · Closing OB on right axis</div>
    </div>
    <div class="card-body">
      <canvas id="mainChart" height="110"></canvas>
    </div>
  </div>

  <!-- Monthly order inflow -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">Monthly Order Inflow  <small style="color:var(--muted);font-weight:400;">(₹ Crores)</small></div>
      <div class="card-hint">New orders received + amendments + currency adjustments</div>
    </div>
    <div class="card-body">
      <canvas id="inflowChart" height="80"></canvas>
    </div>
  </div>

  <!-- Quarterly rollup -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">Quarterly Execution vs. Inflow  <small style="color:var(--muted);font-weight:400;">(₹ Crores, grouped)</small></div>
      <div class="card-hint">Based on disclosed monthly data only</div>
    </div>
    <div class="card-body">
      <canvas id="qChart" height="80"></canvas>
    </div>
  </div>

  <!-- Monthly data table -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">Monthly Detail Table</div>
      <div class="card-hint">All values in ₹ Crores · Jan+Feb-25 split estimated equally</div>
    </div>
    <div class="card-body" style="padding:0;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Month</th>
            <th>Quarter</th>
            <th>Opening OB</th>
            <th>Inflow</th>
            <th>Execution</th>
            <th>Closing OB</th>
            <th>YTD Exec</th>
          </tr>
        </thead>
        <tbody>
          ${records
            .map(
              (r, i) => `
            <tr class="${i === records.length - 1 ? 'latest-row' : ''}">
              <td>
                ${r.date_label}
                ${r.note ? `<div class="note-cell">⚠ ${r.note.split(';')[0]}</div>` : ''}
              </td>
              <td>${r.quarter}</td>
              <td>${r.opening_order_book != null ? r.opening_order_book.toFixed(2) : '—'}</td>
              <td>${r.order_inflow != null ? r.order_inflow.toFixed(2) : '—'}</td>
              <td style="color:var(--accent);font-weight:600;">${r.execution != null ? r.execution.toFixed(2) : '—'}</td>
              <td style="color:var(--green);">${r.closing_order_book != null ? r.closing_order_book.toFixed(2) : '—'}</td>
              <td style="color:var(--muted);">${r.cum_executed_fy != null ? r.cum_executed_fy.toFixed(2) : '—'}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Quarterly summary table -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">Quarterly Summary</div>
    </div>
    <div class="card-body" style="padding:0;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Quarter</th>
            <th>Months Reported</th>
            <th>Total Execution</th>
            <th>Total Inflow</th>
            <th>Closing OB</th>
            <th>B2B Ratio</th>
          </tr>
        </thead>
        <tbody>
          ${quarters
            .map((q, i) => {
              const b2b = q.exec > 0 ? (q.inflow / q.exec).toFixed(2) : '—';
              const isLatest = i === quarters.length - 1;
              return `
              <tr class="${isLatest ? 'latest-row' : ''}">
                <td class="${isLatest ? 'q-highlight' : ''}">${q.key}</td>
                <td>${q.months.length}/3</td>
                <td style="color:var(--accent);font-weight:600;">₹${q.exec.toFixed(1)} Cr</td>
                <td>₹${q.inflow.toFixed(1)} Cr</td>
                <td style="color:var(--green);">${q.closing_ob != null ? '₹' + q.closing_ob.toFixed(1) + ' Cr' : '—'}</td>
                <td style="color:${+b2b >= 1 ? 'var(--green)' : 'var(--red)'};">${b2b}x</td>
              </tr>
            `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  </div>

</div>

<!-- ── Footnote ── -->
<div class="footnote">
  <span class="tag tag-amber">⚠ NOTE</span>
  "Execution" = aggregate invoices raised on customers during the month. Revenue recognised under IndAS 115 may differ based on performance obligation transfer.
  &nbsp;·&nbsp; Jan+Feb-25 PDF covers 2 months; values split equally as estimates.
  &nbsp;·&nbsp; July 2025 data not available (no announcement filed).
  &nbsp;·&nbsp; Order Inflow includes inflow + amendments + currency fluctuations on export orders.
  &nbsp;·&nbsp; DEE Thailand orders converted at prevailing THB/INR rate on closing date.
  <br><br>
  <span class="tag tag-green">PIPELINE</span>
  Data source: NSE:DEEDEV monthly order book annexure PDFs.
  Generated: ${new Date().toISOString()} · monthly-sales-tracker/render-deedev-report.js
</div>

<script>
const ACCENT  = '#6c8cff';
const GREEN   = '#34d399';
const AMBER   = '#fbbf24';
const TEAL    = '#22d3ee';
const PURPLE  = '#a78bfa';
const ORANGE  = '#f97316';
const GRID    = 'rgba(38,48,80,0.5)';
const FONT    = "'Inter', sans-serif";

Chart.defaults.font.family = FONT;
Chart.defaults.color = '#8899aa';

const labels     = ${json(labels)};
const execData   = ${json(execData)};
const inflowData = ${json(inflowData)};
const obData     = ${json(obData)};
const qLabels    = ${json(qLabels)};
const qExec      = ${json(qExec)};
const qInflow    = ${json(qInflow)};
const qOB        = ${json(qOB)};

// ── Main Chart: Execution (bar) + Closing OB (line, right axis) ──
new Chart(document.getElementById('mainChart'), {
  data: {
    labels,
    datasets: [
      {
        type: 'bar',
        label: 'Monthly Execution (₹ Cr)',
        data: execData,
        backgroundColor: labels.map((_, i) => i === labels.length - 1
          ? 'rgba(108,140,255,0.85)' : 'rgba(108,140,255,0.45)'),
        borderColor: ACCENT,
        borderWidth: 1,
        yAxisID: 'y',
        order: 2,
      },
      {
        type: 'line',
        label: 'Closing Order Book (₹ Cr)',
        data: obData,
        borderColor: GREEN,
        backgroundColor: 'rgba(52,211,153,0.07)',
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: GREEN,
        tension: 0.35,
        fill: false,
        yAxisID: 'y2',
        order: 1,
      },
    ],
  },
  options: {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#aab4c8', usePointStyle: true, pointStyleWidth: 10, padding: 20 } },
      tooltip: {
        backgroundColor: '#1c2438',
        borderColor: '#263050',
        borderWidth: 1,
        callbacks: {
          label: ctx => ' ' + ctx.dataset.label + ': \u20b9' + (ctx.parsed.y?.toFixed(2)) + ' Cr',
        },
      },
    },
    scales: {
      x: { grid: { color: GRID }, ticks: { maxRotation: 45 } },
      y: {
        grid: { color: GRID },
        title: { display: true, text: 'Execution ₹ Cr', color: ACCENT },
      },
      y2: {
        position: 'right',
        grid: { drawOnChartArea: false },
        title: { display: true, text: 'Order Book ₹ Cr', color: GREEN },
      },
    },
  },
});

// ── Inflow Chart ──
new Chart(document.getElementById('inflowChart'), {
  type: 'bar',
  data: {
    labels,
    datasets: [{
      label: 'Order Inflow (₹ Cr)',
      data: inflowData,
      backgroundColor: inflowData.map(v =>
        v > 200 ? 'rgba(34,211,238,0.7)' :
        v > 100 ? 'rgba(34,211,238,0.5)' :
                  'rgba(34,211,238,0.35)'),
      borderColor: TEAL,
      borderWidth: 1,
    }],
  },
  options: {
    responsive: true,
    plugins: {
      legend: { labels: { color: '#aab4c8', usePointStyle: true } },
      tooltip: {
        backgroundColor: '#1c2438', borderColor: '#263050', borderWidth: 1,
        callbacks: { label: ctx => ' Order Inflow: \u20b9' + (ctx.parsed.y?.toFixed(2)) + ' Cr' },
      },
    },
    scales: {
      x: { grid: { color: GRID }, ticks: { maxRotation: 45 } },
      y: { grid: { color: GRID }, title: { display: true, text: '₹ Cr', color: TEAL } },
    },
  },
});

// ── Quarterly grouped chart ──
new Chart(document.getElementById('qChart'), {
  type: 'bar',
  data: {
    labels: qLabels,
    datasets: [
      {
        label: 'Total Execution ₹ Cr',
        data: qExec,
        backgroundColor: 'rgba(108,140,255,0.6)',
        borderColor: ACCENT, borderWidth: 1,
      },
      {
        label: 'Total Inflow ₹ Cr',
        data: qInflow,
        backgroundColor: 'rgba(34,211,238,0.5)',
        borderColor: TEAL, borderWidth: 1,
      },
    ],
  },
  options: {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#aab4c8', usePointStyle: true, padding: 20 } },
      tooltip: {
        backgroundColor: '#1c2438', borderColor: '#263050', borderWidth: 1,
        callbacks: { label: ctx => ' ' + ctx.dataset.label + ': \u20b9' + (ctx.parsed.y?.toFixed(1)) + ' Cr' },
      },
    },
    scales: {
      x: { grid: { color: GRID } },
      y: { grid: { color: GRID }, title: { display: true, text: '₹ Crores', color: '#aab4c8' } },
    },
  },
});
</script>
</body>
</html>`;

// ── Save ──────────────────────────────────────────────────────────────────────
fs.mkdirSync(ASSETS_DIR, { recursive: true });
const outFile = path.join(ASSETS_DIR, `NSE_DEEDEV_order_report_${TODAY}.html`);
fs.writeFileSync(outFile, html);
console.log(`\n🎨 DEEDEV Report Renderer`);
console.log(`   Ticker  : NSE:DEEDEV`);
console.log(`   Records : ${records.length}`);
console.log(`   Period  : ${records[0].date_label} → ${latest.date_label}`);
console.log(`\n✅ Report: ${outFile}`);

// Open in browser
const { exec } = require('child_process');
exec(`open "${outFile}"`, (err) => {
  if (err) console.log('   (open manually)');
});
