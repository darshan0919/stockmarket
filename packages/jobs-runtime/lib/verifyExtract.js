'use strict';

/**
 * verifyExtract.js — L1 and L2 of the extraction verification design
 * (docs/PREPROCESSING_PIPELINE_PLAN.md §2).
 *
 * These two layers are what make a cheap agent's output admissible as evidence.
 * Both are pure scripts, so their cost does not grow with the model bill —
 * verification gets CHEAPER per document as scale rises, which is precisely what
 * makes extracting a thousand documents safe when reading forty was not.
 *
 * L1 — quote anchoring. Every extracted fact must carry a verbatim quote, and the
 * source document's text is already cached by `read-pdf-with-meta`. So a quote
 * that does not appear in the document is a fabrication, and it is caught by a
 * substring test rather than by a model's opinion. This is the single strongest
 * control in the pipeline and the reason the profiles insist on quotes at all.
 *
 * L2 — bound checks. Arithmetic and range facts a script can settle: a percentage
 * is 0-100, a date parses and is not in the future, segment revenues do not exceed
 * the total. L2 never rejects; it downgrades `confidence` to 'low', which consuming
 * skills must treat as a lead rather than a fact.
 *
 * Deliberately NOT a full validator. Per conventions §17 and the plan's routing
 * rule: if a script could fully verify an output, a script should have generated
 * it. These are cheap bound checks plus an anti-fabrication test — the substantive
 * read stays with the flagship model, on the few items that reach it.
 */

const docExtracts = require('./docExtracts');

/**
 * Normalise for comparison. PDF text extraction inserts line breaks, collapses or
 * expands runs of spaces, and swaps typographic punctuation, none of which are
 * meaningful differences — a quote that differs from the source only in whitespace
 * or in a curly-vs-straight apostrophe is the same quote, and failing it would
 * produce a rejection rate made entirely of noise, which would in turn make the
 * real signal (a rising rate = prompt regression) unreadable.
 */
function normalise(s) {
  return String(s || '')
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Every {text|quote} + page pair anywhere in the extract's `data`, with its path. */
function collectQuotes(node, out = [], trail = 'data') {
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectQuotes(v, out, `${trail}[${i}]`));
    return out;
  }
  if (node && typeof node === 'object') {
    const q = typeof node.quote === 'string' ? node.quote : null;
    const t = !q && typeof node.text === 'string' && 'page' in node ? node.text : null;
    const found = q || t;
    if (found && found.trim()) {
      out.push({ path: trail, quote: found, page: node.page ?? null });
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === 'quote' || k === 'text') continue;
      collectQuotes(v, out, `${trail}.${k}`);
    }
  }
  return out;
}

/**
 * L1. Returns `{status, checked, matched, unmatched[]}`.
 *
 * `status: 'skipped'` when the source text was never cached — L1 could not run,
 * which is NOT the same as L1 passing and must never be recorded as one. Such an
 * extract is stored but pinned to `confidence: 'low'`.
 *
 * `status: 'fail'` when ANY quote is absent from the source. One fabricated quote
 * discredits the extract, not just that field: an agent that invented one number's
 * evidence cannot be trusted on the numbers whose evidence happens to check out.
 */
