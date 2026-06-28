---
name: equity-research-master
description: >-
  End-to-end workflow for institutional equity research on a single listed
  company. Orchestrates extraction, dashboard, deepdive, 1-pager, and Q-o-Q
  diff sub-skills into ONE interactive 16-tab HTML dashboard. Use for full
  workups — "research [TICKER]", "full equity research", "institutional
  dashboard for X", "complete analysis", or when a ticker is provided without
  a scoped deliverable. Requires only a Stockscans ticker as input; all
  documents are auto-fetched. Output is a single [TICKER]_MasterDashboard.html
  with no parallel PDFs.
---

# Equity Research Master

One skill → one artifact: `[TICKER]_MasterDashboard.html`.

Route to the individual sub-skill if the user explicitly asks for just a 1-pager, just a diff, or just the dashboard.

## Inputs

- **Required:** ticker in Stockscans format (e.g. `NSE:BSE`, `NSE:SWARAJENG`). This is the only mandatory input — all documents are auto-fetched in Phase 1.
- **Optional:** pre-downloaded PDFs in `~/Research/[TICKER]/` (skips Phase 1 document fetch); `[TICKER]_MasterData.xlsx`.

## Hard rules (productivity first)

1. **One extraction pass.** 5 `.txt` extracts + `MasterData.xlsx` are the ONLY raw inputs downstream phases read.
2. **Compute-once schemas.** KPI / valuation / triggers / Q-o-Q deltas / forensic flags computed once (Phase 3), cached as JSON, consumed by every tab.
3. **Single render target.** No PDFs. Sub-skills' analytical frameworks reused; their PDF generators skipped.
4. **Parallel acquisition.** All fetcher calls in Phase 1 run concurrently where possible.
5. **Conditional Tab 15.** Renders only if `Investor_Presentations/` has ≥2 decks.

## Phases

**0 — Intake.** Resolve company name and meta from ticker (web search Screener.in for the company name). Create research root:
```bash
TICKER="NSE:SWARAJENG"            # replace with actual ticker
RESEARCH_ROOT=~/Research/$TICKER
mkdir -p "$RESEARCH_ROOT/Annual_Reports" "$RESEARCH_ROOT/Concalls" \
         "$RESEARCH_ROOT/Investor_Presentations" \
         "$RESEARCH_ROOT/Credit_Rating_Reports" "$RESEARCH_ROOT/Events_Announcements"
```

**1 — Acquisition.** Skip if user has already supplied PDFs in the research root. Otherwise, run all fetches in parallel (use background `&` processes):

```bash
# Standardised filings via stock-documents-fetcher
python3 /tmp/fetch_documents.py "$TICKER" \
    -t "Annual Report" --last-n 5 -o "$RESEARCH_ROOT/Annual_Reports" &

python3 /tmp/fetch_documents.py "$TICKER" \
    -t Transcript --last-n 8 -o "$RESEARCH_ROOT/Concalls" &

python3 /tmp/fetch_documents.py "$TICKER" \
    -t PPT --last-n 8 -o "$RESEARCH_ROOT/Investor_Presentations" &

# Corporate announcements (credit rating + events)
python3 /tmp/fetch_announcements.py "$TICKER" \
    --search 'rating|outlook|downgrade|upgrade' --max-pages 10 \
    -o "$RESEARCH_ROOT/Credit_Rating_Reports" &

python3 /tmp/fetch_announcements.py "$TICKER" \
    --search 'merger|acquisition|capex|order|buyback|dividend' --max-pages 10 \
    -o "$RESEARCH_ROOT/Events_Announcements" &

wait   # wait for all background fetches to complete

# Screener MasterData.xlsx — still via local backend (not on Stockscans)
cd backend && npm start &
# [fetch Screener export per existing backend API]
```

Each folder will contain a `manifest.json` after fetching. Read the manifests to confirm counts before proceeding to Phase 2.

**2 — Single extraction pass.** `GET /api/research-pipeline/prompts/unified_master?company=<name>&ticker=<TICKER>`; apply once → 5 `.txt` files (AR / Concall / InvestorPres / RatingReports / Events). See [`equity-research-extraction`](../data-extraction/SKILL.md).

