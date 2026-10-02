/**
 * @fileoverview Deterministic preparation and analytical context builder for quarterly result analysis.
 * Pre-computes KPI strip cards, statement quality grades, mandatory chip triggers,
 * and compacts extraction records into high-signal LLM reasoning payloads.
 *
 * Conforms to Monorepo Principle 17 (Extraction First, Analysis Second) and DATA_RULES.md.
 */

'use strict';

/**
 * @typedef {Object} KpiCard
 * @property {string} label Headline label (e.g. 'Revenue', 'EBITDA Margin')
 * @property {string} value Formatted metric value (e.g. '₹1,240 Cr', '22.5%')
 * @property {string} subtext Basis and period comparison (e.g. '+14.2% YoY (vs ₹1,085 Cr Q3 FY25)')
 * @property {'pos'|'neg'|'neutral'} tone Directional sentiment tone
 */

/**
 * @typedef {Object} StatementHealthBadge
 * @property {'CLEAN'|'WATCH'|'STRAINED'|'RED-FLAG'|'ABSENT'} grade Statement health verdict
 * @property {string} brief Quantified 1-sentence explanation of the grade
 */

/**
 * @typedef {Object} StatementHealthSummary
 * @property {StatementHealthBadge} income Income statement quality
 * @property {StatementHealthBadge} balanceSheet Balance sheet quality
 * @property {StatementHealthBadge} cashflow Cash flow quality
 */

/**
 * Format currency in Indian notation (Rs Cr).
 * @param {number|null|undefined} num
 * @param {number} [decimals=1]
 * @returns {string}
 */
function formatRsCr(num, decimals = 1) {
  if (num === null || num === undefined || isNaN(num)) return 'N/A';
  return `₹${Number(num).toFixed(decimals)} Cr`;
}

/**
 * Format percentage.
 * @param {number|null|undefined} num
 * @param {number} [decimals=1]
 * @param {boolean} [showSign=false]
 * @returns {string}
 */
function formatPct(num, decimals = 1, showSign = false) {
  if (num === null || num === undefined || isNaN(num)) return 'N/A';
  const val = Number(num).toFixed(decimals);
  if (showSign && num > 0) return `+${val}%`;
  return `${val}%`;
}

/**
 * Deterministically compute KPI strip cards from headline financials.
 * @param {Object} headline Headline financials object from quarterly-result-documents
 * @returns {KpiCard[]}
 */
function computeKpiCards(headline) {
  if (!headline) return [];

  const cards = [];

  // 1. Revenue
  if (headline.revenue) {
    const rev = headline.revenue;
    const yoy = rev.yoyPct !== undefined ? rev.yoyPct : null;
    const qoq = rev.qoqPct !== undefined ? rev.qoqPct : null;
    let tone = 'neutral';
    if (yoy !== null) {
      tone = yoy >= 10 ? 'pos' : yoy < 0 ? 'neg' : 'neutral';
    }

    let subtext = '';
    if (yoy !== null) {
      subtext = `${formatPct(yoy, 1, true)} YoY`;
      if (rev.yoyVal !== undefined) {
        subtext += ` (vs ${formatRsCr(rev.yoyVal)} YoY)`;
      }
    } else if (qoq !== null) {
      subtext = `${formatPct(qoq, 1, true)} QoQ`;
    }

    cards.push({
      label: 'Revenue',
      value: formatRsCr(rev.val),
      subtext,
      tone,
    });
  }

  // 2. EBITDA Margin
  if (headline.ebitdaMargin) {
    const mrg = headline.ebitdaMargin;
    const yoyBps = mrg.yoyBps !== undefined ? mrg.yoyBps : null;
    let tone = 'neutral';
    if (yoyBps !== null) {
      tone = yoyBps >= 50 ? 'pos' : yoyBps <= -50 ? 'neg' : 'neutral';
    }

    let subtext = '';
    if (yoyBps !== null) {
      const bpsStr = yoyBps > 0 ? `+${yoyBps} bps` : `${yoyBps} bps`;
      subtext = `${bpsStr} YoY`;
      if (mrg.yoyVal !== undefined) {
        subtext += ` (vs ${formatPct(mrg.yoyVal)} YoY)`;
      }
    }

    cards.push({
      label: 'EBITDA Margin',
      value: formatPct(mrg.val),
      subtext,
      tone,
    });
  }

  // 3. PAT
  if (headline.pat) {
    const pat = headline.pat;
    const yoy = pat.yoyPct !== undefined ? pat.yoyPct : null;
    let tone = 'neutral';
    if (yoy !== null) {
      tone = yoy >= 10 ? 'pos' : yoy < 0 ? 'neg' : 'neutral';
    }

    let subtext = '';
    if (yoy !== null) {
      subtext = `${formatPct(yoy, 1, true)} YoY`;
      if (pat.yoyVal !== undefined) {
        subtext += ` (vs ${formatRsCr(pat.yoyVal)} YoY)`;
      }
    }

    cards.push({
      label: 'PAT',
      value: formatRsCr(pat.val),
      subtext,
      tone,
    });
  }

  // 4. Effective Tax Rate
  if (headline.effectiveTaxRate) {
    const tax = headline.effectiveTaxRate;
    const yoyBps = tax.yoyBps !== undefined ? tax.yoyBps : null;
    let tone = 'neutral';
    // Lower tax rate without underlying reason is neutral/risk of reversal
    if (yoyBps !== null && Math.abs(yoyBps) > 500) {
      tone = yoyBps > 0 ? 'neg' : 'neutral';
    }

    let subtext = '';
    if (yoyBps !== null) {
      const bpsStr = yoyBps > 0 ? `+${yoyBps} bps` : `${yoyBps} bps`;
      subtext = `${bpsStr} YoY`;
      if (tax.yoyVal !== undefined) {
        subtext += ` (vs ${formatPct(tax.yoyVal)} YoY)`;
      }
    }

    cards.push({
      label: 'Effective Tax Rate',
      value: formatPct(tax.val),
      subtext,
      tone,
    });
  }

  // 5. EPS
  if (headline.eps) {
    const eps = headline.eps;
    const yoy = eps.yoyPct !== undefined ? eps.yoyPct : null;
    let tone = 'neutral';
    if (yoy !== null) {
      tone = yoy >= 10 ? 'pos' : yoy < 0 ? 'neg' : 'neutral';
    }

    let subtext = '';
    if (yoy !== null) {
      subtext = `${formatPct(yoy, 1, true)} YoY`;
    }

    cards.push({
      label: 'EPS',
      value: `₹${Number(eps.val).toFixed(2)}`,
      subtext,
      tone,
    });
  }

  return cards;
}

