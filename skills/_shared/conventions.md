# Skill Conventions

This document outlines the standard conventions that all stockmarket skills must follow.
Data conventions (§3, §6–8) implement `docs/DATA_ECOSYSTEM.md` (v2).
When CREATING or MODIFYING a skill/job that persists data — or adding a new
collection/type — follow the mandatory checklist in `docs/DATA_RULES.md`.

1. **Deterministic Execution:** Skills must run deterministically, loading explicitly defined modules.
2. **Env Resolution:** Secrets and configuration must be pulled from the unified Env abstraction (`packages/jobs-runtime/lib/env.js`). DO NOT parse `.env` manually.
3. **Data Access:** All persistent reads/writes go through `packages/jobs-runtime/lib/db.js` — the only module allowed to touch `data/*.json`. Use `saveReport`, `appendEvents`, `appendNotes`, `saveThesis`, `appendValidations`, `find`, `get`. Never write collection files directly (db.js owns locking, checkpoints, atomic writes, and the envelope).
4. **Offline Testability:** All API clients and business logic must be testable offline with mocked fixtures.
5. **JSON-first rendering:** Every reportable output is a JSON DTO first (`db.saveReport`). PDF/HTML/email are pure template renders of that DTO into `data/assets/` — regenerable, never a source of truth, never hand-written alongside the DTO.
6. **Data Lifecycle:** All generated data lives under `<repo>/data/` (never repo root, cwd, or ad-hoc folders). Store ONLY metadata, links, LLM/analyst outputs, and non-regenerable state. Anything re-derivable at runtime via script/API (raw API dumps, downloaded PDFs, market data) is NOT stored — raw run artifacts go to `data/runs/`, heavy frequently-read derivables to `data/cache/`. Before a skill finishes it MUST run `node packages/jobs-runtime/scripts/data.js push` — idempotent, PUSH-ONLY sync to Drive `StockMarket/data/v2`. Everything under `data/` is kept locally (full 1:1 mirror); nothing is ever deleted in a write path (Cowork mounts throw EPERM on delete — an inline `rm` can abort the save that triggered it). Re-fetchable source documents (downloaded PDFs) are simply not persisted under `data/` in the first place — read them from a temp dir outside the mirror.
7. **No data in git:** `data/` is gitignored (except committed config explicitly allow-listed in `.gitignore`). Never `git add` data files; config, JSON Schemas, and render templates are the only non-code files that belong in the repo.
8. **Context first (company-scoped skills):** Any skill generating a report/insight about a company MUST call `buildCompanyContext(companyId)` (`packages/jobs-runtime/lib/companyContext.js`) before generating, weigh the returned prior reports, notes, thesis, events, and validation verdicts, and record what it considered in its DTO as `contextUsed: [ids]`. Every stored object carries `id`, `creationTime`, `modifiedTime`, `creator`, plus `companyId`/`companyIds` and `date` (the market/business date the record is about) where applicable.
9. **Files-touched manifest (every skill/job that produces data):** the run's final report/response MUST list every file created or modified during the run — collections touched (with record counts from the db.js stats), plus any `runs/`, `cache/`, `assets/` files. Deterministic sources: `db.touchedFiles()` / `StorageService.touchedFiles()` (per-process tracking) and the `data:push` output (one `↑ <file>` line per uploaded file). Don't reconstruct the list from memory — read it from these sources.

These conventions ensure that skills can execute in any environment: Cowork, Antigravity, local terminal, or Claude web.
