'use strict';

/**
 * @fileoverview Deterministic PAT-to-EPS Accretion & Dilution Bridge Analyzer.
 *
 * Implements the financial arithmetic required for Rule 4b of post-close-scan-insights.
 * Accurately models the net EPS impact of equity dilution (QIP, preferential allotment,
 * warrants) vs debt retirement / capex deployment.
 *
 * Prevents LLM arithmetic hallucinations and rounding errors by computing exact interest
 * savings, post-tax PAT delta, equity dilution percentage, and pro-forma EPS.
 */

/**
 * @typedef {Object} PatBridgeInputs
 * @property {number} [raiseAmount=0] - Total equity or convertible raise amount in ₹ Cr.
 * @property {number} [debtRepaid=0] - Principal debt amount to be retired in ₹ Cr.
 * @property {number} [interestRate=0.10] - Annual interest rate (e.g. 0.10 or 10 for 10%).
 * @property {number} [taxRate=0.25] - Marginal corporate tax rate (e.g. 0.25 or 25 for 25%).
 * @property {number} [incrementalDepreciation=0] - Incremental annual depreciation in ₹ Cr.
 * @property {number} [operatingContribution=0] - Incremental annual operating profit/EBIT in ₹ Cr.
 * @property {number} [issuePrice=0] - Issue price per share in ₹.
 * @property {number} [currentPat=0] - Current annual / TTM Net Profit after tax in ₹ Cr.
 * @property {number} [currentShares=0] - Current diluted share count in Cr shares.
 * @property {number} [newShares=0] - Explicit new shares issued in Cr (derived from raiseAmount / issuePrice if omitted).
 * @property {number} [interestSaved] - Explicit pre-tax annual interest saved in ₹ Cr.
 */

/**
 * @typedef {Object} PatBridgeResult
 * @property {number} raiseAmount - Total raise amount in ₹ Cr.
 * @property {number} debtRepaid - Principal debt repaid in ₹ Cr.
 * @property {number} interestSaved - Pre-tax interest saved in ₹ Cr.
 * @property {number} taxRate - Effective tax rate fraction (e.g. 0.25).
 * @property {number} taxAdjustedInterestSaved - Post-tax interest saved in ₹ Cr.
 * @property {number} incrementalDepreciation - Annual depreciation drag in ₹ Cr.
 * @property {number} operatingContribution - Annual EBIT contribution in ₹ Cr.
 * @property {number} patDelta - Net change in PAT in ₹ Cr.
 * @property {number} currentPat - Pre-event PAT in ₹ Cr.
 * @property {number} newPat - Pro-forma PAT in ₹ Cr.
 * @property {number|null} patDeltaPct - Percentage change in PAT.
 * @property {number} currentShares - Pre-event shares in Cr.
 * @property {number} sharesAdded - New shares issued in Cr.
 * @property {number} dilutedShares - Post-event diluted share count in Cr.
 * @property {number} dilutionPct - Percentage dilution of equity base.
 * @property {number|null} oldEps - Pre-event EPS in ₹.
 * @property {number|null} newEps - Pro-forma EPS in ₹.
 * @property {number|null} epsDelta - Net change in EPS in ₹.
 * @property {number|null} epsPctDelta - Percentage change in EPS.
 * @property {'positive'|'negative'|'neutral'} direction - Net EPS impact direction.
 * @property {boolean} isAccretive - True if EPS improves net of dilution.
 * @property {string} auditSummary - Concise human-readable audit summary.
 * @property {Object} bridge - Note payload object for thesis cards.
 */

/**
 * Normalize percentage input: converts 10 -> 0.10, but preserves 0.10 -> 0.10.
 * @param {number} val
 * @param {number} defaultVal
 * @returns {number}
 */
function normalizeRate(val, defaultVal = 0) {
  if (val === undefined || val === null || isNaN(val)) return defaultVal;
  const num = Number(val);
  return num > 1 ? num / 100 : num;
}

/**
 * Round to N decimal places deterministically.
 * @param {number|null} num
 * @param {number} [decimals=2]
 * @returns {number|null}
 */
function roundTo(num, decimals = 2) {
  if (num === null || num === undefined || isNaN(num)) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(Number(num) * factor) / factor;
}

/**
 * Compute the deterministic PAT and EPS accretion bridge.
 *
 * @param {PatBridgeInputs} inputs
 * @returns {PatBridgeResult}
 */
