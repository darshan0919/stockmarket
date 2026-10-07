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

To model future revenue accretion without relying on LLM arithmetic hallucinations:

$$\text{Incremental Revenue} = \Delta \text{Capacity} \times \text{Realization per Unit} \times \text{Expected Peak Utilization}$$

$$\text{Consolidated Peak Potential} = \text{Baseline Revenue} + \sum \text{Incremental Revenue from New Units}$$

Where:

- $\Delta \text{Capacity}$ is extracted from statutory filings.
- Realization per Unit is corroborated against past revenue/tonnage disclosures.
- Peak Utilization is typically guided by management (industry standard: 70–85% for chemical/pharma plants).
