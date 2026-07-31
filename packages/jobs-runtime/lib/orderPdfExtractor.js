'use strict';

/**
 * orderPdfExtractor.js — deterministic extraction of order VALUE, product
 * QUANTITIES, and EXECUTION TIMELINE from the text layer of a SEBI Reg-30
 * order-win filing.
 *
 * Why this is tractable: since SEBI Master Circular
 * HO/49/14/14(7)2025-CFD-POD2/I/3762/2026 (30 Jan 2026), every order filing
 * carries a standard "Annexure A" table with fixed rows — (a) awarding
 * entity, ... (f) "Time period by which the order(s)/contract(s) is to be
 * executed", (g) "Broad consideration or size of the order(s)/contract(s)".
 * The wording of the answers varies but the vocabulary is narrow, so regex
 * over the whole document works without needing to reconstruct table layout.
 *
 * Two hard-won details from the live sample (NSE:NCC + NSE:RVNL, 2026-07-31):
 *
 *  1. The ₹ glyph is frequently mangled by the PDF's font encoding — RVNL's
 *     filings render it as a stray "f" or "t" ("f 758.07 crores"). So the
 *     currency symbol CANNOT be required. Instead the amount is cross-checked
 *     against the SEBI-mandated word form ("(Rupees Seven Hundred Fifty Eight
 *     Crores Seven Lakhs Only)"), which survives font mangling intact and is
 *     what promotes a reading to `high` confidence.
 *
 *  2. Monthly-aggregate filings (NCC's "Order(s) received during June 2026")
 *     state a total AND its components. Blindly summing every rupee figure
 *     would double-count. When the smaller figures sum to the largest, the
 *     largest is the stated total and the rest are its breakdown — flagged as
 *     `isAggregate` so the ledger never adds them separately.
 *
 * @see {@link docs/ORDER_BOOK_EXTRACTION.md}
 */

const SCALE_TO_CR = {
  cr: 1,
  crore: 1,
  crores: 1,
  lakh: 0.01,
  lakhs: 0.01,
  lac: 0.01,
  lacs: 0.01,
  mn: 0.1,
  million: 0.1,
  bn: 1000,
  billion: 1000,
};

