# Research Protocol — Data Verification, Searches, and Anti-Hallucination Rules

This document is the operational guardrail for the sector deep-dive skill. The Phase 0 protocol exists because a prior research note (SOIC, POCL) carried a P/E error sourced from Screener.in. The protocol prevents that class of error permanently.

**Principle: Accuracy > Speed.**

---

## Part 0 — Mandatory Data Verification Protocol

Before writing a single word of the report, complete these steps:

### 0.1 Web-search every key data point

Capacity numbers, order book figures, market share claims, policy dates, concall quotes, government targets — **all of these must be web-searched**. Do NOT rely on training data alone for any number, date, or quote.

Training data is dated. A 2024-vintage figure may have been superseded by FY25 actuals, an FY26 H1 update, or a policy revision. Always search for the most recent value.

### 0.2 Cross-reference ≥2 sources for any critical claim

Critical claims include: market size, company-specific financials, policy details, capacity / order book figures, market share, regulatory thresholds. If two reputable sources disagree, present both figures and explain the discrepancy — never silently pick one.

### 0.3 Mark unverifiable data explicitly

If a data point cannot be verified via search, explicitly mark it as `[Unverified — based on analyst estimate / training data]` in the report. Never present unverified numbers as fact. A flagged number is acceptable; an invented number is not.

### 0.4 Per-company verification

For every company mentioned in §10 or in any peer-comp table, verify via fresh web search:
- Latest reported revenue (most recent annual or TTM).
- Key operating metrics (capacity, order book, AUM, dark store count, etc. — whichever is the binding constraint for that business).
- Recent concall commentary (last 1–2 quarters) — preferably a direct quote.

### 0.5 Policy / regulatory verification

For every policy or regulatory claim, search for the actual gazette notification, bill text, or official press release. Cite the source. "I read somewhere that…" is not acceptable.

### 0.6 Date-stamp everything

State clearly at the top of the report: **"Data current as of [today's date]"**. Flag any figures older than 2 quarters with a note explaining why the older figure was retained (e.g. "latest available; FY26 H1 not yet reported").

### 0.7 Self-audit checklist before declaring done

Before finalising the PDF, scan the report for:

- [ ] Any unflagged number that you cannot point to a source for.
- [ ] Any company section opening with CMP / Mcap / P/E.
- [ ] Any "strong moat" / "great management" claim without a mechanism.
- [ ] Any brokerage target price (these are banned).
- [ ] Any management quote without a date / source citation.
- [ ] Any market-sizing claim presented as fact without `[Analyst Estimate]` or source.

Fix every hit before declaring the report ready.

---

## Research Searches — Phase 2 Search Framework

Adapt sector name and sub-theme. The first 12 are the standard sector search set; add sector-specific searches as needed.

### Core sector searches (always run these)

1. `<Sector> India market size FY26 latest`
2. `<Sector> India regulatory framework 2024 2025 2026`
3. `<Sector> India policy reform gazette notification`
4. `<Sector> global trends inflection point latest`
5. `<Sector> top companies India listed market share`
6. `<Sector> value chain breakdown India`
7. `<Sector> India growth drivers TAM next 5 years`
8. `<Sector> risk factors challenges India`
9. `<Sector> capex pipeline India projects under construction`
10. `<Sector> exports India global supply chain`
11. `<Sector> credit rating sector report CARE ICRA CRISIL India Ratings`
12. `<Sector> annual report concall commentary leading company FY25 FY26`

### Per-company searches (run for each listed company in §10)

13. `<Company> business model how it makes money`
14. `<Company> latest quarterly results revenue EBITDA FY26`
15. `<Company> concall transcript latest quarter management commentary`
16. `<Company> moat competitive advantage unit economics`
17. `<Company> capacity expansion order book pipeline`
18. `<Company> shareholding pattern FII DII mutual fund`

### Theme-specific searches (run for §8 Emerging Theme)

19. `<Theme> global pioneers playbook business model`
20. `<Theme> India positioning policy support`
21. `<Theme> addressable market sizing bull case base case`

### Sources to prioritise

