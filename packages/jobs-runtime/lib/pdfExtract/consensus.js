'use strict';

/**
 * Two-read consensus for OCR'd result tables. Tesseract misreads digits differently under different settings
 * (resolution, clean-up, page-segmentation mode), so a value that two independent reads agree on is far more likely right
 * than one read's value, and the arithmetic identities (verify.js) then check the merged column as a whole.
 *
 *   mergeParses(parses)  per field, take the value most reads agree on; ties go to the earlier (better) read
 *   votesFor(...)        how many reads support the merged value of each field
 *
 * Serving rule used by the router: a merged column is served when its identities are 'verified', or when every headline
 * field it reports is backed by at least two reads. One read alone is never enough unless the identities pass.
 */

const HEADLINE = ['revenue', 'totalIncome', 'pbt', 'pat'];

const same = (a, b) => Math.abs(a - b) <= Math.max(1e-6, 1e-6 * Math.max(Math.abs(a), Math.abs(b)));

/** @param {Array<{cur:object, unit?:string, basis?:string}>} parses best read first */
function mergeParses(parses) {
  const reads = (parses || []).filter((p) => p && p.cur);
  const cur = {};
  const votes = {};
  const fields = new Set(reads.flatMap((p) => Object.keys(p.cur)));
  for (const f of fields) {
    const groups = [];
    reads.forEach((p, i) => {
      const v = p.cur[f];
      if (typeof v !== 'number' || !Number.isFinite(v)) return;
      const g = groups.find((x) => same(x.v, v));
      if (g) g.n += 1;
      else groups.push({ v, n: 1, first: i });
    });
    if (!groups.length) continue;
    groups.sort((a, b) => b.n - a.n || a.first - b.first);
    cur[f] = groups[0].v;
    votes[f] = groups[0].n;
  }
  const pick = (key) => {
    const count = new Map();
    for (const p of reads)
      if (p[key] && p[key] !== 'unknown') count.set(p[key], (count.get(p[key]) || 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  return {
    cur,
    votes,
    reads: reads.length,
    unit: pick('unit') || 'unknown',
    basis: pick('basis') || (reads[0] && reads[0].basis),
  };
}

/** True when every headline field present in the merged column is backed by >= 2 reads. */
function headlineAgreed(merged) {
  const present = HEADLINE.filter((f) => typeof merged.cur[f] === 'number');
  return present.length >= 2 && present.every((f) => (merged.votes[f] || 0) >= 2);
}

module.exports = { mergeParses, headlineAgreed, HEADLINE };