/**
 * Deterministically evaluate Statement Quality Grades and badges.
 * @param {Object} record Extraction record from quarterly-result-documents
 * @returns {StatementHealthSummary}
 */
function gradeStatementHealth(record) {
  const result = {
    income: {
      grade: 'CLEAN',
      brief: 'P&L lines and operational margins operated within expected parameters.',
    },
    balanceSheet: {
      grade: 'ABSENT',
      brief: 'Not disclosed (SEBI LODR Reg 33(3) compliance for Q1/Q3).',
    },
    cashflow: {
      grade: 'ABSENT',
      brief: 'Not disclosed (SEBI LODR Reg 33(3) compliance for Q1/Q3).',
    },
  };

  if (!record) return result;

  // 1. Income Statement Evaluation
  const incSignals = record.incomeStatementSignals;
  if (incSignals) {
    const combinations = incSignals.combinations || [];
    const hasHighFlag = combinations.some((c) => c.severity === 'high');
    const hasMedFlag = combinations.some((c) => c.severity === 'medium');

    if (hasHighFlag) {
      result.income.grade = 'RED-FLAG';
      const topFlag = combinations.find((c) => c.severity === 'high');
      result.income.brief =
        topFlag.description || 'High-severity combination flag detected in P&L scan.';
    } else if (hasMedFlag) {
      result.income.grade = 'WATCH';
      const topFlag = combinations.find((c) => c.severity === 'medium');
      result.income.brief =
        topFlag.description || 'Material margin or non-operating item detected in P&L scan.';
    } else if (incSignals.material && incSignals.material.length > 0) {
      result.income.grade = 'WATCH';
      const topItem = incSignals.material[0];
      result.income.brief = `Material swing in ${topItem.line}: ${topItem.finding || 'cleared materiality bar'}.`;
    }
  }

  // 2. Balance Sheet Evaluation
  const bsAvail = record.statementAvailability && record.statementAvailability.balanceSheet;
  if (bsAvail && bsAvail.status === 'fresh') {
    const bsSignals = record.balanceSheetSignals;
    if (
      bsSignals &&
      bsSignals.combinations &&
      bsSignals.combinations.some((c) => c.severity === 'high')
    ) {
      result.balanceSheet.grade = 'RED-FLAG';
      result.balanceSheet.brief = bsSignals.combinations[0].description;
    } else if (bsSignals && bsSignals.material && bsSignals.material.length > 0) {
      result.balanceSheet.grade = 'WATCH';
      result.balanceSheet.brief = bsSignals.material[0].finding;
    } else {
      result.balanceSheet.grade = 'CLEAN';
      result.balanceSheet.brief = 'Working capital and leverage indicators stable.';
    }
  } else if (bsAvail && bsAvail.status) {
    result.balanceSheet.grade = 'ABSENT';
    result.balanceSheet.brief = `Balance sheet ${bsAvail.status} (SEBI LODR Reg 33(3) compliance).`;
  }

  // 3. Cash Flow Evaluation
  const cfAvail = record.statementAvailability && record.statementAvailability.cashflow;
  if (cfAvail && cfAvail.status === 'fresh') {
    const cfSignals = record.cashflowSignals;
    if (
      cfSignals &&
      cfSignals.combinations &&
      cfSignals.combinations.some((c) => c.severity === 'high')
    ) {
      result.cashflow.grade = 'RED-FLAG';
      result.cashflow.brief = cfSignals.combinations[0].description;
    } else if (cfSignals && cfSignals.material && cfSignals.material.length > 0) {
      result.cashflow.grade = 'WATCH';
      result.cashflow.brief = cfSignals.material[0].finding;
    } else {
      result.cashflow.grade = 'CLEAN';
      result.cashflow.brief = 'Operating cash flows converted adequately vs reported profit.';
    }
  } else if (cfAvail && cfAvail.status) {
    result.cashflow.grade = 'ABSENT';
    result.cashflow.brief = `Cash flow statement ${cfAvail.status} (SEBI LODR Reg 33(3) compliance).`;
  }

  return result;
}

