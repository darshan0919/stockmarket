---
name: growth-triggers-1pager
description: >
  Use this skill whenever the user wants to create a growth triggers document, equity research
  1-pager, stock catalyst note, re-rating thesis, or conviction note for an Indian listed company.
  Trigger when the user mentions "growth triggers", "1-pager", "catalyst note", "re-rating triggers",
  "conviction note", "why will this stock re-rate", or asks for a concise institutional-quality
  equity research summary with triggers, timelines, and conviction tags for any NSE/BSE-listed stock.
  Also trigger when the user provides a Screener.in or Stockscans link and asks for an analysis,
  or uploads annual reports and asks for a growth thesis. This skill covers the full pipeline:
  research (web + uploaded docs), analysis, and PDF generation.
---

# Growth Triggers 1-Pager — Equity Research Skill

Produce a single-page, high-density, institutional-quality growth triggers PDF for any
Indian listed company. The output should look like it was written by a senior analyst at
Kotak Institutional or Motilal Oswal briefing a fund manager before a position sizing meeting.

---

## When to Use

- User asks for a "growth triggers" or "catalyst" or "re-rating" document
- User provides a stock ticker / Screener.in link / annual reports and wants analysis
- User says "1-pager", "conviction note", or "why could this stock re-rate"
- User uploads annual reports or concall transcripts and asks for a summary with triggers

---

## Workflow — 3 Phases

### Phase 1: Research & Data Gathering

Collect data from ALL available sources. The quality of the output depends on the depth of
research. Do not skip steps.

**A. Uploaded Documents (if any)**
Extract full text from uploaded PDFs (annual reports, concall transcripts, investor presentations):
```bash
pdftotext -f 1 -l <PAGES> /mnt/user-data/uploads/<file>.pdf /home/claude/ar_text.txt
```
Then grep for key terms to find relevant sections quickly:
```bash
grep -n -i "capacity\|capex\|expansion\|revenue\|EBITDA\|margin\|market share\|new product\|
export\|guidance\|outlook\|order book\|emission\|regulation\|promoter\|holding\|ROE\|ROCE\|
dividend\|R&D\|technology\|segment" /home/claude/ar_text.txt | head -80
```
Then `sed -n '<start>,<end>p'` to read the relevant sections (Directors' Report, MDA, Financial
Highlights, Balance Sheet summary).

**B. Web Search (always do this, even with uploaded docs)**
Run these searches to get current data:
1. `<Company Name> market cap CMP <current_year>` — for CMP, market cap, PE, PB
2. `<Company Name> Q<latest>FY<year> results revenue profit` — latest quarterly results
3. `<Company Name> capacity expansion capex growth` — growth plans
4. `<Industry> market size India FY<year>` — industry context
5. Any sector-specific searches (e.g., emission norms, PLI scheme, policy changes)

**C. Screener.in / Financial Portals**
If the user provides a Screener.in link, fetch it for structured financial data. Also check
the Screener.in page for peer comparison data, shareholding, and quarterly trends.

### Phase 2: Analysis & Structuring

Organize all gathered data into 5 sections. This is the analytical framework — do NOT
deviate from this structure.

