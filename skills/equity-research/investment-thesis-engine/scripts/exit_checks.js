'use strict';
/**
 * exit_checks.js — deterministic exit-plan checks for a thesis record (no LLM).
 *   node exit_checks.js <thesis.json> <cmp> [asOfISO]
 * Flags: PRICE_STOP_BREACH (cmp <= exit_plan.price_stop), PROFIT_GIVEBACK, HORIZON_EXCEEDED, TIME_STOP_REVIEW (held >= time_stop_days
 * and |cmp-entry|/entry*100 < meaningful_move_pct), NO_EXIT_PLAN. Uses only the user's own numbers.
 */
const fs = require('fs');

function exitChecks(thesis, cmp, asOf = new Date()) {
  const p = thesis && thesis.exit_plan;
  if (!p) return { ticker: thesis && thesis.ticker, flags: ['NO_EXIT_PLAN'] };
  const flags = [];
  if (p.price_stop > 0 && cmp <= p.price_stop) flags.push('PRICE_STOP_BREACH');
  if (p.entry_date && p.entry_price > 0 && p.time_stop_days > 0 && p.meaningful_move_pct > 0) {
    const days = Math.floor((new Date(asOf) - new Date(p.entry_date)) / 86400000);
    const movePct = (Math.abs(cmp - p.entry_price) / p.entry_price) * 100;
    if (days >= p.time_stop_days && movePct < p.meaningful_move_pct) flags.push('TIME_STOP_REVIEW');
  } else {
    flags.push('EXIT_PLAN_INCOMPLETE');
  }
  // Profit giveback: share of the PEAK gain given back (peak_price is maintained by the caller = max CMP since entry).
  if (p.entry_price > 0 && p.peak_price > p.entry_price && p.giveback_pct > 0) {
    const gb = ((p.peak_price - cmp) / (p.peak_price - p.entry_price)) * 100;
    if (gb >= p.giveback_pct) flags.push('PROFIT_GIVEBACK');
  }
  // Holding horizon: user's own cap; a written override reason silences it.
  if (p.entry_date && p.max_hold_days > 0 && !p.horizon_override_reason) {
    if (Math.floor((new Date(asOf) - new Date(p.entry_date)) / 86400000) > p.max_hold_days)
      flags.push('HORIZON_EXCEEDED');
  }
  if (p.confirmation_status === 'failed') flags.push('CONFIRMATION_FAILED');
  return { ticker: thesis.ticker, flags };
}

module.exports = { exitChecks };

if (require.main === module) {
  const [file, cmp, asOf] = process.argv.slice(2);
  console.log(
    JSON.stringify(
      exitChecks(JSON.parse(fs.readFileSync(file, 'utf8')), Number(cmp), asOf || new Date()),
      null,
      2
    )
  );
}
