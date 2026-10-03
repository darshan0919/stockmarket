'use strict';

/**
 * jcurveFinancialMetrics.js — Deterministic Operating Leverage & Fake J-Curve Detection Engine.
 *
 * Grounded in:
 * 1. SOIC "Growth Catalyst" & "Spotting J-Curves" Frameworks:
 *    - Operating Leverage ordering check: PAT Growth > EBITDA Growth > Revenue Growth
 *    - J-Curve threshold screen: PAT Growth > 30% YoY, paired with Revenue Growth >= 15-20%
 *    - Fake J-Curve red-flag checks: low base, other income spike, exceptional income, tax distortion
 * 2. Dr. Anil Lamba's Corporate Finance Leverage Rules:
 *    - Operating Leverage Multiple = (% Δ EBIT) / (% Δ Sales)
 *    - Financial Leverage Multiple = (% Δ PAT) / (% Δ EBIT)
 *    - Combined Leverage Multiple  = Operating Leverage × Financial Leverage = (% Δ PAT) / (% Δ Sales)
 *    - Operating Deleverage Warning: High fixed-costs + debt amplify downside when sales slow
 *
 * Extraction-First (Principle 17): This module performs all deterministic arithmetic,
 * ratio calculations, and red-flag classification so LLMs reason over verified JSON facts
 * rather than doing division, rounding, or percentage subtraction in prompt text.
 */

/**
 * @typedef {Object} QuarterFinancialRecord
 * @property {string} period - e.g. "Q1FY27", "2026Q1", "Q4FY26"
 * @property {number} [revenue] - Revenue / Net Sales in ₹ Cr
 * @property {number} [ebitda] - Operating Profit / EBITDA in ₹ Cr
 * @property {number} [ebit] - EBIT / Operating Profit after D&A in ₹ Cr
 * @property {number} [pbt] - Profit Before Tax in ₹ Cr
 * @property {number} [pat] - Profit After Tax in ₹ Cr
 * @property {number} [otherIncome] - Other Income in ₹ Cr
 * @property {number} [exceptionalItems] - Exceptional / Extraordinary items in ₹ Cr
 * @property {number} [interest] - Finance Costs / Interest in ₹ Cr
 * @property {number} [depreciation] - Depreciation & Amortization in ₹ Cr
 * @property {number} [tax] - Tax expense in ₹ Cr
 * @property {number} [eps] - Earnings Per Share in ₹
 */

/**
 * @typedef {Object} FakeJCurveFlags
 * @property {boolean} lowBaseDetected - True if prior-year quarter had abnormally depressed or negative PAT
 * @property {boolean} otherIncomeDistortion - True if Other Income is > 15% of PBT or explains > 40% of PAT growth
 * @property {number|null} otherIncomeToPbtPct - Other income as percentage of PBT
 * @property {boolean} exceptionalItemDistortion - True if exceptional items exceed 10% of PBT
 * @property {number|null} exceptionalToPbtPct - Exceptional items as percentage of PBT
 * @property {boolean} taxRateAnomaly - True if effective tax rate is < 15% or swung by > 1,000 bps YoY
 * @property {number|null} effectiveTaxRate - Current quarter effective tax rate (%)
 * @property {number|null} priorTaxRate - Prior year same-quarter effective tax rate (%)
 * @property {boolean} operatingDeleverageRisk - True if fixed costs/interest are high while revenue growth is decelerating
 * @property {string[]} triggeredFlags - Array of human-readable red flags detected
 */

/**
 * @typedef {Object} JCurveFinancialHealthResult
 * @property {string} currentPeriod - Current quarter period
 * @property {string|null} priorYearPeriod - Comparison quarter from prior year
 * @property {number|null} revenueGrowthYoY - Revenue growth % YoY
 * @property {number|null} ebitdaGrowthYoY - EBITDA growth % YoY
 * @property {number|null} ebitGrowthYoY - EBIT growth % YoY
 * @property {number|null} patGrowthYoY - PAT growth % YoY
 * @property {number|null} revenueGrowthQoQ - Revenue growth % QoQ
 * @property {number|null} patGrowthQoQ - PAT growth % QoQ
 * @property {number|null} operatingLeverageMultiple - (% Δ EBIT or EBITDA) / (% Δ Revenue)
 * @property {number|null} financialLeverageMultiple - (% Δ PAT) / (% Δ EBIT)
 * @property {number|null} combinedLeverageMultiple - Operating Leverage × Financial Leverage
 * @property {boolean} operatingLeverageConfirmed - True if PAT growth > EBITDA growth > Revenue growth
 * @property {boolean} clearsPatThreshold - True if latest PAT YoY > 30%
 * @property {boolean} clearsBuoyantPairing - True if PAT YoY >= 20% AND Revenue YoY >= 15%
 * @property {FakeJCurveFlags} fakeJCurveAudit - Red-flag audit results
 * @property {'REAL_JCURVE'|'SUSPECT_FAKE'|'STEADY_GROWTH'|'CONTRACTION'} verdictClassification
 * @property {string} summary - Structured analytical audit sentence for reports
 */

