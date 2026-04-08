# Walk the Talk — Implementation Guide

Technical documentation for the Walk the Talk Chrome extension's internal architecture, data flow, scoring pipeline, and Claude AI integration.

## Message Flow

The extension uses Chrome's message-passing API to communicate across its three execution contexts:

```
User clicks button
       │
       ▼
  content.js ──START_ANALYSIS──▶ background.js
                                      │
                                      ├── Opens side panel
                                      │
                                      └──BEGIN_ANALYSIS──▶ sidepanel.js
                                                              │
                                    ┌── FETCH_DOCS_LIST ──────┤
                                    │                          │
      content.js ◀──RELAY──── background.js ◀─────────────────┘
           │
           └── calls stockscans API, returns docs list
                                    │
                                    ▼
                              sidepanel.js
                                    │
                              ┌─────┴─────┐
                              │           │
                         S3 PDFs    GET_FINANCIALS ──▶ content.js
                         (direct)       (relay)         (DOM scrape)
                              │           │
                              ▼           ▼
                            Claude API calls
                              │
                              ▼
                        Results + Report
```

### Message Types

| Type | From | To | Payload |
|---|---|---|---|
| `START_ANALYSIS` | content.js | background.js | `{ symbol }` |
| `BEGIN_ANALYSIS` | background.js | sidepanel.js | `{ symbol }` |
| `RELAY_TO_CONTENT` | sidepanel.js | background.js | `{ inner: {...} }` |
| `FETCH_DOCS_LIST` | (via relay) | content.js | none |
| `GET_FINANCIALS` | (via relay) | content.js | none |
| `FETCH_NOTES` | (via relay) | content.js | `{ symbol, ssUrl }` |

## Pipeline Steps

### Step 1: Fetch Document List

- Content script calls `GET /api/company/documents/{symbol}` on stockscans.in
- Returns an array of document metadata: `{ documentType, date, ssUrl, hasNotes }`
- Filters for quarterly documents (`Transcript`, `Result`, `PPT`) with 6-digit dates
- Groups by date (YYYYMM), sorts newest-first, takes at most 8 quarters
- Requires minimum 2 quarters to proceed

### Step 2: Download PDFs and Notes

For each quarter:
1. **Transcript PDF** (primary narrative source): fetched from S3 as base64
2. **Result PDF** (financial data): fetched from S3 as base64
3. **PPT** (fallback if no transcript): fetched from S3 as base64
4. **Concall notes** (if `hasNotes` flag is set): fetched via stockscans API

Also fetches **DOM financial tables** by scraping `<table>` elements on the page that contain quarter column headers matching `Q[1-4]FY\d{2}`.

### Step 3: Extract Claims and Financials

For each quarter, calls Claude with:
- **Inputs**: PDF documents (base64), analyst notes (text), DOM table data (text)
- **System prompt**: Senior equity analyst role
- **Expected output**: JSON with two keys:
  - `claims[]` — forward-looking management statements with metric, direction, specificity, target value
  - `financials{}` — standardised financial metrics (revenue, OPM, PAT, FCF, capex, etc.)

Token limit: 4096 tokens per call. Uses retry logic (1 retry on failure).

### Step 4: Score Quarters

Processes quarters chronologically (oldest to newest). For each consecutive pair:
- **Prior quarter claims** compared against **current quarter actuals**
- Claude produces scores and evidence:

| Field | Type | Range | Description |
|---|---|---|---|
| `execution_score` | number | 0–100 | Did guidance match actuals? |
| `language_score` | number | 0–100 | Clarity and specificity of language |
| `consistency_score` | number | 0–100 | Narrative stability across quarters |
| `wtt_score` | number | 0–100 | Weighted: `exec×0.5 + lang×0.3 + cons×0.2` |
| `delivered` | string[] | — | Specific promises that were kept |
| `missed` | string[] | — | Specific promises that were broken |
| `red_flags` | string[] | — | Concerning language patterns |
| `verdict` | string | — | One-sentence assessment |

**Score normalisation**: After parsing, the extension coerces all score fields to numbers and recomputes `wtt_score` client-side to prevent Claude arithmetic errors.

### Step 5: Overall Verdict

