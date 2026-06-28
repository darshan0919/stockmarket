# Stock-Research Refactor Plan

**Goal:** Centralize all stock-API logic (Stockscans / NSE / BSE) into one shared
JavaScript package consumed by both projects, and turn every cowork task into a
parameterized, on-demand-invocable skill — applying SOLID for scalability,
reusability, and extensibility.

**Decisions locked (2026-06-27):**

- **Language:** Single **plain-JS** package (no TypeScript). JS-only is fully
  achievable — the cowork sandbox ships **Node 22**, so a skill can run
  `node script.js` exactly like `python3 script.py`. Nothing forces Python; the
  Python cowork scripts get ported to Node.
- **Task migration:** All **four** scheduled tasks become skills in one pass on a
  shared template.
- **Jobs location:** move the cowork jobs **into the stockmarket monorepo**.
- **Canonical auth env var:** `STOCKSCANS_AUTH_TOKEN`.
- **Old Python files:** retain under `legacy/` for one cycle, then delete.
- **Package name:** `@stock/api`.
- **Cloud skills:** skills run from the cloud and **cannot import the local
  package** — each affected skill gets a **vendored copy** of the relevant client
  logic, kept in sync from one canonical source (see §4).

---

## 1. Why this refactor (current state)

### 1a. Stock-API logic is duplicated three ways

| Concern | stockmarket/backend (Node, axios) | Company Research (Python, requests) |
|---|---|---|
| **Stockscans** | 8 `services/stockscans*.js` (~2,600 ln): `stockscansAuth`, `…Announcements`, `…AnnouncementScan`, `…AnnouncementScansPage`, `…Screener`, `…SavedScan`, `…Metrics`, `researchStockscansPack` | `stockscans_client.py` (clean singleton: `run_scan`, watchlist table/replace/update, `fetch_announcements`, `fetch_pdf`, `s3_pdf_url`) |
| **NSE** | `api/nseIndiaApi.js` (453 ln): cookie warmup, quotes, announcements, financial results, upcoming results, gainers, price-volume-deliverable | **inlined** in `gainers_scanner.py` and `insight_validator.py` (NSE delivery/bhavcopy) — no client class |
| **BSE** | `api/bseIndiaApi.js` (178) + `api/bseHttp.js` (84) | **inlined** in `gainers_scanner.py` (`SecurityPosition`, `PeerSmartSearch`) |

Worse, there is **duplication *within* the Python side**: `insight_validator.py`
re-implements the Stockscans table/scan HTTP calls instead of importing the
existing `stockscans_client.py`.

### 1b. Auth is divergent (a correctness bug, not just style)

- JS reads `process.env.STOCKSCANS_AUTH_TOKEN` and sends it as a cookie via axios.
- Python reads `STOCKSCANS_AUTHTOKEN` from `.env` (lazily, per-request) and sends
  `cookie: authtoken=…`.

Two env-var names, two refresh paths (`update_authtoken.py` only touches the
Python `.env`). A single client removes this whole class of "token works in one
place, not the other" bugs.

### 1c. Cowork tasks embed logic that should be reusable

Four scheduled tasks (`stockscans-watchlist-update`, `watchlist-daily-insights`,
`watchlist-insight-validation`, `daily-gainers-signal`) are SKILL.md prompts that
`find` a Python script and shell into subcommands. The behavior is **only**
reachable on the cron schedule with hard-coded defaults — it can't be invoked
on-demand with custom parameters (different watchlist, date range, ticker set).

---

## 2. Target architecture

### 2a. One shared package: `stock-api`

Create a new **yarn workspace** inside the stockmarket monorepo (it already
declares `workspaces`), so it is versioned, testable, and CI-covered:

