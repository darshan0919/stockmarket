# DRHP 10-Section Framework

Apply this to every DRHP under review. Each section: what to extract, where it lives in a typical DRHP, and what to flag.

**Master prompt:**

> You are a financial analyst with expertise in Indian IPO and equity research. The attached document is a Draft Red Herring Prospectus (DRHP) for [Company]. Extract and summarise actionable insights under the 10 sections below. For every claim, cite the page number. Where the language matters (auditor opinion, risk factors, promoter litigation, related party transactions), quote verbatim. Anchor strictly to the document; if a section is not present or not disclosed, mark "not disclosed" rather than inferring.

## §1 Business Overview

- Core business activities (what the company actually does)
- Products / services portfolio
- Revenue streams broken down (segment / geography / product)
- Geographical reach
- Manufacturing footprint (if relevant)
- Customer types (retail / institutional / B2B)

**Where to find it:** "Our Business", "About Our Company" — usually pp.100-200 in the front section.

**Flag if:** business description changes materially across the DRHP (front section says one thing, MD&A another, financials suggest a third); or if the company describes itself in terms different from peers.

## §2 Industry & Market Overview

- Industry trends (volume, pricing, regulatory)
- Growth potential (CAGR mentioned)
- Competition landscape
- Market size (TAM / SAM)
- Claimed market share
- Industry consultant cited (CRISIL, Frost & Sullivan, etc.)

**Where to find it:** Standalone "Industry Overview" section, typically pp.100-150 length.

**Flag if:** The market share claim has no specific source; or the TAM is so large that market-share is meaningless ("opportunity in $X trillion industry"); or the industry consultant is paid by the issuer (it almost always is — note this).

## §3 Objects of the Issue

The most important section to read first. Where is the IPO money going?

- Total issue size (Rs Cr)
- Fresh issue (Rs Cr) — money going to the company
- Offer for Sale (OFS) (Rs Cr) — money going to selling shareholders
- Use of fresh-issue proceeds, broken down:
  - Repayment of debt
  - Capex / expansion
  - Working capital
  - General corporate purposes (GCP)
  - Acquisition (specified or unspecified)

**Where to find it:** "Objects of the Offer", typically pp.80-120, well-marked.

**Flag if:**
- OFS > 50% of total issue → promoters / PE investors are cashing out, not raising for growth
- "General corporate purposes" > 25% of fresh issue → vague usage; SEBI caps this but companies often skirt
- Acquisition is unspecified → blank cheque to management
- Debt repayment when D/E is already low → suggests insiders being paid off

## §4 Financial Highlights (Last 3 Years, Restated)

- Revenue (Rs Cr) — 3 years
- EBITDA & EBITDA margin — 3 years
- Net profit & PAT margin — 3 years
- Cash from operations (CFO) — 3 years
- EPS (Rs) — 3 years
- ROE / ROCE — 3 years

Required output table:

```
| Metric             | FY23   | FY24   | FY25   | CAGR (3Y) |
|--------------------|--------|--------|--------|-----------|
| Revenue (Rs Cr)    | 540    | 720    | 950    | +33%      |
| EBITDA (Rs Cr)     | 78     | 115    | 180    | +52%      |
| EBITDA margin      | 14.4%  | 16.0%  | 18.9%  | +4.5pp    |
| PAT (Rs Cr)        | 35     | 60     | 110    | +77%      |
| PAT margin         | 6.5%   | 8.3%   | 11.6%  | +5.1pp    |
| CFO (Rs Cr)        | 28     | 41     | 78     |           |
| CFO/PAT            | 0.80   | 0.68   | 0.71   |           |
| EPS (Rs)           | 3.5    | 6.0    | 11.0   |           |
| ROE                | 12%    | 18%    | 24%    |           |
| ROCE               | 14%    | 22%    | 28%    |           |
```

**Where to find it:** "Financial Information" / "Restated Financial Statements" — long section, usually pp.250-400.

**Flag if:**
- Sudden profit spike in the year before IPO (window dressing — common red flag)
- CFO consistently lagging PAT (earnings quality)
- Revenue growth is recent (last 1-2 years) but not historical (pre-IPO storytelling)
- ROE expansion driven by leverage rather than margin

## §5 Cash Flow Analysis

- Operating cash flow trend over 3 years
- Investing cash flow (capex commitment levels)
- Financing cash flow (equity, debt, dividends)
- Profit vs cash flow mismatches — explained?

