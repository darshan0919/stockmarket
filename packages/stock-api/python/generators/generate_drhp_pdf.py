"""DRHP / IPO Analysis PDF Generator.

Renders a DRHP analysis as an institutional-grade PDF with:
  Page 1: cover + KPI strip + subscription verdict box
  Page 2: 10-section synthesis (compact)
  Pages 3-4: Financial highlights table + cash flow trend
  Page 5: Red-flag checklist (the differentiator)
  Page 6: Peer comparison + valuation summary

Schema — see SKILL.md for the full reference.
"""
from __future__ import annotations
import os
import sys
from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    KeepTogether, PageBreak,
)

_HERE = Path(__file__).resolve().parent
_SHARED = _HERE.parent / "_shared"
if str(_SHARED) not in sys.path:
    sys.path.insert(0, str(_SHARED))

from pdf_utils import (
    INSTITUTIONAL_LIGHT,
    styled_table, format_inline_markdown,
    flag_color, flag_label, kpi_table, disclaimer_paragraph,
)

PALETTE = INSTITUTIONAL_LIGHT


VIEW_COLORS = {
    'SUBSCRIBE': PALETTE['good'],
    'SUBSCRIBE-FOR-LISTING-GAINS-ONLY': PALETTE['warn'],
    'WATCH-POST-LISTING': PALETTE['warn'],
    'AVOID': PALETTE['bad'],
}


def _styles():
    base = getSampleStyleSheet()
    return {
        'Title': ParagraphStyle('TitleX', parent=base['Title'],
                                fontName='Helvetica-Bold', fontSize=18, leading=22,
                                textColor=PALETTE['primary'], spaceAfter=4),
        'Sub': ParagraphStyle('SubX', parent=base['Normal'],
                              fontName='Helvetica', fontSize=9, leading=11,
                              textColor=PALETTE['muted'], spaceAfter=8),
        'H2': ParagraphStyle('H2X', parent=base['Heading2'],
                             fontName='Helvetica-Bold', fontSize=12, leading=14,
                             textColor=PALETTE['primary'], spaceBefore=10, spaceAfter=4),
        'Body': ParagraphStyle('BodyX', parent=base['Normal'],
                               fontName='Helvetica', fontSize=9, leading=12,
                               textColor=PALETTE['text'], spaceAfter=4),
        'VerdictBig': ParagraphStyle('VerdictBig', parent=base['Normal'],
                                     fontName='Helvetica-Bold', fontSize=18, leading=22,
                                     alignment=1),
        'Evidence': ParagraphStyle('EvidenceX', parent=base['Normal'],
                                   fontName='Helvetica', fontSize=8, leading=10,
                                   textColor=PALETTE['muted'], leftIndent=10),
    }


def _verdict_box(view, rationale, styles):
    color = VIEW_COLORS.get(view.upper().strip() if view else '', PALETTE['muted'])
    para = Paragraph(
        f'<font color="{white.hexval()}">{view}</font>',
        styles['VerdictBig'],
    )
    box = Table(
        [[para],
         [Paragraph(format_inline_markdown(rationale or ''), styles['Body'])]],
        colWidths=[17 * cm],
    )
    box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), color),
        ('BACKGROUND', (0, 1), (-1, 1), PALETTE['tint']),
        ('BOX', (0, 0), (-1, -1), 1, color),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return box


def _issue_summary_table(data):
    """Top issue summary (issue size, fresh vs OFS, price band, lot)."""
    rows = [
        ['Issue type', data.get('issue_type', '—'),
         'Filing date', data.get('filing_date', '—')],
        ['Issue size (Rs Cr)', str(data.get('issue_size_cr', '—')),
         'Price band', data.get('price_band', '—')],
        ['Fresh issue (Rs Cr)', str(data.get('fresh_issue_cr', '—')),
         'Lot size', str(data.get('lot_size', '—'))],
        ['OFS (Rs Cr)', str(data.get('ofs_cr', '—')),
         'OFS as % of issue', f"{(data.get('ofs_cr', 0) / max(data.get('issue_size_cr', 1), 1) * 100):.0f}%"],
    ]
    table = Table(rows, colWidths=[3.5 * cm, 5 * cm, 3.5 * cm, 5 * cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), PALETTE['primary']),
        ('BACKGROUND', (2, 0), (2, -1), PALETTE['primary']),
        ('TEXTCOLOR', (0, 0), (0, -1), white),
        ('TEXTCOLOR', (2, 0), (2, -1), white),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, PALETTE['border']),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    return table


