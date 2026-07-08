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
JOB=$(find /sessions -path '*packages/jobs-runtime/watchlistInsights.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
RUNTIME=$(dirname "$JOB")   # …/packages/jobs-runtime
run(){ node "$JOB" "$@"; }
```

Do NOT export `WI_DATA_DIR` / `WI_NOTES_DIR` / `COWORK_ENV` — the job resolves everything
itself: the notes DB and validation logs default to `<repo>/data/` and secrets to
`<repo>/.env`. Exporting paths derived from fragile `find`s is what previously scattered
`notes/` and `validation/` at the repo root.

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
   insight, significance, tags, category, announcementDescription}}`. This writes into the
   per-company record in the notes DB (`entities/watchlist-notes/main/current`), which IS
   the canonical JSON DTO for this skill's output (see
   `skills/tooling/output-dto-standard/SKILL.md`) — `NotesDb.ensureCompany` stamps every
   company record with `companyId`, `creationTime`, `modifiedTime`, and
   `creator: "watchlist-insights"` automatically. The Step 3 digest email is a render of
   this stored data, never drafted independently of it.
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

## Step 4 — Offload & cleanup (MANDATORY, even on failure)

```bash
node "$RUNTIME/scripts/data.js" push
```
Idempotent push of everything under `data/` to Google Drive (`StockMarket/data/v2`).
Push-only: local files are KEPT (full mirror), nothing is deleted. The skill is NOT complete until this has run. Generated data belongs ONLY under `data/`; if the sync fails, report it and retry later.

## Rules
- One PDF at a time; every meaningful announcement gets its PDF read and an actionable,
  quantified insight — never from the title alone.
- The notes DB is long-term memory: treat prior notes as signal, look for patterns and
  contradictions. Log any API error in the insight and continue.
- All outputs go under `data/` (the job does this by default) — never write data
  files to the repo root, and always finish with Step 4.
