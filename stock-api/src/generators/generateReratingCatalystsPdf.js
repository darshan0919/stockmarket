'use strict';

/**
 * @fileoverview Deterministic skill-level PDF/HTML report generator for rerating-catalysts.
 * Enforces uniform typography, institutional palette, and layout consistency matching
 * skills/_shared/pdf-design-guide.md and stock-api/src/utils/pdfRenderer.js.
 *
 * Fixed sections render with strict layout and color predictability.
 * Dedicated space for runtime improvisation is preserved via data.additional.
 */

const fs = require('fs');
const path = require('path');
const { wrapHtml, renderPdf } = require('../utils/pdfRenderer');
const { INSTITUTIONAL_LIGHT, formatInlineMarkdown, styledTableHtml } = require('../utils/pdfUtils');
const { renderAdditionalHtml } = require('../utils/renderAdditional');

/**
 * Maps conviction tags to consistent chip CSS classes.
 * @param {string} tag
 * @returns {string}
 */
function getConvictionClass(tag) {
  const t = (tag || '').toUpperCase();
  if (t.includes('HIGH') || t.includes('STRONG') || t.includes('EARLY')) return 'chip-g';
  if (t.includes('MED') || t.includes('MODERATE') || t.includes('IN_PROGRESS')) return 'chip-y';
  if (t.includes('WEAK') || t.includes('SPENT') || t.includes('FAIL') || t.includes('RED'))
    return 'chip-r';
  return 'chip-b';
}

/**
 * Renders the top J-Curve Inflection Banner.
 * @param {Object} data
 * @returns {string}
 */
function renderJCurveBanner(data) {
  const tag = (data.jCurveTag || data.j_curve_tag || 'NONE').toUpperCase();
  const reason = data.jCurveReason || data.j_curve_reason || 'Awaiting inflection confirmation';
  const tagClass = getConvictionClass(tag);

  const phase = data.reratingPhase || data.rerating_phase || '';
  const spentFlags = data.spentFlags || data.spent_flags || [];
  const fakeFlags = data.fakeFlags || data.fake_flags || [];

  const health = data.combinedLeverageMultiple || data.health || {};
  const clm = health.combinedLeverageMultiple || health.clm || data.clm || null;
  const ol = health.operatingLeverage || data.operatingLeverage || null;
  const fl = health.financialLeverage || data.financialLeverage || null;
  const patGrowth = health.patGrowthYoY || data.patGrowth || null;

  let metricsLine = '';
  const parts = [];
  if (clm !== null) parts.push(`Combined Leverage Multiple: <b>${clm}x</b>`);
  if (ol !== null) parts.push(`Operating Leverage: <b>${ol}x</b>`);
  if (fl !== null) parts.push(`Financial Leverage: <b>${fl}x</b>`);
  if (patGrowth !== null) parts.push(`PAT Growth YoY: <b>${patGrowth}%</b>`);
  if (phase) parts.push(`Phase: <span class="chip ${getConvictionClass(phase)}">${phase}</span>`);
  if (parts.length) {
    metricsLine = `<div style="font-size: 8.8px; margin-top: 4px; color: ${INSTITUTIONAL_LIGHT.text};">${parts.join(' &nbsp;|&nbsp; ')}</div>`;
  }

  let flagsLine = '';
  if (spentFlags.length || fakeFlags.length) {
    const allFlags = [
      ...spentFlags.map((f) => `<span class="chip chip-r">SPENT: ${f}</span>`),
      ...fakeFlags.map((f) => `<span class="chip chip-y">RISK: ${f}</span>`),
    ];
    flagsLine = `<div style="margin-top: 3px;">${allFlags.join(' ')}</div>`;
  }

  return `
    <div style="background-color: ${INSTITUTIONAL_LIGHT.tint}; border: 1px solid ${INSTITUTIONAL_LIGHT.border}; border-left: 4px solid ${tag === 'STRONG' ? '#5bad3a' : tag === 'MODERATE' ? '#ef9f27' : '#3a85c9'}; border-radius: 4px; padding: 8px 12px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-family: monospace; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: ${INSTITUTIONAL_LIGHT.muted};">J-Curve Inflection Status</span>
        <span class="chip ${tagClass}" style="font-size: 10px; padding: 3px 8px;">J-CURVE: ${tag}</span>
      </div>
      <div style="font-size: 10.5px; font-weight: 500; margin-top: 3px; color: ${INSTITUTIONAL_LIGHT.primary};">${formatInlineMarkdown(reason)}</div>
      ${metricsLine}
      ${flagsLine}
    </div>
  `;
}

