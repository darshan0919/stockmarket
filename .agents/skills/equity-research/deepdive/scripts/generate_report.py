#!/usr/bin/env python3
"""
Equity Research Deep Dive — PDF Report Generator
Converts structured markdown report into a professional multi-page PDF.
Uses ReportLab with custom styling to match institutional research house aesthetics.
"""

import re
import os
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, black, white, grey
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable
)
from reportlab.platypus.doctemplate import PageTemplate, BaseDocTemplate, Frame
from reportlab.lib.fonts import addMapping
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


# ─── Color Palette ───────────────────────────────────────────────────────────
DARK_BLUE = HexColor('#1B2A4A')
MID_BLUE = HexColor('#2C4A7C')
LIGHT_BLUE = HexColor('#E8EEF6')
ACCENT_GREEN = HexColor('#27AE60')
ACCENT_RED = HexColor('#E74C3C')
ACCENT_ORANGE = HexColor('#F39C12')
GREY_TEXT = HexColor('#555555')
LIGHT_GREY = HexColor('#F5F5F5')
BORDER_GREY = HexColor('#CCCCCC')
TABLE_HEADER_BG = HexColor('#1B2A4A')
TABLE_ALT_ROW = HexColor('#F0F4FA')


def get_styles():
    """Create custom paragraph styles for the report."""
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        'ReportTitle',
        parent=styles['Title'],
        fontSize=22,
        textColor=DARK_BLUE,
        spaceAfter=4*mm,
        spaceBefore=0,
        alignment=TA_LEFT,
        leading=26,
    ))

    styles.add(ParagraphStyle(
        'SubTitle',
        parent=styles['Normal'],
        fontSize=11,
        textColor=GREY_TEXT,
        spaceAfter=8*mm,
        spaceBefore=0,
        alignment=TA_LEFT,
    ))

    styles.add(ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading1'],
        fontSize=14,
        textColor=DARK_BLUE,
        spaceBefore=10*mm,
        spaceAfter=4*mm,
        leading=18,
        borderWidth=0,
        borderColor=DARK_BLUE,
        borderPadding=0,
    ))

    styles.add(ParagraphStyle(
        'SubSectionHeader',
        parent=styles['Heading2'],
        fontSize=11,
        textColor=MID_BLUE,
        spaceBefore=6*mm,
        spaceAfter=3*mm,
        leading=14,
        fontName='Helvetica-Bold',
    ))

    # Override the default BodyText style
    styles['BodyText'].fontSize = 9
    styles['BodyText'].textColor = black
    styles['BodyText'].spaceAfter = 3*mm
    styles['BodyText'].spaceBefore = 0
    styles['BodyText'].alignment = TA_JUSTIFY
    styles['BodyText'].leading = 13

    styles.add(ParagraphStyle(
        'BulletText',
        parent=styles['Normal'],
        fontSize=9,
        textColor=black,
        spaceAfter=1.5*mm,
        spaceBefore=0,
        leftIndent=8*mm,
        bulletIndent=3*mm,
        leading=12,
    ))

    styles.add(ParagraphStyle(
        'SmallText',
        parent=styles['Normal'],
        fontSize=7.5,
        textColor=GREY_TEXT,
        spaceAfter=1*mm,
        leading=10,
    ))

    styles.add(ParagraphStyle(
        'VerdictBuy',
        parent=styles['Normal'],
        fontSize=14,
        textColor=ACCENT_GREEN,
        fontName='Helvetica-Bold',
        spaceBefore=4*mm,
        spaceAfter=2*mm,
    ))

    styles.add(ParagraphStyle(
        'VerdictHold',
        parent=styles['Normal'],
        fontSize=14,
        textColor=ACCENT_ORANGE,
        fontName='Helvetica-Bold',
        spaceBefore=4*mm,
        spaceAfter=2*mm,
    ))

    styles.add(ParagraphStyle(
        'VerdictAvoid',
        parent=styles['Normal'],
        fontSize=14,
        textColor=ACCENT_RED,
        fontName='Helvetica-Bold',
        spaceBefore=4*mm,
        spaceAfter=2*mm,
    ))

    styles.add(ParagraphStyle(
        'RedFlag',
        parent=styles['Normal'],
        fontSize=9,
        textColor=ACCENT_RED,
        spaceAfter=2*mm,
        leading=12,
        fontName='Helvetica-Bold',
    ))

    styles.add(ParagraphStyle(
        'Quote',
        parent=styles['Normal'],
        fontSize=9,
        textColor=GREY_TEXT,
        leftIndent=10*mm,
        rightIndent=10*mm,
        spaceAfter=3*mm,
        spaceBefore=2*mm,
        leading=12,
        fontName='Helvetica-Oblique',
    ))

    styles.add(ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontSize=8,
        leading=10,
        alignment=TA_LEFT,
    ))

    styles.add(ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontSize=8,
        leading=10,
        textColor=white,
        fontName='Helvetica-Bold',
        alignment=TA_LEFT,
    ))

    styles.add(ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=7,
        textColor=GREY_TEXT,
        alignment=TA_CENTER,
    ))

    return styles


