#!/usr/bin/env node
'use strict';

/**
 * extract_statements.js — locates, normalizes and staleness-checks the
 * BALANCE SHEET and CASH FLOW STATEMENT for a quarter, from whichever
 * document actually carries them.
 *
 * WHY THIS EXISTS. The income statement is easy: every quarterly Result
 * filing has one, always for the quarter just ended. The other two
 * statements are not like that in India. SEBI LODR Reg 33(3) requires a
 * statement of assets and liabilities and a statement of cash flows only
 * "as at / for the half-year", filed as notes to the half-yearly results.
 * So:
 *   - Q1 and Q3 filings normally carry neither statement, and that absence
 *     is compliance-normal rather than a finding;
 *   - an investor PPT in those quarters often DOES show a balance sheet,
 *     but it is usually the last published (H1 or FY) one repeated;
 *   - cash-flow figures, when present, are cumulative (H1 YTD or FY), never
 *     a single quarter.
 * Analysing a repeated statement as if it were new is the worst available
 * failure mode here — a confident write-up about numbers that did not
 * change. This script exists so that judgment never has to be made by a
 * model reading raw PDF text: it answers, deterministically, "is there a
 * statement, where did it come from, what date is it as at, and is it
 * actually different from the one we already saw?"
 *
 * DIVISION OF LABOUR (conventions.md §17). Locating the section, parsing
 * labelled numeric rows, mapping known label synonyms onto the normalized
 * schema, fingerprinting and comparing is all pure logic and lives here.
 * What is left for a model is small and genuinely ambiguous: any row this
 * script could not map is returned in `unmatched[]` for the caller to
 * assign (or discard) before the analyzers run. That residue is expected —
 * filings use inconsistent labels — and handing it back explicitly is
 * better than silently dropping a line that might be material.
 *
 * Usage:
 *   node extract_statements.js \
 *     --companyId NSE:X \
 *     --result-text /tmp/X_qra_docs/result.txt \
 *     [--ppt-text /tmp/X_qra_docs/ppt.txt] \
 *     [--prior-statements /tmp/X_qra_docs/prior_statements.json] \
 *     [--quarter-end 2026-09-30]
 *
 * Output (stdout, JSON): see `emit()` at the bottom.
 */

const fs = require('fs');
const crypto = require('crypto');

// ── args ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    companyId: null,
    resultText: null,
    pptText: null,
    priorStatements: null,
    quarterEnd: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--companyId') out.companyId = argv[++i];
    else if (a === '--result-text') out.resultText = argv[++i];
    else if (a === '--ppt-text') out.pptText = argv[++i];
    else if (a === '--prior-statements') out.priorStatements = argv[++i];
    else if (a === '--quarter-end') out.quarterEnd = argv[++i];
  }
  return out;
}

function readIfExists(p) {
  if (!p || !fs.existsSync(p)) return null;
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (_) {
    return null;
  }
}
function readJsonIfExists(p) {
  const t = readIfExists(p);
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch (_) {
    return null;
  }
}

// ── section location ──────────────────────────────────────────────────────
// Headings are matched loosely because filings phrase them a dozen ways.
// Consolidated is preferred over standalone wherever both appear: an
// investor owns the consolidated entity, and subsidiaries are exactly where
// the interesting items tend to sit.

const BS_HEADINGS = [
  /statement\s+of\s+(?:consolidated\s+|standalone\s+|unaudited\s+|audited\s+)*assets\s+and\s+liabilities/i,
  /(?:consolidated\s+|standalone\s+)?balance\s+sheet/i,
  /statement\s+of\s+financial\s+position/i,
  /\bassets\s+and\s+liabilities\b/i,
];
const CF_HEADINGS = [
  /statement\s+of\s+(?:consolidated\s+|standalone\s+)?cash\s*flows?/i,
  /(?:consolidated\s+|standalone\s+)?cash\s*flow\s+statement/i,
  /cash\s+flows?\s+from\s+operating\s+activities/i,
];
const CONSOLIDATED = /consolidated/i;

