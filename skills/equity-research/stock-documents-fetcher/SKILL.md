---
name: stock-documents-fetcher
description: Fetches official company documents (earnings call transcripts, investor presentations, annual reports, financial results) and corporate announcements for any Indian listed company from Stockscans. Use this skill whenever the user — OR another skill — needs to download primary-source filings for an NSE/BSE-listed company before doing any forensic, valuation, growth-trigger, or research analysis. Trigger on phrases like "fetch the last 4 transcripts for X", "download annual reports for Y", "get me the Q3 investor presentation", "pull the latest concall", "search announcements for merger/buyback/AGM", "I need the FY25 AR", or any time a research workflow requires fresh primary documents and the user gives a ticker like NSE:BSE / BSE:500325.
---

# Stock Documents Fetcher

Pulls official filings for Indian-listed companies (NSE/BSE) from Stockscans and saves them as PDFs in a directory of your choosing, alongside a `manifest.json` that downstream skills can consume.

**⚠️ CORRECTED 2026-08-02 — the Python CLI scripts described below (`stock-api/python/fetchers/fetch_documents.py` / `fetch_announcements.py`) DO NOT EXIST in this repo.** There is no `stock-api/python/` directory at all. The registry's `entry` (`stock-api/bin/stock-documents-fetcher.js`) is also currently an unfinished stub (`// TODO: implement actual parsing and logic here` — prints an empty `{ok:true,outputs:[],warnings:[]}` and does nothing). **The real, working implementation is a pair of Node.js modules** — see "Actual working usage" below, added after live-testing the real fetch path. The rest of this file (flags, date semantics, manifest shape, failure modes) still accurately describes the *real* JS functions' behavior — only the invocation mechanism (Python CLI vs. `require()`) and the auth resolution (see corrected Authtoken section) were wrong.

There are two endpoints behind this skill:

| When to use                                                                                                     | Endpoint                          | Script                           |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------- |
| Standardised filings (Annual Report, PPT, Result, Transcript)                                                   | `/api/company/documents/{ticker}` | `scripts/fetch_documents.py`     |
| Free-text search across exchange announcements (merger, buyback, AGM, rating change, board changes, ESOP, etc.) | `/api/company/announcements`      | `scripts/fetch_announcements.py` |

The two scripts share auth, downloading, and manifest writing — they only differ in how documents are listed and filtered. (Table above kept as-is for the flag/endpoint mapping — read "Script" as "the module documented under Actual working usage", not a literal file that exists.)

## Actual working usage (Node.js, confirmed live 2026-08-02)

There is no ready-made CLI wrapper on disk — call the module function directly from a small Node script (`require()`), the same pattern every other `stock-api/bin/*.js` consumer of `documentsFetcher.js` uses internally (e.g. `concall-analysis.js`, `quarterly-result-analysis.js`, both of which `require('../src/fetchers/documentsFetcher.js')`). Auth is `STOCKSCANS_AUTH_TOKEN` (env var, or the canonical key in a `.env` file), resolved by `StockscansAuth` — **not** a `Stockscans_authtoken` cookie file at `/mnt/project/...` as the original "Authtoken" section below describes; that resolution order was never implemented in code.

```js
// e.g. /tmp/fetch_docs.js — use an ABSOLUTE path to documentsFetcher.js,
// a relative require('./stock-api/...') only works if cwd is the repo root.
const { fetchDocuments } = require('/absolute/path/to/stockmarket/stock-api/src/fetchers/documentsFetcher.js');
(async () => {
  const res = await fetchDocuments('NSE:YASHO', {
    types: ['PPT', 'Result', 'Transcript'],   // omit for all 4 types
    startDate: '202606',                       // YYYYMM, see date semantics below
    endDate: '202606',
    outputDir: '/tmp/yasho_docs',
    listOnly: false,                            // true = preview, no download
  });
  console.log(JSON.stringify(res.fetched, null, 2));   // downloaded docs
  console.log(JSON.stringify(res.skipped, null, 2));   // failures, with `reason`
})();
```

Run with the token supplied explicitly (`.env` auto-load is not guaranteed outside the jobs-runtime `Env` abstraction):

```bash
STOCKSCANS_AUTH_TOKEN="$(grep '^STOCKSCANS_AUTH_TOKEN' .env | cut -d= -f2-)" node /tmp/fetch_docs.js
```

`fetchDocuments(ticker, options)` returns `{ fetched, skipped, manifest, manifestPath }` (or just `{ matched }` when `listOnly: true`) and also writes `manifest.json` to `outputDir` — same shape documented below under "Manifest format". The `types`/`startDate`/`endDate`/`year`/`lastN`/`outputDir`/`listOnly` option keys map 1:1 to the `-t`/`--start-date`/`--end-date`/`--year`/`--last-n`/`-o`/`--list-only` flags described in the (nonexistent) Python CLI section further down — the semantics are identical, confirmed by reading `documentsFetcher.js` source directly. `fetchAnnouncements()` in `announcementsFetcher.js` follows the same pattern with the `--search`/`--start`/`--end`/`--max-pages`/`--max-results` equivalents.

