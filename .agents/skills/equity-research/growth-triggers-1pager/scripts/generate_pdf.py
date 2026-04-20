"""
Growth Triggers 1-Pager PDF Generator
======================================
Reusable template for generating institutional-quality growth triggers PDFs.

Usage:
    from generate_pdf import create_growth_triggers_pdf
    create_growth_triggers_pdf(data_dict)

The data_dict schema is documented in SKILL.md Phase 3.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY

# ── Color Palette ──
DARK_BLUE   = HexColor('#1a365d')
MED_BLUE    = HexColor('#2b6cb0')
LIGHT_BLUE  = HexColor('#ebf8ff')
ACCENT_GREEN  = HexColor('#276749')
ACCENT_ORANGE = HexColor('#c05621')
ACCENT_RED    = HexColor('#9b2c2c')
LIGHT_GRAY  = HexColor('#f7fafc')
MED_GRAY    = HexColor('#e2e8f0')
TEXT_COLOR   = HexColor('#1a202c')
MUTED_TEXT   = HexColor('#4a5568')

# ── Page Geometry ──
PAGE_W, PAGE_H = A4
MARGIN = 10 * mm
USABLE = PAGE_W - 2 * MARGIN

# ── Styles ──
S_TITLE = ParagraphStyle('T', fontName='Helvetica-Bold', fontSize=11, leading=13,
                          textColor=DARK_BLUE, spaceAfter=0.5*mm)
S_SUB   = ParagraphStyle('S', fontName='Helvetica', fontSize=6.5, leading=8,
                          textColor=MED_BLUE, spaceAfter=1.5*mm)
S_SEC   = ParagraphStyle('Sec', fontName='Helvetica-Bold', fontSize=7.5, leading=9,
                          textColor=white)
S_BODY  = ParagraphStyle('B', fontName='Helvetica', fontSize=6.3, leading=7.8,
                          textColor=TEXT_COLOR, alignment=TA_JUSTIFY, spaceAfter=0.5*mm)
S_RISK  = ParagraphStyle('R', fontName='Helvetica', fontSize=6, leading=7.5,
                          textColor=TEXT_COLOR)
S_FOOT  = ParagraphStyle('F', fontName='Helvetica', fontSize=5, leading=6.5,
                          textColor=HexColor('#a0aec0'))
S_KPI   = ParagraphStyle('K', fontName='Helvetica', fontSize=6, leading=7.5,
                          textColor=TEXT_COLOR, alignment=TA_CENTER)
S_TH    = ParagraphStyle('TH', fontName='Helvetica-Bold', fontSize=5.8, leading=7,
                          textColor=white, alignment=TA_CENTER)
S_TC    = ParagraphStyle('TC', fontName='Helvetica', fontSize=5.8, leading=7,
                          textColor=TEXT_COLOR, alignment=TA_CENTER)
S_TCL   = ParagraphStyle('TCL', fontName='Helvetica', fontSize=5.8, leading=7,
                          textColor=TEXT_COLOR)


def _section_header(text):
    """Dark blue banner with white text."""
    t = Table([[Paragraph(text, S_SEC)]], colWidths=[USABLE])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), DARK_BLUE),
        ('TOPPADDING', (0, 0), (-1, -1), 1.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
    ]))
    return t


def _conviction_color(tag):
    tag_upper = tag.upper()
    if 'HIGH' in tag_upper:
        return ACCENT_GREEN
    elif 'MED' in tag_upper:
        return ACCENT_ORANGE
    return ACCENT_RED


def _trigger_paragraph(num, trig):
    """Render a single trigger as one compact paragraph."""
    c = _conviction_color(trig['conviction'])
    return Paragraph(
        f'<font color="{MED_BLUE.hexval()}"><b>{num}. {trig["name"]}</b></font> '
        f'{trig["body"]} '
        f'<font color="{MUTED_TEXT.hexval()}"><b>Impact:</b> {trig["impact"]} '
        f'| <b>Timeline:</b> {trig["timeline"]} | </font>'
        f'<font color="{c.hexval()}"><b>[{trig["conviction"]}]</b></font>',
        ParagraphStyle('trig', fontName='Helvetica', fontSize=6, leading=7.6,
                       textColor=TEXT_COLOR, alignment=TA_JUSTIFY, spaceAfter=1.2*mm)
    )


def _kpi_table(headers, values):
    """KPI bar with 8 columns."""
    n = len(headers)
    rows = [
        [Paragraph(f'<b>{h}</b>', S_KPI) for h in headers],
        [Paragraph(v, S_KPI) for v in values],
    ]
    t = Table(rows, colWidths=[USABLE / n] * n)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), LIGHT_BLUE),
        ('BACKGROUND', (0, 1), (-1, 1), LIGHT_GRAY),
        ('GRID', (0, 0), (-1, -1), 0.3, MED_GRAY),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('LEFTPADDING', (0, 0), (-1, -1), 1.5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 1.5),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return t


def _scoreboard_table(rows):
    """Summary scoreboard with conviction color-coding."""
    header = [Paragraph(f'<b>{h}</b>', S_TH)
              for h in ['#', 'Trigger', 'Revenue / Earnings Impact', 'Timeline', 'Conviction']]

    table_rows = [header]
    for r in rows:
        num, name, impact, timeline, conv = r
        c = _conviction_color(conv)
        table_rows.append([
            Paragraph(str(num), S_TC),
            Paragraph(name, S_TCL),
            Paragraph(impact, S_TCL),
            Paragraph(timeline, S_TC),
            Paragraph(f'<font color="{c.hexval()}"><b>{conv}</b></font>', S_TC),
        ])

    t = Table(table_rows,
              colWidths=[USABLE * 0.04, USABLE * 0.24, USABLE * 0.32, USABLE * 0.15, USABLE * 0.25])

    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), DARK_BLUE),
        ('GRID', (0, 0), (-1, -1), 0.3, MED_GRAY),
        ('TOPPADDING', (0, 0), (-1, -1), 1.2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.2),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]
    colors = [LIGHT_BLUE, LIGHT_GRAY]
    for i in range(1, len(table_rows)):
        style_cmds.append(('BACKGROUND', (0, i), (-1, i), colors[(i - 1) % 2]))
    t.setStyle(TableStyle(style_cmds))
    return t


def create_growth_triggers_pdf(data):
    """
    Generate a 1-page growth triggers PDF.

    Parameters
    ----------
    data : dict with keys:
        company_name, ticker, date, cmp, market_cap, cap_category, sector,
        snapshot, kpi_headers, kpi_values, triggers (list of dicts),
        in_the_price, risks (list of strings), scoreboard (list of lists),
        sources, output_path
    """
    output_path = data.get('output_path', '/mnt/user-data/outputs/Growth_Triggers.pdf')

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=8*mm, bottomMargin=6*mm,
    )

    story = []

    # ── Title ──
    story.append(Paragraph(
        f"{data['company_name']} ({data['ticker']}) — Growth Triggers 1-Pager", S_TITLE))
    story.append(Paragraph(
        f"Institutional Equity | {data['date']} | CMP {data['cmp']} | "
        f"Mkt Cap {data['market_cap']} | {data['cap_category']} | "
        f"Sector: {data['sector']}", S_SUB))

    # ── Section 1: Snapshot ──
    story.append(_section_header("1  COMPANY SNAPSHOT"))
    story.append(Spacer(1, 0.8*mm))
    story.append(Paragraph(data['snapshot'], S_BODY))
    story.append(_kpi_table(data['kpi_headers'], data['kpi_values']))
    story.append(Spacer(1, 1*mm))

    # ── Section 2: Triggers ──
    story.append(_section_header("2  CORE GROWTH TRIGGERS"))
    story.append(Spacer(1, 0.8*mm))
    for i, trig in enumerate(data['triggers'], 1):
        story.append(_trigger_paragraph(i, trig))

    # ── Section 3: What's in the price ──
    story.append(_section_header("3  WHAT'S IN THE PRICE? / INCREMENTAL SURPRISE"))
    story.append(Spacer(1, 0.5*mm))
    story.append(Paragraph(data['in_the_price'], S_BODY))

    # ── Section 4: Key Risks ──
    story.append(_section_header("4  KEY RISKS"))
    story.append(Spacer(1, 0.5*mm))
    for r in data['risks']:
        story.append(Paragraph(f"\u2022 {r}", S_RISK))

    # ── Section 5: Scoreboard ──
    story.append(Spacer(1, 0.3*mm))
    story.append(_section_header("5  TRIGGER SCOREBOARD"))
    story.append(Spacer(1, 0.5*mm))
    story.append(_scoreboard_table(data['scoreboard']))
    story.append(Spacer(1, 1.5*mm))

    # ── Footer ──
    story.append(Paragraph(data.get('sources', 'Not investment advice.'), S_FOOT))

    # ── Build ──
    doc.build(story)

    # ── Verify page count ──
    from pypdf import PdfReader
    reader = PdfReader(output_path)
    page_count = len(reader.pages)
    if page_count > 1:
        print(f"WARNING: PDF is {page_count} pages. Target is 1 page. "
              f"Reduce trigger body text or remove one trigger.")
    else:
        print(f"PDF generated successfully: {output_path} ({page_count} page)")
    return output_path


if __name__ == '__main__':
    # Example / test usage with placeholder data
    example_data = {
        "company_name": "EXAMPLE CORP LTD",
        "ticker": "NSE: EXAMPLE",
        "date": "April 2026",
        "cmp": "~Rs 500",
        "market_cap": "~Rs 5,000 Cr",
        "cap_category": "Mid Cap",
        "sector": "Capital Goods",
        "snapshot": (
            "<b>Business:</b> Example Corp manufactures widgets for the Indian industrial sector. "
            "Promoter holding <b>55%</b> (stable). Zero debt, 30%+ ROE."
        ),
        "kpi_headers": ["FY26 Rev", "FY26 PAT", "EBITDA Mgn", "ROE", "ROCE", "Debt", "PE (TTM)", "Div Yield"],
        "kpi_values": ["Rs 2,000 Cr", "Rs 200 Cr", "15%", "32%", "40%", "Zero", "25x", "2.5%"],
        "triggers": [
            {
                "name": "New Capacity Commissioned in Gujarat",
                "body": "Greenfield plant with <b>50,000 MT</b> capacity commissioned Q3 FY26. "
                        "Ramp-up to 70% utilization by FY27.",
                "impact": "+Rs 800 Cr revenue at full utilization",
                "timeline": "FY27-28",
                "conviction": "HIGH CONVICTION"
            },
            {
                "name": "PLI Scheme Incentive — Tranche 2 Approval",
                "body": "Approved under PLI for advanced chemistry. Incentive of 8% on incremental "
                        "sales over 5 years. First disbursement expected H2 FY27.",
                "impact": "+Rs 50-80 Cr annual incentive income",
                "timeline": "H2 FY27 onwards",
                "conviction": "HIGH CONVICTION"
            },
            {
                "name": "Export Market Entry — Europe & Middle East",
                "body": "Secured first export orders worth <b>Rs 120 Cr</b> from European OEMs. "
                        "Management targets 15% revenue from exports by FY29.",
                "impact": "+Rs 300 Cr export revenue by FY29",
                "timeline": "FY27-29",
                "conviction": "MEDIUM CONVICTION"
            },
        ],
        "in_the_price": (
            "At 25x PE, market prices 18% earnings CAGR. Gujarat capacity is partially discounted. "
            "<b>NOT in consensus:</b> PLI tranche disbursement timing and export order pipeline."
        ),
        "risks": [
            "<b>Execution risk:</b> Gujarat plant ramp-up slower than guided. Mitigant: similar ramp achieved at existing plant.",
            "<b>Commodity risk:</b> Steel prices up 15% could compress margins 200 bps.",
            "<b>Export concentration:</b> Single European OEM = 60% of export pipeline.",
        ],
        "scoreboard": [
            [1, "Gujarat capacity ramp", "+Rs 800 Cr revenue", "FY27-28", "HIGH"],
            [2, "PLI incentive", "+Rs 50-80 Cr/yr", "H2 FY27+", "HIGH"],
            [3, "Export entry", "+Rs 300 Cr by FY29", "FY27-29", "MEDIUM"],
        ],
        "sources": "Example sources. Not investment advice.",
        "output_path": "/tmp/example_growth_triggers.pdf"
    }
    create_growth_triggers_pdf(example_data)