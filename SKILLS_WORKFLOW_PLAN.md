# Skills Workflow — Fix & Data-Refactor Plan

**Owner:** Darshan · **Repo:** github.com/darshan0919/stockmarket · **Executor:** Google Antigravity
**Status:** Plan (not yet executed) · **Drafted:** 2026-07-03 · **Base commit:** `f9b6c59` (local `HEAD == origin/main`)

> This is a specification, not an implementation. It is written to be executed step-by-step
> by an autonomous agent (Antigravity). Every phase has explicit acceptance criteria and a
> test contract. Read §1–§3 for the *why*, §4–§8 for the *what to build*, §9 for the
> *how to verify*, §10 for risks.

---

## 0. Decisions locked (from Darshan, 2026-07-03)

| Decision | Choice |
|---|---|
| Missing registry scripts | They were migrated **Python → JavaScript**. Locate the JS equivalents already in the codebase; update `registry.json` + all skill references to point at them. **Do not rebuild.** |
| Runtime | **Consolidate on Node.** Everything (skills + jobs) runs on Node; remove the Python execution path. |
| Data storage | **Free tools only, scale to ~unlimited, backed by Google Drive** (plenty of space). Choose the best free format/engine. |
| Secrets | **Store `.env` in Google Drive** so no platform needs it handed over → account/platform-independent, easy to migrate/share. Encrypted at rest; each platform carries only a single bootstrap secret (§7). |
| This session's deliverable | **Plan doc only** (this file). Tests are *specified* here; Antigravity implements them. |

---

## 1. MVP definition (the acceptance bar)

The refactor is "done enough" when **all of these hold**:

1. **Every report/insight/note/proposal skill is callable from any environment** — Cowork
   scheduled tasks, Claude web, Antigravity, Cursor, or any AI platform — with no manual
   path surgery.
2. **GitHub/Drive fetch + post works end-to-end**: a skill fetched from GitHub resolves all
   its code + data and can write results back to Drive.
3. **Secrets are Drive-resident, not per-platform**: a skill uses the local `.env` when the
   project is in context; otherwise it fetches an **encrypted `.env` from Google Drive**.
   The only thing any platform must be given is a **single bootstrap secret** (a Drive-scoped
   read-only token *or* a decryption key) — not the whole file. This makes the workflow
   account/platform-independent, easy to migrate/share, and single-source for rotation.
4. **Local-first when the `stockmarket` project is in context** (in-computer invocation):
   prefer local repo code over GitHub, and local data over Drive.
5. **Remote-first when there is no local project** (web invocation): prefer GitHub code and
   Drive data.

Everything in §5–§8 exists to make these five statements true and *tested*.

---

## 2. Current state (grounded findings)

### 2a. The registry points at code that no longer exists

