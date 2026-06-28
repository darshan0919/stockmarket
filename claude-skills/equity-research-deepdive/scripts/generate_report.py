#!/usr/bin/env python3
"""Equity Research Deep Dive — PDF Report Generator.

Converts structured markdown into a multi-page institutional PDF.
Palette, table styling, and markdown parsers live in `_shared/pdf_utils.py`.
"""
import os
import re
import sys
from datetime import datetime
from pathlib import Path

from reportlab.lib.colors import black, white
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    HRFlowable, Paragraph, SimpleDocTemplate, Spacer,
)

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_shared"))
from pdf_utils import (  # noqa: E402
    INSTITUTIONAL_DARK as P,
    format_inline_markdown,
    parse_markdown_table,
    styled_table,
)


def get_styles():
    """ParagraphStyle set for the deepdive report."""
    s = getSampleStyleSheet()

    s.add(ParagraphStyle('ReportTitle', parent=s['Title'], fontSize=22, textColor=P['primary'],
                         spaceAfter=4*mm, alignment=TA_LEFT, leading=26))
    s.add(ParagraphStyle('SubTitle', parent=s['Normal'], fontSize=11, textColor=P['muted'],
                         spaceAfter=8*mm, alignment=TA_LEFT))
    s.add(ParagraphStyle('SectionHeader', parent=s['Heading1'], fontSize=14, textColor=P['primary'],
                         spaceBefore=10*mm, spaceAfter=4*mm, leading=18))
    s.add(ParagraphStyle('SubSectionHeader', parent=s['Heading2'], fontSize=11, textColor=P['secondary'],
                         spaceBefore=6*mm, spaceAfter=3*mm, leading=14, fontName='Helvetica-Bold'))

    s['BodyText'].fontSize = 9
    s['BodyText'].textColor = black
    s['BodyText'].spaceAfter = 3*mm
    s['BodyText'].alignment = TA_JUSTIFY
    s['BodyText'].leading = 13

    s.add(ParagraphStyle('BulletText', parent=s['Normal'], fontSize=9, textColor=black,
                         spaceAfter=1.5*mm, leftIndent=8*mm, bulletIndent=3*mm, leading=12))
    s.add(ParagraphStyle('SmallText', parent=s['Normal'], fontSize=7.5, textColor=P['muted'],
                         spaceAfter=1*mm, leading=10))
    s.add(ParagraphStyle('RedFlag', parent=s['Normal'], fontSize=9, textColor=P['bad'],
                         spaceAfter=2*mm, leading=12, fontName='Helvetica-Bold'))
    s.add(ParagraphStyle('Quote', parent=s['Normal'], fontSize=9, textColor=P['muted'],
                         leftIndent=10*mm, rightIndent=10*mm, spaceAfter=3*mm, spaceBefore=2*mm,
                         leading=12, fontName='Helvetica-Oblique'))
    s.add(ParagraphStyle('TableCell', parent=s['Normal'], fontSize=8, leading=10, alignment=TA_LEFT))
    s.add(ParagraphStyle('TableHeader', parent=s['Normal'], fontSize=8, leading=10, textColor=white,
                         fontName='Helvetica-Bold', alignment=TA_LEFT))

    for verdict, color in [('Buy', P['good']), ('Hold', P['warn']), ('Avoid', P['bad'])]:
        s.add(ParagraphStyle(f'Verdict{verdict}', parent=s['Normal'], fontSize=14, textColor=color,
                             fontName='Helvetica-Bold', spaceBefore=4*mm, spaceAfter=2*mm))
    return s


def _render_table(md_table, styles, flowables):
    headers, rows = parse_markdown_table(md_table)
    if not (headers and rows):
        return
    data = [[Paragraph(str(h), styles['TableHeader']) for h in headers]] + \
           [[Paragraph(str(c), styles['TableCell']) for c in r] for r in rows]
    col_width = (A4[0] - 30*mm) / len(headers)
    flowables += [Spacer(1, 2*mm),
                  styled_table(data, [col_width]*len(headers), P),
                  Spacer(1, 3*mm)]