**3 — Compute shared schemas** (`scripts/orchestrate.py compute-schemas --ticker [TICKER]`) → `_cache/schemas.json`:
- `kpi_table` (revenue, EBITDA, PAT, margins, ROCE, ROE) → Tabs 0, 4, 5
- `valuation_ladder` (TTM P/E, FY+1 P/E, peer median, DCF PT) → Tabs 0, 8, 9
- `triggers` (5–7 catalysts + conviction + timeline) → Tabs 0, 5, 9
- `qoq_deltas` (P&L, BS, KPI, surprise objects) → Tabs 4, 8, 15 (only if ≥2 decks)
- `forensic_flags` (CFO/PAT, WC days, RPT) → Tab 7

**4 — Narrative fan-out (no PDFs).** Run sub-skill analysis, route to tab slots:
- Deepdive 19-section framework → routed per tab (see [`deepdive/references/research_template.md`](../deepdive/references/research_template.md))
- 1-pager 5-section framework → Tab 9 + Tab 0 verdict badge
- Consecutive-filings-diff → Tab 15 widget (conditional)

**5 — Pre-generation gate.** Emit the **PRE-GENERATION BRIEF** from [`equity-research-dashboard`](../dashboard-generation/SKILL.md), extended with a Tab 15 row. Wait for `GENERATE`.

**6 — Render.** Base = `backend/prompts/institutional-equity/dashboard_master_v4.txt`. Inject narrative fragments + append Tab 15 from [`templates/tab15_qoq_diff.html`](templates/tab15_qoq_diff.html). Project B non-negotiables apply unchanged (single HTML, ASCII minus, CSS vars in both themes, `getElementById('tab-N')`, Chart.js 4.4.1, `---------` for missing).

**7 — Publish.** `POST /api/stocks/:symbol/research-dashboard`.

## Tab routing (16 tabs)

Base = 15 from `equity-research-dashboard`. Additions:

| Tab | Sub-skill additions |
|---|---|
| 0 Exec Summary | +deepdive verdict, +1-pager conviction score |
| 1 Overview | +deepdive description |
| 2 Business | +deepdive moat/segments |
| 3 Industry | +deepdive competitive positioning |
| 4 Financials | +deepdive narrative, +diff deltas |
| 5 Growth | +1-pager triggers timeline |
| 6 Estimates *(conditional)* | +deepdive scenarios |
| 7 Forensics | +deepdive quality checks |
| 8 Valuation | +deepdive scenario PT, +diff repricing |
| 9 Thesis | **+1-pager 5–7 triggers (primary home)** |
| 10 Risks | +deepdive bear case |
| 11 Concall | **+diff concall reconciliation** |
| 12 Cap. Alloc. | +deepdive capex/M&A |
| 13 Ownership | — |
| 14 Events | — |
| **15 Q-o-Q Diff** (NEW) | **consecutive-filings-diff widget** |

Missing `_Estimates.txt` → omit Tab 6 and renumber (per dashboard rule).

## Files

- `SKILL.md` — this file
- `scripts/orchestrate.py` — `acquire` / `compute-schemas` / `publish` subcommands
- `templates/tab15_qoq_diff.html` — Tab 15 fragment

## Troubleshooting

- **Backend port drift:** read from server stdout, not `:5000`.
- **No MasterData.xlsx:** prompt user for Screener export before Phase 3.
- **<2 decks:** skip Tab 15 entirely (don't render empty placeholder).
- **Stale cache:** `rm -rf ~/Research/[TICKER]/_cache/`.
- **Authtoken expired:** fetcher will print a hard error. Ask user to refresh `Stockscans_authtoken` project file (browser DevTools → Cookies → `authtoken` on stockscans.in). Token expires roughly every 3–4 weeks.
- **0 documents for a type:** that document type may not be available for this company (e.g. SWARAJENG has no PPT or Transcript — they're common for smaller companies). Proceed with what's available; the downstream extraction will skip empty folders.
