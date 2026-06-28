#!/usr/bin/env python3
"""Sector Research Deep Dive — PDF Report Generator.

Converts a structured markdown sector primer into a 30–45 page institutional PDF.
Palette, table styling, and markdown parsers live in `_shared/pdf_utils.py`.

The generator deliberately mirrors equity-research-deepdive's renderer so visual
identity stays consistent across the analyst's skills library — only the cover
page, header, and footer text change.
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
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
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


def _register_unicode_fonts():
    """Register DejaVu Sans (Unicode-capable) so ₹, ₹, ‚ etc. render correctly.

    Falls back silently to Helvetica if DejaVu is unavailable — in that case
    use "Rs" instead of "₹" in the markdown. The font names exposed are
    'BodyFont' / 'BodyFont-Bold' / 'BodyFont-Italic'.
    """
    candidates = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf"),
    ]
    for regular, bold, italic, bolditalic in candidates:
        if all(os.path.exists(p) for p in (regular, bold, italic, bolditalic)):
            try:
                pdfmetrics.registerFont(TTFont('BodyFont', regular))
                pdfmetrics.registerFont(TTFont('BodyFont-Bold', bold))
                pdfmetrics.registerFont(TTFont('BodyFont-Italic', italic))
                pdfmetrics.registerFont(TTFont('BodyFont-BoldItalic', bolditalic))
                from reportlab.pdfbase.pdfmetrics import registerFontFamily
                registerFontFamily(
                    'BodyFont',
                    normal='BodyFont',
                    bold='BodyFont-Bold',
                    italic='BodyFont-Italic',
                    boldItalic='BodyFont-BoldItalic',
                )
                return True
            except Exception:
                continue
    return False


_UNICODE_OK = _register_unicode_fonts()
_BASE_FONT = 'BodyFont' if _UNICODE_OK else 'Helvetica'
_BASE_BOLD = 'BodyFont-Bold' if _UNICODE_OK else 'Helvetica-Bold'
_BASE_ITALIC = 'BodyFont-Italic' if _UNICODE_OK else 'Helvetica-Oblique'


def get_styles():
    """ParagraphStyle set for the sector primer.

    Body styles use a Unicode-capable font (DejaVu Sans if available) so ₹,
    arrows, em-dashes and other glyphs render. Cover-page styles inherit from
    the sample stylesheet's Heading/Title parents which use Helvetica — close
    enough visually since these are large display sizes.
    """
    s = getSampleStyleSheet()

    s.add(ParagraphStyle('ReportTitle', parent=s['Title'], fontSize=22, textColor=P['primary'],
                         spaceAfter=4*mm, alignment=TA_LEFT, leading=26,
                         fontName=_BASE_BOLD))
    s.add(ParagraphStyle('SubTitle', parent=s['Normal'], fontSize=11, textColor=P['muted'],
                         spaceAfter=3*mm, alignment=TA_LEFT, fontName=_BASE_FONT))
    s.add(ParagraphStyle('Classification', parent=s['Normal'], fontSize=8.5,
                         textColor=P['bad'], spaceAfter=8*mm, alignment=TA_LEFT,
                         fontName=_BASE_BOLD))
    s.add(ParagraphStyle('SectionHeader', parent=s['Heading1'], fontSize=14, textColor=P['primary'],
                         spaceBefore=10*mm, spaceAfter=4*mm, leading=18,
                         fontName=_BASE_BOLD))
    s.add(ParagraphStyle('SubSectionHeader', parent=s['Heading2'], fontSize=11, textColor=P['secondary'],
                         spaceBefore=6*mm, spaceAfter=3*mm, leading=14, fontName=_BASE_BOLD))

    s['BodyText'].fontSize = 9
    s['BodyText'].textColor = black
    s['BodyText'].spaceAfter = 3*mm
    s['BodyText'].alignment = TA_JUSTIFY
    s['BodyText'].leading = 13
    s['BodyText'].fontName = _BASE_FONT

    s.add(ParagraphStyle('BulletText', parent=s['Normal'], fontSize=9, textColor=black,
                         spaceAfter=1.5*mm, leftIndent=8*mm, bulletIndent=3*mm, leading=12,
                         fontName=_BASE_FONT))
    s.add(ParagraphStyle('SmallText', parent=s['Normal'], fontSize=7.5, textColor=P['muted'],
                         spaceAfter=1*mm, leading=10, fontName=_BASE_FONT))
    s.add(ParagraphStyle('RedFlag', parent=s['Normal'], fontSize=9, textColor=P['bad'],
                         spaceAfter=2*mm, leading=12, fontName=_BASE_BOLD))
    s.add(ParagraphStyle('AnalystView', parent=s['Normal'], fontSize=9, textColor=P['secondary'],
                         spaceAfter=2*mm, leading=12, fontName=_BASE_BOLD,
                         leftIndent=4*mm))
    s.add(ParagraphStyle('Quote', parent=s['Normal'], fontSize=9, textColor=P['muted'],
                         leftIndent=10*mm, rightIndent=10*mm, spaceAfter=3*mm, spaceBefore=2*mm,
                         leading=12, fontName=_BASE_ITALIC))
    s.add(ParagraphStyle('TableCell', parent=s['Normal'], fontSize=8, leading=10, alignment=TA_LEFT,
                         fontName=_BASE_FONT))
    s.add(ParagraphStyle('TableHeader', parent=s['Normal'], fontSize=8, leading=10, textColor=white,
                         fontName=_BASE_BOLD, alignment=TA_LEFT))

    # Tag styles for inline data-provenance labels
    for tag, color in [
        ('Unverified', P['bad']),
        ('AnalystEstimate', P['warn']),
        ('CompanyGuidance', P['good']),
    ]:
        s.add(ParagraphStyle(f'Tag{tag}', parent=s['Normal'], fontSize=8,
                             textColor=color, fontName=_BASE_BOLD))
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
    """Convert markdown text to ReportLab flowables.

    Recognises a few sector-report-specific cues on top of the standard
    markdown set:
      - Lines starting with `[Analyst View]` render in the analyst-view style.
      - `[Unverified — ...]` / `[Analyst Estimate]` tags stay bolded inline
        via the standard bold pass.
      - 🚩 / `RED FLAG` lines render in the red-flag style.
    """
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

        # Title-level # is suppressed (cover page handles it)
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

        # [Analyst View] callout — distinctive secondary-color bold block
        if stripped.startswith('[Analyst View]') or stripped.lower().startswith('**[analyst view]**'):
            text = re.sub(r'^\*\*\[analyst view\]\*\*', '[Analyst View]', stripped, flags=re.IGNORECASE)
            flowables.append(Paragraph(
                format_inline_markdown(text),
                styles['AnalystView']
            ))
            i += 1
            continue

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


def header_footer(canvas, doc, sector_name, sub_theme):
    """Header line + footer line drawn on every page."""
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(P['primary'])
    canvas.setLineWidth(1)
    canvas.line(15*mm, height - 12*mm, width - 15*mm, height - 12*mm)

    header_label = f"{sector_name} — Sector Deep Dive"
    if sub_theme:
        header_label += f" | {sub_theme}"

    canvas.setFont(_BASE_FONT, 7)
    canvas.setFillColor(P['muted'])
    canvas.drawString(15*mm, height - 10*mm, header_label)
    canvas.drawRightString(width - 15*mm, height - 10*mm, datetime.now().strftime('%B %Y'))

    canvas.setLineWidth(0.5)
    canvas.line(15*mm, 12*mm, width - 15*mm, 12*mm)
    canvas.setFont(_BASE_FONT, 7)
    canvas.setFillColor(P['muted'])
    canvas.drawString(15*mm, 7*mm,
                      "Internal — for investment conviction building; not a published recommendation.")
    canvas.drawRightString(width - 15*mm, 7*mm, f"Page {doc.page}")
    canvas.restoreState()


def create_sector_report(sector_name, sub_theme, report_markdown, output_path):
    """Build the multi-page institutional sector primer PDF.

    Args:
        sector_name: Display name of the sector (e.g. "Quick Commerce", "Indian Nuclear Power").
        sub_theme: Optional sub-focus (e.g. "Dark store unit economics & moat sustainability"). Pass None to omit.
        report_markdown: Full markdown body covering all 19 sections. Markdown ## headers map to section headers.
        output_path: Absolute path for the resulting PDF.
    """
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    styles = get_styles()

    doc = SimpleDocTemplate(output_path, pagesize=A4,
                            leftMargin=15*mm, rightMargin=15*mm,
                            topMargin=18*mm, bottomMargin=18*mm)

    subtitle_parts = ["Sector Research Deep Dive"]
    if sub_theme:
        subtitle_parts.append(sub_theme)
    subtitle_parts.append(datetime.now().strftime('%B %Y'))

    story = [
        Spacer(1, 10*mm),
        Paragraph(sector_name, styles['ReportTitle']),
        Paragraph(" | ".join(subtitle_parts), styles['SubTitle']),
        Paragraph(
            "Classification: INTERNAL — for investment conviction building; not a published recommendation.",
            styles['Classification']),
        Paragraph(
            f"<b>Data current as of:</b> {datetime.now().strftime('%d %B %Y')}",
            styles['SmallText']),
        HRFlowable(width="100%", thickness=1.5, color=P['primary'],
                   spaceBefore=4*mm, spaceAfter=6*mm),
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
            "future results. Forward-looking statements involve risk and uncertainty.",
            styles['SmallText']),
        Paragraph(
            f"Report generated on {datetime.now().strftime('%d %B %Y at %H:%M')} using AI-assisted "
            "research per the SOIC / StockScans sector research protocol. Data sourced from public "
            "filings, regulator notifications, credit-rating sector reports, company concalls, and "
            "web research. All figures cross-referenced against ≥2 sources where flagged; "
            "[Unverified] tags indicate data that could not be cross-checked. All Indian-context "
            "figures in INR crore / lakh crore unless stated; global figures in USD.",
            styles['SmallText']),
    ]

    def on_page(canvas, doc_):
        header_footer(canvas, doc_, sector_name, sub_theme)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print(f"✅ Sector primer saved to: {output_path}")
    return output_path


if __name__ == '__main__':
    sample = """