def _financials_table(financial_table):
    headers = ['Metric'] + financial_table.get('headers', [])
    rows = [headers]
    for r in financial_table.get('rows', []):
        rows.append([r.get('metric', '')] + [str(v) for v in r.get('values', [])])
    n_cols = len(headers)
    metric_w = 5 * cm
    other_w = (17 - 5) / max(n_cols - 1, 1) * cm
    col_w = [metric_w] + [other_w] * (n_cols - 1)
    return styled_table(rows, col_widths=col_w, palette=PALETTE,
                        font_size=8, padding=3)


def _red_flags_table(red_flags):
    headers = ['#', 'Red flag', 'Rating', 'Evidence', 'Page']
    rows = [headers]
    for i, rf in enumerate(red_flags, start=1):
        rows.append([
            str(i),
            rf.get('flag', '')[:50],
            flag_label(rf.get('rating', '')),
            rf.get('evidence', '')[:60],
            rf.get('page', ''),
        ])
    table = styled_table(
        rows,
        col_widths=[0.8 * cm, 5 * cm, 1.8 * cm, 7.4 * cm, 2 * cm],
        palette=PALETTE,
        font_size=7,
        padding=2,
    )
    for i, rf in enumerate(red_flags, start=1):
        c = flag_color(rf.get('rating', ''), PALETTE)
        table.setStyle([
            ('BACKGROUND', (2, i), (2, i), c),
            ('TEXTCOLOR', (2, i), (2, i), white),
            ('FONTNAME', (2, i), (2, i), 'Helvetica-Bold'),
            ('ALIGN', (2, i), (2, i), 'CENTER'),
        ])
    return table


def _peer_table(rows):
    if not rows:
        return None
    return styled_table(rows, col_widths=None, palette=PALETTE,
                        font_size=8, padding=3) if rows else None


def _section_block(section, styles):
    flowables = [Paragraph(section.get('title', ''), styles['H2'])]
    if section.get('body'):
        flowables.append(Paragraph(format_inline_markdown(section['body']),
                                   styles['Body']))
    for e in section.get('evidence', []) or []:
        flowables.append(Paragraph(f'• {format_inline_markdown(e)}',
                                   styles['Evidence']))
    flowables.append(Spacer(1, 4))
    return KeepTogether(flowables)


def create_drhp_pdf(data: dict) -> str:
    output_path = data['output_path']
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
        title=f"{data.get('company_name', '')} — DRHP Analysis",
    )
    styles = _styles()
    story = []

    # Header
    story.append(Paragraph(
        f"{data.get('company_name', '')} — DRHP / IPO Analysis",
        styles['Title'],
    ))
    story.append(Paragraph(
        f"{data.get('issue_type', '')} • Filing {data.get('filing_date', '')}",
        styles['Sub'],
    ))

    # Issue summary
    story.append(_issue_summary_table(data))
    story.append(Spacer(1, 10))

    # Verdict box (the headline)
    story.append(_verdict_box(
        data.get('subscription_view', ''),
        data.get('verdict_rationale', ''),
        styles,
    ))
    story.append(Spacer(1, 10))

    # Executive summary
    if data.get('executive_summary'):
        story.append(Paragraph('Executive Summary', styles['H2']))
        story.append(Paragraph(format_inline_markdown(data['executive_summary']),
                               styles['Body']))

    # 10 sections (synthesised)
    if data.get('sections'):
        story.append(PageBreak())
        story.append(Paragraph('10-Section Synthesis', styles['Title']))
        story.append(Spacer(1, 6))
        for section in data['sections']:
            story.append(_section_block(section, styles))

    # Financial highlights
    if data.get('financial_table'):
        story.append(PageBreak())
        story.append(Paragraph('Financial Highlights (Restated)', styles['Title']))
        story.append(Spacer(1, 6))
        story.append(_financials_table(data['financial_table']))

    # Red flags (page 5)
    if data.get('red_flags'):
        story.append(Spacer(1, 14))
        story.append(Paragraph('Red Flag Checklist', styles['Title']))
        story.append(Spacer(1, 6))
        story.append(_red_flags_table(data['red_flags']))

    # Peer comparison + valuation
    if data.get('peer_comparison_table') or data.get('valuation_summary'):
        story.append(PageBreak())
        story.append(Paragraph('Peer Comparison & Valuation', styles['Title']))
        story.append(Spacer(1, 6))
        if data.get('valuation_summary'):
            story.append(Paragraph(format_inline_markdown(data['valuation_summary']),
                                   styles['Body']))
            story.append(Spacer(1, 8))
        if data.get('peer_comparison_table'):
            peer_t = _peer_table(data['peer_comparison_table'])
            if peer_t is not None:
                story.append(peer_t)

    # Sources + disclaimer
    if data.get('sources'):
        story.append(Spacer(1, 12))
        story.append(Paragraph('Sources', styles['H2']))
        story.append(Paragraph(format_inline_markdown(data['sources']), styles['Body']))
    story.append(Spacer(1, 8))
    story.append(disclaimer_paragraph(PALETTE))

    doc.build(story)
    return output_path


