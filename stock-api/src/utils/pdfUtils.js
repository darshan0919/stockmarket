'use strict';

/**
 * Shared PDF utilities for puppeteer-based HTML generation.
 * (Replaces legacy python/utils/pdf_utils.py reportlab formatting)
 */

const INSTITUTIONAL_DARK = {
    primary:     '#1B2A4A',
    secondary:   '#2C4A7C',
    tint:        '#E8EEF6',
    good:        '#27AE60',
    warn:        '#F39C12',
    bad:         '#E74C3C',
    muted:       '#555555',
    surface:     '#F5F5F5',
    border:      '#CCCCCC',
    alt_row:     '#F0F4FA',
};

const INSTITUTIONAL_LIGHT = {
    primary:     '#1a365d',
    secondary:   '#2b6cb0',
    tint:        '#ebf8ff',
    good:        '#276749',
    warn:        '#c05621',
    bad:         '#9b2c2c',
    muted:       '#4a5568',
    surface:     '#f7fafc',
    border:      '#e2e8f0',
    text:        '#1a202c',
};

/**
 * Parse a markdown pipe table -> { headers, rows }.
 */
function parseMarkdownTable(text) {
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return { headers: null, rows: null };

    const headers = lines[0].split('|').map(c => c.trim()).filter(Boolean);
    const dataStart = /^[|\s\-:]+$/.test(lines[1]) ? 2 : 1;

    const rows = [];
    for (let i = dataStart; i < lines.length; i++) {
        const cells = lines[i].split('|').map(c => c.trim()).filter(Boolean);
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
    const headerBg = opts.headerBg || palette.primary;
    const borderColor = opts.borderColor || palette.border || '#CCCCCC';
    const altBg = opts.altBg !== undefined ? opts.altBg : (palette.alt_row || palette.tint);
    
    let html = `<table style="width: 100%; border-collapse: collapse; border: 1px solid ${borderColor}; font-family: Helvetica, sans-serif; font-size: 10px;">`;
    
    data.forEach((row, rowIndex) => {
        const isHeader = rowIndex === 0;
        const bg = isHeader ? headerBg : (rowIndex % 2 === 0 ? altBg : '#ffffff');
        const color = isHeader ? '#ffffff' : (palette.text || '#000000');
        const fontWeight = isHeader ? 'bold' : 'normal';

        html += `<tr style="background-color: ${bg}; color: ${color}; font-weight: ${fontWeight};">`;
        row.forEach(cell => {
            const tag = isHeader ? 'th' : 'td';
            html += `<${tag} style="border: 1px solid ${borderColor}; padding: 4px 6px; text-align: left; vertical-align: top;">${formatInlineMarkdown(cell)}</${tag}>`;
        });
        html += `</tr>`;
    });
    
    html += `</table>`;
    return html;
}

module.exports = {
    INSTITUTIONAL_DARK,
    INSTITUTIONAL_LIGHT,
    parseMarkdownTable,
    formatInlineMarkdown,
    styledTableHtml
};
