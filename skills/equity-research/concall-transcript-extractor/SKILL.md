---
name: 'concall-transcript-extractor'
description: 'DEPRECATED 2026-07-31 — do not use for new work. Stockscans now guarantees an official Transcript document for every reported quarter, so the Perplexity/recording/NotebookLM fallback waterfall this skill implements is no longer needed. All consumer skills now resolve transcripts directly via stock-api/bin/get-concall-transcript-url.js (see skills/_shared/conventions.md §12). Kept only for historical reference — never invoke or route to this skill.'
---

# Concall Transcript Extractor — DEPRECATED

**This skill is deprecated as of 2026-07-31 and is not used by any current workflow.** Stockscans added live concall support: an official Transcript document is now guaranteed for every company/quarter, which was the missing piece that justified this skill's 5-tier fallback waterfall (Perplexity/Quartr, recording + NotebookLM, etc.).

**Use instead:** `stock-api/bin/get-concall-transcript-url.js` (single-company/single-quarter, multi-company/latest-quarter, and multi-company/historical-quarter modes — see its header docs and `skills/_shared/conventions.md` §12 for the `ssUrl` → document URL convention). Every consumer skill (concall-analysis, quarterly-result-analysis, management-credibility-tracker, consecutive-filings-diff, forward-guidance-extractor, growth-triggers-1pager, peer-comparison, stock-report) has been repointed to call that script directly instead of this skill.

The content below is preserved for reference only.

# Concall Transcript Extractor (legacy)

**Canonical transcript source for all skills.** Any skill that needs a concall transcript — for any quarter, any company — MUST call this script instead of fetching the transcript itself. The DB-first waterfall ensures no duplicate network calls and a consistent storage schema.

Entrypoint:

```bash
# Single company — latest completed quarter (auto-computed)
yarn workspace @stock/api get-latest-concall-transcript <TICKER> [--out-dir <dir>] [--force]

# Single company — explicit quarter
yarn workspace @stock/api get-latest-concall-transcript <TICKER> --quarter Q1FY27 [--out-dir <dir>] [--force]

# Bulk — multiple companies/quarters in one call
yarn workspace @stock/api get-latest-concall-transcript --bulk '[{"ticker":"NSE:X","quarter":"Q1FY27"},{"ticker":"NSE:Y"}]' [--out-dir <dir>] [--force]
yarn workspace @stock/api get-latest-concall-transcript --bulk-file companies.json [--out-dir <dir>] [--force]
```

Quarter format: `Q{1-4}FY{2-or-4-digit-year}`, e.g. `Q1FY27`, `Q4FY26`, `Q2FY2026`.
If `--quarter` is omitted, `latestCompletedQuarter()` is used (current quarter minus 1).
`--force` bypasses the DB hit check and re-fetches from the network.

Bulk input: JSON array of `{ticker: string, quarter?: string}` — `quarter` optional per entry.
Bulk output: JSON array of results, one per input entry. Processing continues on per-entry errors.

## Bulk-mode call volume — why this matters at 500-1000 companies

Bulk mode used to cost one `documents()` call per company for the Tier 1/2 gate, plus one `announcements()` call per company for Tier 4 — roughly 2 sequential network calls per company minimum, which is exactly what trips Stockscans' rate limits at volume. As of 2026-07-26 this is fixed at four levels (all in `get-latest-concall-transcript.js` / `find-earnings-recording.js` / `stock-api/src/utils/bulkAnnouncementScan.js` / `StockscansClient.js`):

1. **Current-quarter Tier 1/2 gate, bulk-ified.** If any bulk entry targets the current results season (the common case — `quarter` omitted, defaults to `latestCompletedQuarter()`), the whole run fetches `StockscansClient.resultsDocumentsMap()` **once**: a paginated `POST /api/company/results/documents` scan that returns every company market-wide with a result filed this quarter (502 companies across 11 pages in live testing, ~2.7s total). Every entry targeting that quarter is resolved via an in-memory `companyId -> doc` lookup instead of its own `documents()` call.
   - **Hard limitation, confirmed live**: this endpoint has no historical-quarter override. Passing `quarterDate` or `quarter` in the request body returns HTTP 400 `"Extra inputs are not permitted"`. It always reflects whatever quarter Stockscans currently considers "in season" — that's exactly why historical quarters route through a completely different path (#2 below), not this one.
   - `documentType: "Transcript"` as a filter param returns only companies with an official transcript already filed (86 of 502 in testing) — useful if you only care about Tier-2 hits, though the map fetch already covers both tiers in one pass with `documentType: ""`.
   - **Bug fixed 2026-07-26 — this endpoint's own dataset is incomplete; a map MISS is not proof "results aren't out".** Confirmed live: the map's self-reported `total` and our paginated fetch agreed at exactly 502 companies, yet SGMART/SGFIN/TINNARUBR all had Result+PPT+Transcript already filed (confirmed via a direct per-company `documents()` call) and simply weren't among those 502. A bulk run of 20 companies against the raw map wrongly reported 8 as "results not out" — 7 of them actually had results, most with transcripts already filed. Fixed: a ticker absent from the map now falls back to the authoritative per-company `documents()` call before the code concludes results aren't out — the map is trusted as a fast AFFIRMATIVE source only, never as a negative, same principle already applied to the historical-quarter bulk scan and Tier-4 bulk scan below. This costs one extra `documents()` call only for tickers the map's own coverage gap misses, not for the whole batch.
