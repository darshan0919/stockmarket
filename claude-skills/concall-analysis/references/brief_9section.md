# Concall Brief — 9-Section Framework

The lighter-weight concall analysis. Use when processing multiple calls quickly during earnings season, or when a deep dive is more than the situation warrants.

**Master prompt:**

> You are a financial research assistant analyzing the attached earnings concall transcript for [Company], [Quarter] [FY]. Extract critical information objectively, without external data or prior assumptions. Apply the 9-section structure below. Each section should be 2-4 lines (not 2-4 paragraphs). The fund manager will read this in 5 minutes; insight density beats length.

## §1 Management Commentary

Key statements, tone, clarity, confidence, areas of focus. One paragraph.

Mark tone as: **Bullish / Neutral / Cautious / Defensive**.

## §2 Future Outlook & Guidance

Forward-looking statements + demand visibility + projection numbers.

Format: bullet list with one number per bullet. e.g.,
- Revenue growth guidance: 15% for FY27
- EBITDA margin target: 18-20% by H2 FY27
- Capex: Rs 250 Cr over FY26-FY28

## §3 Industry & Macro Trends

Industry growth, cyclicality, regulation, economic observations made by management.

3-4 bullets.

## §4 Competitive Landscape / Peer Comparison

Performance vs competitors, pricing power commentary, market-share remarks.

If no peer commentary on the call, write "Not discussed".

## §5 Risks & Concerns

Raw material, forex, regulatory, customer churn, cautious statements.

Bullet list.

## §6 Growth Drivers & Strategic Initiatives

New products, geographies, capex, M&A, partnerships discussed.

Bullet list.

## §7 Product Mix & Portfolio Trends

Volume/value shift, premiumization, new launches.

Skip if not relevant for the company type (e.g., banks, IT services).

## §8 Financial Highlights (if disclosed)

Revenue, EBITDA, net profit, margins (brief only — full numbers go in the official press release).

3-5 numbers max.

## §9 Sentiment Analysis

- **Overall tone:** Positive / Neutral / Negative
- **Confidence level:** High / Moderate / Low
- **Notable shift from prior concalls** (if comparison data available): one-line description
- **Conclusion:** one paragraph summarising key takeaways

## Output structure (PDF)

Single 2-3 page PDF. Layout:
- Page 1: Header, KPI strip, §1, §2, §9 (the three most important)
- Page 2: §3-§8 in compact form

## When NOT to use brief mode

- High-stakes call (results miss, guidance cut, management change announcement)
- Company under your forensic radar (use deep mode)
- New name you're researching for the first time (use deep mode)

In all those cases, do the extra 15 minutes for `deep` mode.

## Pitfalls

- **Don't add interpretation in brief mode** — just facts. If the analyst wants interpretation, they'll re-run in deep mode.
- **3-4 bullets per section, not 8.** If you can't summarise it in 3-4 bullets, the call has too many themes for brief mode.
