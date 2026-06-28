---
name: watchlist-insights
description: Daily watchlist corporate-announcement insights — fetch new non-routine announcements across the Near Highs + Radar watchlists, read each PDF, write an actionable quantified insight per category into the notes DB, and email the full 24h digest. Invoke with defaults for the 8 AM run, or on demand to re-process a company.
---

# Watchlist Daily Insights

Script-first: the companion job `watchlistInsights.js` handles all I/O (Stockscans API,
PDF text, notes DB, email). YOUR job is the judgment — reading each PDF and writing the
insight. Process announcements **one at a time**; never write an insight from the
title/description alone.

## Parameters (optional)

| Param | Default | Meaning |
|---|---|---|
| `email` | on | run `send-digest` at the end (off = just update notes) |
| company filter | none | on demand, process only a given `companyId` |

The 24h window and the two watchlists (Near Highs + Radar) are baked into the job.

## Setup

```bash
JOB=$(find /sessions -path '*cowork-jobs/watchlistInsights.js' 2>/dev/null | head -1)
DATA="$(dirname "$JOB")/data"   # data + .env now live with the jobs in the monorepo
export WI_DATA_DIR="$DATA" WI_NOTES_DIR="$DATA/notes" WI_VALIDATION_DIR="$DATA/validation" \
       COWORK_DATA_DIR="$DATA" COWORK_ENV="$DATA/.env" COWORK_DRIVE_EMAIL="djplearner@gmail.com"
# Optional when Google Drive auto-detection fails:
# export COWORK_DRIVE_ROOT="$HOME/Library/CloudStorage/GoogleDrive-djplearner@gmail.com/My Drive/StockMarket/cowork-jobs/v1"
run(){ node "$JOB" "$@"; }
```

Each command pulls Drive data before it runs and pushes notes plus validation logs after
it finishes. If no Drive folder is mounted or configured, sync is skipped unless
`COWORK_DRIVE_STRICT=1`.

## Step 1 — Fetch new announcements
```bash
run fetch-announcements
```
Returns a JSON array of new, non-routine, unprocessed announcements — each with a
`category` and `pdfUrl`. (Routine noise is already dropped and logged for the validator.)

## Step 2 — Process each meaningful announcement (one at a time)

For EACH item:
1. **Read the PDF — mandatory:** `run read-pdf "<pdfUrl>"`. Base the insight on the
   document body; only fall back to `description` if the PDF is empty/404, and say so.
2. **Load context:** `run get-company-notes "<companyId>"`. If `null` (new company), use
   the `stock-report` skill for a 2–3 sentence businessSummary and save it.
3. **Fetch the category template:** `run insight-template "<category>"` and follow it
   exactly (global rules + category-specific extraction checklist). For
   `shareholding_change` (SAST) the insight MUST state who bought/sold, absolute shares
   AND % of capital (Δ and resulting holding), mode/price, and threshold crossed.
4. **Save the note:** `echo '<json>' | run add-note` with `{companyId, ticker, name,
   businessSummary?, note:{type:"announcement", announcementId, announcementTitle, pdfUrl,
   insight, significance, tags, category, announcementDescription}}`.
5. **Mark processed:** `run mark-processed "<companyId>" "<announcementId>"`.

Routine items that slip through: just `run mark-processed` and move on (no insight).

## Step 3 — Send the 24h digest
```bash
run send-digest
```
Emails insights for ALL non-routine announcements in the last 24h (stored insights are
read back from the notes DB; only genuinely-new ones get a fresh insight above). Prints
`{status, totalAnnouncements, withInsight, missingInsight, missingIds}`. Inspect without
sending via `run build-digest`.

## Rules
- One PDF at a time; every meaningful announcement gets its PDF read and an actionable,
  quantified insight — never from the title alone.
- The notes DB is long-term memory: treat prior notes as signal, look for patterns and
  contradictions. Log any API error in the insight and continue.
