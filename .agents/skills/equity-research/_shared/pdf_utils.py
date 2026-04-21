"""Shared PDF utilities for equity-research skills.

Consumed by `deepdive/scripts/generate_report.py` and
`growth-triggers-1pager/scripts/generate_pdf.py`. Palette-agnostic helpers
and two canonical palettes. Layout/styles remain per-script.
"""
import re

from reportlab.lib.colors import HexColor, white
from reportlab.platypus import Table, TableStyle


INSTITUTIONAL_DARK = {
    'primary':     HexColor('#1B2A4A'),
    'secondary':   HexColor('#2C4A7C'),
    'tint':        HexColor('#E8EEF6'),
    'good':        HexColor('#27AE60'),
    'warn':        HexColor('#F39C12'),
    'bad':         HexColor('#E74C3C'),
    'muted':       HexColor('#555555'),
    'surface':     HexColor('#F5F5F5'),
    'border':      HexColor('#CCCCCC'),
    'alt_row':     HexColor('#F0F4FA'),
}

INSTITUTIONAL_LIGHT = {
    'primary':     HexColor('#1a365d'),
    'secondary':   HexColor('#2b6cb0'),
    'tint':        HexColor('#ebf8ff'),
    'good':        HexColor('#276749'),
    'warn':        HexColor('#c05621'),
    'bad':         HexColor('#9b2c2c'),
    'muted':       HexColor('#4a5568'),
    'surface':     HexColor('#f7fafc'),
    'border':      HexColor('#e2e8f0'),
    'text':        HexColor('#1a202c'),
}


def parse_markdown_table(text):
    """Parse a markdown pipe table → (headers, rows). Returns (None, None) on failure."""
    lines = [l.strip() for l in text.strip().split('\n') if l.strip()]
    if len(lines) < 2:
        return None, None

    headers = [c.strip() for c in lines[0].split('|') if c.strip()]
    data_start = 2 if re.match(r'^[\|\s\-:]+$', lines[1]) else 1

    rows = []
    for line in lines[data_start:]:
        cells = [c.strip() for c in line.split('|') if c.strip()]
        if cells:
            rows.append(cells)
    return headers, rows


def format_inline_markdown(text):
    """Convert **bold**, *italic*, `code` inline markdown → ReportLab XML."""
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)', r'<i>\1</i>', text)
    text = re.sub(r'`(.*?)`', r'<b>\1</b>', text)
    return text


def styled_table(data, col_widths, palette, *, header_bg=None, alt_bg=None,
                 border_color=None, padding=3, font_size=8, repeat_header=True):
    """Build a ReportLab Table with header fill, grid borders, and alternating rows.

    `data` is a 2D list (first row = header). `palette` is one of the dicts above;
    optional overrides let callers tune colors without mutating the palette.
    """
    header_bg = header_bg or palette['primary']
    border_color = border_color or palette.get('border', HexColor('#CCCCCC'))
    alt_bg = alt_bg if alt_bg is not None else palette.get('alt_row', palette.get('tint'))

    table = Table(data, colWidths=col_widths, repeatRows=1 if repeat_header else 0)

    cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), header_bg),
        ('TEXTCOLOR',  (0, 0), (-1, 0), white),
        ('FONTNAME',   (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE',   (0, 0), (-1, -1), font_size),
        ('VALIGN',     (0, 0), (-1, -1), 'TOP'),
        ('GRID',       (0, 0), (-1, -1), 0.5, border_color),
        ('TOPPADDING', (0, 0), (-1, -1), padding),
        ('BOTTOMPADDING', (0, 0), (-1, -1), padding),
        ('LEFTPADDING',   (0, 0), (-1, -1), padding + 1),
        ('RIGHTPADDING',  (0, 0), (-1, -1), padding + 1),
    ]
    if alt_bg is not None:
        for i in range(2, len(data), 2):
            cmds.append(('BACKGROUND', (0, i), (-1, i), alt_bg))

    table.setStyle(TableStyle(cmds))
    return table
