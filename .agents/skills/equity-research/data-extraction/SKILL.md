---
name: equity-research-extraction
description: Runs the institutional equity research PDF extraction pipeline (annual reports, concalls, investor decks, credit ratings, events) into analyst-ready .txt files. Use when the user attaches or organizes equity research PDFs, mentions Project A, forensic AR extracts, concall extraction, NSE/BSE filings, or filenames like [TICKER]_AR_Extracts.txt.
---

# Equity research extraction (Project A)

## Goal

Turn raw PDFs in five category folders into structured, high-signal `.txt` extracts for dashboard generation (Project B). Prefer **condensed analyst-ready output**, not verbatim dumps—except where the prompts require verbatim (auditor qualifications, KAMs, some policy changes).

## Folder layout

At the research root (example: `~/Research/COMPANY_NAME/`):

- `Annual_Reports/` — annual report PDFs  
- `Concalls/` — earnings call transcripts  
- `Investor_Presentations/` — investor presentation PDFs  
- `Credit_Rating_Reports/` — rating agency reports  
- `Events_Announcements/` — exchange filings, press releases, etc.  

Subfolder names are flexible (case-insensitive). Empty or missing folders are skipped.

## Output files (use actual NSE ticker)

| Output | Typical location |
|--------|------------------|
| `[TICKER]_AR_Extracts.txt` | `Annual_Reports/` |
| `[TICKER]_Concall.txt` | `Concalls/` |
| `[TICKER]_InvestorPres.txt` | `Investor_Presentations/` |
| `[TICKER]_Ra9ngReports.txt` or `[TICKER]_RatingReports.txt` | `Credit_Rating_Reports/` |
| `[TICKER]_Events.txt` | `Events_Announcements/` |

**Note:** Source guide OCR may use `Ra9ng`; filesystem naming can use `Rating` for clarity—stay consistent with Project B inputs.

## Prompts (copy from files)

All full prompts live in this skill’s `prompts/` directory:

- `unified_master.txt` — one session, all five tasks in order (recommended).
- `annual_reports.txt`, `concalls.txt`, `investor_presentations.txt`, `credit_ratings.txt`, `events_announcements.txt` — run one document type at a time (advanced).

**Synced copy:** The same files exist under `backend/prompts/institutional-equity/` for the app API; keep wording aligned if you edit one side.

## Execution order (unified)

1. TASK 1 — Annual reports → `✓ [TICKER]_AR_Extracts.txt complete`  
2. TASK 2 — Concalls → `✓ [TICKER]_Concall.txt complete`  
3. TASK 3 — Investor presentations → `✓ [TICKER]_InvestorPres.txt complete`  
4. TASK 4 — Credit ratings → `✓ [TICKER]_Ra9ngReports.txt complete`  
5. TASK 5 — Events → `✓ [TICKER]_Events.txt complete`  

End with **EXTRACTION COMPLETE** summary block as specified in the unified prompt.

## Principles (summary)

- Preserve **numbers, dates, verbatim auditor/KAM/guidance** where required; paraphrase boilerplate.  
- Missing sections: `"Not disclosed / Not available"` (or per-prompt wording).  
- Note image-based or partial pages in extraction issues.

## Troubleshooting

- **Slow or token-heavy:** Use individual prompts per document type.  
- **Missing doc types:** Skip; outputs for that type can be absent.  
- **Scanned PDFs:** Extract what is possible; flag in extraction notes; consider OCR first.