2. **Historical-quarter entries: a different, cheaper, narrower path — not a fallback to the current-quarter machinery.** Per explicit product decision, a quarter that isn't the current results season must already have reported (a historical quarter can't still be "not out yet"), and racing ahead of Stockscans' own filing (the whole point of Perplexity/NotebookLM) is meaningless for something that reported long ago. So `resolveHistoricalEntries()` in `get-latest-concall-transcript.js`: checks the DB (Tier 0) same as always, then does a **bulk transcript-only** lookup via `announcements/scan` (`announcementType: "Earnings Call"`, `searchFilters: ["Transcript"]`) — no Result/PPT gate, no Perplexity, no NotebookLM. Entries that the bulk scan doesn't confirm get one definitive per-company `documents()` check before being marked `historical-transcript-not-found` (never silently trusted as a negative from the bulk path alone — see the quarterDate-bucketing caveat below).
   - **`announcements/scan`'s `quarterDate` filters on the ACTUAL RELEASE/FILING date of the announcement — never the reporting period the document is about.** Confirmed directly by Darshan (2026-07-26), and independently corroborated by `stock-api/src/fetchers/announcementScanner.js`'s pre-existing `lastNQuarterDates()`, which already treated `quarterDate` as a literal calendar-quarter-end bucket with no per-company fiscal-period awareness — the same conclusion, reached separately, before this bulk work existed. Given that, the right `quarterDate` for a document about period `X` is whichever calendar quarter its filing is expected to land in — SEBI's 45-day filing deadline puts that almost always in the immediately following calendar quarter. `computeReleaseQuarterDate()` in `bulkAnnouncementScan.js` is the single canonical function for this (period-end + 3 months) — used for BOTH the historical path here AND the current-quarter Tier 4 search below; there is no "current quarter is different" exception. (An earlier version of this code passed the raw period-end unmodified for current-quarter Tier 4, which was wrong for the same reason and got caught live — see Tier 4's note.) Every bulk-scan miss still gets a definitive per-company `documents()` check before being trusted as a real absence, since a company's actual filing timeline can still occasionally miss the expected window.
3. **Tier 4 (recording search) and the historical-quarter bulk scan both batch via a temporary watchlist above 10 companies — not a chunk-of-10 loop.** `companyFilters` on `/api/company/announcements/scan` accepts at most **10** companyIds per call (confirmed live: an 11th unique id returns HTTP 400 `"List should have at most 10 items"`) — but scanning by `watchlistIds` instead has no such cap (tested live with 15 and 50 companies in one watchlist, both scanned successfully). `scanAnnouncementsForCompanies()` in `bulkAnnouncementScan.js` creates a throwaway watchlist for any batch over 10 companies, scans by `watchlistIds`, then deletes the watchlist in a `finally` block — turning what would be `ceil(N/10)` calls into a fixed handful (create + a few scan pages + delete) regardless of N.
   - **The scan response's `total` field is not trustworthy — do not use it to decide when to stop paginating.** Confirmed live: across 5 consecutive pages of the same query it read 31, 61, 91, 121, 151 (always ≈ offset + page size + 1, self-inflating every page). Results ARE genuinely sorted newest-first (verified: dates monotonically decrease across pages), so `scanAllPages()` instead stops on a short page (fewer than 30 items — genuinely the last page), a page cap (`DEFAULT_MAX_PAGES = 5`), or early-exit once every requested company has at least one match — whichever comes first. A loose keyword/category filter across many companies can genuinely match hundreds of unrelated historical filings; the early-exit means we don't pay for pages we don't need once every company's "most recent match" is already found.
4. **Perplexity (Tier 3), concurrent instead of sequential.** No bulk API exists there — it's still one `earningsEvents()` + one `transcript()` call per company — but the bulk loop now runs with bounded concurrency (`mapWithConcurrency`, `CONCALL_BULK_CONCURRENCY` env var, default 5) instead of awaiting one company at a time. Keep this conservative: Perplexity's cookie/`cf_clearance` auth is already fragile (see Tier 3 notes below), and a banned session costs more time than the concurrency saves.

