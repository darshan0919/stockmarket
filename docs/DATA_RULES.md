# DATA_RULES — Mandatory Rules for Persisting Data (Data Ecosystem v2)

Audience: **anything that creates or modifies a skill, scheduled job, or runtime
script that persists data** — including meta-skills (`skill-manager`,
`cowork-task-architect`, `github-skill-invoker`-fetched skills) and humans.
These rules are the enforcement companion to `docs/DATA_ECOSYSTEM.md` (design) and
`docs/SKILL_DATA_AUDIT.md` (per-skill classification). If a new skill/job you are
authoring persists ANYTHING, it must comply with every rule below — and its SKILL.md
must say so (see §8).

> **"Database"/"DB" means Google Drive — nothing else.** Whenever Darshan (or any
> task prompt) says "database", "DB", "store this", "our db", etc., it refers to
> **this system**: flat JSON collections under `<repo>/data/`, written via
> `packages/jobs-runtime/lib/db.js`, which push-mirror to Google Drive
> (`data/v2` folder — see `docs/DATA_ECOSYSTEM.md`). **MongoDB (`MONGO_URL`,
> mongoose models in `screener-api/src/features/*/*.js` like `Stock.js`/
> `Fundamental.js`) is a stale/deprecated legacy system from before the Data
> Ecosystem v2 migration.** Do not create new Mongoose models or MongoDB
> collections to satisfy a "store in the db" request — always route new
> persistence through `lib/db.js` per the tree in §1. If existing legacy code
> already reads from Mongo for something, that's fine to leave as-is, but new
> work should not extend it.

## 1. Where data may live — the ONLY five destinations

Decide with this tree, in order:

1. **Is it regenerable at runtime via script/API** (raw API dumps, downloaded PDFs,
   market data, scraped pages)? → **Do not store it.** If it must exist transiently
   for the run, write it to `data/runs/` (flat name: `<prefix>_<YYYYMMDD>[_...].json`).
2. **Is it a heavy + frequently-read derivable** (company master, scrip codes,
   sector context, delivery CSVs, extraction text)? → `data/cache/` (flat name).
   Cache is disposable by definition — a skill must work (slower) if cache is empty.
