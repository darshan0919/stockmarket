"""Peer Comparison Report Generator (PDF).

Renders a multi-page institutional peer comparison report. Supports 2-6 companies
across 4 mandatory dimensions + 1 optional credibility dimension + final verdict.

Schema (Python dict) — see SKILL.md for the full reference. Minimal example:

    data = {
        "title": "Telecom Equipment: STL Tech vs HFCL",
        "date": "May 2026",
        "companies": [{"name": ..., "ticker": ..., "cmp": ..., "market_cap_cr": ...,
                       "sector": ...}, ...],
        "executive_summary": "...",
        "dimensions": [   # ordered list of comparison tables
            {
                "name": "Demand & Order Book",
                "metrics": ["TTM Revenue", "Order Book", "Book-to-Bill", ...],
                "values": [   # one row per metric, list of values per company
                    ["5,432 Cr", "8,210 Cr"],   # row for "TTM Revenue"
                    ["7,800 Cr", "12,300 Cr"],  # row for "Order Book"
                    ...
                ],
                "winner": "Company B",
                "winner_rationale": "Higher book-to-bill and...",
            },
            ...
        ],
        "verdict": {
            "best_business": "...", "best_priced": "...",
            "relative_value_setup": "...", "preferred_pick": "...",
            "key_catalyst": "...", "biggest_risk": "...",
        },
        "sources": "...",
        "output_path": "/mnt/user-data/outputs/Peer_<sector>_<date>.pdf",
    }
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
        'Winner': ParagraphStyle('WinnerX', parent=base['Normal'],
                                 fontName='Helvetica-Bold', fontSize=10, leading=12,
                                 textColor=PALETTE['good'], spaceAfter=4),
        'Verdict': ParagraphStyle('VerdictX', parent=base['Normal'],
                                  fontName='Helvetica-Bold', fontSize=11, leading=14,
                                  textColor=PALETTE['primary']),
    }


def _company_strip(companies, styles):
    """The header row: one box per company with name, ticker, CMP."""
    cells = []
    for c in companies:
        text = (
            f'<b>{c.get("name", "")}</b><br/>'
            f'<font size="8" color="{PALETTE["muted"].hexval()}">'
            f'{c.get("ticker", "")} • CMP {c.get("cmp", "")} • '
            f'MCap Rs {c.get("market_cap_cr", "—")} Cr'
            f'</font>'
        )
        cells.append(Paragraph(text, styles['Body']))
    n = len(companies)
    col_w = [(17 / n) * cm] * n
    table = Table([cells], colWidths=col_w)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), PALETTE['tint']),
        ('BOX', (0, 0), (-1, -1), 0.5, PALETTE['border']),
        ('LINEBEFORE', (1, 0), (-1, -1), 0.5, PALETTE['border']),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    return table


def _dimension_table(dimension, companies, styles):
    """A side-by-side table for one comparison dimension."""
    name = dimension.get('name', '')
    metrics = dimension.get('metrics', [])
    values = dimension.get('values', [])

    # Build headers: Metric | Company A | Company B | ...
    n_companies = len(companies)
    headers = ['Metric'] + [c.get('name', '') for c in companies]
    rows = [headers]
    for i, metric_name in enumerate(metrics):
        row = [metric_name]
        if i < len(values):
            row.extend(values[i])
        else:
            row.extend(['—'] * n_companies)
        rows.append(row)
    metric_w = 4.5 * cm
    company_w = (17 - 4.5) / n_companies * cm
    col_w = [metric_w] + [company_w] * n_companies
    table = styled_table(rows, col_widths=col_w, palette=PALETTE,
                         font_size=8, padding=3)
    return table


def _dimension_block(dimension, companies, styles):
    """Render one dimension: title, table, winner, rationale."""
    flowables = [
        Paragraph(dimension.get('name', ''), styles['H2']),
        _dimension_table(dimension, companies, styles),
        Spacer(1, 4),
        Paragraph(
            f"<b>Winner:</b> "
            f'<font color="{PALETTE["good"].hexval()}">'
            f'{dimension.get("winner", "—")}'
            f'</font>',
            styles['Body']),
    ]
    if dimension.get('winner_rationale'):
        flowables.append(Paragraph(
            f"<i>Why:</i> {format_inline_markdown(dimension['winner_rationale'])}",
            styles['Body']))
    if dimension.get('risk_flag'):
        flowables.append(Paragraph(
            f"<b><font color='{PALETTE['bad'].hexval()}'>Risk:</font></b> "
            f"{format_inline_markdown(dimension['risk_flag'])}",
            styles['Body']))
    flowables.append(Spacer(1, 6))
    return KeepTogether(flowables)


def _verdict_section(verdict, styles):
    """The cross-cutting final verdict block."""
    flowables = [Paragraph('Verdict', styles['Title']), Spacer(1, 6)]

    rows = [
        ['Best business', verdict.get('best_business', '—')],
        ['Most attractively priced', verdict.get('best_priced', '—')],
        ['Same company?', verdict.get('relative_value_setup', '—')],
        ['Preferred pick', verdict.get('preferred_pick', '—')],
        ['Key catalyst (12 mo)', verdict.get('key_catalyst', '—')],
        ['Biggest risk', verdict.get('biggest_risk', '—')],
    ]
    table = Table(rows, colWidths=[5 * cm, 12 * cm])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), PALETTE['primary']),
        ('TEXTCOLOR', (0, 0), (0, -1), white),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('BACKGROUND', (1, 0), (1, -1), PALETTE['tint']),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, PALETTE['border']),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    flowables.append(table)
    return flowables


def create_peer_comparison_pdf(data: dict) -> str:
    output_path = data['output_path']
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
        title=data.get('title', 'Peer Comparison'),
    )
    styles = _styles()
    story = []

    # Header
    story.append(Paragraph(data.get('title', 'Peer Comparison'), styles['Title']))
    story.append(Paragraph(f"{data.get('date', '')}", styles['Sub']))

    # Company strip
    if data.get('companies'):
        story.append(_company_strip(data['companies'], styles))
        story.append(Spacer(1, 10))

    # Executive summary
    if data.get('executive_summary'):
        story.append(Paragraph('Executive Summary', styles['H2']))
        story.append(Paragraph(format_inline_markdown(data['executive_summary']),
                               styles['Body']))
        story.append(Spacer(1, 8))

    # Dimensions
    for dim in data.get('dimensions', []):
        story.append(_dimension_block(dim, data.get('companies', []), styles))

    # Verdict
    story.append(PageBreak())
    if data.get('verdict'):
        story.extend(_verdict_section(data['verdict'], styles))

    # Sources
    if data.get('sources'):
        story.append(Spacer(1, 14))
        story.append(Paragraph('Sources', styles['H2']))
        story.append(Paragraph(format_inline_markdown(data['sources']), styles['Body']))

    story.append(Spacer(1, 8))
    story.append(disclaimer_paragraph(PALETTE))

    doc.build(story)
    return output_path


def get_peer_schema(data: dict) -> dict:
    """Schema return for cross-skill consumption."""
    return {
        'title': data.get('title'),
        'companies': [c.get('name') for c in data.get('companies', [])],
        'verdict': data.get('verdict'),
        'dimension_winners': [
            {'dimension': d.get('name'), 'winner': d.get('winner')}
            for d in data.get('dimensions', [])
        ],
    }


if __name__ == '__main__':
    # Smoke test using STL Tech vs HFCL (the user's pending case)
    sample = {
        'title': 'Telecom Equipment Peer Comparison: STL Tech vs HFCL',
        'date': 'May 2026',
        'companies': [
            {'name': 'STL Tech', 'ticker': 'NSE:STLTECH',
             'cmp': 'Rs 165', 'market_cap_cr': 6800, 'sector': 'Telecom equipment'},
            {'name': 'HFCL', 'ticker': 'NSE:HFCL',
             'cmp': 'Rs 105', 'market_cap_cr': 14500, 'sector': 'Telecom equipment'},
        ],
        'executive_summary': 'Both companies serve telecom infrastructure but with different mixes — STL skews to optical fibre cables while HFCL has a broader portfolio including defence electronics and 5G equipment. This comparison evaluates them on demand, forward earnings, balance sheet, and valuation as of May 2026.',
        'dimensions': [
            {
                'name': 'Dimension 1 — Demand, Order Book, Book-to-Bill',
                'metrics': ['TTM Revenue (Rs Cr)', 'Order Book (Rs Cr)', 'Book-to-Bill', 'Order Book YoY', 'Capacity util %', 'Demand commentary'],
                'values': [
                    ['5,400', '8,200'],
                    ['Awaiting disclosure', '12,300'],
                    ['—', '1.50'],
                    ['—', '+25%'],
                    ['72%', '82%'],
                    ['Soft (export pressure)', 'Robust (5G + defence)'],
                ],
                'winner': 'HFCL',
                'winner_rationale': 'Stronger order book disclosure (Rs 12,300 Cr = 1.5x book-to-bill) and broader exposure to defence electronics where STL has no presence.',
                'risk_flag': 'STL Tech: optical fibre demand reliant on telecom capex cycle.',
            },
            {
                'name': 'Dimension 2 — Forward Earnings Projections',
                'metrics': ['Revenue gd FY27', 'EBITDA margin gd', 'Capex FY26-28 (Rs Cr)', 'Mgmt confidence', 'Consensus FY27 EPS Rs'],
                'values': [
                    ['Single digit', '~9%', '300', 'LOW', '4.5'],
                    ['18-22%', '14-16%', '1,200', 'HIGH', '6.8'],
                ],
                'winner': 'HFCL',
                'winner_rationale': 'Wider growth guidance, higher confidence language, and 4x larger capex programme.',
            },
            {
                'name': 'Dimension 3 — Cash Flow & Balance Sheet Health',
                'metrics': ['3Y CFO/PAT', 'Net debt/EBITDA', 'D/E', 'DSO drift (3Y)', 'Promoter pledge %'],
                'values': [
                    ['0.55', '3.8x', '1.2', '+12 days', '0%'],
                    ['0.82', '0.9x', '0.35', '+3 days', '0%'],
                ],
                'winner': 'HFCL',
                'winner_rationale': 'Materially stronger across all metrics. STL Tech has stretched balance sheet plus rising DSO — concerning combination.',
                'risk_flag': 'STL Tech net debt/EBITDA at 3.8x is in YELLOW-to-RED zone.',
            },
            {
                'name': 'Dimension 4 — Valuation (Relative)',
                'metrics': ['Forward P/E', 'EV/EBITDA', 'P/B', '5Y P/E percentile', 'PEG (forward)'],
                'values': [
                    ['—', '—', '1.5', 'Below 25th (loss-making FY26)', '—'],
                    ['18x', '12x', '3.2', '60th', '0.95'],
                ],
                'winner': 'HFCL',
                'winner_rationale': 'STL Tech valuation is distressed — at 25th percentile partly because of execution issues; HFCL at 60th with a PEG <1 is the cleaner setup.',
            },
        ],
        'verdict': {
            'best_business': 'HFCL — broader portfolio, better balance sheet, executing on multiple growth vectors (5G, defence).',
            'best_priced': 'STL Tech is "cheaper" but for reasons; HFCL at PEG <1 is the cleaner risk/reward.',
            'relative_value_setup': 'Not the same — STL is value-trap risk vs HFCL execution play.',
            'preferred_pick': 'HFCL — overweight on the relative value setup. STL Tech tracking position only until balance sheet improves.',
            'key_catalyst': 'HFCL: defence order wins announcement (any quarter); STL Tech: net debt reduction via asset monetisation or rights issue.',
            'biggest_risk': '5G capex cycle stalling globally would hit both, but STL more severely given its narrower mix.',
        },
        'sources': 'Latest concall transcripts and IPs (Q4 FY25 / Q1-Q3 FY26); Stockscans live data 06-May-2026; Screener.in for valuation; analyst consensus from MoneyControl. **Note: This is a smoke-test sample; actual STL/HFCL run requires fresh document fetch.**',
        'output_path': '/tmp/sample_peer.pdf',
    }
    out = create_peer_comparison_pdf(sample)
    print(f"Generated: {out}")
