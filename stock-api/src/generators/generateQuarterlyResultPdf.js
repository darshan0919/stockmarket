'use strict';

/**
 * @fileoverview Deterministic skill-level PDF/HTML report generator for quarterly-result-analysis.
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
 * Maps conviction/materiality tags to consistent chip CSS classes.
 * @param {string} tag
 * @returns {string}
 */
function getTagClass(tag) {
  const t = (tag || '').toUpperCase();
  if (/NO_INFLECTION|NOT_APPLICABLE|NOT_YET|NEEDS_ACTUAL|EXCLUDED|EXPIRED|INSUFFICIENT/.test(t)) {
    return 'chip-b';
  }
  if (/MISSED|BEHIND|GUIDANCE MISS/.test(t)) return 'chip-r';
  if (/EMERGING|PARTIAL|MIXED|PENDING/.test(t)) return 'chip-y';
  if (/^(MET|AHEAD|ON_TRACK|DELIVERED|CONFIRMED_AND_BEAT)$/.test(t)) return 'chip-g';
  if (
    t.includes('STRUCTURAL') ||
    t.includes('HIGH') ||
    t.includes('CLEAN') ||
    t.includes('CONFIDENT') ||
    t.includes('PASS') ||
    t.includes('BEAT') ||
    t.includes('PEAD') ||
    t.includes('INFLECTION') ||
    t.includes('SCALE') ||
    t.includes('GROWTH') ||
    t.includes('FUNDED') ||
    t.includes('ACCRETION')
  ) {
    return 'chip-g';
  }
  if (
    t.includes('CYCLICAL') ||
    t.includes('MED') ||
    t.includes('WATCH') ||
    t.includes('CAUTIOUS') ||
    t.includes('DEFENSIVE') ||
    t.includes('WARN') ||
    t.includes('WATCH_Q+1') ||
    t.includes('OPTIONALITY')
  ) {
    return 'chip-y';
  }
  if (
    t.includes('RED') ||
    t.includes('STRAINED') ||
    t.includes('AGGRESSIVE') ||
    t.includes('PRICED_IN') ||
    t.includes('PRICED IN') ||
    t.includes('FAIL') ||
    t.includes('DODGED') ||
    t.includes('RISK')
  ) {
    return 'chip-r';
  }
  return 'chip-b';
}

/**
 * Maps tone strings to KPI tone border classes.
 * @param {string} tone
 * @returns {string}
 */
function getKpiToneClass(tone) {
  const t = (tone || '').toLowerCase();
  if (t === 'pos' || t === 'g' || t === 'green') return 'kpi-g';
  if (t === 'neg' || t === 'r' || t === 'red') return 'kpi-r';
  if (t === 'warn' || t === 'y' || t === 'yellow' || t === 'amber') return 'kpi-y';
  if (t === 'neutral' || t === 'b' || t === 'blue') return 'kpi-b';
  return '';
}

/**
 * Formats a single observation line with a tag chip.
 * @param {string} text
 * @param {string} [tag]
 * @param {string} [prefix]
 * @returns {string}
 */
function renderObservation(text, tag = null, prefix = '•') {
  const tagHtml = tag
    ? ` <span class="chip ${getTagClass(tag)}">${formatInlineMarkdown(tag)}</span>`
    : '';
  return `<p style="margin: 2.5px 0; font-size: 10px;"><b>${prefix}</b> ${formatInlineMarkdown(text || '')}${tagHtml}</p>`;
}

/**
 * Builds the top KPI strip.
 * @param {Array<Object>} kpiCards
 * @returns {string}
 */
function renderKpiStrip(kpiCards) {
  if (!kpiCards || !kpiCards.length) return '';
  const gridClass = kpiCards.length <= 3 ? 'grid3' : 'grid4';

  const cardsHtml = kpiCards
    .map((c) => {
      const toneCls = getKpiToneClass(c.tone);
      const sub = c.subtext || c.comparison || '';
      return `
        <div class="kpi ${toneCls}">
          <div class="label">${formatInlineMarkdown(c.label || '')}</div>
          <div class="bignum">${formatInlineMarkdown(String(c.value !== undefined ? c.value : '—'))}</div>
          ${sub ? `<div class="subnum">${formatInlineMarkdown(sub)}</div>` : ''}
        </div>
      `;
    })
    .join('');

  return `<div class="${gridClass}" style="margin: 6px 0 10px 0;">${cardsHtml}</div>`;
}

