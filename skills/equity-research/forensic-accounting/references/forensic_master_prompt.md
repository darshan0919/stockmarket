# Forensic Master Prompt — 9-Section Framework

The framework adapted from "AI for the Intelligent Investor" Day 1, p.60. Apply this to every annual report under review. Each section has: trigger phrase → what to extract → threshold for flagging → required evidence format.

**Master prompt (use as-is at the top of any forensic run):**

> You are a forensic accounting expert specialising in detecting accounting fraud and earnings manipulation in Indian listed companies. The annual report (consolidated financials) is attached. Conduct a forensic check across the 9 sections below. For every red flag: quote the specific section and language; cite the page number; quantify the financial impact; rate as GREEN / YELLOW / RED per the threshold table in `_shared/conventions.md`. Do not soften findings for relationship reasons. End with an overall accounting-quality rating: GOOD / AVERAGE / BAD.

---

## §1 Brief Summary

Output: a checklist with 12 areas, each rated GREEN/YELLOW/RED with one-line evidence. This is the page a fund manager will read first; everything else is supporting detail.

Areas to rate:
1. CFO/PAT (3-yr)
2. Revenue recognition policy
3. Receivables aging
4. Inventory days trend
5. RPT quantum & growth
6. Contingent liabilities
7. Misc expenses %
8. Auditor opinion
9. CARO observations
10. Promoter pledge & holding trend
11. Capex returns vs guidance
12. Cash flow vs reported profit (5-yr)

Format:

```
| # | Area | Flag | One-line evidence | Page |
|---|------|------|-------------------|------|
| 1 | CFO/PAT 3Y | YELLOW | 0.71 (FY23 0.85 → FY25 0.61) | FY25 AR p.142 |
```

---

## §2 Revenue Recognition

**What to look for:**
- Aggressive practices: bill-and-hold, channel stuffing (loaded distributors year-end), revenue booked before delivery
- Capitalisation policy changes (e.g., R&D capitalised that was previously expensed — Brightcom pattern)
- Stage-of-completion bias on long-projects
- Sudden change in payment terms / DSO acceleration to book revenue
- Revenue from related parties growing faster than third-party revenue

**Where to find it:**
- Significant Accounting Policies note (usually Note 1 or Note 2)
- Notes that describe revenue from contracts (Ind AS 115 disclosures)
- Compare to MDA narrative on growth drivers

**Thresholds:** apply [`_shared/conventions.md` §7](../_shared/conventions.md). Specifically:
- Revenue growth without proportional CFO growth = YELLOW
- DSO drift >10 days YoY = YELLOW (>15 = RED)
- Receivables growth >1.5× revenue growth = RED

**Evidence required:** cite the policy note number AND page; show the YoY comparison numerically.

**Example (Brightcom pattern):**
> "₹504 Cr was capitalised as R&D in FY20 vs ₹187 Cr in FY19 — a 169% jump while revenue grew 23%. Under Ind AS 38, research-phase costs must be expensed, not capitalised. The accounting policy on intangibles (Note 2.7, p.68) was changed in FY20 from 'expensed when incurred' to 'capitalised when criteria met'." → **RED** [Source: FY20 AR, Notes 2.7 & 14, pp.68 & 134]

---

## §3 Cash Flow Discrepancies

**What to look for:**
- CFO < PAT for 2+ years (cash quality issue)
- CFO/EBITDA divergence widening
- Reliance on financing cash flow to fund operations (Gensol pattern: -₹98 Cr CFO funded by +₹1,000 Cr borrowing)
- Working capital releases used to inflate CFO ("one-time" reductions in receivables/inventory at year-end)

**Where to find it:**
- Cash Flow Statement (Statement of Cash Flows) — the primary document
- Notes on movement in working capital
- MDA cash-flow commentary

**Required output: a CFO-vs-PAT bridge table:**

```
| Year   | PAT  | CFO  | CFO/PAT | EBITDA | CFO/EBITDA |
|--------|------|------|---------|--------|------------|
| FY21   | 100  | 110  | 1.10    | 180    | 0.61       |
| FY22   | 115  | 90   | 0.78    | 200    | 0.45       |
| FY23   | 130  | 75   | 0.58    | 220    | 0.34       |
```

