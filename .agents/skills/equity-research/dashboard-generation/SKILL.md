---
name: equity-research-dashboard
description: Generates a single self-contained institutional HTML equity dashboard (Chart.js, 15 tabs, PRE-GENERATION BRIEF, dark/light) from Screener.in MasterData.xlsx plus Project A .txt extracts. Use when the user has [TICKER]_MasterData.xlsx, extraction .txt files, mentions Project B, institutional dashboard, Tab 0–14, or GENERATE gate after PRE-GENERATION BRIEF.
---

# Equity dashboard generator (Project B)

## Goal

Produce **one** offline-capable `[TICKER]_Dashboard.html`: institutional-grade sections, Chart.js **4.4.1** from CDN only, strict design-system and JS rules from the master prompt.

## Inputs (per company)

**Required**

- `[TICKER]_MasterData.xlsx` — Screener.in export (tabs: Financials, Peers, Shareholding, Company, Ratios).  
- `[TICKER]_AR_Extracts.txt`, `[TICKER]_Concall.txt`, `[TICKER]_InvestorPres.txt`, `[TICKER]_Ra9ngReports.txt` (or consistent rating filename matching your Project A outputs).

**Optional**

- `[TICKER]_Events.txt` — feeds Events tab.  
- `[TICKER]_Estimates.txt` (or similar) — if absent, **Tab 6 (Estimates) is omitted** and nav renumbers.  
- Last-minute PDF — user specifies target tab; model extracts and routes.

Place extracts as in the workflow guide; attach all files to the LLM when running the prompt.

## Full prompt

See `prompts/dashboard_master_v4.txt` in this skill (duplicate: `backend/prompts/institutional-equity/dashboard_master_v4.txt`).

## Non-negotiables (checklist)

- Single HTML file: `<style>` in head, one `<script>` before `</body>`, no other external assets except Chart.js URL in the prompt.  
- **ASCII hyphen-minus** for negative numbers in JS arrays (no Unicode minus).  
- Doughnut/pie/radar: only non-negative data values (or abs + label).  
- Tab panes: `getElementById('tab-N')` pattern; **no** `querySelectorAll('.tab-pane')` index matching.  
- `showTab` ends with `window.scrollTo({ top: 0, behavior: 'smooth' })`.  
- CSS variables: every color used must exist in **both** `:root` and `[data-theme="dark"]`.  
- Missing data: show `---------`, never `NaN` / blank.

## Pre-generation gate

Before writing HTML, output **PRE-GENERATION BRIEF** exactly as in the prompt and **wait** for the user to reply **`GENERATE`**.

## Tabs (0–14; Estimates conditional)

Exec Summary, Overview, Business, Industry, Financials, Growth, **Estimates (conditional)**, Forensics, Valuation, Thesis, Risks, Concall, Cap. Alloc., Ownership, Events.

## Troubleshooting

- **Broken charts / blank theme:** undeclared CSS variables or Unicode minus in data.  
- **Wrong tab count:** Estimates file attached or omitted — renumber per prompt.