```
stockmarket/
  packages/
    stock-api/
      package.json            # name: "@stock/api", type: commonjs, no deps beyond axios
      src/
        http/
          HttpClient.js        # thin axios wrapper: retries, timeout, UA, base headers
          CookieJar.js         # NSE session/cookie warmup (from nseIndiaApi.js)
        auth/
          StockscansAuth.js    # ONE token source + refresh; reads unified env var
        clients/
          StockscansClient.js  # FUNDAMENTALS: run_scan, announcements, documents, watchlists, savedScan, screener, card-details/metrics, pdf
          NseClient.js         # PRICE-ACTION only: quote, symbolData (live delivery%), priceVolumeDeliverable, liveVariations (gainers)
          BseClient.js         # PRICE-ACTION only: securityPosition (qty/deliverable/delivery%), scripCode/smartSearch, quote header
        index.js               # public surface: { StockscansClient, NseClient, BseClient, auth }
      test/                     # jest, mirrors existing backend jest setup
      bin/                      # optional thin CLIs for cowork (see 2c)
```

**Domain split (drives which client owns what):**

- **Stockscans = all fundamental research data** — it is sufficient for company
  documents, announcements, scans, watchlists, screener, metrics/card-details.
  Anything fundamental goes on `StockscansClient`.
- **NSE / BSE = price-action only** — real-time price, volume, **delivery %**,
  traded/deliverable quantity, live gainers/variations. Nothing fundamental.
- **No duplicate endpoints.** The fundamental-ish NSE endpoints the backend uses
  today (corporate-announcements, corporates-financial-results, integrated-filing,
  event-calendar/upcoming) are **not** re-exposed on the price-action client; those
  consumers are repointed to Stockscans during cutover (Phase 2). Each datum has
  exactly one owning client — callers pick the client by intent, not by habit.

**Design rules (the SOLID core):**

- **SRP** — each client wraps exactly one upstream *and one concern* (fundamentals
  vs price-action); `HttpClient`/`NseSession`/`auth` hold cross-cutting concerns so a
  client class is *only* endpoint logic.
- **OCP** — new endpoints = new methods on an existing client; new data source =
  a new client class implementing the same shape, no edits to callers.
- **LSP / ISP** — clients expose small, intention-revealing methods
  (`getDeliverables(symbol, from, to)`), not a god-object. Backend controllers and
  cowork jobs depend only on the slice they use.
- **DIP** — clients receive an injected `HttpClient` + `auth` provider (constructor
  injection) rather than importing axios/env directly. Enables test doubles and a
  single place to swap rate-limiting, caching, or a mock.

### 2b. Backend consumes the package

`stockmarket/backend` adds `@stock/api` as a workspace dependency. The 8
`services/stockscans*.js`, `api/nseIndiaApi.js`, `api/bseIndiaApi.js`, `bseHttp.js`
are reduced to **thin adapters** (or deleted) that re-export the package clients.
Controllers keep calling the same function names during transition; internally they
delegate to the package — so the HTTP API surface is unchanged.

### 2c. Cowork side consumes the package — fully in Node

The Company Research Python scripts are ported to Node and moved into the monorepo
so they share the package via the workspace (no cross-repo copy drift):

```
stockmarket/
  packages/
    cowork-jobs/
      package.json            # depends on @stock/api
      watchlistInsights.js    # was watchlist_insights.py
      watchlistUpdater.js     # was watchlist_updater.py
      gainersScanner.js       # was gainers_scanner.py (BSE/NSE calls now via @stock/api)
      insightValidator.js     # was insight_validator.py (no more inline Stockscans calls)
      emailService.js, lib/…  # shared helpers (notes DB, templates)
```

Each job keeps its existing **subcommand CLI** shape (`fetch-announcements`,
`send-digest`, etc.) so the migration is behavior-preserving — the only change is
`python3 X.py <cmd>` → `node X.js <cmd>`.

> Cross-repo note: Company Research is not a git repo. Moving the jobs into the
> stockmarket monorepo makes the package the single source of truth. If you'd
> rather keep the jobs living in the Company Research folder, the fallback is to
> publish `@stock/api` as a local tarball / `npm link` and `require` it by path —
> but in-monorepo is strongly recommended (one repo, one test suite, one CI).

### 2d. Unify auth

One env var (recommend `STOCKSCANS_AUTH_TOKEN`), one `StockscansAuth` module with
lazy per-request read (preserving the Python behavior that a token refresh applies
without a restart). `update_authtoken.py` becomes `updateAuthToken.js` writing the
single canonical `.env`. Migration shim: read the new var, fall back to the old
`STOCKSCANS_AUTHTOKEN` for one release, log a deprecation warning.