function verifyL1(extract, { sourceUrl, text } = {}) {
  const meta =
    typeof text === 'string' ? null : docExtracts.sourceTextMeta(sourceUrl || extract.sourceUrl);
  const src = typeof text === 'string' ? text : meta && meta.text;
  const quotes = collectQuotes(extract.data);

  if (src == null) {
    return { status: 'skipped', reason: 'source text not cached', checked: quotes.length };
  }

  // A truncated source makes L1 unable to certify anything. Quoting an 8,000-char
  // excerpt accurately is not evidence about a 951,309-char document, and treating
  // it as a pass is how 40 near-empty extracts came back `confidence: high`
  // (2026-09-04). A HARD stop, not a downgrade: the extract was produced from a
  // document nobody actually read.
  if (meta && meta.truncated) {
    return {
      status: 'truncated_source',
      reason:
        `source text was truncated (${meta.originalChars || 'unknown'} chars original) — ` +
        're-read with `read-pdf-with-meta --full` before extracting',
      checked: quotes.length,
      originalChars: meta.originalChars ?? null,
    };
  }
  if (!quotes.length) {
    // A profile whose output carries no quotes at all is either a genuinely empty
    // document or a prompt that stopped asking for anchors. Both need a human look,
    // so this is not a silent pass.
    return { status: 'no_quotes', checked: 0, matched: 0, unmatched: [] };
  }

  const hay = normalise(src);
  const unmatched = [];
  let matched = 0;
  for (const q of quotes) {
    if (hay.includes(normalise(q.quote))) matched += 1;
    else unmatched.push({ path: q.path, page: q.page, quote: q.quote.slice(0, 160) });
  }
  return {
    status: unmatched.length ? 'fail' : 'pass',
    checked: quotes.length,
    matched,
    unmatched: unmatched.slice(0, 10),
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Walk every numeric/date leaf and apply range rules by field-name convention. */
function scanBounds(
  node,
  issues,
  trail = 'data',
  todayIso = new Date().toISOString().slice(0, 10)
) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanBounds(v, issues, `${trail}[${i}]`, todayIso));
    return;
  }
  if (!node || typeof node !== 'object') return;

  for (const [k, v] of Object.entries(node)) {
    const at = `${trail}.${k}`;
    if (v && typeof v === 'object') {
      scanBounds(v, issues, at, todayIso);
      continue;
    }
    if (/_pct$|^pct_|_percent$/i.test(k) && isNum(v) && (v < -100 || v > 100)) {
      issues.push({ at, rule: 'percent_out_of_range', value: v });
    }
    if (/_cr$|_inr_cr$|amount/i.test(k) && isNum(v) && v < 0) {
      issues.push({ at, rule: 'negative_amount', value: v });
    }
    if (/date$/i.test(k) && typeof v === 'string' && v.trim()) {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) issues.push({ at, rule: 'unparseable_date', value: v });
      // A filing cannot describe a past event dated in the future. Forward-looking
      // TARGET dates legitimately can be, so only `*effective_date`/`filing_date`
      // style fields are checked, never `target`/`guidance` ones.
      else if (/effective|filing|announcement|record/i.test(k) && v.slice(0, 10) > todayIso) {
        issues.push({ at, rule: 'future_dated_event', value: v });
      }
    }
    if (/page$/i.test(k) && isNum(v) && v < 1) {
      issues.push({ at, rule: 'page_below_one', value: v });
    }
  }
}

/**
 * L2. Never rejects — returns `{status: 'pass'|'warn', issues[]}`. A warn pins the
 * extract to `confidence: 'low'`.
 */
function verifyL2(extract) {
  const issues = [];
  scanBounds(extract.data, issues);

  // Cross-field arithmetic, where the profile provides enough to check it.
  const r = (extract.data && extract.data.reported) || null;
  if (r && isNum(r.revenue_cr) && isNum(r.ebitda_cr) && r.ebitda_cr > r.revenue_cr) {
    issues.push({ at: 'data.reported', rule: 'ebitda_exceeds_revenue' });
  }
  if (r && isNum(r.revenue_cr) && isNum(r.pat_cr) && r.pat_cr > r.revenue_cr) {
    issues.push({ at: 'data.reported', rule: 'pat_exceeds_revenue' });
  }
  const segs = (extract.data && extract.data.segments) || null;
  if (Array.isArray(segs) && r && isNum(r.revenue_cr)) {
    const sum = segs.reduce((a, s) => a + (isNum(s.revenue_cr) ? s.revenue_cr : 0), 0);
    // 2% tolerance for rounding and an "others" bucket the profile didn't capture.
    if (sum > r.revenue_cr * 1.02) {
      issues.push({ at: 'data.segments', rule: 'segments_exceed_total', value: sum });
    }
  }
  return { status: issues.length ? 'warn' : 'pass', issues: issues.slice(0, 20) };
}

/**
 * Run both layers and stamp the verdict onto the extract. Confidence is 'high'
 * only when L1 genuinely passed AND L2 raised nothing — a skipped L1 is not a pass.
 */
function verifyExtract(extract, opts = {}) {
  const l1 = verifyL1(extract, opts);
  const l2 = verifyL2(extract);
  const confidence = l1.status === 'pass' && l2.status === 'pass' ? 'high' : 'low';
  return { ...extract, verification: { l1, l2 }, confidence };
}

/**
 * Is this L1 verdict a rejection? `fail` (a fabricated quote) and
 * `truncated_source` (a document that was never fully read) both are — they are
 * different faults with the same consequence: the extract must not enter the
 * corpus.
 */
function isL1Rejection(l1) {
  return l1 && (l1.status === 'fail' || l1.status === 'truncated_source');
}

module.exports = { verifyExtract, verifyL1, verifyL2, isL1Rejection, collectQuotes, normalise };