/**
 * Check mandatory verdict chip triggers based on deterministic financial signals.
 * @param {Object} record Extraction record
 * @returns {string[]} Mandatory verdict chips
 */
function computeMandatoryChips(record) {
  const chips = [];
  if (!record) return chips;

  const inc = record.incomeStatementSignals;
  if (inc && inc.combinations) {
    for (const combo of inc.combinations) {
      if (combo.flag === 'INVENTORY_GAIN_DRIVEN') {
        chips.push('INVENTORY-GAIN DRIVEN');
      }
      if (combo.flag === 'RM_COST_PRESSURE_MASKED_BY_INVENTORY_BUILD') {
        chips.push('RM-COST PRESSURE MASKED BY INVENTORY BUILD');
      }
      if (combo.flag === 'NON_OPERATING_INCOME_DRIVEN_BEAT') {
        chips.push('NON-OPERATING BEAT');
      }
      if (combo.flag === 'TAX_RATE_DRIVEN_PAT_SWING') {
        chips.push('TAX-RATE DRIVEN');
      }
    }
  }

  // Check headline margins
  if (record.headlineFinancials && record.headlineFinancials.ebitdaMargin) {
    const yoyBps = record.headlineFinancials.ebitdaMargin.yoyBps;
    if (yoyBps >= 200) {
      chips.push('MARGIN INFLECTION');
    } else if (yoyBps <= -200) {
      chips.push('MARGIN COMPRESSION');
    }
  }

  return [...new Set(chips)];
}

/**
 * Builds the prepared analytical context for the frontier LLM reasoning step.
 * @param {Object} record quarterly-result-documents record
 * @returns {Object} Structured analytical context
 */
function buildAnalysisContext(record) {
  if (!record) {
    throw new Error('No quarterly-result-documents record provided to buildAnalysisContext');
  }

  const computedKpiCards = computeKpiCards(record.headlineFinancials);
  const statementHealth = gradeStatementHealth(record);
  const mandatoryChips = computeMandatoryChips(record);

  return {
    companyId: record.companyId,
    quarter: record.quarter,
    date: record.date,
    dataSource: record.dataSource || 'xbrl-primary',
    dataProvenance: record.dataProvenance || {},
    statementAvailability: record.statementAvailability || {},
    headlineFinancials: record.headlineFinancials || {},
    computedKpiCards,
    statementHealth,
    mandatoryChips,
    toneExcerpts: record.toneExcerpts || [],
    guidanceExcerpts: record.guidanceExcerpts || [],
    strategicExcerpts: record.strategicExcerpts || [],
    kpiExcerpts: record.kpiExcerpts || [],
    possiblyDropped: record.possiblyDropped || [],
    resultNarrative: record.resultNarrative || null,
  };
}

module.exports = {
  computeKpiCards,
  gradeStatementHealth,
  computeMandatoryChips,
  buildAnalysisContext,
  formatRsCr,
  formatPct,
};
