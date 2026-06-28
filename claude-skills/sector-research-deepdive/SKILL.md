---
name: sector-research-deepdive
description: Institutional-grade sector / thematic deep-dive research note — produces a 30–45 page PDF (~15,000–20,000 words) covering business mechanics, value chain, competitive dynamics, regulatory landscape, company-by-company analysis, and risks across an entire sector. Use whenever the user names a sector or sub-theme (e.g. "quick commerce", "defence", "solar EPC", "beauty & personal care", "nuclear power", "pharma APIs") and asks for a "sector report", "sector deep dive", "industry analysis", "thematic note", "sector primer", or wants to understand competitive dynamics across multiple companies in one industry. Also trigger when comparing 4+ companies in one sector. Business-first analysis — explains HOW the business model works at the transaction level, WHY moats exist mechanistically, what drives unit economics; deliberately de-emphasises stock prices, P/E, and target prices. NOT for single-company deep dives (use `equity-research-deepdive`) or 2–3 company head-to-head comparisons (use `peer-comparison`).
---

# Sector Research Deep Dive

Output: 30–45 page institutional sector primer (~15,000–20,000 words). Tone = senior sector analyst briefing the investment committee. Quality > length.

**Header classification (always):** "Internal — for investment conviction building; not a published recommendation"  
**Date stamp (always):** "Data current as of [today's date]"

## Core philosophy — Business First, Stock Price Second

This is the single most important instruction in the entire skill. Every section must answer **"How does this business actually work, and why does it win or lose?"** before touching any stock price, P/E, or valuation metric.

The hierarchy of analysis, in strict order:

1. **Business model mechanics** — how does the company make money at the transaction level? Unit economics of a single transaction/order/policy/service.
2. **Competitive moat** — *why* does this company win? What would a well-funded competitor need, and how long would it take?
3. **Customer behaviour** — who uses it, how often, what they spend, repeat/retention rates, cohort maturation.
4. **Margin drivers** — specific operational levers (owned brands, ad revenue, density, recurring commissions, operating leverage). Show the mechanics, not just the numbers.
5. **Strategic choices & trade-offs** — what bets is management making? What are they sacrificing short-term for long-term?
6. **Only then: Financial summary** — revenue, profit, growth metrics to quantify the above. Stock price / valuation = supporting evidence, never the lead.

**Anti-pattern (banned):** "Company X — CMP ₹500, Mcap ₹20,000 Cr, P/E 45x. Revenue grew 30%. Order book is ₹5,000 Cr." That is a data dump.  
**Correct pattern:** "Company X's model works because [mechanism]. This produces [unit economics]. The moat comes from [specific source]. Revenue grew 30% because [driver], not just 'grew 30%.'"

## Workflow — 5 phases

### Phase 0 — Mandatory data verification protocol (CRITICAL)

Before writing a single word, complete the protocol in [`references/research_protocol.md`](references/research_protocol.md). The short version:

1. **Web-search every key data point** — capacity numbers, order book figures, market share claims, policy dates, concall quotes, government targets. Never rely on training data alone for any number, date, or quote.
2. **Cross-reference ≥2 sources** for any critical claim (market size, company financials, policy details).
3. **If unverifiable, mark as `[Unverified — analyst estimate / training data]`** in the report. Never present unverified numbers as fact.
4. **For every company, verify** the latest revenue, key operating metrics, and recent concall commentary via fresh web search.
5. **For policy / regulatory claims**, search for the actual gazette notification, bill text, or official press release. Cite it.
6. **Date-stamp the report** and flag any figure older than 2 quarters.

*Why this exists:* a prior SOIC note carried a P/E error sourced from Screener.in (POCL). This protocol exists to prevent that class of error permanently. **Accuracy > Speed.**

### Phase 1 — Sector classification & framework selection

Classify the sector before starting analysis. The framework adapts:

| Sector type | Section 6 becomes | Section 9 becomes | Lead emphasis |
|---|---|---|---|
| **Platform / consumer internet** (Blinkit, Nykaa, Zomato, Policybazaar, Urban Company) | Unit Economics & Margin Architecture (per-order P&L) | Strategic Initiatives Map (category expansion, dark store roll-out) | Customer behaviour, repeat rate, contribution margin per order |
| **Industrial / infrastructure / manufacturing** (nuclear, defence, semis, MLCC, EPC, capital goods) | Structural Framework (e.g. Thorium & 3-Stage; API vs Formulations; Wafer → Fab → Packaging) | Stalled / Revived / Upcoming Project Map | Capacity, order book quality, technology positioning |
| **Financial services / regulated** (NBFC, insurance, broking, AMC) | Regulatory Capital & Unit Economics (per-policy / per-customer P&L) | Distribution & Product Mix Roadmap | Persistency, claims ratio, AUM mix, regulatory moat |

If genuinely hybrid (e.g. fintech-NBFC, D2C-with-manufacturing), pick the dominant framing and note the hybrid nature upfront.

### Phase 2 — Research & data gathering

Follow the search framework in [`references/research_protocol.md`](references/research_protocol.md) §Research Searches. Effort is heavily front-loaded here — report quality is 100% gated on research depth.

Sources, in priority order:
- **Official primary sources:** company filings, BSE/NSE announcements, gazette notifications, regulator press releases, government policy documents.
- **Concalls & investor presentations** — latest 2–4 quarters per major company; prioritise strategic commentary over guidance numbers.
- **Industry reports** — credit rating agency sector reports (CARE, ICRA, India Ratings, CRISIL), reputed industry associations, IEA/IRENA/IAEA for energy, SIA/ESIA for semis, WHO/IQVIA for pharma.
- **Long-form business analysis** — Substack deep-dives, founder/CEO interviews, podcasts. These often have business-mechanism insights that brokerage notes miss.
- **Financial portals:** Screener.in for per-company financials/peers/shareholding; Trendlyne / Tickertape / MoneyControl for additional data. *Treat Screener.in figures as starting points — verify against the actual filing for any number that drives a conclusion.*

