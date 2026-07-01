'use strict';

const fs = require('fs');
const path = require('path');

const RATING_COLORS = {
    'HIGH': '#27AE60',
    'MEDIUM': '#2b6cb0',
    'MIXED': '#F39C12',
    'WATCH': '#E67E22',
    'RED': '#E74C3C',
};

const STATUS_COLORS = {
    'DELIVERED': '#27AE60',
    'ON TRACK': '#2ECC71',
    'MIXED': '#F39C12',
    'MISSING': '#95A5A6',
    'TOO EARLY': '#95A5A6',
    'MISSED': '#E74C3C',
    'WITHDRAWN': '#9B2C2C',
};

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function _rowHtml(promise) {
    const status = (promise.status || '').toUpperCase().trim();
    const color = STATUS_COLORS[status] || STATUS_COLORS['MIXED'];
    return `
        <tr>
            <td>${escapeHtml(promise.quarter || '')}</td>
            <td>${escapeHtml(promise.promise || '')}</td>
            <td>${escapeHtml(promise.outcome || '')}</td>
            <td>${escapeHtml(promise.metric_type || '—')}</td>
            <td><span class="status-pill" style="background: ${color};">${escapeHtml(status || "—")}</span></td>
        </tr>`;
}

function _caseStudyBlock(caseStudyMatch) {
    if (!caseStudyMatch) return '';
    const descriptions = {
        'Mayur': 'Under-promise / over-deliver. Premium credibility — accumulate on dips.',
        'Navin': 'Multi-driver outperformance. Premium-quality compounder.',
        'Hikal': 'Over-optimistic guidance with deteriorating language. Watch / reduce.',
        'Gravita': 'Mixed delivery — some metrics beat, some miss. Reset to base case.',
    };
    const desc = descriptions[caseStudyMatch] || '';
    return `
        <div class="case-study-callout">
            <strong>Case-study match: ${escapeHtml(caseStudyMatch)}</strong> &mdash; ${escapeHtml(desc)}
        </div>`;
}

function createCredibilityWidget(data) {
    const outputPath = data.output_path;
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const score = data.score || 0;
    const rating = data.rating || 'MEDIUM';
    const ratingColor = RATING_COLORS[rating.toUpperCase()] || RATING_COLORS['MEDIUM'];

    const promisesRows = (data.promises || []).map(p => _rowHtml(p)).join('\n        ') || '<tr><td colspan="5">No promises tracked yet.</td></tr>';
    
    const beatRatePct = Math.round((data.beat_rate || 0.0) * 100);

    const scoreSign = score > 0 ? '+' : (score === 0 ? '' : '-');
    const scoreAbs = Math.abs(score);

    const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(data.company_name || '')} — Management Credibility Tracker</title>