def markdown_to_flowables(md, styles):
    """Convert markdown text to ReportLab flowables."""
    flowables = []
    lines = md.split('\n')
    i, in_table, tbuf = 0, False, []

    def flush_table():
        if tbuf:
            _render_table('\n'.join(tbuf), styles, flowables)
            tbuf.clear()

    while i < len(lines):
        line = lines[i].rstrip()

        if not line.strip():
            if in_table:
                flush_table()
                in_table = False
            i += 1
            continue

        if '|' in line and (line.startswith('|') or line.count('|') >= 2):
            in_table = True
            tbuf.append(line)
            i += 1
            continue

        if in_table:
            if '|' in line:
                tbuf.append(line)
                i += 1
                continue
            flush_table()
            in_table = False

        if line.startswith('# ') and not line.startswith('## '):
            i += 1
            continue

        if line.startswith('## '):
            text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', line[3:].strip())
            flowables.append(Paragraph(text, styles['SectionHeader']))
            flowables.append(HRFlowable(width="100%", thickness=0.5, color=P['primary'], spaceAfter=3*mm))
            i += 1
            continue

        if line.startswith('### '):
            text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', line[4:].strip())
            flowables.append(Paragraph(text, styles['SubSectionHeader']))
            i += 1
            continue

        if re.match(r'^---+$', line.strip()):
            flowables.append(HRFlowable(width="100%", thickness=0.5, color=P['border'],
                                        spaceBefore=3*mm, spaceAfter=3*mm))
            i += 1
            continue

        stripped = line.strip()
        if stripped.startswith(('- ', '* ')):
            flowables.append(Paragraph(f'• {format_inline_markdown(stripped[2:])}', styles['BulletText']))
            i += 1
            continue

        num_match = re.match(r'^(\d+)\.\s+(.*)', stripped)
        if num_match:
            num, text = num_match.groups()
            flowables.append(Paragraph(f'{num}. {format_inline_markdown(text)}', styles['BulletText']))
            i += 1
            continue

        if stripped.startswith('>'):
            flowables.append(Paragraph(format_inline_markdown(stripped[1:].strip()), styles['Quote']))
            i += 1
            continue

        if '🚩' in line or 'RED FLAG' in line.upper():
            text = stripped.replace('🚩', '').strip()
            flowables.append(Paragraph(f'⚠ {format_inline_markdown(text)}', styles['RedFlag']))
            i += 1
            continue

        if stripped:
            flowables.append(Paragraph(format_inline_markdown(stripped), styles['BodyText']))
        i += 1

    if in_table:
        flush_table()
    return flowables


def header_footer(canvas, doc, company_name, ticker):
    """Header line + footer line drawn on every page."""
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(P['primary'])
    canvas.setLineWidth(1)
    canvas.line(15*mm, height - 12*mm, width - 15*mm, height - 12*mm)

    canvas.setFont('Helvetica', 7)
    canvas.setFillColor(P['muted'])
    canvas.drawString(15*mm, height - 10*mm,
                      f"{company_name} ({ticker}) — Equity Research Deep Dive")
    canvas.drawRightString(width - 15*mm, height - 10*mm, datetime.now().strftime('%B %Y'))

    canvas.setLineWidth(0.5)
    canvas.line(15*mm, 12*mm, width - 15*mm, 12*mm)
    canvas.setFont('Helvetica', 7)
    canvas.setFillColor(P['muted'])
    canvas.drawString(15*mm, 7*mm, "For informational purposes only. Not investment advice.")
    canvas.drawRightString(width - 15*mm, 7*mm, f"Page {doc.page}")
    canvas.restoreState()


def create_research_report(company_name, ticker, report_markdown, output_path):
    """Build the multi-page institutional PDF."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    styles = get_styles()

    doc = SimpleDocTemplate(output_path, pagesize=A4,
                            leftMargin=15*mm, rightMargin=15*mm,
                            topMargin=18*mm, bottomMargin=18*mm)

    story = [
        Spacer(1, 10*mm),
        Paragraph(company_name, styles['ReportTitle']),
        Paragraph(f"{ticker} | Equity Research Deep Dive | {datetime.now().strftime('%B %Y')}",
                  styles['SubTitle']),
        HRFlowable(width="100%", thickness=1.5, color=P['primary'], spaceAfter=6*mm),
    ]
    story += markdown_to_flowables(report_markdown, styles)

    story += [
        Spacer(1, 10*mm),
        HRFlowable(width="100%", thickness=0.5, color=P['border'],
                   spaceBefore=3*mm, spaceAfter=3*mm),
        Paragraph(
            "<b>Disclaimer:</b> This report is for informational and educational purposes only. "
            "It does not constitute investment advice. The author may have positions in securities "
            "discussed. Always conduct your own due diligence and consult a registered investment "
            "advisor before making investment decisions. Past performance is not indicative of "
            "future results.",
            styles['SmallText']),
        Paragraph(
            f"Report generated on {datetime.now().strftime('%d %B %Y at %H:%M')} using AI-assisted "
            "research. Data sourced from public filings, screener.in, company presentations, and "
            "web research. All figures in INR unless stated otherwise.",
            styles['SmallText']),
    ]

    def on_page(canvas, doc_):
        header_footer(canvas, doc_, company_name, ticker)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"✅ Report saved to: {output_path}")
    return output_path


if __name__ == '__main__':
    sample = """
## 1. Business Deep Dive

Test paragraph.

| Metric | Value |
|--------|-------|
| Revenue | Rs 1,000 Cr |
| PAT | Rs 100 Cr |

## 2. Investment Verdict

**BUY** with a 12-month target of Rs 500.
"""
    create_research_report("Test Company Ltd", "NSE: TEST", sample, "/tmp/test_report.pdf")