def make_table(headers, rows, col_widths=None):
    """Create a styled table from headers and rows."""
    styles = get_styles()

    # Build table data with Paragraph objects for wrapping
    table_data = []

    # Header row
    header_row = [Paragraph(str(h), styles['TableHeader']) for h in headers]
    table_data.append(header_row)

    # Data rows
    for row in rows:
        data_row = [Paragraph(str(cell), styles['TableCell']) for cell in row]
        table_data.append(data_row)

    if not col_widths:
        available_width = A4[0] - 30*mm  # page width minus margins
        col_widths = [available_width / len(headers)] * len(headers)

    table = Table(table_data, colWidths=col_widths, repeatRows=1)

    # Style
    style_commands = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_BG),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_GREY),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]

    # Alternating row colors
    for i in range(1, len(table_data)):
        if i % 2 == 0:
            style_commands.append(('BACKGROUND', (0, i), (-1, i), TABLE_ALT_ROW))

    table.setStyle(TableStyle(style_commands))
    return table


def parse_markdown_table(text):
    """Parse a markdown table into headers and rows."""
    lines = [l.strip() for l in text.strip().split('\n') if l.strip()]
    if len(lines) < 2:
        return None, None

    # Parse header
    headers = [cell.strip() for cell in lines[0].split('|') if cell.strip()]

    # Skip separator line (---|----|---)
    data_start = 1
    if len(lines) > 1 and re.match(r'^[\|\s\-:]+$', lines[1]):
        data_start = 2

    rows = []
    for line in lines[data_start:]:
        cells = [cell.strip() for cell in line.split('|') if cell.strip()]
        if cells:
            rows.append(cells)

    return headers, rows


def markdown_to_flowables(markdown_text, styles):
    """Convert markdown text to ReportLab flowables."""
    flowables = []
    lines = markdown_text.split('\n')
    i = 0
    in_table = False
    table_lines = []

    while i < len(lines):
        line = lines[i].rstrip()

        # Blank line
        if not line.strip():
            if in_table and table_lines:
                # End of table
                headers, rows = parse_markdown_table('\n'.join(table_lines))
                if headers and rows:
                    flowables.append(Spacer(1, 2*mm))
                    flowables.append(make_table(headers, rows))
                    flowables.append(Spacer(1, 3*mm))
                table_lines = []
                in_table = False
            i += 1
            continue

        # Table detection
        if '|' in line and (line.startswith('|') or line.count('|') >= 2):
            in_table = True
            table_lines.append(line)
            i += 1
            continue

        if in_table:
            if '|' in line:
                table_lines.append(line)
                i += 1
                continue
            else:
                # End of table
                headers, rows = parse_markdown_table('\n'.join(table_lines))
                if headers and rows:
                    flowables.append(Spacer(1, 2*mm))
                    flowables.append(make_table(headers, rows))
                    flowables.append(Spacer(1, 3*mm))
                table_lines = []
                in_table = False

        # Section headers
        if line.startswith('# ') and not line.startswith('## '):
            # Main title — skip, handled separately
            i += 1
            continue

        if line.startswith('## '):
            text = line[3:].strip()
            text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
            flowables.append(Paragraph(text, styles['SectionHeader']))
            # Add a thin line under section headers
            flowables.append(HRFlowable(
                width="100%", thickness=0.5, color=DARK_BLUE,
                spaceBefore=0, spaceAfter=3*mm
            ))
            i += 1
            continue

        if line.startswith('### '):
            text = line[4:].strip()
            text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
            flowables.append(Paragraph(text, styles['SubSectionHeader']))
            i += 1
            continue

        # Horizontal rule
        if re.match(r'^---+$', line.strip()):
            flowables.append(HRFlowable(
                width="100%", thickness=0.5, color=BORDER_GREY,
                spaceBefore=3*mm, spaceAfter=3*mm
            ))
            i += 1
            continue

        # Bullet points
        if line.strip().startswith('- ') or line.strip().startswith('* '):
            text = line.strip()[2:]
            text = format_inline(text)
            flowables.append(Paragraph(
                f'• {text}', styles['BulletText']
            ))
            i += 1
            continue

        # Numbered lists
        num_match = re.match(r'^(\d+)\.\s+(.*)', line.strip())
        if num_match:
            num, text = num_match.groups()
            text = format_inline(text)
            flowables.append(Paragraph(
                f'{num}. {text}', styles['BulletText']
            ))
            i += 1
            continue

        # Blockquote
        if line.strip().startswith('>'):
            text = line.strip()[1:].strip()
            text = format_inline(text)
            flowables.append(Paragraph(text, styles['Quote']))
            i += 1
            continue

        # Red flag markers
        if '🚩' in line or 'RED FLAG' in line.upper():
            text = line.strip().replace('🚩', '').strip()
            text = format_inline(text)
            flowables.append(Paragraph(f'⚠ {text}', styles['RedFlag']))
            i += 1
            continue

        # Regular paragraph
        text = line.strip()
        if text:
            text = format_inline(text)
            flowables.append(Paragraph(text, styles['BodyText']))

        i += 1

    # Handle any remaining table
    if in_table and table_lines:
        headers, rows = parse_markdown_table('\n'.join(table_lines))
        if headers and rows:
            flowables.append(Spacer(1, 2*mm))
            flowables.append(make_table(headers, rows))
            flowables.append(Spacer(1, 3*mm))

    return flowables


