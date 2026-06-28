---
name: stock-documents-fetcher
description: Fetches official company documents (earnings call transcripts, investor presentations, annual reports, financial results) and corporate announcements for any Indian listed company from Stockscans. Use this skill whenever the user — OR another skill — needs to download primary-source filings for an NSE/BSE-listed company before doing any forensic, valuation, growth-trigger, or research analysis. Trigger on phrases like "fetch the last 4 transcripts for X", "download annual reports for Y", "get me the Q3 investor presentation", "pull the latest concall", "search announcements for merger/buyback/AGM", "I need the FY25 AR", or any time a research workflow requires fresh primary documents and the user gives a ticker like NSE:BSE / BSE:500325.
---

# Stock Documents Fetcher

Pulls official filings for Indian-listed companies (NSE/BSE) from Stockscans and saves them as PDFs in a directory of your choosing, alongside a `manifest.json` that downstream skills can consume.

There are two endpoints behind this skill:

| When to use | Endpoint | Script |
|---|---|---|
| Standardised filings (Annual Report, PPT, Result, Transcript) | `/api/company/documents/{ticker}` | `scripts/fetch_documents.py` |
| Free-text search across exchange announcements (merger, buyback, AGM, rating change, board changes, ESOP, etc.) | `/api/company/announcements` | `scripts/fetch_announcements.py` |

The two scripts share auth, downloading, and manifest writing — they only differ in how documents are listed and filtered.

## When to use this skill

Use it whenever you (or another skill, such as `equity-research-extraction`, `equity-research-deepdive`, `forensic-accounting`, `growth-triggers-1pager`, `consecutive-filings-diff`) need primary-source documents for an Indian listed company. Typical triggers:

- "fetch the last 4 quarterly transcripts for [TICKER]"
- "download FY21–FY25 annual reports for [TICKER]"
- "get me the Q2 FY26 investor presentation"
- "pull the latest concall transcript"
- "any merger announcements?" / "buyback filings?" / "AGM notice?"
- A downstream research skill says it needs `[TICKER]_AR_Extracts.txt`-style inputs

