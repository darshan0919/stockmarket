# Skill Conventions

This document outlines the standard conventions that all stockmarket skills must follow.
Data conventions (§3, §6–8) implement `docs/DATA_ECOSYSTEM.md` (v2).
When CREATING or MODIFYING a skill/job that persists data — or adding a new
collection/type — follow the mandatory checklist in `docs/DATA_RULES.md`.
Repo-wide rules that apply beyond skills too — API-integration typing/schema
requirements, the Workspace Facade Pattern (always invoke a repo script via
its `package.json`/`yarn` command, never a raw `node path/to/script.js`), and
documentation coverage — live in `AGENTS.md` at the repo root (§4–§7). Any
new script a skill invokes must have a `yarn`-runnable command before a
skill's instructions reference it.

1. **Deterministic Execution:** Skills must run deterministically, loading explicitly defined modules.
2. **Env Resolution:** Secrets and configuration must be pulled from the unified Env abstraction (`packages/jobs-runtime/lib/env.js`). DO NOT parse `.env` manually. Every script that reads a secret (`process.env.<SECRET>`) MUST call `loadEnv()` itself near the top of `main()` — `require('./lib/env').loadEnv(argValue(process.argv, '--env-file', null))` — before that read. Never assume the invoking shell/scheduler already sourced the repo-root `.env`; that assumption fails silently (e.g. `sendHtmlEmail` degrading to `{status:'skipped'}` instead of erroring) the moment the script runs in an environment that didn't pre-populate `process.env`, which is exactly the failure mode `loadEnv()` exists to make impossible. See `dealsDigest.js` / `watchlistUpdater.js` for the reference call site.
3. **Data Access:** All persistent reads/writes go through `packages/jobs-runtime/lib/db.js` — the only module allowed to touch `data/*.json`. Use `saveReport`, `appendEvents`, `appendNotes`, `saveThesis`, `appendValidations`, `find`, `get`. Never write collection files directly (db.js owns locking, checkpoints, atomic writes, and the envelope).
4. **Offline Testability:** All API clients and business logic must be testable offline with mocked fixtures.
5. **JSON-first rendering:** Every reportable output is a JSON DTO first (`db.saveReport`). PDF/HTML/email are pure template renders of that DTO into `data/assets/` — regenerable, never a source of truth, never hand-written alongside the DTO.
6. **Data Lifecycle:** All generated data lives under `<repo>/data/` (never repo root, cwd, or ad-hoc folders). Store ONLY metadata, links, LLM/analyst outputs, and non-regenerable state. Anything re-derivable at runtime via script/API (raw API dumps, downloaded PDFs, market data) is NOT stored — raw run artifacts go to `data/runs/`, heavy frequently-read derivables to `data/cache/`. Before a skill finishes it MUST run `yarn data:push` — idempotent, PUSH-ONLY sync to Drive `StockMarket/data/v2`. Everything under `data/` is kept locally (full 1:1 mirror); nothing is ever deleted in a write path (Cowork mounts throw EPERM on delete — an inline `rm` can abort the save that triggered it). Re-fetchable source documents (downloaded PDFs) are simply not persisted under `data/` in the first place — read them from a temp dir outside the mirror.
7. **No data in git:** `data/` is gitignored (except committed config explicitly allow-listed in `.gitignore`). Never `git add` data files; config, JSON Schemas, and render templates are the only non-code files that belong in the repo.
8. **Context first (company-scoped skills):** Any skill generating a report/insight about a company MUST call `buildCompanyContext(companyId)` (`packages/jobs-runtime/lib/companyContext.js`) before generating, weigh the returned prior reports, notes, thesis, events, and validation verdicts, and record what it considered in its DTO as `contextUsed: [ids]`. Every stored object carries `id`, `creationTime`, `modifiedTime`, `creator`, plus `companyId`/`companyIds` and `date` (the market/business date the record is about) where applicable.
9. **Files-touched manifest (every skill/job that produces data):** the run's final report/response MUST list every file created or modified during the run — collections touched (with record counts from the db.js stats), plus any `runs/`, `cache/`, `assets/` files. Deterministic sources: `db.touchedFiles()` / `StorageService.touchedFiles()` (per-process tracking) and the `data:push` output (one `↑ <file>` line per uploaded file). Don't reconstruct the list from memory — read it from these sources.
10. **Report/PDF design system:** every skill that produces a PDF or HTML report follows `skills/_shared/pdf-design-guide.md` — the flat institutional-briefing palette, monospace section headers, and `.chip`/`.hl`/`.kpi`/`.vmatrix` component vocabulary. Generators under `stock-api/src/generators/*.js` get this automatically via `pdfUtils.js`/`pdfRenderer.js` (don't hardcode colors — use the shared palette/helpers). Skills rendering HTML directly (no JS generator) copy the CSS block from the guide verbatim. Never introduce a new visual language per skill.
11. **Token-optimization suggestion (every run, no exceptions):** every skill invocation ends its final report with a short, evidence-based suggestion for reducing token/time spend on the _next_ run of the same task — e.g. what could be cached or skipped now that it's been fetched once, what fraction of the work was mechanical enough to hand to a lower-cost model, what batching opportunity was missed. Base it on what actually happened in this run, not a generic tip. This is a standing requirement across all skills, not a per-skill opt-in.

12. **Stockscans `ssUrl` → document URL:** any Stockscans API record carrying an `ssUrl` (or a variant like `transcriptSsUrl`, `resultSsUrl`, `pptSsUrl`) resolves to the human/PDF-viewable document at `https://www.stockscans.in/document/<ssUrl>`. This applies to every document type, not just transcripts. Concall transcripts specifically are now guaranteed to exist for every reported quarter (Stockscans added live concall support 2026-07) — resolve them via `stock-api/bin/get-concall-transcript-url.js` (`StockscansClient.documents` for a single company/quarter, `resultsDocuments({watchlistIds})` for many companies/latest quarter, `scanAnnouncements({scan:{watchlistIds}, quarterDate})` for many companies/historical quarter — all via a throwaway watchlist for the bulk cases). Do NOT use the retired `concall-transcript-extractor` skill/waterfall (Perplexity/recording/NotebookLM fallbacks) for new work — it's kept only for reference, not called by any current skill. **Full payload/response schemas for every Stockscans endpoint this repo calls live in `docs/stockscans-api-schemas.md` — check there before asking for or re-deriving a sample payload.**

13. **API contract documentation is MANDATORY, not just for Stockscans.** Any time a skill/script starts calling a new external API endpoint (or a new field on an existing one), its payload/response shape gets written down before or alongside the code that calls it — `docs/stockscans-api-schemas.md` for Stockscans, a sibling `docs/<provider>-api-schemas.md` for anything else. Minimum content per endpoint: method+path, a real (or, if not yet live-tested, explicitly-labeled-as-unconfirmed) request payload, the response envelope, and a field-by-field note for anything non-obvious (positional arrays, enums, unconfirmed indices). If the schema was written from a spec/mapping the user provided rather than a live call, say so explicitly and flag which parts still need live confirmation — don't let an unverified schema read as if it were confirmed. Update the doc in the SAME change that adds/changes the call, not as a follow-up.

14. **The "dummy"/throwaway watchlist pattern** is the standard way to scope any Stockscans bulk-scan endpoint (`scanAnnouncements`, `resultsDocuments`, `concallScan`, `runScan`, and any future scan-shaped endpoint) to an arbitrary companyId list beyond the 10-id `companyFilters` cap: `createWatchlist(name, companyIds)` → pass the returned `watchlistId` in `payload.watchlistIds` → `deleteWatchlist(watchlistId)` in a `finally` block, always paired so the account doesn't accumulate scratch watchlists. Reference implementation: `_withThrowawayWatchlist` in `stock-api/bin/get-concall-transcript-url.js`. Reach for this by default whenever a new bulk lookup needs to be scoped to "just these N companies" — don't re-derive the pattern per skill.

15. **companyId sanitization is MANDATORY wherever a companyId is read, stored, or used to build a URL.** Raw NSE/BSE feed data sometimes carries a dash-separated trading-series suffix on the symbol (`-BE` Book Entry, `-SM` SME platform, `-BZ`/`-BL`/`-ST`/`-IL`/`-GC`/`-BT` and similar) that is a market/series attribute, not part of the company's identity — every downstream lookup (company-master, Stockscans API, stockscans.in URLs) keys on the bare symbol, so an unstripped suffix silently breaks the lookup or produces a dead link. Route every companyId through `sanitizeCompanyId()` (`stock-api/src/utils/companyId.js`, `@stock/api/utils/companyId`) at the point it enters the system (raw scan ingestion) AND at read chokepoints (company-master lookups, `db.js`'s `ensureEnvelope`/`find`, `buildCompanyContext`, `StockscansClient` methods that take a companyId/ticker). `cloud-utils` cannot depend on `@stock/api` (circular — stock-api depends on cloud-utils), so `emailService.js`'s `stockscansUrl`/`stockscansLink` carry a deliberately duplicated copy of the same suffix list — keep both in sync if the list changes. When writing a NEW function that accepts a companyId, sanitize it on entry rather than assuming the caller already did.