/**
 * Builds the statement health strip.
 * @param {Object} health
 * @returns {string}
 */
function renderStatementHealth(health) {
  if (!health) return '';
  const items = [
    { key: 'income', label: 'Income Statement', data: health.income || health.incomeStatement },
    { key: 'balanceSheet', label: 'Balance Sheet', data: health.balanceSheet },
    { key: 'cashflow', label: 'Cash Flow', data: health.cashflow || health.cashFlow },
  ].filter((it) => it.data);

  if (!items.length) return '';

  const cardsHtml = items
    .map((it) => {
      const grade = (it.data.grade || it.data.status || 'CLEAN').toUpperCase();
      const brief = it.data.brief || it.data.summary || it.data.reason || '';
      const chipCls = getTagClass(grade);
      return `
        <div class="kpi" style="padding: 6px 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
            <span class="label" style="margin-bottom: 0;">${it.label}</span>
            <span class="chip ${chipCls}">${grade}</span>
          </div>
          <div style="font-size: 9.2px; color: ${INSTITUTIONAL_LIGHT.text}; line-height: 1.35;">${formatInlineMarkdown(brief)}</div>
        </div>
      `;
    })
    .join('');

  return `
    <div style="margin: 6px 0 10px 0;">
      <div class="label" style="margin-bottom: 3px;">Statement Quality Scans</div>
      <div class="grid3">${cardsHtml}</div>
    </div>
  `;
}

/**
 * Builds verdict chips row.
 * @param {Array<string|Object>} chips
 * @returns {string}
 */
function renderVerdictChips(chips) {
  if (!chips || !chips.length) return '';
  const chipsHtml = chips
    .map((c) => {
      const tag = typeof c === 'string' ? c : c.tag || c.text || '';
      const cls = typeof c === 'object' && c.tone ? `chip-${c.tone}` : getTagClass(tag);
      return `<span class="chip ${cls}">${formatInlineMarkdown(tag)}</span>`;
    })
    .join('');

  return `
    <div style="margin: 4px 0 10px 0;">
      <div class="label" style="margin-bottom: 3px;">Verdict & Catalyst Chips</div>
      <div class="verdict-band">${chipsHtml}</div>
    </div>
  `;
}

/**
 * Builds NBFC Quality Checks section.
 * @param {Object} nbfc
 * @returns {string}
 */