Then explain the gap. Common reasons (in order of severity):
- Genuine one-time WC investment (capex-led or new-product-led inventory build) — least concerning
- Receivables stretching with key customer — YELLOW; track DSO
- Recurring CFO < PAT with rising debt to fill the gap — RED

**Thresholds:** 3-year average CFO/PAT < 0.8 = YELLOW; <0.5 = RED.

---

## §4 Related Party Transactions (RPTs)

**What to look for:**
- RPT total as % of revenue (>10% YELLOW, >25% RED, except captive suppliers)
- Year-over-year growth in RPT vs revenue growth (RPT growing faster = circular-revenue risk)
- New related parties appearing — names you don't recognise
- Loans/advances to related parties at sub-market rates
- Promoter-controlled entities in the *same line of business* (Gensol pattern: Wellray Solar, Go Auto)
- Circular schemes: A → B → C → back to A

**Where to find it:**
- Note on "Related Party Transactions" (typically Note 38–45 in the Notes to Financial Statements)
- CARO Report comments on RPTs
- MDA mention of group entities

**Captive supplier exception:** When the company sells almost exclusively to one related party by business design (e.g., Swaraj Engines → M&M, MRPL → ONGC retail), high RPT-with-customer is structural and should be **YELLOW + context**, not RED. The flag should be on *changes* in those RPT terms (price, volume share, payment terms), not the existence of the relationship.

**Required output: an RPT table:**

```
| Related Party | Nature | FY24 | FY25 | YoY % | Arms-length? |
|---------------|--------|------|------|-------|--------------|
| ABC Ltd (promoter) | Sale of goods | 120 | 280 | +133% | Disclosed yes; verify |
```

Flag any row with: >50% YoY growth, "loan to" with no commercial rationale, sale/purchase to a name not recognisable as an industry counter-party.

---

## §5 Balance Sheet Integrity

**What to look for:**
- **Receivables aging bucket** — % > 6 months overdue (rising = bad)
- **Inventory days trend** — multi-year drift (Brightcom-style WIP buildup)
- **Intangible assets / goodwill** — sudden growth, especially "intangibles under development"
- **Write-offs** — frequency and magnitude of "exceptional items"
- **Investments in subsidiaries / associates** — losses absorbed but not written down

**Where to find it:**
- Balance Sheet face
- Notes on Trade Receivables (aging bucket usually disclosed under Ind AS)
- Notes on Inventories
- Notes on Intangibles & Goodwill — pay attention to "Intangibles under development" line item
- Note on Impairment

**Thresholds:** apply conventions §7 (DSO, inventory days, goodwill % of total assets).

**Required output:** Inventory days, DSO, payable days for 3 years; cash-conversion-cycle row at the bottom.

---

## §6 Contingent Liabilities

**What to look for:**
- Total CL as % of net worth (>10% RED)
- Year-over-year movement (any 50%+ jump = investigate)
- Tax disputes vs operating CL (tax disputes are common; rapidly growing operating disputes are concerning)
- Guarantees given to related parties (especially promoter-controlled entities outside the consolidated group)
- Off-balance-sheet items not classified as CL (e.g., letters of comfort, indemnities)

**Where to find it:**
- Note on "Contingent Liabilities and Commitments" (always present, varies by note number)
- Auditor's Report KAMs occasionally call these out

**Threshold:** >10% of net worth = RED unless dominated by old tax disputes that don't move.

---

## §7 Miscellaneous Expenses

**What to look for:**
- "Misc expenses" or "Other expenses" line as % of total revenue
- Trend over 3 years (rising sharply without explanation = RED)
- Sub-line items disclosed: legal & professional, donations, business promotion, "miscellaneous"
- Donations growing materially (CSR-mandated or corporate-discretionary?)

**Threshold:** >3% of revenue = RED. Many high-quality businesses sit at 1.5–2.5%.

