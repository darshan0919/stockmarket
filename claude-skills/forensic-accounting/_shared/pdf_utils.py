"""Shared PDF utilities for equity-research skills.

Drop-in replacement / superset of the per-skill `_shared/pdf_utils.py` files in
`growth-triggers-1pager` and `equity-research-deepdive`. New skills (forensic,
concall, peer, drhp) should `import` from this module via:

    import sys
    sys.path.insert(0, '<skill_path>/_shared')
    from pdf_utils import (
        INSTITUTIONAL_LIGHT, INSTITUTIONAL_DARK,
        parse_markdown_table, format_inline_markdown, styled_table,
        flag_color, flag_label,
    )

Adds vs the original:
- `flag_color()` / `flag_label()` — uniform GREEN/YELLOW/RED rendering for
  forensic flags and conviction tags. Centralised so all skills look identical.
- `kpi_table()` — common KPI strip used by every skill's first page.
- `disclaimer_paragraph()` — boilerplate footer.
"""
import re

from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle


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


# --- Text helpers ------------------------------------------------------------

def parse_markdown_table(text):
    """Parse a markdown pipe table -> (headers, rows). Returns (None, None) on failure."""
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
    """Convert **bold**, *italic*, `code` inline markdown -> ReportLab XML."""
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    text = re.sub(r'(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)', r'<i>\1</i>', text)
    text = re.sub(r'`(.*?)`', r'<b>\1</b>', text)
    return text


# --- Table builders ----------------------------------------------------------

def styled_table(data, col_widths, palette, *, header_bg=None, alt_bg=None,
                 border_color=None, padding=3, font_size=8, repeat_header=True):
    """Build a ReportLab Table with header fill, grid borders, alternating rows."""
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


def kpi_table(headers, values, col_widths, palette, font_size=8):
    """The standard KPI strip used at the top of every research output.

    `headers` and `values` are flat lists of equal length (e.g., 8 items each).
    Renders as a 2-row table with the headers row in primary fill and values
    centered below.
    """
    if len(headers) != len(values):
        raise ValueError("headers and values must be the same length")
    data = [headers, values]
    table = Table(data, colWidths=col_widths)
    table.setStyle(TableStyle([
        ('BACKGROUND',  (0, 0), (-1, 0), palette['primary']),
        ('TEXTCOLOR',   (0, 0), (-1, 0), white),
        ('FONTNAME',    (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME',    (0, 1), (-1, 1), 'Helvetica-Bold'),
        ('FONTSIZE',    (0, 0), (-1, -1), font_size),
        ('ALIGN',       (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN',      (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID',        (0, 0), (-1, -1), 0.5, palette.get('border', HexColor('#CCCCCC'))),
        ('TOPPADDING',  (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    return table


# --- Flag rendering (uniform GREEN/YELLOW/RED across skills) -----------------

def flag_color(label, palette):
    """Map a flag label ('GREEN'/'YELLOW'/'RED'/'HIGH'/'MEDIUM'/'OPTIONALITY')
    to a palette colour. Case-insensitive."""
    if not label:
        return palette['muted']
    upper = label.upper().strip()
    good_set = {'GREEN', 'HIGH', 'HIGH CONVICTION', 'BEAT', '+1', 'BUY'}
    warn_set = {'YELLOW', 'AMBER', 'MEDIUM', 'MEDIUM CONVICTION', 'MIXED', '0', 'HOLD',
                'OPTIONALITY'}
    bad_set  = {'RED', 'LOW', 'LOW CONVICTION', 'MISSED', '-1', 'AVOID', 'SELL'}
    if upper in good_set:
        return palette['good']
    if upper in warn_set:
        return palette['warn']
    if upper in bad_set:
        return palette['bad']
    return palette['muted']


def flag_label(label):
    """Normalise a flag label to a canonical short form for table cells."""
    if not label:
        return ''
    upper = label.upper().strip()
    aliases = {
        'AMBER': 'YELLOW',
        'BEAT': '+1',
        'MISSED': '-1',
        'HIGH CONVICTION': 'HIGH',
        'MEDIUM CONVICTION': 'MED',
        'LOW CONVICTION': 'LOW',
    }
    return aliases.get(upper, upper)


# --- Boilerplate -------------------------------------------------------------

DISCLAIMER_TEXT = (
    "<i>This document is for informational purposes only and does not constitute investment "
    "advice. Author is not a SEBI-registered investment adviser. Numbers are best-effort "
    "extracts from primary documents (annual reports, concalls, BSE filings) and live web "
    "research as of the report date; cross-verify against the source before acting. "
    "Past performance does not indicate future results.</i>"
)

def disclaimer_paragraph(palette, font_size=6):
    style = ParagraphStyle(
        'Disclaimer',
        fontName='Helvetica',
        fontSize=font_size,
        textColor=palette.get('muted', HexColor('#666666')),
        leading=font_size + 1,
    )
    return Paragraph(DISCLAIMER_TEXT, style)
