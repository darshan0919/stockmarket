---
name: equity-research-deepdive
description: >
  Use this skill whenever the user wants a detailed equity research report, investment memo,
  fundamental analysis, stock deep-dive, or institutional-grade company analysis. Trigger when
  the user mentions "deep dive", "research report", "investment memo", "fundamental analysis",
  "equity research", "stock analysis", "detailed analysis", "company analysis", or asks for a
  comprehensive research report on any listed company. Also trigger when the user provides a
  Screener.in link, Stockscans link, Trendlyne link, or Tickertape link and asks for a detailed
  analysis or research report (NOT a 1-pager or growth triggers doc — those go to
  growth-triggers-1pager). This skill produces a multi-page, institutional-quality PDF report
  covering business model, competitive positioning, financials, management quality, valuation,
  scenario analysis, and investment verdict. Use this skill even when the user simply says
  "analyze this company" or "tell me everything about [company]" or "should I invest in [stock]".
---

# Equity Research Deep Dive — Institutional Investment Memo Skill

Produce a comprehensive, multi-page, institutional-grade equity research PDF for any listed
company. The output should read like a detailed investment memo from a top-tier research house
(Kotak Institutional, Motilal Oswal, Jefferies) — the kind a fund manager reads before
allocating capital.

---

## When to Use

- User asks for a "research report", "deep dive", "detailed analysis", "investment memo"
- User provides a stock ticker / Screener.in link / annual reports and wants comprehensive analysis
- User says "analyze this company", "should I invest", "tell me everything about"
- User uploads annual reports, concall transcripts, investor presentations and wants full analysis
- **NOT** for 1-pager / growth triggers / catalyst notes (those use growth-triggers-1pager skill)

---

## Workflow — 4 Phases

### Phase 1: Research & Data Gathering (CRITICAL — spend time here)

The quality of the report is 100% dependent on the depth of research. Run ALL of the following.

**A. Uploaded Documents (if any)**
Extract text from uploaded PDFs:
```bash
pdftotext -f 1 -l 999 /mnt/user-data/uploads/<file>.pdf /home/claude/doc_text.txt
```
Then grep for key sections and read them with `sed -n`.

**B. Web Research (ALWAYS do this, even with uploaded docs)**
Run these web searches systematically — adapt company name and sector:

1. `<Company> business overview products segments` — understand the business
2. `<Company> latest quarterly results revenue profit FY26` — recent financials
3. `<Company> annual report FY25 FY26 revenue EBITDA PAT` — annual financials
4. `<Company> management team promoter background` — management quality
5. `<Company> competitors peer comparison industry` — competitive landscape
6. `<Company> capacity expansion capex growth plans` — future growth
7. `<Company> concall transcript latest quarter` — management commentary
8. `<Company> shareholding pattern FII DII mutual fund` — institutional interest
9. `<Company> risks challenges concerns` — bear case
10. `<Company> valuation PE EV/EBITDA historical` — valuation context
11. `<Industry> market size India growth rate TAM` — industry context
12. `<Company> stock price technical analysis 52 week` — price context

**C. Financial Portals**
If user provides a Screener.in or Stockscans link, ALWAYS fetch it for structured data.
Also search and fetch:
- `site:screener.in <Company>` for financial tables, peer comparison, shareholding
- Trendlyne, Tickertape for additional data points
- MoneyControl for consensus estimates and broker reports

**D. Concall Transcripts / Investor Presentations**
Search specifically for recent concall transcripts — they contain the richest management
commentary. Try:
- `<Company> Q4 FY25 concall transcript`
- `<Company> investor presentation FY26`

### Phase 2: Analysis & Structuring

Read the full research template at `references/research_template.md` for the 19-section
framework. The template contains detailed instructions for each section.

**Key sections and their relative importance (allocate effort accordingly):**

| Priority | Sections | Why |
|----------|----------|-----|
| CRITICAL | Business Deep Dive, Management Commentary, Management Track Record, Variant Perception | These drive conviction |
| HIGH | Peer Comparison, Financial Quality, Scenario Building, Valuation | These drive price target |
| IMPORTANT | Industry & Competitive, Pipeline, Capital Allocation, Guidance | These drive growth thesis |
| SUPPORTING | Product Analysis, Business Performance, Shareholding, Q&A, Technical, Key Quotes | These provide evidence |

**Analysis principles:**
- Be critical, not agreeable. Challenge management claims with data.
- Separate facts from opinion — clearly label each.
- Quantify everything. "Revenue could grow" is banned. Use specific numbers.
- Think "What could be wrong with this analysis?" for every conclusion.
- Use Indian conventions: Rs/INR, Cr (crores), FY notation (FY26 = Apr 2025–Mar 2026).

### Phase 3: Report Writing

Write the report following these quality standards:

1. **Structure**: Follow the 19-section template but adapt based on available data.
   Skip sections where data is genuinely unavailable rather than padding with fluff.
2. **Tone**: Conviction-driven, analytical. Like a senior analyst briefing a CIO.
3. **Tables**: Use tables for all comparative data (peer comp, financials, scenarios).
4. **Red flags**: Call them out prominently. Don't bury them.
5. **Investment verdict**: Must be clear and actionable with specific price targets.
6. **Length**: 15-40 pages depending on complexity. Quality > quantity.

### Phase 4: PDF Generation

Generate the PDF using the bundled script at `scripts/generate_report_pdf.py`.

Read it first:
```bash
cat <skill_path>/scripts/generate_report_pdf.py
```

The script uses ReportLab to create a professionally formatted multi-page PDF with:
- Dark blue headers and professional typography
- Properly formatted tables with alternating row colors
- Color-coded verdict badges
- Page numbers and headers/footers
- Clean section breaks

**Running the script:**
```python
import sys
sys.path.insert(0, '<skill_path>/scripts')
from generate_report_pdf import create_research_report

# Pass the report as structured markdown text
create_research_report(
    company_name="COMPANY LTD",
    ticker="NSE: TICKER",
    report_markdown=report_text,  # The full analysis as markdown
    output_path="/mnt/user-data/outputs/Company_Research_Report.pdf"
)
```

If the PDF script encounters issues, fall back to creating a well-formatted markdown file
and converting it:
```bash
# Fallback: use pandoc or weasyprint
pandoc report.md -o report.pdf --pdf-engine=weasyprint
```

---

## Tone & Quality Bar

- Write like a senior analyst at a top institution, NOT like a textbook or Wikipedia.
- Every claim must be sourced or flagged as an estimate.
- Be specific: "Revenue grew 23% YoY to Rs 1,847 Cr driven by 18% volume growth and 4%
  realization improvement" NOT "Revenue grew well".
- Flag uncertainties honestly. If data is missing, say so.
- The investment verdict must include: Buy/Hold/Avoid, time horizon, key triggers, position
  sizing guidance, and what would change the thesis.
- Include both bull and bear arguments. One-sided analysis is useless.

---

## Common Pitfalls

1. **Surface-level analysis**: Don't just restate financials. Explain WHY numbers moved.
2. **Missing peer context**: A company's metrics mean nothing without peer comparison.
3. **Ignoring red flags**: If CFO < PAT consistently, flag it. If related party transactions
   are high, flag it. Don't be polite about problems.
4. **Generic industry commentary**: "India is growing" is not analysis. Be company-specific.
5. **No variant perception**: If you can't identify what the market is missing, the report
   adds no value over a Bloomberg terminal.
6. **Vague scenarios**: Each scenario must have specific revenue, margin, and valuation
   assumptions — not just "things go well" vs "things go badly".