function computePatBridge(inputs = {}) {
  const raiseAmount = Math.max(0, Number(inputs.raiseAmount || 0));
  const debtRepaid = Math.max(0, Number(inputs.debtRepaid || 0));
  const interestRate = normalizeRate(inputs.interestRate, 0.1);
  const taxRate = normalizeRate(inputs.taxRate, 0.25);
  const incrementalDepreciation = Math.max(0, Number(inputs.incrementalDepreciation || 0));
  const operatingContribution = Math.max(0, Number(inputs.operatingContribution || 0));
  const issuePrice = Math.max(0, Number(inputs.issuePrice || 0));
  const currentPat = Number(inputs.currentPat || 0);
  const currentShares = Math.max(0, Number(inputs.currentShares || 0));

  // 1. Interest savings
  let interestSaved = 0;
  if (inputs.interestSaved !== undefined && inputs.interestSaved !== null) {
    interestSaved = Math.max(0, Number(inputs.interestSaved));
  } else if (debtRepaid > 0) {
    interestSaved = debtRepaid * interestRate;
  }
  const taxAdjustedInterestSaved = interestSaved * (1 - taxRate);

  // 2. Net PAT delta
  const patDelta = taxAdjustedInterestSaved + operatingContribution - incrementalDepreciation;
  const newPat = currentPat + patDelta;
  const patDeltaPct = currentPat > 0 ? (patDelta / currentPat) * 100 : null;

  // 3. Shares & Dilution
  let sharesAdded = 0;
  if (inputs.newShares !== undefined && inputs.newShares !== null && Number(inputs.newShares) > 0) {
    sharesAdded = Number(inputs.newShares);
  } else if (issuePrice > 0 && raiseAmount > 0) {
    // raiseAmount is in ₹ Cr, issuePrice is in ₹ per share.
    // 1 Cr = 10,000,000.
    // shares = (raiseAmount * 1e7) / issuePrice / 1e7 = raiseAmount / issuePrice.
    sharesAdded = raiseAmount / issuePrice;
  }

  const dilutedShares = currentShares + sharesAdded;
  const dilutionPct = currentShares > 0 ? (sharesAdded / currentShares) * 100 : 0;

  // 4. EPS Impact
  const oldEps = currentShares > 0 ? currentPat / currentShares : null;
  const newEps = dilutedShares > 0 ? newPat / dilutedShares : null;
  const epsDelta = newEps !== null && oldEps !== null ? newEps - oldEps : null;
  const epsPctDelta =
    oldEps !== null && oldEps > 0 && epsDelta !== null ? (epsDelta / oldEps) * 100 : null;

  // 5. Verdict
  let direction = 'neutral';
  let isAccretive = false;
  if (epsDelta !== null) {
    if (epsDelta > 0.005) {
      direction = 'positive';
      isAccretive = true;
    } else if (epsDelta < -0.005) {
      direction = 'negative';
      isAccretive = false;
    }
  } else if (patDelta > 0 && sharesAdded === 0) {
    direction = 'positive';
    isAccretive = true;
  } else if (patDelta < 0) {
    direction = 'negative';
    isAccretive = false;
  }

  // 6. Audit narrative
  const parts = [];
  if (raiseAmount > 0) parts.push(`₹${roundTo(raiseAmount, 1)} Cr raise`);
  if (debtRepaid > 0) {
    parts.push(`retires ₹${roundTo(debtRepaid, 1)} Cr debt @ ${roundTo(interestRate * 100, 1)}%`);
    parts.push(
      `saving ₹${roundTo(interestSaved, 1)} Cr interest (₹${roundTo(taxAdjustedInterestSaved, 1)} Cr post-tax)`
    );
  }
  if (operatingContribution > 0) {
    parts.push(`adds ₹${roundTo(operatingContribution, 1)} Cr EBIT`);
  }
  if (incrementalDepreciation > 0) {
    parts.push(`less ₹${roundTo(incrementalDepreciation, 1)} Cr depreciation`);
  }
  if (currentPat > 0) {
    const sign = patDelta >= 0 ? '+' : '';
    parts.push(
      `PAT moves from ₹${roundTo(currentPat, 1)} Cr to ₹${roundTo(newPat, 1)} Cr (${sign}${roundTo(patDeltaPct, 1)}%)`
    );
  }
  if (sharesAdded > 0 && currentShares > 0) {
    parts.push(`dilution ${roundTo(dilutionPct, 1)}% (${roundTo(sharesAdded, 2)} Cr new shares)`);
  }
  if (oldEps !== null && newEps !== null) {
    const verdict = isAccretive ? 'ACCRETIVE' : direction === 'negative' ? 'DILUTIVE' : 'NEUTRAL';
    const sign = epsPctDelta >= 0 ? '+' : '';
    parts.push(
      `EPS ₹${roundTo(oldEps, 2)} -> ₹${roundTo(newEps, 2)} (${sign}${roundTo(epsPctDelta, 1)}% ${verdict})`
    );
  }

  const auditSummary = parts.join('; ');

  return {
    raiseAmount: roundTo(raiseAmount, 2),
    debtRepaid: roundTo(debtRepaid, 2),
    interestSaved: roundTo(interestSaved, 2),
    taxRate: roundTo(taxRate, 4),
    taxAdjustedInterestSaved: roundTo(taxAdjustedInterestSaved, 2),
    incrementalDepreciation: roundTo(incrementalDepreciation, 2),
    operatingContribution: roundTo(operatingContribution, 2),
    patDelta: roundTo(patDelta, 2),
    currentPat: roundTo(currentPat, 2),
    newPat: roundTo(newPat, 2),
    patDeltaPct: roundTo(patDeltaPct, 1),
    currentShares: roundTo(currentShares, 3),
    sharesAdded: roundTo(sharesAdded, 3),
    dilutedShares: roundTo(dilutedShares, 3),
    dilutionPct: roundTo(dilutionPct, 1),
    oldEps: roundTo(oldEps, 2),
    newEps: roundTo(newEps, 2),
    epsDelta: roundTo(epsDelta, 2),
    epsPctDelta: roundTo(epsPctDelta, 1),
    direction,
    isAccretive,
    auditSummary,
    bridge: {
      interestSaved: roundTo(interestSaved, 2),
      taxRate: roundTo(taxRate, 4),
      incrementalDepreciation: roundTo(incrementalDepreciation, 2),
      operatingContribution: roundTo(operatingContribution, 2),
      newShares: roundTo(sharesAdded, 3),
      dilutionPct: roundTo(dilutionPct, 1),
      patDelta: roundTo(patDelta, 2),
      epsDelta: roundTo(epsDelta, 2),
      direction,
      isAccretive,
      auditSummary,
    },
  };
}

module.exports = {
  computePatBridge,
  normalizeRate,
  roundTo,
};