---

## 3. Cowork tasks → skills

### 3a. Pattern

For each of the 4 tasks, create a skill (via the **`skill-creator`** skill, and
following the **`cowork-task-architect`** "script-first" rule — deterministic work
in the Node job, judgment/synthesis in the skill prompt):

```
<skill-name>/
  SKILL.md          # parameterized: accepts inputs with documented defaults
  scripts/ → thin wrapper that calls packages/cowork-jobs/<job>.js
```

- **SKILL.md** declares **parameters with defaults** (e.g. `watchlistId`,
  `lookbackHours`, `tickers`, `dryRun`). Invoked with no args → defaults (identical
  to today's cron behavior). Invoked with args → custom run on demand.
- **Scheduled task prompt** shrinks to a one-liner: *"Invoke the
  `<skill-name>` skill with default parameters."* The schedule/cron is unchanged;
  the logic now lives in the reusable skill, not the task prompt.

### 3b. The four migrations (all in one pass)

| Today (scheduled task) | New skill | Key parameters (default) |
|---|---|---|
| `stockscans-watchlist-update` | `watchlist-sync` | `sourceScanId`, `targetWatchlistId` (Near Highs) |
| `watchlist-daily-insights` | `watchlist-insights` | `watchlistId`, `lookbackHours` (24), `email` (on) |
| `watchlist-insight-validation` | `insight-validation` | `date` (today), `emailProposals` (on) |
| `daily-gainers-signal` | `gainers-signal` | `topN` (50), `email` (on) |

Each scheduled task's SKILL.md is updated in place to invoke its new skill with
defaults. Because the underlying Node job preserves the subcommand interface, the
cron output is unchanged on day one — the win is that the same skill is now
runnable by hand with overrides.

---

## 4. Skill script vendoring (cloud-stored skills)

The marketplace skills run from the cloud, so they **cannot `require`/`import` the
local `@stock/api` package** on your machine. Each API-touching skill must instead
**carry its own copy** of the client logic. Today they already do — badly: at least
four skills hand-duplicate `resolve_token`, expiry checks, `BASE` URLs, the S3 CDN
base, and raw `requests` calls, and they use the **old** `STOCKSCANS_AUTHTOKEN`
name. This is the same logic the package centralizes, copied N times by hand.

### 4a. Strategy — one canonical source, mechanical vendoring

The skills are Python; rewriting them all to Node is unnecessary churn. So keep a
**Python reference port** of the client *alongside* the JS package, both implementing
the **same Phase-0 contract**:

```
packages/stock-api/
  src/…                 # JS clients (local projects)
  python/
    stockscans_client.py  # canonical Python port — single source for skills
    nse_client.py / bse_client.py  # only if a skill needs them
  sync-skills.js          # copies python/* into each skill's scripts/_vendor/
```

`sync-skills.js` reads a manifest (which skill needs which client slice — **ISP**:
most skills need Stockscans + S3 only) and copies the canonical Python module into
each skill's `scripts/_vendor/stockscans_client.py`. The skill scripts then
`from _vendor.stockscans_client import client` instead of re-implementing HTTP/auth.
Duplication becomes **intentional, generated vendoring** governed by one source —
not hand-maintained copies that drift.

### 4b. Affected skills and what each needs

| Skill | Client slice to vendor |
|---|---|
| `stock-documents-fetcher` (canonical fetcher many others delegate to) | Stockscans documents + announcements + S3 |
| `pre-pead-scanner` | Stockscans saved-scan / run_scan |
| `watchlist-catalyst-scanner` | Stockscans watchlist + announcements + S3 |
| `announcement-keyword-explorer` | Stockscans announcements |
| `fundamental-shift-scanner`, `peer-comparison`, `equity-research-master` | delegate to `stock-documents-fetcher` — vendor only if they call APIs directly |

### 4c. Auth unification reaches the skills too

Standardize every skill on `STOCKSCANS_AUTH_TOKEN` via the vendored client, keeping
the existing **file-path fallbacks** (`/mnt/project/Stockscans_authtoken`, etc.) and
reading the legacy `STOCKSCANS_AUTHTOKEN` as a deprecated fallback for one cycle so
no skill breaks mid-migration.

> **Authoring caveat:** skill source files can't be edited from this session (the
> skill cache is read-only and edits there don't persist). These changes are made
> wherever you author skills — your skill source repo / Settings → Capabilities.
> The plan defines *what* to vendor and the sync mechanism; the edits land there.

---

## 5. Phased execution

**Phase 0 — Scaffold & contract (no behavior change).**
Stand up `packages/stock-api` skeleton + jest. Write a one-page **endpoint
contract** (URL, method, headers, params, response shape) for every Stockscans /
NSE / BSE call found in both codebases — this is the spec the clients implement and
the test fixtures assert against.

**Phase 1 — Build the clients.**
Port `stockscans_client.py` + the 8 JS services into `StockscansClient`; port
`nseIndiaApi.js` + Python NSE inlines into `NseClient`; port `bseIndiaApi.js` +
Python BSE inlines into `BseClient`. Unit-test each method against captured
fixtures. Unify auth here.

**Phase 2 — Cut the backend over.**
Replace `backend/services/stockscans*.js` and `backend/api/{nse,bse}*.js` internals
with package calls (keep export names). Run the existing backend jest suite — green
before/after is the acceptance gate.

**Phase 3 — Port the cowork jobs to Node.**
Rewrite the 4 Python scripts as `packages/cowork-jobs/*.js` on top of `@stock/api`,
preserving every subcommand. Delete the inline/duplicated Stockscans+NSE+BSE code.
Diff a real run (Python vs Node) on the same day's data for parity.

**Phase 4 — Tasks → skills.**
Create the 4 skills with parameter defaults; rewrite each scheduled task's SKILL.md
to invoke its skill; point script paths at the Node jobs. Verify one real scheduled
run end-to-end per task (email + notes DB writes match prior output).

**Phase 4b — Vendor the client into cloud skills.**
Build the Python reference port + `sync-skills.js`; vendor `scripts/_vendor/` into
the affected skills (§4b) and delete their hand-rolled token/HTTP code; switch them
to `STOCKSCANS_AUTH_TOKEN`. Test each skill end-to-end from a fresh skill run (not
just locally). Done in your skill source repo, not this session.

**Phase 5 — Verify & decommission.**
Full jest run; parity diffs archived; old Python files removed (or moved to
`legacy/` for one cycle); docs updated. **Run a verification subagent** to diff
behavior and confirm no endpoint regressed.

---

## 6. What could be wrong with this analysis (risks)

- **Cross-repo packaging is the one real wrinkle.** Company Research isn't a git
  repo; the plan resolves this by relocating the jobs into the monorepo. If you
  need them to stay put, the `npm link`/tarball fallback works but reintroduces
  drift risk — pick the in-monorepo path unless there's a reason not to.
- **Hidden behavioral divergence between the JS and Python wrappers.** They may not
  be 1:1 today (e.g. NSE cookie warmup exists in JS but the Python inlines may
  handle sessions differently; retry/timeout defaults differ: Python uses 30s,
  some NSE JS calls 60s). Phase 0's contract + parity diffs in Phase 3 are there
  specifically to catch this — don't skip them.
- **NSE/BSE anti-bot fragility.** These are scraped endpoints (cookie warmup,
  spoofed UA, Referer). Centralizing is good, but a single `HttpClient` change can
  break *all* callers at once. Mitigate with the injected-client design (swap/rate-
  limit in one place) and keep per-source headers in the client, not global.
- **Auth unification can lock everyone out at once.** One token, one failure domain.
  Keep the old-var fallback for a release and make sure `updateAuthToken.js` is the
  first thing migrated and tested.
- **Scheduled-task continuity.** Tasks fire daily; a half-migrated state could miss
  a morning email. Sequence Phase 4 so the cron SKILL.md is only repointed after
  the Node job passes a manual run, and keep the Python script in place until the
  first successful scheduled Node run.
- **"All four at once" raises validation load.** The shared skill template and the
  preserved subcommand interface keep blast radius down, but plan to babysit the
  first scheduled run of each of the 4.
- **Vendored skills will drift if sync is manual.** The whole point of `sync-skills.js`
  is that no one hand-edits `scripts/_vendor/`. If contributors patch a skill's copy
  directly, the "single source" guarantee is gone. Treat `_vendor/` as generated
  (CI check: re-run sync, fail if it produces a diff). Also: the JS package and the
  Python reference port can silently diverge — the Phase-0 contract + shared fixtures
  are what keep them honest; run both against the same fixtures.
- **Scope check.** This plan assumes the backend HTTP API surface stays identical
  (only internals change). If you also want to refactor controllers/routes, that's
  a separate effort — flagged, not included.

---

## 6c. Phase 5 / follow-ups status (2026-06-28)

**(5) Old Python → `legacy/`: DONE.** The 4 ported job scripts (`watchlist_updater`,
`gainers_scanner`, `watchlist_insights`, `insight_validator`) moved to
`Company Research/legacy/`, with self-contained copies of `stockscans_client.py` +
`email_service.py` so they remain runnable as a one-cycle fallback. Kept at root:
`gainers_classifier.py` (still used by the gainers skill, no API logic),
`email_service.py` + `update_authtoken.py` (operational), `stockscans_client.py`.

**(1) Services → `StockscansClient`: COMPLETE — all 7 migrated & green.** Each now
delegates raw HTTP to the client while keeping its own mapping + error-classification:
`stockscansMetrics`, `stockscansAnnouncements`, `stockscansAnnouncementScan`,
`stockscansScreener`, `stockscansSavedScan`, and `stockscansAnnouncementScansPage`
(the big one — 10 endpoints incl. saved-scan CRUD). `researchStockscansPack` needed
no migration (composes the migrated `stockscansAnnouncements`). To support the last
service's **public, unauthenticated** page, the package gained an **optional-auth**
mode: `StockscansAuth.headers({ optional })` omits the cookie instead of throwing when
no token, threaded through the client's public methods (`scanAnnouncements`,
`announcementStatistics`, `companyAnnouncements`, `scanMetadata`, `companySearch`)
via an `optionalAuth` flag; the auth-required ones (watchlists, saved-scan list +
CRUD) gate on a token first. Client also gained `savedScans`, `savedScanPageHtml`,
`announcementStatistics`, `scanMetadata`, `companySearch`, `watchlistsList`,
`savedAnnouncementScans`, `saveAnnouncementScan`, `reorderAnnouncementScans`,
`deleteAnnouncementScan`, and an `HttpClient.delete`; `cardDetails` fixed to the real
batch-POST shape. Every migrated service's test was retargeted to the `@stock/api`
seam. **Package: 15 tests; backend: 229 tests pass** (only the unrelated pre-existing
`researchPipeline` filesystem test fails).