## 1. Executive Summary & Investment Thesis

**One-line thesis:** Quick commerce is structurally pivoting from discount-led customer acquisition to density-driven contribution-margin expansion — and only one of the four players has the SKU breadth, dark store density, and owned-brand attach rate to convert that pivot into operating leverage.

| What's new | Why it matters |
|---|---|
| Blinkit AOV ₹450 → ₹650 (Q2 FY26) | Same delivery cost, higher contribution per order |
| Instamart category expansion to electronics | Tests whether dark-store model travels beyond grocery |

[Analyst View] The market is still pricing quick commerce as a grocery-delivery business. The actual business is becoming an AOV-elastic distribution platform, which deserves a different multiple — but only if contribution margin holds above 4%.

## 2. Why Quick Commerce — First Principles

Per-order P&L at maturity (Blinkit base case, [Analyst Estimate]):

| Line item | Rs / order | % of GMV |
|---|---|---|
| GMV | 650 | 100% |
| Take rate | 130 | 20% |
| Delivery cost | -55 | -8.5% |
| Packaging + payment | -18 | -2.8% |
| Contribution margin | 57 | 8.8% |

🚩 If delivery cost / order stays above ₹65, contribution margin compresses below 4% — the level at which fixed-cost absorption fails on a dark-store basis.

## 14. Risks & Bear Case

- Business model risk: tier-2 city density economics may not work (TAM compression).
- Customer behaviour risk: if cohort frequency stabilises at 4 orders/month rather than rising to 8, LTV math breaks.
"""
    create_sector_report(
        "Quick Commerce",
        "Dark store unit economics & moat sustainability",
        sample,
        "/tmp/test_sector_report.pdf",
    )
