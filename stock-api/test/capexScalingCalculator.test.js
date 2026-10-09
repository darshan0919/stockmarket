'use strict';

const {
  calculateCapacityProgression,
  calculateRevenuePotential,
} = require('../src/analyzers/capexScalingCalculator');

describe('capexScalingCalculator', () => {
  describe('calculateCapacityProgression', () => {
    test('calculates correct multiplier and breakdown for multi-plant expansion', () => {
      const baseCapacity = 3720;
      const expansions = [
        { facility: 'Talod', capacityAdd: 3780, capexOutlay: 20 },
        { facility: 'Indrad', capacityAdd: 6012, capexOutlay: 45 },
      ];

      const res = calculateCapacityProgression(baseCapacity, expansions);

      expect(res.baseCapacity).toBe(3720);
      expect(res.totalCapacityAdded).toBe(9792);
      expect(res.totalExpandedCapacity).toBe(13512);
      expect(res.expansionMultiplier).toBe(3.63);
      expect(res.expansionPercentage).toBe(263.2);
      expect(res.totalCapexOutlay).toBe(65);
      expect(res.facilityBreakdown).toHaveLength(2);
      expect(res.facilityBreakdown[0].facility).toBe('Talod');
      expect(res.facilityBreakdown[0].capacityAdd).toBe(3780);
      expect(res.facilityBreakdown[1].facility).toBe('Indrad');
      expect(res.facilityBreakdown[1].capacityAdd).toBe(6012);
    });

    test('handles empty expansions array gracefully', () => {
      const res = calculateCapacityProgression(1000, []);
      expect(res.baseCapacity).toBe(1000);
      expect(res.totalExpandedCapacity).toBe(1000);
      expect(res.totalCapacityAdded).toBe(0);
      expect(res.expansionMultiplier).toBe(1);
      expect(res.expansionPercentage).toBe(0);
      expect(res.totalCapexOutlay).toBe(0);
    });

    test('throws TypeError on invalid baseCapacity', () => {
      expect(() => calculateCapacityProgression(0)).toThrow(TypeError);
      expect(() => calculateCapacityProgression(-100)).toThrow(TypeError);
      expect(() => calculateCapacityProgression('invalid')).toThrow(TypeError);
    });
  });

  describe('calculateRevenuePotential', () => {
    test('calculates revenue potential using unit volume and realization', () => {
      // 4,500 MTPA with realization of ₹2,00,000 / MT (₹200/kg)
      // Total potential = 4,500 * 200,000 = 900,000,000 = ₹90 Cr run-rate
      // 70% to 90% utilization: ₹63 Cr to ₹81 Cr
      const res = calculateRevenuePotential({
        capacity: 4500,
        realizationPerUnit: 200000,
        utilizationMin: 0.7,
        utilizationMax: 0.9,
      });

      expect(res.method).toBe('realization');
      expect(res.revenueMinCr).toBe(63);
      expect(res.revenueMaxCr).toBe(81);
    });

    test('calculates revenue potential using capex and asset turnover ratio', () => {
      // Capex = ₹45 Cr, Asset Turn = 2.5x -> Peak Sales = ₹112.5 Cr
      // 70% to 90% utilization: ₹78.75 Cr to ₹101.25 Cr
      const res = calculateRevenuePotential({
        capacity: 6012,
        capexOutlay: 45,
        assetTurnover: 2.5,
        utilizationMin: 0.7,
        utilizationMax: 0.9,
      });

      expect(res.method).toBe('asset-turn');
      expect(res.revenueMinCr).toBe(78.75);
      expect(res.revenueMaxCr).toBe(101.25);
    });
  });
});