For Indian listed companies, if the user has provided a Stockscans ticker for any company in the sector, auto-fetch documents:

```bash
TICKER="NSE:DMART"           # example — replace per company
SAFE=$(echo "$TICKER" | tr ':' '_')
DOCS_DIR="/tmp/${SAFE}_sector_docs"
python3 /tmp/fetch_documents.py "$TICKER" \
    -t Transcript PPT --last-n 4 -o "$DOCS_DIR"
```

### Phase 3 — Analysis & structuring

Use the 19-section framework in [`references/sector_framework.md`](references/sector_framework.md). Effort allocation by criticality:

| Priority | Sections |
|---|---|
| CRITICAL | §1 Executive Summary, §6 Sector-Specific Deep Topic, §7 Value Chain Breakdown, §10 Company-by-Company, §11 Monopolies & Moats |
| HIGH | §2 First Principles, §4 India Story, §5 Policy & Regulatory, §8 Emerging Theme, §14 Risks & Bear Case |
| IMPORTANT | §3 Global Trends, §9 Project/Initiatives Map, §12 Global Value Chain, §13 Adjacent Demand, §15 Framework, §16 What to Watch |
| SUPPORTING | §17 Sources, Appendices A & B |

**Data density target:** 15–20 tables across all sections. **At least 5 must be business-model or unit-economics focused** (per-transaction P&L, customer behaviour, moat mechanism, margin drivers), not financial-summary focused.

### Phase 4 — Writing

Tone & style rules (full list in [`references/sector_framework.md`](references/sector_framework.md) §Tone & Style):
- Write like a senior analyst explaining the business to the investment committee, not listing stock metrics.
- Lead every section with the "so what" for the **business**, not the stock price.
- Be opinionated — every `[Analyst View]` must contain a clear stance with business reasoning.
- Explain **mechanisms**, not just outcomes. "Revenue grew 30%" is an outcome; "revenue grew 30% because order frequency increased from 8 to 11 per user per month as the platform added 2,000 SKUs" is a mechanism.
- Address the reader as a peer; include contrarian takes where consensus is wrong.
- Use ₹ crore / ₹ lakh crore for Indian context; USD bn / USD m for global.
- Every number gets a source or is marked `[Analyst Estimate]`.

**Critical "anti-shallow-analysis" rules** (full enforcement list in [`references/research_protocol.md`](references/research_protocol.md)):
- NEVER lead a company section with CMP / Mcap / P/E as the header or first sentence.
- NEVER list brokerage target prices — they add noise, not insight.
- NEVER write "Company X has a strong moat" without explaining the *mechanism* of why and how durable.
- NEVER describe a business model in one sentence ("marketplace model") — explain it at the transaction level.
- NEVER let valuation commentary exceed 10% of any company's analysis section.
- ALWAYS explain *why* a metric changed, not just *that* it changed.
- ALWAYS compare unit economics across competitors, not just one company's numbers.

### Phase 5 — PDF generation

```python
import sys; sys.path.insert(0, '<skill_path>/scripts')
from generate_sector_report import create_sector_report
create_sector_report(
    sector_name="Quick Commerce",
    sub_theme="Dark store unit economics & moat sustainability",  # or None
    report_markdown=report_md,
    output_path="/mnt/project/packages/cowork-jobs/data/agent-outputs/Sector_QuickCommerce.pdf",
)
```

Script: [`scripts/generate_sector_report.py`](scripts/generate_sector_report.py). Uses palette/helpers from `../_shared/pdf_utils.py`.  
Fallback: `pandoc report.md -o report.pdf --pdf-engine=weasyprint` if reportlab errors out.

After generation, run a self-audit: re-read the PDF for (a) any number flagged `[Unverified]` that slipped into a non-tentative sentence, (b) any company section that opens with CMP/Mcap/P/E, (c) any "strong moat" / "great management" claim without a mechanism. Fix and regenerate.

## Pitfalls to avoid

- **Leading with valuation.** If the company section opens with P/E or target price, you've failed the philosophy test. Rewrite.
- **Listing brokerage target prices.** They're noise. Delete them; explain business triggers instead.
- **Generic moat claims.** "Brand strength" / "scale advantage" without the mechanism is empty. Explain *how* the moat actually works at the operational level.
- **One-sentence business models.** "Marketplace model" tells you nothing. Walk through a single transaction: who pays whom, what costs hit, what's the contribution margin.
- **Country-level macro filler.** "India's GDP is growing" is not sector analysis. Cut it.
- **Restating concall guidance numbers verbatim.** Translate them into business mechanics — what *operationally* must happen for the guidance to hit?
- **Not flagging unverified data.** The Screener.in / POCL P/E error happened because numbers weren't cross-checked. Always cite, always verify, always flag.
- **Skipping the bear case.** Lead bear with business risks (model risk, competitive risk, customer behaviour risk, unit economics risk) — valuation risk should be last, not first.
- **No variant perception.** Without §1 / §8 / §14 telling the reader something the consensus is missing, the report is a Bloomberg printout. Provide an edge.

## When NOT to use this skill

- Single-company deep dive → `equity-research-deepdive`
- 2–3 head-to-head company comparison → `peer-comparison`
- Forensic accounting on one company → `forensic-accounting`
- Single-quarter result interpretation → `quarterly-result-analysis`
- Concall transcript analysis only → `concall-analysis`
