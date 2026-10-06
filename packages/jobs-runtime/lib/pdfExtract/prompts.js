'use strict';

/**
 * Extraction prompts for Tier 3 models.
 *
 * ONE specification (SPEC) holds all the information a model needs. Every style below renders ALL of it, only the
 * wording and layout differ, so no model is expected to infer implicitly what another was told. A test asserts that
 * every spec item appears in every rendered style. Styles:
 *   chat     default for 7B+ chat/vision models (qwen2.5:7b, qwen3-vl:8b, ...): prose rules plus field list
 *   compact  for models of about 4B parameters or less: the same content as a short numbered checklist
 * Dedicated OCR models (glm-ocr, deepseek-ocr) do not take instructions; they use the fixed task prompt their
 * authors trained them on (ocrmodel.js).
 */

const FIELD_DEFS = {
  revenue: 'revenue from operations',
  otherIncome: 'other income',
  totalIncome: 'total income (revenue from operations plus other income)',
  employeeCost: 'employee benefit expense',
  interest: 'finance costs',
  depreciation: 'depreciation and amortisation expense',
  otherExpenses: 'other expenses',
  totalExpenses: 'total expenses',
  pbt: 'profit before tax, after exceptional items',
  tax: 'total tax expense (current plus deferred)',
  pat: 'profit for the period, before minority interest and other comprehensive income',
  epsBasic: 'basic earnings per share in rupees (not the face value of the share)',
};

const SPEC = {
  task: "You read one page of an Indian listed company's quarterly financial results and extract its Statement of Profit and Loss.",
  column:
    'Read the CURRENT QUARTER only: the first numeric column. Ignore the previous quarter, the year-ago quarter and the year-to-date or full-year columns.',
  rules: [
    'Copy every number exactly as printed. Do not compute, round, convert or correct anything.',
    'A number in brackets is negative.',
    'If a line is not on the page, use null. Never guess.',
    'Ignore note numbers and line numbers printed beside a label (for example the "4" in "Total expenses (4)").',
    'If the page shows both a standalone and a consolidated table, extract the consolidated one and report "consolidated" in "basis".',
  ],
  unit: '"unit" is the unit printed near the table heading (crore, lakh, million, thousand). It may be written "Rs. in Lakhs", "(₹ in Crores)", "in Mn" or similar. If none is printed, use "unknown".',
  basis: '"basis" is "consolidated" or "standalone" as the page title says, otherwise "unknown".',
  output:
    'Answer with the JSON object only: unit, basis, period (the quarter-end date as printed, or null) and values (all twelve fields, null where absent).',
  example: [
    'Example (a made-up page, to show the format only):',
    'Heading "Consolidated Financial Results, Rs. in Lakhs"; first column rows: Revenue from operations 1,200.50; Other income 30.00; Total income 1,230.50; Total expenses 1,000.00; Profit before tax 230.50; Tax expense 58.00; Net profit (172.50).',
    'Answer: {"unit":"lakh","basis":"consolidated","period":null,"values":{"revenue":1200.5,"otherIncome":30,"totalIncome":1230.5,"employeeCost":null,"interest":null,"depreciation":null,"otherExpenses":null,"totalExpenses":1000,"pbt":230.5,"tax":58,"pat":-172.5,"epsBasic":null}}',
  ].join('\n'),
};

const fieldLines = () => Object.entries(FIELD_DEFS).map(([k, d]) => `${k}: ${d}`);

function renderChat() {
  return [
    SPEC.task,
    SPEC.column,
    'Rules:',
    ...SPEC.rules.map((r) => `- ${r}`),
    `- ${SPEC.unit}`,
    `- ${SPEC.basis}`,
    `- Fields: ${fieldLines().join('; ')}.`,
    SPEC.output,
    SPEC.example,
  ].join('\n');
}

function renderCompact() {
  const steps = [
    SPEC.column,
    ...SPEC.rules,
    SPEC.unit,
    SPEC.basis,
    `Fields, one value each: ${fieldLines().join(' | ')}.`,
    SPEC.output,
  ];
  return [SPEC.task, ...steps.map((s, i) => `${i + 1}. ${s}`), SPEC.example].join('\n');
}

const STYLES = { chat: renderChat, compact: renderCompact };

/** About 4B parameters or fewer (tags :0.5b :1.5b :2b :3b :4b) get the compact checklist. */
function styleFor(model) {
  return /[:\-_](0\.5|1\.5|1|2|3|4)b\b/i.test(String(model || '')) ? 'compact' : 'chat';
}

/** @returns {{style: string, system: string}} */
function promptFor(model, style) {
  const s = STYLES[style] ? style : styleFor(model);
  return { style: s, system: STYLES[s]() };
}

module.exports = { SPEC, FIELD_DEFS, STYLES, styleFor, promptFor };
