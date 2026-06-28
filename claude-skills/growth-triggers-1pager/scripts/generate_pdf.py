"""Growth Triggers 1-Pager PDF generator.

Data-driven (dict schema documented in SKILL.md Phase 3). Palette + generic
table helper sourced from `_shared/pdf_utils.py`.
"""
import sys
from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "_shared"))
from pdf_utils import INSTITUTIONAL_LIGHT as P  # noqa: E402


PAGE_W, PAGE_H = A4
MARGIN = 10 * mm
USABLE = PAGE_W - 2 * MARGIN

S_TITLE = ParagraphStyle('T',  fontName='Helvetica-Bold', fontSize=11, leading=13,
                         textColor=P['primary'], spaceAfter=0.5*mm)
S_SUB   = ParagraphStyle('S',  fontName='Helvetica', fontSize=6.5, leading=8,
                         textColor=P['secondary'], spaceAfter=1.5*mm)
S_SEC   = ParagraphStyle('Sec', fontName='Helvetica-Bold', fontSize=7.5, leading=9, textColor=white)
S_BODY  = ParagraphStyle('B',  fontName='Helvetica', fontSize=6.3, leading=7.8,
                         textColor=P['text'], alignment=TA_JUSTIFY, spaceAfter=0.5*mm)
S_RISK  = ParagraphStyle('R',  fontName='Helvetica', fontSize=6, leading=7.5, textColor=P['text'])
S_FOOT  = ParagraphStyle('F',  fontName='Helvetica', fontSize=5, leading=6.5,
                         textColor=HexColor('#a0aec0'))
S_KPI   = ParagraphStyle('K',  fontName='Helvetica', fontSize=6, leading=7.5,
                         textColor=P['text'], alignment=TA_CENTER)
S_TH    = ParagraphStyle('TH', fontName='Helvetica-Bold', fontSize=5.8, leading=7,
                         textColor=white, alignment=TA_CENTER)
S_TC    = ParagraphStyle('TC', fontName='Helvetica', fontSize=5.8, leading=7,
                         textColor=P['text'], alignment=TA_CENTER)
S_TCL   = ParagraphStyle('TCL', fontName='Helvetica', fontSize=5.8, leading=7, textColor=P['text'])


def _conviction_color(tag):
    t = tag.upper()
    if 'HIGH' in t: return P['good']
    if 'MED'  in t: return P['warn']
    return P['bad']


def _section_header(text):
    t = Table([[Paragraph(text, S_SEC)]], colWidths=[USABLE])
    t.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, -1), P['primary']),
        ('TOPPADDING',    (0, 0), (-1, -1), 1.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
        ('LEFTPADDING',   (0, 0), (-1, -1), 3),
    ]))
    return t


def _trigger_paragraph(num, trig):
    c = _conviction_color(trig['conviction'])
    return Paragraph(
        f'<font color="{P["secondary"].hexval()}"><b>{num}. {trig["name"]}</b></font> '
        f'{trig["body"]} '
        f'<font color="{P["muted"].hexval()}"><b>Impact:</b> {trig["impact"]} '
        f'| <b>Timeline:</b> {trig["timeline"]} | </font>'
        f'<font color="{c.hexval()}"><b>[{trig["conviction"]}]</b></font>',
        ParagraphStyle('trig', fontName='Helvetica', fontSize=6, leading=7.6,
                       textColor=P['text'], alignment=TA_JUSTIFY, spaceAfter=1.2*mm),
    )


def _banded_table(data, col_widths, *, header_bg=None, font_size=5.8, padding=1.2):
    """1-pager tables: custom bands (LIGHT_BLUE / LIGHT_GRAY) vs shared alternating row."""
    header_bg = header_bg or P['primary']
    t = Table(data, colWidths=col_widths)
    cmds = [
        ('BACKGROUND',    (0, 0), (-1, 0), header_bg),
        ('GRID',          (0, 0), (-1, -1), 0.3, P['border']),
        ('TOPPADDING',    (0, 0), (-1, -1), padding),
        ('BOTTOMPADDING', (0, 0), (-1, -1), padding),
        ('LEFTPADDING',   (0, 0), (-1, -1), 2),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 2),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTSIZE',      (0, 0), (-1, -1), font_size),
    ]
    bands = [P['tint'], P['surface']]
    for i in range(1, len(data)):
        cmds.append(('BACKGROUND', (0, i), (-1, i), bands[(i - 1) % 2]))
    t.setStyle(TableStyle(cmds))
    return t