function renderNbfcQualityChecks(nbfc) {
  if (!nbfc) return '';
  let html = `<div class="sec">`;
  html += `<div class="sec-hd">00&nbsp;&nbsp;NBFC & Financial Institution Quality Audit</div>`;

  // RoA Tree
  if (nbfc.roaTree) {
    const r = nbfc.roaTree;
    html += `
      <div class="hl hl-b" style="margin-bottom: 6px;">
        <b>RoA Tree Decomposition:</b> RoA = (NIM ${r.nim || '—'}% + Fee Inc ${r.feeIncome || '—'}%) - Opex ${r.opexToAssets || '—'}% - Credit Cost ${r.creditCostToAssets || '—'}% - Tax = <b>Net RoA ${r.netRoa || r.roa || '—'}%</b>
      </div>
    `;
  }

  // Key Ratios Grid
  const cards = [];
  if (nbfc.assetQuality) {
    const aq = nbfc.assetQuality;
    cards.push(`
      <div class="kpi">
        <div class="label">Asset Quality & Vintages</div>
        <div class="bignum" style="font-size: 13px;">GNPA ${aq.grossNpa || '—'}% | NNPA ${aq.netNpa || '—'}%</div>
        <div class="subnum">6 MOB 30+ DPD: ${aq.mob30Dpd || '—'} | PCR: ${aq.pcr || '—'}%</div>
      </div>
    `);
  }

  if (nbfc.capitalAdequacy) {
    const ca = nbfc.capitalAdequacy;
    cards.push(`
      <div class="kpi">
        <div class="label">Capital & Leverage</div>
        <div class="bignum" style="font-size: 13px;">CRAR ${ca.crar || '—'}% (Tier 1: ${ca.tier1 || '—'}%)</div>
        <div class="subnum">Debt/Equity Multiple: ${ca.debtToEquity || ca.leverage || '—'}x</div>
      </div>
    `);
  }

  if (nbfc.updatedBookValue || nbfc.valuation) {
    const bv = nbfc.updatedBookValue || nbfc.valuation;
    const currentPb =
      bv.pbRatio !== undefined && bv.pbRatio !== null
        ? bv.pbRatio
        : bv.pb !== undefined
          ? bv.pb
          : null;
    const priorPb =
      bv.priorPbRatio !== undefined && bv.priorPbRatio !== null
        ? bv.priorPbRatio
        : bv.priorPb !== undefined
          ? bv.priorPb
          : null;

    let pbDelta = bv.pbDeltaPct || '';
    if (!pbDelta && currentPb !== null && priorPb !== null && Number(priorPb) > 0) {
      const pct = (((Number(currentPb) - Number(priorPb)) / Number(priorPb)) * 100).toFixed(1);
      pbDelta = Number(pct) > 0 ? `+${pct}%` : `${pct}%`;
    }

    const currentBv = bv.bvps !== undefined && bv.bvps !== null ? bv.bvps : null;
    const priorBv = bv.priorBvps !== undefined && bv.priorBvps !== null ? bv.priorBvps : null;
    let bvDelta = bv.bvpsDeltaPct || '';
    if (!bvDelta && currentBv !== null && priorBv !== null && Number(priorBv) > 0) {
      const pct = (((Number(currentBv) - Number(priorBv)) / Number(priorBv)) * 100).toFixed(1);
      bvDelta = Number(pct) > 0 ? `+${pct}%` : `${pct}%`;
    }

    const pbDisplay = currentPb !== null ? `${currentPb}x` : '—';
    const pbContext =
      priorPb !== null ? ` (vs Prior: ${priorPb}x${pbDelta ? `, ${pbDelta}` : ''})` : '';

    const bvDisplay = currentBv !== null ? `₹${currentBv}` : '—';
    const bvContext =
      priorBv !== null ? ` (vs Prior: ₹${priorBv}${bvDelta ? `, ${bvDelta}` : ''})` : '';

    cards.push(`
      <div class="kpi">
        <div class="label">Updated Book Value & P/B Multiple</div>
        <div class="bignum" style="font-size: 11.5px;">P/B: ${pbDisplay}${pbContext}</div>
        <div class="subnum">BVPS: ${bvDisplay}${bvContext} | ${formatInlineMarkdown(bv.benchmark || 'Rate of change reflects capital accretion')}</div>
      </div>
    `);
  }

  if (cards.length) {
    html += `<div class="grid3">${cards.join('')}</div>`;
  }

  if (nbfc.growthFundingGap || nbfc.alm) {
    const gap = nbfc.growthFundingGap || nbfc.alm;
    html += `<div class="hl hl-g" style="margin-top: 6px;"><b>Growth Funding Gap & ALM:</b> ${formatInlineMarkdown(typeof gap === 'string' ? gap : gap.summary || gap.brief || 'CFO loan disbursements funded adequately via debt and equity.')}</div>`;
  }

  html += `</div>`;
  return html;
}

/**
 * Builds Forward Guidance & Bottom-Line Accrual Table.
 * Enforces:
 *   1. Current value along with future guided value.
 *   2. % Change calculation.
 *   3. Derived bottom-line row (PAT for corporates, Book Value for NBFCs).
 *   4. Direct vs Derived indicator chip.
 *   5. Strict guardrail: If dependencies are unguided, cell remains empty ('—')
 *      with explicit note "Dependencies unguided — no extrapolation".
 * @param {Array<Object>|Object} guidance
 * @returns {string}
 */