16. **Paginated bulk fetches must fire pages in parallel, not sequentially, once the page size is known.** Never write a `while`/`for` loop that awaits page N before computing page N+1's offset unless a real cross-page dependency requires it (see below). The default pattern (confirmed 2026-08-06, see `stock-api/src/utils/concurrency.js`'s `mapWithConcurrency`): fetch page 1 alone first (to learn the true page size and to fast-path-exit the common single-page case for free), then if more pages are genuinely needed, fire the rest — up to whatever cap already exists — concurrently via `mapWithConcurrency` with a bounded fan-out (don't fire an unbounded burst; 8-10 concurrent is a reasonable default against Stockscans). Any early-exit condition the old sequential loop had (short page, a target set fully covered, a date cutoff) is re-applied as a POST-PROCESSING truncation over the parallel-fetched pages **in page order**, so the final result is identical to what the sequential version would have returned — parallelizing changes only when each page's request was fired, never what gets kept. **Do NOT use a response's `total`/count field to decide how many pages to fire** unless it has been live-confirmed reliable for that specific endpoint — `scanAnnouncements`'s `total` is confirmed self-inflating (see `bulkAnnouncementScan.js`) and must never be trusted; a fixed, documented page-size constant (when one exists) is what makes deterministic parallel offsets safe, not a reported total. Reference implementations: `scanAllPages` (`stock-api/src/utils/bulkAnnouncementScan.js`), `paginateAnnouncements` (`packages/jobs-runtime/gainersScanner.js`), `fetchAllPagesStockScans` (`screener-api/src/features/research/researchStockscansPack.js`). Exception: a genuinely cursor-based pagination (the server returns an opaque "next" pointer rather than a page index/offset you control, e.g. `concallScan`'s `page.next`) cannot be safely parallelized this way and should stay sequential — don't assume a cursor is secretly offset-based without live confirmation.

17. **Extraction First, Analysis Second — and never think or write the same thing twice.** Every skill, without exception, splits its work into two passes: an Extraction pass that is pure logic (fetch, parse, compute deltas, apply a threshold, join two datasets) and belongs in a script under `stock-api/`/`packages/jobs-runtime/`, and an Analysis pass — reasoning, judgment, synthesis, prose — that is the only part an LLM should spend tokens on. If a step can be described as "compute X" or "check whether Y crosses a threshold" without any judgment call, it is Extraction and must not be done by reasoning it out in a chat turn; reserve the model for the parts that genuinely require interpretation (what a number _means_, how to phrase a verdict, which of several true things is worth saying). `skills/_shared/income-statement-signals.md` and its script (`stock-api/src/analyzers/incomeStatementSignals.js`) are the reference implementation of this split for P&L analysis — new shared analytical frameworks should follow the same shape (a `references/*.md` or `_shared/*.md` spec + a paired `stock-api/src/analyzers/*.js` that any skill can call). Two further requirements flow from this: (a) **cache the Extraction result**, keyed by whatever makes it unique (companyId+period, scan+date, etc.), typically under `data/cache/<name>/` via `db.cachePath()` — a second skill, or a second run of the same skill, analysing the same underlying facts must get a cache hit, not a recomputation, so two outputs never silently disagree on the same numbers; (b) **never regenerate output that already exists in this run** — if a company snapshot, a verdict paragraph, or a computed table has already been produced earlier in the same task (by this skill or another one it's composing with), reuse it or reference it rather than re-deriving and re-writing an equivalent block from scratch. Before adding a new mandatory check to a skill, check whether the same check (or a close variant) already exists elsewhere in the skill's own document or in a shared reference it points to — extend/point to the existing one instead of writing a second, slightly different version of the same instruction.

18. **Always produce a saved file (PDF, not just an inline widget) — never gate this on the user explicitly asking, and never let a rendering-engine failure become a silent skip.** Any skill whose primary output is a report, briefing, or analysis note (quarterly-result-analysis, concall-analysis, forensic-accounting, peer-comparison, sector-research-deepdive, and similar) MUST save a PDF as part of every run, in addition to any inline `visualize:show_widget` rendering. An inline widget is ephemeral — it exists only in that chat turn, isn't attached to the conversation as a file, and can't be reopened, shared, or found later. A user who has to ask for "the PDF" after already seeing the widget is a sign the skill did half its job. Some existing skill docs describe the saved-file step as conditional ("if the user explicitly asks for a saved file or attachment") — that phrasing is superseded by this rule; treat it as always-on, not opt-in, regardless of what an individual skill's older instructions say. Render via `render-pdf` (`skills/tooling/render-pdf/SKILL.md`), which now documents a Puppeteer→WeasyPrint fallback chain for environments (e.g. ARM64 sandboxes) where Chromium can't launch — a rendering-engine failure is not a reason to skip the PDF, it's a reason to use the documented fallback. Save the PDF under `data/agent-outputs/pdfs/<CompanyId_or_Scope>_<ReportType>.pdf` (or the skill's existing equivalent path if one is already established) and list it in the skill's files-touched manifest (§9) and its `mcp__cowork__present_files` call so the user actually receives it without having to ask twice.

19. **Resumable window cursor — the standard pattern for any recurring job with expensive per-item processing, not something to re-derive per skill.** Any recurring/scheduled job that fetches a time-windowed slice of external data (announcements, transcripts, PPTs, tweets, deals, etc.) AND does expensive per-item work on it (reading a PDF, an LLM judgment call, sending a notification) MUST use a resumable cursor, not a window recomputed from "now" alone on every run. Without one, two runs landing closer together than the window is wide — a manual catch-up followed by the next scheduled run, a weekend/holiday-adjacent gap, a retried failure — silently re-do the expensive work on the same items. Per-item "already processed" checks (e.g. `mark-processed`) are NOT a substitute: they prevent a duplicate _write_, but by the time an item is known to be a duplicate the PDF read and the LLM call that produced the discarded output have already been paid for. Use the shared `packages/jobs-runtime/lib/windowCursor.js` module (`windowCursor(jobName).resolveWindowStartMs/savePendingWindow/commitWindow`) rather than hand-rolling cursor/pending-window files per script — it's the extraction of the pattern proven independently in `watchlistInsights.js` and `postCloseScanInsights.js`. Shape: (a) the fetch step resolves its window-start as `max(the job's own deterministic floor, last-committed cursor)` — a committed cursor means "everything up to here is handled," so the window must never start earlier than that; (b) the fetch step records its own invocation time as a pending marker; (c) `commitWindow` is called ONLY after the run is confirmed healthy (digest sent, all items processed without error) and advances the cursor to that pending marker — never call it after a partial failure, since that permanently drops whatever didn't get processed. An explicit `--window-hours`-style override always bypasses both the floor and the cursor for a deliberate one-off catch-up. When writing a NEW recurring job that fits this shape, reach for `windowCursor.js` from the start rather than shipping without one and fixing it later.

20. **Company names in any HTML email MUST be rendered via `stockscansLink()` (`@stock/cloud-utils`), never as plain/bold text.** Every email-producing skill in this repo displays company names — digest cards, tables, footers — and a user reading on mobile expects to tap straight through to the company's Stockscans page from any of them. `stockscansLink(name, symbol, exchange, color)` already handles HTML-escaping and the `EXCH:SYMBOL` vs bare-symbol cases (see `cloud-utils/src/emailService.js`); call it directly rather than hand-rolling `<a href=...>` or, worse, dropping the anchor and rendering `esc(companyId)` as inert text. This was missed once in `postCloseScanInsights.js` (fixed 2026-08-26) despite `watchlistInsights.js` already doing it correctly right next to it in the same package — when adding or reviewing any new email-building code, actively diff it against the nearest sibling skill's email builder (same package, same digest-card shape) rather than writing the HTML from scratch; a plain, unlinked `${esc(it.companyId)}` or `${it.name}` next to a card title is the exact signature of this miss and should be caught at review, not by the user a second time.

21. **Every `add-note` call MUST set `sourceSkill` to the exact orchestrating skill's
    own name -- never rely on a shared-layer default, and never conflate it with `creator`
    or `usecase`.** `packages/jobs-runtime/lib/notesDb.js`'s `save()` persists a legacy
    envelope field, `creator`, that it silently defaults to `'watchlist-insights'` whenever
    a note doesn't set it (kept for backward compatibility -- do not remove or change this
    default, other code may depend on it). Every current caller of `watchlistInsights.js
add-note` (`watchlist-insights`, `announcement-insights`, `announcement-info-classifier`,
    `post-close-scan-insights`) leaves `creator` unset on the notes it writes, so before this
    convention existed EVERY note from EVERY one of these skills was silently mislabeled as
    having come from `watchlist-insights` -- a real bug that caused a genuine misdiagnosis
    (a session inspecting `notes.json`, seeing `creator: "watchlist-insights"` on
    high-significance notes, and wrongly concluding a different, newly-reworked skill hadn't
    run yet, when it very likely had). `usecase` is not a substitute either -- it is
    deliberately SHARED/cache-scoped across orchestrators at the same depth
    (`"announcement-insights:standard"` etc., see the `announcement-insights` SKILL.md's
    "Caching" section) so two skills reading the same announcement at the same depth land in
    one cache bucket; repurposing it for attribution would break that sharing. The fix:
    `cmdAddNote` in `watchlistInsights.js` now REQUIRES a `sourceSkill` field on
    `payload.note` and throws if it's missing -- there is no default, deliberately, because a
    silent default is exactly how this bug happened the first time. `notesDb.js` persists it
    verbatim (it flows through the existing `...n` spread in `save()` and `...rec` spread in
    `load()`) and never touches it. **When creating or editing ANY skill that writes through
    this shared note-persistence path (`add-note`, or `NotesDb`/`notesDb.js` directly),
    `skill-manager` MUST verify the skill's SKILL.md instructs setting `sourceSkill`
    explicitly to that skill's own name on every `add-note` payload, and must not consider
    the skill "done" until it does** (see `skills/tooling/skill-manager/SKILL.md`'s
    Announcement/notes-caching section, which cross-references this rule). Historical notes
    written before this convention are NOT backfilled -- this is forward-looking only; do not
    attempt to reconstruct historical attribution from `creator`, timestamps, or any other
    proxy. Separately: this same "shared persistence layer silently defaults an attribution
    field so every caller looks like the first/original caller" shape may exist elsewhere --
    `packages/jobs-runtime/lib/db.js`'s generic envelope also defaults `creator` in some
    paths. That has NOT been audited or fixed as part of this convention (out of scope here),
    but is flagged as the same class of footgun; treat a `creator`-only envelope on any
    shared collection as a signal to check whether real attribution needs its own explicit,
    non-defaulted field before assuming `creator` tells you who actually wrote a record.

22. **A record's write-timestamp lives in `creationTime`/`modifiedTime` ONLY — never a
    second, independently-computed field for the same purpose.** `lib/db.js`'s
    `ensureEnvelope()` (called by every `appendNotes`/`upsertMany`) already sets
    `creationTime` once and bumps `modifiedTime` on real content changes, as ISO 8601 with
    an explicit `+05:30` offset via `nowIstIso()` -- this is already timezone-unambiguous and
    exactly what this doc and `docs/DATA_ECOSYSTEM.md` require. The bug this convention
    closes: `packages/jobs-runtime/watchlistInsights.js`'s `cmdAddNote` used to ALSO compute
    its own `createdAt: ist.nowIstIso()` on every note entry -- a second, independent call, a
    few milliseconds apart from `ensureEnvelope`'s `creationTime`, with no documented
    authority relationship between the two. Every downstream reader (`notesDb.js`'s
    `load()`/sort/`buildNoteIndex`, `insightValidator.js`'s D+1 validation) read THAT field,
    not the canonical envelope one. Two competing, undocumented, drifting timestamps on the
    same record is precisely why an earlier investigation into a set of high-significance
    notes could not establish "no reliable timestamp proved which" run actually wrote them --
    not because the timestamps lacked timezone info (they didn't; both were already
    IST-with-offset), but because there were two of them and neither was marked authoritative.
    Fixed: `cmdAddNote` no longer sets `createdAt` on a note entry; `creationTime` (set once,
    by `ensureEnvelope`, at persist time) is the single source of truth, and every reader
    (`notesDb.js`, `insightValidator.js`) now reads it first. A defensive `|| n.createdAt`
    fallback remains in a few spots for records that somehow bypass `ensureEnvelope`, but as
    of this fix 100% of existing note records already carry `creationTime` (verified: 0 of
    2094), so this is not a real migration path, just a safety net. **This is forward-looking
    only -- the notes originally investigated were written before this fix existed, so this
    convention does not and cannot retroactively resolve which run wrote them.** Separately,
    and NOT the same bug: `ann.createdAt` on an announcement/tweet/Stockscans-sourced object
    means the external source's OWN filing/post timestamp, inherited from the upstream API
    field name -- that is legitimate domain data about what the record describes, not a
    competing write-timestamp field, and this convention does not touch it, rename it, or
    apply to it. The rule is specifically: never invent a second field for "when did WE
    create/modify this record" alongside `creationTime`/`modifiedTime`; a `createdAt` that
    answers a different question ("when did the external thing happen") on a different kind
    of object is unaffected. See `skills/tooling/output-dto-standard/SKILL.md` for the
    canonical envelope spec update and `skills/tooling/skill-manager/SKILL.md` for the
    standing check this becomes part of.

23. **API-usage audit is MANDATORY for any scheduled job whose skill makes outbound HTTP
    calls — attribution is JOB-level, and jobName is an EXPLICIT ARGUMENT everywhere, never
    a shared/global "active job" (revised 2026-09-06, twice — see below).** StockscansClient,
    ScreenerClient and PerplexityClient are built on the shared `HttpClient`
    (`stock-api/src/http/HttpClient.js`), the single instrumented choke point for outbound
    HTTP for those three clients (NseClient/BseClient bypass HttpClient entirely — raw
    axios/fetch — so NSE/BSE calls are NOT tracked; a known gap, not something job-level
    attribution fixes). `HttpClient` holds `jobName` as INSTANCE state — set at construction
    (`new HttpClient({ jobName })`) or mutated via a client's own `setJobName(jobName)` — and
    records every request/response into `@stock/cloud-utils`'s `apiUsageCounter`, which is
    itself keyed by job (`Map<job, Map<api, counts>>`), a no-op for any instance with no
    jobName. The dimension is the JOB (a `jobs/Scheduled/<name>` directory — the 1:1 unit
    with a cron schedule and one outbound email), not the skill: many jobs-runtime scripts
    back multiple registry.json skills, and some skills are in turn invoked by multiple jobs
    (`watchlistInsights.js` alone backs `gainers-signal`, `volume-rocketing`,
    `announcement-insights`, and is invoked by `watchlist-daily-insights-stockmarket`,
    `daily-gainers-signal-stockmarket`, `daily-volume-rocketing-signal-stockmarket`, and
    `document-preprocessing`) — skill-level attribution silently merged or misattributed
    exactly the runs most in need of auditing.

    **There is no `setActiveJob()`/`isActive()`/"current job" anywhere in this design.** An
    earlier version had exactly that — one module-level active-job global in
    `apiUsageTracker.js` — which was safe across DIFFERENT scheduled jobs (each is its own
    `node script.js` process; no fork/worker_threads/cluster means no two jobs ever actually
    share that module state) but NOT safe within a single process handling more than one
    logical run (nested requires — e.g. `postCloseScanInsights.js` requiring functions out of
    `watchlistInsights.js` — sequential sub-jobs, or two concurrent async calls): a second
    `setActiveJob()` call could silently clobber the first run's still-in-flight counts. Fixed
    by keying the counter itself by job and requiring every function (`record`, `getSummary`,
    `flush`, `appendApiUsageFooter`) to take the job name as an explicit argument — concurrent
    or nested recording is correct by construction, not by convention. This does NOT mean
    threading `jobName` as a parameter through every one of the ~40 endpoint methods on
    StockscansClient/ScreenerClient/PerplexityClient (that would be a much larger, riskier
    change for a scenario — one client instance shared across two concurrently-running jobs —
    that cannot happen today, since clients aren't shared across processes): `jobName` lives
    on the HttpClient/client instance, set once, explicitly, at the top of that process's own
    `main()`/`require.main` block.

    Every job's own `SKILL.md` MUST claim its identity as the FIRST orchestration step,
    before invoking anything: `export STOCKMARKET_JOB_NAME=<job-directory-name>` in the
    same shell/subshell that will invoke the routed skill's scripts (most jobs say "follow
    the `<x>` skill" and the real `node`/`yarn` call happens several layers deep inside that
    shared skill's own SKILL.md — an env var propagates through every layer for free, with
    zero changes needed to the shared skill file). A job that invokes its script directly
    (no shared-skill indirection — e.g. `daily-deals-digest`'s `yarn deals-digest`,
    `order-book-sync-stockmarket`'s `yarn order-book-sync`) instead passes `--job
    <job-directory-name>` inline on that command. See
    `packages/jobs-runtime/lib/scriptJobName.js`'s `resolveJobName` for the full resolution
    order (env var → `--job` flag → the script's own documented default for a direct/manual
    run — same "explicit, never a silent default" principle as §21's `sourceSkill`).

    On the script side: any script's `main()`/`require.main` block that will use a
    StockscansClient/ScreenerClient/PerplexityClient MUST resolve `const jobName =
    resolveJobName('<default-job-name>')` once, call `<client>.setJobName(jobName)` before
    the first client call (or construct with `new HttpClient({ jobName })` directly), and
    call `apiUsageTracker.flush(jobName)` once near the end of the run (after `data:push` is
    a good spot) to persist the run's summary as an `events` record (`type:
    api_usage_summary`, keyed by `job` — a `type` on the existing collection, not a new one,
    per DATA_RULES §2). Any `sendHtmlEmail({...})` call the script makes MUST also pass that
    same `jobName` so the footer (`cloud-utils/emailService.js`'s `appendApiUsageFooter`)
    renders THIS run's summary — this is why the footer shows up on every scheduled digest
    with just one added line per `sendHtmlEmail` call site, not a rewrite of the email HTML
    builder. When creating or reviewing ANY scheduled job whose routed skill calls
    StockscansClient/ScreenerClient/PerplexityClient, `skill-manager` MUST verify (a) the
    job's own SKILL.md sets `STOCKMARKET_JOB_NAME` (or passes `--job`) as its first step, and
    (b) the script resolves it into a local `jobName` and threads it explicitly to
    `setJobName`/`flush`/`sendHtmlEmail` — never storing it in a module-level or otherwise
    shared variable that isn't scoped to that one `require.main` block. See
    `docs/SKILL_DATA_AUDIT.md` §G for the full spec, including the NSE/BSE coverage gap.

24. **No script in this repo may call an LLM provider API directly — ever. Every
    job/skill run must self-report its own token usage as the substitute for what
    a script-side API call would have measured automatically.** This formalizes
    Darshan's 2026-09-04 ruling (see the `preprocessing-pipeline-plan` project
    memory: "No LLM provider API keys, ever, in any job/skill workflow" — that
    ruling blocked a planned `lib/gemini.js` stored-key client before it was ever
    built) and extends it to close the one surviving instance: `lib/anthropicClient.js`
    called `ANTHROPIC_API_KEY` directly from three scripts (`orderBookDigest.js`,
    `mnaTracker.js`, `weeklyPptInsights.js`) to generate "AI Insights" from a batch
    of extracted announcement/PDF text. Removed 2026-09-07. Each of those three
    scripts now stops at Extraction (§17) — it writes the combined text to
    `data/runs/<script>-pending-synthesis.md` with the synthesis instructions
    embedded as a prompt for whoever reads it next — and the "extract X from this
    batch" step that used to be a `callAnthropic()` call is now an AGENT-executed
    instruction, run the next time a session (interactive or a scheduled Cowork
    task) picks up that pending-synthesis file. This is the same Extraction/
    Analysis split §17 already mandates for every other skill; these three scripts
    were simply the last ones still doing the Analysis half as a raw script API
    call instead of handing it to the agent.

    **The consequence: this repo has NO automatic token-usage instrumentation.**
    §23's `apiUsageTracker` can count HTTP calls automatically because `HttpClient`
    sits on every outbound request. There is no equivalent choke point for LLM
    tokens — by design, since no script calls an LLM API — so the only source of
    a token number is the AGENT observing its own consumption for a run and
    self-reporting it. **This self-reporting step already exists and is already
    wired into ~30 job SKILL.md files** — do not add a second, separate reporting
    step; fix or extend this one. `cowork-task-architect/SKILL.md`'s task template
    mandates it as the literal final step of every scheduled task: `python
    scripts/metrics/track_invocation.py --name <task-name> --type task --model
    <the exact model executing this run>` (an equivalent `--type skill` form
    exists for direct skill invocations, and `--files`/`--output-words` let it
    estimate input/output size from what was actually read/written). Every
    LLM-authored DTO the run writes must also set that same model string as
    `modelUsed` (`skills/tooling/output-dto-standard/SKILL.md`).

    `track_invocation.py`'s ESTIMATE is a base-prompt-tokens constant plus
    `context_chars / 4` for input, `output_words / 0.75` for output — a rough
    heuristic, not a metered number, but self-reported-and-estimated beats
    unmeasured every time; do not hold out for exact counts before recording.

    **What was actually broken (fixed 2026-09-07):** `track_invocation.py` wrote
    its log entries to `data/token_usage.jsonlines` directly — bypassing
    `lib/db.js` entirely (a §3/§6 violation: all persistent data must go through
    db.js) — and that file did not exist anywhere in the repo despite the script
    being wired into ~30 SKILL.md files as a mandatory final step. Fixed by
    keeping `track_invocation.py`'s exact CLI (`--name`/`--type`/`--model`/
    `--files`/`--output-words` — none of the ~30 existing call sites needed to
    change) but having it shell out to `node packages/jobs-runtime/
    recordTokenUsage.js --job <name> --input <n> --output <n> --model <model>
    --note <how estimated>`, which persists through `lib/db.js` the same way
    §23's `apiUsageTracker` already does for API-call counts — one canonical
    events-backed pipeline instead of a script writing to an unread file.
    `recordTokenUsage.js` resolves its own job name the standard way (§23's
    `STOCKMARKET_JOB_NAME` → `--job` → documented-default order via
    `lib/scriptJobName.js`) and is available as a direct entry point too, for
    any future script that wants to self-report without going through
    `track_invocation.py`'s estimation heuristic (e.g. a caller with an exact
    token count already in hand).

    Persistence mirrors §23 exactly: `packages/jobs-runtime/lib/tokenUsageCounter.js`
    (job-keyed `Map`, no ambient "active job" global — same design as
    `apiUsageCounter.js`) feeds `lib/tokenUsageTracker.js`, whose `flush(jobName)`
    persists one `events` record per run (`type: token_usage_summary`, keyed by
    `job`, carrying `byModel: {model: {calls, inputTokens, outputTokens}}` and
    `totalTokens`) via `lib/db.js` — a new `type` inside the existing `events`
    collection, per DATA_RULES §2, not a new collection. `scripts/metrics/
    analyze_token_usage.py` (also rewritten 2026-09-07 — the previous version
    read the same dead `data/token_usage.jsonlines` path, so fixing only the
    producer or only the consumer would still have left them disconnected)
    reads these records directly out of the sharded `data/events-YYYY-MM.json`
    files the same way any other events consumer would, aggregates the last 7
    days by job, and feeds the `token-usage-analyzer` skill for the weekly
    review. When creating a NEW job/skill, `skill-manager` MUST verify its
    SKILL.md's final step calls `track_invocation.py` (or `recordTokenUsage.js`
    directly) — treat a job with real runs in the window but zero
    `token_usage_summary` records the same way an untracked API-usage job would
    be treated under §23: a visibility gap to close, not something to assume is
    fine because nothing broke.

25. **Four more job-level metrics, wired the same way as §23/§24 — all flushed
    automatically from `recordTokenUsage.js`'s existing final-step call site,
    so none of this required touching any job's SKILL.md.** These exist to
    de-bottleneck the pipeline (find the actual constraint — slow runs,
    wasted re-fetches, silent delivery failures, drifting extraction quality,
    or a stuck cursor — instead of guessing), not to add reporting for its
    own sake. Each follows the same Counter/Tracker split as tokenUsage/
    apiUsage/cacheUsage: an in-memory, dependency-free `*Counter.js`
    (`Map<job, ...>`, no ambient "active job" global — every call takes
    `job`/`jobName` explicitly, per the §23/§24 fix for the earlier
    shared-global clobbering bug) plus a `*Tracker.js` wrapping it with a
    `flush(jobName, opts)` that persists one `events` record via `lib/db.js`
    and resets that job's in-memory bucket.

    - **Run duration.** `tokenUsageTracker.flush(jobName, {date, note,
      durationMs})` now accepts an optional `durationMs`, persisted onto the
      SAME `token_usage_summary` record (not a new event type — duration is
      a property of the run that record already represents, not a separate
      metric) only when it's a finite, non-negative number. `record-token-
      usage`'s CLI accepts `--duration-ms`, and `track_invocation.py`
      accepts and passes through `--duration-ms` the same way. Left `null`/
      absent for a caller that doesn't measure it — this is additive, not a
      new requirement on every SKILL.md.

    - **Extraction-cache hit/miss.** `lib/cacheUsageCounter.js` /
      `lib/cacheUsageTracker.js` (`type: cache_usage_summary`, `byCache:
      {name: {hits, misses, hitRate}}`). Instrumented at
      `lib/resolveFilingContent.js` — the actual "check before you fetch"
      choke point every document-touching skill calls first, NOT
      `docExtracts.get()` directly, because `resolveFilingContent()` is what
      consumers actually call. Four outcomes are recorded, and a Tier-1
      stale-schema miss (`extract-cache-stale-schema`) is deliberately kept
      SEPARATE from a plain Tier-1 miss (`extract-cache`, hit: false) — the
      extraction work already happened for a stale-schema record, it just
      needs a version-bumped re-run, which is a materially cheaper fix than
      "this document was never processed" and would be hidden by lumping
      the two together.

    - **Email delivery outcome.** `deliveryUsageCounter.js` lives in
      `cloud-utils` (not `jobs-runtime`), mirroring where `emailService.js`
      itself lives — `cloud-utils` has no dependency on `jobs-runtime`, so a
      counter needed by code inside it can't live in the package that
      depends on it. `lib/deliveryUsageTracker.js` (jobs-runtime-side, since
      `db.js` persistence is jobs-runtime-only) wraps it and flushes `type:
      delivery_summary` (`sent`, `skipped`, `error`, `total`,
      `bySkipReason`). Instrumented at all four return paths of
      `sendHtmlEmail()` in `cloud-utils/src/emailService.js` — a job whose
      digest silently stopped landing in an inbox (bad `GOOGLE_APP_PASSWORD`,
      an SMTP error) is otherwise invisible; this makes the failure a number
      that accumulates instead of a support ticket days later.

    - **Extraction-quality time series.** `lib/extractionQualityCounter.js` /
      `lib/extractionQualityTracker.js` (`type: calibration_summary`,
      `source: 'production-writes'` — deliberately the same event-type name
      the manual `preprocessCalibrate.js cmdScore` gate already uses, since
      both answer "is this profile's extraction trustworthy right now," just
      from different inputs: one from every real production write, one from
      an occasional hand-curated reference run). Instrumented at
      `docExtracts.js`'s `put()`, not at the manual calibration script,
      because `put()` runs on every real write while the manual gate only
      runs when someone remembers to invoke it — a live signal beats a
      periodic spot-check for catching drift as it happens. Tracks pass /
      reject_fail / reject_truncated_source / confidence_high /
      confidence_low counts per profile. This is the direct, permanent fix
      for the failure mode the `preprocessing-truncation-bug` project memory
      describes: an 8000-char truncation cap silently starved 42 heavy-doc
      extracts for weeks while every one still passed L1 verification
      (L1 verifies quotes against the cached, already-truncated text, not
      the source document) — a rising `reject_truncated_source` or falling
      `confidence_high` rate now shows up in the weekly numbers instead of
      being discovered by accident.

    - **Cursor staleness.** `packages/jobs-runtime/cursorHealth.js` (`yarn
      cursor-health`, or `yarn workspace @stock/jobs-runtime cursor-health`
      from the repo root) is a standalone check, NOT an `events`-collection
      metric — it reads `data/cache/*-cursor*.json` directly (the
      `windowCursor.js` files themselves already carry `lastCommittedAtMs`)
      and compares each job's last-committed time against an expected
      cadence. There is no machine-readable cron schedule anywhere in this
      repo — cadence is documented only as prose under each Scheduled job's
      "## Cadence" heading — so `CURSOR_CADENCE_HOURS` in that script is an
      explicit, hand-maintained map sourced from that prose, not a parser of
      it. **Update it the same day a job's cadence section changes** — same
      discipline this repo already asks for with `PROFILE_SCHEMA_VERSIONS`
      in `docExtracts.js`. A cursor with no entry is reported as `unmapped`
      (a coverage gap in the script itself), never silently treated as
      passing. It also flags a `-pending-window` marker left uncommitted for
      more than 24h — `savePendingWindow` without a following
      `commitWindow` means a run started and never finished healthily,
      which is invisible from the cursor file alone (the cursor still shows
      the last SUCCESSFUL commit, not that the most recent run got stuck).
      Exits non-zero on any stale/unreadable cursor or uncommitted pending
      window, so it can be wired into a scheduled health-check job the same
      way any other CLI script in this repo is.

    All five pieces (duration, cache hit/miss, delivery outcome, extraction
    quality, cursor staleness) were built with the same rigor as §23/§24:
    unit tests for each counter and tracker, wiring tests at the actual
    instrumentation choke point (`resolveFilingContent.js`, `emailService.js`,
    `docExtracts.js`), and a full-suite regression run after each change —
    not just "it compiled."

These conventions ensure that skills can execute in any environment: Cowork, Antigravity, local terminal, or Claude web.