def _kpi_table(headers, values):
    n = len(headers)
    data = [
        [Paragraph(f'<b>{h}</b>', S_KPI) for h in headers],
        [Paragraph(v, S_KPI) for v in values],
    ]
    t = Table(data, colWidths=[USABLE / n] * n)
    t.setStyle(TableStyle([
        ('BACKGROUND',    (0, 0), (-1, 0), P['tint']),
        ('BACKGROUND',    (0, 1), (-1, 1), P['surface']),
        ('GRID',          (0, 0), (-1, -1), 0.3, P['border']),
        ('TOPPADDING',    (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('LEFTPADDING',   (0, 0), (-1, -1), 1.5),
        ('RIGHTPADDING',  (0, 0), (-1, -1), 1.5),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return t


def _scoreboard_table(rows):
    header = [Paragraph(f'<b>{h}</b>', S_TH) for h in
              ['#', 'Trigger', 'Revenue / Earnings Impact', 'Timeline', 'Conviction']]
    data = [header]
    for num, name, impact, timeline, conv in rows:
        c = _conviction_color(conv)
        data.append([
            Paragraph(str(num), S_TC),
            Paragraph(name, S_TCL),
            Paragraph(impact, S_TCL),
            Paragraph(timeline, S_TC),
            Paragraph(f'<font color="{c.hexval()}"><b>{conv}</b></font>', S_TC),
        ])
    col_widths = [USABLE * w for w in (0.04, 0.24, 0.32, 0.15, 0.25)]
    return _banded_table(data, col_widths)


def create_growth_triggers_pdf(data):
    """Generate a 1-page growth triggers PDF. See SKILL.md Phase 3 for data schema."""
    output_path = data.get('output_path', '/mnt/user-data/outputs/Growth_Triggers.pdf')

    doc = SimpleDocTemplate(output_path, pagesize=A4,
                            leftMargin=MARGIN, rightMargin=MARGIN,
                            topMargin=8*mm, bottomMargin=6*mm)

    story = [
        Paragraph(f"{data['company_name']} ({data['ticker']}) — Growth Triggers 1-Pager", S_TITLE),
        Paragraph(
            f"Institutional Equity | {data['date']} | CMP {data['cmp']} | "
            f"Mkt Cap {data['market_cap']} | {data['cap_category']} | "
            f"Sector: {data['sector']}", S_SUB),

        _section_header("1  COMPANY SNAPSHOT"),
        Spacer(1, 0.8*mm),
        Paragraph(data['snapshot'], S_BODY),
        _kpi_table(data['kpi_headers'], data['kpi_values']),
        Spacer(1, 1*mm),

        _section_header("2  CORE GROWTH TRIGGERS"),
        Spacer(1, 0.8*mm),
    ]
    for i, trig in enumerate(data['triggers'], 1):
        story.append(_trigger_paragraph(i, trig))

    story += [
        _section_header("3  WHAT'S IN THE PRICE? / INCREMENTAL SURPRISE"),
        Spacer(1, 0.5*mm),
        Paragraph(data['in_the_price'], S_BODY),
        _section_header("4  KEY RISKS"),
        Spacer(1, 0.5*mm),
    ]
    story += [Paragraph(f"\u2022 {r}", S_RISK) for r in data['risks']]

    story += [
        Spacer(1, 0.3*mm),
        _section_header("5  TRIGGER SCOREBOARD"),
        Spacer(1, 0.5*mm),
        _scoreboard_table(data['scoreboard']),
        Spacer(1, 1.5*mm),
        Paragraph(data.get('sources', 'Not investment advice.'), S_FOOT),
    ]

    doc.build(story)

    from pypdf import PdfReader
    pages = len(PdfReader(output_path).pages)
    if pages > 1:
        print(f"WARNING: PDF is {pages} pages. Target is 1 page. "
              f"Reduce trigger body text or remove one trigger.")
    else:
        print(f"PDF generated successfully: {output_path} ({pages} page)")
    return output_path


if __name__ == '__main__':
    example = {
        "company_name": "EXAMPLE CORP LTD",
        "ticker": "NSE: EXAMPLE",
        "date": "April 2026",
        "cmp": "~Rs 500",
        "market_cap": "~Rs 5,000 Cr",
        "cap_category": "Mid Cap",
        "sector": "Capital Goods",
        "snapshot": ("<b>Business:</b> Example Corp manufactures widgets. "
                     "Promoter holding <b>55%</b>. Zero debt, 30%+ ROE."),
        "kpi_headers": ["FY26 Rev", "FY26 PAT", "EBITDA Mgn", "ROE", "ROCE", "Debt", "PE (TTM)", "Div Yield"],
        "kpi_values": ["Rs 2,000 Cr", "Rs 200 Cr", "15%", "32%", "40%", "Zero", "25x", "2.5%"],
        "triggers": [
            {"name": "New Gujarat capacity", "body": "50,000 MT plant live Q3 FY26.",
             "impact": "+Rs 800 Cr revenue at full utilization",
             "timeline": "FY27-28", "conviction": "HIGH CONVICTION"},
        ],
        "in_the_price": "At 25x PE, market prices 18% earnings CAGR.",
        "risks": ["<b>Execution risk:</b> plant ramp-up."],
        "scoreboard": [[1, "Gujarat capacity", "+Rs 800 Cr", "FY27-28", "HIGH"]],
        "sources": "Not investment advice.",
        "output_path": "/tmp/example_growth_triggers.pdf",
    }
    create_growth_triggers_pdf(example)