`skills/registry.json` still references the **pre-migration Python paths**. The Python→JS
migration moved the logic into `stock-api/src/**`, but the registry (and the
github-skill-invoker substitution table, and each skill's `scripts` array) were never
updated. Result: **19 of 30 referenced files are missing on `main`** (verified with
`git ls-tree -r origin/main`):

```
stock-api/python/fetchers/{fetch_documents,fetch_announcements,fetch_and_extract}.py
stock-api/python/generators/{generate_concall_pdf,generate_forensic_pdf,generate_report,
    generate_pdf,generate_credibility_widget,generate_peer_pdf,generate_market_share_html,
    generate_sector_report,generate_drhp_pdf}.py
stock-api/python/analyzers/{compute_concentration,run_scan,scan_catalysts,
    catalyst_rules,parse_tweet_dump}.py
stock-api/python/utils/pdf_utils.py
skills/_shared/conventions.md
```

The JS replacements **do exist** at `stock-api/src/**` (see the mapping in
**Appendix A**). So the fix is a **repoint + reshape**, not a rebuild.

**Blast radius** — every GitHub-invoked skill that lists a missing script is currently
broken when run from a clean cloud environment (it 404s on fetch). That is 18 of the 27
registry skills, including the flagship report generators: `concall-analysis`,
`forensic-accounting`, `equity-research-deepdive`, `peer-comparison`,
`market-share-analysis`, `sector-research-deepdive`, `drhp-ipo-analysis`,
`management-credibility-tracker`, `growth-triggers-1pager`, `pre-pead-scanner`,
`watchlist-catalyst-scanner`, `announcement-keyword-explorer`, `tweet-investor-playbook`,
`equity-research-extraction`, `equity-research-master`, `quarterly-result-analysis`,
`consecutive-filings-diff`, `stock-documents-fetcher`.

> Note: some of these *appear* to work today because the model improvises the missing step
> (e.g. `stock-report` re-implemented PDF rendering inline in a recent run). That is luck,
> not a contract. The deterministic script is the contract.

### 2b. The invoker's resolution model is incompatible with Node

`github-skill-invoker` was designed for **self-contained Python scripts**: "curl one `.py`
to `/tmp`, run `python3 /tmp/x.py`". The migrated JS **cannot** work this way — the modules
use relative requires and depend on the whole package graph + npm deps:

```js
// stock-api/src/fetchers/documentsFetcher.js
const { stockscans } = require('../index');           // pulls the entire @stock/api graph
// stock-api/src/generators/generateReport.js
const { renderPdf } = require('../utils/pdfRenderer'); // + puppeteer (Chromium download)
```

You cannot curl a single file and `node` it. And most `src/**` files are **library modules,
not CLIs** — only `generateReport.js` and `docGenerator.js` expose a `require.main` entry.
So "run the script" has no meaning yet for the others. **This is the central design problem
in §5.**

### 2c. No unified local-vs-remote or data-fallback contract

- Cowork-jobs skills locate code with `find /sessions … -name jobs` (local only, no
  GitHub fallback). GitHub-invoked skills fetch from GitHub (remote only, no local-first).
  Neither honors "local-first when project in context, remote otherwise."
- Data access is ad-hoc per skill via env vars (`COWORK_DATA_DIR`, `GAINERS_OUTPUT_DIR`,
  `WI_NOTES_DIR`, …). There is a Drive store (`lib/driveDataStore.js`) but skills don't
  consistently do "local data first, then Drive."
- `.env` resolution (`lib/env.js`) is: explicit path → `COWORK_ENV` → repo-root `.env`.
  There is **no fallback to the invoking context's `.env`/secrets**, which is exactly what
  breaks web/Cowork runs.

### 2d. Recurring task-execution failures (from last week's run transcripts)

| # | Symptom | Root cause | Frequency |
|---|---|---|---|
| I1 | Email never sends; report only local | `GMAIL_PASSWORD` = `djplearner@gmail.com11` (not a real 16-char Gmail App Password); `GOOGLE_APP_PASSWORD` unset in cloud | Every gainers + insight-validation run |
| I2 | `.env` not found / wrong session | `data/.env` was a **symlink to a dead sandbox path**; worked around by repointing `COWORK_ENV` | ≥1 run, recurring risk |
| I3 | Job hangs indefinitely | Google Drive **API** OAuth call never resolves in the sandbox (no timeout/abort); had to disable Drive sync | watchlist-insights runs |
| I4 | Structural scoring incomplete | NSE delivery bhavcopy **not yet published** at run time (`deliveryConfirmed:0, deliveryPending:true`); no retry/defer | Time-sensitive runs |
| I5 | Stray files committed by agents | `process_watchlist.js`, mislocated `notes/` dir left in `jobs/` | Multiple runs |
| I6 | Subagent shortcut | Batch PDF read instead of per-PDF, silently lowering insight quality | ≥1 run |

These are the "issues related to task execution" to fix. I1–I4 are the blockers; I5–I6 are
hygiene.

### 2e. Data layout today

Canonical data is **files** under `jobs/data/` (git-ignored), mirrored to
Drive `StockMarket/jobs/v1/` via `lib/driveDataStore.js` (local-mount or API
transport, sha256-indexed, `documents.jsonl` manifest). Formats: **JSON** (notes, gainers,
insights, ledgers, proposals), **CSV** (NSE delivery bhavcopy, one file/day), a JSON
scrip-code cache. `docs/COWORK_DRIVE_DATA.md` already describes a good partitioned target
layout — but it's a *mirror spec*, not an enforced store, and everything is raw JSON/CSV.

---

## 3. Design principles (apply throughout)

1. **One runtime (Node).** No `python3` in any execution path after this refactor. Python
   files are deleted or moved to `legacy/` for one cycle.
2. **One source of truth per datum.** `@stock/api` clients own all HTTP/auth; skills never
   re-implement fetch/auth. Data has exactly one canonical location (local ↔ Drive mirror).
3. **Resolution is a documented contract, not per-skill `find` hacks** (§5, §6, §7).
4. **Local-first in-project, remote-first out-of-project** — decided by one probe, not by
   guesswork.
5. **Fail loud on config, soft on optional I/O.** Missing auth token → hard error with the
   fix. Missing Drive/email → warn + continue with a local artifact (never hang).
6. **Everything testable offline.** Clients take injected http/auth; fixtures replace live
   APIs in CI (`@stock/api` already does this).
7. **Generated, not hand-maintained.** `registry.json`, the invoker substitution table, and
   any vendored copies are generated from one manifest and CI-checked for drift.

---

## 4. Target architecture (overview)

```
stockmarket/  (monorepo, Node-only execution)
  packages/
    stock-api/                     # @stock/api — clients + fetchers + generators + analyzers (JS, exists)
      src/**                       # library modules (single source of truth)
      bin/                         # NEW: one thin CLI per skill entrypoint (argv → module call)
      dist-skills/                 # NEW (generated): esbuild single-file bundles per skill entrypoint
      data-store/                  # NEW: DataStore facade (local-first → Drive), format adapters
      python/                      # DELETE after cutover (only skill_manager + orchestrate remain)
    jobs/                   # 4 scheduled jobs (JS, exists) — consume @stock/api + DataStore
  skills/
    _shared/
      conventions.md               # NEW: create (referenced but missing)
      resolve.sh / resolve.md      # NEW: the code+data+env resolution contract skills embed
    <skill>/SKILL.md               # each rewritten to the Node contract
    registry.json                  # regenerated from manifest → JS paths + entrypoints
    registry.manifest.json         # NEW: hand-edited source; registry.json is generated from it
    github-skill-invoker/SKILL.md  # rewritten for Node resolution (clone/bundle, not curl-one-file)
  scripts/
    gen-registry.js                # NEW: manifest → registry.json (+ invoker table); --check for CI
    verify-registry.js             # NEW: assert every referenced path exists on disk/main
```

The four load-bearing contracts:

- **§5 Code resolution** — how a skill finds its executable logic (local repo *or* GitHub),
  given the Node dependency-graph reality.
- **§6 Data resolution** — local files first, Drive fallback, one `DataStore` API.
- **§7 Env/secrets resolution** — local `.env` → context `.env`/secrets.
- **§8 Data storage refactor** — the free, scalable, Drive-backed file format + query engine.

---

## 5. Code-resolution contract (the core fix)

### 5a. The problem restated

A skill's deterministic logic now lives in an npm package graph (`@stock/api` + axios +
puppeteer), not in single files. Three ways to make that runnable from *any* environment,
ranked:

