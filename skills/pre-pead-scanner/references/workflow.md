# The six-step workflow (detailed mechanics)

This is the operational heart of the skill. SKILL.md gives the one-line summary of each step; this file gives the commands, decision rules, and gates. Follow the steps in order — each gates the next, and a company that fails an early gate drops out of the universe and is reported as *excluded*, never silently dropped.

Underlying thesis: a scan tells you *who* reports next; this workflow tells you *which of them management has set up to beat*, by reading what they guided and checking whether the order book / capacity / utilisation / history actually supports it. Weight evidence over tone throughout.

## Step 1 — Resolve the scan into a company universe

The scan URL is the only required input. Run the scan runner, which fetches the **live** saved-scan definition (so any edits the user made to their saved scan are respected — never hardcode filters) and returns the matching companies.

```bash
python3 /tmp/run_scan.py "<SCAN_URL>" \
    --json-out /tmp/pead_universe.json
```

The output JSON carries one row per company. The critical field is **`companyId`** (e.g. `NSE:PGEL`) — every downstream Stockscans call keys off it. Each row also carries `Name`, `Last Result Date`, `Next Result Date`, `Close Price`, `Market Capitalization`, `Revenue`, `EPS`, `Equity Shares`, `PAT Growth TTM/YoY/QoQ`, `ROE`, `ROCE`, and the holding pattern — keep these; they feed validation and the EPS maths later. See `scan_api.md` for endpoint internals.

## Step 2 — Drop names that have already declared

A "pre-results" thesis is void the moment a company reports. The freshest signal is `Last Result Date` from the scan row: if it equals today's date (or any date in the current results window the user cares about), the company has *already* declared — exclude it.

Confirm via the documents API — a brand-new `Result` document dated to the quarter that is *about* to be reported means results are out:

```bash
python3 packages/stock-api/python/fetchers/fetch_documents.py "<companyId>" \
    -t Result --last-n 1 --list-only
```

If the latest `Result` date corresponds to the quarter about to be reported (e.g. a `202603` result when scanning for Q4 FY26), exclude it. Record every exclusion with its reason — the briefing must show them.

## Step 3 — Drop names with no prior-quarter concall

The whole method rests on management's most recent guidance. No concall, no guidance, no analysis. Check the documents API for a transcript dated to the **previous** quarter (the one already reported):

```bash
python3 packages/stock-api/python/fetchers/fetch_documents.py "<companyId>" \
    -t Transcript --last-n 2 --list-only
```

Decision rule:
- A `Transcript` for the most recent reported quarter exists → **in scope**, fetch and analyse it.
- Only an investor `PPT` exists (no transcript) → **degraded scope**. PPTs carry some guidance but no Q&A, no tone. Flag it; include only if the PPT has explicit numerical guidance, otherwise move to honourable mentions.
- Neither transcript nor recent PPT (only a bare `Result` sheet) → **exclude**, with the reason recorded.

Some companies file under a BSE security code rather than the NSE symbol — if a real-looking ticker returns zero documents, retry as `BSE:<6-digit-code>` (see the dependency skill's failure-modes section).

Fetch the in-scope documents for real (drop `--list-only`, add `-o`):

```bash
SAFE=$(echo "<companyId>" | tr ':' '_')
python3 packages/stock-api/python/fetchers/fetch_documents.py "<companyId>" \
    -t Transcript --last-n 1 -o "/tmp/pead/${SAFE}_docs"
```

Convert to text with the standard pipeline (`pdftotext -layout`; OCR image-PPTs via `pdftoppm -r 150` + `tesseract` in batches of four pages). Extraction mechanics are in `guidance_extraction.md`.

## Step 4 — Read the concall: extract guidance, then validate it

For each in-scope company, read the latest concall and extract two things, in this order:

**(a) The guidance itself** — revenue, margin (OPM/EBITDA), and PAT, as *verbatim quotes* with the speaker and date. Capture FY guidance and any explicit next-quarter colour. Never paraphrase a number; quote it.

**(b) How credibly they can hit it** — assess the *tone, clarity, and data-backedness* of the commentary (precise reiteration with a bridge vs hand-wavy "we hope"), then **validate against hard evidence**: order book / backlog coverage, capacity & utilisation headroom, and historical run-rate / seasonality fit. A guided figure requiring a >30% sequential jump needs a *specific* mechanism or it earns a red flag.

If the latest concall alone can't settle the validation (e.g. you need to see whether guidance was narrowing or widening across calls, or whether the order book is growing or being burned faster than replaced), **fetch more concalls** — the previous 2–4 quarters — and track the guidance drift:

```bash
python3 packages/stock-api/python/fetchers/fetch_documents.py "<companyId>" \
    -t Transcript --last-n 4 -o "/tmp/pead/${SAFE}_docs"
```

The full extraction-and-validation framework, including the four evidence pillars and the conviction rubric, is in `guidance_extraction.md`. **Read it before analysing the first company.**

## Step 5 — Extrapolate next-quarter Revenue / OPM / PAT / EPS

Combine the guidance with the YTD (9M) actuals and historical financials. The cleanest method, when both are available:

```
Next-quarter estimate = FY guidance − YTD actual
```

Where guidance is a range, carry the range. Where there's no full-year figure, extrapolate from the most recent quarterly run-rate adjusted for stated seasonality and any new-capacity ramp. Always compute Revenue (with implied YoY/sequential growth so the reader sees the size of the jump), OPM, PAT, and EPS (PAT ÷ equity shares — use `Equity Shares` from the scan row, cross-checked against the trailing `EPS` field). Show the maths transparently and tag each input `[guided]`, `[actual]`, or `[estimate]`. Method, OPM→PAT bridge, one-off stripping, and EPS share-count gotchas are in `forward_estimation.md`.

## Step 6 — Rank by conviction and render the briefing

Score each company on a conviction tier (**High / Medium / Low**) using the rubric in `guidance_extraction.md` — driven by *evidence strength*, not management optimism. Sort the master table highest → lowest conviction.

Render an interactive HTML briefing using `assets/briefing_template.html` as the structure. The master table columns must include everything extracted and computed:

| Column | Source |
|---|---|
| Rank, Company, companyId, Sector | scan |
| MCap, CMP | scan |
| FY guidance (verbatim signal) | concall (Step 4a) |
| Tone / clarity read | concall (Step 4b) |
| Validation: order book / capacity / utilisation / history | concall + scan (Step 4b) |
| YTD (9M) actual Revenue / PAT | concall / Result |
| **Est. next-Q Revenue** | Step 5 |
| **Est. next-Q OPM** | Step 5 |
| **Est. next-Q PAT** | Step 5 |
| **Est. next-Q EPS** | Step 5 |
| Conviction tier | Step 6 rubric |
| What could be wrong | per-name risk |

Below the master table, give a per-company deep-dive card (verbatim guidance quotes with speaker + date, the validation evidence, the next-quarter maths shown transparently, and a "what could be wrong" block), then a cross-cutting risks section, an exclusions list (with reasons), and a result-day watchlist of the specific metrics to verify when each company reports.

If the `visualize` tool is available, render the table through it; otherwise write the self-contained HTML file to `/mnt/project/packages/cowork-jobs/data/agent-outputs/` and present it. Either way the underlying schema is the same.