**(2) Fundamental NSE/BSE → Stockscans data-source move: NOT executed (by design).**
This is a genuine behaviour change, not a mechanical swap: the backend's NSE
`corporate-announcements` / `corporates-financial-results` / `integrated-filing` /
`event-calendar` consumers return NSE-shaped data that controllers + frontend parse;
Stockscans returns a different shape. Doing it safely needs live-API parity captures
and controller/UI remapping — forcing it blind would break those endpoints. Concrete
plan: add Stockscans-backed methods, remap per consumer, capture before/after
fixtures, switch one consumer at a time behind tests. Left as a scoped, test-gated
follow-up.

**(4b) Vendor the Python client into cloud skills: BLOCKED on repo access.**
`packages/stock-api/sync-skills.js` is ready and tested. It must run against your
skill **source** repo (`node sync-skills.js --skills-root <dir>`), which isn't
reachable from here — the marketplace skill cache is read-only. Run it where you
author skills; add `--check` to CI.

---

## 6b. Implementation status (2026-06-27)

**Phase 4 — tasks → skills: DONE (skills authored + all 4 task prompts repointed).**
Four parameterized skills live in `packages/cowork-jobs/skills/<name>/SKILL.md`:
`watchlist-sync` and `insight-validation` (thin — the Node job does everything),
`watchlist-insights` and `gainers-signal` (script-first: deterministic job + the
model-judgment steps that used to live in the task prompt). Each documents its
parameters + defaults so it's invocable on demand with overrides. All four scheduled
tasks were repointed (via update_scheduled_task) to a lean prompt that locates the
skill in the monorepo and runs it with defaults — schedules unchanged. The
`gainers-signal` pipeline also chains `gainers_classifier.py`, which has NO API logic
(pure computation over the scanner JSON) so it correctly stays Python — outside the
centralization scope.