**Per `skills/_shared/conventions.md` §6, downloaded PDFs are re-fetchable source documents and must NOT be persisted under `<repo>/data/`** — write them to a temp/scratch dir outside the data mirror (e.g. `/tmp/<ticker>_docs/`), as in the example above.

**Live-confirmed example (2026-08-02):** `fetchDocuments('NSE:YASHO', {types:['PPT','Result'], startDate:'202606', endDate:'202606', outputDir:'/tmp/yasho_docs'})` returned both the Q1FY27 PPT (`NSE_YASHO_PPT_202606.pdf`, 5.3MB) and Result (`NSE_YASHO_Result_202606.pdf`, 4.4MB) in one call, no auth issues — confirming the module + `STOCKSCANS_AUTH_TOKEN` from `.env` is a working path end-to-end. The only friction was `require()` needing an absolute path when run from outside the repo root.

## When to use this skill

Use it whenever you (or another skill, such as `equity-research-extraction`, `equity-research-deepdive`, `forensic-accounting`, `growth-triggers-1pager`, `consecutive-filings-diff`) need primary-source documents for an Indian listed company. Typical triggers:

- "fetch the last 4 quarterly transcripts for [TICKER]"
- "download FY21–FY25 annual reports for [TICKER]"
- "get me the Q2 FY26 investor presentation"
- "pull the latest concall transcript"
- "any merger announcements?" / "buyback filings?" / "AGM notice?"
- A downstream research skill says it needs `[TICKER]_AR_Extracts.txt`-style inputs

