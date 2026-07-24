---
name: equity-research-extraction
description: Institutional equity research PDF extraction pipeline — turns raw PDFs in 5 category folders into analyst-ready `.txt` extracts for dashboard generation. Use when the user attaches or organizes equity research PDFs, mentions Project A, forensic AR extracts, concall extraction, NSE/BSE filings, or filenames like `[TICKER]_AR_Extracts.txt`. Also triggers when user provides only a Stockscans ticker (e.g. NSE:SWARAJENG) and asks for extraction or dashboard prep — the skill will auto-fetch all required documents before extracting.
---

# Equity research extraction (Project A)

## Goal

PDFs in 5 folders → 5 high-signal `.txt` extracts feeding [equity-research-dashboard](../dashboard-generation/SKILL.md) (Project B). Output is **condensed analyst-ready**, not verbatim — except where the prompt requires verbatim (auditor qualifications, KAMs, some policy changes).

## Folder layout

Research root `~/Research/[COMPANY]/`:
`Annual_Reports/`, `Concalls/`, `Investor_Presentations/`, `Credit_Rating_Reports/`, `Events_Announcements/`.
Empty / missing folders are skipped.

## Phase 0 — Document acquisition (ticker-only input)

Run this phase **only when the user supplies a Stockscans ticker but has NOT attached any PDFs**. If PDFs are already present in the research root, skip to Phase 1.

```bash
TICKER="NSE:SWARAJENG"            # replace with actual ticker
RESEARCH_ROOT=~/Research/$TICKER

mkdir -p "$RESEARCH_ROOT/Annual_Reports" \
         "$RESEARCH_ROOT/Concalls" \
         "$RESEARCH_ROOT/Investor_Presentations" \
         "$RESEARCH_ROOT/Credit_Rating_Reports" \
         "$RESEARCH_ROOT/Events_Announcements"

# Core standardised filings — fetch 5 ARs, 8 quarters of concalls + decks + results
python3 stock-api/python/fetchers/fetch_documents.py "$TICKER" \
    -t "Annual Report" --last-n 5 -o "$RESEARCH_ROOT/Annual_Reports"

python3 stock-api/python/fetchers/fetch_documents.py "$TICKER" \
    -t Transcript --last-n 8 -o "$RESEARCH_ROOT/Concalls"

# Backfill the latest quarter if it's not officially filed yet — the fetch
# above only returns OFFICIAL Transcript documents
node stock-api/bin/get-latest-concall-transcript.js "$TICKER"

python3 stock-api/python/fetchers/fetch_documents.py "$TICKER" \
    -t PPT --last-n 8 -o "$RESEARCH_ROOT/Investor_Presentations"

# Optional: pull credit-rating and events announcements
python3 stock-api/python/fetchers/fetch_announcements.py "$TICKER" \
    --search 'rating|outlook|downgrade|upgrade|watch' \
    --max-pages 10 -o "$RESEARCH_ROOT/Credit_Rating_Reports"

python3 stock-api/python/fetchers/fetch_announcements.py "$TICKER" \
    --search 'merger|acquisition|demerger|delisting|buyback|dividend|capex|order' \
    --max-pages 10 -o "$RESEARCH_ROOT/Events_Announcements"
```

After running, each folder will also contain a `manifest.json`. Use the manifest to confirm what was downloaded before starting extraction — if any critical type returned 0 documents, note it in the extraction output rather than silently producing an empty file.

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

## Output DTO standard — scope note

Per `skills/tooling/output-dto-standard/SKILL.md`, this skill is judged **out of scope**
for a full JSON-DTO retrofit: its job is mechanical extraction (PDFs → condensed `.txt`
files) with no synthesized verdict, rating, or thesis of its own — it's a preprocessing
step feeding `equity-research-dashboard`, not an analytical/reportable output in its own
right. The `.txt` extracts are already the "structured artifact"; there's no separate
narrative/PDF/widget rendered independently of them that could drift.

The one piece of structured metadata this skill does produce — `manifest.json` written
during Phase 0 acquisition by `stock-documents-fetcher`'s underlying fetch functions
(`documentsFetcher.js` / `announcementsFetcher.js`) — now carries `creator`,
`creationTime`, and `modifiedTime` at the file level, so provenance is still traceable
even though it isn't a full record-level DTO.

## Principles

- Preserve exact numbers, dates, and verbatim auditor/KAM/guidance text.
- Missing sections: `Not disclosed / Not available`.
- Note image-only / scanned pages in extraction issues.

## Troubleshooting

- **Scanned PDFs:** OCR first; flag partial extraction in notes.
- **Missing doc type:** skip; downstream tolerates absent outputs.
