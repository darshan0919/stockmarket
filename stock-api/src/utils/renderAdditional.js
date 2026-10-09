'use strict';

/**
 * @fileoverview Shared "smart renderer" for the DTO's `additional` field in JavaScript.
 * Mirrors skills/_shared/render_additional.py using the flat institutional design system.
 *
 * Handles runtime improvisation by shape-sniffing:
 *   - Scalar -> .hl.hl-b callout paragraph
 *   - Object with text/note/body -> .hl.hl-{tone} callout (optional citation)
 *   - Object of scalars -> compact 2-column key/value table
 *   - Object of objects/lists -> named subsections with .label subheadings
 *   - Object with type === 'scenario' -> comparison grid (.grid3/.grid4)
 *   - Object with type === 'ipo_subscription' or subscription shape -> 2-col category & scores layout
 *   - Array of scalars -> bullet list (<ul class="tight">)
 *   - Array of objects with >=60% key overlap -> <table> with headers
 *   - Array of objects with low overlap -> card grid (.grid3 of .kpi cards)
 */

const { formatInlineMarkdown } = require('./pdfUtils');

const TONE_MAP = {
  g: 'g',
  y: 'y',
  r: 'r',
  b: 'b',
  green: 'g',
  yellow: 'y',
  amber: 'y',
  red: 'r',
  blue: 'b',
};

/**
 * Escape or format a scalar value safely.
 * @param {*} v
 * @returns {string}
 */
function esc(v) {
  if (v === null || v === undefined) return '—';
  return formatInlineMarkdown(String(v));
}

/**
 * Checks whether a value is scalar.
 * @param {*} v
 * @returns {boolean}
 */
function isScalar(v) {
  return (
    v === null ||
    v === undefined ||
    typeof v === 'string' ||
    typeof v === 'number' ||
    typeof v === 'boolean'
  );
}

/**
 * Extracts tone string ('g' | 'y' | 'r' | 'b').
 * @param {Object} d
 * @returns {string}
 */
function getTone(d) {
  const tone = String(d.tone || 'b').toLowerCase();
  return TONE_MAP[tone] || 'b';
}

/**
 * Renders callout block (.hl).
 * @param {Object} d
 * @returns {string}
 */
function renderCallout(d) {
  const text = d.text || d.note || d.body || '';
  const tone = getTone(d);
  const cite = d.citation ? ` <span class="subnum">[${esc(d.citation)}]</span>` : '';
  return `<div class="hl hl-${tone}">${esc(text)}${cite}</div>`;
}

/**
 * Human-readable label from snake_case or camelCase.
 * @param {string} k
 * @returns {string}
 */
