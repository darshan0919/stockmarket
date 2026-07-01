'use strict';

/**
 * Concentration metrics for market share analysis.
 * Compute CR3, CR5, CR10, HHI and classification from a list of player shares.
 */

function hhiClassification(hhiValue) {
  if (hhiValue < 1500) return 'Competitive/Fragmented';
  if (hhiValue < 2500) return 'Moderately Concentrated';
  if (hhiValue < 5000) return 'Highly Concentrated';
  return 'Near-Monopoly';
}

function _sorted(shares) {
  return shares
    .filter(x => x !== null && x !== undefined)
    .map(Number)
    .sort((a, b) => b - a);
}

function crN(namedShares, n) {
  const s = _sorted(namedShares);
  const sum = s.slice(0, n).reduce((acc, val) => acc + val, 0);
  return Number(sum.toFixed(2));
}

function hhi(namedShares, othersShare = 0.0, othersDistribution = 'single_bucket') {
  const s = _sorted(namedShares);
  if (s.length === 0 && othersShare === 0) return 0.0;
  
  const total = s.reduce((a, b) => a + b, 0) + othersShare;
  if (Math.abs(total - 1.0) < 0.01 && Math.max(...s, othersShare) <= 1.0) {
    throw new Error('HHI input looks like fractions summing to 1.0; pass percentages instead (e.g. 25.0 for 25%).');
  }

  let raw = s.reduce((acc, val) => acc + (val * val), 0);
  if (othersDistribution === 'single_bucket' && othersShare > 0) {
    raw += (othersShare * othersShare);
  }
  return Number(raw.toFixed(2));
}

function computeMetrics(namedShares, othersShare = 0.0, othersDistribution = 'single_bucket') {
  const s = _sorted(namedShares);
  const hSingle = hhi(s, othersShare, 'single_bucket');
  const hAtomic = hhi(s, othersShare, 'atomic');
  const classifyValue = othersDistribution === 'single_bucket' ? hSingle : hAtomic;
  
  const sumCheck = s.reduce((a, b) => a + b, 0) + othersShare;

  return {
    CR3: crN(s, 3),
    CR5: crN(s, 5),
    CR10: crN(s, 10),
    HHI: classifyValue,
    HHI_single_bucket_others: hSingle,
    HHI_atomic_others: hAtomic,
    classification: hhiClassification(classifyValue),
    sum_check: Number(sumCheck.toFixed(2)),
    n_named: s.length,
    others_share: othersShare
  };
}

function deltaBps(shareLatest, shareT5) {
  if (shareT5 === null || shareT5 === undefined) return null;
  return Number(((shareLatest - shareT5) * 100).toFixed(1));
}

function asymmetricFlag(bearShare, bullShare, thresholdBps = 500) {
  const spreadBps = Math.abs(bullShare - bearShare) * 100;
  return spreadBps >= thresholdBps;
}

module.exports = {
  hhiClassification,
  crN,
  hhi,
  computeMetrics,
  deltaBps,
  asymmetricFlag
};
