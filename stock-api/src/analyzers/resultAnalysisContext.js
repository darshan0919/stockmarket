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

let _companyMaster = undefined;
function getCompanyMaster() {
  if (_companyMaster !== undefined) return _companyMaster;
  try {
    _companyMaster = require('../../../packages/jobs-runtime/lib/companyMaster');
  } catch (_) {
    try {
      _companyMaster = require('@stock/jobs-runtime/lib/companyMaster');
    } catch (__) {
      _companyMaster = null;
    }
  }
  return _companyMaster;
}

/**
 * Determine if an extraction record or company belongs to the NBFC, banking, or lending industry.
 * @param {Object} record Extraction record or company metadata object
 * @returns {boolean}
 */
function isNbfcRecord(record) {
  if (!record) return false;

  // 1. Direct family check
  const fam = String(
    record.family || record.statementFamily || record.incomeStatement?.family || ''
  ).toLowerCase();
  if (['nbfc', 'banking', 'financial', 'finance'].includes(fam)) return true;

  // 2. Data provenance files (e.g. INTEGRATED_FILING_NBFC)
  const provFiles = [
    record.dataProvenance?.cur?.file,
    record.dataProvenance?.qoq?.file,
    record.dataProvenance?.yoy?.file,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (provFiles.includes('nbfc') || provFiles.includes('banking')) return true;

  // 3. Direct industry / sector field
  const ind = String(
    record.industry ||
      record.sector ||
      record.companyProfile?.industry ||
      record.companyProfile?.sector ||
      ''
  ).toLowerCase();
  if (
    ind.includes('nbfc') ||
    ind.includes('finance') ||
    ind.includes('banking') ||
    ind.includes('lending') ||
    ind.includes('housing finance') ||
    ind.includes('microfinance')
  ) {
    return true;
  }

  // 4. CompanyMaster check
  if (record.companyId) {
    const cm = getCompanyMaster();
    if (cm && typeof cm.findByTicker === 'function') {
      try {
        const ticker = String(record.companyId).replace(/^NSE:|^BSE:/, '');
        const entry = cm.findByTicker(ticker);
        if (entry) {
          const cmInd = String(entry.industry || '').toLowerCase();
          const cmSec = String(entry.sector || '').toLowerCase();
          if (
            cmInd.includes('nbfc') ||
            cmInd.includes('finance') ||
            cmInd.includes('banking') ||
            cmInd.includes('lending') ||
            cmSec.includes('finance') ||
            cmSec.includes('banking')
          ) {
            return true;
          }
        }
      } catch (_) {
        // master lookup optional
      }
    }
  }

  return false;
}

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
 * Deterministically compute KPI strip cards from headline financials and excerpts.
 * @param {Object} headline Headline financials object from quarterly-result-documents
 * @param {Object} [opts] Options
 * @param {boolean} [opts.isNbfc=false] Whether the entity is an NBFC / lending institution
 * @param {Array<Object>} [opts.kpiExcerpts=[]] Extracted KPI cards from investor presentation
 * @param {Object} [opts.familyMetrics=null] Family-specific metrics (banking/nbfc)
 * @returns {KpiCard[]}
 */
function computeKpiCards(headline, opts = {}) {
  const isNbfc = Boolean(opts && opts.isNbfc);
  const kpiExcerpts = (opts && opts.kpiExcerpts) || [];

  let normalized = headline || {};
  if (Array.isArray(headline)) {
    normalized = {};
    for (const card of headline) {
      if (card.key === 'revenue') {
        normalized.revenue = { val: card.value, yoyPct: card.yoyPct, qoqPct: card.qoqPct };
      } else if (card.key === 'ebitdaMargin') {
        normalized.ebitdaMargin = {
          val: card.value,
          yoyBps: card.yoyBpsChange,
          qoqBps: card.qoqBpsChange,
          yoyVal: card.priorYValue,
          qoqVal: card.priorQValue,
        };
      } else if (card.key === 'pat') {
        normalized.pat = { val: card.value, yoyPct: card.yoyPct, qoqPct: card.qoqPct };
      } else if (card.key === 'effectiveTaxRate') {
        normalized.effectiveTaxRate = {
          val: card.value,
          yoyBps: card.yoyBpsChange,
          qoqBps: card.qoqBpsChange,
          yoyVal: card.priorYValue,
          qoqVal: card.priorQValue,
        };
      } else if (card.key === 'eps') {
        normalized.eps = { val: card.value, yoyPct: card.yoyPct, qoqPct: card.qoqPct };
      }
    }
  }

  const cards = [];

  // 1. Revenue
  if (normalized.revenue) {
    const rev = normalized.revenue;
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
  if (normalized.ebitdaMargin) {
    const mrg = normalized.ebitdaMargin;
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
  if (normalized.pat) {
    const pat = normalized.pat;
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
  if (normalized.effectiveTaxRate) {
    const tax = normalized.effectiveTaxRate;
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
  if (normalized.eps) {
    const eps = normalized.eps;
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

  // 6. NBFC-specific adjustments and excerpt cards
  if (isNbfc && Array.isArray(kpiExcerpts) && kpiExcerpts.length > 0) {
    // For NBFCs, industrial EBITDA margin is not an operational metric
    const withoutEbitda = cards.filter((c) => c.label !== 'EBITDA Margin');
    cards.length = 0;
    cards.push(...withoutEbitda);

    for (const item of kpiExcerpts) {
      if (!item || !item.label) continue;
      const lbl = String(item.label).trim();
      const comp = String(item.comparison || '').trim();
      const lblLower = lbl.toLowerCase();

      let tone = 'neutral';
      if (lblLower.includes('npa') || lblLower.includes('credit cost')) {
        if (
          comp.includes('-') ||
          comp.toLowerCase().includes('drop') ||
          comp.toLowerCase().includes('decline')
        ) {
          tone = 'pos';
        } else if (comp.includes('+') || comp.toLowerCase().includes('spike')) {
          tone = 'neg';
        }
      } else if (
        lblLower.includes('aum') ||
        lblLower.includes('roa') ||
        lblLower.includes('roe') ||
        lblLower.includes('net worth') ||
        lblLower.includes('book value')
      ) {
        if (comp.includes('+')) {
          tone = 'pos';
        } else if (comp.includes('-')) {
          tone = 'neg';
        }
      }

      if (!cards.some((c) => c.label.toLowerCase() === lblLower)) {
        cards.push({
          label: lbl,
          value: item.value,
          subtext: comp,
          tone,
        });
      }
    }
  } else if (cards.length === 0 && Array.isArray(kpiExcerpts) && kpiExcerpts.length > 0) {
    for (const item of kpiExcerpts) {
      cards.push({
        label: item.label,
        value: item.value,
        subtext: item.comparison || '',
        tone: 'neutral',
      });
    }
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
  const isNbfc = isNbfcRecord(record);

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
        topFlag.description ||
        topFlag.note ||
        'High-severity combination flag detected in P&L scan.';
    } else if (hasMedFlag) {
      result.income.grade = 'WATCH';
      const topFlag = combinations.find((c) => c.severity === 'medium');
      result.income.brief =
        topFlag.description ||
        topFlag.note ||
        'Material margin or non-operating item detected in P&L scan.';
    } else if (incSignals.material && incSignals.material.length > 0) {
      result.income.grade = 'WATCH';
      const topItem = incSignals.material[0];
      const lineName = topItem.line || topItem.label || topItem.id || 'operating item';
      result.income.brief = `Material swing in ${lineName}: ${topItem.finding || topItem.note || 'cleared materiality bar'}.`;
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
      result.balanceSheet.brief =
        bsSignals.combinations[0].description ||
        bsSignals.combinations[0].note ||
        'High-severity balance sheet flag detected.';
    } else if (bsSignals && bsSignals.material && bsSignals.material.length > 0) {
      result.balanceSheet.grade = 'WATCH';
      const topMat = bsSignals.material[0];
      result.balanceSheet.brief =
        topMat.finding ||
        topMat.note ||
        topMat.label ||
        'Material swing in balance sheet accounts.';
    } else {
      result.balanceSheet.grade = 'CLEAN';
      if (isNbfc && bsSignals?.derived?.current?.netWorth) {
        const nw = bsSignals.derived.current.netWorth;
        const nwPrior = bsSignals.derived.prior?.netWorth;
        const nwStr = formatRsCr(nw);
        const yoyPct = nwPrior ? ((nw - nwPrior) / nwPrior) * 100 : null;
        const yoyStr = yoyPct != null ? ` (${formatPct(yoyPct, 1, true)} YoY)` : '';
        result.balanceSheet.brief = `Net Worth at ${nwStr}${yoyStr}; capital adequacy and leverage stable.`;
      } else {
        result.balanceSheet.brief = 'Working capital and leverage indicators stable.';
      }
    }
  } else if (bsAvail && bsAvail.status) {
    result.balanceSheet.grade = 'ABSENT';
    result.balanceSheet.brief = `Balance sheet ${bsAvail.status} (SEBI LODR Reg 33(3) compliance).`;
  }

  // 3. Cash Flow Evaluation
  const cfAvail = record.statementAvailability && record.statementAvailability.cashflow;
  if (cfAvail && cfAvail.status === 'fresh') {
    const cfSignals = record.cashflowSignals;
    if (isNbfc) {
      // In an NBFC, loan disbursements are operating outflows under Ind AS.
      // Negative CFO during AUM expansion is structurally normal and expected.
      // Evaluate based on funding gap coverage (borrowings + equity) and liquidity.
      const fundingGap = cfSignals?.material?.find((m) => m.id === 'fundingGap');
      const cfoSign = cfSignals?.material?.find((m) => m.id === 'cfoSign');
      const cfoVal = cfoSign?.cfo ?? record.contextUsed?.cfo ?? null;
      const cfoStr = cfoVal != null ? formatRsCr(cfoVal) : 'negative CFO';

      const need = fundingGap?.externalFundingNeed || 0;
      const raised = fundingGap?.externalFundingRaised || 0;

      if (need > 0 && raised >= need * 0.95) {
        result.cashflow.grade = 'CLEAN';
        result.cashflow.brief = `Negative CFO (${cfoStr}) reflects loan disbursements; fully funded via borrowings/equity (+${formatRsCr(raised)}).`;
      } else if (need > 0 && raised < need * 0.8) {
        result.cashflow.grade = 'WATCH';
        result.cashflow.brief = `Loan disbursements exceeded debt/equity funding by ${formatRsCr(need - raised)}; monitor liquidity buffer.`;
      } else {
        result.cashflow.grade = 'CLEAN';
        result.cashflow.brief = `Lending disbursements (${cfoStr}) aligned with balance sheet financing cycle.`;
      }
    } else {
      if (
        cfSignals &&
        cfSignals.combinations &&
        cfSignals.combinations.some((c) => c.severity === 'high')
      ) {
        result.cashflow.grade = 'RED-FLAG';
        result.cashflow.brief =
          cfSignals.combinations[0].description ||
          cfSignals.combinations[0].note ||
          'High-severity cashflow flag detected.';
      } else if (cfSignals && cfSignals.material && cfSignals.material.length > 0) {
        result.cashflow.grade = 'WATCH';
        result.cashflow.brief =
          cfSignals.material[0].finding ||
          cfSignals.material[0].note ||
          cfSignals.material[0].label ||
          'Material swing in cash flow.';
      } else {
        result.cashflow.grade = 'CLEAN';
        result.cashflow.brief = 'Operating cash flows converted adequately vs reported profit.';
      }
    }
  } else if (cfAvail && cfAvail.status) {
    result.cashflow.grade = 'ABSENT';
    result.cashflow.brief = `Cash flow statement ${cfAvail.status} (SEBI LODR Reg 33(3) compliance).`;
  }

  return result;
}

/**
 * Deterministically compute raw material cost intensity and industry-specific signals.
 * @param {Object} record Extraction record
 * @returns {Object|null}
 */
function computeRawMaterialAndIndustrySignals(record) {
  if (!record || isNbfcRecord(record)) return null;

  const inc = record.incomeStatementSignals;
  const raw = record.incomeStatement?.raw || record.rawFinancials || null;
  const headline = record.incomeStatement?.headline || record.headlineFinancials || {};

  let rmPctCurrent = null;
  let rmPctQoq = null;
  let rmPctYoy = null;
  let qoqBps = null;
  let yoyBps = null;

  const rmHeadline =
    headline.costOfMaterialsPctSales ||
    (Array.isArray(headline) ? headline.find((c) => c.key === 'costOfMaterialsPctSales') : null);
  if (rmHeadline) {
    rmPctCurrent = rmHeadline.value ?? rmHeadline.val ?? null;
    rmPctQoq = rmHeadline.qoq ?? null;
    rmPctYoy = rmHeadline.yoy ?? null;
    qoqBps = rmHeadline.deltaBpsQoQ ?? null;
    yoyBps = rmHeadline.deltaBpsYoY ?? null;
  }

  if (rmPctCurrent == null && raw?.cur?.revenue && raw?.cur?.costOfMaterials) {
    const curTot = (raw.cur.costOfMaterials || 0) + (raw.cur.changeInInventories || 0);
    rmPctCurrent = (curTot / raw.cur.revenue) * 100;
    if (raw.qoq?.revenue && raw.qoq?.costOfMaterials) {
      const qoqTot = (raw.qoq.costOfMaterials || 0) + (raw.qoq.changeInInventories || 0);
      rmPctQoq = (qoqTot / raw.qoq.revenue) * 100;
      qoqBps = Math.round((rmPctCurrent - rmPctQoq) * 100);
    }
    if (raw.yoy?.revenue && raw.yoy?.costOfMaterials) {
      const yoyTot = (raw.yoy.costOfMaterials || 0) + (raw.yoy.changeInInventories || 0);
      rmPctYoy = (yoyTot / raw.yoy.revenue) * 100;
      yoyBps = Math.round((rmPctCurrent - rmPctYoy) * 100);
    }
  }

  if (rmPctCurrent == null) {
    const rmItem = inc?.material?.find((m) => m.key === 'costOfMaterials');
    if (rmItem && rmItem.pctOfSalesQoQDeltaBps != null) {
      qoqBps = rmItem.pctOfSalesQoQDeltaBps;
    }
  }

  if (qoqBps == null && yoyBps == null && rmPctCurrent == null) return null;

  const primaryBps = qoqBps != null ? qoqBps : yoyBps || 0;
  let direction = 'NEUTRAL';
  let signal = 'STABLE_RAW_MATERIAL_INTENSITY';
  let alert = false;

  if (primaryBps >= 800) {
    direction = 'HEADWIND';
    signal = 'ACUTE_RAW_MATERIAL_INFLATION_SQUEEZE';
    alert = true;
  } else if (primaryBps >= 300) {
    direction = 'HEADWIND';
    signal = 'RAW_MATERIAL_COST_INFLATION';
    alert = true;
  } else if (primaryBps <= -800) {
    direction = 'TAILWIND';
    signal = 'SUBSTANTIAL_GROSS_MARGIN_EXPANSION';
  } else if (primaryBps <= -300) {
    direction = 'TAILWIND';
    signal = 'RAW_MATERIAL_DEFLATION_BENEFIT';
  }

  const industry = String(
    record.industry || record.sector || record.companyProfile?.industry || 'Manufacturing'
  ).trim();

  let summary = '';
  if (direction === 'HEADWIND') {
    summary = `Raw material expenses surged by ${primaryBps > 0 ? '+' : ''}${primaryBps} bps ${
      qoqBps != null ? 'QoQ' : 'YoY'
    }, driving severe gross margin compression.`;
  } else if (direction === 'TAILWIND') {
    summary = `Raw material expenses eased by ${Math.abs(primaryBps)} bps ${
      qoqBps != null ? 'QoQ' : 'YoY'
    }, creating gross margin expansion.`;
  } else {
    summary = `Raw material cost intensity remained stable (${primaryBps > 0 ? '+' : ''}${primaryBps} bps).`;
  }

  return {
    direction,
    signal,
    alert,
    industry,
    rmPctSales: {
      current: rmPctCurrent != null ? Number(rmPctCurrent.toFixed(2)) : null,
      qoq: rmPctQoq != null ? Number(rmPctQoq.toFixed(2)) : null,
      yoy: rmPctYoy != null ? Number(rmPctYoy.toFixed(2)) : null,
      qoqDeltaBps: qoqBps,
      yoyDeltaBps: yoyBps,
    },
    summary,
  };
}

/**
 * Check mandatory verdict chip triggers based on deterministic financial signals.
 * @param {Object} record Extraction record
 * @returns {string[]} Mandatory verdict chips
 */
function computeMandatoryChips(record) {
  const chips = [];
  if (!record) return chips;
  const isNbfc = isNbfcRecord(record);

  if (!isNbfc) {
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
    let mrgYoyBps = null;
    if (Array.isArray(record.headlineFinancials)) {
      const card = record.headlineFinancials.find((c) => c.key === 'ebitdaMargin');
      if (card) mrgYoyBps = card.yoyBpsChange;
    } else if (record.headlineFinancials && record.headlineFinancials.ebitdaMargin) {
      mrgYoyBps = record.headlineFinancials.ebitdaMargin.yoyBps;
    }
    if (mrgYoyBps != null) {
      if (mrgYoyBps >= 200) {
        chips.push('MARGIN INFLECTION');
      } else if (mrgYoyBps <= -200) {
        chips.push('MARGIN COMPRESSION');
      }
    }

    // Check balance sheet working capital signals (Dr. Anil Lamba Rule: debtors & inventory vs revenue)
    const bs = record.balanceSheetSignals;
    if (bs && bs.material) {
      for (const item of bs.material) {
        if (item.id === 'receivablesVsRevenue') {
          chips.push('WORKING-CAPITAL DRAIN (DEBTORS SPIKE)');
        }
        if (item.id === 'inventoryVsRevenue') {
          chips.push('INVENTORY BLOAT');
        }
      }
    }

    // Check cash flow conversion signals (Operating cash flow vs reported profit)
    const cf = record.cashflowSignals;
    if (cf && cf.material) {
      for (const item of cf.material) {
        if (item.id === 'cfoToPat' || item.id === 'cfoToEbitda') {
          chips.push('POOR CASH CONVERSION');
        }
        if (item.id === 'workingCapitalDrag') {
          chips.push('WORKING-CAPITAL CASH DRAIN');
        }
      }
    }

    // Check raw material & industry signals
    const rmSig = computeRawMaterialAndIndustrySignals(record);
    if (rmSig) {
      if (rmSig.direction === 'HEADWIND' && rmSig.alert) {
        chips.push('RM INFLATION SQUEEZE');
      } else if (rmSig.direction === 'TAILWIND') {
        chips.push('GROSS MARGIN EXPANSION');
      }
    }
  } else {
    // NBFC / Financial institution specific chips
    const cf = record.cashflowSignals;
    const fundingGap = cf?.material?.find((m) => m.id === 'fundingGap');
    if (fundingGap && fundingGap.externalFundingNeed > 0) {
      if (fundingGap.externalFundingRaised >= fundingGap.externalFundingNeed * 0.95) {
        chips.push('AUM EXPANSION FUNDED');
      } else if (fundingGap.externalFundingRaised < fundingGap.externalFundingNeed * 0.8) {
        chips.push('FUNDING GAP WATCH');
      }
    }

    // Check Net Worth accretion from Balance Sheet
    const bs = record.balanceSheetSignals;
    const nwCur = bs?.derived?.current?.netWorth;
    const nwPrior = bs?.derived?.prior?.netWorth;
    if (nwCur && nwPrior && nwCur > nwPrior * 1.1) {
      chips.push('BOOK VALUE ACCRETION');
    }

    // Check tax rate swings if relevant
    const inc = record.incomeStatementSignals;
    if (inc && inc.combinations) {
      for (const combo of inc.combinations) {
        if (combo.flag === 'TAX_RATE_DRIVEN_PAT_SWING') {
          chips.push('TAX-RATE DRIVEN');
        }
        if (combo.flag === 'NON_OPERATING_INCOME_DRIVEN_BEAT') {
          chips.push('NON-OPERATING BEAT');
        }
      }
    }

    // Check KPI excerpts for AUM growth, credit cost or P/B triggers
    const kpiList = record.kpiExcerpts || [];
    for (const k of kpiList) {
      const lbl = String(k.label || '').toLowerCase();
      const comp = String(k.comparison || '');
      if (
        lbl.includes('aum') &&
        (comp.includes('+3') ||
          comp.includes('+4') ||
          comp.includes('+5') ||
          comp.includes('+6') ||
          comp.includes('+7'))
      ) {
        chips.push('DISBURSEMENT ACCELERATION');
      }
      if (
        (lbl.includes('credit cost') || lbl.includes('npa')) &&
        (comp.includes('-') || comp.includes('decline') || comp.includes('drop'))
      ) {
        chips.push('CREDIT QUALITY IMPROVEMENT');
      }
      if (lbl.includes('p/b') || lbl.includes('book value')) {
        chips.push('UPDATED P/B CALCULATED');
      }
    }
  }

  return [...new Set(chips)];
}

/**
 * Extract and build deterministic NBFC quality checks payload (RoA Tree, Asset Quality, Capital/Leverage, BVPS/PB, ALM).
 * @param {Object} record Extraction record
 * @returns {Object|null}
 */
function buildNbfcQualityChecks(record) {
  if (!record || !isNbfcRecord(record)) return null;

  const checks = {
    isNbfc: true,
    roaTree: {},
    assetQuality: {},
    capitalAndLeverage: {},
    valuation: {},
    almAndFunding: {},
  };

  const kpis = record.kpiExcerpts || [];
  const tones = record.toneExcerpts || [];
  const strat = record.strategicExcerpts || [];
  const guid = record.guidanceExcerpts || [];

  // 1. RoA Tree components
  const roaKpi = kpis.find((k) => /^roa\b/i.test(k.label));
  if (roaKpi) {
    checks.roaTree.reportedRoa = { value: roaKpi.value, comparison: roaKpi.comparison };
  }
  for (const t of tones) {
    const q = t.quote || '';
    if (/net income\s*(?:of)?\s*(?:over|at)?\s*\d+%|nim/i.test(q)) {
      checks.roaTree.nimPlusFeesQuote = q;
    }
    if (/credit cost\s*(?:this quarter)?\s*(?:has)?\s*declined|credit cost\s*at/i.test(q)) {
      checks.roaTree.creditCostQuote = q;
    }
  }
  for (const g of guid) {
    if (/credit cost/i.test(g.metric || '')) {
      checks.roaTree.creditCostGuidance = g.guidance;
    }
    if (/opex/i.test(g.metric || '')) {
      checks.roaTree.opexGuidance = g.guidance;
    }
  }

  // 2. Asset Quality & Cohort Vintages
  const gnpaKpi = kpis.find((k) => /gross npa|gnpa/i.test(k.label));
  if (gnpaKpi) {
    checks.assetQuality.gnpa = { value: gnpaKpi.value, comparison: gnpaKpi.comparison };
  }
  const nnpaKpi = kpis.find((k) => /net npa|nnpa/i.test(k.label));
  if (nnpaKpi) {
    checks.assetQuality.nnpa = { value: nnpaKpi.value, comparison: nnpaKpi.comparison };
  }
  for (const t of tones) {
    const q = t.quote || '';
    if (/6\s*mob\s*30\+/i.test(q) || /cohort/i.test(q)) {
      checks.assetQuality.cohortVintageQuote = q;
    }
  }

  // 3. Capital & Leverage (CAR / Net Worth / D/E)
  const nwKpi = kpis.find((k) => /net worth/i.test(k.label));
  if (nwKpi) {
    checks.capitalAndLeverage.netWorth = { value: nwKpi.value, comparison: nwKpi.comparison };
  } else if (record.balanceSheetSignals?.derived?.current?.netWorth) {
    const nw = record.balanceSheetSignals.derived.current.netWorth;
    checks.capitalAndLeverage.netWorth = { value: formatRsCr(nw) };
  }

  for (const s of strat) {
    const det = s.details || '';
    const carMatch = det.match(/CAR\s*at\s*([\d.]+%)/i);
    if (carMatch) checks.capitalAndLeverage.car = carMatch[1];
    const deMatch = det.match(/Debt-to-equity\s*ratio\s*at\s*([\d.]+x)/i);
    if (deMatch) checks.capitalAndLeverage.debtToEquity = deMatch[1];
  }

  // 4. Valuation (BVPS / P/B)
  const bvpsKpi = kpis.find((k) => /book value per share|bvps/i.test(k.label));
  if (bvpsKpi) {
    checks.valuation.bvps = { value: bvpsKpi.value, comparison: bvpsKpi.comparison };
  }
  const pbKpi = kpis.find((k) => /price to book|p\/b/i.test(k.label));
  if (pbKpi) {
    checks.valuation.pbRatio = { value: pbKpi.value, comparison: pbKpi.comparison };
  }

  // 5. ALM & Funding Gap
  const cf = record.cashflowSignals;
  const fundingGap = cf?.material?.find((m) => m.id === 'fundingGap');
  if (fundingGap) {
    const covered = fundingGap.externalFundingRaised >= fundingGap.externalFundingNeed * 0.95;
    checks.almAndFunding = {
      externalNeed: fundingGap.externalFundingNeed,
      externalRaised: fundingGap.externalFundingRaised,
      netBorrowings: fundingGap.netBorrowings,
      equityRaised: fundingGap.equityRaised,
      covered,
      cashflowVerdict: covered
        ? 'CLEAN (NORMAL AUM LOAN EXPANSION FUNDED)'
        : 'WATCH (FUNDING SHORTFALL)',
    };
  }

  return checks;
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

  const isNbfc = isNbfcRecord(record);
  const computedKpiCards = computeKpiCards(record.headlineFinancials, {
    isNbfc,
    kpiExcerpts: record.kpiExcerpts,
    familyMetrics: record.familyMetrics,
  });
  const statementHealth = gradeStatementHealth(record);
  const mandatoryChips = computeMandatoryChips(record);
  const nbfcQualityChecks = isNbfc ? buildNbfcQualityChecks(record) : null;
  const rawMaterialAndIndustrySignals = computeRawMaterialAndIndustrySignals(record);

  return {
    companyId: record.companyId,
    quarter: record.quarter,
    date: record.date,
    isNbfc,
    dataSource: record.dataSource || 'xbrl-primary',
    dataProvenance: record.dataProvenance || {},
    statementAvailability: record.statementAvailability || {},
    headlineFinancials: record.headlineFinancials || {},
    computedKpiCards,
    statementHealth,
    mandatoryChips,
    rawMaterialAndIndustrySignals,
    nbfcQualityChecks,
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
  computeRawMaterialAndIndustrySignals,
  buildAnalysisContext,
  buildNbfcQualityChecks,
  isNbfcRecord,
  formatRsCr,
  formatPct,
};
