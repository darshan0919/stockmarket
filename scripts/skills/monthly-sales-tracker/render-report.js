#!/usr/bin/env node
'use strict';

/**
 * monthly-sales-tracker / render-report.js
 *
 * Renders a self-contained interactive HTML report from:
 *   - sales_data.json   (monthly unit series)
 *   - prediction.json   (regression models + July estimate)
 *
 * Output: data/assets/monthly-sales-tracker/<ticker>_sales_report_<date>.html
 *
 * Usage:
 *   node render-report.js --ticker NSE:TMPV
 */

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt  = (n) => n == null ? 'N/A' : Math.round(n).toLocaleString('en-IN');
const fmtK = (n) => n == null ? 'N/A' : (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
const pct  = (n) => n == null ? '—'   : `${Number(n).toFixed(1)}%`;
const crFmt= (n) => n == null ? 'N/A' : `₹${fmt(n)} Cr`;

function r2Color(r2) {
  if (r2 >= 0.75) return '#22c55e';  // green
  if (r2 >= 0.50) return '#f59e0b';  // amber
  return '#ef4444';                   // red
}

function sigColor(n) {
  if (n == null) return '#94a3b8';
  return n >= 0 ? '#22c55e' : '#ef4444';
}

// ── Chart data builder ────────────────────────────────────────────────────────
function buildChartData(records, ticker) {
  const isMM = ticker && ticker.includes('M&M');
  const validRecords = records.filter((r) => r.month && r.year);
  validRecords.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

  if (isMM) {
    return {
      labels:       validRecords.map((r) => r.date_label),
      pv_domestic:  validRecords.map((r) => r.suv_domestic ?? null),
      pv_exports:   validRecords.map((r) => r.exports       ?? null),
      ev:           validRecords.map((r) => r.tractor_total ?? null),
      total:        validRecords.map((r) => r.auto_total    ?? null),
      _series_labels: ['SUV Domestic', 'Exports', 'Tractors', 'Auto Total'],
    };
  }
  return {
    labels:      validRecords.map((r) => r.date_label),
    pv_domestic: validRecords.map((r) => r.pv_domestic ?? null),
    pv_exports:  validRecords.map((r) => r.pv_ib ?? r.pv_exports ?? null),
    ev:          validRecords.map((r) => r.ev           ?? null),
    total:       validRecords.map((r) => r.pv_total ?? r.total ?? null),
    _series_labels: ['PV Domestic', 'PV Exports', 'Electric Vehicles', 'Total'],
  };
}

// ── HTML template ─────────────────────────────────────────────────────────────
function renderHtml(ticker, salesData, prediction) {
  const records       = salesData.records || [];
  const chartData     = buildChartData(records, ticker);
  const seriesLabels  = chartData._series_labels || ['PV Domestic', 'PV Exports', 'Electric Vehicles', 'Total'];
  const isMM          = ticker && ticker.includes('M&M');
  const models        = prediction.models || {};
  const monthlyPreds  = prediction.monthly_predictions || [];
  const trainingData  = prediction.quarterly_training_data || [];
  const latestPred    = monthlyPreds[monthlyPreds.length - 1] || null;

  const now    = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  const title  = `${ticker.replace('NSE:', '')} Monthly Sales & Financial Predictor`;

  // Quarterly correlation table rows
  const corrRows = trainingData.map((d) => `
    <tr${d.outlier ? ' class="outlier"' : ''}>
      <td>${d.quarter}</td>
      <td>${fmt(d.total_units)}</td>
      <td>${crFmt(d.revenue)}</td>
      <td>${crFmt(d.op)}</td>
      <td>${crFmt(d.pat)}</td>
      ${d.outlier ? `<td class="chip red">⚠ ${d.note || 'Outlier'}</td>` : '<td>—</td>'}
    </tr>`).join('');

  // Monthly predictions section
  const predCards = monthlyPreds.map((p) => `
    <div class="pred-card">
      <div class="pred-month">${p.month_name} ${p.year}</div>
      <div class="pred-units">
        <span class="label">Units Sold</span>
        <span class="value">${fmt(p.actual_units)}</span>
      </div>
      <div class="pred-breakdown">
        <span class="breakdown-item">${isMM ? 'SUV' : 'PV'} Dom <strong>${fmt(p.domestic ?? p.suv_domestic)}</strong></span>
        <span class="breakdown-item">Exp <strong>${fmt(p.exports)}</strong></span>
        ${isMM
          ? `<span class="breakdown-item">CV Dom <strong>${fmt(p.cv_domestic)}</strong></span>`
          : `<span class="breakdown-item">EV <strong>${fmt(p.ev)}</strong></span>`
        }
      </div>
      <div class="kpi-row">
        <div class="kpi">
          <div class="kpi-label">Revenue</div>
          <div class="kpi-val">${crFmt(p.predicted_revenue_cr)}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Op Profit</div>
          <div class="kpi-val" style="color:${sigColor(p.predicted_op_cr)}">${crFmt(p.predicted_op_cr)}</div>
          <div class="kpi-sub">OPM ${pct(p.predicted_opm_pct)}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">PAT</div>
          <div class="kpi-val" style="color:${sigColor(p.predicted_pat_cr)}">${crFmt(p.predicted_pat_cr)}</div>
          <div class="kpi-sub">NPM ${pct(p.predicted_npm_pct)}</div>
        </div>
      </div>
      <div class="pred-note">⚡ ${p.confidence}</div>
    </div>`).join('');

  const chartDataJson = JSON.stringify(chartData);
  const modelsJson    = JSON.stringify(models);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${title}</title>
<meta name="description" content="Monthly unit sales trend and financial prediction for ${ticker} using OLS regression on consolidated quarterly financials."/>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
/* ─── Design system ─────────────────────────────────────────────────────── */
:root {
  --bg:          #0a0e1a;
  --surface:     #111827;
  --surface2:    #1a2235;
  --border:      #1f2d45;
  --text:        #e2e8f0;
  --muted:       #64748b;
  --accent:      #3b82f6;
  --accent2:     #8b5cf6;
  --green:       #22c55e;
  --amber:       #f59e0b;
  --red:         #ef4444;
  /* chart palette */
  --c-pvdom:     #3b82f6;   /* blue  — PV Domestic */
  --c-pvexp:     #8b5cf6;   /* violet — PV Exports */
  --c-ev:        #22c55e;   /* green  — EV */
  --c-total:     #f59e0b;   /* amber  — Total */
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  line-height: 1.6;
  min-height: 100vh;
}

/* ─── Header ───────────────────────────────────────────────────────────── */
.header {
  background: linear-gradient(135deg, #0d1b2e 0%, #111827 60%, #0d1120 100%);
  border-bottom: 1px solid var(--border);
  padding: 32px 40px 24px;
  position: relative;
  overflow: hidden;
}
.header::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.07) 0%, transparent 60%),
              radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.07) 0%, transparent 60%);
  pointer-events: none;
}
.header-inner { position: relative; max-width: 1400px; margin: 0 auto; }
.ticker-badge {
  display: inline-block;
  background: rgba(59,130,246,0.15);
  border: 1px solid rgba(59,130,246,0.3);
  border-radius: 6px;
  padding: 2px 10px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--accent);
  margin-bottom: 10px;
  letter-spacing: 0.05em;
}
.header h1 {
  font-size: clamp(22px, 4vw, 32px);
  font-weight: 700;
  background: linear-gradient(135deg, #e2e8f0 0%, #94a3b8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 6px;
}
.header-meta { color: var(--muted); font-size: 13px; }
.header-meta strong { color: var(--text); }

/* ─── Layout ────────────────────────────────────────────────────────────── */
.main { max-width: 1400px; margin: 0 auto; padding: 32px 24px; }
.section { margin-bottom: 40px; }
.section-title {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  border-left: 3px solid var(--accent);
  padding-left: 10px;
  margin-bottom: 20px;
}

/* ─── Chart card ────────────────────────────────────────────────────────── */
.chart-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 28px;
  position: relative;
  overflow: hidden;
}
.chart-card::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--accent), var(--accent2), var(--green));
}
.chart-legend {
  display: flex; gap: 20px; flex-wrap: wrap;
  margin-bottom: 20px;
}
.legend-item {
  display: flex; align-items: center; gap: 8px;
  font-size: 12px; color: var(--text); cursor: pointer;
  transition: opacity 0.2s;
}
.legend-item:hover { opacity: 0.8; }
.legend-dot {
  width: 12px; height: 12px; border-radius: 50%;
  flex-shrink: 0;
}
.chart-wrap { position: relative; height: 380px; }

