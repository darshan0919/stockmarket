---
name: capex-timeline-tracker
description: >-
  Institutional-grade Capex Lifecycle & Timeline Tracker for Indian listed companies.
  Reconstructs the full chronological journey of manufacturing expansions, plant commercialization,
  and greenfield/brownfield capital expenditure across all statutory filings (Prospectus/RHP, Annual
  Reports, Monitoring Agency reports, SEBI Reg 30 updates, quarterly results, investor presentations).
  Extracts exact capital outlays, funding mix (IPO proceeds, debt, internal accruals), site specifics
  (location, plot size), cumulative installed capacity progression, incremental & peak revenue potential,
  turnkey contractors, committed/tentative future milestone dates, and correlates information leakage with
  exchange price-volume accumulation waves. Emits a unified vertical chronological timeline and institutional
  HTML/PDF reports. Use for "capex timeline", "track capex for X", "when does capacity come online",
  "capex report", "manufacturing expansion tracker", or deep multi-plant capital expenditure audits.
---

# Capex Timeline Tracker

A specialized equity research skill to reconstruct, audit, and visualize the complete capital expenditure (capex) and capacity expansion lifecycle of Indian listed companies (`NSE:SYMBOL` / `BSE:CODE`).

---

## 1. When to Use This Skill

- User asks for a capex timeline or manufacturing expansion report for an Indian listed company.
- "When does capacity come online for [Company]?"
- "Track capex progression, funding, and revenue potential for [Company]."
- "Audit all plant expansions (greenfield/brownfield) across filings."
- "What is the committed timeline vs actual status of project completion?"
- Analyzing whether recent price-volume surges reflect information diffusion around plant commissioning.

---

## 2. Core Pillars & Primary Key Metrics

Every capex audit MUST extract and synthesize the following primary metrics across official primary sources:

1. **Filing Dates & Milestone Traceability:**
   - Every capex event, cost revision, and status update must be linked to its exact statutory filing date, document type, and exchange disclosure.
2. **Revenue Potential (Incremental & Peak):**
   - Sizing of incremental top-line potential per plant/line, peak asset-turnover ratios, and comparison against the company's historical revenue base.
3. **Cumulative Capacity & Production Progression:**
   - Tracking capacity evolution across stages: Historical Baseline → Debottlenecking → Wave 1 (Brownfield) → Wave 2 (Greenfield) → Fully Scaled Potential.
4. **Future Committed / Guided Dates (Tentative vs Statutory):**
   - Offer Document (RHP) target dates vs management commentary vs Monitoring Agency delay assessments.
5. **Funding Mix & Capital Deployment:**
   - Precise breakdown of how each capex phase is financed: IPO/QIP proceeds, bank borrowings, internal cash accruals, or promoter warrants.
   - Status of unutilized issue proceeds (e.g., funds parked in bank Fixed Deposits vs active contractor drawdowns).
6. **Turnkey Partners & Engineering Scope:**
   - Turnkey contractors, engineering consultants, land survey/plot size (sq. metres), and chemistry/product specialization.
7. **Price-Volume Accumulation Correlated to Filings:**
   - Correlating multi-month exchange OHLCV delivery volume with disclosure milestones to identify smart accumulation waves.

---

## 3. Workflow & Step-by-Step Execution

### Phase 1: Document & Filing Discovery

Resolve company identity via `packages/jobs-runtime/lib/companyMaster.js` (`resolveCompanyId` / `resolveCompanyIdentity`).
Fetch all corporate documents across the trailing 12–24 months via `stock-documents-fetcher`:

1. **Offer Documents:** SME Prospectus / Mainboard RHP (establishes initial baseline, objects of the issue, and stated completion schedules).
2. **Monitoring Agency Reports (Reg 32 / Infomerics / ICRA / Care):** Quarterly reports detailing actual deployment vs idle funds in FDs, turnkey contract revisions, and agency delay notes ("No Delay — Ongoing").
3. **Annual Reports (Reg 34):** Management Discussion & Analysis, Directors' Report status on expansion, Gross Block, and Capital Work-in-Progress (CWIP).
4. **SEBI Reg 30 Filings:** Material disclosures on plant expansion, trial batch commencement, and press/media releases.
5. **Quarterly / Half-Yearly Results & Deviation Statements:** P&L revenue trajectory and Reg 32 deviation statements.

### Phase 2: Systematic Data Extraction

Extract the factual matrix into structured JSON:

- Plant footprints: Location, plot survey number, area in sq. metres, products manufactured.
- Capacity numbers: Baseline MTPA/MW/units vs post-expansion capacity.
- Outlays & Funding: Budgeted cost vs actual incurred, turnkey contractor name, bank loan vs IPO allocation.
- Timelines: Original RHP date, revised target date, trial batch date, commercial dispatch date.

### Phase 3: Vertical Chronological Synthesis

Assemble all disclosures into a **single, unified vertical chronological stream** rather than splitting into separate timeline and filing tables:

- Each node represents a specific date.
- Header displays: Date, Document Type / Event, and Facility Scope (`TALOD`, `INDRAD`, `VATVA`, `ALL`).
- Body details the narrative revealed.
- Metric bar highlights: Outlay / Funding, Capacity impact, and **Committed Future Milestones**.
- Color-coded badges: Green for completed/operational milestones, Amber for under-construction/pending targets, Blue for corporate baselines.

### Phase 4: Production & Revenue Scaling Model

Synthesize a 4-stage progression table:

- **Phase 0 (Base):** Baseline capacity and revenue.
- **Phase 1 (Debottlenecking):** Incremental efficiency gains.
- **Phase 2 (Wave 1 Expansion):** Brownfield completion and trial batch impact.
- **Phase 3 (Wave 2 Greenfield):** Long-term pipeline and full revenue potential.

### Phase 5: Artifact Generation & Storage

1. Persist canonical JSON DTO via `packages/jobs-runtime/lib/db.js` (`saveReport`).
2. Generate single self-contained HTML report with responsive styling and print CSS (`@page { size: A4 portrait; }`).
3. Render institutional PDF using `skills/_shared/resolve.sh render-pdf --html report.html --pdf jobs/data/rerating-catalysts/<TICKER>_Capex_Master.pdf`.
4. Copy PDF to `data/reports/` and push to Google Drive via `yarn data:push`.
5. Return the direct Google Drive sharing URL to the user.

---

## 4. Report Design Guidelines

- **No Duplication:** Avoid having both a visual horizontal flow AND a comprehensive filing table. Use a clean, **vertical chronological stream** that carries all data, metrics, and future committed milestones within each dated node.
- **Color Coding:**
  - `Completed / Commissioned`: Emerald Green (`#16a34a`, background `#dcfce7`).
  - `Under Construction / Committed Future Target`: Amber (`#f59e0b`, background `#fef3c7`).
  - `Corporate / Baseline / Audit`: Slate/Blue (`#2563eb`, background `#e0f2fe`).
- **Formatting:** Monospace font for dates and tickers, bold figures for capacities and revenue potential, and clean KPI grid cards at the top.