**Token unified (DONE 2026-06-28):** `Company Research/.env` + all Python (root +
legacy) renamed `STOCKSCANS_AUTHTOKEN` → **`STOCKSCANS_AUTH_TOKEN`** (backend `.env`
already used it). One canonical name everywhere now.

**Live verification (DONE 2026-06-28, read-only/no side-effects):** the sandbox can
reach the live APIs, so all 4 Node jobs were smoke-tested against real data —
`watchlistUpdater --dry-run` (266 scan companies → diff add 1/remove 0, no apply/email),
`insightValidator score RELIANCE` (live NSE delivery + 20-day baseline → structural
label), `watchlistInsights fetch-announcements` (17 live announcements, categorized),
`gainersScanner` (50 gainers + live NSE/BSE delivery 45/50 + quality filters 40/10).
**This caught a real bug:** `watchlistInsights.js` and `insightValidator.js` weren't
forwarding the `--env-file` flag to `loadEnv()` — fixed (they now honor it, like the
other two jobs). 51 job tests still green.

**Operational prerequisites for the live tasks (one-time, on your machine):**
1. `yarn install` in the monorepo so `@stock/api` + `nodemailer` resolve for the jobs.
2. Click **Run now** on each task once to pre-approve tools and confirm the
   write/email paths (the in-sandbox verification only exercised read paths).