/* ─── Toggle buttons ─────────────────────────────────────────────────────── */
.toggle-group {
  display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;
}
.toggle-btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
  font-family: 'Inter', sans-serif;
}
.toggle-btn.active {
  border-color: var(--accent);
  background: rgba(59,130,246,0.12);
  color: var(--accent);
}

/* ─── Model cards ────────────────────────────────────────────────────────── */
.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}
.model-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  transition: border-color 0.2s, transform 0.2s;
}
.model-card:hover { border-color: rgba(59,130,246,0.4); transform: translateY(-2px); }
.model-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
.model-formula {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: var(--accent);
  background: rgba(59,130,246,0.06);
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 12px;
  word-break: break-word;
}
.model-r2 { display: flex; align-items: center; gap: 10px; }
.r2-bar-wrap { flex: 1; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.r2-bar { height: 100%; border-radius: 3px; transition: width 1.2s cubic-bezier(.25,.8,.25,1); }
.r2-label { font-size: 12px; font-weight: 600; }

/* ─── Prediction cards ───────────────────────────────────────────────────── */
.pred-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 20px; }
.pred-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  position: relative;
  overflow: hidden;
  transition: transform 0.2s, border-color 0.2s;
}
.pred-card:hover { transform: translateY(-3px); border-color: rgba(139,92,246,0.4); }
.pred-card::after {
  content: '';
  position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, var(--accent2), var(--green));
}
.pred-month {
  font-size: 20px; font-weight: 700;
  background: linear-gradient(135deg, #e2e8f0, #94a3b8);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
  margin-bottom: 14px;
}
.pred-units { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.pred-units .label { font-size: 12px; color: var(--muted); }
.pred-units .value { font-size: 26px; font-weight: 700; font-family: 'JetBrains Mono', monospace; color: var(--amber); }
.pred-breakdown { display: flex; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
.breakdown-item { font-size: 11px; color: var(--muted); }
.breakdown-item strong { color: var(--text); }
.kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
.kpi { background: var(--surface2); border-radius: 8px; padding: 12px; }
.kpi-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
.kpi-val { font-size: 15px; font-weight: 700; font-family: 'JetBrains Mono', monospace; color: var(--green); }
.kpi-sub { font-size: 10px; color: var(--muted); margin-top: 2px; }
.pred-note { font-size: 11px; color: var(--amber); background: rgba(245,158,11,0.08); border-radius: 6px; padding: 8px 10px; }

/* ─── Correlation table ──────────────────────────────────────────────────── */
.table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid var(--border); }
table { width: 100%; border-collapse: collapse; background: var(--surface); }
thead tr { background: var(--surface2); }
th { padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap; border-bottom: 1px solid var(--border); }
td { padding: 11px 16px; font-size: 13px; border-bottom: 1px solid rgba(31,45,69,0.6); font-family: 'JetBrains Mono', monospace; white-space: nowrap; }
tr.outlier td { color: var(--amber); }
tr:last-child td { border-bottom: none; }
tr:hover td { background: rgba(59,130,246,0.04); }

/* ─── Chips ──────────────────────────────────────────────────────────────── */
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
.chip.red  { background: rgba(239,68,68,0.12); color: var(--red);  border: 1px solid rgba(239,68,68,0.25); }
.chip.green { background: rgba(34,197,94,0.12); color: var(--green); border: 1px solid rgba(34,197,94,0.25); }
.chip.amber { background: rgba(245,158,11,0.12); color: var(--amber); border: 1px solid rgba(245,158,11,0.25); }

/* ─── Footer ─────────────────────────────────────────────────────────────── */
.footer { text-align: center; padding: 32px 24px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--border); margin-top: 40px; }

/* ─── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 600px) {
  .header { padding: 20px 16px; }
  .main { padding: 20px 12px; }
  .kpi-row { grid-template-columns: 1fr 1fr; }
  .pred-units .value { font-size: 20px; }
}
</style>
</head>
<body>

<!-- Header -->
<header class="header">
  <div class="header-inner">
    <div class="ticker-badge">${ticker}</div>
    <h1>${title}</h1>
    <div class="header-meta">
      Generated <strong>${now}</strong> &nbsp;·&nbsp;
      Source: Stockscans corporate announcements &amp; consolidated quarterly P&amp;L &nbsp;·&nbsp;
      Regression: OLS (n = ${prediction.training_quarters || 0} quarters)
    </div>
  </div>
</header>

<main class="main">

  <!-- ── Chart ──────────────────────────────────────────────────────────── -->
  <section class="section">
    <div class="section-title">Monthly Unit Sales Trend</div>
    <div class="chart-card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
        <div class="chart-legend">
          <div class="legend-item" data-series="pvDomestic">
            <div class="legend-dot" style="background:var(--c-pvdom)"></div>
            <span>${seriesLabels[0]}</span>
          </div>
          <div class="legend-item" data-series="pvExports">
            <div class="legend-dot" style="background:var(--c-pvexp)"></div>
            <span>${seriesLabels[1]}</span>
          </div>
          <div class="legend-item" data-series="ev">
            <div class="legend-dot" style="background:var(--c-ev)"></div>
            <span>${seriesLabels[2]}</span>
          </div>
          <div class="legend-item" data-series="total">
            <div class="legend-dot" style="background:var(--c-total)"></div>
            <span>${seriesLabels[3]}</span>
          </div>
        </div>
        <div class="toggle-group">
          <button class="toggle-btn active" data-mode="line">Lines</button>
          <button class="toggle-btn" data-mode="bar">Bars</button>
        </div>
      </div>
      <div class="chart-wrap">
        <canvas id="salesChart"></canvas>
      </div>
    </div>
  </section>

  <!-- ── Monthly Predictions ─────────────────────────────────────────────── -->
  ${monthlyPreds.length > 0 ? `
  <section class="section">
    <div class="section-title">Standalone Monthly Financial Estimates</div>
    <div class="pred-grid">
      ${predCards}
    </div>
    <p style="color:var(--muted);font-size:12px;margin-top:12px;">
      ⚡ Estimates use prorated quarterly OLS: <code>Y/month ≈ (intercept / 3) + slope × monthly_units</code>.
      These are indicative projections, not full-quarter forecasts.
    </p>
  </section>
  ` : ''}

  <!-- ── Regression Models ──────────────────────────────────────────────── -->
  <section class="section">
    <div class="section-title">Regression Models (Quarterly Units → Financials)</div>
    <div class="model-grid" id="modelGrid"></div>
  </section>

  <!-- ── Quarterly Correlation Table ────────────────────────────────────── -->
  ${trainingData.length > 0 ? `
  <section class="section">
    <div class="section-title">Quarterly Correlation Data (Training Set)</div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Quarter</th>
          <th>Total Units</th>
          <th>Revenue</th>
          <th>Op Profit</th>
          <th>PAT</th>
          <th>Note</th>
        </tr></thead>
        <tbody>${corrRows}</tbody>
      </table>
    </div>
  </section>
  ` : ''}

</main>

<footer class="footer">
  <p>${ticker} Monthly Sales Tracker &nbsp;·&nbsp; monthly-sales-tracker skill &nbsp;·&nbsp; ${now}</p>
  <p style="margin-top:4px;">Data: Stockscans corporate announcements + TMPV consolidated quarterly P&amp;L. Not investment advice.</p>
</footer>

<script>
const CHART_DATA = ${chartDataJson};
const MODELS     = ${modelsJson};

// ── Chart ─────────────────────────────────────────────────────────────────
const ctx = document.getElementById('salesChart').getContext('2d');
Chart.defaults.color = '#64748b';
Chart.defaults.borderColor = '#1f2d45';

const makeDataset = (label, data, color, dashed = false) => ({
  label,
  data,
  borderColor: color,
  backgroundColor: color + '18',
  borderWidth: dashed ? 2 : 2.5,
  borderDash: dashed ? [6, 3] : [],
  pointBackgroundColor: color,
  pointRadius: 4,
  pointHoverRadius: 7,
  tension: 0.35,
  fill: false,
  spanGaps: true,
});

const datasets = {
  pvDomestic: makeDataset('PV Domestic', CHART_DATA.pv_domestic, getComputedStyle(document.documentElement).getPropertyValue('--c-pvdom').trim() || '#3b82f6'),
  pvExports:  makeDataset('PV Exports',  CHART_DATA.pv_exports,  getComputedStyle(document.documentElement).getPropertyValue('--c-pvexp').trim() || '#8b5cf6'),
  ev:         makeDataset('Electric Vehicles', CHART_DATA.ev,    getComputedStyle(document.documentElement).getPropertyValue('--c-ev').trim()   || '#22c55e'),
  total:      makeDataset('Total',       CHART_DATA.total,       getComputedStyle(document.documentElement).getPropertyValue('--c-total').trim() || '#f59e0b', true),
};

// Fall back to hardcoded colors if CSS vars not readable
datasets.pvDomestic.borderColor = '#3b82f6'; datasets.pvDomestic.backgroundColor = '#3b82f618'; datasets.pvDomestic.pointBackgroundColor = '#3b82f6';
datasets.pvExports.borderColor  = '#8b5cf6'; datasets.pvExports.backgroundColor  = '#8b5cf618'; datasets.pvExports.pointBackgroundColor  = '#8b5cf6';
datasets.ev.borderColor         = '#22c55e'; datasets.ev.backgroundColor         = '#22c55e18'; datasets.ev.pointBackgroundColor         = '#22c55e';
datasets.total.borderColor      = '#f59e0b'; datasets.total.backgroundColor      = '#f59e0b18'; datasets.total.pointBackgroundColor      = '#f59e0b';

let chartType = 'line';
const chart = new Chart(ctx, {
  type: chartType,
  data: { labels: CHART_DATA.labels, datasets: Object.values(datasets) },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#111827',
        borderColor: '#1f2d45',
        borderWidth: 1,
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        padding: 12,
        callbacks: {
          label: (ctx) => ' ' + ctx.dataset.label + ': ' + (ctx.raw != null ? ctx.raw.toLocaleString('en-IN') : 'N/A') + ' units',
        }
      }
    },
    scales: {
      x: { grid: { color: '#1f2d45' }, ticks: { maxRotation: 45, font: { size: 11, family: 'JetBrains Mono' } } },
      y: { grid: { color: '#1f2d45' }, ticks: { font: { size: 11 }, callback: (v) => v >= 1000 ? (v/1000).toFixed(0)+'K' : v } },
    },
  }
});

// Legend click toggle
document.querySelectorAll('.legend-item').forEach((el) => {
  el.addEventListener('click', () => {
    const key = el.dataset.series;
    const ds  = chart.data.datasets.find((d) => d.label === datasets[key].label);
    if (!ds) return;
    ds.hidden = !ds.hidden;
    el.style.opacity = ds.hidden ? '0.35' : '1';
    chart.update();
  });
});

// Chart type toggle
document.querySelectorAll('.toggle-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.toggle-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.mode;
    chart.config.type = mode;
    // bars don't support spanGaps the same way
    chart.data.datasets.forEach((d) => { d.fill = mode === 'bar'; });
    chart.update();
  });
});

// ── Render model cards ─────────────────────────────────────────────────────
const modelGrid = document.getElementById('modelGrid');
const modelDefs = [
  { key: 'revenue', label: 'Revenue',       color: '#3b82f6' },
  { key: 'op',      label: 'Operating Profit', color: '#22c55e' },
  { key: 'pat',     label: 'PAT',           color: '#8b5cf6' },
];
modelDefs.forEach(({ key, label, color }) => {
  const m = MODELS[key];
  if (!m) return;
  const r2 = m.r2_pct || 0;
  const barColor = r2 >= 75 ? '#22c55e' : r2 >= 50 ? '#f59e0b' : '#ef4444';
  const card = document.createElement('div');
  card.className = 'model-card';
  card.innerHTML = \`
    <div class="model-label">\${label}</div>
    <div class="model-formula">\${m.monthly_formula || m.formula}</div>
    <div class="model-r2">
      <span class="kpi-label" style="font-size:11px">R²</span>
      <div class="r2-bar-wrap"><div class="r2-bar" style="width:0%;background:\${barColor}" data-r2="\${r2}"></div></div>
      <span class="r2-label" style="color:\${barColor}">\${r2}%</span>
    </div>
    <div style="font-size:11px;color:#64748b;margin-top:8px;">n = \${m.n} quarters trained</div>
  \`;
  modelGrid.appendChild(card);
});

// Animate R² bars on load
requestAnimationFrame(() => {
  document.querySelectorAll('.r2-bar').forEach((bar) => {
    bar.style.width = bar.dataset.r2 + '%';
  });
});
</script>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) {
    console.log('Usage: node render-report.js --ticker NSE:TMPV [--open]');
    process.exit(0);
  }

  const tickerIdx = argv.indexOf('--ticker');
  if (tickerIdx === -1) { console.error('--ticker required'); process.exit(1); }
  const ticker    = argv[tickerIdx + 1];
  const doOpen    = argv.includes('--open');
  const safeTicker = ticker.replace(/[^A-Za-z0-9]+/g, '_');
  const runDir     = path.join(REPO_ROOT, 'data', 'runs', 'monthly-sales-tracker', safeTicker);

  const salesFile = path.join(runDir, 'sales_data.json');
  const predFile  = path.join(runDir, 'prediction.json');

  console.log(`\n🎨 Report Renderer`);
  console.log(`   Ticker: ${ticker}`);

  if (!fs.existsSync(salesFile)) { console.error(`Missing: ${salesFile}`); process.exit(1); }
  if (!fs.existsSync(predFile))  { console.error(`Missing: ${predFile}`);  process.exit(1); }

  const salesData  = JSON.parse(fs.readFileSync(salesFile, 'utf8'));
  const prediction = JSON.parse(fs.readFileSync(predFile,  'utf8'));

  const html = renderHtml(ticker, salesData, prediction);

  const dateStr = new Date().toISOString().slice(0, 10);
  const outDir  = path.join(REPO_ROOT, 'data', 'assets', 'monthly-sales-tracker');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${safeTicker}_sales_report_${dateStr}.html`);
  fs.writeFileSync(outFile, html);

  console.log(`\n✅ Report: ${outFile}`);

  if (doOpen) {
    const { exec } = require('child_process');
    exec(`open "${outFile}"`, (e) => { if (e) console.warn('Could not auto-open:', e.message); });
  }

  console.log('\n── Token-optimization note ─────────────────────────────────────────');
  console.log('   HTML is purely template-rendered from sales_data + prediction JSON.');
  console.log('   No LLM calls; can be regenerated instantly from stored DTOs.');

  return outFile;
}

if (require.main === module) {
  main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
}

module.exports = { renderHtml, buildChartData };