- **Official:** company filings, BSE/NSE announcements, gazette notifications, regulator press releases (RBI, SEBI, IRDAI, AERB, MoPNG, MoP, etc.), Ministry / Department press releases.
- **Credit-rating sector reports:** CARE Ratings, ICRA, CRISIL, India Ratings — these often have the cleanest sector-level capacity / market-share data.
- **Industry associations:** SIAM (auto), ELCINA / IESA (electronics), IPA (pharma), CEA (power), DAE (nuclear), SIA (semis global).
- **Multilaterals:** IEA / IRENA / IAEA / WHO / IMF / World Bank — for global benchmarks.
- **Long-form business analysis:** Substack deep-dives, founder/CEO interviews, podcasts. Often contain business-mechanism insights that brokerage notes miss.
- **Financial portals:** Screener.in (per-company financials/peers/shareholding), Trendlyne, Tickertape, MoneyControl. *Treat Screener.in figures as starting points — verify against the actual filing for any number that drives a conclusion.*

### Sources to avoid as primary

- Forum posts (Reddit, Twitter without verification) — fine for tone-taking, not for facts.
- Aggregator news sites (random "moneycontrol.com" non-bylined recap of a press release without primary link).
- Brokerage target prices — banned in the output anyway.

---

## Anti-Hallucination Rules (Unbreakable)

These rules are absolute. Violation = re-do the section.

- **NEVER fabricate a concall quote.** If you can't find an exact quote with a date, paraphrase the management's stated position and mark it `[Paraphrased]`.
- **NEVER invent an order book / operating number.** "Approximately ₹X Cr" without a source is invention.
- **NEVER present analyst estimates as company guidance.** If a brokerage projects FY27 EBITDA, that's `[Brokerage Estimate]`, not `[Company Guidance]`.
- **ALWAYS say "I could not verify this"** rather than making something up. A gap is acceptable; a confabulation is not.
- **ALWAYS mark forward-looking estimates** with `[Analyst Estimate]` or `[Company Guidance FY__]`.
- **ALWAYS include the date** of the data source — "as of Q2 FY26 concall, 30 Oct 2025" not "in a recent concall".

## Anti-Shallow-Analysis Rules (Unbreakable)

The "business first" philosophy is enforced through these specific bans:

- **NEVER lead a company section with CMP / Mcap / P/E as the header or first sentence.** These belong in a one-line reference *after* the business analysis.
- **NEVER list brokerage target prices.** They are noise, not insight. Replace with business catalysts the user can actually track.
- **NEVER write "Company X has a strong moat"** without explaining the MECHANISM. What specifically makes the moat? How does it operate at the transaction level? How durable is it against well-funded competition?
- **NEVER describe a business model in one sentence** ("marketplace model"). Explain HOW it works at the transaction level — who pays whom, where the margin comes from, what the contribution per unit looks like.
- **NEVER let valuation commentary exceed 10% of any company's analysis section.** If your company section is 1,500 words, valuation gets ~150 words max.
- **ALWAYS explain WHY a metric changed**, not just THAT it changed. "Margin rose 200bps" is not analysis; "margin rose 200bps because owned-brand mix went from 12% to 17% of revenue, and owned brands carry 60–70% gross margin vs. 25% on third-party SKUs" is analysis.
- **ALWAYS compare unit economics across competitors**, not just list one company's numbers. A single data point is not analysis; a comparison is.
- **ALWAYS include customer behaviour data** (frequency, repeat rate, AOV, retention) when analysing platform/consumer businesses.
- **ALWAYS explain the business logic behind strategic decisions** — WHY did Blinkit go 1P? WHY is Nykaa opening physical stores? WHY is Urban Company burning on InstaHelp? The mechanism behind the choice is the analysis.

---

## Output Format Targets

- **Length:** 15,000–20,000 words (~30–45 pages equivalent).
- **Classification header (always):** "Internal — for investment conviction building; not a published recommendation".
- **Date stamp (always):** "Data current as of [today's date]".
- **Time horizon:** stated explicitly in §1.
- **Tables:** 15–20 minimum; ≥5 must be business-model or unit-economics focused.
- **`[Analyst View]` blocks:** at least one per major section; must reference specific business metrics, not just financial metrics.