**Phase 4b — vendor the Python client into cloud skills (pending your skill repo).**
`packages/stock-api/sync-skills.js` is ready; run it against your skill sources:
`node sync-skills.js --skills-root <dir>` (then `--check` as a CI gate). Can't run from
here — the skill cache is read-only.

**Phase 3 — cowork jobs port: COMPLETE (4 of 4 jobs).** New `packages/cowork-jobs`
workspace (`@stock/cowork-jobs`): dependency-free `.env` loader + `emailService`
(nodemailer lazy-loaded → imports fine without it).

- `watchlist_updater.py` → `watchlistUpdater.js` — 1:1 behaviour + `--dry-run`.
  Scan pagination + add/remove diff **parity-verified vs Python**.
- `gainers_scanner.py` → `gainersScanner.js` — full main() (top-50 scan, retail
  quality filters, 7-day announcements, industry breadth, price-action signals,
  NSE/BSE delivery, schema-2.0 output). The inlined NSE/BSE/Stockscans HTTP is gone
  — delivery now runs through `NseClient`/`BseClient`, prices via a new
  `StockscansClient.prices()`. Pure analytics (`priceActionSignals`,
  `sectorBreadth`, `applyQualityFilters`) **parity-verified against the actual
  `gainers_scanner.py` functions** — identical values (only cosmetic float `126.0`
  vs `126` JSON formatting differs; same parsed number).

- `watchlist_insights.py` → `watchlistInsights.js` + `lib/{ist,notesDb,pdfText}.js`
  — full multi-command CLI (fetch-announcements, read-pdf, add-note, mark-processed,
  digest, etc.). Timestamped notes-DB, categorisation rules, the full insight
  templates, 24h-window pagination, and email digest all ported. PDF text via
  lazy `pdf-parse`→`pdftotext` with graceful OCR degradation (matches Python). Added
  a `MAX_PAGES` guard (a runaway-pagination bug the mock exposed — the Python had no
  guard). Pure logic (`categoriseAnnouncement`, `isNoise`, `announcementId`,
  `insightTemplate`, `buildDigestHtml`) **byte-identical to the Python** on shared
  fixtures — including the full insight-template text.

- `insight_validator.py` → `insightValidator.js` — the largest job (~1,370 ln).
  Delivery-CSV parse, structural scoring (STRONG/MODERATE/WEAK/NOISE), verdict
  matrix, sector attribution, trailing baselines, ledger, propose-only refinements,
  the 3-pass quality review (insight/categorisation/ignored), and the full HTML
  email — all ported. NSE delivery bhavcopy moved onto `NseClient.getDeliveryBhavcopy`
  (price-action); live returns + sector universe via `StockscansClient`. Eight core
  functions (parseDelivery, structuralSignal, verdict, sectorAttribution,
  makeProposals, categoryFromTags, titleInfoDensity, quality review) **numerically
  identical to the Python** on shared fixtures.