if __name__ == '__main__':
    sample = {
        'company_name': 'Sample Tech Ltd',
        'issue_type': 'Mainboard IPO',
        'filing_date': '15-Apr-2026',
        'issue_size_cr': 850,
        'fresh_issue_cr': 350,
        'ofs_cr': 500,
        'price_band': 'Rs 145 - Rs 152',
        'lot_size': 98,
        'subscription_view': 'WATCH-POST-LISTING',
        'verdict_rationale': '2 RED flags (heavy OFS at 59% of issue, top-customer concentration at 38%). Fundamentals are growing but valuation at 35x forward P/E vs peer median 22x is steep.',
        'executive_summary': 'Sample Tech is a B2B SaaS provider in the Indian SME segment. Issue is 41% fresh / 59% OFS. 3-year revenue CAGR of 38% with margin expansion is strong, but customer concentration (top 1 = 22%, top 3 = 51%) and pricing premium to peers warrant caution.',
        'sections': [
            {'title': '1. Business Overview', 'body': 'B2B SaaS for Indian SMEs across 8 product modules.'},
            {'title': '3. Objects of the Issue', 'body': 'Fresh issue Rs 350 Cr split: Rs 200 Cr debt repayment, Rs 100 Cr GCP, Rs 50 Cr capex. **OFS Rs 500 Cr is 59% of total** — promoter and PE selldown.'},
        ],
        'financial_table': {
            'headers': ['FY23', 'FY24', 'FY25'],
            'rows': [
                {'metric': 'Revenue (Rs Cr)', 'values': [340, 470, 645]},
                {'metric': 'EBITDA margin', 'values': ['12%', '16%', '21%']},
                {'metric': 'PAT (Rs Cr)', 'values': [22, 48, 95]},
                {'metric': 'CFO/PAT', 'values': [0.65, 0.72, 0.71]},
                {'metric': 'ROE', 'values': ['14%', '22%', '31%']},
            ],
        },
        'red_flags': [
            {'flag': 'Negative CF with positive profit', 'rating': 'GREEN', 'evidence': 'CFO positive 3Y; CFO/PAT 0.7+', 'page': 'p.310'},
            {'flag': 'Sudden profit spike pre-IPO', 'rating': 'YELLOW', 'evidence': 'PAT FY24 +118%; FY25 +98%', 'page': 'p.305'},
            {'flag': 'Large OFS component', 'rating': 'RED', 'evidence': 'OFS Rs 500 Cr = 59% of total', 'page': 'p.95'},
            {'flag': 'Heavy customer concentration', 'rating': 'RED', 'evidence': 'Top 1 = 22%, Top 3 = 51%', 'page': 'p.245'},
            {'flag': 'Auditor qualification or change', 'rating': 'GREEN', 'evidence': 'Same Big-4 firm 5 years', 'page': 'p.275'},
            {'flag': 'Promoter compensation', 'rating': 'YELLOW', 'evidence': '6.5% of FY25 PAT', 'page': 'p.220'},
            {'flag': 'Pending litigation', 'rating': 'GREEN', 'evidence': 'Routine tax matters only', 'page': 'p.380'},
        ],
        'valuation_summary': 'IPO P/E at upper band: 35x FY25 vs peer median 22x. Premium of 60% requires sustained 30%+ growth. Forward P/E (FY27 consensus): 22x — reasonable IF growth holds.',
        'sources': 'DRHP filed with SEBI 15-Apr-2026; live data Stockscans 06-May-2026.',
        'output_path': '/tmp/sample_drhp.pdf',
    }
    out = create_drhp_pdf(sample)
    print(f"Generated: {out}")