| Strategy | How | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A. Sparse/whole clone** | Skill runs `git clone --depth 1 https://github.com/darshan0919/stockmarket /tmp/sm && cd stock-api && npm ci` on first use; cache for the session | Real code, always current, requires work as-is | ~node_modules install cost; puppeteer Chromium download | **Fallback / heavy skills** |
| **B. Single-file bundles** | `esbuild` bundles each skill entrypoint (`bin/<skill>.js`) into `dist-skills/<skill>.cjs` with deps inlined; committed to repo; invoker curls the **one** bundle to `/tmp` and `node`s it | Keeps the invoker's simple "one file to /tmp" model; fast; no npm install | Must regen bundles on change (CI); native deps (puppeteer) can't be bundled | **Primary for API/analyzer skills** |
| **C. Publish npm package** | `npm publish @stock/api`; skills `npx @stock/api <cmd>` | Standard | Public package, version churn, still needs Chromium for PDFs | Not now |

**Recommended: B primary, A fallback.** Bundle everything that is pure JS + axios
(fetchers, analyzers, HTML generators). For **PDF generators that need puppeteer/Chromium**,
use strategy A (clone + install) *or* switch PDF rendering to a bundle-friendly engine
(see 5d). The invoker picks per-skill from the manifest (`entry.mode: "bundle" | "clone"`).

### 5b. Per-skill entrypoints (`bin/`)

Give every skill a real CLI so "run the script" is well-defined and identical across
environments. Example:

```js
// stock-api/bin/concall-analysis.js
#!/usr/bin/env node
const { fetchDocuments } = require('../src/fetchers/documentsFetcher');
const { generateConcallPdf } = require('../src/generators/generateConcallPdf');
// parse argv (--ticker, --quarters, --mode) → call modules → write output path to stdout as JSON
```

Each entrypoint: reads argv flags, calls the library modules, prints a machine-readable JSON
result (`{ ok, outputs: [...paths], warnings: [...] }`) to stdout. This is what SKILL.md
invokes, and what tests assert against.

### 5c. The resolution shim every skill embeds

Skills stop hand-writing `find` blocks. Instead they source one contract (committed at
`skills/_shared/resolve.sh`, also fetchable from GitHub). Pseudocode:

```bash
# 1. Is the stockmarket project in local context?
SM_LOCAL="$(find /sessions -maxdepth 6 -type d -name 'stock-api' -path '*packages/*' 2>/dev/null \
            | grep -v node_modules | head -1 | sed 's#/stock-api##')"
if [ -n "$SM_LOCAL" ] && [ -d "$SM_LOCAL/.git" ]; then
  MODE=local;  SKILL_ROOT="$SM_LOCAL"          # in-project → local-first
else
  MODE=remote                                   # web/other → GitHub-first
fi

# 2. Resolve the skill entrypoint
if [ "$MODE" = local ]; then
  ENTRY="$SKILL_ROOT/stock-api/bin/<skill>.js"      # prefer local code
  [ -f "$ENTRY" ] || MODE=remote                             # fall back if absent
fi
if [ "$MODE" = remote ]; then
  # bundle mode: curl one file; clone mode: shallow clone + npm ci (cached in /tmp)
  ENTRY=$(resolve_remote_entry <skill>)   # from registry entry.mode
fi
node "$ENTRY" "$@"
```

