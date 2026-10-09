'use strict';
const { exitChecks } = require('./exit_checks');
const base = {
  ticker: 'NSE:X',
  exit_plan: {
    price_stop: 90,
    entry_date: '2026-01-01',
    entry_price: 100,
    time_stop_days: 90,
    meaningful_move_pct: 5,
  },
};
test('flags', () => {
  expect(exitChecks({ ticker: 'A' }, 100).flags).toEqual(['NO_EXIT_PLAN']);
  expect(exitChecks(base, 89, '2026-02-01').flags).toContain('PRICE_STOP_BREACH');
  expect(exitChecks(base, 102, '2026-05-01').flags).toContain('TIME_STOP_REVIEW');
  expect(exitChecks(base, 120, '2026-05-01').flags).toEqual([]);
  expect(exitChecks({ ticker: 'B', exit_plan: { price_stop: 90 } }, 100).flags).toContain(
    'EXIT_PLAN_INCOMPLETE'
  );
  const gb = {
    ticker: 'C',
    exit_plan: {
      entry_price: 100,
      peak_price: 150,
      giveback_pct: 10,
      price_stop: 80,
      entry_date: '2026-01-01',
      time_stop_days: 90,
      meaningful_move_pct: 5,
      max_hold_days: 730,
    },
  };
  expect(exitChecks(gb, 144, '2026-03-01').flags).toContain('PROFIT_GIVEBACK'); // 6/50 = 12%
  expect(exitChecks(gb, 147, '2026-03-01').flags).not.toContain('PROFIT_GIVEBACK'); // 6%
  expect(exitChecks(gb, 147, '2028-06-01').flags).toContain('HORIZON_EXCEEDED');
  gb.exit_plan.horizon_override_reason = 'FY29 J-curve';
  expect(exitChecks(gb, 147, '2028-06-01').flags).not.toContain('HORIZON_EXCEEDED');
});