/**
 * Helper to compute percentage growth: ((current - prior) / abs(prior)) * 100
 * @param {number|null|undefined} curr
 * @param {number|null|undefined} prev
 * @returns {number|null}
 */
function pctGrowth(curr, prev) {
  if (curr == null || prev == null || Number.isNaN(Number(curr)) || Number.isNaN(Number(prev))) {
    return null;
  }
  const c = Number(curr);
  const p = Number(prev);
  if (p === 0) {
    return c > 0 ? 100 : c < 0 ? -100 : 0;
  }
  return Number((((c - p) / Math.abs(p)) * 100).toFixed(2));
}

/**
 * Helper to round to decimal places
 * @param {number|null} val
 * @param {number} [dec=2]
 * @returns {number|null}
 */
function round(val, dec = 2) {
  if (val == null || Number.isNaN(Number(val))) return null;
  return Number(Number(val).toFixed(dec));
}

/**
 * Computes operating and financial leverage multiples and audits for fake J-curve signals.
 *
 * @param {QuarterFinancialRecord[]} quarters - Array of quarterly records (handles any sorting order)
 * @param {Object} [options]
 * @param {number} [options.otherIncomePbtThreshold=15.0] - Materiality threshold for Other Income as % of PBT
 * @param {number} [options.exceptionalPbtThreshold=10.0] - Materiality threshold for Exceptional items as % of PBT
 * @param {number} [options.taxRateAnomalyThresholdBps=1000] - Materiality threshold for Tax rate swing in bps
 * @returns {JCurveFinancialHealthResult}
 */
