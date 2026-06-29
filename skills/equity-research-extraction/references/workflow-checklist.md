# End-to-end checklist (from institutional pipeline guide)

## Phase 1 — Folder setup (~5 min)

1. Create research root folder for one company.  
2. Add subfolders: Annual_Reports, Concalls, Investor_Presentations, Credit_Rating_Reports, Events_Announcements (only those you need).  
3. Drop PDFs into the right folders.  
4. Export Screener.in Excel → save as `[TICKER]_MasterData.xlsx` in the **root**.

## Phase 2 — Project A extraction (~20 min)

1. Open a new LLM chat.  
2. Paste **unified** prompt from `prompts/unified_master.txt` (or run individual prompts).  
3. Replace `[Company name]` and `[NSE ticker]` / ticker placeholders.  
4. Attach all PDFs.  
5. Confirm company + ticker; proceed through TASK 1–5.  
6. Download each `.txt` and move into the matching subfolder.

## Phase 3 — Project B dashboard (~15 min)

1. New chat.  
2. Paste `prompts/dashboard_master_v4.txt`.  
3. Attach: `MasterData.xlsx` + all `.txt` extracts (+ optional Events / Estimates).  
4. Send company name, ticker, “Ready to generate”.  
5. Review **PRE-GENERATION BRIEF**; reply **`GENERATE`**.  
6. Download `[TICKER]_Dashboard.html`.

## Phase 4 — Use / share

- Open HTML locally (offline).  
- Optional: Netlify Drop or static host for sharing.

## Updates

Add new PDFs → re-run Project A for affected types → re-run Project B with fresh extracts and updated Screener export.
