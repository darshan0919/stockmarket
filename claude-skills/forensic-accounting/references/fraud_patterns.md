# Fraud Pattern Library

Four documented Indian fraud cases — Gensol, Brightcom, Manpasand, IndusInd — distilled into pattern-matching templates. Run every forensic against each pattern; mark MATCH (RED), PARTIAL MATCH (YELLOW), or NO MATCH (GREEN) with evidence.

These are not the only fraud patterns. They are the *most-documented* and have public SEBI orders / regulatory findings. New patterns should be appended as they emerge.

---

## Pattern 1 — Gensol Engineering (FY24): Loan diversion via shells

### What happened
₹978 Cr in loans obtained ostensibly for purchasing 6,400 EVs. Only 4,704 EVs were actually purchased for ₹568 Cr. The remaining ₹262 Cr was diverted through shell entities (Wellray Solar Industries, Go Auto Pvt Ltd) controlled by promoters — used for luxury real estate, personal stock trading, and a circular share-subscription scheme. Stock fell 92% from ₹773 → ₹166. SEBI bar order April 2025; final fraud confirmation July 2025.

### The 11 visible red flags in the FY23-24 AR

**Cash flow signals:**
- Negative CFO: -₹98 Cr in FY24 vs +₹115 Cr in FY23
- Required >₹1,000 Cr in fresh borrowings to maintain positive overall cash flow
- Receivables growing disproportionately faster than revenue

**Balance sheet signals:**
- Current liabilities up 310% (from ₹2 B to ₹8 B in FY24)
- Long-term debt up 93.4% to ₹9 B
- Suspicious RPTs with Matrix Gas, Wellray Solar, Go Auto

**Governance signals:**
- Frequent CFO changes
- Audit committee reconstitution
- Two consecutive years of missed revenue guidance
- Transparently.AI gave an "F" rating (worst 3% globally)

### Pattern-match prompt
> Check the company's last 3 ARs against the Gensol pattern: (a) is CFO negative or sharply deteriorating? (b) is fresh borrowing being used to fund operations rather than capex? (c) are RPTs growing faster than revenue with promoter-controlled entities in the same line of business? (d) are there CFO changes or audit-committee reconstitutions? (e) any circular schemes — promoter-controlled entity subscribing to the company's preferential issue? Mark each as MATCH/PARTIAL/NO MATCH with evidence.

### Detection window
13 months between FY23-24 AR filing (March 2024) and SEBI interim order (April 2025).

---

## Pattern 2 — Brightcom Group (FY15–FY20): Overcapitalisation + OCI dumping

### What happened
Hyderabad-based digital advertising company. Systematic accounting fraud over six years inflated profits by ₹1,280 Cr through two layers:
- **Layer 1:** ₹504 Cr wrongly capitalised as R&D (research-phase costs that under Ind AS 38 must be expensed)
- **Layer 2:** ₹868.30 Cr impairment recognised in OCI (Other Comprehensive Income) instead of P&L — hiding losses while keeping reported profits high
- **Layer 3:** Inflated financials enabled promoters to sell down from 40.45% (Mar 2014) to 3.51% (Jun 2022) at artificially elevated prices

Stock fell 88% from peak. SEBI interim order April 2023.

### Pattern-match prompt
> Check the company's intangible assets and impairment policy against the Brightcom pattern: (a) is "Intangible Assets Under Development" growing materially YoY? (b) what proportion of R&D is capitalised vs expensed, and has the policy changed in any of the last 3 years? (c) are impairment charges appearing in OCI rather than P&L? (d) calculate intangible-assets-to-revenue ratio — flag if >25% and growing. (e) cross-check promoter holding trend — has it declined materially during a period of "strong" reported earnings?

### Detection window
~3 years (FY19-20 AR published June 2020 → SEBI interim April 2023).

---

## Pattern 3 — Manpasand Beverages (FY18): Auditor resignations + circular trading