function renderGuidanceTable(guidance) {
  if (!guidance) return '';
  const rowsData = Array.isArray(guidance) ? guidance : guidance.rows || guidance.metrics || [];
  if (!rowsData.length) return '';

  const headers = [
    'Metric',
    'Current Value (Base)',
    'Guided Value (Target)',
    '% Change',
    'Timeline',
    'Nature',
    'Source / Derivation Basis',
  ];

  const tableRows = [headers];

  rowsData.forEach((r) => {
    const metric = r.metric || r.kpi || '—';
    const currentVal =
      r.currentValue !== undefined && r.currentValue !== null && r.currentValue !== ''
        ? String(r.currentValue)
        : '—';

    const isUnguided =
      r.nature === 'UNGUIDED' ||
      r.unguided === true ||
      (!r.guidedValue && !r.futureValue && !r.target);

    const futureVal = isUnguided ? '—' : String(r.guidedValue || r.futureValue || r.target || '—');
    const rawPct = isUnguided ? '—' : String(r.pctChange || r.deltaPct || r.changePct || '—');

    let pctFormatted = rawPct;
    if (rawPct !== '—') {
      if (rawPct.startsWith('+')) {
        pctFormatted = `<span class="up">${rawPct}</span>`;
      } else if (rawPct.startsWith('-')) {
        pctFormatted = `<span class="dn">${rawPct}</span>`;
      }
    }

    let natureChip = '';
    const natureUpper = String(
      r.nature || (isUnguided ? 'UNGUIDED' : 'DIRECTLY GUIDED')
    ).toUpperCase();

    if (natureUpper.includes('DERIVED')) {
      natureChip = `<span class="chip chip-b">DERIVED</span>`;
    } else if (natureUpper.includes('UNGUIDED') || isUnguided) {
      natureChip = `<span class="chip chip-y">UNGUIDED</span>`;
    } else {
      natureChip = `<span class="chip chip-g">DIRECTLY GUIDED</span>`;
    }

    const note =
      r.derivationBasis ||
      r.sourceQuote ||
      r.source ||
      r.notes ||
      (isUnguided ? 'Dependencies unguided — no extrapolation' : '');

    tableRows.push([
      metric,
      currentVal,
      futureVal,
      pctFormatted,
      r.timeline || r.horizon || '—',
      natureChip,
      note,
    ]);
  });

  let html = `<div class="sec" style="margin-top: 10px;">`;
  html += `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding-bottom: 3px; margin-bottom: 6px;">
      <span class="sec-hd" style="border-bottom: none; margin-bottom: 0; padding-bottom: 0;">Forward Guidance & Bottom-Line Accrual Table</span>
      <span style="font-size: 8.5px; font-family: monospace; color: ${INSTITUTIONAL_LIGHT.muted};">Current vs Guided Targets & Derived Bottom-Line</span>
    </div>
  `;
  html += styledTableHtml(tableRows, INSTITUTIONAL_LIGHT);
  html += `</div>`;
  return html;
}

/**
 * Builds a section header with a right-aligned verdict chip (shared by the three sections below).
 * @param {string} title
 * @param {string} verdict
 * @returns {string}
 */
function sectionHeaderWithChip(title, verdict) {
  return `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding-bottom: 3px; margin-bottom: 6px;">
      <span class="sec-hd" style="border-bottom: none; margin-bottom: 0; padding-bottom: 0;">${title}</span>
      ${verdict ? `<span class="chip ${getTagClass(verdict)}" style="font-size: 9px; padding: 3px 8px;">${formatInlineMarkdown(verdict)}</span>` : ''}
    </div>
  `;
}

/**
 * Builds the Inflection Point section: three legs (margin, guidance trust, new catalyst),
 * verdict, J-curve stage and the revenue → EBITDA → PAT growth ladder.
 * @param {Object} inf DTO.inflectionPoint (resultInflection.finalizeInflection output)
 * @returns {string}
 */
function renderInflectionPoint(inf) {
  if (!inf || !inf.legs) return '';
  const legLabels = {
    margin: 'Margins expanding significantly',
    guidanceTrust: 'Past guidance confirmed & beaten',
    newCatalyst: 'New C-A-T-A-L-Y-S-T trigger',
  };
  const rows = [['Leg', 'Status', 'Evidence']];
  Object.entries(legLabels).forEach(([k, label]) => {
    const leg = inf.legs[k];
    if (!leg) return;
    const status = String(leg.status || '—');
    const note = [leg.reason, leg.conditional].filter(Boolean).join(' — ');
    rows.push([label, `<span class="chip ${getTagClass(status)}">${status}</span>`, note || '—']);
  });
  const ol = inf.operatingLeverage;
  let html = `<div class="sec">`;
  html += sectionHeaderWithChip('Inflection Point', String(inf.verdict || '').replace(/_/g, ' '));
  html += styledTableHtml(rows, INSTITUTIONAL_LIGHT);
  const foot = [];
  if (inf.jCurveStage) foot.push(`<b>J-curve stage:</b> ${inf.jCurveStage}`);
  if (ol) {
    foot.push(
      `<b>Growth ladder (YoY):</b> Revenue ${ol.revenueYoY}% → EBITDA ${ol.ebitdaYoY}% → PAT ${ol.patYoY}%${ol.leverageOrdered ? ' (operating leverage compounding)' : ''}`
    );
  }
  if (foot.length) {
    html += `<p style="margin: 4px 0; font-size: 9.5px;">${foot.join(' &nbsp;·&nbsp; ')}</p>`;
  }
  html += `</div>`;
  return html;
}

