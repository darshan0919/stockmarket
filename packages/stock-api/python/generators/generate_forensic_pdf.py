"""Forensic Accounting PDF Generator.

Renders the institutional-grade forensic report. Reads a structured dict
(see schema below) and produces a multi-page A4 PDF with:

  Page 1: snapshot + KPI strip + overall rating + §1 Green/Yellow/Red checklist
  Pages 2+: the 9 forensic sections (combined where short)
  Last pages: Piotroski F-Score table + DuPont decomposition + fraud-pattern-match table

Schema (Python dict):

    data = {
        "company_name": str,
        "ticker": str,                   # e.g. "NSE:SWARAJENG"
        "date": str,                     # e.g. "May 2026"
        "fy_range": str,                 # e.g. "FY23–FY25"
        "snapshot": str,                 # 2-3 line business + reason for forensic
        "kpi_headers": list[str],        # 8 labels
        "kpi_values": list[str],         # 8 values
        "overall_rating": str,           # GREEN | YELLOW | RED
        "rating_rationale": str,         # 1 paragraph
        "checklist": list[dict],         # [{area, flag, evidence, page}, ...]
        "sections": list[dict],          # [{title, flag, body, evidence:[str]}, ...]
        "piotroski": {
            "score": int,                # 0-9
            "components": list[dict],    # [{name, fy_curr, fy_prior, score:0|1}, ...]
            "interpretation": str,
        },
        "dupont": {
            "rows": list[dict],          # [{year, roe, npm, at, em, driver}, ...]
            "interpretation": str,
        },
        "fraud_pattern_check": list[dict],  # [{pattern, match, evidence}, ...]
        "sources": str,                  # 1-paragraph source list
        "output_path": str,              # /mnt/user-data/outputs/...
    }

Usage:

    import sys
    sys.path.insert(0, '<skill_path>/scripts')
    sys.path.insert(0, '<skill_path>/_shared')
    from generate_forensic_pdf import create_forensic_pdf
    create_forensic_pdf(data)
"""
from __future__ import annotations
import os
import sys
from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    KeepTogether, PageBreak,
)

# Try to load shared utils whether the caller bundled them or not
_HERE = Path(__file__).resolve().parent
_SHARED = _HERE.parent / "_shared"
if str(_SHARED) not in sys.path:
    sys.path.insert(0, str(_SHARED))

try:
    from pdf_utils import (
        INSTITUTIONAL_LIGHT, INSTITUTIONAL_DARK,
        styled_table, format_inline_markdown,
        flag_color, flag_label, kpi_table, disclaimer_paragraph,
    )
except ImportError:
    raise ImportError(
        "Cannot import pdf_utils. Ensure forensic-accounting/packages/stock-api/python/utils/pdf_utils.py "
        "exists or that the equity-research-library _shared folder is on sys.path."
    )

PALETTE = INSTITUTIONAL_LIGHT


# --- Styles ------------------------------------------------------------------

def _styles():
    base = getSampleStyleSheet()
    s = {
        'Title': ParagraphStyle(
            'TitleX', parent=base['Title'],
            fontName='Helvetica-Bold', fontSize=18, leading=22,
            textColor=PALETTE['primary'], spaceAfter=4),
        'Sub': ParagraphStyle(
            'SubX', parent=base['Normal'],
            fontName='Helvetica', fontSize=9, leading=11,
            textColor=PALETTE['muted'], spaceAfter=8),
        'H2': ParagraphStyle(
            'H2X', parent=base['Heading2'],
            fontName='Helvetica-Bold', fontSize=12, leading=14,
            textColor=PALETTE['primary'], spaceBefore=10, spaceAfter=4),
        'Body': ParagraphStyle(
            'BodyX', parent=base['Normal'],
            fontName='Helvetica', fontSize=9, leading=12,
            textColor=PALETTE['text'], spaceAfter=4),
        'Evidence': ParagraphStyle(
            'EvidenceX', parent=base['Normal'],
            fontName='Helvetica', fontSize=8, leading=10,
            textColor=PALETTE['muted'], spaceAfter=2,
            leftIndent=10),
        'RatingBig': ParagraphStyle(
            'RatingBig', parent=base['Normal'],
            fontName='Helvetica-Bold', fontSize=22, leading=24,
            alignment=1),  # centered
    }
    return s


