# Multi-Peer Concall Comparison

Compare how 3-6 companies in the same sector talked about the same quarter. Demand consensus or divergence on the same questions reveals which management is most accurate, most aggressive, or most evasive.

**Master prompt:**

> You are a senior sector analyst. The attached transcripts are concalls from [Company A], [Company B], [Company C], [Company D] — all in the [Sector] industry, all for [Quarter] [FY]. For the same set of sector-relevant questions, compile each management's stance side-by-side. Flag divergences. Identify which company gives the most quantitative guidance, which is most evasive, and which has the most aggressive growth narrative.

## Required input

3-6 transcripts, all from the same quarter, for companies in the same sector or sub-sector.

## Required output: comparison tables

### Table 1 — Demand environment

```
| Company  | Demand commentary                                         | Tone     |
|----------|-----------------------------------------------------------|----------|
| A        | "Strong demand traction across all geographies"           | Bullish  |
| B        | "Demand is steady; some softness in Western India"        | Neutral  |
| C        | "Demand has weakened materially since Diwali"             | Cautious |
| D        | "Robust order book; no demand concerns"                   | Bullish  |
```

Then: are 3 of 4 saying soft and 1 saying strong? That 1 needs further investigation — the divergent voice is either right (alpha) or wrong (re-rating risk).

### Table 2 — Forward growth guidance

```
| Company  | Revenue guidance      | Margin guidance        | Confidence  |
|----------|-----------------------|------------------------|-------------|
| A        | 20-25% FY27           | 200bps expansion       | HIGH        |
| B        | 15-18% FY27           | flat                   | MEDIUM      |
| C        | "modest growth"       | not disclosed          | LOW (vague) |
| D        | 18-22% FY27           | 100bps expansion       | HIGH        |
```

Aggressive growth guidance from one company in a sector where peers are cautious is a flag — either the company has a genuine differentiator or management is overpromising.

### Table 3 — Sector-specific KPIs

Pick 4-8 sector-relevant KPIs and compare. Examples:
- **Telecom equipment:** order book, book-to-bill ratio, capacity utilisation, gross margin
- **Pharma:** R&D % of revenue, US generic price erosion, ANDA filings, capacity addition
- **Auto components:** capacity utilisation, raw material pass-through, EV revenue share
- **Banks:** NIM, GNPA, credit growth guidance, Tier-1 capital
- **IT services:** TCV/order intake, attrition, deal pipeline, large-deal closures

```
| KPI                | Company A | Company B | Company C | Company D | Notes        |
|--------------------|-----------|-----------|-----------|-----------|--------------|
| Order book Rs Cr   | 4,500     | 3,200     | 1,800     | 5,100     |              |
| Book-to-bill       | 1.4x      | 1.2x      | 0.9x      | 1.6x      | C below 1 = flag |
| Capacity util %    | 78%       | 82%       | 65%       | 91%       | D approaching limit |
```

### Table 4 — Most evasive vs most transparent

Score each company on:
- Number of quantitative answers given to analyst questions (out of total Q&A)
- Number of dodged/non-answer responses
- Specificity of forward guidance

```
| Company  | Quant answers | Dodged | Forward specificity | Verdict          |
|----------|---------------|--------|---------------------|------------------|
| A        | 18 / 23       | 1      | HIGH                | Most transparent |
| B        | 12 / 19       | 3      | MEDIUM              | Average          |
| C        | 6 / 21        | 8      | LOW                 | Evasive          |
| D        | 15 / 20       | 2      | HIGH                | Transparent      |
```

## Final synthesis

One paragraph each:
- **Sector consensus** — what are 3+ managements agreeing on?
- **Divergent voice** — who is the outlier and on what?
- **Most credible** — which management's guidance you'd weight most?
- **Worth investigating** — which company's commentary needs follow-up?

## When this mode is most valuable

- Sector-rotation thesis ("is auto-ancillary turning?")
- Quality-vs-momentum debates between peers
- Pre-earnings: read the early reporters and predict what late reporters will say
- Post-earnings: identify the relative-value setup

## Pitfalls

- **Don't compare different sub-sectors as peers.** L&T and BHEL are both "capital goods" but their drivers differ; the comparison adds little.
- **Same quarter is essential.** Comparing Q3 of Company A with Q1 of Company B introduces noise.
- **Even within sector, business mix matters.** Note where the comparison is unfair (e.g., Tata Motors' India vs JLR vs Battery splits).
