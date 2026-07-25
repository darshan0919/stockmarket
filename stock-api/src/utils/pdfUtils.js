'use strict';

/**
 * Shared PDF utilities for puppeteer-based HTML generation.
 * (Replaces legacy python/utils/pdf_utils.py reportlab formatting)
 *
 * Palette + component vocabulary is the flat "institutional briefing" design
 * system — see skills/_shared/pdf-design-guide.md for the full spec (colors,
 * typography, component classes: .chip, .hl, .kpi, .vmatrix, .sec-hd). Both
 * exports below resolve to the SAME flat palette so any generator, regardless
 * of which one it imports, renders consistently. Kept as two exports only for
 * backward-compat with existing `require` call sites — do not diverge them.
 */

const FLAT_PALETTE = {
  primary: '#111111',
  secondary: '#0c447c',
  tint: '#f5f4f0',
  good: '#27500a',
  warn: '#854f0b',
  bad: '#a32d2d',
  muted: '#666666',
  surface: '#f5f4f0',
  border: '#dddddd',
  alt_row: '#f5f4f0',
  text: '#1a1a1a',
};

const INSTITUTIONAL_DARK = FLAT_PALETTE;

const INSTITUTIONAL_LIGHT = FLAT_PALETTE;

/**
 * Parse a markdown pipe table -> { headers, rows }.
 */
function parseMarkdownTable(text) {
  const lines = text
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return { headers: null, rows: null };

  const headers = lines[0]
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean);
  const dataStart = /^[|\s\-:]+$/.test(lines[1]) ? 2 : 1;

  const rows = [];
  for (let i = dataStart; i < lines.length; i++) {
    const cells = lines[i]
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length) rows.push(cells);
  }
  return { headers, rows };
}

/**
 * Convert **bold**, *italic*, `code` inline markdown to HTML tags.
 */
function formatInlineMarkdown(text) {
  let html = text;
  html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  html = html.replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<i>$1</i>');
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  return html;
}

/**
 * Generate HTML string for a styled table.
 */
function styledTableHtml(data, palette, opts = {}) {
  const borderColor = opts.borderColor || palette.border || '#dddddd';
  const altBg = opts.altBg !== undefined ? opts.altBg : palette.alt_row || palette.tint;

  let html = `<table style="width: 100%; border-collapse: collapse; font-family: Helvetica, Arial, sans-serif; font-size: 9.8px;">`;

  data.forEach((row, rowIndex) => {
    const isHeader = rowIndex === 0;
    const bg = isHeader ? 'transparent' : rowIndex % 2 === 0 ? altBg : '#ffffff';
    const color = isHeader ? palette.muted || '#666666' : palette.text || '#1a1a1a';
    const fontWeight = isHeader ? '600' : 'normal';
    const borderStyle = isHeader
      ? `1.5px solid ${palette.primary || '#111111'}`
      : `0.5px solid ${borderColor}`;

    html += `<tr style="background-color: ${bg}; color: ${color}; font-weight: ${fontWeight};">`;
    row.forEach((cell) => {
      const tag = isHeader ? 'th' : 'td';
      const headerStyle = isHeader
        ? `font-family: monospace, Helvetica; font-size: 8px; text-transform: uppercase; letter-spacing: 0.04em; padding: 4px 6px; text-align: left; border-bottom: ${borderStyle};`
        : `padding: 4px 6px; text-align: left; vertical-align: top; border-bottom: ${borderStyle};`;
      html += `<${tag} style="${headerStyle}">${formatInlineMarkdown(cell)}</${tag}>`;
    });
    html += `</tr>`;
  });

  html += `</table>`;
  return html;
}

/** Chip / pill label — mirrors .chip-{g,r,y,b} from the shared design system. */
function chipHtml(text, tone = 'g') {
  const tones = {
    g: { bg: '#eaf3de', fg: '#27500a' },
    r: { bg: '#fcebeb', fg: '#791f1f' },
    y: { bg: '#faeeda', fg: '#633806' },
    b: { bg: '#e6f1fb', fg: '#0c447c' },
  };
  const c = tones[tone] || tones.g;
  return `<span style="display:inline-block; font-size:7.8px; font-family:monospace; padding:2px 6px; border-radius:3px; font-weight:600; background:${c.bg}; color:${c.fg};">${formatInlineMarkdown(text)}</span>`;
}

/** Callout box — mirrors .hl-{g,r,y,b} from the shared design system. */
function calloutHtml(html, tone = 'b') {
  const tones = {
    g: { bg: '#eaf3de', border: '#5bad3a', fg: '#1a3d0a' },
    r: { bg: '#fcebeb', border: '#e24b4a', fg: '#52100f' },
    y: { bg: '#faeeda', border: '#ef9f27', fg: '#412402' },
    b: { bg: '#e6f1fb', border: '#3a85c9', fg: '#0a2752' },
  };
  const c = tones[tone] || tones.b;
  return `<div style="background:${c.bg}; border-left:3px solid ${c.border}; color:${c.fg}; padding:7px 10px; border-radius:3px; margin:6px 0; font-size:10px; line-height:1.5;">${html}</div>`;
}

module.exports = {
  INSTITUTIONAL_DARK,
  INSTITUTIONAL_LIGHT,
  FLAT_PALETTE,
  parseMarkdownTable,
  formatInlineMarkdown,
  styledTableHtml,
  chipHtml,
  calloutHtml,
};