**51 cowork-jobs tests green; backend adapters 21 green; package 13 green.** A
runaway-pagination bug (would OOM) was found and guarded during the insights port.
Note: only deterministic/mocked parity is provable in-sandbox; live API-response
parity needs the token + network. Phase 3 is the cowork-jobs *code* port; wiring the
scheduled tasks to invoke these via skills is Phase 4.

**Phase 2 — backend cutover: DONE & green.** The backend's `api/nseIndiaApi.js`,
`api/bseIndiaApi.js`, `api/bseHttp.js`, and `services/stockscansAuth.js` are now thin
adapters over `@stock/api` — every export name and response shape preserved, so none
of the 18 consumers changed. Price-action delegates to `NseClient`/`BseClient`;
fundamental NSE/BSE endpoints stay in the adapters but run over the shared
session/transport (no duplicated cookie/fetch logic). `@stock/api` symlinked into
`node_modules` (node-modules linker). Backend unit tests for the adapters retargeted
to the new package seam; package gained BSE scrip-code/security-position tests.
Result: **24/25 backend suites pass, 229 tests green**; the one failing suite
(`researchPipeline.integration`) is a pre-existing filesystem test that imports none
of the changed modules. Package suite: 13 tests green.

**Done — the keystone `@stock/api` package is built and green** (Phases 0–1, plus
the skill-vendoring tooling), all additive/non-breaking:

- `stockmarket/packages/stock-api/` registered as a yarn workspace (`packages/*`);
  `@stock/api` added to the backend's deps.
- Shared layer: `HttpClient`, `NseSession` (cookie warmup, instance-scoped),
  `bseHttp` (fetch), unified `StockscansAuth` (`STOCKSCANS_AUTH_TOKEN` + legacy
  fallback + file fallbacks, lazy per-request).
- Three clients on the domain split: `StockscansClient` (fundamentals),
  `NseClient` / `BseClient` (price-action only — fundamental NSE/BSE endpoints
  deliberately omitted).
- Python reference port (`python/stockscans_client.py`) + `skills.manifest.json` +
  `sync-skills.js` (with `--check` CI gate).
- Tests: 8 passing (auth resolution, BSE HTML parse). Smoke-load of `index.js`,
  the Python import, and auth resolution all verified.

**Remaining (follow-up passes):**

1. **Stockscans services cutover (rest of Phase 2):** the 8 higher-level
   `backend/services/stockscans*.js` now share unified auth (via the
   `stockscansAuth` adapter) but still hold their own endpoint logic — migrate them
   onto `StockscansClient` incrementally. Separately, the data-source move of the
   fundamental NSE/BSE consumers (announcements, financial results, upcoming) onto
   Stockscans is a behavior change needing parity tests — tracked, not yet done.
2. **Cowork jobs (Phase 3):** port the 4 Python scripts to
   `packages/cowork-jobs/*.js`; parity-diff vs Python.
3. **Tasks → skills (Phase 4) + vendor into cloud skills (Phase 4b):** run
   `sync-skills.js` against your skill source repo; switch skills to
   `STOCKSCANS_AUTH_TOKEN`; delete their hand-rolled HTTP/token code.
4. **Decommission (Phase 5):** move old Python to `legacy/`.

---

## 7. Decisions (resolved)

1. **Jobs location:** move the cowork jobs **into the stockmarket monorepo**.
2. **Canonical env var:** `STOCKSCANS_AUTH_TOKEN` (legacy `STOCKSCANS_AUTHTOKEN`
   kept as a deprecated fallback for one cycle, in both the package and skills).
3. **Old Python files:** retain under `legacy/` for one cycle, then delete.
4. **Package name:** `@stock/api`.
5. **Cloud skills:** vendor the relevant client slice into each skill via a single
   canonical Python reference port + `sync-skills.js` (§4).
