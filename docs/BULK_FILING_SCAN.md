# Bulk filing scan — list filings for hundreds of companies without per-company calls

**Find this doc when you need to:** list/download filings (results, concalls, PPTs, annual reports, orders, SAST/Reg 31, fund raising, rating, KMP, CIRP, M&A, press releases) for MANY companies or MANY quarters; build a document corpus or dataset; or you hit **HTTP 429 from Stockscans** while looping `documents(companyId)`.
Keywords: bulk announcements, throwaway watchlist, announcementType, rate limit, 429, exponential backoff, corpus listing, resumable scan.

## The rule

Never loop `stockscans.documents(companyId)` (one call per company) over a large universe — it gets 429-blocked after ~150 calls (2026-09-30 incident: 1,546 of 1,696 companies unlisted, lower concurrency and cooldowns did not help).

Use a **throwaway watchlist + `scans/announcement/search` with `announcementType`** instead: ~30 rows per call for the whole watchlist, so a 1,696-company × 4-quarter listing is ~150 calls. Verified live 2026-09-30: 4,241 Financial-Results rows in 140 s with zero 429s.

## Run it

```bash
# list filings (resumable; re-run the same command to continue)
yarn workspace @stock/api bulk-filing-scan \
  --companies-file data/pdf-corpus/companies.jsonl \
  --out data/pdf-corpus/scan \
  --types "Financial Results,Presentation,Earnings Call,Annual Report" \
  --from 202409 --to 202609

yarn workspace @stock/api bulk-filing-scan ... --probe     # one request, prints sample rows
yarn workspace @stock/api bulk-filing-scan --out <dir> --cleanup   # delete watchlists a crash left behind
```

Run with `node --env-file=.env` semantics (the client reads `STOCKSCANS_AUTH_TOKEN`; never `source .env`).

| Flag               | Meaning                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| `--companies-file` | `.jsonl` (rows with `companyId`), `.json` array, or `.txt` one id/line    |
| `--types`          | comma list or `all` — the 12 values below                                 |
| `--from/--to`      | release-quarter keys `YYYYMM` (03/06/09/12), or `--quarters a,b,c`        |
| `--watchlist-size` | companies per throwaway watchlist, default 500                            |
| `--budget-sec`     | stop cleanly after N seconds (for shells with a time cap); re-run resumes |
| `--delay-ms`       | base gap between page calls, default 800 (auto-widens after a 429)        |
| `--keep-raw`       | keep the original API row under `raw`                                     |

### `announcementType` values (server-side enum)

`Financial Results`, `Earnings Call`, `Presentation`, `Annual Report`, `M&A / Restructuring`, `Promoter Reg 31/31A`, `Orders / Contracts`, `Fund Raising`, `Management Changes`, `Press Release`, `Credit Rating`, `Insolvency / CIRP`.
Unknown values are silently treated as "All" by the server, so the tool rejects them up front.

Observed 2026-09-30: the watchlist scan is far gentler than per-company listing (about 250 calls / 6,900 rows in ~8 minutes), but it is not unlimited: after that, `scans/announcement/search` also returned 429 for over 100 s of backoff. The tool stopped cleanly (exit 2), deleted its watchlists and kept state. The account-level window length is unknown — re-run later (or from a scheduled job) and it resumes.

## What it does

1. Splits the companies into throwaway watchlists (`__bulk_scan_*`, 500 each) and records their ids in `state.json` **before** use.
2. For every (watchlist × type × quarter) unit, pages with `offset += rows` until a short/empty page. It never trusts the response `total` (it self-inflates).
3. Every call goes through exponential backoff with full jitter, honouring `Retry-After`: retries on 429 / 5xx / network errors, never on 400/401/403/404. A pacer doubles the gap after a 429 and narrows it after 10 successes.
4. If backoff is exhausted it **stops** (exit code 2, `stopped:"blocked"`) rather than hammering a blocked endpoint; state is kept, re-run later.
5. Always deletes its watchlists in `finally`; `--cleanup` removes any left by a crash.

Output in `--out`: `rows.jsonl` (one filing per line: `companyId, symbol, name, title, description, date, createdAt, ssUrl, url, type, quarterDate`), `state.json` (per-unit offset/complete), `errors.jsonl`.
`url` = `https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/<ssUrl>` (public S3 — PDF download does not touch the rate-limited API).

## Gotchas (what could be wrong with the data)

- `quarterDate` is the **release** quarter of the filing, not the reporting period (a March-quarter result lands under `202606`). Derive the reporting period from `title`/`description`/PDF, not from `quarterDate`.
- A type bucket is a category filter, not a precise one: the `Financial Results` bucket also carries adjacent board-meeting items (e.g. "Re-Appointment Of Cost Auditor"). Filter by `description` (e.g. "financial results for the period ended") before treating a row as a results document.
- Recall is below 100% per bucket (see `docs/stockscans-api-schemas.md`, `Orders / Contracts` note). Do not treat a missing row as "never filed".
- One row can be a cover letter whose PDF bundles standalone and consolidated statements.

## Design

- Library: `stock-api/src/utils/bulkFilingScan.js` (`runBulkScan`, `withBackoff`, `createPacer`, `scanUnit`, `cleanupWatchlists`, `expandQuarters`). CLI: `stock-api/bin/bulk-filing-scan.js`. Tests: `stock-api/test/bulkFilingScan.test.js` (no network).
- Client, sleep and clock are injected; all state is per-`--out` directory and per-unit key, so two runs with different `--out` dirs cannot interfere.
- Payload shape and the required `scanId`/`scanName` are documented in `docs/stockscans-api-schemas.md` (`POST /api/scans/announcement/search`, watchlist endpoints).

## Scale and automate

- Schedule the same command daily with a recent `--from/--to` window; the cursor state makes it incremental and it costs tens of calls.
- Feed `rows.jsonl` to a downloader (`scripts/pdf-corpus/download.js` pattern: S3 download, `%PDF-` check, sha256 dedupe) — no LLM needed anywhere in this path.
- For a universe over ~5,000 companies, raise `--watchlist-size` only after a `--probe` with that size; 500 is the value verified here.
