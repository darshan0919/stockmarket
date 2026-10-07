# Capex Timeline Tracker — Methodology & Framework

## 1. Statutory Filing Hierarchy for Capex Verification

When auditing Indian listed companies for capital expenditure, rely on the following hierarchy of verification:

1. **Offer Documents (Prospectus / RHP):**
   - Objects of the Issue section explicitly defines the capital expenditure budget, civil works, plant and machinery quotations, and scheduled project completion dates.
   - Initial capacity is legally certified by independent chartered engineers.

2. **Monitoring Agency Reports (SEBI LODR Regulation 32 / 41):**
   - Required for public issues exceeding ₹100 Cr (and SME issues with monitoring mandates, e.g. Infomerics, Care, ICRA).
   - Replaced by Audit Committee reviews if below threshold.
   - Verifies whether contracts were awarded on turnkey basis, contractor names, idle funds parked in bank Fixed Deposits, and explicit delay comments ("No Delay", "Delayed by X months").

3. **Annual Report (Directors' Report & MD&A):**
   - Section 134(3) of Companies Act: Report on the state of company affairs.
   - Mandatory disclosure of plant expansions, trial runs, and commercialization.
   - Property, Plant & Equipment (Note on Fixed Assets) shows Gross Block additions and Capital Work-in-Progress (CWIP).

4. **SEBI Regulation 30 Material Event Filings:**
   - Mandatory intimations under Schedule III, Part A, Para B:
     - Commencement of commercial production/operations.
     - Significant capacity additions (>10%).
     - Acquisition or setting up of new manufacturing units.

---

## 2. Multi-Stage Capacity & Revenue Scaling Formula

To model future revenue accretion deterministically without relying on LLM arithmetic hallucinations, delegate all math to `stock-api/src/analyzers/capexScalingCalculator.js`:

$$\text{Incremental Revenue} = \Delta \text{Capacity} \times \text{Realization per Unit} \times \text{Expected Peak Utilization}$$

$$\text{Consolidated Peak Potential} = \text{Baseline Revenue} + \sum \text{Incremental Revenue from New Units}$$

Where:

- $\Delta \text{Capacity}$ is extracted directly from statutory filings.
- Realization per Unit is corroborated against past revenue/tonnage disclosures.
- Peak Utilization is benchmarked against management commentary (industry standard: 70–85% for chemical/pharma plants).
- For asset-turnover based models: $\text{Peak Sales} = \text{Capex Outlay} \times \text{Asset Turnover Ratio}$.

---

## 3. Model Tiering Matrix & Task Criticality (/grill-skill Alignment)

| Task Name                                          | Domain Focus                                      | Criticality Tier           | Recommended Model                                | Methodological Requirement                                                                  |
| :------------------------------------------------- | :------------------------------------------------ | :------------------------- | :----------------------------------------------- | :------------------------------------------------------------------------------------------ |
| **Walk-the-Talk Milestone Slippage & Credibility** | RHP vs Monitoring Reports vs AR delay detection   | **Mission-Critical Alpha** | Frontier (Claude 3.5 Sonnet / Opus / Gemini Pro) | Cross-checks original target dates vs actual commissioning; catches circular guidance       |
| **Production Scaling & Peak Revenue Synthesis**    | Multi-facility volume & top-line modeling         | **Mission-Critical Alpha** | Frontier Model + Script Calculator               | Uses `capexScalingCalculator.js` for math; LLM reasons on product realization mix           |
| **Capital Efficiency & Operating Leverage Audit**  | Lamba traps, CWIP aging, Asset turns              | **Mission-Critical Alpha** | Frontier Model                                   | Stress-tests debt servicing, reverse operating leverage, and capitalized interest inflation |
| **Statutory Document & Metadata Ingestion**        | Dates, filing types, turnkey partners, FD cushion | **Valuable Context**       | Balanced Model (Gemini Flash / Claude Haiku)     | Fast ingestion of structured filing parameters and regulatory text                          |

---

## 4. Adversarial Forensics: SOIC & Dr. Anil Lamba Capex Traps

Every capex audit must rigorously apply these corporate finance and fundamental principles:

### A. Dr. Anil Lamba: Operating Leverage & Break-Even Escalation Trap

- **The Principle:** Capital expenditure irreversibly shifts the company's fixed cost structure upwards (depreciation, fixed plant overheads, interest on term debt).
- **The Red Flag:** If commercial production begins during an industry cyclical downturn or customer destocking, operating leverage works in reverse. The company faces a higher break-even volume; failure to ramp utilization quickly causes operating margins and PAT to collapse.
- **The Audit Check:** Compare the company's projected EBITDA margins against historical margins during prior downcycles.

### B. Dr. Anil Lamba: CWIP Aging & Capitalized Interest Liquidity Trap

- **The Principle:** Under Ind AS 23 (Borrowing Costs), interest on qualifying assets under construction is capitalized into CWIP rather than expensed in the P&L.
- **The Red Flag:** When capex is delayed, interest accumulates inside the asset value on the balance sheet, hiding true debt servicing strain from the P&L. Once commissioned, this triggers a double penalty: an immediate depreciation spike plus direct expensing of future interest.
- **The Audit Check:** Check CWIP aging schedule in the Annual Report (Notes to Accounts). If CWIP has aged $>2$ years with recurring milestone deferrals, flag as high-risk capital trap.

### C. SOIC: Asset Turnover Dilution Test ($Sales / Net Block$)

- **The Principle:** In high-quality capital allocators, incremental capex generates equal or higher asset turnover compared to the legacy base ($Asset\ Turn \ge Legacy$).
- **The Red Flag:** If a company doubles its gross block but operates in a lower-margin, commoditized product with asset turns of $0.8\times$ (compared to $2.0\times$ on base), overall blended ROCE will permanently degrade.
- **The Audit Check:** Calculate implied asset turn ($\Delta Revenue / \Delta Gross Block$). Benchmark against peer group and historical company performance.

### D. SOIC: Management Walk-the-Talk Credibility Grade

- **Green Light:** Commissioning completed within $\pm 1$ quarter of prospectus guidance with commercial dispatches verified via customer orders or Reg 30 filings.
- **Yellow Light:** Minor slippage (1–2 quarters) due to external factors (statutory approvals, equipment import delays), but unutilized funds remain intact in Fixed Deposits with monitoring agency confirmation.
- **Red Light:** Continuous milestone goalpost shifting, unexplained contractor changes, diversion of issue proceeds to general corporate purposes, or premature capitalization without production dispatches.