/**
 * Renders company snapshot and 8-column KPI table.
 * @param {Object} data
 * @returns {string}
 */
function renderCompanySnapshot(data) {
  let html = `<div class="sec">`;
  html += `<div class="sec-hd">01&nbsp;&nbsp;Company Snapshot & Financial Baseline</div>`;

  if (data.snapshot) {
    html += `<p style="font-size: 10px; margin-bottom: 6px;">${formatInlineMarkdown(data.snapshot)}</p>`;
  }

  const headers = data.kpiHeaders || data.kpi_headers;
  const values = data.kpiValues || data.kpi_values;

  if (headers && values && headers.length && values.length) {
    const rows = [headers, values.map((v) => String(v !== undefined && v !== null ? v : '—'))];
    html += styledTableHtml(rows, INSTITUTIONAL_LIGHT);
  }

  html += `</div>`;
  return html;
}

/**
 * Renders ranked core growth catalysts.
 * @param {Array<Object>} catalysts
 * @returns {string}
 */
function renderCatalysts(catalysts) {
  if (!catalysts || !catalysts.length) return '';
  let html = `<div class="sec">`;
  html += `<div class="sec-hd">02&nbsp;&nbsp;Core Growth Catalysts (Ranked by Forward EPS Accrual)</div>`;

  catalysts.forEach((c, idx) => {
    const num = idx + 1;
    const name = c.name || c.title || 'Catalyst';
    const conv = c.conviction || 'MEDIUM CONVICTION';
    const convCls = getConvictionClass(conv);

    const categories = Array.isArray(c.newCategory || c.categories)
      ? (c.newCategory || c.categories)
          .map((cat) => `<span class="chip chip-b">${cat}</span>`)
          .join(' ')
      : c.newCategory
        ? `<span class="chip chip-b">${c.newCategory}</span>`
        : '';

    const newVsConf = c.newVsConfirmation || c.new_vs_confirmation;
    const newVsConfChip = newVsConf
      ? `<span class="chip ${newVsConf.toUpperCase().includes('NEW') ? 'chip-g' : 'chip-y'}">${newVsConf}</span>`
      : '';

    const jStage = c.jCurveStage || c.j_curve_stage;
    const jStageChip = jStage ? `<span class="chip chip-b">Stage: ${jStage}</span>` : '';

    const body = c.body || c.description || c.rationale || '';
    const impact = c.impact || 'Awaiting disclosure';
    const timeline = c.timeline || 'Unspecified';
    const marker = c.forwardMarker || c.forward_marker || '';
    const sources = Array.isArray(c.sources) ? c.sources.join(', ') : c.sources || '';

    html += `
      <div style="background-color: #ffffff; border: 0.5px solid ${INSTITUTIONAL_LIGHT.border}; border-radius: 4px; padding: 7px 10px; margin-bottom: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
          <div>
            <span style="font-weight: 600; font-size: 10.5px; color: ${INSTITUTIONAL_LIGHT.primary};">${num}. ${formatInlineMarkdown(name)}</span>
            <div style="margin-top: 2px;">${categories} ${newVsConfChip} ${jStageChip}</div>
          </div>
          <span class="chip ${convCls}">${conv}</span>
        </div>
        <p style="font-size: 9.8px; margin: 3px 0; color: ${INSTITUTIONAL_LIGHT.text}; text-align: justify;">${formatInlineMarkdown(body)}</p>
        <div style="font-size: 8.8px; color: ${INSTITUTIONAL_LIGHT.muted}; border-top: 0.5px solid ${INSTITUTIONAL_LIGHT.border}; padding-top: 3px; margin-top: 4px;">
          <span><b>Impact:</b> ${formatInlineMarkdown(impact)}</span> &nbsp;|&nbsp;
          <span><b>Timeline:</b> ${formatInlineMarkdown(timeline)}</span>
          ${marker ? ` &nbsp;|&nbsp; <span><b>Forward Marker:</b> ${formatInlineMarkdown(marker)}</span>` : ''}
          ${sources ? ` &nbsp;|&nbsp; <span><b>Sources:</b> ${formatInlineMarkdown(sources)}</span>` : ''}
        </div>
      </div>
    `;
  });

  html += `</div>`;
  return html;
}

/**
 * Renders weekly announcement flow, management interviews, and spike days.
 * @param {Object} data
 * @returns {string}
 */
