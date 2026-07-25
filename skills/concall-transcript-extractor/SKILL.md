---
name: concall-transcript-extractor
description: Produces a verbatim earnings-call transcript for an Indian listed company for the most recently COMPLETED quarter (current quarter minus 1), racing ahead of Stockscans' official Transcript filing when possible. Checks results are actually out first, then tries Perplexity/Quartr's speaker-attributed transcript, then falls back to finding the "Recording of Conference Call" announcement and transcribing it via NotebookLM. Use whenever the user says "get me the latest concall transcript before it's officially filed", "transcribe the earnings call recording for X", "extract the concall transcript early", "what did management say on the Q1 call" before the official transcript exists, or wants the fastest possible verbatim transcript right after a results call. Also trigger when another skill (concall-analysis, quarterly-result-analysis, management-credibility-tracker) needs a transcript and Stockscans' `documentType === "Transcript"` document isn't available yet for the latest quarter.
---

# Concall Transcript Extractor

Gets a working verbatim transcript of a company's most recently completed
quarter's earnings call — using the fastest available source, checked in order
of trust/speed. Entrypoint (does steps 0-3 below in one call):

```
node stock-api/bin/get-latest-concall-transcript.js <TICKER> [--out-dir <dir>]
```

`<TICKER>` is Stockscans format, e.g. `NSE:STLTECH`. This is the ONLY script you
should run directly — it orchestrates everything else and tells you exactly
what (if anything) is left to do by hand.

## "Latest quarter" — precise definition