def _rating_box(rating, rationale, styles):
    """Big coloured rating box at top of page 1."""
    rating_color = flag_color(rating, PALETTE)
    rating_para = Paragraph(
        f'<font color="{rating_color.hexval()}">{rating}</font>',
        styles['RatingBig'],
    )
    box = Table(
        [[rating_para],
         [Paragraph(format_inline_markdown(rationale), styles['Body'])]],
        colWidths=[17 * cm],
    )
    box.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, rating_color),
        ('LINEBELOW', (0, 0), (-1, 0), 0.5, PALETTE['border']),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return box


def _checklist_table(items):
    """The §1 Green/Yellow/Red checklist."""
    headers = ['#', 'Area', 'Flag', 'Evidence', 'Page']
    rows = [headers]
    for i, item in enumerate(items, start=1):
        flag = flag_label(item.get('flag', ''))
        rows.append([
            str(i),
            item.get('area', ''),
            flag,
            item.get('evidence', '')[:80],   # truncate to fit
            item.get('page', ''),
        ])
    table = styled_table(
        rows,
        col_widths=[0.8 * cm, 4.5 * cm, 1.8 * cm, 8.4 * cm, 2.3 * cm],
        palette=PALETTE,
        font_size=7,
        padding=2,
    )
    # Colour the flag cells per row (TableStyle commands accumulate via add())
    for i, item in enumerate(items, start=1):
        c = flag_color(item.get('flag', ''), PALETTE)
        table.setStyle([
            ('BACKGROUND', (2, i), (2, i), c),
            ('TEXTCOLOR', (2, i), (2, i), white),
            ('FONTNAME', (2, i), (2, i), 'Helvetica-Bold'),
            ('ALIGN', (2, i), (2, i), 'CENTER'),
        ])
    return table


def _section_block(section, styles):
    """Render one of the 9 forensic sections."""
    flag = flag_label(section.get('flag', ''))
    flag_c = flag_color(flag, PALETTE)
    title = section.get('title', '')
    body = section.get('body', '')
    evidence = section.get('evidence', []) or []

    title_para = Paragraph(
        f'{title} &nbsp; <font color="{flag_c.hexval()}"><b>[{flag}]</b></font>',
        styles['H2'],
    )
    flowables = [title_para]
    if body:
        flowables.append(Paragraph(format_inline_markdown(body), styles['Body']))
    if evidence:
        flowables.append(Paragraph('<b>Evidence:</b>', styles['Body']))
        for e in evidence:
            flowables.append(Paragraph(f'• {format_inline_markdown(e)}', styles['Evidence']))
    flowables.append(Spacer(1, 4))
    return KeepTogether(flowables)