function renderFlowAndActivity(data) {
  let html = `<div class="sec">`;
  html += `<div class="sec-hd">03&nbsp;&nbsp;Recent Corporate Flow & Management Activity</div>`;

  // Weekly Flow
  if (data.weeklyFlow || data.weekly_flow) {
    const flow = data.weeklyFlow || data.weekly_flow;
    const signals = flow.signalItems || flow.signals || [];
    const noise = flow.noiseItems || flow.noise || [];

    html += `<div style="margin-bottom: 6px;">`;
    html += `<div class="label" style="margin-bottom: 2px;">Announcement Pulse (Trailing 7 Days)</div>`;
    if (signals.length) {
      signals.forEach((s) => {
        html += `<p style="font-size: 9.5px; margin: 2px 0;">• <b>[SIGNAL]</b> ${formatInlineMarkdown(typeof s === 'string' ? s : s.text || s.title || '')}</p>`;
      });
    } else {
      html += `<p style="font-size: 9.5px; color: ${INSTITUTIONAL_LIGHT.muted}; margin: 2px 0;">• No high-materiality announcement signals filed in the trailing 7 days (quiet week).</p>`;
    }
    if (noise.length) {
      html += `<p style="font-size: 8.5px; color: ${INSTITUTIONAL_LIGHT.muted}; margin-top: 2px;">Filtered routine compliance filings: ${noise.length} items (AGM, book closure, investor meetings).</p>`;
    }
    html += `</div>`;
  }

  // Management Interviews
  const interviews = data.managementInterviews || data.management_interviews;
  if (interviews && interviews.length) {
    html += `<div style="margin-bottom: 6px;">`;
    html += `<div class="label" style="margin-bottom: 2px;">Management Interview Scans (Trailing 3 Months)</div>`;
    interviews.forEach((iv) => {
      const title = iv.title || 'Management Interview';
      const channel = iv.channelName || iv.channel || '';
      const date = iv.publishedAt || iv.date || '';
      const feeds = iv.feedsCatalyst ? ' <span class="chip chip-g">FEEDS CATALYST</span>' : '';
      html += `<p style="font-size: 9.5px; margin: 2px 0;">📺 <b>${formatInlineMarkdown(title)}</b> <span class="subnum">(${channel}${date ? ` &middot; ${date}` : ''})</span>${feeds}</p>`;
    });
    html += `</div>`;
  }

  // Price-Volume Spike Days
  const spikes = data.spikeDays || data.spike_days;
  if (spikes && spikes.length) {
    html += `<div style="margin-bottom: 6px;">`;
    html += `<div class="label" style="margin-bottom: 2px;">Price-Volume Spike Days (Abnormal Volume Clustered Gains)</div>`;
    const rows = [['Date', '1D Gain', 'Volume Multiple', 'WHY Basis', 'Resolution & Linkage']];
    spikes.forEach((sp) => {
      rows.push([
        sp.date || '—',
        `${sp.returnPct !== undefined ? `+${sp.returnPct}%` : '—'}`,
        `${sp.volumeMultiple || '—'}x`,
        sp.whyBasis || 'none',
        `${sp.whyDetail || '—'} (${sp.linkage || 'unexplained'})`,
      ]);
    });
    html += styledTableHtml(rows, INSTITUTIONAL_LIGHT);
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

/**
 * Renders what's in the price and market perception.
 * @param {Object} data
 * @returns {string}
 */
function renderWhatsInThePrice(data) {
  const content = data.whatsInThePrice || data.whats_in_the_price || data.in_the_price;
  if (!content) return '';
  let html = `<div class="sec">`;
  html += `<div class="sec-hd">04&nbsp;&nbsp;What's in the Price? (Incremental Perception vs Consensus)</div>`;
  html += `<p style="font-size: 10px; margin-bottom: 4px; text-align: justify;">${formatInlineMarkdown(content)}</p>`;
  html += `</div>`;
  return html;
}

/**
 * Renders key risks and structural exit protocol.
 * @param {Object} data
 * @returns {string}
 */
function renderKeyRisks(data) {
  const risks = data.risks || data.key_risks || [];
  if (!risks.length) return '';
  let html = `<div class="sec">`;
  html += `<div class="sec-hd">05&nbsp;&nbsp;Key Risks & Structural Exit Protocol</div>`;

  risks.forEach((r) => {
    const text = typeof r === 'string' ? r : r.text || r.risk || '';
    html += `<p style="font-size: 9.8px; margin: 2px 0;">⚠ ${formatInlineMarkdown(text)}</p>`;
  });

  html += `
    <div class="hl hl-y" style="margin-top: 5px; font-size: 9.5px;">
      <b>3-Step Exit Protocol (SOIC · Class 7):</b> Invalidate thesis if: (1) Monthly Lower Highs trip, (2) Sector Stage 4 Breakdown confirms below 30-WEMA, (3) Monthly V-Stop flips negative. Cut losses at 8–10% without waiting for delayed audited financials.
    </div>
  `;

  html += `</div>`;
  return html;
}

/**
 * Renders the So-What verdict.
 * @param {Object} data
 * @returns {string}
 */
function renderVerdict(data) {
  const verdict = data.verdict || data.so_what || '';
  if (!verdict) return '';
  let html = `<div class="sec">`;
  html += `<div class="sec-hd">06&nbsp;&nbsp;So-What Verdict & Forward Sizing Stance</div>`;
  html += `<p style="font-size: 10px; margin-bottom: 4px; text-align: justify;">${formatInlineMarkdown(verdict)}</p>`;
  html += `</div>`;
  return html;
}

/**
 * Renders the full Re-rating Catalysts HTML document.
 * @param {Object} data DTO data
 * @param {Object} [options] Rendering options
 * @returns {Promise<{html: string, outputPath: ?string}>}
 */
async function createReratingCatalystsPdf(data, options = {}) {
  const companyName = data.company_name || data.companyName || data.company || '';
  const ticker = data.ticker || data.companyId || '';
  const date = data.date || '';
  const cmp = data.cmp || '—';
  const marketCap = data.market_cap || data.marketCap || '—';
  const capCategory = data.capCategory || data.cap_category || '';
  const sector = data.sector || '';
  const growthBucket = data.growthBucket || data.growth_bucket || 'Scaling';

  const title = `${companyName} (${ticker}) — Re-rating Catalyst Note`;
  const subtitle = `CMP: ₹${cmp} | Mkt Cap: ₹${marketCap} Cr | ${capCategory} | Sector: ${sector} | Bucket: ${growthBucket}`;
  const eyebrow = `RE-RATING CATALYSTS · ${ticker} · ${date}`;

  let bodyHtml = '';

  // 1. Top J-Curve Inflection Banner
  bodyHtml += renderJCurveBanner(data);

  // 2. Section 01: Company Snapshot & Financial KPIs
  bodyHtml += renderCompanySnapshot(data);

  // 3. Section 02: Core Growth Catalysts
  const catalysts = data.catalysts || [];
  bodyHtml += renderCatalysts(catalysts);

  // 4. Section 03: Flow, Interviews, and Spike Days
  bodyHtml += renderFlowAndActivity(data);

  // 5. Section 04: What's in the Price
  bodyHtml += renderWhatsInThePrice(data);

  // 6. Section 05: Key Risks & Exit Protocol
  bodyHtml += renderKeyRisks(data);

  // 7. Section 06: So-What Verdict
  bodyHtml += renderVerdict(data);

  // 8. Section 07: Runtime Improvisation Space: data.additional
  if (data.additional) {
    bodyHtml += renderAdditionalHtml(data.additional, '07', 'Additional Nuance & Improvisation');
  }

  const modelUsed = data.modelUsed || data.model_used || options.modelUsed;
  const fullHtml = wrapHtml(title, subtitle, bodyHtml, { eyebrow, modelUsed });

  const outputPath = data.output_path || data.outputPath || options.outputPath || null;

  if (outputPath) {
    const dir = path.dirname(path.resolve(outputPath));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (outputPath.endsWith('.html')) {
      fs.writeFileSync(outputPath, fullHtml, 'utf8');
      console.log(`✅ Re-rating Catalysts HTML saved to: ${outputPath}`);
    } else if (outputPath.endsWith('.pdf')) {
      await renderPdf(
        fullHtml,
        outputPath,
        title,
        `${companyName} (${ticker}) Re-rating Catalyst Note`
      );
      console.log(`✅ Re-rating Catalysts PDF rendered to: ${outputPath}`);
    } else {
      // Default to PDF per AGENTS.md §12 and conventions.md §18
      const pdfPath = outputPath.endsWith('.pdf') ? outputPath : `${outputPath}.pdf`;
      await renderPdf(
        fullHtml,
        pdfPath,
        title,
        `${companyName} (${ticker}) Re-rating Catalyst Note`
      );
      console.log(`✅ Re-rating Catalysts PDF rendered to: ${pdfPath}`);
    }
  }

  return {
    html: fullHtml,
    outputPath,
  };
}

module.exports = {
  createReratingCatalystsPdf,
};