/**
 * Builds the Walk the Talk ledger: every prior guide measurable this quarter vs the actual.
 * @param {Object} wtt DTO.walkTheTalk ({rows, summary})
 * @returns {string}
 */
function renderWalkTheTalk(wtt) {
  if (!wtt || !Array.isArray(wtt.rows) || !wtt.rows.length) return '';
  const fmtGuide = (r) => {
    if (r.guidedMid == null) return '—';
    const u = r.unit === '%' ? '%' : r.unit ? ` ${r.unit}` : '';
    const g =
      r.guidedLow !== r.guidedHigh ? `${r.guidedLow}–${r.guidedHigh}${u}` : `${r.guidedMid}${u}`;
    return r.kind === 'growth' ? `${g} growth` : g;
  };
  const shown = wtt.rows.filter((r) => !['NOT_YET_MEASURABLE', 'EXPIRED'].includes(r.status));
  const rows = [
    ['Guided metric', 'Period', 'Guided (stated in)', 'Actual', 'Status', 'Gap / basis'],
  ];
  shown.forEach((r) => {
    const actual =
      r.actual != null ? `${r.actual}${r.unit === '%' ? '%' : ''}` : r.milestoneOutcome || '—';
    const rev = r.revision ? ` · ${r.revision.direction} from ${r.revision.from}` : '';
    rows.push([
      r.metric,
      `${r.period}${r.measurability === 'INTERIM' ? ' (interim)' : ''}`,
      `${fmtGuide(r)} (${r.statedIn}${rev})`,
      actual,
      `<span class="chip ${getTagClass(r.status)}">${r.status}</span>`,
      [r.gap, r.actualBasis || r.excludeReason].filter(Boolean).join(' — ') || '—',
    ]);
  });
  const sm = wtt.summary || {};
  let html = `<div class="sec">`;
  html += sectionHeaderWithChip('Walk the Talk — Prior Guidance vs This Quarter', sm.verdict);
  html += styledTableHtml(rows, INSTITUTIONAL_LIGHT);
  if (sm.scored != null) {
    html += `<p style="margin: 4px 0; font-size: 9.5px;"><b>${sm.beats} beat · ${sm.met} met · ${sm.missed} missed</b> of ${sm.scored} measurable${sm.beatRate != null ? ` (beat rate ${sm.beatRate}%)` : ''}; ${sm.notYetMeasurable || 0} not yet measurable; clean-delivery streak ${sm.consecutiveCleanQuarters || 0} quarter(s).</p>`;
  }
  html += `</div>`;
  return html;
}

/**
 * Builds the Next Inflection timeline (capacity / margin / order-book triggers, nearest first).
 * @param {Object} nx DTO.nextInflection ({triggers, next})
 * @returns {string}
 */
function renderNextInflection(nx) {
  if (!nx || !Array.isArray(nx.triggers) || !nx.triggers.length) return '';
  const rows = [['When', 'Type', 'Trigger', 'Magnitude', 'Train', 'Conviction', 'Source']];
  nx.triggers.forEach((t) => {
    const away =
      t.quartersAway == null ? '' : ` (${t.quartersAway <= 0 ? 'live' : `+${t.quartersAway}Q`})`;
    rows.push([
      `${t.expectedQuarter || '—'}${away}`,
      String(t.type || '').replace('_', ' '),
      t.what || '—',
      t.magnitudeText || '—',
      t.train || '—',
      t.conviction || '—',
      t.source || '—',
    ]);
  });
  const next = nx.next
    ? `NEXT: ${nx.next.type.replace('_', ' ')} · ${nx.next.expectedQuarter}`
    : '';
  let html = `<div class="sec">`;
  html += sectionHeaderWithChip('Next Inflection Point', next);
  html += styledTableHtml(rows, INSTITUTIONAL_LIGHT);
  html += `</div>`;
  return html;
}

/**
 * Builds Basket 1: Business.
 * @param {Object} b1
 * @returns {string}
 */
