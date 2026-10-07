'use strict';

/**
 * Side-by-side result tables. Many filings print STANDALONE and CONSOLIDATED columns on one page, e.g.
 *   Revenue from operations   171.24 193.69 188.25 735.35   393.99 412.71 391.09 1,549.89
 * The shared income-statement parser reads the first columns of a row, which are the left block, yet the page also says
 * "consolidated", so the left block used to be served as consolidated (verified arithmetic, wrong entity).
 *
 * splitSideBySide() cuts such a page into one text per block, each with its own basis, so every block is parsed on its own.
 * Rows whose number of value columns is not exactly 2k are left out of both halves (a missing field beats a mis-split one),
 * where k is the most common half-width among rows with at least 3 values per half.
 */

// a printed value: 12,345.67 | (12.5) | a lone dash (nil)
const NUM = /^(?:\(-?\d[\d,]*(?:\.\d+)?\)|-?\d[\d,]*(?:\.\d+)?|[-–—])$/;

/** Trailing run of numeric tokens on a line, with the label before it. */
function splitRow(line) {
  const toks = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(line)) !== null) toks.push({ t: m[0], at: m.index });
  let i = toks.length;
  while (i > 0 && NUM.test(toks[i - 1].t)) i -= 1;
  const values = toks.slice(i).map((x) => x.t);
  const label = i < toks.length ? line.slice(0, toks[i].at).trimEnd() : line.trimEnd();
  return { label, values };
}

function basisOrder(headerLines) {
  const head = headerLines.join('\n').toLowerCase();
  const s = head.search(/stand-?alone/);
  const c = head.search(/consolidated/);
  if (s < 0 || c < 0) return null;
  return s < c ? ['standalone', 'consolidated'] : ['consolidated', 'standalone'];
}

/** @returns {null | {order: string[], k: number, parts: Array<{basis: string, text: string}>}} */
function splitSideBySide(text) {
  const lines = String(text || '').split('\n');
  // the column headings sit in the first part of the table; find a window naming both bases
  let hi = -1;
  let order = null;
  for (let i = 0; i < Math.min(lines.length, 60) && !order; i += 1) {
    const o = basisOrder(lines.slice(i, i + 4));
    if (o && /quarter|year|half|ended/i.test(lines.slice(i, i + 8).join(' '))) {
      order = o;
      hi = i;
    }
  }
  if (!order) return null;
  const rows = lines.slice(hi + 1).map(splitRow);
  const widths = rows.map((r) => r.values.length).filter((n) => n >= 6 && n % 2 === 0);
  if (widths.length < 3) return null;
  const freq = new Map();
  for (const n of widths) freq.set(n / 2, (freq.get(n / 2) || 0) + 1);
  const k = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  const head = lines.slice(0, hi + 1).join('\n');
  const parts = order.map((basis, side) => {
    const body = rows
      .map((r) => {
        if (r.values.length === 2 * k) {
          const vs = r.values.slice(side * k, side * k + k);
          return `${r.label}   ${vs.join('   ')}`;
        }
        // rows without values (headings, wrapped labels) are kept; rows with a different count are dropped
        return r.values.length === 0 ? r.label : null;
      })
      .filter((x) => x !== null);
    return { basis, text: `${head}\n${body.join('\n')}` };
  });
  return { order, k, parts };
}

module.exports = { splitSideBySide, splitRow };