function formatLabel(k) {
  return String(k || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Renders key-value table.
 * @param {Object} d
 * @returns {string}
 */
function renderKvTable(d) {
  const rows = Object.entries(d)
    .filter(([k]) => k !== 'type')
    .map(([k, v]) => {
      const label = formatLabel(k);
      return `<tr><td>${esc(label)}</td><td class="r mono">${esc(v)}</td></tr>`;
    })
    .join('');
  return `<table><tr><th>Field</th><th class="r">Value</th></tr>${rows}</table>`;
}

const SUB_X_LABELS = [
  ['qib_x', 'QIB'],
  ['nii_x', 'Non-Institutional Buyers'],
  ['b_hni_x', '&nbsp;&nbsp;- bNII (bids above &#8377;10L)'],
  ['s_hni_x', '&nbsp;&nbsp;- sNII (bids below &#8377;10L)'],
  ['rii_x', 'Retail Individual Investors (RIIs)'],
  ['total_x', 'Total'],
];

/**
 * Formats multiple subscription x.
 * @param {*} v
 * @returns {string}
 */
function fmtX(v) {
  if (v === null || v === undefined) return '—';
  const num = parseFloat(v);
  if (!Number.isNaN(num)) return `${num.toFixed(2)}x`;
  return esc(v);
}

/**
 * Dedicated layout for ipo_subscription shape.
 * @param {Object} d
 * @returns {string}
 */
function renderSubscription(d) {
  let rows = '';
  if (d.anchor_participated !== undefined && d.anchor_participated !== null) {
    const anchorVal = d.anchor_participated ? 'Participated' : 'Did not participate';
    rows += `<tr><td>Anchor Investors</td><td class="r mono">${esc(anchorVal)}</td></tr>`;
  }
  for (const [key, label] of SUB_X_LABELS) {
    if (!(key in d)) continue;
    const isTotal = key === 'total_x';
    const cell = isTotal
      ? `<td class="r mono"><strong>${fmtX(d[key])}</strong></td>`
      : `<td class="r mono">${fmtX(d[key])}</td>`;
    const labelCell = isTotal ? `<td><strong>${label}</strong></td>` : `<td>${label}</td>`;
    rows += `<tr>${labelCell}${cell}</tr>`;
  }
  const left = `<table><tr><th>Category</th><th class="r">Subscription</th></tr>${rows}</table>`;

  const rightParts = [];
  if (d.insight) {
    rightParts.push(`<div class="hl hl-b" style="margin:0 0 6px 0;">${esc(d.insight)}</div>`);
  }
  if (d.listing_score !== undefined && d.listing_score !== null) {
    const tier = d.listing_tier ? ` &middot; ${esc(d.listing_tier)}` : '';
    rightParts.push(
      `<div class="kpi" style="margin-bottom:6px;"><div class="label">Listing Score</div>` +
        `<div class="subnum" style="font-size:11px; color:#1a1a1a;">${esc(d.listing_score)}${tier}</div></div>`
    );
  }
  if (d.cagr_score !== undefined && d.cagr_score !== null) {
    const tier = d.cagr_tier ? ` &middot; ${esc(d.cagr_tier)}` : '';
    const conf = d.cagr_confidence ? ` (${esc(d.cagr_confidence)} confidence)` : '';
    rightParts.push(
      `<div class="kpi" style="margin-bottom:6px;"><div class="label">Cagr Score</div>` +
        `<div class="subnum" style="font-size:11px; color:#1a1a1a;">${esc(d.cagr_score)}${tier}${conf}</div></div>`
    );
  }
  if (d.source) {
    const asOf = d.as_of ? `, as of ${esc(d.as_of)}` : '';
    rightParts.push(
      `<div class="kpi" style="margin-bottom:0;"><div class="label">Source</div>` +
        `<div class="subnum" style="font-size:10px; color:#1a1a1a;">${esc(d.source)}${asOf}</div></div>`
    );
  }
  const right = rightParts.join('');

  return (
    '<table style="border:none; margin:0;"><tr>' +
    `<td style="width:50%; vertical-align:top; padding:0 8px 0 0; border:none;">${left}</td>` +
    `<td style="width:50%; vertical-align:top; padding:0 0 0 8px; border:none;">${right}</td>` +
    '</tr></table>'
  );
}

/**
 * Equal-width comparison grid.
 * @param {Object} d
 * @returns {string}
 */
function renderScenario(d) {
  const keys = Object.keys(d).filter((k) => k !== 'type');
  const cols = keys
    .map((k) => {
      const label = formatLabel(k);
      return (
        `<div class="kpi"><div class="label">${esc(label)}</div>` +
        `<div class="subnum" style="font-size:9.6px; font-family:inherit; color:#1a1a1a; margin-top:4px;">${esc(d[k])}</div></div>`
      );
    })
    .join('');
  const gridCls = keys.length === 3 ? 'grid3' : keys.length === 4 ? 'grid4' : 'grid3';
  return `<div class="${gridCls}">${cols}</div>`;
}

/**
 * Computes key overlap ratio across an array of objects.
 * @param {Array<Object>} dicts
 * @returns {number}
 */
function keyOverlapRatio(dicts) {
  if (!dicts || !dicts.length) return 0.0;
  const keySets = dicts
    .filter((d) => d && typeof d === 'object' && !Array.isArray(d))
    .map((d) => new Set(Object.keys(d)));
  if (!keySets.length) return 0.0;

  const union = new Set();
  keySets.forEach((ks) => ks.forEach((k) => union.add(k)));
  if (union.size === 0) return 0.0;

  const interScores = keySets.map((ks) => ks.size / union.size);
  return interScores.reduce((a, b) => a + b, 0) / interScores.length;
}

/**
 * Renders a single cell safely.
 * @param {*} v
 * @returns {string}
 */
function renderCell(v) {
  if (isScalar(v)) return esc(v);
  return renderValue(v);
}

/**
 * Renders list of objects sharing a common key-set as a table.
 * @param {Array<Object>} items
 * @returns {string}
 */
function renderListTable(items) {
  const cols = [];
  items.forEach((it) => {
    if (it && typeof it === 'object') {
      Object.keys(it).forEach((k) => {
        if (!cols.includes(k)) cols.push(k);
      });
    }
  });

  const header = cols
    .map((c) => {
      const label = formatLabel(c);
      return `<th>${esc(label)}</th>`;
    })
    .join('');

  const rows = items
    .map((it) => {
      const cells = cols.map((c) => `<td>${renderCell(it ? it[c] : null)}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<table><tr>${header}</tr>${rows}</table>`;
}

/**
 * Renders bullet list.
 * @param {Array} items
 * @returns {string}
 */
function renderBullets(items) {
  const lis = items.map((it) => `<li>${esc(it)}</li>`).join('');
  return `<ul class="tight">${lis}</ul>`;
}

/**
 * Renders card grid.
 * @param {Array} items
 * @returns {string}
 */
function renderCardGrid(items) {
  const cards = items.map((it) => `<div class="kpi">${renderValue(it)}</div>`).join('');
  return `<div class="grid3">${cards}</div>`;
}

/**
 * Recursively renders any JSON-shaped value to an HTML fragment.
 * @param {*} value
 * @param {string} [keyLabel]
 * @returns {string}
 */
function renderValue(value, _keyLabel = null) {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value) && value.length === 0) return '';
  if (typeof value === 'object' && Object.keys(value).length === 0) return '';

  if (isScalar(value)) {
    return `<div class="hl hl-b">${esc(value)}</div>`;
  }

  if (Array.isArray(value)) {
    if (value.every(isScalar)) {
      return renderBullets(value);
    }
    if (value.every((it) => it && typeof it === 'object' && !Array.isArray(it))) {
      if (keyOverlapRatio(value) >= 0.6) {
        return renderListTable(value);
      }
      return renderCardGrid(value);
    }
    return renderBullets(value.map((v) => (isScalar(v) ? v : JSON.stringify(v))));
  }

  if (typeof value === 'object') {
    const forced = String(value.type || '').toLowerCase();
    if (
      forced === 'ipo_subscription' ||
      (!forced && 'qib_x' in value && 'total_x' in value && 'rii_x' in value)
    ) {
      return renderSubscription(value);
    }
    if (forced === 'scenario') {
      return renderScenario(value);
    }
    if (forced === 'callout') {
      return renderCallout(value);
    }
    if (forced === 'table') {
      return renderKvTable(value);
    }
    if (forced === 'bullets' && Array.isArray(value.items)) {
      return renderBullets(value.items);
    }

    if (value.text || value.note || value.body) {
      return renderCallout(value);
    }

    const nonTypeEntries = Object.entries(value).filter(([k]) => k !== 'type');
    const vals = nonTypeEntries.map(([, v]) => v);

    if (vals.length > 0 && vals.every(isScalar)) {
      if (
        vals.length >= 2 &&
        vals.length <= 4 &&
        vals.every((v) => typeof v === 'string' && v.length > 25)
      ) {
        return renderScenario(value);
      }
      return renderKvTable(value);
    }

    // Object of objects/lists -> named subsections
    const parts = [];
    for (const [k, v] of nonTypeEntries) {
      const sub = renderValue(v, k);
      if (!sub) continue;
      const label = formatLabel(k);
      parts.push(
        `<div style="margin-top:8px;"><div class="label" style="margin-bottom:4px;">${esc(label)}</div>${sub}</div>`
      );
    }
    return parts.join('');
  }

  return `<div class="hl hl-b">${esc(value)}</div>`;
}

/**
 * Top-level entry point for rendering additional insights.
 * @param {*} additional
 * @param {string} [sectionNumber="08"]
 * @param {string} [title="Additional insights"]
 * @returns {string} HTML section block or empty string
 */
function renderAdditionalHtml(
  additional,
  sectionNumber = '08',
  title = 'Additional Nuance & Improvisation'
) {
  if (!additional) return '';
  const body = renderValue(additional);
  if (!body || !body.trim()) return '';

  return (
    `<div class="sec" style="margin-top: 14px;">` +
    `<div class="sec-hd">${sectionNumber}&nbsp;&nbsp;${esc(title)}</div>` +
    `${body}` +
    `</div>`
  );
}

module.exports = {
  renderValue,
  renderAdditionalHtml,
};