function renderBasket1(b1) {
  if (!b1) return '';
  let html = `<div class="sec">`;
  html += `<div class="sec-hd">01&nbsp;&nbsp;Basket 1 — Business (What is Improving?)</div>`;

  const sections = [
    { title: 'Growth Drivers', items: b1.growthDrivers || b1.growth_drivers },
    { title: 'Margin & Profitability Triggers', items: b1.marginTriggers || b1.margin_triggers },
    {
      title: 'Capex, Balance Sheet & Cash Flow',
      items: b1.capexBsCashflow || b1.capex_bs_cashflow,
    },
    { title: 'Future Earnings Triggers', items: b1.futureTriggers || b1.future_triggers },
  ];

  sections.forEach((sec) => {
    if (!sec.items || !sec.items.length) return;
    html += `<div style="margin-top: 6px;">`;
    html += `<div class="label" style="margin-bottom: 2px;">${sec.title}</div>`;
    sec.items.forEach((it) => {
      if (typeof it === 'string') {
        html += renderObservation(it);
      } else {
        html += renderObservation(it.text || it.finding || it.driver, it.tag || it.classification);
      }
    });
    html += `</div>`;
  });

  html += `</div>`;
  return html;
}

/**
 * Builds Basket 2: Risk.
 * @param {Object} b2
 * @returns {string}
 */
function renderBasket2(b2) {
  if (!b2) return '';
  let html = `<div class="sec">`;
  html += `<div class="sec-hd">02&nbsp;&nbsp;Basket 2 — Risk (What Can Go Wrong?)</div>`;

  const sections = [
    { title: 'Business & Operating Risks', items: b2.businessRisks || b2.business_risks },
    {
      title: 'Management Commentary & Dodging Risks',
      items: b2.commentaryRisks || b2.commentary_risks,
    },
    { title: 'Industry & Macro Risks', items: b2.macroRisks || b2.macro_risks },
  ];

  sections.forEach((sec) => {
    if (!sec.items || !sec.items.length) return;
    html += `<div style="margin-top: 6px;">`;
    html += `<div class="label" style="margin-bottom: 2px;">${sec.title}</div>`;
    sec.items.forEach((it) => {
      if (typeof it === 'string') {
        html += renderObservation(it, null, '⚠');
      } else {
        let text = it.text || it.risk || it.point || '';
        if (it.evasionType) {
          text = `<b>[${it.evasionType}]</b> ${text}`;
        }
        if (it.quote) {
          text += ` <span class="quote">"${it.quote}"</span>`;
        }
        html += renderObservation(text, it.severity || it.level, '⚠');
      }
    });
    html += `</div>`;
  });

  html += `</div>`;
  return html;
}

/**
 * Builds Basket 3: Management.
 * @param {Object} b3
 * @returns {string}
 */
function renderBasket3(b3) {
  if (!b3) return '';
  let html = `<div class="sec">`;
  html += `<div class="sec-hd">03&nbsp;&nbsp;Basket 3 — Management (Between the Lines)</div>`;

  if (b3.tone) {
    const t = typeof b3.tone === 'object' ? b3.tone.label || b3.tone.classification : b3.tone;
    const q = typeof b3.tone === 'object' ? b3.tone.quote : '';
    const cls = getTagClass(t);
    html += `
      <div style="margin-top: 5px;">
        <span class="label">Commentary Tone:</span>
        <span class="chip ${cls}">${formatInlineMarkdown(t || 'CONFIDENT')}</span>
        ${q ? `<div class="quote" style="margin-top: 4px;">"${formatInlineMarkdown(q)}"</div>` : ''}
      </div>
    `;
  }

  if (b3.narrativeShift || b3.narrative_shift) {
    const shift = b3.narrativeShift || b3.narrative_shift;
    html += `<div style="margin-top: 6px;"><div class="label">Narrative Shift vs Prior Quarters</div>`;
    if (Array.isArray(shift)) {
      shift.forEach((s) => (html += renderObservation(s)));
    } else {
      html += `<p style="font-size: 10px; margin: 2px 0;">${formatInlineMarkdown(String(shift))}</p>`;
    }
    html += `</div>`;
  }

  if (b3.strategicBuild || b3.strategic_direction) {
    const strat = b3.strategicBuild || b3.strategic_direction;
    html += `<div style="margin-top: 6px;"><div class="label">3–5 Year Strategic Trajectory</div>`;
    if (Array.isArray(strat)) {
      strat.forEach((s) => (html += renderObservation(s)));
    } else {
      html += `<p style="font-size: 10px; margin: 2px 0;">${formatInlineMarkdown(String(strat))}</p>`;
    }
    html += `</div>`;
  }

  if (b3.capitalAllocation || b3.capital_allocation) {
    const ca = b3.capitalAllocation || b3.capital_allocation;
    const grade = typeof ca === 'object' ? ca.grade : '';
    const desc = typeof ca === 'object' ? ca.rationale || ca.details : ca;
    html += `<div style="margin-top: 6px;"><div class="label">Capital Allocation Discipline ${grade ? `<span class="chip ${getTagClass(grade)}">${grade}</span>` : ''}</div>`;
    html += `<p style="font-size: 10px; margin: 2px 0;">${formatInlineMarkdown(String(desc))}</p></div>`;
  }

  html += `</div>`;
  return html;
}