def format_inline(text):
    """Convert markdown inline formatting to ReportLab XML."""
    # Bold
    text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
    # Italic
    text = re.sub(r'(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)', r'<i>\1</i>', text)
    # Inline code — just bold it
    text = re.sub(r'`(.*?)`', r'<b>\1</b>', text)
    # Clean up any XML-unsafe characters
    # (but preserve our tags)
    return text


def header_footer(canvas, doc, company_name, ticker):
    """Draw header and footer on each page."""
    canvas.saveState()
    width, height = A4

    # Header line
    canvas.setStrokeColor(DARK_BLUE)
    canvas.setLineWidth(1)
    canvas.line(15*mm, height - 12*mm, width - 15*mm, height - 12*mm)

    # Header text
    canvas.setFont('Helvetica', 7)
    canvas.setFillColor(GREY_TEXT)
    canvas.drawString(15*mm, height - 10*mm, f"{company_name} ({ticker}) — Equity Research Deep Dive")
    canvas.drawRightString(width - 15*mm, height - 10*mm, datetime.now().strftime('%B %Y'))

    # Footer
    canvas.setLineWidth(0.5)
    canvas.line(15*mm, 12*mm, width - 15*mm, 12*mm)
    canvas.setFont('Helvetica', 7)
    canvas.setFillColor(GREY_TEXT)
    canvas.drawString(15*mm, 7*mm, "For informational purposes only. Not investment advice.")
    canvas.drawRightString(width - 15*mm, 7*mm, f"Page {doc.page}")

    canvas.restoreState()


def create_research_report(company_name, ticker, report_markdown, output_path):
    """
    Create a professional equity research PDF from markdown content.

    Args:
        company_name: Full company name (e.g., "HDFC Bank Limited")
        ticker: Stock ticker (e.g., "NSE: HDFCBANK")
        report_markdown: The full report as markdown text
        output_path: Where to save the PDF
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    styles = get_styles()

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=15*mm,
        rightMargin=15*mm,
        topMargin=18*mm,
        bottomMargin=18*mm,
    )

    story = []

    # ─── Cover / Title Section ────────────────────────────────────────
    story.append(Spacer(1, 10*mm))
    story.append(Paragraph(company_name, styles['ReportTitle']))
    story.append(Paragraph(
        f"{ticker} | Equity Research Deep Dive | {datetime.now().strftime('%B %Y')}",
        styles['SubTitle']
    ))
    story.append(HRFlowable(
        width="100%", thickness=1.5, color=DARK_BLUE,
        spaceBefore=0, spaceAfter=6*mm
    ))

    # ─── Convert markdown body to flowables ───────────────────────────
    body_flowables = markdown_to_flowables(report_markdown, styles)
    story.extend(body_flowables)

    # ─── Disclaimer ───────────────────────────────────────────────────
    story.append(Spacer(1, 10*mm))
    story.append(HRFlowable(
        width="100%", thickness=0.5, color=BORDER_GREY,
        spaceBefore=3*mm, spaceAfter=3*mm
    ))
    story.append(Paragraph(
        "<b>Disclaimer:</b> This report is for informational and educational purposes only. "
        "It does not constitute investment advice. The author may have positions in securities "
        "discussed. Always conduct your own due diligence and consult a registered investment "
        "advisor before making investment decisions. Past performance is not indicative of "
        "future results.",
        styles['SmallText']
    ))
    story.append(Paragraph(
        f"Report generated on {datetime.now().strftime('%d %B %Y at %H:%M')} using AI-assisted research. "
        "Data sourced from public filings, screener.in, company presentations, and web research. "
        "All figures in INR unless stated otherwise.",
        styles['SmallText']
    ))

    # ─── Build PDF ────────────────────────────────────────────────────
    def on_page(canvas, doc):
        header_footer(canvas, doc, company_name, ticker)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"✅ Report saved to: {output_path}")
    return output_path


if __name__ == '__main__':
    # Test with sample content
    sample = """
## 1. Business Deep Dive

This is a test paragraph to verify the PDF generation works correctly.

| Metric | Value |
|--------|-------|
| Revenue | Rs 1,000 Cr |
| PAT | Rs 100 Cr |

## 2. Investment Verdict

**BUY** with a 12-month target of Rs 500.
"""
    create_research_report(
        "Test Company Ltd",
        "NSE: TEST",
        sample,
        "/tmp/test_report.pdf"
    )