The most recently COMPLETED quarter as of today, i.e. current quarter MINUS 1
(results for the current quarter don't exist yet). Indian FY: Apr-Jun=Q1,
Jul-Sep=Q2, Oct-Dec=Q3, Jan-Mar=Q4. Example: today in July → currently Q2 →
latest quarter = Q1 (Apr-Jun). This is computed by
`stock-api/src/utils/fiscalQuarter.js` `latestCompletedQuarter()` — never
compute this by hand/reasoning; the FY-vs-calendar-year offset is easy to get
wrong at the Q4↔Q1 boundary (verified against live Perplexity data 2026-07-24
and unit-tested at all four quarter boundaries).

## The waterfall

`get-latest-concall-transcript.js` runs these tiers in order, stopping at the
first one that produces a real transcript (or a hard "not out yet" stop):

### Tier 0 (gate): are results even out?

Reads Stockscans' `documents()` API and looks for a `Result` document dated
`quarter.yyyymm`. **If it's not there, stop immediately** — the script prints
`{"status": "results-not-out"}` and nothing downstream should run. A
"transcript" produced before results are filed would be for the wrong quarter
or simply doesn't exist; don't try harder here, just report it to the user.

### Tier 1: official Transcript already filed?

Same `documents()` response — if a `Transcript` document is already dated
`quarter.yyyymm`, stop and use that (it's always the best source: proofread,
company-reviewed). Script prints `{"status": "official-transcript-exists",
document: {...}}`. Fetch it with `stock-documents-fetcher`, not this skill —
don't duplicate storage for something already officially available on demand.

### Tier 2: Perplexity Finance (Quartr-sourced) — a full transcript, not just audio

**This is not a NotebookLM-style audio pointer — it IS a verbatim,
speaker-attributed transcript already**, sourced from Quartr via Perplexity's
internal finance API. When this tier hits, no further transcription step is
needed at all.

Confirmed live 2026-07-24 against `NSE:STLTECH` / `STLTECH.NS`, same-day call:
the events-list endpoint returned the matching `{fiscalYear: 2027,
fiscalPeriod: "Q1"}` event, and its transcript endpoint returned a 50KB
`status: "final"` transcript with per-paragraph `speakers` — while the
call was still fresh (`actualRevenue`/`actualEps` on the events-list entry
were still `null` at the time, which is why the code does NOT gate on those
fields — see the comment in `tryPerplexity()`; trust the transcript endpoint's
own `status` field instead).

**This is an unofficial, undocumented Perplexity web-app API, not a public
product API** — treat it as fragile:

- Both the events-list AND transcript endpoints require a full authenticated
  Cookie session (confirmed live: zero cookies → Cloudflare 403 challenge,
  even though individual events report `requiresLogin: false`).
- The session cookie (`PERPLEXITY_COOKIES` in `.env`) contains a
  `cf_clearance` Cloudflare-challenge cookie that is short-lived (minutes to a
  few hours) and may be sensitive to the IP/browser fingerprint that solved
  the challenge. **Expect this tier to go stale between runs** — that's normal,
  not a bug. When it fails, the script logs `perplexitySkipReason` and falls
  through to tier 3 automatically; it does not block the pipeline.
- Refresh: log into perplexity.ai/finance in a browser, DevTools → Network,
  find a `/rest/finance/earnings/*/transcript/*` request, copy its `cookie`
  header into `PERPLEXITY_COOKIES`, and `x-pplx-account` into
  `PERPLEXITY_ACCOUNT_ID`.
- Ticker conversion (`NSE:STLTECH` → `STLTECH.NS`) throws for BSE-only tickers
  rather than guessing a `.BO` suffix — see `toPerplexityTicker()` in
  `PerplexityClient.js`. If a BSE-only company needs this tier, resolve its NSE
  symbol first (or accept it'll fall through to tier 3).

On success, the script saves the transcript itself (via
`save-concall-transcript.js` `saveTranscript()`, `source: "perplexity-quartr"`)
and prints `{"status": "saved", tier: "perplexity-quartr", id, filesTouched}`.
You're done — no further steps needed.

### Tier 3: recording announcement + NotebookLM (last resort)

Only reached if tier 2 fails or the event/transcript isn't available yet on
Perplexity. This is the original recording-announcement pipeline:

1. **(script, already run for you)** `get-latest-concall-transcript.js` calls
   `findRecordingAnnouncement()` internally and includes the result under
   `recording` in its output — no need to run `find-earnings-recording.js`
   separately. If `recording.found` is `false`, there's nothing more to do
   automatically; tell the user no recording announcement or transcript exists
   yet for this quarter through any available source.

2. **(Read + judgment, then possibly Chrome MCP)** If `recording.found` is
   `true`, `recording.pdfPath` is a local PDF of the announcement. Read it
   (`Read` tool — renders PDFs natively) and look for the actual recording
   link:
   - **Direct media link** (`.mp3`/`.mp4`): download directly, no browser needed.
   - **Webpage link**: open with Chrome MCP (`navigate`, `get_page_text`,
     `find`) and locate the actual playable/downloadable media on that page —
     companies often link to a hosted player rather than a raw file; use
     `read_network_requests` after triggering play, or the page's own
     "Download" button.

3. **(Chrome MCP UI automation — no API exists for this)** Transcribe via
   NotebookLM. **There is no NotebookLM API** — its report generation goes
   through Google's internal, unversioned RPC endpoint
   (`LabsTailwindOrchestrationService/GenerateFreeFormStreamed`), gated by a
   build-label that changes with every release and a per-session token.
   Calling that directly isn't viable. Instead:
   1. `navigate` to the target notebook (default: "Con Call: Automated
      Transcript", or ask the user which notebook to use).
   2. **Add sources → Upload files** with the downloaded audio/video. Files
      downloaded by this skill live in the sandbox, not the user's real
      machine — if Chrome MCP's `file_upload` tool can't resolve a sandbox
      path, save the file to the user's connected workspace folder first so
      it's reachable, or ask the user to drag it in.
   3. Wait for the source to finish processing, then **Studio → Reports**.
   4. Prompt exactly: `create comprehensive verbatim transcript`.
   5. Poll (screenshot/`get_page_text` every ~15s) until the report finishes.
   6. Save the output text locally as `<TICKER>_<yyyymm>_transcript.txt`.

4. **(script)** Save it:
   ```
   node stock-api/bin/save-concall-transcript.js <TICKER> <yyyymm YYYYMM> <transcript.txt> \
     --source-url <recording-url>
   ```
   This calls `saveTranscript()` with `source: "notebooklm-audio"`.

**NotebookLM UI has changed / automation breaks**: this tier is inherently
coupled to NotebookLM's current UI. Screenshot the current state, adjust the
steps above, and don't silently fall back to guessing content.

## Output schema — fixed, uniform across all sources

**Every saved transcript has EXACTLY this content shape, regardless of which
tier produced it.** This is the whole point of routing every save through
`saveTranscript()` / `transcriptSchema.js` `buildTranscriptContent()` instead
of letting each tier write its own ad-hoc format: a downstream reader (another
skill, a script, a human skimming `data/reports/<id>.json`) never has to
branch on `transcriptSource` to know how to parse the content — only to know
how much to trust it.

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
    },
    {
      "i": 1,
      "speaker": "Rahul Darak",
      "speakerRole": "unknown",
      "time": 27.4,
      "text": "Thank you. Good day, everyone..."
    }
  ],
  "fullText": "Operator: Good day, welcome to...\n\nRahul Darak: Thank you. Good day, everyone...",
  "participants": [
    { "name": "Operator", "role": "operator" },
    { "name": "Rahul Darak", "role": "unknown" }
  ],
  "stats": { "segmentCount": 116, "speakerCount": 14, "wordCount": 8198, "charCount": 49053 }
}
```

Field notes for downstream consumers:

- **`segments`** is the source of truth — one entry per spoken turn, in order
  (`i` is the 0-based index, redundant with array position but kept explicit
  so a filtered/sorted subset is still self-describing). Use this when you
  need per-speaker or per-timestamp analysis (e.g. "what did the CFO say
  about margins", "what was said in the first 5 minutes").
- **`fullText`** is `segments` flattened to `"Speaker: text"` blocks joined by
  blank lines — use this when you just want the whole transcript as a single
  string (e.g. to paste into an LLM prompt). It is DERIVED, never
  independently authored — regenerating it from `segments` always reproduces
  it exactly, so don't bother diffing the two.
- **`speaker`/`time`** can be `null` (source gave no attribution, or no
  timing data — true for the NotebookLM/plain-text tier). Never fabricated.
- **`speakerRole`** is best-effort: `"operator"` is reliably identifiable,
  everything else is `"unknown"` rather than guessing management-vs-analyst
  wrong. Don't build logic that assumes `"management"`/`"analyst"` values
  exist yet — they don't, by design (see `transcriptSchema.js` `classifyRole`
  for where to extend this later, e.g. by cross-referencing `participants`
  against a known-KMP list, if a real need for it shows up).
- **`participants`/`stats`** are both derived from `segments` — never
  hand-set, can't drift from the content they describe.
- Building this schema from raw input (any tier) always goes through
  `buildTranscriptContent({ segments | paragraphs | rawText })` in
  `stock-api/src/utils/transcriptSchema.js` — pass whichever one shape you
  have; never hand-assemble `segments` in a calling script.

## Storage (docs/DATA_RULES.md §2 — "Analysis/report DTO" row)

All saves (tiers 2 and 3) go through `stock-api/bin/save-concall-transcript.js`
`saveTranscript()` → `packages/jobs-runtime/lib/db.js` `saveReport()` →
`data/reports.json` index + `data/reports/<id>.json` body. Never write
`data/reports*.json` by hand. `type: "concall-transcript-early"` +
`transcriptSource: "perplexity-quartr"|"notebooklm-audio"` distinguish these
from Stockscans' own official `documentType === "Transcript"` filing, so
downstream skills can tell the two apart and prefer the official one once it
lands. Records under 200 chars (by `stats.charCount`) are refused (a
silently-failed generation shouldn't pollute the DB).

**End every run** with `node packages/jobs-runtime/scripts/data.js push` and
report the `filesTouched` manifest the save step returns (per
`docs/DATA_RULES.md` §7) in your final summary to the user.

## Failure modes

- **`{"status": "results-not-out"}`**: normal — the quarter hasn't reported
  yet. Not an error; tell the user when to check back.
- **`STOCKSCANS_AUTH_TOKEN` expired**: the script calls `validateAuth()` first
  and throws a clear message; refresh it (same flow as `stock-documents-fetcher`).
- **Perplexity tier keeps failing**: check `perplexitySkipReason` in the output
  first — "no matching event" (company not covered) is different from an
  auth/403 failure (refresh `PERPLEXITY_COOKIES`). Either way it's a soft
  failure; tier 3 still runs.
- **Recording link is a live-stream / expired link, or nothing playable found**:
  report this rather than guessing at a substitute.
- **Machine-transcribed output reads oddly** (speaker misattribution, garbled
  figures) — a real limitation of both Perplexity's and NotebookLM's
  transcription. `transcriptSource` on the saved DTO flags which pipeline
  produced it; encourage downstream skills to prefer the official transcript
  once filed regardless of source.

## Files touched by this skill

- `stock-api/bin/get-latest-concall-transcript.js` — primary entrypoint (tiers 0-2, hands off tier 3)
- `stock-api/bin/find-earnings-recording.js` — tier 3 search/download (also runnable standalone)
- `stock-api/bin/save-concall-transcript.js` — storage (tiers 2 and 3)
- `stock-api/src/utils/fiscalQuarter.js` — quarter math
- `stock-api/src/utils/transcriptSchema.js` — the fixed output schema (segments/fullText/participants/stats)
- `stock-api/src/clients/PerplexityClient.js`, `stock-api/src/auth/perplexityAuth.js` — tier 2
- `data/reports.json`, `data/reports/<id>.json` (via the save step)
- `.env` — `PERPLEXITY_COOKIES`, `PERPLEXITY_ACCOUNT_ID` (gitignored; refresh periodically, see tier 2 above)