/**
 * Builds PEAD gates and reaction checklist.
 * @param {Object} pead
 * @returns {string}
 */
function renderPeadRead(pead) {
  if (!pead) return '';
  const verdict = (pead.verdict || 'PEAD_CANDIDATE').toUpperCase();
  const cls = getTagClass(verdict);

  const gates = pead.gates || {};
  const rows = [
    ['Gate', 'Evaluation', 'Status'],
    ['G1: Surprise vs Expectations', gates.g1 || pead.g1 || '—', 'Assessed'],
    ['G2: Result Quality', gates.g2 || pead.g2 || '—', 'Assessed'],
    [
      'G3: Priced In? (Valuation / Runup)',
      gates.g3 || pead.g3 || (pead.pricedIn ? 'PRICED IN' : 'NOT PRICED IN'),
      pead.pricedIn ? 'FLAG' : 'CLEAN',
    ],
    ['G4: Concall & Guidance Delivery', gates.g4 || pead.g4 || '—', 'Assessed'],
    ['G5: Forward Catalysts Post-Result', gates.g5 || pead.g5 || '—', 'Assessed'],
  ];

  let html = `<div class="sec">`;
  html += `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid ${INSTITUTIONAL_LIGHT.border}; padding-bottom: 3px; margin-bottom: 6px;">
      <span class="sec-hd" style="border-bottom: none; margin-bottom: 0; padding-bottom: 0;">04&nbsp;&nbsp;PEAD Reaction & Gate Evaluation</span>
      <span class="chip ${cls}" style="font-size: 9px; padding: 3px 8px;">VERDICT: ${verdict}</span>
    </div>
  `;

  html += styledTableHtml(rows, INSTITUTIONAL_LIGHT);
  html += `</div>`;
  return html;
}

/**
 * Builds Investor Monitoring Checklist.
 * @param {Array<Object>} checklist
 * @returns {string}
 */
function renderMonitoringChecklist(checklist) {
  if (!checklist || !checklist.length) return '';
  const rows = [['#', 'KPI / Catalyst', 'Threshold / Falsifiable Condition', 'Horizon', 'Source']];

  checklist.forEach((item, idx) => {
    rows.push([
      String(item.num || idx + 1),
      item.kpi || item.metric || '—',
      item.threshold || item.condition || '—',
      item.horizon || item.timeline || '—',
      item.source || '—',
    ]);
  });

  let html = `<div class="sec">`;
  html += `<div class="sec-hd">05&nbsp;&nbsp;Forward Investor Monitoring Checklist (2–8 Quarters)</div>`;
  html += styledTableHtml(rows, INSTITUTIONAL_LIGHT);
  html += `</div>`;
  return html;
}

/**
 * Renders the full Quarterly Result Analysis HTML document.
 * @param {Object} data DTO data
 * @param {Object} [options] Rendering options
 * @returns {Promise<{html: string, outputPath: ?string}>}
 */