**Why this matters:** misc expenses are the primary slush bucket where money for promoter benefit often rides — undefined "professional fees", "consultancy", "advisory" with no detail.

**Required output:** 3-year trend of misc expenses + a one-line note on what % of misc is described in detail in the Notes vs unexplained.

---

## §8 MDA Consistency Check

**What to look for:**
- MDA describing "strong demand" while order book shrinks
- Margin commentary inconsistent with the actual reported numbers (very common — analysts gloss over)
- Capex completion claims that don't reconcile with PP&E additions
- Management not addressing a known industry headwind that peers ARE addressing
- "Outlook" sections written in such generic terms they could apply to any company

**Where to find it:**
- MD&A section (front of AR)
- Cross-check against: actual P&L, segment reporting, Notes on PP&E movements

**Output:** a 3-column table: MDA Claim | Actual Number from FS | Match? (Y/N + comment)

---

## §9 Auditor's Report — CARO, KAMs, Qualifications

**The single most important section.** If the auditor flagged something, the analyst missed it for a reason.

**What to look for:**

**a) Auditor changes:**
- Any change in last 3 years → investigate
- 2+ changes → RED automatically
- Stated reason of "rotation" only valid if the firm being rotated to is reputable AND prior audit committee had no documented concerns
- Auditor resignation citing "non-availability of information" or "non-cooperation" = SELL signal (Manpasand pattern)

**b) Key Audit Matters (KAMs):**
- Read every KAM verbatim. Quote the exact language.
- Common high-signal KAMs: revenue recognition, inventory valuation, impairment of goodwill, derivatives accounting (IndusInd pattern), provisioning for ECL/loan losses, deferred tax recoverability

**c) CARO Report:**
- Specific items to check and their flag levels:
  - Para 3(i)(a)–(c): PP&E records & verification → mostly informational
  - Para 3(ii): Inventory verification → flag if material differences
  - Para 3(iii)(a)–(f): Loans/advances/guarantees to related parties → cross-reference §4
  - Para 3(vii)(a)–(b): Statutory dues delays → YELLOW if recurring
  - Para 3(ix)(a)–(c): Default in repayment of borrowings → automatic RED if default disclosed
  - Para 3(xi)(a): Fraud detected during the year → automatic RED
  - Para 3(xx): Internal financial controls — adverse remarks = RED

**d) Qualified opinion:**
- Any qualification, regardless of materiality claim by auditor = automatic RED.
- "Emphasis of Matter" is NOT a qualification but is a YELLOW signal.

**Output format:**
- Auditor name + tenure: `<Firm name>, <X years>`
- Recent changes: list with reasons
- KAMs: bullet list with verbatim heading + 1-line description
- CARO red flags: itemised
- Opinion: Unqualified / Emphasis of Matter / Qualified / Adverse / Disclaimer

---

## Output structure (full PDF)

The PDF generated by `generate_forensic_pdf.py` has:

1. **Page 1:** company snapshot + KPI strip + overall rating + the §1 checklist
2. **Pages 2–6:** sections 2–9 (one per page or two per page if data is light)
3. **Pages 7+:** Piotroski F-Score table, DuPont table, fraud-pattern-match table, sources

Length is data-driven; expect 4–8 pages. Sections with no findings can be condensed to a 2-line "no issues detected, evidence: …".

## Final rating logic

After running all 9 sections, compute the overall rating:

- **GREEN (Accounting Quality: GOOD)** — All 12 checklist items GREEN; Piotroski 6+; CFO/PAT 3Y > 0.85; no auditor change in 3 years; no CARO red flags
- **YELLOW (Accounting Quality: AVERAGE)** — Up to 3 YELLOW checklist items; Piotroski 4–5; CFO/PAT 0.6–0.85; minor CARO observations
- **RED (Accounting Quality: BAD)** — Any RED checklist item; OR Piotroski ≤3; OR CFO/PAT 3Y < 0.5; OR auditor change without clear rotation reason; OR CARO Para 3(ix)/(xi)/(xx) red flag; OR qualified opinion

The rationale section must explicitly cite which threshold(s) drove the overall rating.