**Where to find it:** "Cash Flow Statement" within Restated Financials.

**Flag if:**
- 3-year cumulative CFO < 3-year cumulative PAT by more than 20%
- Negative CFO in any year alongside positive PAT
- Heavy investing cash flow without corresponding revenue translation
- Dividends paid out larger than CFO (not common in IPOs but happens)

## §6 Risk Factors

DRHPs list 30-100+ risk factors. Most are generic boilerplate. Filter for:

**Generic (low information):**
- "We may face competition" — skip
- "Economic downturn could affect business" — skip
- "Foreign exchange fluctuations" — note only if exporter/importer

**Specific (high information):**
- Named customer dependency ("Our top customer accounted for X% of revenue")
- Pending legal proceedings against promoter / KMP — name the proceeding, name the parties
- Outstanding criminal proceedings
- Tax disputes specifically quantified
- Regulatory action against the company in the last 3 years
- Specific contracts that may not be renewable
- Specific raw material dependence (one supplier, one geography)

**Where to find it:** "Risk Factors" — always early, pp.30-80 typically.

Required output: extract the **specific** risk factors only. Generic ones get one line: "Standard generic risks listed (competition, economy, regulation)." Most of the value is in the specific ones.

## §7 Promoter & Management Analysis

- Names of promoters and KMPs
- Educational and professional background
- Pre-IPO and post-IPO promoter holding
- Promoter compensation in last 3 years (Rs Cr) — and as % of PAT
- Past businesses run / built (successes and failures)
- Any pending legal proceedings against promoters or KMPs
- Conflicts of interest disclosed (other businesses run by promoters)
- Recent changes in board / senior management

**Where to find it:** "Our Management" + "Our Promoters" sections, plus "Outstanding Litigation" annexure.

**Flag if:**
- Promoter compensation > 5% of PAT (concentrated extraction)
- Multiple legal proceedings against promoters (count them)
- Other businesses by promoters in same line of business — high conflict risk
- Recent KMP departures pre-IPO
- Promoter doesn't have prior track record of building businesses

## §8 Related Party Transactions

- List of all RPTs by counter-party name
- Nature of each transaction (sale, purchase, loan, lease, royalty, etc.)
- Amounts (Rs Cr) for each of the last 3 years
- Names that look like value extraction (royalty / brand-fee / property-rent)
- Loans/advances to promoter entities

**Where to find it:** RPT note within Restated Financials. Typically several pages.

**Flag if:**
- RPT counter-parties are in the same line of business as the company
- RPT growing materially faster than revenue
- Large royalty payments to promoter entity for "brand"
- Property rented from promoter at non-market rates
- Loans/advances to promoter entities with no commercial rationale

## §9 Peer Comparison & Valuation

- 3-6 listed peers identified by the company
- For each: Revenue, margins, P/E, P/B, EV/EBITDA at filing date
- Implied valuation at price band's upper end
- IPO P/E vs peer median P/E

**Where to find it:** Either in "Basis for Issue Price" section or scattered across "Industry" + "Risk Factors".

**Flag if:**
- The "comparable peers" list is curated (e.g., excludes the most analogous peer to avoid showing premium pricing)
- IPO P/E > 1.5× peer median without superior fundamentals justifying the premium
- Industry-comparison metrics use a different basis than peer reporting

## §10 Red Flags — Composite Checklist

See [`drhp_red_flags.md`](drhp_red_flags.md) for the full checklist. The composite output is a table:

```
| # | Red flag                            | Rating  | Evidence                          | Page |
|---|--------------------------------------|---------|-----------------------------------|------|
| 1 | Negative CF with positive profit     | GREEN   | CFO positive 3Y                   | p.310 |
| 2 | Sudden profit spike pre-IPO          | YELLOW  | PAT FY24 +71%; FY25 +83%          | p.305 |
| 3 | Large OFS component                   | RED     | OFS 65% of total issue            | p.95  |
| 4 | Auditor qualification / change       | GREEN   | Same auditor 6 years; clean       | p.275 |
| 5 | Heavy client concentration           | RED     | Top 3 customers = 58% of revenue  | p.245 |
| ... |
```

The number of RED flags drives the subscription view:
- 0 RED → SUBSCRIBE candidate (subject to valuation check)
- 1-2 RED → SUBSCRIBE-FOR-LISTING-GAINS-ONLY or WATCH-POST-LISTING
- 3+ RED → AVOID