Net effect for a 1000-company "latest quarter" bulk run: the gate cost drops from ~1000 calls to ~11 shared calls, Tier 4 cost drops from up to 1000 calls to a small fixed handful (watchlist create/scan/delete) instead of `ceil(N/10)`, and only the genuinely fragile Perplexity/NotebookLM tail remains per-company. That tail — NotebookLM's browser-driven UI automation in Tier 4's manual steps below — is the real scaling bottleneck at volume, not API call count, and is out of scope for this pass (it would mean swapping NotebookLM for a scripted transcription API, a bigger architectural change than bulk-ifying the existing calls; see Tier 4's note on batching the upload step instead, which is the cheaper win given most companies never reach Tier 4 in the first place).

**Nothing in bulk mode aborts the whole run on a single broken/unexpected scenario.** A failed bulk-map fetch, a failed watchlist create/scan/delete, or a failed historical-quarter check all degrade to a per-entry fallback or an `error`/`historical-transcript-not-found` status for just the affected entries — the rest of the batch keeps going. Every such degradation is recorded in a `warnings` array and printed to **stderr** (not stdout, so it never breaks JSON parsing of the results array) after the main result — always check stderr after a bulk run, since a clean-looking `stdout` array can still be masking a degraded run (e.g. "results map fetch failed, fell back to slow per-company path for 1000 entries" is a warning, not a crash, and easy to miss if you only look at stdout).

Tunables (env vars, both conservative by default): `CONCALL_BULK_CONCURRENCY` (Perplexity fan-out per bulk run, default 5), `CONCALL_SCAN_CONCURRENCY` (Tier-4 PDF download fan-out, default 3). Raise only after confirming the target API tolerates it — retest the batch-size and concurrency limits live rather than assuming they still hold; Stockscans' undocumented endpoints can change their caps without notice.

## "Latest quarter" — precise definition

The most recently COMPLETED quarter as of today, i.e. current quarter MINUS 1 (results for the current quarter don't exist yet). Indian FY: Apr-Jun=Q1, Jul-Sep=Q2, Oct-Dec=Q3, Jan-Mar=Q4. Example: today in July → currently Q2 → latest quarter = Q1 (Apr-Jun). This is computed by `stock-api/src/utils/fiscalQuarter.js` `latestCompletedQuarter()` — never compute this by hand/reasoning; the FY-vs-calendar-year offset is easy to get wrong at the Q4↔Q1 boundary.

Quarter math: `parseQuarterString()` in the same file handles `Q{N}FY{YY}` → `{yyyymm, fiscalYear, fiscalPeriod}`. Use it; don't hand-compute.

## The waterfall

`get-latest-concall-transcript.js` runs these tiers in order, stopping at the first one that produces a real transcript (or a hard "not out yet" stop). In bulk mode, each entry runs its own waterfall independently (Stockscans auth shared once, and the Tier 1/2 gate + Tier 4 search shared across all entries as described above).

### Tier 0: already in our DB?

Before any network call, reads `data/reports.json` (local index) and looks for a `concall-transcript-early` record where `companyId === ticker` and `id` contains `yyyymm`. If found, prints `{"status": "db-hit", id, summary, ...}` and stops — no auth, no API calls, instant.

**⚠️ CRITICAL — verify DB hit is real before trusting it.** The index can have stale entries pointing to deleted files. Always verify:

```bash
ls data/reports/ | grep -E "FCL|STYL"   # substitute ticker
```

If the file doesn't exist on disk, the DB entry is stale. Use `--force` to bypass and re-fetch.

Use `--force` any time:

- DB shows a hit but actual file is missing
- User explicitly says "force rerun" or "transcript was deleted"
- You suspect a previous run wrote a bad/empty transcript

### Tier 1 (gate): are results even out?

For the current results season in bulk mode, resolved from the shared `resultsDocumentsMap()` lookup (see above) — no per-company call. Otherwise (single-company mode, or an explicit historical quarter), reads Stockscans' `documents()` API for a `Result` or `PPT` document dated `quarter.yyyymm`. **If absent, stops immediately** — `{"status": "results-not-out"}`. Nothing downstream should run.

### Tier 2: official Transcript already filed?

Same source as Tier 1 (map lookup or `documents()`) — if a `Transcript` document is already dated `quarter.yyyymm`, stops — `{"status": "official-transcript-exists", document: {...}}`. Fetch with `stock-documents-fetcher`, not this skill.

### Tier 3: Perplexity Finance (Quartr-sourced)

This IS a verbatim, speaker-attributed transcript — not just audio. When this tier hits, no further transcription step is needed.

Confirmed live 2026-07-24 against `NSE:STLTECH` / `STLTECH.NS`. This uses an unofficial, undocumented Perplexity web-app API — treat it as fragile:

- Requires a full authenticated Cookie session (`PERPLEXITY_COOKIES` in `.env`). Cloudflare `cf_clearance` is short-lived; expect this tier to go stale between runs. Script logs `perplexitySkipReason` and falls through to tier 4 — not a hard failure.
- Refresh: log into perplexity.ai/finance in browser, DevTools → Network, find a transcript request, copy `cookie` header → `PERPLEXITY_COOKIES`, and `x-pplx-account` → `PERPLEXITY_ACCOUNT_ID`.
- BSE-only tickers throw; resolve NSE symbol first or accept fall-through to tier 4.

On success, saves via `saveTranscript()` (`source: "perplexity-quartr"`) and prints `{"status": "saved", tier: "perplexity-quartr", id, filesTouched}`.

### Tier 4: recording announcement + NotebookLM (last resort)

Only reached if tier 3 fails or the event/transcript isn't on Perplexity. In single-company mode, the script already ran `findRecordingAnnouncement()` internally — `recording` in its output contains the result. In bulk mode, this is deferred and resolved for all fallen-through companies in one batched pass via `findRecordingAnnouncementsBulk()` (see the bulk-mode section above) after every entry has run tiers 0-3.

**Bug fixed 2026-07-26 — the scan window and the target quarter are not the same thing.** The deferred bulk search used to pass the target period's own `yyyymm` as the scan's `quarterDate` — wrong, per the same "quarterDate = release date" rule covered above (a live test caught this directly: a company's search returned a _different, older_ quarter's recording that happened to share the scan window, not the actual quarter being asked for). Fixed by routing through `computeReleaseQuarterDate()` uniformly. As a second line of defense — because even the right scan window can contain more than one "recording"-keyword match for a company (late filers, multiple recent calls) — `findRecordingAnnouncementsBulk()` now also checks whether a candidate announcement's own title/description names the target quarter (`buildQuarterLabels()`: `"Q1FY27"`, `"Q1 FY27"`, `"Q1FY2027"`, etc.) and prefers a labeled match over just the newest keyword hit. If nothing in the scan window names the quarter explicitly, it still falls back to the newest match (a `labelConfirmed: false` flag and a warning), rather than reporting nothing found — companies are inconsistent about labeling, so absence of a label isn't proof it's the wrong quarter, just lower confidence. **Always check `recording.labelConfirmed` before transcribing a Tier-4 recording** — `false` means verify it's actually for the intended quarter (read the PDF) before spending the NotebookLM cycle on it.

If `recording.found` is `false`: nothing more to do automatically; tell the user.

If `recording.found` is `true`, `recording.pdfPath` is a local PDF. Continue with this **exact SOP**:

---

Most bulk runs never reach this point — the current-quarter map and Perplexity resolve the large majority of companies, and the deferred Tier-4 batch scan resolves most of the remainder. What's left after all that is typically a small handful of companies, not hundreds, so it's worth downloading ALL of their recordings up front and uploading them to NotebookLM together in one batch (Step 2), rather than doing the full download→upload→generate→copy→delete→remove cycle one company at a time.

#### STEP 1 — Find and download every pending recording

**Load Chrome MCP tools first** (one ToolSearch call):

```
ToolSearch: select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__file_upload
```

For each company with `recording.found: true` in the bulk output, read its PDF (`Read` tool — renders PDFs natively) and look for the recording link:

- **Direct `.mp3`/`.mp4` URL**: download directly with bash, no browser needed:
  ```bash
  curl -L -o recordings/NSE_FCL_Q1FY27.mp3 "https://company.com/path/to/recording.mp3"
  ls -lh recordings/NSE_FCL_Q1FY27.mp3   # verify size > 1MB
  ```
- **Webpage link**: `navigate` to it, `get_page_text` to find the media source URL, then curl.

**Naming convention**: `recordings/NSE_{TICKER_SUFFIX}_{YYYYMM}.mp3`
e.g. `NSE_FCL_202606.mp3`, `NSE_STYL_202606.mp3` — download all of them before moving to Step 2, so the whole batch can be uploaded together.

**Also pass `STOCKSCANS_AUTH_TOKEN` explicitly** when running node scripts — `.env` is not always auto-loaded:

```bash
STOCKSCANS_AUTH_TOKEN="$(grep STOCKSCANS_AUTH_TOKEN .env | cut -d= -f2-)" node stock-api/bin/...
```

---

#### STEP 2 — Upload all recordings to NotebookLM together

Navigate to the "Con Call: Automated Transcript" notebook:

```
navigate: https://notebooklm.google.com
```

Find and open "Con Call: Automated Transcript" from the notebook list, OR navigate directly if you have the URL from a previous session.

**Upload every downloaded audio file in one action** — NotebookLM's file picker supports multi-select, and each file becomes its own separate source. This turns what used to be N round-trips through "Add sources → upload → wait for processing" into one, with only the per-source report generation (Step 3) still needing to loop.

The file input in NotebookLM is aria-hidden and zero-sized. You CANNOT use `file_upload` directly without first exposing it. Exact sequence:

1. Click **"Add sources"** button (top of Sources panel) — this opens the upload dialog.
2. Click **"Upload files"** option in the dialog.
3. A file input now exists in the DOM but is hidden. Run this JS to expose it (also set `multiple` explicitly — some builds default it off for programmatically-exposed inputs):

```js
// Run in javascript_tool
const input = document.querySelector('input[type="file"]');
input.multiple = true;
Object.assign(input.style, {
  position: 'fixed',
  top: '200px',
  left: '200px',
  width: '200px',
  height: '50px',
  opacity: '1',
  zIndex: '99999',
  display: 'block',
  visibility: 'visible',
});
let el = input.parentElement;
while (el && el !== document.body) {
  el.removeAttribute('aria-hidden');
  el = el.parentElement;
}
input.setAttribute('aria-label', 'Upload audio file');
('exposed');
```

4. Run `read_page` with `filter: "interactive"` — find the ref for the now-visible file input (look for `aria-label: "Upload audio file"` or similar).
5. Use `file_upload` with that ref, passing **all the full local paths at once** (comma/array — check the tool's exact multi-file argument shape) rather than calling `file_upload` once per file.
6. Wait for NotebookLM to process every source (watch for all spinners to disappear via screenshot) — scale the wait with file count (~60s for one, proportionally longer for a batch; poll rather than fixed-sleeping the worst case).

Verify the sources panel shows one entry per uploaded file and the chat footer reads "N sources" for the full batch before moving on.

---

#### STEP 3 — Generate the transcript report, once per source

Still one report per company — NotebookLM's report generation is source-scoped, so batching the upload doesn't collapse this loop, only the upload/wait step. For each source in turn:

**Select only that source** (deselect the rest — a report generated against multiple selected sources would blend transcripts together):

```js
// Deselect all sources first, then check only the target one
const checkboxes = document.querySelectorAll('[class*="source"] input[type="checkbox"]');
// Only the target source should be checked
```

The chat footer shows "N sources" — confirm it says "1 source" before generating.

Do NOT use the chat box (it truncates). Use **Studio → Reports**.

1. Click **"Studio"** tab (right panel).
2. Click **"Reports"** card.
3. Click **"Create Your Own"** (custom report option — NOT pre-built templates).
4. In the prompt field, type **exactly** the prompt below — **do NOT use the old short prompt** (`"create comprehensive verbatim transcript"`). Confirmed live 2026-07-27: the short prompt makes NotebookLM produce a _strategic analysis report_ (narrative prose, metric tables, "So What?" investor framing, section headers like "Market Dynamics and Competitive Positioning") instead of a transcript — same total length in the ballpark of a real transcript, so it's easy to mistake for one at a glance, but it is NOT speaker-attributed continuous dialogue. Always use this prompt instead (validated live, produces genuine per-turn verbatim with named speakers and timestamps):
   ```
   Please transcribe the uploaded audio source into a verbatim, continuous transcript.
   Follow these strict constraints:
   1. ACCURACY & FIDELITY:
   - Capture all spoken words exactly as delivered in the audio.
   - Do NOT summarize, synthesize, rephrase, or condense any section.
   - Do NOT add external context, commentary, interpretations, intro text, or concluding notes.
   - Do NOT fix grammatical mistakes or polished spoken language; keep the natural cadence and exact phrasing.
   2. FORMATTING:
   - Present as a clean, chronological dialogue script.
   - Group the speech by distinct speakers (e.g., Speaker 1, Speaker 2, or by named individuals if clearly stated in the audio).
   - Indicate Q&A transitions clearly (e.g., Questioner vs. Management).
   - Use timestamp markers [HH:MM:SS] periodically or whenever speaker changes occur, if discernible.
   3. UNCLEAR AUDIO:
   - If a word, phrase, or technical term is muffled or unintelligible, mark it as [Inaudible - timestamp] rather than guessing.
   Output ONLY the transcript text.
   ```
5. Click **Generate** (or Submit).
6. Poll with `screenshot` every ~20s until the report body appears (takes 2–5 min for a 60-min call).

**Even with this stricter prompt, NotebookLM still isn't 100% obedient** — confirmed live it still inserted a title line and a handful of narrative "bridge" sentences between sections (e.g. _"This transition from high-level strategic positioning effectively links..."_), directly violating its own "Output ONLY the transcript text" instruction. Don't try to prompt-engineer this away further before checking `transcriptSchema.js` first — the schema-level parser (`parseSpeakerLabeledText()`) is the right place to guard against this, not the prompt: it now recognizes and drops non-dialogue blocks (report titles, section headers, narrative connective prose) instead of keeping them as bogus `speaker: null` segments, and consumes standalone `[HH:MM:SS]` lines as the _next_ real segment's `time` rather than emitting them as their own segment. If a saved transcript ever shows `speaker: null` segments mixed into real dialogue, or a segment whose "speaker" is obviously a title/heading (not a name), that parser has regressed — don't just re-prompt NotebookLM.

**Extracting the report text back out of the page** also isn't as simple as the SOP historically implied. Two things that don't work in an unattended/non-interactive session: (1) the report's own "Copy" button copies to the OS clipboard, but reading it back requires `mcp__computer-use__read_clipboard`, which needs an interactive one-time permission dialog that has no one to approve it here; (2) reading `element.innerText` via `javascript_tool` works, but the tool's return value is truncated to roughly 1000 characters — pulling a 10-30K-character transcript out 900 characters at a time is impractically slow. **What works**: click into the page's own chat input (a real `<textarea>`), send the native OS paste keystroke (`key: "cmd+v"`) after copying the report, then read that textarea's `.value` via `javascript_tool` (`document.activeElement.value`) — the DOM value itself has no such truncation. For a value still too large for one readable response, stash it in `location.hash` via `history.replaceState(null, '', '#' + encodeURIComponent(text))` and read the full hash back from `tabs_context_mcp`'s reported tab URL — URL length isn't subject to the same ~1000-char return-value truncation. `URL.createObjectURL` + a triggered `<a download>` click also works to produce a real file, but it lands in the OS Downloads folder, which isn't reachable from this session's sandboxed bash — only use that path if the user is present to move the file themselves.

**If a NotebookLM tab seems completely unresponsive** (every `screenshot`/`javascript_tool`/`get_page_text` call times out with "script injection timed out" or "waited for document_idle"), this is very likely a STALE TAB, not a NotebookLM outage — confirmed live 2026-07-27: an old tab that had accumulated several failed script-injection attempts got stuck this way, while opening a brand new tab (`tabs_create_mcp`) and navigating fresh to `notebooklm.google.com` worked immediately with zero issues. Don't spend more than one or two retries fighting a stuck tab — open a fresh one instead.

**Finding the right notebook card reliably**: don't click by pixel coordinate or by guessing which `read_page` interactive-element ref corresponds to which card — the "Recent notebooks" grid re-sorts by recency and a stale ref can silently open the wrong notebook (confirmed live: this happened and opened an unrelated notebook). Use the `find` tool with a query naming the exact notebook title (e.g. `find({query: "Con Call: Automated Transcript notebook card"})`) and click its returned ref.

---

#### STEP 4 — Copy the transcript

Once the report is generated and shown in the right panel:

1. Click inside the report body area.
2. Press **⌘A** (Select All), then **⌘C** (Copy).
3. Read clipboard:

```
mcp__computer-use__read_clipboard
```

Save to file immediately:

```bash
cat > recordings/NSE_FCL_202606_transcript.txt << 'EOF'
[paste clipboard content here]
EOF
```

---

#### STEP 5 — Delete the report

Repeat Steps 3-5 for each remaining source before moving on to cleanup — one report generated and saved per company, with sources still all uploaded from Step 2's single batch upload.

**Exact JS sequence** (coordinate clicks are unreliable due to menu closing on focus loss):

```js
// Step A: Identify which more_vert button belongs to the report
// (not the chat ⋮ — that's the last one; the report ⋮ is inside artifact-header)
const buttons = Array.from(document.querySelectorAll('button'));
const moreVerts = buttons.filter((b) => b.textContent.trim() === 'more_vert');
// Verify: moreVerts.map((b,i) => `${i}: ${b.closest('[class*="artifact-header"]') ? 'REPORT' : b.parentElement?.className?.slice(0,40)}`).join('\n')
// The one whose closest ancestor has 'artifact-header' is the report button

// Step B: Click it
moreVerts[N].click(); // N = index of the report ⋮ button
```

Then immediately (without taking a screenshot first which would close the menu):

```js
// Step C: Wait, then click Delete from the overlay
await new Promise((r) => setTimeout(r, 500));
const overlayContainer = document.querySelector('.cdk-overlay-container');
const allItems = Array.from(overlayContainer.querySelectorAll('*'));
const deleteLeaf = allItems.find(
  (el) => el.textContent.trim() === 'Delete' && el.children.length === 0
);
if (deleteLeaf) deleteLeaf.click();
```

A **"Delete Report?"** confirmation dialog will appear. Confirm by clicking Delete button in the overlay:

```js
const overlay = document.querySelector('.cdk-overlay-container');
const btns = Array.from(overlay.querySelectorAll('button'));
const del = btns.find((b) => b.textContent.trim() === 'Delete');
if (del) del.click();
```

Take a screenshot to confirm the report panel reverts to the Studio card grid.

---

#### STEP 6 — Remove the source

For each uploaded source (by index in the sources panel, 0 = first):

```js
// Open source ⋮ menu (source buttons are at indices 0,1,... chat ⋮ is the last one)
const buttons = Array.from(document.querySelectorAll('button'));
const moreVerts = buttons.filter((b) => b.textContent.trim() === 'more_vert');
moreVerts[0].click(); // First source
await new Promise((r) => setTimeout(r, 500));

// Click "Remove source"
const overlay = document.querySelector('.cdk-overlay-container');
const allEls = Array.from(overlay.querySelectorAll('*'));
const removeEl = allEls.find(
  (el) => el.textContent.trim() === 'Remove source' && el.children.length === 0
);
if (removeEl) removeEl.click();
```

Confirmation dialog appears — click Delete:

```js
const overlay = document.querySelector('.cdk-overlay-container');
const btns = Array.from(overlay.querySelectorAll('button'));
const del = btns.find((b) => b.textContent.trim() === 'Delete');
if (del) del.click();
```

Repeat for each source. Final state: Sources panel shows "Saved sources will appear here" and chat footer shows "0 sources".

---

#### STEP 7 — Save to DB

```bash
STOCKSCANS_AUTH_TOKEN="$(grep STOCKSCANS_AUTH_TOKEN .env | cut -d= -f2-)" \
  yarn workspace @stock/api save-concall-transcript <TICKER> <yyyymm> recordings/<file>.txt \
  --source-url "<recording-url>" \
  --fiscal-year <YYYY> --fiscal-period <Q1..Q4>
```

Verify output: `{"ok":true,"id":"rpt_concall-transcript-extractor_...","filesTouched":[...]}`

---

#### STEP 8 — Data push

```bash
STOCKSCANS_AUTH_TOKEN="$(grep STOCKSCANS_AUTH_TOKEN .env | cut -d= -f2-)" \
  yarn data:push
```

This may time out (>45s) but is idempotent — verify completion via sync state:

```bash
cat data/_meta/sync-state.json | python3 -c "
import json,sys; d=json.load(sys.stdin)
files = d.get('files', {})
matches = {k:v for k,v in files.items() if 'TICKER' in k}
print(json.dumps(matches, indent=2))
"
```

If `syncedAt` appears for the report file, the push succeeded even if the process timed out.

---

## How other skills should call this

**All skills that need a concall transcript must call `get-latest-concall-transcript.js` first, check `status`, and read the transcript from the DB.** Never fetch transcripts independently.

### Latest quarter (most common):

```bash
yarn workspace @stock/api get-latest-concall-transcript NSE:TICKER
```

### Specific quarter:

```bash
yarn workspace @stock/api get-latest-concall-transcript NSE:TICKER --quarter Q1FY27
```

### Bulk fetch (for multi-quarter or multi-company skills):

```bash
yarn workspace @stock/api get-latest-concall-transcript --bulk \
  '[{"ticker":"NSE:X","quarter":"Q4FY26"},{"ticker":"NSE:Y","quarter":"Q1FY27"}]'
```

### Reading the result:

```js
// Pseudocode — run the script, parse stdout
const result = JSON.parse(scriptOutput);

if (result.status === 'db-hit' || result.status === 'saved') {
  // Transcript in DB — read it
  const transcript = readReport(result.id); // data/reports/<id>.json
  // transcript.fullText = the whole transcript as a string
  // transcript.segments = per-speaker turn array
} else if (result.status === 'official-transcript-exists') {
  // Use stock-documents-fetcher to fetch result.document
} else if (result.status === 'results-not-out') {
  // Quarter hasn't reported yet — tell the user
} else if (result.status === 'needs-recording-pipeline') {
  // Trigger tier 4 manual steps (see above)
} else if (result.status === 'historical-transcript-not-found') {
  // Historical-quarter entry only — bulk scan + documents() fallback both
  // came up empty. Per policy this does NOT fall back to Perplexity/NotebookLM
  // (those tiers only make sense for racing ahead of an official filing that
  // hasn't happened yet, which doesn't apply to an already-reported quarter).
}
```

For bulk mode, the result is an array — iterate and handle each entry's `status` individually. **Also check stderr for a `{"warnings": [...]}` block** — bulk mode never aborts on a single broken step (a failed bulk-map fetch, watchlist scan, etc.), so a clean `results` array can still be hiding a degraded run reported only via warnings (see "Bulk-mode call volume" above).

## Output schema — fixed, uniform across all sources

Every saved transcript has the same content shape regardless of which tier produced it. This is enforced by routing every save through `saveTranscript()` / `transcriptSchema.js` `buildTranscriptContent()`.

```json
{
  "id": "rpt_concall-transcript-extractor_NSE:STLTECH_202606_early",
  "creator": "concall-transcript-extractor",
  "type": "concall-transcript-early",
  "companyId": "NSE:STLTECH",
  "date": "2026-06-01",
  "quarterDate": "202606",
  "fiscalYear": 2027,
  "fiscalPeriod": "Q1",
  "transcriptSource": "perplexity-quartr",
  "sourceUrl": "https://files.quartr.com/streams/.../playlists.m3u8",
  "summary": "Verbatim earnings-call transcript for NSE:STLTECH (202606), sourced from Quartr (via Perplexity Finance), speaker-attributed. 116 segments, 14 speakers, ~8198 words.",
  "contextUsed": ["cmp_NSE:STLTECH"],
  "segments": [
    {
      "i": 0,
      "speaker": "Operator",
      "speakerRole": "operator",
      "time": 0.1,
      "text": "Good day, welcome to..."
    }
  ],
  "fullText": "Operator: Good day, welcome to...\n\n...",
  "participants": [{ "name": "Operator", "role": "operator" }],
  "stats": { "segmentCount": 116, "speakerCount": 14, "wordCount": 8198, "charCount": 49053 }
}
```

Field notes:

- **`segments`** — source of truth; per-speaker turns in order. Use for per-speaker analysis.
- **`fullText`** — derived from segments; use when you want the whole transcript as a single string to pass to an LLM.
- **`speaker`/`time`** can be `null` (NotebookLM tier gives no attribution/timing). Never fabricated.
- **`speakerRole`** is best-effort: `"operator"` reliably identified, everything else `"unknown"`.
- Records under 200 chars (`stats.charCount`) are refused at save time.

## Storage

All saves go through `stock-api/bin/save-concall-transcript.js` `saveTranscript()` → `packages/jobs-runtime/lib/db.js` `saveReport()` → `data/reports.json` index + `data/reports/<id>.json` body. Never write `data/reports*.json` by hand.

**End every run** with `yarn data:push` and report the `filesTouched` manifest (or verify via sync-state.json if it times out).

## Failure modes

- **`{"status": "results-not-out"}`**: as of the 2026-07-26 fix, this is always verified via per-company `documents()` (either directly, or as the bulk-map's fallback), so it should be a real "not out yet" — normal, tell user when to check back. If you ever see many of these at once across a "should be reported by now" set of companies, spot-check one directly with `documents()` before trusting the batch — that pattern is exactly what the bulk-map coverage bug looked like before it was fixed.
- **`STOCKSCANS_AUTH_TOKEN` expired**: script throws a clear message; refresh it.
- **`STOCKSCANS_AUTH_TOKEN` not loading from .env**: always prefix node commands with `STOCKSCANS_AUTH_TOKEN="$(grep STOCKSCANS_AUTH_TOKEN .env | cut -d= -f2-)"`.
- **DB hit but file missing on disk**: stale index entry. Verify with `ls data/reports/ | grep TICKER`, then use `--force`.
- **Perplexity keeps failing**: check `perplexitySkipReason` — "no matching event" (company not covered) vs auth/403 (refresh `PERPLEXITY_COOKIES`). Tier 4 still runs.
- **`resultsDocumentsMap()` batch returns HTTP 400 with `quarterDate`/`quarter` in the body**: expected — this endpoint has no historical-quarter override. Confirm the entry's requested quarter actually equals `latestCompletedQuarter()` before relying on the map; otherwise it's a historical entry and should route through `resolveHistoricalEntries()` instead.
- **Any `announcements/scan` call returns HTTP 400 "List should have at most 10 items..."**: something bypassed `scanAnnouncementsForCompanies()`/`bulkAnnouncementScan.js` and hand-built a `companyFilters` array directly. Never do that for more than 10 companies — always go through the shared helper, which switches to a temporary watchlist above that threshold.
- **Bulk map fetch, watchlist create/scan/delete, or historical resolution fails outright**: none of these abort the run — they degrade to a per-entry fallback or an `error` status and get logged to the `warnings` array (stderr). If you see a warning about a failed watchlist deletion, go delete it manually from stockscans.in/watchlists — a leaked temp watchlist is harmless but clutters the account.
- **A historical-quarter entry is confidently `historical-transcript-not-found` but you believe the transcript exists**: the code already falls back to per-company `documents()` before concluding "not found," so a genuine miss here likely means neither source has it yet — but if a company files well outside the normal SEBI 45-day window, `computeReleaseQuarterDate()`'s "next calendar quarter" assumption could miss its actual scan window. Worth spot-checking with a direct `documents()` call if this ever seems wrong.
- **`recording.labelConfirmed` is `false` on a Tier-4 result**: the matched announcement's title/description didn't explicitly name the target quarter — it's still the newest keyword match in the (correct) scan window, but verify by reading the PDF before transcribing it. This exists because of a real bug caught live: a company can have more than one "recording" announcement in the same scan window, and only one is actually about the quarter you want.
- **NotebookLM file input not in accessibility tree**: it's aria-hidden. Use the JS exposure snippet in Step 2 above before attempting `file_upload`.
- **NotebookLM menu closes before delete click**: use JS `moreVerts[N].click()` + wait 500ms + find Delete leaf in `.cdk-overlay-container` in one JS call. Never use coordinate clicks for this sequence.
- **Data push times out**: idempotent — check `data/_meta/sync-state.json` for `syncedAt` to confirm files were uploaded.
- **Recording link expired/live-stream/nothing playable**: report this rather than guessing.
- **Machine-transcribed output reads oddly**: real limitation; `transcriptSource` on the DTO flags which pipeline produced it.

## Files touched by this skill

- `stock-api/bin/get-latest-concall-transcript.js` — primary entrypoint: tiers 0-4 for current-quarter entries, `resolveHistoricalEntries()`/`toAnnouncementScanQuarterDate()` for historical-quarter entries, bulk-mode partitioning + warnings collection
- `stock-api/bin/find-earnings-recording.js` — tier 4 recording search (single-company `findRecordingAnnouncement` and bulk `findRecordingAnnouncementsBulk`, both now backed by `bulkAnnouncementScan.js`)
- `stock-api/bin/save-concall-transcript.js` — storage (tiers 3 and 4)
- `stock-api/src/utils/fiscalQuarter.js` — quarter math (`latestCompletedQuarter`, `parseQuarterString`)
- `stock-api/src/utils/transcriptSchema.js` — fixed output schema; `parseSpeakerLabeledText()` drops non-dialogue report titles/headers/narrative-bridge blocks instead of keeping them as bogus `speaker: null` segments (see Tier 4 STEP 3 notes above), and consumes standalone `[HH:MM:SS]` lines as the next segment's `time`
- `stock-api/src/utils/concurrency.js` — `mapWithConcurrency`/`withRetry`/`chunk` used throughout the bulk paths and Perplexity fan-out
- `stock-api/src/utils/bulkAnnouncementScan.js` — `scanAnnouncementsForCompanies()`: the shared watchlist-batching + bounded-pagination helper behind both Tier 4 and the historical-quarter transcript check; `computeReleaseQuarterDate()`: the single canonical quarterDate calculation (period-end + 1 calendar quarter, per the confirmed "quarterDate = release date" rule), used everywhere a target reporting period needs to become a scan window; `buildAnnouncementScanBody()`: the smart payload builder that bakes in the required real `scanId`/`scanName` so no caller can accidentally omit it; also defines `DEFAULT_MAX_PAGES`/`COMPANY_FILTERS_MAX`, the two hard-won constants from live testing
- `stock-api/bin/find-earnings-recording.js` also has `buildQuarterLabels()` — the quarter-label sanity check used to prefer a Tier-4 match that actually names the target quarter over just the newest keyword hit
- `stock-api/src/clients/StockscansClient.js` — `resultsDocuments`/`resultsDocumentsMap` (current-quarter bulk gate), `scanAnnouncements` (used by the bulk-scan helper), `createWatchlist`/`deleteWatchlist` (temporary batching watchlists)
- `stock-api/src/http/HttpClient.js` — `delete()` now accepts an optional `data` body (needed for `DELETE /api/user/watchlists {watchlistId}`, which takes its id in the body, not as a path param)
- `stock-api/src/clients/PerplexityClient.js`, `perplexityAuth.js` — tier 3
- `data/reports.json`, `data/reports/<id>.json` (via the save step)
- `.env` — `PERPLEXITY_COOKIES`, `PERPLEXITY_ACCOUNT_ID` (refresh periodically)