If the request involves text-search over miscellaneous corporate announcements (anything that isn't an Annual Report, PPT, Result, or Transcript), reach for `fetch_announcements.py` instead. The four standardised types live in the documents API.

## Authtoken: where it comes from, why it matters

Stockscans gates both endpoints with a JWT cookie. The skill resolves the token in this order:

1. `--authtoken-file <path>` — explicit CLI arg
2. `STOCKSCANS_AUTHTOKEN` environment variable
3. `/mnt/project/Stockscans_authtoken` (default for this project)
4. `/mnt/project/stockscans_authtoken`, `/mnt/user-data/uploads/Stockscans_authtoken`, `~/.stockscans_authtoken`

Both scripts auto-decode the JWT's `exp` claim and warn if expiry is within 7 days, or hard-error if it's already past. If you get a 401/403 from the API, the token has expired — ask the user to refresh it from the browser (DevTools → Cookies → `authtoken`) and update the project file.

## Running the documents script

```
python3 /tmp/fetch_documents.py <TICKER> [options]
```

Common flags:

- `-t, --types`: one or more document types. Canonical: `"Annual Report"`, `PPT`, `Result`, `Transcript`. Aliases accepted: `concall`, `transcript`, `presentation`, `ppt`, `annual report`, `ar`, `result`, `quarterly result`, `earnings call`, etc.
- `--start-date`, `--end-date`: `YYYY` or `YYYYMM`. `YYYY` for `--start-date` pads to Jan; for `--end-date` pads to Dec. So `--start-date 2024 --end-date 2025` covers Jan-2024 → Dec-2025 across all types.
- `--year YYYY`: shorthand for `--start-date YYYY --end-date YYYY`.
- `--last-n N`: keep only the N most recent matches. If multiple `--types` are passed, this is per type (so `--types Transcript PPT --last-n 2` returns 2 of each).
- `-o, --output-dir`: where PDFs and `manifest.json` go. Defaults to `./stock_documents`. **For research workflows that pass documents to other skills, save to `/mnt/project/packages/cowork-jobs/data/agent-outputs/<ticker>_docs/` so downstream skills can find them.**
- `--list-only`: print matches without downloading. Useful for previewing.
- `--manifest-only`: print the JSON manifest to stdout (helps another skill ingest the result programmatically).

### How dates work in the API (this matters)

The API uses two different date encodings depending on document type — this script abstracts that away, but be aware:

- **Annual Report**: `"2025"` (4-digit calendar year of FY end)
- **PPT, Result, Transcript**: `"YYYYMM"` (e.g. `"202509"` = Q2 FY26 for an Indian company)

When filtering with `--start-date`/`--end-date` in YYYYMM, the script anchors Annual Reports at **March (YYYY03)** of the labelled year — i.e. the Indian fiscal-year-end. So AR `"2025"` represents FY25 (ended 31-Mar-2025) and is anchored at 202503. This means:

- `--start-date 202404 --end-date 202503` → AR `"2025"` is **included** (FY25 in full).
- `--start-date 202504 --end-date 202603` → AR `"2025"` is **excluded** (it belongs to FY25, not FY26).

A small number of Indian listed entities (some banks/NBFCs) report on December FY-ends. For those the March anchor is off by one quarter — usually fine for filtering, but if you need precision, cross-check `documentType == "Annual Report"` against the raw `date` field in the manifest.

If you want annual reports for a single FY by name, the cleanest approach is `--year YYYY` or `--start-date YYYY --end-date YYYY` — both expand to YYYY01–YYYY12, comfortably bracketing the AR's YYYY03 anchor.

### Examples

Last 4 quarterly transcripts:
```
python3 /tmp/fetch_documents.py NSE:BSE -t Transcript --last-n 4 -o /mnt/project/packages/cowork-jobs/data/agent-outputs/bse_docs
```

Last 5 annual reports (FY21–FY25):
```
python3 /tmp/fetch_documents.py NSE:SWARAJENG -t "Annual Report" --start-date 2021 --end-date 2025
```

All four document types since the start of FY26:
```
python3 /tmp/fetch_documents.py NSE:BSE -t Transcript PPT Result "Annual Report" --start-date 202504
```

Single-quarter snapshot (Q2 FY26 only):
```
python3 /tmp/fetch_documents.py NSE:BSE -t PPT Result Transcript --start-date 202509 --end-date 202509
```

Preview without downloading:
```
python3 /tmp/fetch_documents.py NSE:BSE -t Result --last-n 8 --list-only
```

## Running the announcements script

```
python3 /tmp/fetch_announcements.py <TICKER> [options]
```

Use this for anything outside the four standardised types — corporate actions, board changes, takeover disclosures, credit-rating updates, ESOPs, AGM notices, regulatory orders, etc.

Common flags:

- `--search PATTERN`: case-insensitive regex matched against `title` + `description`. Repeat for AND logic. For OR logic, use a single regex with `|`. Omit `--search` to dump every announcement in the time window.
- `--start`, `--end`: `YYYY-MM-DD` inclusive bounds.
- `--max-pages N`: each API page returns 30 announcements. Default 5 (≈150 announcements); raise for deeper history.
- `--max-results N`: cap downloads at N matches (default 50). Stops walking pages early once the cap is hit.
- `-o, --output-dir`, `--list-only`, `--authtoken-file`: same semantics as the documents script.

### Examples

Anything mentioning "merger":
```
python3 /tmp/fetch_announcements.py NSE:BSE --search merger --max-pages 10 -o /mnt/project/packages/cowork-jobs/data/agent-outputs/bse_ann
```

Buybacks OR dividends in 2025:
```
python3 /tmp/fetch_announcements.py NSE:BSE --search 'buyback|dividend' \
    --start 2025-01-01 --end 2025-12-31 --max-pages 30
```

Two-term AND search (rating changes by CRISIL specifically):
```
python3 /tmp/fetch_announcements.py NSE:BSE --search rating --search CRISIL --max-pages 20
```

Just preview:
```
python3 /tmp/fetch_announcements.py NSE:BSE --search ESOP --list-only
```

## Manifest format (for downstream skills)

Both scripts write `manifest.json` to the output directory. Downstream skills should iterate over this rather than `glob`-ing the directory — the manifest preserves API metadata (date, documentType, hasNotes, ssUrl) that's lost in the filenames.

### `fetch_documents.py` manifest

```json
{
  "ticker": "NSE:BSE",
  "fetched_at": "2026-05-05T17:03:39+00:00",
  "documents": [
    {
      "date": "202512",
      "documentType": "Transcript",
      "ssUrl": "osmhzw7484cdhh3wt96aecwg.pdf",
      "hasNotes": true,
      "filename": "NSE_BSE_Transcript_202512.pdf",
      "path": "/abs/path/to/NSE_BSE_Transcript_202512.pdf",
      "size_bytes": 1279047,
      "cached": false
    }
  ],
  "skipped": []
}
```

### `fetch_announcements.py` manifest

Same shape but with announcement-level fields (`title`, `description`, `companyKey`) preserved and the search params recorded:

```json
{
  "ticker": "NSE:BSE",
  "fetched_at": "...",
  "search": ["merger"],
  "start": null,
  "end": null,
  "announcements": [...],
  "skipped": [...]
}
```

`hasNotes: true` on a Transcript document is a useful signal — it indicates Stockscans has annotated/enriched notes alongside the raw transcript. Surface this when picking transcripts for forensic or thesis work.

## Important behaviours

**Idempotent re-runs.** If a destination file already exists with non-zero size, the download is skipped and the manifest still records the entry as `cached: true`. This means you can re-run the script after adding more types without re-downloading existing files — useful when iterating on a research workflow.

**Retries.** Each S3 download retries twice with a small back-off before giving up. Failures land in `manifest.skipped` with a `reason` field, so you can re-run later.

**No silent ticker validation.** An invalid ticker (e.g. `NSE:NOTREAL`) returns an empty document list with a `NOTE` printed to stderr — it does *not* error out. If you get zero documents, double-check the ticker on stockscans.in.

**Polite pagination.** The announcements script sleeps 200 ms between paginated calls. Don't crank `--max-pages` to absurd values (>50) without reason — a fund manager doesn't need 1,500 announcements parsed for one query.

## Output destination convention

- For one-off interactive use, default `./stock_documents/` is fine.
- When invoked **by another skill** (the common case), save to `/mnt/project/packages/cowork-jobs/data/agent-outputs/<safe_ticker>_docs/` so the downstream skill can read both the PDFs and the manifest from a stable, predictable path. Pass that path back via the manifest so the calling skill can locate everything in one shot.

## Failure modes & how to handle them

- **HTTP 401/403** → token expired. Check `check_token_expiry` output, then ask the user to refresh `Stockscans_authtoken`.
- **Empty `documents` array on a real ticker** → the ticker symbol on Stockscans is sometimes the BSE security code rather than the NSE symbol. Try `BSE:<6-digit-code>` as an alternative.
- **A specific quarter's PPT or Transcript is missing** → Stockscans hosts what the company filed; not every company files investor presentations or holds concalls every quarter. This is data, not a bug — note the gap rather than retrying.
- **`Unknown document type` error** → check the alias list at the top of `fetch_documents.py` (`TYPE_ALIASES`). Add new aliases there if a research workflow keeps using a phrasing that isn't covered.

## Reference files

- fetched from GitHub: `stock-documents-fetcher/references/api_details.md` — exact request/response shapes for both endpoints, useful when extending the skill.