3. **Is it a rendered artifact** (PDF/HTML/MD email body)? → `data/assets/`,
   produced ONLY as a template render of a JSON DTO (JSON-first, never hand-written
   alongside facts that aren't in the DTO).
4. **Is it metadata, links, an LLM/analyst output, or non-regenerable state?** →
   a **collection**, written through `packages/jobs-runtime/lib/db.js` (§2, §3).
5. Nothing else. Never the repo root, never cwd, never a new ad-hoc folder, never
   git (only code/config/templates/schemas are committed; `data/` is gitignored).

## 2. Use an existing collection first

New data almost always fits an existing collection — prefer, in order:

| Data                                                                            | Collection                                                                                      | Write via                           |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------- |
| Analysis/report DTO (single or multi company, sector)                           | `reports.json` + `reports/<id>.json` body                                                       | `db.saveReport(dto)`                |
| Dated market occurrence (gainer, deal, tweet, announcement, sync run, scan hit) | `events-YYYY-MM.json` with a new `type`                                                         | `db.appendEvents(records)`          |
| Company observation/insight/summary                                             | `notes.json` with a new `type`                                                                  | `db.appendNotes(records)`           |
| Outcome/verdict/score against a prior output                                    | `validation.json` with a new `type`                                                             | `db.appendValidations(records)`     |
| Investment thesis state                                                         | `theses.json` (+`thesis-history.jsonl`)                                                         | `db.saveThesis(companyId, thesis)`  |
| Per-company machine state (dedupe sets, cursors)                                | `companies.json` → the company's `state.<yourSkill>`                                            | `db.upsertMany('companies', [...])` |
| Cross-company singleton state                                                   | a dedicated `<kind>_state_<name>` record inside the closest collection (see `val_state_ledger`) | `db.upsert(...)`                    |

**A new `type` inside an existing collection is ALWAYS preferred over a new
collection.** Adding a `type` needs no code change — just document it in
`docs/DATA_ECOSYSTEM.md` §1 (the events line) and `docs/SKILL_DATA_AUDIT.md`.

## 3. Creating a NEW collection (rare — full checklist)

Only when the data is none of the shapes in §2 (e.g. a genuinely new entity class).
All steps are mandatory; a new collection missing any step is broken:

1. **Justify** in your PR/skill report why no existing collection + `type` fits.
2. **Register** the name in `SINGLE_FILE_COLLECTIONS` in
   `packages/jobs-runtime/lib/db.js` (it is a whitelist — unregistered names throw).
3. **Register** the filename in the `IS_COLLECTION` regex in
   `packages/jobs-runtime/scripts/data.js` (second whitelist — controls
   record-level merge on sync; without it, a two-machine conflict overwrites
   whole-file instead of merging per record).
4. If records are company-scoped and should appear in `companies.json` `links` and
   `buildCompanyContext()`: add an id-prefix → link-kind mapping in `LINK_KIND`
   (db.js) and extend `scripts/rebuildLinks.js` + `lib/companyContext.js`.
5. **Document**: add the file to the layout block in `docs/DATA_ECOSYSTEM.md` §1
   and the producing skill to `docs/SKILL_DATA_AUDIT.md`.
6. **Test**: add a case to `packages/jobs-runtime/test/db.test.js` proving
   (a) dedup — same logical write twice ⇒ 1 record; (b) envelope enforcement.
   Tests MUST set `process.env.DATA_V2_DIR` to a temp dir before requiring modules
   (never let tests touch the real `data/`).
7. Flat file at the data root. Sub-folders are allowed only for id-named large DTO
   bodies (the `reports/` pattern) — never for hierarchy; nesting is expressed by
   id links inside DTOs.

## 4. Record envelope (non-negotiable)

Every stored object carries: `id` (deterministic — same logical output ⇒ same id ⇒
upsert, never duplicate; use `db.makeId(kind, creator, scope, date, discriminator)`),
`creationTime`, `modifiedTime`, `creator` (skill/job/script name or `user`), plus
`companyId`/`companyIds[]`, `date` (the market/business date the record is ABOUT),
and `type` where applicable. No `schemaVersion`, no redundant wrapper objects.
`db.ensureEnvelope()` enforces this — a record without an explicit `creator` is
rejected at write time.

## 5. Write-path rules

- **Only `lib/db.js` touches collection files.** Never `fs.writeFileSync` a
  collection — db.js owns locking (delete-free lock protocol), pre-mutation
  checkpoints, atomic tmp+rename writes, and envelope enforcement.
  (`StorageService` guards against this and throws.)
- **Batch.** Accumulate records and call `appendEvents`/`appendNotes`/
  `upsertMany` once per run (or per ~50 records) — never once per record.
- **No deletes, ever, in a write path.** Cowork sandbox mounts throw EPERM on
  deleting a written file; an inline `rm` aborts the save that triggered it.
  `data/` only grows locally (full mirror). Bounding/cleanup, if ever needed,
  is a separate maintenance script the user runs locally, out-of-band.
- **Context first**: a company-scoped generating skill calls
  `buildCompanyContext(companyId)` (`lib/companyContext.js`) before generating and
  records `contextUsed: [ids]` in its DTO (conventions §8).
- **End every run** with `node packages/jobs-runtime/scripts/data.js push`
  (`yarn data:push`). Push-only: keeps all local files; idempotent (sha256
  sync-state + Drive md5 adoption) — safe to re-run after interruption.

## 6. Scheduled jobs

- Stagger ≥ 30 min from any existing job; ≥ 60 min from any job writing the same
  collection (current slots: watchlist-insights 08:04, drive-sync 09:08,
  watchlist-sync 16:31, insight-validation 17:31, gainers-signal 18:37,
  deals-digest 19:36; weekly Sat 10:04).
- The job's last step is `data:push`; never the legacy offload semantics
  (upload-then-delete is retired).

## 7. Files-touched manifest (every run, no exceptions)

Every skill/job that produces data or creates files MUST end its run by **listing
every file it created or modified**, as part of its final report/response/email
summary. Sources (deterministic — never reconstruct from memory):

- `require('packages/jobs-runtime/lib/db').touchedFiles()` — every data-root file
  this process wrote through db.js (collections, report bodies, thesis history).
- `StorageService.touchedFiles()` — every `runs/`/`cache/`/`assets/` file written.
- The `data:push` output — one `[data push] ↑ <file>` line per uploaded file plus
  the `uploaded/merged/skipped` summary.

Format in the final report: a short "Files touched" section listing data-root-
relative paths, with record counts for collections (from the `{inserted, updated,
unchanged}` stats the db.js helpers return). A run that stored data but did not
report what it touched is incomplete.

## 8. Obligations of meta-skills (skill-manager, cowork-task-architect, …)

When generating or modifying any skill/job that persists data, the generated
SKILL.md / job prompt MUST:

1. Name its storage destination(s) using §1's five categories and §2's table.
2. Instruct writes via the `db.js` helpers (never raw file writes to collections).
3. Include the envelope fields it will set (`creator` = the skill's kebab-case name).
4. Include the `buildCompanyContext` + `contextUsed` step if company-scoped.
5. End with the `data:push` step followed by the §7 "Files touched" manifest in
   its final report.
6. If it introduces a new collection or a new `type`, walk §3/§2's checklist and
   update the two docs named there.

A generated skill that stores data without these elements is non-conformant —
fix it before delivering.
