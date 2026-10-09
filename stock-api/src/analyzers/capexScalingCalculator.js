'use strict';

/**
 * @fileoverview Capex Scaling & Capacity Progression Calculator.
 * Deterministically computes capacity expansion multiples, incremental unit additions,
 * and estimated revenue progression brackets across manufacturing facilities.
 *
 * Conforms to Monorepo Principle 17 (Extraction/Math first, Analysis second)
 * and AGENTS.md §4 (Typed JSDoc signatures).
 */

/**
 * @typedef {Object} FacilityExpansion
 * @property {string} facility Facility or site name
 * @property {number} capacityAdd Capacity added in units (MTPA, MW, etc.)
 * @property {number} [capexOutlay] Capital expenditure incurred or budgeted (in ₹ Cr)
 * @property {number} [realizationPerUnit] Realization per unit of volume (in ₹)
 * @property {number} [assetTurnover] Expected asset turnover ratio (Sales / Capex)
 * @property {string} [fundingSource] Funding mix description
 */

/**
 * @typedef {Object} CapacityProgressionResult
 * @property {number} baseCapacity Initial operational baseline capacity
 * @property {number} totalExpandedCapacity Cumulative installed capacity after all phases
 * @property {number} totalCapacityAdded Absolute incremental capacity added
 * @property {number} expansionMultiplier Capacity surge multiple (e.g. 3.63 for +263%)
 * @property {number} expansionPercentage Percentage expansion (e.g. 263.2%)
 * @property {number} totalCapexOutlay Total capital expenditure in ₹ Cr across all phases
 * @property {Array<{ facility: string, capacityShare: number, capacityAdd: number }>} facilityBreakdown Breakdown of additions by site
 */

/**
 * Calculates deterministic capacity expansion metrics across multiple manufacturing facilities.
 *
 * @param {number} baseCapacity Baseline installed capacity before expansion
 * @param {FacilityExpansion[]} expansions List of facility additions
 * @returns {CapacityProgressionResult} Fully computed capacity progression metrics
 */
function calculateCapacityProgression(baseCapacity, expansions = []) {
  if (typeof baseCapacity !== 'number' || baseCapacity <= 0) {
    throw new TypeError('baseCapacity must be a positive number');
  }

  let totalAdded = 0;
  let totalCapex = 0;

  const validExpansions = Array.isArray(expansions) ? expansions : [];

  for (const exp of validExpansions) {
    const add = typeof exp.capacityAdd === 'number' && exp.capacityAdd > 0 ? exp.capacityAdd : 0;
    const capex = typeof exp.capexOutlay === 'number' && exp.capexOutlay > 0 ? exp.capexOutlay : 0;
    totalAdded += add;
    totalCapex += capex;
  }

  const totalExpandedCapacity = baseCapacity + totalAdded;
  const expansionMultiplier = Number((totalExpandedCapacity / baseCapacity).toFixed(2));
  const expansionPercentage = Number(
    (((totalExpandedCapacity - baseCapacity) / baseCapacity) * 100).toFixed(1)
  );

  const facilityBreakdown = validExpansions.map((exp) => {
    const add = typeof exp.capacityAdd === 'number' && exp.capacityAdd > 0 ? exp.capacityAdd : 0;
    const share = totalAdded > 0 ? Number(((add / totalAdded) * 100).toFixed(1)) : 0;
    return {
      facility: exp.facility,
      capacityAdd: add,
      capacityShare: share,
    };
  });

  return {
    baseCapacity,
    totalExpandedCapacity,
    totalCapacityAdded: totalAdded,
    expansionMultiplier,
    expansionPercentage,
    totalCapexOutlay: Number(totalCapex.toFixed(2)),
    facilityBreakdown,
  };
}

/**
 * Calculates revenue potential brackets based on capacity utilization and realization or asset turn.
 *
 * @param {Object} params
 * @param {number} params.capacity Total capacity available for the product
 * @param {number} [params.realizationPerUnit] Realization per unit volume in ₹ (e.g. ₹200/kg -> ₹2,00,000/MT)
 * @param {number} [params.capexOutlay] Total capex in ₹ Cr (for asset turn approach)
 * @param {number} [params.assetTurnover] Expected asset turnover ratio (Sales / Capex)
 * @param {number} [params.utilizationMin=0.70] Minimum expected capacity utilization (e.g. 0.70 for 70%)
 * @param {number} [params.utilizationMax=0.90] Maximum expected capacity utilization (e.g. 0.90 for 90%)
 * @returns {{ revenueMinCr: number, revenueMaxCr: number, method: 'realization'|'asset-turn' }}
 */
function calculateRevenuePotential({
  capacity,
  realizationPerUnit,
  capexOutlay,
  assetTurnover,
  utilizationMin = 0.7,
  utilizationMax = 0.9,
}) {
  if (typeof realizationPerUnit === 'number' && realizationPerUnit > 0) {
    // Volume × Realization method (converted to ₹ Cr)
    const annualRunRateCr = (capacity * realizationPerUnit) / 10000000;
    const revenueMinCr = Number((annualRunRateCr * utilizationMin).toFixed(2));
    const revenueMaxCr = Number((annualRunRateCr * utilizationMax).toFixed(2));
    return { revenueMinCr, revenueMaxCr, method: 'realization' };
  }

  if (
    typeof capexOutlay === 'number' &&
    capexOutlay > 0 &&
    typeof assetTurnover === 'number' &&
    assetTurnover > 0
  ) {
    // Capex × Asset Turn method
    const peakSalesCr = capexOutlay * assetTurnover;
    const revenueMinCr = Number((peakSalesCr * utilizationMin).toFixed(2));
    const revenueMaxCr = Number((peakSalesCr * utilizationMax).toFixed(2));
    return { revenueMinCr, revenueMaxCr, method: 'asset-turn' };
  }

  return { revenueMinCr: 0, revenueMaxCr: 0, method: 'realization' };
}

module.exports = {
  calculateCapacityProgression,
  calculateRevenuePotential,
};