def _piotroski_table(piotroski):
    score = piotroski.get('score', 0)
    components = piotroski.get('components', [])
    headers = ['#', 'Component', 'Metric', 'FY Curr', 'FY Prior', 'Score']
    rows = [headers]
    for i, c in enumerate(components, start=1):
        rows.append([
            str(i),
            c.get('name', ''),
            c.get('metric', ''),
            c.get('fy_curr', ''),
            c.get('fy_prior', ''),
            str(c.get('score', 0)),
        ])
    rows.append(['', 'TOTAL', '', '', '', str(score)])
    table = styled_table(
        rows,
        col_widths=[0.8 * cm, 5.5 * cm, 4.0 * cm, 2.2 * cm, 2.2 * cm, 1.5 * cm],
        palette=PALETTE,
        font_size=7,
        padding=2,
    )
    table.setStyle([('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                    ('BACKGROUND', (0, -1), (-1, -1), PALETTE['tint'])])
    if score >= 7:
        table.setStyle([('TEXTCOLOR', (-1, -1), (-1, -1), PALETTE['good'])])
    elif score >= 4:
        table.setStyle([('TEXTCOLOR', (-1, -1), (-1, -1), PALETTE['warn'])])
    else:
        table.setStyle([('TEXTCOLOR', (-1, -1), (-1, -1), PALETTE['bad'])])
    return table


def _dupont_table(dupont):
    headers = ['Year', 'ROE', 'NPM', 'AT', 'EM', 'Driver of change']
    rows = [headers]
    for r in dupont.get('rows', []):
        rows.append([
            r.get('year', ''),
            r.get('roe', ''),
            r.get('npm', ''),
            r.get('at', ''),
            r.get('em', ''),
            r.get('driver', '')[:40],
        ])
    return styled_table(
        rows,
        col_widths=[1.5 * cm, 1.8 * cm, 1.8 * cm, 1.6 * cm, 1.6 * cm, 7.7 * cm],
        palette=PALETTE,
        font_size=7,
        padding=2,
    )


def _fraud_pattern_table(items):
    headers = ['Pattern', 'Match', 'Evidence']
    rows = [headers]
    for it in items:
        rows.append([
            it.get('pattern', ''),
            flag_label(it.get('match', '')),
            it.get('evidence', '')[:90],
        ])
    table = styled_table(
        rows,
        col_widths=[5.5 * cm, 2.5 * cm, 9.0 * cm],
        palette=PALETTE,
        font_size=7,
        padding=2,
    )
    for i, it in enumerate(items, start=1):
        m = it.get('match', '').upper().strip()
        if m in ('MATCH', 'YES'):
            c = PALETTE['bad']
        elif m in ('PARTIAL', 'PARTIAL MATCH'):
            c = PALETTE['warn']
        elif m in ('NO MATCH', 'NO', 'N/A'):
            c = PALETTE['good']
        else:
            c = PALETTE['muted']
        table.setStyle([
            ('BACKGROUND', (1, i), (1, i), c),
            ('TEXTCOLOR', (1, i), (1, i), white),
            ('FONTNAME', (1, i), (1, i), 'Helvetica-Bold'),
            ('ALIGN', (1, i), (1, i), 'CENTER'),
        ])
    return table


# --- Main entry point --------------------------------------------------------

def create_forensic_pdf(data: dict) -> str:
    """Generate the forensic PDF and return the output path."""
    output_path = data['output_path']
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
        title=f"{data.get('company_name', '')} — Forensic Accounting Review",
    )
    styles = _styles()
    story = []

    # --- Page 1: header + KPIs + rating + checklist ---
    story.append(Paragraph(
        f"{data.get('company_name', '')} — Forensic Accounting Review",
        styles['Title'],
    ))
    story.append(Paragraph(
        f"{data.get('ticker', '')} &nbsp;•&nbsp; {data.get('date', '')} &nbsp;•&nbsp; "
        f"Period: {data.get('fy_range', '')}",
        styles['Sub'],
    ))

    if data.get('snapshot'):
        story.append(Paragraph(format_inline_markdown(data['snapshot']), styles['Body']))
        story.append(Spacer(1, 6))

    if data.get('kpi_headers'):
        col_w = [(17 / len(data['kpi_headers'])) * cm] * len(data['kpi_headers'])
        story.append(kpi_table(
            data['kpi_headers'], data['kpi_values'], col_w, PALETTE, font_size=8,
        ))
        story.append(Spacer(1, 8))

    story.append(_rating_box(
        data.get('overall_rating', '---'),
        data.get('rating_rationale', ''),
        styles,
    ))
    story.append(Spacer(1, 10))

    if data.get('checklist'):
        story.append(Paragraph('§1 — Green / Yellow / Red Checklist', styles['H2']))
        story.append(_checklist_table(data['checklist']))

    # --- Pages 2+: §2-§9 forensic sections ---
    if data.get('sections'):
        story.append(PageBreak())
        story.append(Paragraph('Forensic Sections', styles['Title']))
        story.append(Spacer(1, 6))
        for section in data['sections']:
            story.append(_section_block(section, styles))

    # --- Piotroski ---
    if data.get('piotroski'):
        story.append(PageBreak())
        story.append(Paragraph('Piotroski F-Score', styles['Title']))
        story.append(Spacer(1, 4))
        story.append(_piotroski_table(data['piotroski']))
        if data['piotroski'].get('interpretation'):
            story.append(Spacer(1, 6))
            story.append(Paragraph(
                format_inline_markdown(data['piotroski']['interpretation']),
                styles['Body']))

    # --- DuPont ---
    if data.get('dupont'):
        story.append(Spacer(1, 12))
        story.append(Paragraph('DuPont Decomposition', styles['H2']))
        story.append(_dupont_table(data['dupont']))
        if data['dupont'].get('interpretation'):
            story.append(Spacer(1, 6))
            story.append(Paragraph(
                format_inline_markdown(data['dupont']['interpretation']),
                styles['Body']))

    # --- Fraud pattern match ---
    if data.get('fraud_pattern_check'):
        story.append(Spacer(1, 12))
        story.append(Paragraph('Documented Fraud Pattern Match', styles['H2']))
        story.append(_fraud_pattern_table(data['fraud_pattern_check']))

    # --- Sources + disclaimer ---
    story.append(Spacer(1, 12))
    if data.get('sources'):
        story.append(Paragraph('Sources', styles['H2']))
        story.append(Paragraph(format_inline_markdown(data['sources']), styles['Body']))
    story.append(Spacer(1, 8))
    story.append(disclaimer_paragraph(PALETTE))

    doc.build(story)
    return output_path


# --- Schema for cross-skill consumption (no PDF, just dict) ------------------

def get_forensic_schema(data: dict) -> dict:
    """Return a flat schema for consumption by `equity-research-master` Tab 7
    or by other skills that don't need the PDF rendered."""
    return {
        'company_name': data.get('company_name'),
        'ticker': data.get('ticker'),
        'overall_rating': data.get('overall_rating'),
        'rating_rationale': data.get('rating_rationale'),
        'checklist': data.get('checklist', []),
        'sections_summary': [
            {'title': s.get('title'), 'flag': s.get('flag')}
            for s in data.get('sections', [])
        ],
        'piotroski_score': (data.get('piotroski') or {}).get('score'),
        'dupont_summary': (data.get('dupont') or {}).get('interpretation'),
        'fraud_patterns_matched': [
            it for it in (data.get('fraud_pattern_check') or [])
            if it.get('match', '').upper() in ('MATCH', 'YES', 'PARTIAL', 'PARTIAL MATCH')
        ],
    }


if __name__ == '__main__':
    # Smoke test — minimal valid data
    sample = {
        'company_name': 'Sample Industries Ltd',
        'ticker': 'NSE:SAMPLE',
        'date': 'May 2026',
        'fy_range': 'FY23–FY25',
        'snapshot': 'Sample is a manufacturer of widgets. Forensic check triggered by 50% YoY RPT growth.',
        'kpi_headers': ['Rev', 'PAT', 'EBITDA Mgn', 'ROE', 'ROCE', 'D/E', 'CFO/PAT', 'P/E'],
        'kpi_values': ['Rs 1,234 Cr', 'Rs 145 Cr', '18.4%', '14.2%', '17.8%', '0.42', '0.78', '24x'],
        'overall_rating': 'YELLOW',
        'rating_rationale': 'Two YELLOW flags: DSO drift (+8 days FY24→FY25) and misc expenses at 2.7% of revenue. CFO/PAT 3Y at 0.78 is borderline. No RED flags but trend warrants Q4 watch.',
        'checklist': [
            {'area': 'CFO/PAT 3Y', 'flag': 'YELLOW', 'evidence': '0.78 (FY23 0.85 -> FY25 0.71)', 'page': 'FY25 AR p.142'},
            {'area': 'Revenue recognition', 'flag': 'GREEN', 'evidence': 'No policy change in 3 years', 'page': 'Note 2.4'},
        ],
        'sections': [
            {'title': '§2 Revenue recognition', 'flag': 'GREEN', 'body': 'No policy changes; Ind AS 115 applied consistently.', 'evidence': ['Note 2.4 unchanged FY23-FY25']},
        ],
        'piotroski': {'score': 7, 'components': [
            {'name': 'Positive net income', 'metric': 'PAT', 'fy_curr': '145 Cr', 'fy_prior': '128 Cr', 'score': 1},
        ], 'interpretation': 'Strong score driven by improving margins and no new equity issuance.'},
        'dupont': {'rows': [
            {'year': 'FY23', 'roe': '13.2%', 'npm': '10.1%', 'at': '0.85', 'em': '1.54', 'driver': 'base'},
        ], 'interpretation': 'ROE expansion driven by NPM, not leverage. Quality.'},
        'fraud_pattern_check': [
            {'pattern': 'Gensol (loan diversion)', 'match': 'NO MATCH', 'evidence': 'CFO positive 3Y; RPTs at 4% revenue.'},
        ],
        'sources': 'FY23/FY24/FY25 ARs; Stockscans filings; Screener.in (accessed 06-May-2026).',
        'output_path': '/tmp/sample_forensic.pdf',
    }
    out = create_forensic_pdf(sample)
    print(f"Generated: {out}")