async function createQuarterlyResultPdf(data, options = {}) {
  const companyName = data.company_name || data.companyName || data.company || '';
  const ticker = data.ticker || data.companyId || '';
  const quarter = data.quarter || '';
  const date = data.date || data.result_date || data.resultDate || '';
  const cmp = data.cmp || '—';
  const marketCap = data.market_cap || data.marketCap || '—';
  const sector = data.sector || '';

  const title = `${companyName} (${ticker}) — ${quarter} Result Analysis`;
  const subtitle = `Result Date: ${date} | CMP: ₹${cmp} | Mkt Cap: ₹${marketCap} Cr | Sector: ${sector || 'Indian Equities'}`;
  const eyebrow = `QUARTERLY RESULT ANALYSIS · ${ticker} · ${quarter}`;

  let bodyHtml = '';

  // 1. KPI Strip
  const kpiCards = data.kpiStrip || data.kpi_strip || data.computedKpiCards || [];
  bodyHtml += renderKpiStrip(kpiCards);

  // 2. Statement Health Strip
  const statementHealth = data.statementHealth || data.statement_health;
  bodyHtml += renderStatementHealth(statementHealth);

  // 3. Verdict Chips
  const verdictChips = data.verdictChips || data.verdict_chips || data.chips || [];
  bodyHtml += renderVerdictChips(verdictChips);

  // 3b. Inflection Point (directly under the verdict, like the J-curve badge)
  bodyHtml += renderInflectionPoint(data.inflectionPoint);

  // 4. (If NBFC): NBFC Quality Checks
  const nbfcChecks =
    data.nbfcQualityChecks || data.nbfc_quality_checks || (data.isNbfc ? data.nbfc : null);
  if (nbfcChecks) {
    bodyHtml += renderNbfcQualityChecks(nbfcChecks);
  }

  // 4b. Walk the Talk — past guidance judged before the forward table
  bodyHtml += renderWalkTheTalk(data.walkTheTalk);

  // 5. Forward Guidance & Bottom-Line Accrual Table
  const guidance =
    data.guidanceTable ||
    data.guidance_table ||
    data.guidance ||
    (data.basket1 && (data.basket1.guidanceTable || data.basket1.guidance_table));
  if (guidance) {
    bodyHtml += renderGuidanceTable(guidance);
  }

  // 5b. Next Inflection Point timeline
  bodyHtml += renderNextInflection(data.nextInflection);

  // 6. Basket 1: Business
  const basket1 = data.basket1 || data.business;
  bodyHtml += renderBasket1(basket1);

  // 6. Basket 2: Risk
  const basket2 = data.basket2 || data.risk;
  bodyHtml += renderBasket2(basket2);

  // 7. Basket 3: Management
  const basket3 = data.basket3 || data.management;
  bodyHtml += renderBasket3(basket3);

  // 8. PEAD Gates Evaluation
  const pead = data.peadRead || data.pead_read || data.pead;
  bodyHtml += renderPeadRead(pead);

  // 9. Investor Monitoring Checklist
  const checklist = data.monitoringChecklist || data.monitoring_checklist || data.checklist;
  bodyHtml += renderMonitoringChecklist(checklist);

  // 10. Runtime Improvisation Space: data.additional
  if (data.additional) {
    bodyHtml += renderAdditionalHtml(data.additional, '06', 'Additional Nuance & Improvisation');
  }

  const modelUsed = data.modelUsed || data.model_used || options.modelUsed;
  const fullHtml = wrapHtml(title, subtitle, bodyHtml, { eyebrow, modelUsed });

  const outputPath = data.output_path || data.outputPath || options.outputPath || null;

  if (outputPath) {
    const dir = path.dirname(path.resolve(outputPath));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (outputPath.endsWith('.html')) {
      fs.writeFileSync(outputPath, fullHtml, 'utf8');
      console.log(`✅ Quarterly Result HTML saved to: ${outputPath}`);
    } else if (outputPath.endsWith('.pdf')) {
      await renderPdf(
        fullHtml,
        outputPath,
        title,
        `${companyName} (${ticker}) ${quarter} Result Analysis`
      );
      console.log(`✅ Quarterly Result PDF rendered to: ${outputPath}`);
    } else {
      // Default to PDF per AGENTS.md §12 and conventions.md §18
      const pdfPath = outputPath.endsWith('.pdf') ? outputPath : `${outputPath}.pdf`;
      await renderPdf(
        fullHtml,
        pdfPath,
        title,
        `${companyName} (${ticker}) ${quarter} Result Analysis`
      );
      console.log(`✅ Quarterly Result PDF rendered to: ${pdfPath}`);
    }
  }

  return {
    html: fullHtml,
    outputPath,
  };
}

module.exports = {
  createQuarterlyResultPdf,
  renderInflectionPoint,
  renderWalkTheTalk,
  renderNextInflection,
};
