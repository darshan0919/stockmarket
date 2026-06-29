"""Concall Analysis PDF Generator.

Renders concall analysis output as an institutional-grade PDF in 4 modes:
  - deep (12 sections, 6-8 pages)
  - brief (9 sections, 2-3 pages)
  - multi-quarter (4-5 pages with theme/promise/dropped-topic tables)
  - multi-peer (3-4 pages with side-by-side peer tables)

Schema is mode-dependent — see docstring of `create_concall_pdf` below.
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
        'Quote': ParagraphStyle('QuoteX', parent=base['Normal'],
                                fontName='Helvetica-Oblique', fontSize=8, leading=10,
                                textColor=PALETTE['muted'], leftIndent=12,
                                rightIndent=8, spaceBefore=2, spaceAfter=4),
        'TonePill': ParagraphStyle('TonePill', parent=base['Normal'],
                                   fontName='Helvetica-Bold', fontSize=11, leading=14,
                                   alignment=1),  # centered
    }


def _tone_box(tone, palette, styles):
    color_map = {
        'BULLISH': palette['good'], 'POSITIVE': palette['good'],
        'NEUTRAL': palette['secondary'],
        'CAUTIOUS': palette['warn'], 'DEFENSIVE': palette['warn'],
        'NEGATIVE': palette['bad'],
    }
    c = color_map.get(tone.upper().strip(), palette['muted']) if tone else palette['muted']
    para = Paragraph(
        f'<font color="{white.hexval()}"><b>{tone or "—"}</b></font>',
        styles['TonePill'],
    )
    box = Table([[para]], colWidths=[4 * cm])
    box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), c),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return box


def _guidance_table(rows):
    headers = ['Metric', 'Guidance', 'Timeline', 'Confidence', 'Source quote']
    data = [headers]
    for r in rows:
        data.append([
            r.get('metric', ''),
            r.get('guidance', ''),
            r.get('timeline', ''),
            flag_label(r.get('confidence', '')),
            (r.get('source_quote', '') or '')[:70],
        ])
    table = styled_table(
        data,
        col_widths=[3.5 * cm, 3.0 * cm, 2.0 * cm, 1.8 * cm, 6.7 * cm],
        palette=PALETTE,
        font_size=7,
        padding=2,
    )
    for i, r in enumerate(rows, start=1):
        c = flag_color(r.get('confidence', ''), PALETTE)
        table.setStyle([
            ('BACKGROUND', (3, i), (3, i), c),
            ('TEXTCOLOR', (3, i), (3, i), white),
            ('FONTNAME', (3, i), (3, i), 'Helvetica-Bold'),
            ('ALIGN', (3, i), (3, i), 'CENTER'),
        ])
    return table


def _qa_table(rows):
    headers = ['Analyst', 'Question (paraphrase)', 'Answered?', 'Note']
    data = [headers]
    for r in rows:
        data.append([
            f"{r.get('analyst', '')}\n{r.get('firm', '')}",
            (r.get('question', '') or '')[:80],
            flag_label(r.get('status', '')),
            (r.get('note', '') or '')[:50],
        ])
    table = styled_table(
        data,
        col_widths=[3.0 * cm, 7.5 * cm, 2.0 * cm, 4.5 * cm],
        palette=PALETTE,
        font_size=7,
        padding=2,
    )
    for i, r in enumerate(rows, start=1):
        s = r.get('status', '').upper().strip()
        if s in ('YES', 'ANSWERED'):
            c = PALETTE['good']
        elif s in ('PARTIAL',):
            c = PALETTE['warn']
        elif s in ('DODGED', 'NO'):
            c = PALETTE['bad']
        else:
            c = PALETTE['muted']
        table.setStyle([
            ('BACKGROUND', (2, i), (2, i), c),
            ('TEXTCOLOR', (2, i), (2, i), white),
            ('FONTNAME', (2, i), (2, i), 'Helvetica-Bold'),
            ('ALIGN', (2, i), (2, i), 'CENTER'),
        ])
    return table


def _theme_tracker_table(themes, quarters):
    headers = ['Theme'] + quarters + ['Trend']
    data = [headers]
    for t in themes:
        row = [t.get('theme', '')]
        for q in quarters:
            row.append((t.get('stances', {}).get(q, '') or '')[:30])
        row.append(flag_label(t.get('trend', '')))
        data.append(row)
    n_q = len(quarters)
    col_w = [3.5 * cm] + [(13.5 / n_q) * cm] * n_q + [2.5 * cm]
    return styled_table(data, col_widths=col_w, palette=PALETTE,
                        font_size=7, padding=2)


def _peer_compare_table(headers, rows):
    """Generic peer-comparison table for multi-peer mode (Tables 1-4 of multi_peer.md)."""
    data = [headers] + rows
    n_cols = len(headers)
    col_w = [(19 / n_cols) * cm] * n_cols
    return styled_table(data, col_widths=col_w, palette=PALETTE,
                        font_size=7, padding=2)


# --- Mode renderers ----------------------------------------------------------

def _render_deep(data, styles):
    story = []
    # Tone box
    tone = (data.get('tone_analysis') or {}).get('overall', '—')
    story.append(_tone_box(tone, PALETTE, styles))
    story.append(Spacer(1, 8))

    # Executive summary
    if data.get('executive_summary'):
        story.append(Paragraph('§1 Executive Summary', styles['H2']))
        story.append(Paragraph(format_inline_markdown(data['executive_summary']),
                               styles['Body']))

    # Guidance table (§4 — high-priority on page 1)
    if data.get('guidance_table'):
        story.append(Paragraph('§4 Forward Guidance', styles['H2']))
        story.append(_guidance_table(data['guidance_table']))

    # Sections 2,3,5,6,7
    for section in data.get('sections', []):
        story.append(Paragraph(section.get('title', ''), styles['H2']))
        story.append(Paragraph(format_inline_markdown(section.get('body', '')),
                               styles['Body']))
        for q in section.get('quotes', []) or []:
            story.append(Paragraph(f'"{q}"', styles['Quote']))

    # Q&A (§8 — the goldmine)
    if data.get('dodged_questions') or data.get('qa_table'):
        story.append(PageBreak())
        story.append(Paragraph('§8 Analyst Q&A', styles['H2']))
        if data.get('qa_table'):
            story.append(_qa_table(data['qa_table']))

    # Quantitative data table (§9)
    if data.get('quant_table'):
        story.append(Spacer(1, 8))
        story.append(Paragraph('§9 Quantitative Data', styles['H2']))
        headers = ['Metric', 'Value', 'Source', 'Significance']
        rows = [headers]
        for r in data['quant_table']:
            rows.append([
                r.get('metric', ''), r.get('value', ''),
                r.get('source', ''), r.get('significance', ''),
            ])
        story.append(styled_table(
            rows, col_widths=[4 * cm, 3 * cm, 4 * cm, 8 * cm],
            palette=PALETTE, font_size=7, padding=2,
        ))

    # Connecting the dots
    if data.get('connecting_dots'):
        story.append(Spacer(1, 8))
        story.append(Paragraph('§11 Connecting the Dots', styles['H2']))
        story.append(Paragraph(format_inline_markdown(data['connecting_dots']),
                               styles['Body']))

    # Analysts on call
    if data.get('analysts_on_call'):
        story.append(Spacer(1, 6))
        story.append(Paragraph('§12 Analysts on Call', styles['H2']))
        analyst_text = ', '.join(
            f"{a.get('name', '')} ({a.get('firm', '')})"
            for a in data['analysts_on_call']
        )
        story.append(Paragraph(analyst_text, styles['Body']))

    return story


def _render_brief(data, styles):
    story = []
    tone = (data.get('tone_analysis') or {}).get('overall', '—')
    story.append(_tone_box(tone, PALETTE, styles))
    story.append(Spacer(1, 6))

    section_titles = [
        '§1 Management Commentary',
        '§2 Future Outlook & Guidance',
        '§3 Industry & Macro Trends',
        '§4 Competitive Landscape',
        '§5 Risks & Concerns',
        '§6 Growth Drivers & Strategic Initiatives',
        '§7 Product Mix & Portfolio',
        '§8 Financial Highlights',
        '§9 Sentiment Analysis',
    ]
    for i, title in enumerate(section_titles):
        body = (data.get('sections', []) or [])[i] if i < len(data.get('sections', [])) else None
        if not body:
            continue
        story.append(Paragraph(title, styles['H2']))
        if isinstance(body, dict):
            story.append(Paragraph(format_inline_markdown(body.get('body', '') or ''),
                                   styles['Body']))
        else:
            story.append(Paragraph(format_inline_markdown(str(body)), styles['Body']))
    return story


def _render_multi_quarter(data, styles):
    story = []
    quarters = data.get('quarters', [])
    if data.get('executive_summary'):
        story.append(Paragraph('Executive Summary', styles['H2']))
        story.append(Paragraph(format_inline_markdown(data['executive_summary']),
                               styles['Body']))

    if data.get('themes'):
        story.append(Paragraph('Theme Tracker', styles['H2']))
        story.append(_theme_tracker_table(data['themes'], quarters))

    if data.get('promises'):
        story.append(Spacer(1, 8))
        story.append(Paragraph('Promises Made & Outcomes', styles['H2']))
        headers = ['Quarter', 'Promise', 'Due / Outcome', 'Status']
        rows = [headers]
        for p in data['promises']:
            rows.append([
                p.get('quarter', ''),
                (p.get('promise', '') or '')[:60],
                (p.get('outcome', '') or '')[:50],
                flag_label(p.get('status', '')),
            ])
        table = styled_table(
            rows, col_widths=[2.5 * cm, 7.5 * cm, 5 * cm, 2 * cm],
            palette=PALETTE, font_size=7, padding=2,
        )
        for i, p in enumerate(data['promises'], start=1):
            s = p.get('status', '').upper().strip()
            if s in ('DELIVERED', 'ON TRACK', 'BEAT', '+1'):
                c = PALETTE['good']
            elif s in ('MISSING', 'TOO EARLY'):
                c = PALETTE['warn']
            elif s in ('MISSED', '-1'):
                c = PALETTE['bad']
            else:
                c = PALETTE['muted']
            table.setStyle([
                ('BACKGROUND', (3, i), (3, i), c),
                ('TEXTCOLOR', (3, i), (3, i), white),
                ('FONTNAME', (3, i), (3, i), 'Helvetica-Bold'),
                ('ALIGN', (3, i), (3, i), 'CENTER'),
            ])
        story.append(table)

    if data.get('dropped_topics'):
        story.append(Spacer(1, 8))
        story.append(Paragraph('Topics Dropped or Muted', styles['H2']))
        headers = ['Topic', 'First mentioned', 'Last mentioned', 'Reason given']
        rows = [headers]
        for t in data['dropped_topics']:
            rows.append([
                t.get('topic', ''), t.get('first', ''),
                t.get('last', ''), (t.get('reason', '') or '—')[:40],
            ])
        story.append(styled_table(
            rows, col_widths=[5 * cm, 3 * cm, 3 * cm, 6 * cm],
            palette=PALETTE, font_size=7, padding=2,
        ))

    if data.get('confidence_counter'):
        story.append(Spacer(1, 8))
        story.append(Paragraph('Confidence-Language Counter', styles['H2']))
        headers = ['Quarter', '"We will"', '"Target is"', '"We expect"', '"Likely to"', '"May" / "Aspire"']
        rows = [headers]
        for c in data['confidence_counter']:
            rows.append([
                c.get('quarter', ''),
                str(c.get('we_will', '')),
                str(c.get('target_is', '')),
                str(c.get('we_expect', '')),
                str(c.get('likely_to', '')),
                str(c.get('may_aspire', '')),
            ])
        story.append(styled_table(
            rows, col_widths=[2.5 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm, 4.5 * cm],
            palette=PALETTE, font_size=7, padding=2,
        ))
    return story


def _render_multi_peer(data, styles):
    story = []
    if data.get('executive_summary'):
        story.append(Paragraph('Sector Summary', styles['H2']))
        story.append(Paragraph(format_inline_markdown(data['executive_summary']),
                               styles['Body']))

    for tbl in data.get('comparison_tables', []) or []:
        story.append(Spacer(1, 8))
        story.append(Paragraph(tbl.get('title', 'Comparison'), styles['H2']))
        story.append(_peer_compare_table(tbl.get('headers', []), tbl.get('rows', [])))

    if data.get('synthesis'):
        story.append(Spacer(1, 10))
        story.append(Paragraph('Synthesis', styles['H2']))
        for para in data['synthesis']:
            story.append(Paragraph(format_inline_markdown(para), styles['Body']))
    return story


# --- Main entry point --------------------------------------------------------

def create_concall_pdf(data: dict) -> str:
    """Generate the concall analysis PDF and return the output path.

    Required keys:
      - mode: 'deep' | 'brief' | 'multi-quarter' | 'multi-peer'
      - company_name (single-company modes) OR sector (multi-peer)
      - ticker / tickers
      - quarter (deep/brief) OR quarters (multi-quarter) OR peers (multi-peer)
      - output_path
    Optional keys: tone_analysis, executive_summary, sections, guidance_table,
      qa_table, quant_table, connecting_dots, analysts_on_call (deep);
      themes, promises, dropped_topics, confidence_counter (multi-quarter);
      comparison_tables, synthesis (multi-peer).
    """
    output_path = data['output_path']
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    mode = data.get('mode', 'brief')

    title_label = {
        'deep': f"{data.get('company_name', '')} — Concall Deep Dive",
        'brief': f"{data.get('company_name', '')} — Concall Brief",
        'multi-quarter': f"{data.get('company_name', '')} — Multi-Quarter Concall Tracker",
        'multi-peer': f"{data.get('sector', 'Sector')} — Peer Concall Comparison",
    }[mode]

    sub_label = ''
    if mode in ('deep', 'brief'):
        sub_label = f"{data.get('ticker', '')} • {data.get('quarter', '')} • {data.get('date', '')}"
    elif mode == 'multi-quarter':
        qs = data.get('quarters', [])
        if qs:
            sub_label = f"{data.get('ticker', '')} • {qs[0]}–{qs[-1]} • {data.get('date', '')}"
    elif mode == 'multi-peer':
        sub_label = f"{data.get('quarter', '')} • {len(data.get('peers', []))} companies • {data.get('date', '')}"

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
        title=title_label,
    )
    styles = _styles()
    story = [Paragraph(title_label, styles['Title']), Paragraph(sub_label, styles['Sub'])]

    # KPI strip if present
    if data.get('kpi_headers'):
        col_w = [(17 / len(data['kpi_headers'])) * cm] * len(data['kpi_headers'])
        story.append(kpi_table(data['kpi_headers'], data['kpi_values'], col_w, PALETTE))
        story.append(Spacer(1, 8))

    # Mode-specific body
    if mode == 'deep':
        story.extend(_render_deep(data, styles))
    elif mode == 'brief':
        story.extend(_render_brief(data, styles))
    elif mode == 'multi-quarter':
        story.extend(_render_multi_quarter(data, styles))
    elif mode == 'multi-peer':
        story.extend(_render_multi_peer(data, styles))
    else:
        story.append(Paragraph(f"Unknown mode: {mode}", styles['Body']))

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
        'mode': 'brief',
        'company_name': 'Sample Industries',
        'ticker': 'NSE:SAMPLE',
        'quarter': 'Q3 FY26',
        'date': 'May 2026',
        'tone_analysis': {'overall': 'Cautious'},
        'sections': [
            {'body': 'Management acknowledged demand softness in Western India.'},
            {'body': '• FY27 revenue: 12-15% guidance (narrowed from 15-18% prior call)\n'
                     '• EBITDA margin: 17-18% target maintained'},
            {'body': 'Industry growth slowing to single digits; pricing pressure from Chinese imports.'},
            {'body': 'Lost 1 large customer to competitor; said to be price-driven.'},
            {'body': 'Raw material volatility flagged for the third consecutive quarter.'},
            {'body': 'Capex of Rs 250 Cr for new plant approved; commissioning Q2 FY27.'},
            {'body': 'Premium products grew 28% YoY; mass-market segment flat.'},
            {'body': 'Q3 revenue Rs 1,234 Cr (+12% YoY); EBITDA Rs 192 Cr; PAT Rs 145 Cr.'},
            {'body': 'Tone: cautious. Confidence: moderate. Notable shift from Q2 call which was bullish.'},
        ],
        'sources': 'Q3 FY26 Concall Transcript; accessed via Stockscans 06-May-2026.',
        'output_path': '/tmp/sample_concall.pdf',
    }
    out = create_concall_pdf(sample)
    print(f"Generated: {out}")