// Currency prefix is optional on purpose — see note 1 in the file header.
const SCALED_RE =
  /(?:(?:Rs\.?|₹|INR|[a-zA-Z`'"])\s*)?([\d][\d,]*\.?\d*)\s*(Crores|Crore|Cr\.?|Lakhs|Lakh|Lacs|Lac|Million|Mn|Billion|Bn)\b/gi;

// "INR 39,21,00,000 /-" — absolute rupees in Indian digit grouping. Requires
// an explicit currency token; a bare 9-digit number is far more likely to be
// a phone/CIN/reference number than an amount.
const ABSOLUTE_RE = /(?:Rs\.?|₹|INR)\s*([\d]{1,3}(?:,\d{2})*,\d{3}(?:\.\d+)?|\d{7,}(?:\.\d+)?)/gi;

const WORDFORM_RE = /Rupees\s+([A-Za-z\s,&-]{6,240}?)\s*(?:Only\b|\))/i;

// "36 Months", "730 Days", "42 months", "2 years".
// The `(?:\s\d)*` tail is not cosmetic: these PDFs kern digits apart badly
// enough that the text layer emits "6 0 months" for 60 and "1 5 years" for 15.
// Without it the leading digits are dropped and "6 0 months" reads as 0.
// Only single digits are absorbed, so "2026 36 months" still yields 36.
const DURATION_RE = /\b(\d{1,4}(?:\s\d)*)\s*(months|month|days|day|weeks|week|years|year)\b/gi;

// SEBI's Reg-30 order annexure asks, at row (f), for the execution period.
// Every issuer sampled reproduces this label verbatim, and the duration that
// follows it is the execution window by definition — a far stronger signal
// than any heuristic over the prose above it.
const ROW_F_RE = /Time\s*period\s*by\s*which\s*the\s*order[^.]{0,40}?is\s*to\s*be\s*executed/i;

// O&M / annuity tails routinely dwarf the EPC period (WABAG: 21 months of
// build, 15 years of O&M). They are not execution time and must never bound
// the window.
const OM_BEFORE_RE =
  /(?:O\s*&\s*M|operation(?:s)?\s*(?:&|and)\s*maintenance|defect\s+liability|warranty|annuity|post\s*-?\s*commissioning)/i;
// "…21 months, followed by 15 years of operation and maintenance" — here the
// O&M wording trails the figure, so a tight look-ahead is needed too. It must
// stay tight: "36 months followed by O&M for 7 years" has O&M after it as
// well, and that 36 IS the execution period.
const OM_AFTER_RE = /^\s*(?:of|for)\s+(?:O\s*&\s*M|operation)/i;

const EXEC_CONTEXT_RE =
  /(?:execut|complet|commission|deliver|schedul|EPC\b|contract\s+period|project\s+period)/i;

// Product/capacity units. Ordered longest-first so MWh wins over MW.
const QTY_RE =
  /\b([\d][\d,]*\.?\d*)\s*(MWh|kWh|GWh|MVA|MWp|MW|GW|KLPD|TPA|MTPA|Kms|Km|MT|Tonnes|Tonne|Units|Nos|Sets|Coaches|Wagons|Rakes)\b/gi;

const DATE_DOTTED_RE = /\b(\d{1,2})[.\-/](\d{1,2})[.\-/](20\d{2})\b/g;

const DAYS_PER = { day: 1, week: 7, month: 30.44, year: 365.25 };

/**
 * Canonical spelling per unit. Filings are inconsistent about case and
 * plurals ("22Km" in the narrative, "41.04 km" in the annexure), and without
 * folding them the ledger ends up with "Km" and "km" as two separate buckets
 * that never add up.
 */
const UNIT_CANON = {
  mwh: 'MWh',
  kwh: 'kWh',
  gwh: 'GWh',
  mva: 'MVA',
  mwp: 'MWp',
  mw: 'MW',
  gw: 'GW',
  klpd: 'KLPD',
  tpa: 'TPA',
  mtpa: 'MTPA',
  km: 'Km',
  kms: 'Km',
  mt: 'MT',
  tonne: 'Tonnes',
  tonnes: 'Tonnes',
  unit: 'Units',
  units: 'Units',
  no: 'Nos',
  nos: 'Nos',
  set: 'Sets',
  sets: 'Sets',
  coach: 'Coaches',
  coaches: 'Coaches',
  wagon: 'Wagons',
  wagons: 'Wagons',
  rake: 'Rakes',
  rakes: 'Rakes',
};

/** Fold a raw unit token to its canonical spelling. */
function normalizeUnit(unit) {
  const key = String(unit || '').toLowerCase();
  return UNIT_CANON[key] || unit;
}

const NUM_WORDS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/**
 * Parse an Indian-numbering English amount phrase into rupees.
 *
 * The sub-accumulator matters: "Two Thousand Nine Hundred and Seventy Seven
 * Crores" is 2977 crore, not 2000 + (977 crore). `sub` builds the current
 * number and `chunk` holds thousand-scaled parts of it; both are only flushed
 * when a lakh/crore separator is hit.
 *
 * @param {string} phrase
 * @returns {number|null} rupees, or null if the phrase isn't a clean amount
 */
function wordsToRupees(phrase) {
  const tokens = String(phrase)
    .toLowerCase()
    .replace(/[,&]/g, ' ')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  let total = 0;
  let chunk = 0;
  let sub = 0;
  let matched = false;

  for (const t of tokens) {
    if (t === 'and' || t === 'rupees' || t === 'only') continue;
    // Paise are sub-rupee precision on an amount already counted in crores.
    // Whatever is still pending belongs to the paise clause ("...and Sixty
    // Four Paise"), so discard it rather than letting it land as rupees.
    if (t === 'paise' || t === 'paisa') {
      chunk = 0;
      sub = 0;
      break;
    }
    if (NUM_WORDS[t] !== undefined) {
      sub += NUM_WORDS[t];
      matched = true;
    } else if (t === 'hundred') {
      sub = (sub || 1) * 100;
      matched = true;
    } else if (t === 'thousand') {
      chunk += (sub || 1) * 1e3;
      sub = 0;
      matched = true;
    } else if (t === 'lakh' || t === 'lakhs' || t === 'lac' || t === 'lacs') {
      total += (chunk + sub || 1) * 1e5;
      chunk = 0;
      sub = 0;
      matched = true;
    } else if (t === 'crore' || t === 'crores') {
      total += (chunk + sub || 1) * 1e7;
      chunk = 0;
      sub = 0;
      matched = true;
    } else {
      return null; // an unknown word means this isn't a pure amount phrase
    }
  }
  if (!matched) return null;
  return total + chunk + sub;
}

// The SEBI size-band disclosure ("Small / Medium / Large / Major / Mega")
// carries the THRESHOLDS of each band, not the order's value. Both the grid
// and its footnote are full of rupee and dollar figures, so leaving them in
// makes a filing that discloses only its band look like it disclosed a
// number — e.g. a "Medium" order reading as exactly ₹250 Cr, the top of the
// ₹100–250 Cr band. Companies that never state a value (VA Tech Wabag is the
// clearest case) would otherwise produce a confident, entirely fictional
// figure on every single filing.
const BAND_GRID_RE = /Order\s+Classification\b.{0,600}Above\s+[\d,]+/gi;

// "*Note: A 'Large' international order means an order having a value of USD
// 30 to 75 million." The window ends at the band's own currency word. Word
// boundaries can't be relied on inside the quoted band name — the PDF text
// layer splits it ("A 'Me dium' order", "600 C rores") — so the trigger is
// the definitional verb instead.
const BAND_NOTE_RE =
  /\*?\s*Note\s*:.{0,200}?(?:shall\s+mean|means\s+an\s+order|mean\s+order\s+inflow).{0,200}?(?:C\s*rores?|Crores?|Millions?|Mn)\b/gi;

/**
 * Strip document furniture that looks numeric but never encodes an amount:
 * phone/fax numbers, CIN, PIN codes, GST rates, SEBI circular references,
 * bare years, and the SEBI order-size band table. Applied only to the money
 * pass — date extraction needs the years left intact.
 */
function scrubForMoney(text) {
  return String(text)
    .replace(/\+?\s*91[-\s]?\d{2,4}[-\s]?\d{6,8}/g, ' ')
    .replace(/CIN\s*[:.]?\s*\S+/gi, ' ')
    .replace(/(?:Tel|Telephone|Phone|Fax|Mobile)\s*[:.]?\s*[+\d\-\s,()]+/gi, ' ')
    .replace(/(?:HO|No)\.?\s*\d+\/\d+\/\d+[^\s]*/gi, ' ')
    .replace(/GST\s*@?\s*[\d.]+\s*%/gi, ' ')
    .replace(/\bRegulation\s+\d+\b/gi, ' ')
    .replace(BAND_GRID_RE, ' ')
    .replace(BAND_NOTE_RE, ' ')
    .replace(/\b(?:19|20)\d{2}\b/g, ' ')
    .replace(/\b\d{6}\b/g, ' ');
}

// SCALE_TO_CR is an INR ladder, so a foreign-currency amount run through it
// is not merely imprecise but wrong by orders of magnitude — "USD 150
// million" would land as ₹15 Cr instead of roughly ₹1,300 Cr. The optional
// currency prefix in SCALED_RE only spans a single character, so the token
// has to be recognised by looking back at the text before the match.
const FOREIGN_CCY_RE = /(?:USD|US\$|EUR|GBP|AED|SAR|KWD|JPY|CHF|\$|€|£)\s*$/i;

/** True if the amount at `index` is denominated in something other than rupees. */
function isForeignCurrency(text, index) {
  return FOREIGN_CCY_RE.test(text.slice(Math.max(0, index - 12), index));
}

// The grid the scrubber removes is itself the key to a whole class of filing.
// Some issuers (VA Tech Wabag being the clearest) never print an order value
// at all — they answer SEBI annexure row (g) with a size CLASS and publish
// this grid to define what each class means. Reading the class and the grid
// together recovers a defensible range where a point value does not exist.
const BAND_NAMES = ['Small', 'Medium', 'Large', 'Major', 'Mega'];
const BAND_RANGE_RE = /Upto\s+([\d,]+)|([\d,]+)\s*to\s*([\d,]+)|Above\s+([\d,]+)/gi;
// Row (g)'s answer sits immediately before row (h): "…Mega Order * h) Whether
// the promoter…". Anchoring on the next row's label is what distinguishes the
// issuer's own classification from the many times the word appears in prose.
const BAND_DECLARED_RE = /\b(Small|Medium|Large|Major|Mega)\b\s*(?:Order)?\s*\*?\s*h\s*\)/i;
const JURISDICTION_RE = /domestic\s*or\s*international\s+(Domestic|International)/i;

const num = (s) => parseFloat(String(s).replace(/,/g, ''));

/** Parse one row of the grid into [{low, high}] aligned with BAND_NAMES. */
function parseBandRow(segment) {
  const out = [];
  for (const m of segment.matchAll(BAND_RANGE_RE)) {
    if (m[1] !== undefined) out.push({ low: 0, high: num(m[1]) });
    else if (m[2] !== undefined) out.push({ low: num(m[2]), high: num(m[3]) });
    else out.push({ low: num(m[4]), high: null }); // "Above 1,000" — open-ended
  }
  return out;
}

/**
 * The SEBI size band this filing declares, resolved against the issuer's own
 * grid. Returns null unless BOTH the grid and a declared class are present —
 * a band name with no scale attached is not worth recording.
 *
 * Foreign-currency bands are reported in their native denomination and left
 * unconverted, for the same reason findMoney skips foreign amounts.
 *
 * @param {string} flat - whitespace-collapsed PDF text
 */
function findValueBand(flat) {
  const grid = flat.match(BAND_GRID_RE);
  const declared = BAND_DECLARED_RE.exec(flat);
  if (!grid || !declared) return null;

  const gridText = grid[0];
  const domIdx = gridText.search(/Domestic/i);
  const intlIdx = gridText.search(/International/i);
  if (domIdx < 0 || intlIdx < 0) return null;

  const domestic = parseBandRow(gridText.slice(domIdx, intlIdx));
  const international = parseBandRow(gridText.slice(intlIdx));
  if (domestic.length !== BAND_NAMES.length || international.length !== BAND_NAMES.length) {
    return null;
  }

  const band = BAND_NAMES.find((b) => b.toLowerCase() === declared[1].toLowerCase());
  const slot = BAND_NAMES.indexOf(band);
  const jm = JURISDICTION_RE.exec(flat);
  const isIntl = jm ? /international/i.test(jm[1]) : false;
  const range = isIntl ? international[slot] : domestic[slot];

  return {
    band,
    jurisdiction: isIntl ? 'international' : 'domestic',
    currency: isIntl ? 'USD' : 'INR',
    unit: isIntl ? 'mn' : 'cr',
    low: range.low,
    high: range.high,
    // Only a domestic band is expressible in crore; a USD band needs an FX
    // rate this module deliberately refuses to invent.
    lowCr: isIntl ? null : range.low,
    highCr: isIntl ? null : range.high,
    text: `${band} — ${isIntl ? 'USD' : 'INR'} ${range.low}${range.high === null ? '+' : ` to ${range.high}`} ${isIntl ? 'mn' : 'Cr'}`,
  };
}

/**
 * All rupee figures in the text, normalised to crore. Foreign-currency
 * amounts are skipped rather than converted: without an FX rate as of the
 * filing date any conversion would be invented, and a silently wrong number
 * is worse than a missing one (the caller falls back to LLM resolution).
 */
function findMoney(scrubbed) {
  const hits = [];
  for (const m of scrubbed.matchAll(SCALED_RE)) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    const scale = SCALE_TO_CR[m[2].toLowerCase().replace(/\.$/, '')];
    // Look back from the digits, not from the match start: SCALED_RE's
    // optional prefix swallows the trailing "D" of "USD" as a stray glyph.
    if (isForeignCurrency(scrubbed, m.index + m[0].indexOf(m[1]))) continue;
    if (Number.isFinite(n) && n > 0 && scale) {
      hits.push({ valueCr: Math.round(n * scale * 100) / 100, raw: m[0].trim() });
    }
  }
  for (const m of scrubbed.matchAll(ABSOLUTE_RE)) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (Number.isFinite(n) && n >= 1e6) {
      hits.push({ valueCr: Math.round((n / 1e7) * 100) / 100, raw: m[0].trim() });
    }
  }
  return hits;
}

/** Product/capacity quantities, deduped and summed per unit. */
function findQuantities(text) {
  const byUnit = new Map();
  for (const m of String(text).matchAll(QTY_RE)) {
    const value = parseFloat(m[1].replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) continue;
    const unit = normalizeUnit(m[2]);
    if (!byUnit.has(unit)) byUnit.set(unit, new Set());
    byUnit.get(unit).add(value);
  }
  // A filing usually repeats the same figure (e.g. "385Km" in both the
  // narrative and the annexure). Take the max per unit rather than the sum —
  // summing repeats would inflate, and where genuine components appear the
  // total is normally quoted alongside them.
  return [...byUnit.entries()].map(([unit, values]) => ({
    unit,
    value: Math.max(...values),
    observed: [...values].sort((a, b) => b - a),
  }));
}

/** Add whole months to an ISO date, clamping to the target month's last day. */
function addMonths(isoDate, months) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const whole = Math.round(months);
  const target = new Date(Date.UTC(y, m - 1 + whole, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Execution timeline. Filings almost always state a DURATION ("36 Months")
 * rather than explicit start/end dates, so the start is inferred from the
 * filing date and `basis` records exactly how the window was derived — a
 * consumer must be able to tell a stated end date from an inferred one.
 *
 * @param {string} text
 * @param {string} announcementDate - YYYY-MM-DD, the filing date
 */
function findTimeline(text, announcementDate) {
  const flat = String(text);
  const durations = [];
  for (const m of flat.matchAll(DURATION_RE)) {
    const n = parseInt(m[1].replace(/\s/g, ''), 10);
    const unit = m[2].toLowerCase().replace(/s$/, '');
    const months = Math.round(((DAYS_PER[unit] * n) / 30.44) * 10) / 10;
    // Guard against matching things like "30 days" notice periods or absurd
    // spans; real execution windows sit between a month and 15 years.
    if (months < 1 || months > 180) continue;
    const before = flat.slice(Math.max(0, m.index - 60), m.index);
    const after = flat.slice(m.index + m[0].length, m.index + m[0].length + 40);
    durations.push({
      raw: m[0].trim(),
      months,
      index: m.index,
      isOm: OM_BEFORE_RE.test(before) || OM_AFTER_RE.test(after),
      isExec: EXEC_CONTEXT_RE.test(before),
    });
  }
  if (!durations.length) return null;

  const candidates = durations.filter((d) => !d.isOm);
  if (!candidates.length) return null;

  // Prefer the annexure's own answer, then an execution-flavoured mention,
  // and only then fall back to the longest remaining span.
  const rowF = ROW_F_RE.exec(flat);
  const rowFEnd = rowF ? rowF.index + rowF[0].length : -1;
  const longest = (list) => list.reduce((a, b) => (b.months > a.months ? b : a));
  let chosen = null;
  let basis = 'longest-non-om';
  if (rowF) {
    const answering = candidates.filter((d) => d.index >= rowFEnd && d.index - rowFEnd <= 140);
    if (answering.length) {
      chosen = answering[0];
      basis = 'sebi-annexure-row-f';
    }
  }
  if (!chosen) {
    const exec = candidates.filter((d) => d.isExec);
    if (exec.length) {
      chosen = longest(exec);
      basis = 'execution-context';
    }
  }
  if (!chosen) chosen = longest(candidates);

  const startDate = announcementDate || null;
  return {
    durationMonths: chosen.months,
    startDate,
    endDate: startDate ? addMonths(startDate, chosen.months) : null,
    basis: startDate ? 'duration-from-filing-date' : 'duration-only',
    selection: basis,
    sourceText: chosen.raw,
    allDurations: durations.map((d) => d.raw),
    omDurations: durations.filter((d) => d.isOm).map((d) => d.raw),
  };
}

/**
 * Extract everything of interest from one order filing's text.
 *
 * @param {string} text - the PDF text layer
 * @param {Object} [opts]
 * @param {string} [opts.announcementDate] - YYYY-MM-DD, anchors the timeline
 * @returns {{valueCr: number|null, confidence: string, isAggregate: boolean,
 *   components: number[], quantities: Array, timeline: Object|null,
 *   wordFormCr: number|null, sourceText: string}}
 */
function extractFromPdfText(text, { announcementDate } = {}) {
  const flat = String(text || '').replace(/\s+/g, ' ');
  const scrubbed = scrubForMoney(flat);

  const money = findMoney(scrubbed);
  const distinct = [...new Set(money.map((m) => m.valueCr))].sort((a, b) => b - a);

  const wm = WORDFORM_RE.exec(flat);
  const wordRupees = wm ? wordsToRupees(wm[1]) : null;
  const wordFormCr =
    wordRupees && wordRupees > 0 ? Math.round((wordRupees / 1e7) * 100) / 100 : null;

  let valueCr = distinct.length ? distinct[0] : null;
  let confidence = valueCr !== null ? 'medium' : null;

  // Components summing to the largest figure ⇒ the largest IS the stated
  // total and the others are its breakdown (see note 2 in the file header).
  const components = distinct.slice(1);
  const isAggregate =
    components.length >= 2 && Math.abs(components.reduce((a, b) => a + b, 0) - distinct[0]) < 0.05;
  if (isAggregate) confidence = 'high';

  // The word form survives font mangling, so it outranks the numeric read.
  if (wordFormCr !== null) {
    if (valueCr === null) {
      valueCr = wordFormCr;
      confidence = 'high';
    } else {
      const agrees = Math.abs(valueCr - wordFormCr) / Math.max(valueCr, wordFormCr) < 0.02;
      if (agrees) confidence = 'high';
      else if (!isAggregate) {
        valueCr = wordFormCr;
        confidence = 'high';
      }
    }
  }

  // Only consulted when no figure was found. A filing that states both a
  // value and a class is fully answered by the value.
  const valueBand = valueCr === null ? findValueBand(flat) : null;
  if (valueBand) confidence = 'band-only';

  return {
    valueCr,
    confidence: confidence || 'none',
    isAggregate,
    components: isAggregate ? components : [],
    valueBand,
    quantities: findQuantities(flat),
    timeline: findTimeline(flat, announcementDate),
    wordFormCr,
    sourceText: wm ? wm[0].trim() : money.length ? money[0].raw : '',
  };
}

module.exports = {
  extractFromPdfText,
  wordsToRupees,
  findMoney,
  findQuantities,
  findTimeline,
  findValueBand,
  scrubForMoney,
  addMonths,
  normalizeUnit,
  SCALE_TO_CR,
  UNIT_CANON,
};