/** Split text into lines with their offsets so a section can be sliced out. */
function locateSection(text, headings, { maxChars = 20000, stopAt = [] } = {}) {
  if (!text) return null;
  const hits = [];
  for (const re of headings) {
    let m;
    const g = new RegExp(re.source, 'gi');
    while ((m = g.exec(text)) !== null) hits.push(m.index);
  }
  if (!hits.length) return null;
  // Prefer a hit whose preceding 200 chars mention "consolidated".
  hits.sort((a, b) => a - b);
  const preferred =
    hits.find((i) => CONSOLIDATED.test(text.slice(Math.max(0, i - 200), i + 200))) ?? hits[0];
  let body = text.slice(preferred, preferred + maxChars);
  // Truncate at the next *other* statement heading so a balance-sheet slice
  // never swallows the cash-flow rows that follow it in the same filing.
  if (Array.isArray(stopAt) && stopAt.length) {
    let cut = body.length;
    for (const re of stopAt) {
      const m = new RegExp(re.source, 'i').exec(body.slice(50));
      if (m && m.index + 50 < cut) cut = m.index + 50;
    }
    body = body.slice(0, cut);
  }
  return {
    startOffset: preferred,
    consolidated: CONSOLIDATED.test(text.slice(Math.max(0, preferred - 200), preferred + 200)),
    body,
  };
}

// ── number + date parsing ────────────────────────────────────────────────
// Indian filings use lakh/crore separators, parenthesised negatives, and
// en-dashes for nil. A row is "label followed by one or more numbers"; the
// FIRST number is the current period (filings print current-period-first),
// which is why column order is preserved rather than max-picked.