If the request involves text-search over miscellaneous corporate announcements (anything that isn't an Annual Report, PPT, Result, or Transcript), reach for `fetch_announcements.py` instead. The four standardised types live in the documents API.

## Authtoken: where it comes from, why it matters (CORRECTED 2026-08-02)

Stockscans gates both endpoints with a JWT cookie. The section below (file-based resolution, `--authtoken-file`) describes a scheme that was **never implemented** in this repo's actual auth code, `stock-api/src/auth/stockscansAuth.js` (`StockscansAuth`). The real resolution order (first hit wins) is:

1. an explicit token passed to the `StockscansAuth` constructor (not exposed as a CLI flag anywhere)
2. `STOCKSCANS_AUTH_TOKEN` environment variable — **canonical**
3. `STOCKSCANS_AUTHTOKEN` environment variable — legacy name, still supported but logs a deprecation warning
4. a `.env` file on disk, canonical key first then legacy key

There is no `Stockscans_authtoken` file-based fallback and no `--authtoken-file` flag anywhere in the codebase. Always set `STOCKSCANS_AUTH_TOKEN` (env var or `.env`) before calling `fetchDocuments`/`fetchAnnouncements` — see "Actual working usage" above for the exact invocation. The JWT itself auto-decodes an `exp` claim elsewhere in the stack (e.g. `concall-transcript-extractor`'s expiry warnings), but `StockscansAuth` itself does not warn on impending expiry — a 401/403 from the API is the first signal. If you get a 401/403, the token has expired — ask the user to log into stockscans.in, copy the fresh `authtoken` cookie value (DevTools → Application/Storage → Cookies → `authtoken`), and update `STOCKSCANS_AUTH_TOKEN` in `.env`.

## Running the documents script

```
python3 stock-api/python/fetchers/fetch_documents.py <TICKER> [options]
```

Common flags:

- `-t, --types`: one or more document types. Canonical: `"Annual Report"`, `PPT`, `Result`, `Transcript`. Aliases accepted: `concall`, `transcript`, `presentation`, `ppt`, `annual report`, `ar`, `result`, `quarterly result`, `earnings call`, etc.
- `--start-date`, `--end-date`: `YYYY` or `YYYYMM`. `YYYY` for `--start-date` pads to Jan; for `--end-date` pads to Dec. So `--start-date 2024 --end-date 2025` covers Jan-2024 → Dec-2025 across all types.
- `--year YYYY`: shorthand for `--start-date YYYY --end-date YYYY`.
- `--last-n N`: keep only the N most recent matches. If multiple `--types` are passed, this is per type (so `--types Transcript PPT --last-n 2` returns 2 of each).
- `-o, --output-dir`: where PDFs and `manifest.json` go. Defaults to `./stock_documents`. **For research workflows that pass documents to other skills, save to `/mnt/project/data/agent-outputs/<ticker>_docs/` so downstream skills can find them.**
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
python3 stock-api/python/fetchers/fetch_documents.py NSE:BSE -t Transcript --last-n 4 -o /mnt/project/data/agent-outputs/bse_docs
```

Last 5 annual reports (FY21–FY25):

```
python3 stock-api/python/fetchers/fetch_documents.py NSE:SWARAJENG -t "Annual Report" --start-date 2021 --end-date 2025
```

All four document types since the start of FY26:

```
python3 stock-api/python/fetchers/fetch_documents.py NSE:BSE -t Transcript PPT Result "Annual Report" --start-date 202504
```

Single-quarter snapshot (Q2 FY26 only):

```
python3 stock-api/python/fetchers/fetch_documents.py NSE:BSE -t PPT Result Transcript --start-date 202509 --end-date 202509
```

Preview without downloading:

```
python3 stock-api/python/fetchers/fetch_documents.py NSE:BSE -t Result --last-n 8 --list-only
```

## Running the announcements script

```
python3 stock-api/python/fetchers/fetch_announcements.py <TICKER> [options]
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
python3 stock-api/python/fetchers/fetch_announcements.py NSE:BSE --search merger --max-pages 10 -o /mnt/project/data/agent-outputs/bse_ann
```

Buybacks OR dividends in 2025:

```
python3 stock-api/python/fetchers/fetch_announcements.py NSE:BSE --search 'buyback|dividend' \
    --start 2025-01-01 --end 2025-12-31 --max-pages 30
```

Two-term AND search (rating changes by CRISIL specifically):

```
python3 stock-api/python/fetchers/fetch_announcements.py NSE:BSE --search rating --search CRISIL --max-pages 20
```

Just preview:

```
python3 stock-api/python/fetchers/fetch_announcements.py NSE:BSE --search ESOP --list-only
```

## Output DTO standard — scope note

Per `skills/tooling/output-dto-standard/SKILL.md`, this skill is judged **out of scope**
for a full JSON-DTO retrofit: it is a pure fetch/download utility (PDFs + `manifest.json`)
with no synthesis, categorization, or analytical verdict of its own — it does not render
any PDF/HTML/widget from the fetched documents, so there's nothing that could drift from
a JSON source of truth. The manifest already _is_ the structured artifact for this skill.

That said, the manifest's provenance is now traceable at minimum: both
`stock-api/src/fetchers/documentsFetcher.js` and `stock-api/src/fetchers/announcementsFetcher.js`
write `creator: "stock-documents-fetcher"`, `creationTime`, and `modifiedTime` into every
`manifest.json` they produce, alongside the existing `fetched_at` field (kept for
backward compatibility with downstream skills that already read it).

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

**No silent ticker validation.** An invalid ticker (e.g. `NSE:NOTREAL`) returns an empty document list with a `NOTE` printed to stderr — it does _not_ error out. If you get zero documents, double-check the ticker on stockscans.in.

**Polite pagination.** The announcements script sleeps 200 ms between paginated calls. Don't crank `--max-pages` to absurd values (>50) without reason — a fund manager doesn't need 1,500 announcements parsed for one query.

## Output destination convention

- For one-off interactive use, default `./stock_documents/` is fine.
- When invoked **by another skill** (the common case), save to `/mnt/project/data/agent-outputs/<safe_ticker>_docs/` so the downstream skill can read both the PDFs and the manifest from a stable, predictable path. Pass that path back via the manifest so the calling skill can locate everything in one shot.
- Never create ad-hoc debug/`tmp_*.js` scripts in the repo root or `stock-api/` to probe fetch behaviour. If you need a scratch file, write it to the gitignored `tmp/` folder at repo root and delete it when done. If the fetcher script itself has a bug, fix `fetch_documents.py`/`fetch_announcements.py` directly — don't work around it with a throwaway script.

## Failure modes & how to handle them

- **`stock-api/bin/stock-documents-fetcher.js` prints `{"ok":true,"outputs":[],"warnings":[]}` and does nothing** → expected as of 2026-08-02, this is an unimplemented stub (`// TODO: implement actual parsing and logic here`) despite being the registry's `entry` for this skill. Do not invoke it — call `fetchDocuments`/`fetchAnnouncements` directly via `require()` as shown in "Actual working usage" above. If someone finishes the stub, update this note and the registry.
- **HTTP 401/403** → token expired. There is no `check_token_expiry` helper in the actual code (see corrected Authtoken section) — a 401/403 from the API itself is the signal. Ask the user to refresh `STOCKSCANS_AUTH_TOKEN` in `.env`.
- **Empty `documents` array on a real ticker** → the ticker symbol on Stockscans is sometimes the BSE security code rather than the NSE symbol. Try `BSE:<6-digit-code>` as an alternative.
- **A specific quarter's PPT or Transcript is missing** → Stockscans hosts what the company filed; not every company files investor presentations or holds concalls every quarter. This is data, not a bug — note the gap rather than retrying.
- **`Unknown document type` error** → check the alias list at the top of `fetch_documents.py` (`TYPE_ALIASES`). Add new aliases there if a research workflow keeps using a phrasing that isn't covered.

## Reference files

- fetched from GitHub: `stock-documents-fetcher/references/api_details.md` — exact request/response shapes for both endpoints, useful when extending the skill.
