const db = require('/sessions/youthful-zealous-clarke/mnt/stockmarket/packages/jobs-runtime/lib/db.js');
const dto = db.readReport('rpt_pre-pead-scanner_NSE:HSCL_2026-07-10_19a5f433');
dto.macroOverlay = {
  quarterCovered: 'Q1FY27 (Apr-Jun 2026)',
  tailwind: 'Rupee depreciation (record low ~₹96.6/USD in May-2026, settling ~₹94-95/USD by late June) is a translation/realisation tailwind on the newly-ramping CTP export volumes out of the Haldia/Mangalore terminals — a partial offset not mentioned by management on the call, so not yet "banked" in their own framing.',
  headwind: 'Crude/coal-tar-linked feedstock cost inflation through Apr-May-2026 (Indian crude basket averaged ~$110/bbl before easing to ~$70-71/bbl by early July) is a sector-level headwind flagged for chemicals/tyres in the Q1FY27 macro log — a margin-lag risk specifically for Q1FY27 (management called out resilience to "West Asia dependence" on logistics/feedstock-sourcing, not to the price level of crude itself, so this is a real, unaddressed risk to the Q1FY27 OPM estimate, not a corroborated non-factor).',
  nonFactor: 'RBI repo hold / GDP-growth downgrade and the sub-normal-monsoon risk are not directly relevant to HSCL\'s industrial/EV-supply-chain demand base (not a rural-consumption or rate-sensitive-financing name) — treated as non-factors. US tariff de-escalation (18%→10%) is a non-factor absent disclosed US-bound export volumes for HSCL in the documents reviewed.',
  appliedRead: 'Net: a mild rupee tailwind on the export ramp, partially offset by a crude-cost headwind earlier in the quarter that should compress Q1FY27 OPM slightly versus Q4FY26\'s 21.7% before easing into Q2FY27 as spot crude normalises — this is already implicitly reflected in the wider (lower-confidence) margin/PAT range used for Q1FY27 in the roadmap below, rather than as a separate line item.'
};
dto.modifiedTime = new Date().toISOString();
db.saveReport(dto);
console.log('updated');