function parseNumberToken(tok) {
  if (tok == null) return null;
  let t = String(tok).trim();
  if (!t || /^[-–—]$/.test(t)) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  t = t.replace(/[,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const v = parseFloat(t);
  if (!Number.isFinite(v)) return null;
  return neg ? -v : v;
}

const NUM_RE = /\(?-?[\d][\d,]*(?:\.\d+)?\)?|[-–—]/g;

// A numbered/lettered line-item marker at the start of a row ("1  Revenue
// from operations ...", "(a) Cost of materials consumed ...") is not part of
// the label and, critically, is NOT the row's data — a P&L table in a Result
// filing routinely numbers its line items this way (confirmed 2026-09-23
// building extract_income_statement.js), and without stripping it, parseRows
// mistook the leading "1"/"2"/etc. for the row's first (current-period) data
// value, silently shifting every parsed number one column early. Only
// stripped when followed by a letter or '(' so a genuine data-only row
// (rare, but possible) is never mistaken for a numbered label.
// Deliberately NOT `\(?[a-zA-Z0-9]{1,3}\)?` (both delimiters optional) --
// that matched ANY short leading word, including real label text like "Net"
// in "Net Cash generated from Operating Activities" (confirmed 2026-09-23: it
// silently ate "Net" off cash-flow subtotal rows, breaking the CF_MAP match
// for cfo/cfi/cff on a real filing). A bare, unparenthesized marker is only
// ever digits ("1", "10.") or an uppercase Roman numeral ("V", "IX") in
// practice; a parenthesized one ("(a)", "(iii)") needs its closing paren so
// it can't be confused with a real word that merely starts with a letter.
// `[.)|]?` (not just `[.)]?`): a corrupted PDF font can render the closing
// paren of a numbered row marker as a pipe -- confirmed 2026-09-23 on a real
// filing: "1|       Profit for the period/ year (5-6)" (should be "1)"). Left
// unstripped, the leading "1" was read as the row's own first data value,
// silently shifting every column one to the left (current-quarter PAT read
// as the marker digit, QoQ read as what should have been current, etc.) --
// exactly the same failure class the original ITEM_MARKER_RE fix targeted,
// just a punctuation variant that regex didn't yet cover.
const ITEM_MARKER_RE =
  /^(?:\([a-zA-Z0-9]{1,3}\)|\d{1,3}[.)|\]]?|[IVXLCM]{1,4})[.)|\]]?\s+(?=[A-Za-z(])/;

function parseRows(body) {
  const rows = [];
  const rawLines = body.split(/\r?\n/);
  // A label long enough to wrap gets a data-free line (letters, no numbers)
  // immediately followed by a numbers-only line (the columns, indented to
  // where they'd normally sit inline) — confirmed 2026-09-23 against a real
  // filing: "Change in inventories of finished goods, work\n  in progress &
  // stock in trade.\n                    219.66   (160.98) ...". Without
  // merging these two physical lines, the row is silently dropped (no
  // numbers on the label line) and the numbers-only line is dropped too (no
  // label). `pendingLabel` carries a data-free label line forward one
  // iteration so it can be re-attached to numbers that show up next.
  // Accumulates ALL data-free label lines seen since the last data row (a
  // wrapped label can itself wrap across more than one physical line before
  // its numbers appear — confirmed 2026-09-23 on a real filing: "Change in
  // inventories of finished goods, work" / "in progress & stock in trade."
  // / "<numbers>" is 2 label lines then the data, not 1). A single-string
  // `pendingLabel` (the first version of this fix) silently overwrote the
  // first fragment when the second arrived, dropping "Change in inventories"
  // and merging only "in progress & stock in trade." with the numbers.
  let pendingLabelParts = [];
  for (const rawLine of rawLines) {
    let line = rawLine.trim();
    if (!line || line.length < 3) {
      pendingLabelParts = [];
      continue;
    }
    const markerMatch = line.match(ITEM_MARKER_RE);
    if (markerMatch) line = line.slice(markerMatch[0].length);
    // A heading like "...for the half-year ended 30th September, 2026" carries
    // numbers that are a date, not data. Dropping these prevents the heading
    // from being mapped as if it were the first matching data row.
    if (/(ended|as\s+at|as\s+on)\b/i.test(line) && /\b(19|20)\d{2}\b/.test(line)) {
      pendingLabelParts = [];
      continue;
    }
    const nums = line.match(NUM_RE) || [];
    const parsed = nums.map(parseNumberToken).filter((v) => v != null);
    const hasLetters = /[A-Za-z]/.test(line);
    if (!nums.length) {
      // A line with NO numeric-looking tokens at all (not even a dash) is
      // either a genuine sub-heading or (another) fragment of a wrapped
      // label. Accumulate it (only if it reads like label text) in case a
      // later line is the numbers it belongs to.
      if (hasLetters) pendingLabelParts.push(line.trim());
      else pendingLabelParts = [];
      continue;
    }
    if (!parsed.length) {
      // Numeric-LOOKING tokens are present but every one is a dash ("nil
      // disclosed") -- e.g. "Purchase of Stock in Trade    -    -". This is
      // its own complete (if uninteresting) row, NOT a label fragment:
      // confirmed 2026-09-23 on a real filing where treating an all-dash row
      // as "label-only" merged its label into the FOLLOWING real row's
      // label, corrupting it. Drop it and clear any pending fragments -- a
      // row boundary was just crossed, so a fragment held from before this
      // line can't still belong to whatever comes next.
      pendingLabelParts = [];
      continue;
    }
    if (!hasLetters && pendingLabelParts.length) {
      // Numbers-only line right after 1+ held label fragments -> this is
      // that label's continuation, not a standalone (unlabelled) data row.
      const label = pendingLabelParts.join(' ');
      rows.push({ label, values: parsed, raw: `${label} ${line}` });
      pendingLabelParts = [];
      continue;
    }
    pendingLabelParts = [];
    // Label = text before the first numeric token.
    const firstNumIdx = line.search(/\(?-?\d/);
    const label = (firstNumIdx > 0 ? line.slice(0, firstNumIdx) : line).trim();
    if (!label || !/[A-Za-z]/.test(label)) continue;
    rows.push({ label, values: parsed, raw: line });
  }
  return rows;
}

/**
 * Units: filings state "Rs in lakhs/crores/millions" near the top — but not
 * always as a clean 2-word phrase. Confirmed 2026-09-23 against a real
 * SUPRIYA Q4 FY26 filing: "(All amounts in Indian \"million, except as
 * otherwise stated)" and "(All amounts in Indian ~ million, ...)" — the
 * rupee symbol renders as a stray quote or tilde depending on the PDF's font
 * encoding, and "Indian" sits between "in" and the unit word. `{0,2}` extra
 * tokens tolerates that without over-matching into an unrelated sentence.
 */
function detectUnitScale(body) {
  const head = body.slice(0, 1500);
  // Proximity check rather than a fixed-token-count regex: a broken font can
  // glue a corrupted rupee-symbol glyph directly onto the unit word with NO
  // separating whitespace (confirmed 2026-09-23: the SAME real filing had
  // 'in Indian "million,' — quote glued to "million", zero intervening
  // whitespace tokens — right next to 'in Indian ~ million,' on its cash flow
  // page, where "~" WAS its own whitespace-separated token). A word-count
  // regex passes one phrasing and fails the other; "does 'in' appear shortly
  // before the unit word" survives both.
  const near = (word) => {
    const m = new RegExp(word, 'i').exec(head);
    if (!m) return false;
    const before = head.slice(Math.max(0, m.index - 30), m.index);
    return /\bin\b/i.test(before);
  };
  if (near('lakh')) return { unit: 'lakh', toCr: 0.01 };
  if (near('million')) return { unit: 'million', toCr: 0.1 };
  if (near('crore')) return { unit: 'crore', toCr: 1 };
  if (near('thousand')) return { unit: 'thousand', toCr: 0.0001 };
  return { unit: 'unknown', toCr: null };
}

const DATE_RE =
  /(?:as\s+at|as\s+on|for\s+the\s+(?:half[-\s]?year|period|year)\s+ended)\s+([0-3]?\d)(?:st|nd|rd|th)?[\s.-]*([A-Za-z]+|\d{1,2})[\s.,-]*(\d{4})/i;
// Month-first order ("as at March 31, 2026") — confirmed 2026-09-23 against a
// real filing heading; the day-first DATE_RE above never matches this order.
const DATE_RE_MONTH_FIRST =
  /(?:as\s+at|as\s+on|for\s+the\s+(?:half[-\s]?year|period|year)\s+ended)\s+([A-Za-z]+)\s+([0-3]?\d)(?:st|nd|rd|th)?,?\s*(\d{4})/i;
const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function parseAsOfDate(body) {
  const m = body.match(DATE_RE);
  if (m) {
    const day = parseInt(m[1], 10);
    let month = null;
    if (/^\d+$/.test(m[2])) month = parseInt(m[2], 10);
    else month = MONTHS[m[2].slice(0, 3).toLowerCase()] || null;
    const year = parseInt(m[3], 10);
    if (day && month && year)
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  // Try month-first order before giving up (see DATE_RE_MONTH_FIRST's comment).
  const mf = body.match(DATE_RE_MONTH_FIRST);
  if (mf) {
    const month = MONTHS[mf[1].slice(0, 3).toLowerCase()] || null;
    const day = parseInt(mf[2], 10);
    const year = parseInt(mf[3], 10);
    if (day && month && year)
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

/** Half-year vs full-year vs quarter, inferred from the heading language. */
function detectCoverage(body) {
  const head = body.slice(0, 2000);
  if (/half[-\s]?year/i.test(head)) return 'half-year';
  if (/year\s+ended|twelve\s+months|annual/i.test(head)) return 'full-year';
  if (/quarter\s+ended|three\s+months/i.test(head)) return 'quarter';
  return 'unknown';
}

// ── label → normalized key maps ──────────────────────────────────────────
// Ordered: first match wins, so the more specific pattern must come first
// (e.g. "current maturities of long term debt" before plain "borrowings").

const BS_MAP = [
  [/current\s+maturit/i, 'currentMaturitiesLTD'],
  [/(non[-\s]?current|long[-\s]?term)\s+(borrowing|debt)/i, 'borrowingsNonCurrent'],
  [/(current|short[-\s]?term)\s+(borrowing|debt)/i, 'borrowingsCurrent'],
  [/lease\s+liabilit/i, 'leaseLiabilitiesNonCurrent'],
  [/trade\s+(payable|and\s+other\s+payable)/i, 'tradePayables'],
  [/trade\s+receivable|sundry\s+debtor/i, 'tradeReceivables'],
  [/inventor|stock[-\s]in[-\s]trade/i, 'inventories'],
  [/cash\s+and\s+cash\s+equivalent|cash\s+and\s+bank/i, 'cashAndEquivalents'],
  [/(other\s+)?bank\s+balance/i, 'bankBalancesOther'],
  [/(non[-\s]?current)\s+investment/i, 'investmentsNonCurrent'],
  [/current\s+investment|investment.*current/i, 'investmentsCurrent'],
  [/capital\s+work[-\s]in[-\s]progress|cwip/i, 'cwip'],
  [/intangible\s+assets?\s+under\s+development/i, 'intangiblesUnderDevelopment'],
  [/goodwill/i, 'goodwill'],
  [/(other\s+)?intangible\s+asset/i, 'otherIntangibles'],
  [/property,?\s*plant\s+and\s+equipment|net\s+block|fixed\s+asset/i, 'netBlock'],
  [/gross\s+block/i, 'grossBlock'],
  [/deferred\s+tax\s+asset/i, 'deferredTaxAssets'],
  [/deferred\s+tax\s+liabilit/i, 'deferredTaxLiabilities'],
  [
    /(loans?\s+and\s+advances?|loans?)\b.*non[-\s]?current|non[-\s]?current.*loans?/i,
    'loansAdvancesNonCurrent',
  ],
  [/loans?\s+and\s+advances?|loans?\b/i, 'loansAdvancesCurrent'],
  [/equity\s+share\s+capital|share\s+capital/i, 'equityShareCapital'],
  [/other\s+equity|reserves?\s+and\s+surplus/i, 'otherEquity'],
  [/(non[-\s]?controlling|minority)\s+interest/i, 'minorityInterest'],
  [/(non[-\s]?current)\s+provision/i, 'provisionsNonCurrent'],
  [/provision/i, 'provisionsCurrent'],
  [/other\s+non[-\s]?current\s+(asset|financial\s+asset)/i, 'otherNonCurrentAssets'],
  [/other\s+current\s+(asset|financial\s+asset)/i, 'otherCurrentAssets'],
  [/other\s+non[-\s]?current\s+liabilit/i, 'otherNonCurrentLiabilities'],
  [/other\s+current\s+liabilit|other\s+financial\s+liabilit/i, 'otherCurrentLiabilities'],
  [/total\s+assets/i, 'totalAssets'],
  [/total\s+equity\s+and\s+liabilit|total\s+liabilit.*equity/i, 'totalEquityAndLiabilities'],
  [/contingent\s+liabilit/i, 'contingentLiabilities'],
];

const CF_MAP = [
  [/profit\s+before\s+tax|pbt/i, 'pbt'],
  [/depreciation|amorti[sz]ation/i, 'depreciation'],
  [/finance\s+cost|interest\s+expense/i, 'financeCostAddBack'],
  [/operating\s+profit\s+before\s+working\s+capital/i, 'opProfitBeforeWCChanges'],
  [/(decrease|increase|change).*(trade\s+receivable|receivable)/i, 'changeInReceivables'],
  [/(decrease|increase|change).*inventor/i, 'changeInInventories'],
  [/(decrease|increase|change).*(trade\s+payable|payable)/i, 'changeInPayables'],
  [/(decrease|increase|change).*(other|provision|liabilit|current\s+asset)/i, 'changeInOtherWC'],
  [/(direct\s+)?tax(es)?\s+(paid|refund)/i, 'taxPaid'],
  [/net\s+cash.*operating\s+activit/i, 'cfo'],
  [/purchase.*(property|plant|fixed\s+asset|capital)/i, 'capex'],
  [/(sale|proceeds).*(property|plant|fixed\s+asset)/i, 'saleOfPPE'],
  [/purchase.*investment/i, 'purchaseOfInvestments'],
  [/(sale|proceeds|redemption).*investment/i, 'saleOfInvestments'],
  [/interest\s+received/i, 'interestReceived'],
  [/acquisition\s+of|business\s+combination/i, 'acquisitions'],
  [/loans?\s+(given|granted|to)\b/i, 'loansGiven'],
  [/net\s+cash.*investing\s+activit/i, 'cfi'],
  [
    /proceeds\s+from\s+(long|short)?[-\s]?term\s+borrowing|proceeds\s+from\s+borrowing/i,
    'proceedsFromBorrowings',
  ],
  [/repayment\s+of\s+borrowing|repayment\s+of\s+(long|short)?[-\s]?term/i, 'repaymentOfBorrowings'],
  [/proceeds\s+from\s+(issue\s+of\s+)?(equity|share)/i, 'proceedsFromEquity'],
  [/buy[-\s]?back/i, 'buyback'],
  [/dividend\s+paid/i, 'dividendPaid'],
  [/interest\s+paid/i, 'interestPaid'],
  [/net\s+cash.*financing\s+activit/i, 'cff'],
  [/net\s+(increase|decrease)\s+in\s+cash/i, 'netCashChange'],
  [
    /cash\s+(and\s+cash\s+equivalents?\s+)?at\s+the\s+beginning|opening\s+(balance\s+of\s+)?cash/i,
    'openingCash',
  ],
  [
    /cash\s+(and\s+cash\s+equivalents?\s+)?at\s+the\s+end|closing\s+(balance\s+of\s+)?cash/i,
    'closingCash',
  ],
];

function mapRows(rows, map, toCr) {
  const snapshot = {};
  const unmatched = [];
  const seen = new Set();
  for (const row of rows) {
    const hit = map.find(([re]) => re.test(row.label));
    if (!hit) {
      unmatched.push({ label: row.label, values: row.values });
      continue;
    }
    const key = hit[1];
    if (seen.has(key)) continue; // first occurrence wins (statement body precedes notes)
    seen.add(key);
    const raw = row.values[0];
    snapshot[key] = toCr == null ? raw : raw * toCr;
    // Column 2, when present, is the comparative period the filing itself prints.
    if (row.values.length > 1) {
      snapshot[`__prior_${key}`] = toCr == null ? row.values[1] : row.values[1] * toCr;
    }
  }
  return { snapshot, unmatched };
}

/** Pull the filing's own printed comparative column into a prior snapshot. */
function splitPriorColumn(snapshot) {
  const current = {};
  const prior = {};
  for (const [k, v] of Object.entries(snapshot)) {
    if (k.startsWith('__prior_')) prior[k.slice('__prior_'.length)] = v;
    else current[k] = v;
  }
  return { current, prior: Object.keys(prior).length ? prior : null };
}

// ── staleness ─────────────────────────────────────────────────────────────
/**
 * Fingerprint over the normalized numeric vector — key order sorted so that
 * a re-parse in a different row order still compares equal. Two filings
 * showing the identical statement produce the identical fingerprint, which
 * is what makes "the PPT is repeating last half-year's balance sheet"
 * detectable without a model reading either document.
 */
function fingerprint(snapshot) {
  if (!snapshot) return null;
  const keys = Object.keys(snapshot)
    .filter((k) => !k.startsWith('__prior_'))
    .sort();
  const vec = keys.map((k) => `${k}=${Number(snapshot[k]).toFixed(2)}`).join('|');
  return crypto.createHash('sha1').update(vec).digest('hex').slice(0, 16);
}

function assessStaleness({ found, snapshot, asOfDate, quarterEnd, priorRecord, kind }) {
  if (!found || !snapshot || Object.keys(snapshot).length < 4) {
    return {
      status: 'absent',
      reason:
        `No ${kind} found in the Result filing or the investor PPT. Under SEBI LODR Reg 33(3) ` +
        `this statement is required only half-yearly, so its absence in a Q1/Q3 filing is ` +
        `compliance-normal, not a red flag.`,
    };
  }
  const fp = fingerprint(snapshot);
  const priorFp = priorRecord ? priorRecord.fingerprint : null;
  if (priorFp && fp === priorFp) {
    return {
      status: 'stale-repeat',
      reason: `Numerically identical to the ${kind} already on record (as at ${priorRecord.asOfDate || 'unknown date'}) — the document is repeating the last published statement, not disclosing a new one.`,
      fingerprint: fp,
      asOfDate,
      priorAsOfDate: priorRecord.asOfDate || null,
    };
  }
  if (asOfDate && quarterEnd && asOfDate < quarterEnd) {
    return {
      status: 'stale-asof',
      reason: `Statement is as at ${asOfDate}, before this quarter's end (${quarterEnd}) — it belongs to an earlier period and must not be presented as this quarter's.`,
      fingerprint: fp,
      asOfDate,
    };
  }
  return { status: 'fresh', fingerprint: fp, asOfDate: asOfDate || null };
}

// ── extraction of one statement from the best available source ───────────
function extractOne({ resultText, pptText, headings, map, kind, stopAt = [] }) {
  for (const [sourceName, text] of [
    ['Result', resultText],
    ['PPT', pptText],
  ]) {
    const sec = locateSection(text, headings, { stopAt });
    if (!sec) continue;
    const scale = detectUnitScale(sec.body);
    const rows = parseRows(sec.body);
    if (rows.length < 4) continue;
    const { snapshot, unmatched } = mapRows(rows, map, scale.toCr);
    const split = splitPriorColumn(snapshot);
    if (Object.keys(split.current).length < 4) continue;
    return {
      found: true,
      source: sourceName,
      consolidated: sec.consolidated,
      unit: scale.unit,
      unitScaleToCr: scale.toCr,
      asOfDate: parseAsOfDate(sec.body),
      coverage: detectCoverage(sec.body),
      current: split.current,
      priorColumn: split.prior,
      unmatched,
      rowsParsed: rows.length,
      kind,
    };
  }
  return { found: false, source: null, kind };
}

function emit(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const resultText = readIfExists(args.resultText);
  const pptText = readIfExists(args.pptText);
  const priorStatements = readJsonIfExists(args.priorStatements) || {};

  if (!resultText && !pptText) {
    emit({
      companyId: args.companyId,
      error: 'no document text supplied — pass --result-text and/or --ppt-text',
      balanceSheet: { found: false },
      cashflow: { found: false },
    });
    process.exit(1);
  }

  const bs = extractOne({
    resultText,
    pptText,
    headings: BS_HEADINGS,
    map: BS_MAP,
    kind: 'balance sheet',
    stopAt: CF_HEADINGS,
  });
  const cf = extractOne({
    resultText,
    pptText,
    headings: CF_HEADINGS,
    map: CF_MAP,
    kind: 'cash flow statement',
    stopAt: BS_HEADINGS,
  });

  const bsStale = assessStaleness({
    found: bs.found,
    snapshot: bs.current,
    asOfDate: bs.asOfDate,
    quarterEnd: args.quarterEnd,
    priorRecord: priorStatements.balanceSheet || null,
    kind: 'balance sheet',
  });
  const cfStale = assessStaleness({
    found: cf.found,
    snapshot: cf.current,
    asOfDate: cf.asOfDate,
    quarterEnd: args.quarterEnd,
    priorRecord: priorStatements.cashflow || null,
    kind: 'cash flow statement',
  });

  emit({
    companyId: args.companyId,
    quarterEnd: args.quarterEnd || null,
    extractedAt: new Date().toISOString(),
    balanceSheet: { ...bs, staleness: bsStale },
    cashflow: { ...cf, staleness: cfStale },
    // Callers act on these two lines alone in the common case; everything
    // above is the evidence behind them.
    analysable: {
      balanceSheet: bsStale.status === 'fresh',
      cashflow: cfStale.status === 'fresh',
    },
  });
}

if (require.main === module) main();

module.exports = {
  parseNumberToken,
  parseRows,
  detectUnitScale,
  parseAsOfDate,
  detectCoverage,
  locateSection,
  mapRows,
  fingerprint,
  assessStaleness,
  extractOne,
  BS_MAP,
  CF_MAP,
  // Exported for extract_income_statement.js: the P&L section-slicer needs
  // to stop at the same headings this file uses to find BS/CF, so a filing
  // that runs P&L -> BS -> CF back-to-back doesn't have one section's text
  // bleed into another's.
  BS_HEADINGS,
  CF_HEADINGS,
};
