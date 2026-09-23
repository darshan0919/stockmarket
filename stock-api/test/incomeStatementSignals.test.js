const { compute } = require('../src/analyzers/incomeStatementSignals');

// Regression for the 2026-09-23 fix: the inventory/RM-cost combination flag
// must be direction-aware. Fixture numbers are NSE:SUPRIYA's real Q1 FY27
// vs Q1 FY26 P&L (RM cost/sales worsened sharply while inventory built up).
function buildLineData({ costOfMaterialsWorsened, inventoryBuild }) {
  return {
    costOfMaterials: {
      value: 100,
      qoq: 100,
      yoy: 100,
      pctOfSalesQoQDeltaBps: costOfMaterialsWorsened ? 2751 : -500,
      yoyPct: costOfMaterialsWorsened ? 149.9 : -10,
    },
    changeInInventories: {
      value: inventoryBuild ? -530.15 : 419.66,
      qoq: 0,
      yoy: 0,
    },
  };
}

describe('incomeStatementSignals combinations', () => {
  it('flags RM_COST_PRESSURE_MASKED_BY_INVENTORY_BUILD when RM cost worsens during an inventory build', () => {
    const { combinations } = compute(
      buildLineData({ costOfMaterialsWorsened: true, inventoryBuild: true }),
      { pbtDelta: -1000 }
    );
    const flags = combinations.map((c) => c.flag);
    expect(flags).toContain('RM_COST_PRESSURE_MASKED_BY_INVENTORY_BUILD');
    expect(flags).not.toContain('INVENTORY_GAIN_DRIVEN');
  });

  it('flags INVENTORY_GAIN_DRIVEN only when RM cost genuinely improves during an inventory build', () => {
    const { combinations } = compute(
      buildLineData({ costOfMaterialsWorsened: false, inventoryBuild: true }),
      { pbtDelta: -1000 }
    );
    const flags = combinations.map((c) => c.flag);
    expect(flags).toContain('INVENTORY_GAIN_DRIVEN');
    expect(flags).not.toContain('RM_COST_PRESSURE_MASKED_BY_INVENTORY_BUILD');
  });

  it('flags RM_COST_PRESSURE_COMPOUNDED_BY_DESTOCKING when RM cost worsens during a drawdown', () => {
    const { combinations } = compute(
      buildLineData({ costOfMaterialsWorsened: true, inventoryBuild: false }),
      { pbtDelta: -1000 }
    );
    const flags = combinations.map((c) => c.flag);
    expect(flags).toContain('RM_COST_PRESSURE_COMPOUNDED_BY_DESTOCKING');
  });
});
