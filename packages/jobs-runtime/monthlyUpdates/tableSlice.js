'use strict';
/**
 * Deterministic pre-parse for monthly-update filings (conventions §17:
 * Extraction, not Analysis — no judgment lives here).
 *
 * These filings are ~85% boilerplate: exchange addresses, scrip codes,
 * "Dear Sir/Madam", digital-signature blocks, CIN/website footers. The actual
 * sales table is a small dense island of digits inside that. Sending the whole
 * document to a model wastes tokens on letterhead; sending a numeric slice
 * keeps the judgment call (which row is the headline metric, what unit is it
 * in) while cutting the payload by roughly an order of magnitude.
 *
 * This module does NOT decide what the numbers mean — it only finds where they
 * are. Interpretation is the model's job.
 */

// Lines matching these are structural noise that never carries a sales figure.
// Ordered roughly by frequency in the observed corpus.
const NOISE_PATTERNS = [
  /digitally signed by/i,
  /^\s*DN:\s*c=/i,
  /2\.5\.4\.20=/i,
  /serialNumber=/i,
  /postalCode=/i,
  /^\s*Date:\s*20\d\d\.\d\d\.\d\d\s+\d\d:\d\d:\d\d/i,
  /Phiroze Jeejeebhoy/i,
  /Dalal Street/i,
  /Bandra\s*[-–(]/i,
  /Exchange Plaza/i,
  /^\s*(Dear\s+Sir|Thanking you|Yours (truly|faithfully|sincerely)|Encl)/i,
  /Company Secretary|Compliance Officer|Managing Director|DIN:\s*\d/i,
  /CIN:\s*[A-Z]\d{5}/i,
  /\b(?:www\.|Website:|E-?mail:|Tel\s*\+?9?1?|Fax)/i,
  /Regd\.?\s*Office|Registered Office|Corporate Office/i,
  /Scrip\s*code/i,
  /take (?:this|the same) on (?:record|your records)/i,
];

const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s.'-]*\d{2,4}\b/i;

function isNoise(line) {
  return NOISE_PATTERNS.some((re) => re.test(line));
}

/** Digits in a line, ignoring those inside long alphanumeric hashes. */
function digitScore(line) {
  const cleaned = line.replace(/[A-Za-z0-9]{20,}/g, ' ');
  const nums = cleaned.match(/\d[\d,.]*/g) || [];
  // A "figure" is a standalone number, not a year or a clause number.
  const figures = nums.filter((n) => {
    const bare = n.replace(/[,.]/g, '');
    return bare.length >= 2;
  });
  return figures.length;
}

/**
 * Slice the numeric region(s) out of a filing's text.
 *
 * @param {string} text
 * @param {Object} [opts]
 * @param {number} [opts.maxChars=6000] hard cap on the returned slice
 * @param {number} [opts.context=1] non-numeric lines kept around a numeric run
 *   (table headers like "Particulars / Aug-26 / Aug-25 / % Change" carry the
 *   period labels the numbers are meaningless without)
 * @returns {{slice:string, lines:number, kept:number, density:number}}
 */
function sliceNumericRegion(text, { maxChars = 6000, context = 1 } = {}) {
  const raw = String(text || '').split(/\r?\n/);
  const lines = raw.map((l) => l.replace(/\s+$/, ''));

  const interesting = lines.map((l) => {
    if (!l.trim()) return false;
    if (isNoise(l)) return false;
    const score = digitScore(l);
    // A line is interesting if it carries several figures, or is a period
    // header (month-year labels) that a neighbouring numeric row depends on.
    return score >= 2 || (score >= 1 && MONTH_RE.test(l)) || (MONTH_RE.test(l) && /\|/.test(l));
  });

  // Expand around each interesting line to retain table headers/labels.
  const keep = new Array(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (!interesting[i]) continue;
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) {
      if (lines[j].trim() && !isNoise(lines[j])) keep[j] = true;
    }
  }

  const out = [];
  let lastKept = -2;
  for (let i = 0; i < lines.length; i++) {
    if (!keep[i]) continue;
    if (lastKept >= 0 && i - lastKept > 1) out.push('...');
    out.push(lines[i].trim().replace(/\s{3,}/g, '  |  '));
    lastKept = i;
  }

  let slice = out.join('\n');
  if (slice.length > maxChars) slice = `${slice.slice(0, maxChars)}\n...[truncated]`;

  return {
    slice,
    lines: lines.length,
    kept: out.length,
    density: lines.length ? out.length / lines.length : 0,
  };
}

module.exports = { sliceNumericRegion, isNoise, digitScore };