<style>
:root {
  --bg: #f7fafc;
  --surface: #ffffff;
  --border: #e2e8f0;
  --text: #1a202c;
  --muted: #4a5568;
  --primary: #1a365d;
  --secondary: #2b6cb0;
  --tint: #ebf8ff;
  --good: #27AE60;
  --warn: #F39C12;
  --bad: #E74C3C;
  --neutral: #95A5A6;
}
[data-theme="dark"] {
  --bg: #1a1f2e;
  --surface: #232938;
  --border: #2d3748;
  --text: #e2e8f0;
  --muted: #a0aec0;
  --primary: #1B2A4A;
  --secondary: #2C4A7C;
  --tint: #2C4A7C;
  --good: #27AE60;
  --warn: #F39C12;
  --bad: #E74C3C;
  --neutral: #95A5A6;
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
}
.container { max-width: 1080px; margin: 0 auto; }
.header {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px 24px;
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 16px;
}
.header-text h1 { margin: 0 0 4px 0; font-size: 22px; color: var(--primary); }
.header-text .meta { color: var(--muted); font-size: 13px; }
.score-badge {
  font-size: 32px; font-weight: bold; color: white;
  padding: 12px 24px; border-radius: 8px; text-align: center;
  min-width: 140px;
}
.score-badge .small { font-size: 12px; font-weight: normal; display: block; }
.kpi-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px; margin-bottom: 16px;
}
.kpi {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 14px;
}
.kpi-label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
.kpi-value { font-size: 18px; font-weight: bold; color: var(--text); margin-top: 4px; }
.section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 18px 22px;
  margin-bottom: 16px;
}
.section h2 { margin: 0 0 12px 0; color: var(--primary); font-size: 16px; }
table.scoreboard {
  width: 100%; border-collapse: collapse; font-size: 12px;
}
table.scoreboard th, table.scoreboard td {
  padding: 8px 10px; border-bottom: 1px solid var(--border);
  text-align: left; vertical-align: top;
}
table.scoreboard th { background: var(--tint); color: var(--primary); font-weight: bold; }
.status-pill {
  display: inline-block; padding: 3px 8px; border-radius: 4px;
  color: white; font-weight: bold; font-size: 11px; text-align: center;
  min-width: 80px;
}
.case-study-callout {
  background: var(--tint); border-left: 4px solid var(--primary);
  padding: 12px 18px; border-radius: 4px; font-size: 13px;
  margin-top: 12px;
}
.case-study-callout strong { color: var(--primary); }
.theme-toggle {
  position: fixed; top: 16px; right: 16px;
  padding: 8px 14px; border-radius: 6px; cursor: pointer;
  background: var(--surface); border: 1px solid var(--border);
  color: var(--text); font-size: 12px;
}
.disclaimer {
  font-size: 10px; color: var(--muted);
  margin-top: 24px; padding: 12px 16px;
  background: var(--surface); border-radius: 4px;
  font-style: italic;
}
</style>
</head>
<body>
<button class="theme-toggle" onclick="toggleTheme()">Toggle theme</button>
<div class="container">

  <div class="header">
    <div class="header-text">
      <h1>${escapeHtml(data.company_name || '')}</h1>
      <div class="meta">${escapeHtml(data.ticker || '')} &nbsp;•&nbsp; Tracking: ${escapeHtml(data.tracking_window || '')}</div>
    </div>
    <div class="score-badge" style="background: ${ratingColor};">
      ${scoreSign}${scoreAbs}
      <span class="small">${escapeHtml(rating)}</span>
    </div>
  </div>

  <div class="kpi-strip">
    <div class="kpi">
      <div class="kpi-label">Promises closed</div>
      <div class="kpi-value">${data.promises_closed || 0}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Beat rate</div>
      <div class="kpi-value">${beatRatePct}%</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Most credible metric</div>
      <div class="kpi-value">${escapeHtml(data.most_credible_metric || '—')}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Most missed metric</div>
      <div class="kpi-value">${escapeHtml(data.most_missed_metric || '—')}</div>
    </div>
  </div>

  <div class="section">
    <h2>Walk-the-Talk Scoreboard</h2>
    <table class="scoreboard">
      <thead>
        <tr>
          <th style="width: 80px;">Quarter</th>
          <th>Promise</th>
          <th>Outcome</th>
          <th style="width: 100px;">Metric</th>
          <th style="width: 110px;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${promisesRows}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h2>Interpretation</h2>
    <p>${escapeHtml(data.interpretation || '')}</p>
    ${_caseStudyBlock(data.case_study_match)}
  </div>

  <div class="disclaimer">
    This analysis tracks management's quantitative guidance vs actual outcomes across ${data.promises_closed || 0} closed promises.
    +1 = beat or on-track; -1 = missed (>10% below guidance). Promises in flight (TOO EARLY / MISSING) are excluded
    from the score. Not investment advice; primary documents and live verification recommended before acting.
  </div>
</div>
<script>
function toggleTheme() {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
}
</script>
</body>
</html>
`;

    fs.writeFileSync(outputPath, htmlTemplate, 'utf-8');
    console.log(`✅ Credibility widget saved to: ${outputPath}`);
    return outputPath;
}

function getCredibilitySchema(data) {
    return {
        company_name: data.company_name,
        ticker: data.ticker,
        score: data.score,
        rating: data.rating,
        beat_rate: data.beat_rate,
        promises_closed: data.promises_closed,
        most_credible_metric: data.most_credible_metric,
        most_missed_metric: data.most_missed_metric,
        case_study_match: data.case_study_match,
        interpretation: data.interpretation,
    };
}

module.exports = { createCredibilityWidget, getCredibilitySchema };