### What happened
Vadodara-based fruit juice manufacturer. ~30 fake operational units, 38 bogus paper firms, ₹300 Cr fake turnover via circular trading, ₹40 Cr fraudulent ITC.

**The biggest red flag was public.** Deloitte, the statutory auditor, resigned May 2018 citing:
> "Significant information requested was not provided."  
> "No further progress with respect to the pending information, evidences and explanations."  
> "Unable to complete the statutory audit for the year ended March 31, 2018."

The replacement auditor, Mehra Goel & Co., **also resigned** in July 2019, citing "recent developments". MD arrested May 2019.

Stock fell 98% from ₹372 → ₹7.50.

### Pattern-match prompt
> Check the company's auditor history over the last 5 years against the Manpasand pattern: (a) any auditor resignation citing non-cooperation, non-availability of information, or "unable to complete the audit"? Even a single such resignation = SELL signal. (b) have there been TWO consecutive auditor changes within 18 months? (c) is the new auditor a smaller / less reputable firm than the predecessor? (d) does the auditor change letter cite "rotation" without substantive justification? Two consecutive resignations is statistically near-zero probability for a legitimate company.

### Detection window
1 year (Deloitte resignation May 2018 → CGST raids May 2019).

---

## Pattern 4 — IndusInd Bank (FY15–FY25): Derivatives accounting

### What happened
Major private-sector bank. Grant Thornton confirmed "incorrect accounting of derivatives trades" with cumulative adverse P&L impact of ₹1,959.98 Cr as of March 31, 2025. Irregularities went back to 2015. Former CFO Gobind Jain submitted **four resignation letters** beginning April 2024, "repeatedly urging" the MD/CEO to appoint an external auditor. Insider-trading allegations parallel to the disclosure timeline.

### Pattern-match prompt (for banks/NBFCs only)
> Check the bank's derivatives book against the IndusInd pattern: (a) extract notional value of outstanding derivative contracts; (b) track 5-year growth in notional vs growth in loan book — is derivatives growing faster? (c) reconcile derivative P&L impact in the income statement with: change in MTM positions on the balance sheet AND actual cash flows from derivatives. Flag any mismatches. (d) compute derivatives-to-total-assets and derivatives-P&L-to-total-income. Compare to peers (HDFC, ICICI, Axis, Kotak) — is the company an outlier? (e) are there any CFO/CRO resignations in the last 24 months that cite governance or controls concerns?

### Detection window
1 year (CFO resignation April 2024 → GT confirmation early 2025), but pattern was visible to anyone scrutinising derivatives disclosures throughout the prior decade.

---

## How to integrate these patterns into the forensic output

The PDF generator (`generate_forensic_pdf.py`) renders a **fraud-pattern-match table** at the end of the report:

```
| Pattern              | Match    | Evidence                                  |
|----------------------|----------|-------------------------------------------|
| Gensol (loan diversion) | NO MATCH | CFO positive 3Y; RPTs at 4% revenue; no CFO changes |
| Brightcom (OCI dumping) | PARTIAL | Intangibles up 38% YoY but no OCI impairments; YELLOW |
| Manpasand (auditor)  | NO MATCH | Same auditor 12 years; unqualified opinion |
| IndusInd (derivatives) | N/A    | Not a financial-services company         |
```

If any pattern returns MATCH, the **overall rating is automatically RED** regardless of other section findings — these are not soft thresholds.

## Adding new patterns

When SEBI issues a new public order on accounting fraud, add a Pattern N section here with the same structure: what happened → visible red flags → pattern-match prompt → detection window. The Generator automatically picks up new patterns from this file.

Suggested next patterns to research and add:
- DHFL (FY18-19) — wholesale loan disclosures
- Yes Bank (FY18-20) — bond AT1 disclosures, CEO compensation
- Coffee Day Enterprises (FY19) — opaque inter-company loans
- Reliance Communications — guarantees / off-BS items
