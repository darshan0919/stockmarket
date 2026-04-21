---
name: equity-research-extraction
description: Institutional equity research PDF extraction pipeline — turns raw PDFs in 5 category folders into analyst-ready `.txt` extracts for dashboard generation. Use when the user attaches or organizes equity research PDFs, mentions Project A, forensic AR extracts, concall extraction, NSE/BSE filings, or filenames like `[TICKER]_AR_Extracts.txt`.
---

# Equity research extraction (Project A)

## Goal

PDFs in 5 folders → 5 high-signal `.txt` extracts feeding [equity-research-dashboard](../dashboard-generation/SKILL.md) (Project B). Output is **condensed analyst-ready**, not verbatim — except where the prompt requires verbatim (auditor qualifications, KAMs, some policy changes).

## Folder layout

Research root `~/Research/[COMPANY]/`:
`Annual_Reports/`, `Concalls/`, `Investor_Presentations/`, `Credit_Rating_Reports/`, `Events_Announcements/`.
Empty / missing folders are skipped.

## Outputs (use actual NSE ticker)

| File | Source folder |
|---|---|
| `[TICKER]_AR_Extracts.txt` | `Annual_Reports/` |
| `[TICKER]_Concall.txt` | `Concalls/` |
| `[TICKER]_InvestorPres.txt` | `Investor_Presentations/` |
| `[TICKER]_RatingReports.txt` | `Credit_Rating_Reports/` |
| `[TICKER]_Events.txt` | `Events_Announcements/` |

## Prompt

Single canonical prompt: [`prompts/unified_master.txt`](prompts/unified_master.txt). Runs all 5 tasks in order; ends with `EXTRACTION COMPLETE` summary.

Synced copy at `backend/prompts/institutional-equity/unified_master.txt` for the app API — keep wording aligned when edited.

## Principles

- Preserve exact numbers, dates, and verbatim auditor/KAM/guidance text.
- Missing sections: `Not disclosed / Not available`.
- Note image-only / scanned pages in extraction issues.

## Troubleshooting

- **Scanned PDFs:** OCR first; flag partial extraction in notes.
- **Missing doc type:** skip; downstream tolerates absent outputs.