Synthesises all quarter scores into a final assessment:
- `overall_score` (0–100)
- `trend`: improving | declining | stable | volatile
- `credibility_rating`: High | Medium | Low | Very Low
- `top_red_flags`: up to 3 cross-quarter concerns
- `strengths`: up to 2 consistent positives
- `overall_verdict`: 2–3 sentence investment-grade summary

## Claude API Integration

### Configuration

| Parameter | Value |
|---|---|
| Model | `claude-sonnet-4-20250514` |
| Default max_tokens | 4096 |
| Request timeout | 120 seconds |
| Max retries | 1 (with 1s backoff) |
| API version | `2023-06-01` |
| Beta header | `anthropic-beta: pdfs-2024-09-25` (required for PDF document input) |
| Browser access | `anthropic-dangerous-direct-browser-access: true` |

### JSON Extraction

Claude responses are parsed using a multi-strategy approach (`extractJSON`):
1. Direct `JSON.parse` on the raw response
2. Extract content from markdown code fences (`` ```json ... ``` ``)
3. Brace-matching: find the outermost `{ ... }` or `[ ... ]` using a character-level parser that handles strings and escapes

This makes the pipeline resilient to preamble text, markdown formatting, and other non-JSON content that Claude may include.

### Error Handling

- **Authentication errors** (401): surfaced as "check your API key"
- **Rate limiting** (429): surfaced as "wait a moment and retry"
- **Server errors** (5xx): surfaced with status code
- **Timeouts**: AbortController with 120s deadline
- **Parse failures**: retried once, then logged as a warning
- **Partial failures**: pipeline continues; warnings shown in the results UI

## Data Sources

### Stockscans API (same-origin, via content script)

| Endpoint | Method | Returns |
|---|---|---|
| `/api/company/documents/{symbol}` | GET | Document list (type, date, ssUrl, hasNotes) |
| `/api/company/concall-notes/{symbol}/{ssUrl}` | GET | Structured analyst notes |

### S3 (direct fetch from side panel)

| URL Pattern | Content |
|---|---|
| `stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/{ssUrl}` | Earnings PDFs |

### DOM Scraping (content script)

Financial tables are identified by:
- Having quarterly column headers matching `Q[1-4]FY\d{2}`
- Row labels containing keywords like "revenue", "equity", "operating cash"
- Classified as: `income_stmt`, `balance_sheet`, or `cashflow`

## Report Generation

The downloaded HTML report is a standalone, self-contained file with:
- Embedded Google Fonts (Syne, DM Sans, JetBrains Mono)
- Dark theme matching the extension's aesthetic
- Overall score hero section with credibility rating and trend
- Sub-score cards for execution, language, and consistency
- Red flags and strengths grid
- Quarter-by-quarter detail cards with delivered/missed/red-flag lists
- Generation metadata (company, quarters analysed, date)

## SPA Navigation Handling

stockscans.in is a single-page application. The extension detects navigation via:
1. **MutationObserver** on `document.documentElement` — catches DOM changes from client-side routing
2. **History API patching** — wraps `pushState` and `replaceState` to detect programmatic navigations
3. **popstate listener** — catches browser back/forward

On URL change, the extension cleans up the old button and re-injects if the new URL matches `/company/*`.

## Button Injection Strategy

The "Walk the Talk" button injection uses a two-phase approach:

1. **Inline insertion**: tries CSS selectors for known header elements (`company-overview`, `companyHeader`, `stock-header`, `h1`, etc.) and inserts the button adjacent to the title
2. **Visibility verification**: after insertion, checks `getBoundingClientRect()` to confirm the button is actually visible (non-zero dimensions, within viewport)
3. **Fixed-position fallback**: if inline insertion fails or the button is hidden (e.g. by overflow clipping), removes it and uses fixed positioning at bottom-right

This ensures the button works across desktop, mobile, and any layout variations.

## Known Limitations

- **Authentication required**: stockscans.in APIs require an active logged-in session
- **API costs**: each analysis makes 10–20 Claude API calls (extraction + scoring per quarter + verdict)
- **Quarter limit**: at most 8 quarters analysed to control API usage and latency
- **PDF size cap**: PDFs over 8MB are silently skipped (typically very large annual reports)
- **Indian FY only**: quarter labels assume the Indian financial year (Apr–Mar)
- **Single tab**: the background relay picks the first matching stockscans.in tab
- **No caching**: each analysis re-downloads and re-processes from scratch