Key properties:
- **Local-first when project is in context** (MVP #4), **remote-first otherwise** (MVP #5),
  each with automatic fallback to the other side (MVP #1, #2).
- One tested shim, referenced by every SKILL.md, instead of N copies of `find`.

### 5d. PDF rendering decision (unblocks bundle mode for report skills)

Puppeteer/Chromium is the one thing that resists single-file bundling and is heavy in cloud
sandboxes. Options, pick one in Phase 2:

- **D1 (recommended): keep puppeteer but "clone mode" for PDF skills**, and cache the
  Chromium download in `/tmp` per session. Simple, no rendering change.
- **D2: switch to a pure-JS/WASM renderer** (e.g. `@react-pdf`/`pdfkit`/`playwright-core`
  with system Chromium) so PDF skills can bundle too. Bigger rewrite of the generators.

Default to **D1**; revisit D2 only if clone-mode proves too slow.

### 5e. Registry regeneration

`registry.json` becomes a **generated artifact**. Author `skills/registry.manifest.json`
(the hand-edited source) with, per skill: `entry` (bin path), `mode` (bundle|clone),
`modules` (src files it uses, for the bundler + docs), `references`, `aliases`. Then
`scripts/gen-registry.js` emits `registry.json` and the invoker substitution table.
`scripts/verify-registry.js --check` fails CI if any referenced path is missing on disk or
on `main`. **This class of bug (2a) never recurs** once the check is in CI.

---

## 6. Data-resolution contract (local-first → Drive)

Introduce one **`DataStore`** facade (`stock-api/data-store/DataStore.js`) that all
skills and jobs use instead of ad-hoc `fs` + env vars. API sketch:

```js
const store = DataStore.open({ context });   // context = { projectRoot?, driveRoot?, email }
await store.read(key);      // e.g. 'nse-delivery/2026/07/02'  → local file if present, else Drive
await store.write(key, buf, { format });      // writes local, marks dirty for push
await store.pull(prefix);   // hydrate local from Drive (bounded, timeout)
await store.push(prefix);   // mirror local → Drive (bounded, timeout)
store.locate(key);          // returns { local, drive, source } without reading
```

Resolution order inside `read()`:
1. **Local** (`projectRoot/jobs/data/**` when project in context, else the
   session data dir) — **first** (MVP #4).
2. **Drive** (mounted folder → API) — fallback (MVP #2, #5).
3. Miss → typed `NotFound` (caller decides: refetch from API, or skip).

Hard requirements to fix I3 (Drive hang):
- **Every Drive/API call gets an `AbortController` timeout** (default 20s) and a bounded
  retry. Never an unbounded `await`.
- `detectTransport()` prefers the **local mount**; only uses the **API** transport when the
  mount is absent *and* API creds are valid *and* a fast preflight (`about.get`, 5s
  timeout) succeeds. On preflight failure → `disabled`, warn, continue local-only.
- `COWORK_DRIVE_STRICT=1` turns sync failures into hard errors (for CI/manual verification);
  default stays soft.

---

## 7. Env/secrets-resolution contract (Drive-resident `.env`)

**Goal:** the secrets live **once, in Google Drive**, so no platform (web, Antigravity,
Cursor, a fresh laptop) has to be handed the `.env`. Each environment carries only a
**single bootstrap secret**; everything else is pulled from Drive and decrypted at run time.
Rotate in one place → every platform picks it up. This is the account/platform-independence
goal, made safe.

### 7a. The one hard constraint (bootstrap chicken-and-egg)

The Drive **API** credentials (`GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN`) are themselves
secrets. On web there is no Drive mount, so to *fetch* `.env` from the Drive API you already
need Drive-API creds — which are in the file you're fetching. You therefore **cannot** reach
zero secrets on the platform. The achievable and still-excellent target is **exactly one
bootstrap secret** per platform, in one of two shapes (pick one in Phase 3):

- **B1 — Drive read-only token (recommended).** A single OAuth **refresh token scoped
  `drive.readonly` to just the `_secrets/` folder** is the bootstrap secret. The skill uses
  it to download `.env` (or `.env.age`) from Drive, then loads the full secret set. One
  narrowly-scoped secret unlocks the rest.
- **B2 — Decryption passphrase.** Store `.env.age` (encrypted) in Drive *and* make it
  reachable read-only (e.g. a public-but-unguessable Drive link or the same folder); the
  bootstrap secret is the **age/sops decryption key**. Even if the file leaks, it's
  ciphertext.

**Best practice: do both — B1 for access control + encrypt at rest (B2) for defense in
depth.** A leaked Drive link then yields only ciphertext, and the token is least-privilege.

### 7b. Where secrets live

```
StockMarket/jobs/v1/_secrets/.env.age      # AES/age-encrypted, NEVER in the catalog
```
- `_secrets/` is **excluded** from `documents.jsonl`, from any shareable data export, and
  from git (it's on Drive, not in the repo). Sharing the *workflow* (code + non-secret data)
  never shares the secrets.
- Enable Drive **version history** on the folder → free rotation audit + rollback.

### 7c. Resolution chain (`lib/env.js` rewrite)

1. Explicit `--env <path>` or `COWORK_ENV`.
2. **Local project `.env`** when the stockmarket project is in context
   (`<projectRoot>/.env`) — the in-computer case, unchanged, no Drive round-trip.
3. **Drive-resident `.env`** — fetch `_secrets/.env.age` (via local mount if present, else
   the bootstrap Drive token B1), **decrypt** with the bootstrap key (B2), cache to
   `/tmp/.env` for the session. This is the web/remote path and the heart of the
   platform-independence.
4. Platform-injected `process.env` (already set) — used as-is, and **wins** over files.

Rules:
- **Never** overwrite a variable already in `process.env` (platform-injected secrets win).
- **Reject broken symlinks** (fix I2): a symlink whose target is missing is skipped + logged,
  never fatal.
- **Cache + refresh:** the decrypted `/tmp/.env` is session-scoped; re-pull if older than a
  TTL (so a rotation propagates) and never persist decrypted secrets to the repo/Drive.
- **Validate critical secrets on load**, fail loud with the remedy:
  - `GOOGLE_APP_PASSWORD` must be 16 chars `[a-z]`, no spaces, not an email (the I1 bug).
    Invalid → "email disabled: set a real Gmail App Password"; the email step degrades to
    "write artifact locally + warn", never a hard task failure.
  - `STOCKSCANS_AUTH_TOKEN` present (legacy `STOCKSCANS_AUTHTOKEN` read as a deprecated
    fallback one cycle) — else hard error for API skills.
  - The **bootstrap secret itself** must be present in remote mode — else a clear error:
    "no local `.env` and no bootstrap secret; cannot reach Drive secrets."
- Canonicalize names once (Appendix B). `.env.example` documents which secrets each skill
  needs and how to set the single bootstrap secret per platform.

Net setup per new platform: **paste one bootstrap secret.** Everything else is pulled and
decrypted automatically.

---

## 8. Data-storage refactor (free, scalable, Drive-backed)

**Goal:** keep data as files (local + Drive), but make format/organization/scalability/
migratability industry-grade, using **only free tools**, scaling to effectively unlimited
volume on Google Drive.

### 8a. Recommended design — "files-as-a-lakehouse" (Parquet + DuckDB + manifest)

This is the modern, free, zero-server standard for exactly this shape of data (daily
append-only snapshots, time-series, human-inspectable docs). No paid DB, no MongoDB tier.

**Formats (one per data character):**

| Data | Today | Target | Why |
|---|---|---|---|
| NSE delivery bhavcopy (daily, tabular, ~2k rows/day) | one CSV/day | **Parquet**, partitioned `nse-delivery/year=/month=/*.parquet` | Columnar + compressed (≈5–10× smaller than CSV), typed, partition-pruned by DuckDB |
| Gainers raw + insights (daily, tabular-ish) | JSON/day | **Parquet** for the tabular rows; keep a JSON sidecar only if a field is deeply nested | Same; enables cross-day queries ("delivery > 80% last 30d") without loading every file |
| Notes, ledgers, proposals, sector context, scrip cache | JSON | **JSON (schema-versioned)** + JSON Schema in `_meta/schemas/` | Human-inspectable, small, nested — Parquet buys nothing here |
| Reports (PDF/HTML) | files | files (unchanged), indexed in manifest | Binary artifacts |

**Query/analytics engine: [DuckDB](https://duckdb.org) (MIT, free, embedded, zero-server).**
Node binding `@duckdb/node-api` (free). DuckDB reads Parquet/CSV/JSON **directly off the
Drive mount** with SQL, handles larger-than-memory, and needs no running service. This is
what turns "lots of files" into "virtually unlimited queryable data" for free. Example:

```sql
SELECT symbol, avg(delivery_pct)
FROM read_parquet('…/v1/nse-delivery/year=2026/**/*.parquet')
WHERE month BETWEEN 5 AND 7 GROUP BY symbol HAVING avg(delivery_pct) > 70;
```

**Catalog:** keep the existing `_meta/documents.jsonl` manifest (schema-versioned, sha256,
`localRel`/`driveRel`) as the source of truth for *what exists*; optionally expose it as
`catalog.parquet` for DuckDB joins. Retention/lifecycle is manifest-driven
(`retention: keep|archive|expire`).

**Layout (Hive-partitioned, extends `docs/COWORK_DRIVE_DATA.md`):**
```
StockMarket/jobs/v1/
  _meta/{database.json, documents.jsonl, schemas/*.json}
  nse-delivery/year=YYYY/month=MM/day=DD.parquet
  gainers/year=YYYY/month=MM/day=DD/{gainers.parquet, insights.json}
  notes/snapshots/YYYY/MM/notes_*.json + current_run.txt
  validation/{ledger.parquet|json, proposals/*.md, sector-context/…, ignored-log/…}
  reference/bse_scrip_codes.json
  reports/YYYY/MM/DD/<skill>/<file>.pdf
```

**Why this is the right free choice:** Parquet + DuckDB over a synced object store (Drive)
is the standard "lakehouse on a laptop" pattern — free, no server, no row limits, portable,
migratable (open formats), and it scales far past what JSON-file-scanning can. It adds
exactly one npm dep (`@duckdb/node-api`) and one build step (CSV/JSON → Parquet).

### 8b. Lighter fallback (if you want zero new engine)

If DuckDB is unwanted: keep **JSON/CSV but enforce structure** — schema-versioned JSON with
JSON Schema validation, the partitioned Hive layout, the `documents.jsonl` catalog, and
gzip for cold CSVs. You lose fast cross-file SQL but keep everything else. **Recommendation:
adopt 8a** — DuckDB is free and is the difference between "files" and "a scalable store."

### 8c. Migration (one-time, reversible)

1. Write `data-store/formats/` adapters: `csvToParquet`, `jsonToParquet` (for tabular),
   `readAny` (Parquet/JSON/CSV).
2. `scripts/migrate-data.js`: walk existing `data/**`, convert delivery CSVs + gainers rows
   to Parquet, rebuild `documents.jsonl`, **keep originals** under `v1/_archive/` for one
   cycle (reversible).
3. Point jobs/skills at `DataStore` (§6) so reads/writes are format-agnostic.
4. Verify row counts + a sample of values match pre/post (parity test, §9).

---

## 9. Test specification (Antigravity implements these)

Deliverable of this session is the plan; the tests below are the contract to build. Use
Jest (already the repo standard) for JS, plus a few shell/integration checks. **Target:
every registry skill has at least a resolvability test + a smoke test.**

### T1 — Registry ↔ filesystem integrity (fast, CI gate)
- `verify-registry.js`: for every skill in `registry.json`, assert `entry` + every
  `modules`/`references` path **exists on disk AND on `origin/main`** (`git ls-tree`).
- Assert `registry.json` is byte-identical to `gen-registry.js` output (no drift).
- Assert no reference points at `stock-api/python/**` (migration guard).
- **Acceptance:** 0 missing paths; this test would currently FAIL (catches §2a) → passes
  after Phase 1.

### T2 — Code-resolution contract (per skill)
- Simulate **local mode**: fake a project root with `bin/<skill>.js`; assert the shim picks
  local and runs it.
- Simulate **remote mode** (no project): assert it picks bundle (or clone) per manifest and
  the entrypoint runs.
- Simulate **local-missing fallback**: project present but entry absent → falls back to
  remote.
- Assert `bin/<skill>.js --help` exits 0 and prints its parameters for all skills.

### T3 — Env/secrets fallback (unit)
- Local `.env` present → used (no Drive round-trip).
- No local `.env` → **Drive `_secrets/.env.age` fetched + decrypted + cached** to `/tmp`
  and loaded (mock the Drive fetch + a test age key).
- Bootstrap secret **missing** in remote mode → clear typed error, no silent empty env.
- Decrypted `/tmp/.env` respects TTL → stale cache triggers a re-pull (rotation propagates).
- `_secrets/` never appears in `documents.jsonl` / shareable export (leak guard).
- Platform-injected `process.env.X` present → **not** overwritten by file/Drive.
- **Broken symlink** `.env` → skipped, load continues (regression test for I2).
- Invalid `GOOGLE_APP_PASSWORD` (e.g. `foo@bar.com11`) → `email.enabled === false` with the
  remedy message; task still completes (regression test for I1).
- Missing `STOCKSCANS_AUTH_TOKEN` (+ no legacy) → typed hard error for API skills.

### T4 — Data-resolution + Drive (unit + integration)
- `DataStore.read` returns local when present; Drive when only Drive has it; `NotFound`
  when neither.
- **Drive timeout**: mock a hanging API call → aborts at ≤20s, returns soft-disabled, job
  continues (regression test for I3). Assert **no unbounded await** exists (grep guard).
- `push`/`pull` are bounded and idempotent (sha256 dedup: second push is a no-op).
- Parquet round-trip: `csvToParquet` then DuckDB `SELECT count(*)` equals source rows
  (parity for §8c).

### T5 — `@stock/api` client + generator units (extend existing)
- Existing fixture-based client tests stay green (`stock-api/test/*`).
- Each generator: given a fixture input, produces a non-empty PDF/HTML and a valid result
  JSON; PDF page-1 renders without clipping (the "visual inspection" rule, automated via a
  render-and-measure check).

### T6 — End-to-end smoke per skill (offline, fixtures)
- For each of the 27 skills: run `bin/<skill>.js` with a canned fixture (no live API), assert
  `{ ok:true, outputs:[…] }` and that every output path exists and is non-empty.
- The 4 scheduled jobs: run in `--dry-run` against captured fixtures; assert notes/ledger/
  gainers files written with expected shape; assert email step **degrades** (not fails) when
  password invalid.

### T7 — Scheduled-task continuity (guarded live, opt-in)
- Behind `RUN_LIVE=1`: one real run of each of the 4 jobs read-only/`--dry-run`, diffed
  against the prior day's output shape. This is the "babysit the first run" gate for Phase 4.

### CI wiring
- `yarn test` runs T1–T6 offline (no network). T7 is manual/opt-in.
- Add `verify-registry.js --check` + `gen-registry.js --check` as pre-commit + CI steps.

---

## 10. Phased execution (for Antigravity)

Each phase is independently shippable and leaves the system working. Do **not** repoint a
scheduled task until its Node path passes a manual run (protects the daily emails).

**Phase 0 — Safety net & discovery (no behavior change).**
- Add `verify-registry.js` (T1) and run it → confirms the 19 missing paths. Commit it
  *failing-allowed* or as a report first.
- Inventory `stock-api/src/**` vs registry; produce the Appendix A mapping as a
  checked-in `MIGRATION_MAP.md`.
- Create `skills/_shared/conventions.md` (currently referenced-but-missing).
- Clean the stray files (I5): remove `jobs/process_watchlist.js` and the
  mislocated `notes/` dir; add `.gitignore` guards.

**Phase 1 — Registry repoint + entrypoints.**
- Author `registry.manifest.json`; write `gen-registry.js`; generate `registry.json` with
  **JS paths** (Appendix A) + per-skill `entry`/`mode`.
- Add `stock-api/bin/<skill>.js` for every skill that has a script (thin argv→module
  CLIs, JSON result to stdout).
- Update each skill's `scripts`/`references` arrays. `verify-registry.js` (T1) now **passes**.
- **Gate:** T1 + T2 green.

**Phase 2 — Remote runnability (bundle/clone).**
- Add esbuild bundling → `dist-skills/<skill>.cjs` for bundle-mode skills; commit + CI-check.
- Decide PDF path (§5d, default D1 clone-mode for puppeteer skills).
- Rewrite `github-skill-invoker/SKILL.md`: Node resolution, per-skill mode, `/tmp` bundle
  cache or shallow clone; regenerate its substitution table from the manifest.
- **Gate:** T2 remote-mode + T6 smoke green from a clean environment.

**Phase 3 — Contracts: env + data.**
- Implement the §7 env chain in `lib/env.js` (+ symlink guard + secret validation).
- Stand up the Drive-resident secret store: create `_secrets/.env.age`, choose B1/B2, wire
  the bootstrap fetch+decrypt+cache path, and **confirm the bootstrap-injection mechanism on
  each target platform** (web / Antigravity / Cursor) before relying on it.
- Implement `DataStore` (§6) with bounded Drive I/O + preflight; migrate jobs to it.
- Fix I3 hang at the source (AbortController everywhere in `googleDriveApi.js`).
- **Gate:** T3 + T4 green (incl. I1/I2/I3 regression tests).

**Phase 4 — Skills → Node contract + data storage.**
- Rewrite the 4 jobs SKILL.md and the report-skill SKILL.md to source
  `skills/_shared/resolve.sh` and call `bin/<skill>.js` (drop the `find` blocks).
- Land the §8 storage refactor: format adapters, `migrate-data.js`, DuckDB catalog; keep
  `_archive/` originals one cycle.
- Repoint each scheduled task's one-line prompt **only after** a manual Node run passes.
  Babysit the first live run of each (T7).
- **Gate:** T5 + T6 + one clean T7 per job.

**Phase 5 — Decommission + verify.**
- Delete `stock-api/python/**` (or move to `legacy/` one cycle); remove `python3`
  from every path. Port/retire `orchestrate.py` and `skill_manager/*.py` to Node (they were
  outside the earlier migration — see Appendix A note).
- Full `yarn test`; archive parity diffs; update `docs/` (ARCHITECTURE, COWORK_DRIVE_DATA,
  a new SKILLS.md describing the contracts).
- Run a verification subagent to diff behavior and confirm no skill regressed.

---

## 11. What could be wrong with this analysis (risks & unknowns)

- **`orchestrate.py` and `skill_manager/*.py` are still Python** and were *not* part of the
  earlier JS migration. "Consolidate on Node" means these need porting too
  (`equity-research-master` orchestration; the whole `skill-manager` skill). Larger than a
  repoint — flagged as Phase 5 work, not Phase 1.
- **`fetch_and_extract.py` mapping is uncertain.** It maps most plausibly to
  `announcementScanner.js`, but confirm the behavior (fetch + text extract) before wiring
  `announcement-keyword-explorer` (Appendix A marks it ⚠).
- **Puppeteer in cloud sandboxes** is the real friction for report skills. Clone-mode +
  Chromium download may be slow or blocked; the D2 renderer swap is the escape hatch but is
  a bigger rewrite. Validate early in Phase 2 on a clean environment.
- **Bundling can silently drop dynamic requires.** esbuild inlines static requires; anything
  loaded by computed path won't bundle. T6 smoke from a clean env is what catches this.
- **Drive-resident secrets shift the risk to the bootstrap secret (§7).** You cannot reach
  zero platform secrets (the Drive-API creds are themselves in `.env`) — the design reduces
  it to **one** bootstrap secret per platform. That secret must be: least-privilege
  (`drive.readonly`, `_secrets/` only), rotatable, and never logged/committed. If it leaks,
  and the `.env` is *not* encrypted at rest, all secrets leak — hence encryption (B2) is
  strongly recommended alongside the scoped token (B1), not optional.
- **Secrets in Drive are only as safe as the account.** Plaintext secrets in cloud storage
  are a real exposure; `_secrets/` must be excluded from every shareable export/catalog, and
  the file encrypted at rest so an accidental share or link leak yields ciphertext only.
- **Bootstrap injection is platform-specific.** How each platform (Cowork / Claude web /
  Antigravity / Cursor) lets you set that one bootstrap secret differs (project secret,
  env var, uploaded file). Phase 3 must empirically confirm the mechanism per platform and
  encode the real precedence list — don't ship on assumptions. Most likely item to need a
  live probe per platform.
- **Encryption-key management.** Whoever holds the age/sops key can read everything; losing
  it locks you out of the Drive `.env`. Keep a secure offline copy of the key and document
  the rotation runbook.
- **DuckDB adds a native dependency.** It's free and prebuilt-binary, but native modules can
  fail on odd sandbox arches. Keep the §8b JSON-only fallback path working so a DuckDB
  install failure degrades to file-scan, not breakage.
- **NSE delivery timing (I4) is not a code bug** — the data literally isn't published at run
  time. Fix is operational: schedule the delivery-dependent step later, or make
  insight-validation **defer + retry** rather than score against `deliveryConfirmed:0`. Add
  a "delivery not yet published → re-queue in N hours" branch, not a hard fail.
- **Migration continuity.** Tasks fire daily; a half-migrated state could miss a morning
  email. The "manual Node run before repoint" gate and keeping Python in `legacy/` for one
  cycle are the safeguards — don't skip them to save time.
- **Scope boundary.** This plan does not change the backend HTTP API surface or the frontend.
  Those consume `@stock/api` internally and are out of scope unless a data-source remap
  (the NSE→Stockscans fundamental move, deferred in REFACTOR_PLAN §6c) is separately
  requested.

---

## Appendix A — Registry Python → JavaScript mapping

Registry currently references the left column (missing on `main`); repoint to the right
(exists at `stock-api/src/**`). "Used by" lists the dependent skills.

| Registry ref (dead Python) | Target JS module (exists) | Used by |
|---|---|---|
| `fetchers/fetch_documents.py` | `src/fetchers/documentsFetcher.js` | stock-documents-fetcher, concall-analysis, forensic-accounting, equity-research-deepdive, growth-triggers-1pager, management-credibility-tracker, peer-comparison, quarterly-result-analysis, consecutive-filings-diff, pre-pead-scanner, equity-research-extraction, equity-research-master |
| `fetchers/fetch_announcements.py` | `src/fetchers/announcementsFetcher.js` | stock-documents-fetcher, concall-analysis, equity-research-extraction, equity-research-master |
| `fetchers/fetch_and_extract.py` ⚠ | `src/fetchers/announcementScanner.js` *(confirm behavior)* | announcement-keyword-explorer |
| `generators/generate_concall_pdf.py` | `src/generators/generateConcallPdf.js` | concall-analysis |
| `generators/generate_forensic_pdf.py` | `src/generators/generateForensicPdf.js` | forensic-accounting |
| `generators/generate_report.py` | `src/generators/generateReport.js` | equity-research-deepdive |
| `generators/generate_pdf.py` | `src/generators/generateGrowthTriggersPdf.js` *(or `src/utils/pdfRenderer.js`)* ⚠ | growth-triggers-1pager |
| `generators/generate_credibility_widget.py` | `src/generators/generateCredibilityWidget.js` | management-credibility-tracker |
| `generators/generate_peer_pdf.py` | `src/generators/generatePeerPdf.js` | peer-comparison |
| `generators/generate_market_share_html.py` | `src/generators/generateMarketShareHtml.js` | market-share-analysis |
| `generators/generate_sector_report.py` | `src/generators/generateSectorReport.js` | sector-research-deepdive |
| `generators/generate_drhp_pdf.py` | `src/generators/generateDrhpPdf.js` | drhp-ipo-analysis |
| `analyzers/compute_concentration.py` | `src/analyzers/computeConcentration.js` | market-share-analysis |
| `analyzers/run_scan.py` | `src/analyzers/runScan.js` | pre-pead-scanner |
| `analyzers/scan_catalysts.py` | `src/analyzers/scanCatalysts.js` | watchlist-catalyst-scanner |
| `analyzers/catalyst_rules.py` | `src/analyzers/catalystRules.js` | watchlist-catalyst-scanner |
| `analyzers/parse_tweet_dump.py` | `src/analyzers/parseTweetDump.js` | tweet-investor-playbook |
| `utils/pdf_utils.py` | `src/utils/pdfUtils.js` | (shared) |
| `utils/doc_generator.py` | `src/utils/docGenerator.js` | (shared) |
| `stockscans_client.py` | `src/clients/StockscansClient.js` | (shared, via `src/index.js`) |
| `orchestration/orchestrate.py` | **still Python — port to Node** (Phase 5) | equity-research-master |
| `skill_manager/*.py` (10 files) | **still Python — port to Node** (Phase 5) | skill-manager |
| `skills/_shared/conventions.md` | **missing — create** (Phase 0) | many |

⚠ = confirm exact module/behavior before wiring.

## Appendix B — Env var canonicalization

| Purpose | Canonical | Legacy (read as fallback 1 cycle) |
|---|---|---|
| Stockscans auth | `STOCKSCANS_AUTH_TOKEN` | `STOCKSCANS_AUTHTOKEN` |
| Email send | `GOOGLE_APP_PASSWORD` (16-char app password) | `GMAIL_PASSWORD` |
| Drive API | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` | — |
| Data dir override | `COWORK_DATA_DIR` | `WI_DATA_DIR`, `GAINERS_OUTPUT_DIR`(dirname) |
| Drive root / email / sync | `COWORK_DRIVE_ROOT` / `COWORK_DRIVE_EMAIL` / `COWORK_DRIVE_SYNC` | — |

## Appendix C — Issue → fix traceability

| Issue | Fixed in | Verified by |
|---|---|---|
| I1 bad Gmail App Password | §7 secret validation + soft-degrade | T3, T6 |
| I2 broken `.env` symlink | §7 symlink guard | T3 |
| I3 Drive API hang | §6 bounded I/O + preflight; `googleDriveApi.js` AbortController | T4 |
| I4 NSE delivery not published | §11 defer+retry branch (operational) | T7 |
| I5 stray files | Phase 0 cleanup + `.gitignore` | T1 |
| I6 subagent shortcut | SKILL.md "read each PDF individually" rule reinforced in Phase 4 | review |
| Registry dead paths (§2a) | Phase 1 repoint + `gen-registry.js` | T1 |
| Node-incompatible invoker (§2b) | §5 bundle/clone + `bin/` entrypoints | T2, T6 |
| No local/remote contract (§2c) | §5c resolve shim | T2 |
| No data/env fallback (§2c) | §6, §7 | T3, T4 |
