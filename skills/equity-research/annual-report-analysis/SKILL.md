---
name: annual-report-analysis
description: >
  12-point qualitative Annual Report analysis for Indian listed companies — management
  letters, industry triggers, related-party transactions, contingent liabilities,
  miscellaneous expenses, capex commercialisation, auditor notes, aggressive accounting
  policies, remuneration-vs-PAT linkage, KMP resignations, walk-the-talk execution check,
  and a governance verdict. Use whenever the user uploads an annual report and asks
  "analyse this AR", "summarise the annual report", "what do the MD/CEO letters say",
  "governance check from the AR", "is remuneration reasonable", or gives a ticker + FY
  and wants an AR read. Auto-fetches the AR from Stockscans when given only a ticker.
  Distinct from forensic-accounting (numbers-led fraud detection) — this is the
  understanding-and-governance read; delegate deep forensics there.
---

# Annual Report Analysis (12-Point)

Source: SOIC Annual Report prompt (Google Doc library) + extraction discipline from the
Dashboard Extraction Guide. Mandatory: `skills/_shared/data-verification.md` — answer only
from the AR; "not found in this AR" beats inference; preserve auditor language and policy
changes VERBATIM.

You are analysing as a world-class equity analyst. Work through all 12 points; for each,
cite the AR section/page:

1. **Leadership letters** — summary of MD / Chairman / CEO / CFO letters: key business
   highlights, opportunities, weaknesses, overall strategy. Quote the load-bearing lines.
2. **Industry** — growth rates cited (with source), key industry triggers and trends.
3. **Related-party transactions** — table: Counterparty | Nature | ₹ Cr | % of revenue |
   Outstanding. Flag new counterparties, growing quantum, or changed nature YoY.
4. **Contingent liabilities** — total ₹ Cr, % of net worth (flag if >10%), items growing
   > 50% YoY.
5. **Miscellaneous expenses** — as % of revenue (flag if >3% of sales) and of other expenses.
6. **Capex** — future plans AND commercialisation of past capex (CWIP ageing: anything
   stuck >2 years without capitalisation).
7. **Auditor** — opinion type, every qualification / EoM / KAM verbatim, CARO highlights,
   IFC opinion. KAMs appearing/disappearing vs prior year.
8. **Accounting policies** — any aggressive choices: revenue recognition, capitalisation
   (R&D/interest/pre-operative), depreciation/inventory method changes, P&L-vs-OCI routing
   (Brightcom pattern).
9. **Remuneration** — KMP remuneration summary, as % of revenue AND of PAT; is it linked to
   PAT and does it flex down in a bad year?
10. **KMP resignations** — any CFO/auditor/director exits; frequency over recent years.
11. **Walk the talk** — is the business executing what last year's AR promised? (For a full
    multi-quarter guidance audit, delegate to `management-credibility-tracker`.)
12. **Governance check** — board independence, disclosure quality, promoter conduct;
    conclude with a governance rating: GOOD / AVERAGE / CONCERNING.

## Output

Per `skills/tooling/output-dto-standard/SKILL.md`, persist the analysis as a JSON DTO
BEFORE rendering — never generate the MD/PDF directly from live reasoning with no
intermediate artifact.

1. **Write the DTO first.** Save `{TICKER}_annual_report_analysis.json` (e.g. to
   `data/agent-outputs/`) shaped like:

   ```json
   {
     "companyId": "NSE:SWARAJENG",
     "creationTime": "2026-07-07T00:00:00Z",
     "modifiedTime": "2026-07-07T00:00:00Z",
     "creator": "annual-report-analysis",
     "modelUsed": "claude-sonnet-5",
     "fiscalYear": "FY25",
     "points": [
       {
         "id": 1,
         "title": "Leadership letters",
         "citation": "MD letter, p.4",
         "chip": "GREEN",
         "findings": "..."
       }
       // ... one entry per of the 12 points, each with citation + chip + findings
     ],
     "governanceRating": "GOOD",
     "topFindings": ["...", "...", "..."],
     "whatCouldBeWrong": "..."
   }
   ```

   `companyId` uses the same Stockscans-style ticker convention as the rest of the
   codebase (e.g. `"NSE:SWARAJENG"`). If re-running for the same company/FY, read the
   existing JSON first and preserve its original `creationTime`, only bumping
   `modifiedTime`.

2. **Render from the DTO.** Only after the JSON is written, produce the crisp,
   easy-to-understand note (MD or PDF via `render-pdf`) as a template pass over that
   JSON: findings per point with citations, a Green/Yellow/Red chip per point (driven by
   `points[].chip`), and a conclusion summarising the 3 most important findings
   (`topFindings`). End with "What could be wrong with this analysis?" (`whatCouldBeWrong`)
   plus what to verify outside the AR. Do not introduce facts in the rendered output that
   aren't already in the JSON — if something needs to change, update the JSON first, then
   re-render.

## Handoffs

- Numbers-led red flags → run `forensic-accounting` (53-checkpoint scan).
- Feed `investment-thesis-engine`: Promoter pillar evidence (points 3, 7–12) and
  monitorables (points 4–6).