function computeJCurveFinancialHealth(quarters, options = {}) {
  const otherIncomePbtThreshold = options.otherIncomePbtThreshold ?? 15.0;
  const exceptionalPbtThreshold = options.exceptionalPbtThreshold ?? 10.0;
  const taxRateAnomalyThresholdBps = options.taxRateAnomalyThresholdBps ?? 1000;

  if (!Array.isArray(quarters) || quarters.length === 0) {
    return {
      currentPeriod: 'UNKNOWN',
      priorYearPeriod: null,
      revenueGrowthYoY: null,
      ebitdaGrowthYoY: null,
      ebitGrowthYoY: null,
      patGrowthYoY: null,
      revenueGrowthQoQ: null,
      patGrowthQoQ: null,
      operatingLeverageMultiple: null,
      financialLeverageMultiple: null,
      combinedLeverageMultiple: null,
      operatingLeverageConfirmed: false,
      clearsPatThreshold: false,
      clearsBuoyantPairing: false,
      fakeJCurveAudit: {
        lowBaseDetected: false,
        otherIncomeDistortion: false,
        otherIncomeToPbtPct: null,
        exceptionalItemDistortion: false,
        exceptionalToPbtPct: null,
        taxRateAnomaly: false,
        effectiveTaxRate: null,
        priorTaxRate: null,
        operatingDeleverageRisk: false,
        triggeredFlags: ['No quarterly data provided'],
      },
      verdictClassification: 'CONTRACTION',
      summary: 'No quarterly financial data provided for J-Curve leverage audit.',
    };
  }

  // Determine chronological ordering.
  // If quarters[0] looks newer than quarters[quarters.length - 1], reverse for calculation.
  const copy = [...quarters];
  const curr = copy[0];
  // Find prior year quarter: ideally index 4 if quarterly array is quarterly consecutive,
  // or match period code (e.g. Q1FY27 -> Q1FY26).
  let prevYoY = null;
  let prevQoQ = copy.length > 1 ? copy[1] : null;

  if (curr.period) {
    const periodMatch = curr.period.match(/(Q[1-4])FY?(\d{2,4})/i);
    if (periodMatch) {
      const q = periodMatch[1].toUpperCase();
      const yr = parseInt(periodMatch[2], 10);
      const priorYrStr = yr > 99 ? yr - 1 : yr - 1;
      const targetRegex = new RegExp(`${q}FY?${priorYrStr}`, 'i');
      prevYoY = copy.find((item) => item !== curr && item.period && targetRegex.test(item.period));
    }
  }

  // Fallback to 4th element if consecutive quarters
  if (!prevYoY && copy.length >= 5) {
    prevYoY = copy[4];
  }

  const revenueGrowthYoY = prevYoY ? pctGrowth(curr.revenue, prevYoY.revenue) : null;
  const ebitdaGrowthYoY = prevYoY ? pctGrowth(curr.ebitda, prevYoY.ebitda) : null;
  const ebitGrowthYoY = prevYoY
    ? pctGrowth(curr.ebit ?? curr.ebitda, prevYoY.ebit ?? prevYoY.ebitda)
    : null;
  const patGrowthYoY = prevYoY ? pctGrowth(curr.pat, prevYoY.pat) : null;

  const revenueGrowthQoQ = prevQoQ ? pctGrowth(curr.revenue, prevQoQ.revenue) : null;
  const patGrowthQoQ = prevQoQ ? pctGrowth(curr.pat, prevQoQ.pat) : null;

  // Dr. Anil Lamba's Operating Leverage Multiple: (% Δ EBIT) / (% Δ Sales)
  let operatingLeverageMultiple = null;
  const topEbitGrowth = ebitGrowthYoY ?? ebitdaGrowthYoY;
  if (topEbitGrowth != null && revenueGrowthYoY != null && Math.abs(revenueGrowthYoY) > 0.5) {
    operatingLeverageMultiple = round(topEbitGrowth / revenueGrowthYoY);
  }

  // Financial Leverage Multiple: (% Δ PAT) / (% Δ EBIT)
  let financialLeverageMultiple = null;
  if (patGrowthYoY != null && topEbitGrowth != null && Math.abs(topEbitGrowth) > 0.5) {
    financialLeverageMultiple = round(patGrowthYoY / topEbitGrowth);
  }

  // Combined Leverage Multiple: (% Δ PAT) / (% Δ Revenue)
  let combinedLeverageMultiple = null;
  if (patGrowthYoY != null && revenueGrowthYoY != null && Math.abs(revenueGrowthYoY) > 0.5) {
    combinedLeverageMultiple = round(patGrowthYoY / revenueGrowthYoY);
  }

  // SOIC Operating Leverage check: PAT Growth > EBITDA Growth > Revenue Growth
  const operatingLeverageConfirmed = Boolean(
    patGrowthYoY != null &&
    ebitdaGrowthYoY != null &&
    revenueGrowthYoY != null &&
    patGrowthYoY > ebitdaGrowthYoY &&
    ebitdaGrowthYoY > revenueGrowthYoY &&
    revenueGrowthYoY > 0
  );

  // Screening thresholds
  const clearsPatThreshold = Boolean(patGrowthYoY != null && patGrowthYoY > 30);
  const clearsBuoyantPairing = Boolean(
    patGrowthYoY != null && revenueGrowthYoY != null && patGrowthYoY >= 20 && revenueGrowthYoY >= 15
  );

  // ── Fake J-Curve Audit ──
  const triggeredFlags = [];

  // 1. Low Base check
  let lowBaseDetected = false;
  if (prevYoY && prevYoY.pat != null) {
    // If prior year PAT was negative, zero, or less than 25% of trailing median positive PAT
    const positivePats = copy.map((q) => q.pat).filter((p) => p != null && p > 0);
    const medianPat =
      positivePats.length > 0
        ? [...positivePats].sort((a, b) => a - b)[Math.floor(positivePats.length / 2)]
        : null;

    if (prevYoY.pat <= 0 || (medianPat && prevYoY.pat < medianPat * 0.35)) {
      lowBaseDetected = true;
      triggeredFlags.push(
        `Low Base: Prior-year PAT (₹${prevYoY.pat} Cr) was depressed relative to normal run-rate`
      );
    }
  }

  // 2. Other Income Distortion check
  let otherIncomeDistortion = false;
  let otherIncomeToPbtPct = null;
  if (curr.otherIncome != null && curr.pbt != null && curr.pbt !== 0) {
    otherIncomeToPbtPct = round((curr.otherIncome / curr.pbt) * 100);
    if (otherIncomeToPbtPct > otherIncomePbtThreshold) {
      otherIncomeDistortion = true;
      triggeredFlags.push(
        `Other Income Distortion: Other Income is ${otherIncomeToPbtPct}% of PBT (> ${otherIncomePbtThreshold}%)`
      );
    }
  }

  // 3. Exceptional Items Distortion check
  let exceptionalItemDistortion = false;
  let exceptionalToPbtPct = null;
  if (curr.exceptionalItems != null && curr.pbt != null && curr.pbt !== 0) {
    exceptionalToPbtPct = round((Math.abs(curr.exceptionalItems) / curr.pbt) * 100);
    if (exceptionalToPbtPct > exceptionalPbtThreshold) {
      exceptionalItemDistortion = true;
      triggeredFlags.push(
        `Exceptional Items: One-off items represent ${exceptionalToPbtPct}% of PBT`
      );
    }
  }

  // 4. Effective Tax Rate Anomaly
  let taxRateAnomaly = false;
  let effectiveTaxRate = null;
  let priorTaxRate = null;
  if (curr.tax != null && curr.pbt != null && curr.pbt > 0) {
    effectiveTaxRate = round((curr.tax / curr.pbt) * 100);
    if (effectiveTaxRate < 15.0) {
      taxRateAnomaly = true;
      triggeredFlags.push(
        `Abnormally low effective tax rate (${effectiveTaxRate}% vs standard ~25%)`
      );
    }
  }
  if (prevYoY && prevYoY.tax != null && prevYoY.pbt != null && prevYoY.pbt > 0) {
    priorTaxRate = round((prevYoY.tax / prevYoY.pbt) * 100);
    if (effectiveTaxRate != null && priorTaxRate != null) {
      const swingBps = Math.abs(effectiveTaxRate - priorTaxRate) * 100;
      if (swingBps > taxRateAnomalyThresholdBps) {
        taxRateAnomaly = true;
        triggeredFlags.push(
          `Tax Rate Swing: YoY tax rate swung by ${round(swingBps)} bps (${priorTaxRate}% -> ${effectiveTaxRate}%)`
        );
      }
    }
  }

  // 5. Operating Deleverage Risk (Lamba rule)
  // If revenue is falling/stagnant while interest or fixed costs are high
  let operatingDeleverageRisk = false;
  if (revenueGrowthYoY != null && revenueGrowthYoY < 5.0) {
    if (curr.interest != null && curr.ebitda != null && curr.interest > curr.ebitda * 0.4) {
      operatingDeleverageRisk = true;
      triggeredFlags.push(
        `Operating Deleverage Risk: Interest burden (₹${curr.interest} Cr) consumes > 40% of EBITDA amid sluggish revenue growth (${revenueGrowthYoY}%)`
      );
    }
  }

  // Verdict Classification
  let verdictClassification = 'STEADY_GROWTH';
  if (clearsPatThreshold || operatingLeverageConfirmed) {
    if (otherIncomeDistortion || exceptionalItemDistortion || lowBaseDetected) {
      verdictClassification = 'SUSPECT_FAKE';
    } else {
      verdictClassification = 'REAL_JCURVE';
    }
  } else if (
    (patGrowthYoY != null && patGrowthYoY < 0) ||
    (revenueGrowthYoY != null && revenueGrowthYoY < 0)
  ) {
    verdictClassification = 'CONTRACTION';
  }

  // Analytical summary formulation
  let summary = '';
  if (verdictClassification === 'REAL_JCURVE') {
    summary = `Operating Leverage CONFIRMED: PAT YoY +${patGrowthYoY}% > EBITDA +${ebitdaGrowthYoY}% > Rev +${revenueGrowthYoY}%. Combined Leverage: ${combinedLeverageMultiple ?? 'N/A'}x. Clean fake-J-curve audit.`;
  } else if (verdictClassification === 'SUSPECT_FAKE') {
    summary = `WARNING: SUSPECT FAKE J-CURVE. Reported PAT YoY is +${patGrowthYoY}%, but audit flags anomalies: ${triggeredFlags.join('; ')}.`;
  } else if (verdictClassification === 'CONTRACTION') {
    summary = `Earnings Contraction: PAT YoY ${patGrowthYoY}%, Revenue YoY ${revenueGrowthYoY}%. ${triggeredFlags.length > 0 ? triggeredFlags.join('; ') : 'No operating expansion.'}`;
  } else {
    summary = `Steady/Moderate Compounding: PAT YoY +${patGrowthYoY ?? 'N/A'}%, Revenue YoY +${revenueGrowthYoY ?? 'N/A'}%. Does not clear the bucket-3 hyper-growth bar.`;
  }

  return {
    currentPeriod: curr.period || 'CURRENT',
    priorYearPeriod: prevYoY?.period || null,
    revenueGrowthYoY,
    ebitdaGrowthYoY,
    ebitGrowthYoY,
    patGrowthYoY,
    revenueGrowthQoQ,
    patGrowthQoQ,
    operatingLeverageMultiple,
    financialLeverageMultiple,
    combinedLeverageMultiple,
    operatingLeverageConfirmed,
    clearsPatThreshold,
    clearsBuoyantPairing,
    fakeJCurveAudit: {
      lowBaseDetected,
      otherIncomeDistortion,
      otherIncomeToPbtPct,
      exceptionalItemDistortion,
      exceptionalToPbtPct,
      taxRateAnomaly,
      effectiveTaxRate,
      priorTaxRate,
      operatingDeleverageRisk,
      triggeredFlags,
    },
    verdictClassification,
    summary,
  };
}

module.exports = {
  computeJCurveFinancialHealth,
  pctGrowth,
  round,
};