#### SECTION 1: Company Snapshot (3–4 lines + KPI table)
Write in plain English — a non-sector analyst should understand the business in 10 seconds.
Must include:
- What the company does (one sentence, no jargon)
- Where it sits in the value chain, who the end customers are
- What's unique / what's the moat (or explicitly state if it's commoditized)
- Promoter holding % and any recent change

**KPI Table** (always include these 8 metrics):
| FY Rev | FY PAT | EBITDA Margin | ROE | ROCE | Debt | PE (TTM) | Div Yield |

Source these from the latest annual results + web search. If FY results are not yet out,
use TTM (trailing twelve months) from quarterly data.

#### SECTION 2: Core Growth Triggers (5–7 triggers)
This is the heart of the document. Each trigger must have:
- **Trigger Name**: Crisp 5–7 word label
- **What's Happening**: 2–3 sentences — the specific event, capex, policy, order win, etc.
- **Quantified Impact**: Attach numbers — incremental revenue (Rs Cr), margin expansion (bps),
  volume growth (%), capacity utilization jump, addressable market size
- **Timeline**: When does this flow into P&L? (e.g., "H2 FY27", "FY28–30")
- **Conviction Tag**: One of:
  - `HIGH CONVICTION` — visible in order book / capex / policy already
  - `MEDIUM CONVICTION` — management guided but not yet contracted
  - `OPTIONALITY` — asymmetric upside, not in consensus estimates

**Trigger prioritization order** (use this to rank):
1. Capacity / capex-led volume growth
2. New product / segment / geography entry
3. Margin expansion (operating leverage, mix shift, backward integration, RM tailwind)
4. Policy / regulatory catalysts (PLI, tariff protection, govt capex, sector reforms)
5. Industry structure changes (consolidation, competitor exit, import substitution, China+1)
6. Balance sheet triggers (deleveraging, asset monetization, subsidiary unlocking)
7. Management / governance upgrades (new CEO, board reconstitution, demerger)

**Quality rules for triggers:**
- Every trigger must be company-specific and verifiable from concalls, investor presentations,
  or annual reports. NO generic tailwinds like "India's growing economy" or "rising middle class".
- Use primary source data — cite concall commentary, management guidance, capex announcements,
  order book disclosures.
- All numbers should be sourced or estimated with clear assumptions.
- If data is unavailable, flag it as "awaiting disclosure" rather than guessing.

#### SECTION 3: What's Already in the Price? (2–3 lines)
- What is consensus already discounting?
- Where is the incremental surprise vs. street estimates?
This section requires understanding what the market knows (recent broker reports, PE relative
to history, recent price action).

#### SECTION 4: Key Risks (3–4 bullets)
- What can delay or derail each high-conviction trigger?
- Cover: execution risk, regulatory risk, commodity/input cost risk, demand cyclicality,
  balance sheet stress, single-customer/product concentration.
- Each risk should have a mitigant or probability qualifier.

#### SECTION 5: Trigger Scoreboard (Summary Table)
A compact table with columns:
| # | Trigger | Revenue/Earnings Impact | Timeline | Conviction |
Conviction tags should be color-coded (GREEN for HIGH, ORANGE for MEDIUM, RED for OPTIONALITY).

### Phase 3: PDF Generation

Generate the PDF using the bundled template script at `scripts/generate_pdf.py`.

Read the template first:
```bash
cat <skill_path>/scripts/generate_pdf.py
```

The template expects a Python dictionary with all the structured data. Populate it and run
the script. The PDF MUST fit on exactly 1 page (A4, 10mm margins, tight font sizes).

**Critical PDF constraints:**
- Must be exactly 1 page. If it spills to 2, reduce trigger body text (not the number of
  triggers).
- Use the color scheme in the template (dark blue headers, green/orange/red conviction tags).
- Font sizes are already optimized for density — don't increase them.
- The template handles all layout; just feed it the data dictionary.

**Running the template:**
```python
import sys
sys.path.insert(0, '<skill_path>/scripts')
from generate_pdf import create_growth_triggers_pdf

data = {
    "company_name": "COMPANY LTD",
    "ticker": "NSE: TICKER",
    "date": "Month Year",
    "cmp": "Rs X,XXX",
    "market_cap": "Rs X,XXX Cr",
    "cap_category": "Small/Mid/Large Cap",
    "sector": "Sector Name",
    "snapshot": "Business description paragraph...",
    "kpi_headers": ["FY26 Rev", "FY26 PAT", "EBITDA Mgn", "ROE", "ROCE", "Debt", "PE (TTM)", "Div Yield"],
    "kpi_values": ["Rs X Cr", "Rs X Cr", "X%", "X%", "X%", "Zero/Rs X Cr", "Xx", "X%"],
    "triggers": [
        {
            "name": "Trigger Name Here",
            "body": "What's happening — 2-3 sentences with <b>bold</b> for key numbers.",
            "impact": "+Rs X Cr revenue / +X bps margin",
            "timeline": "H2 FY27",
            "conviction": "HIGH CONVICTION"  # or MEDIUM CONVICTION or OPTIONALITY
        },
        # ... 5-7 triggers total
    ],
    "in_the_price": "What consensus is pricing. Where the surprise is.",
    "risks": [
        "<b>Risk name:</b> Description with mitigant.",
        # ... 3-4 risks
    ],
    "scoreboard": [
        # [number, name, impact, timeline, conviction]
        [1, "Short trigger name", "+Rs X Cr", "FY27", "HIGH"],
        # ... one row per trigger
    ],
    "sources": "Source attribution line for footer.",
    "output_path": "/mnt/user-data/outputs/Company_Growth_Triggers.pdf"
}

create_growth_triggers_pdf(data)
```

---

## Tone & Quality Bar

- Write in the tone of a conviction note, not a textbook. This should read like an analyst
  who has done 5 concall deep-dives and 3 channel checks is briefing a PM.
- Be specific and quantified. "Revenue could grow" is banned. "Revenue could grow 18–22%
  driven by 45,000 incremental engine capacity at Rs 1L/engine realization" is correct.
- Ruthlessly cut fluff. Every word must earn its place on the single page.
- Use Rs/INR for all monetary figures. Use Cr (crores) not millions.
- Use Indian fiscal year convention: FY26 = April 2025 to March 2026.

---

## Common Pitfalls to Avoid

1. **Generic triggers**: "India's GDP is growing" is not a trigger. "TREM V emission norms
   mandating DPF+SCR for >50HP tractors from Oct 2026, driving 15-20% realization uplift
   per engine" is a trigger.
2. **Missing quantification**: Every trigger must have a number attached (revenue in Rs Cr,
   margin in bps, volume in units/%).
3. **No timeline**: "In the future" is not a timeline. "H2 FY27" or "commissioning by Q1
   FY28" is a timeline.
4. **Ignoring what's in the price**: The "incremental surprise" section is what makes this
   useful for a fund manager, not just descriptive analysis.
5. **Overflowing to page 2**: If the PDF spills, cut trigger body text, NOT triggers. Aim
   for 5-6 triggers if space is tight.