# Skill Conventions

This document outlines the standard conventions that all stockmarket skills must follow.

1. **Deterministic Execution:** Skills must run deterministically, loading explicitly defined modules.
2. **Env Resolution:** Secrets and configuration must be pulled from the unified DataStore/Env abstraction. DO NOT rely on manual `.env` file parsing in the script if it bypasses `lib/env.js`.
3. **Data Access:** All data read/write operations must go through `DataStore.js` to ensure the local-first, Drive-fallback contract is honored.
4. **Offline Testability:** All API clients and business logic must be testable offline with mocked fixtures.
5. **PDF Rendering:** Must support running from a single file entrypoint.
6. **Data Lifecycle (upload-then-delete):** Generated data files (JSON, CSV, HTML reports, downloaded PDFs) must be written under `<repo>/jobs/data/` — never to the repo root, the current working directory, or ad-hoc folders. Before a skill finishes it MUST offload: run `node packages/jobs-runtime/scripts/offloadToDrive.js`, which syncs `jobs/data/` to Google Drive (`StockMarket/jobs/v1`) and wipes the local cache. Re-fetchable source documents (announcement/concall/PPT PDFs) may simply be deleted instead of uploaded. A skill that leaves data files behind in the repo or session workspace is incomplete.
7. **No data in git:** `jobs/data/` and all generated-data paths are gitignored. Never `git add` data files; config (e.g. keyword lists) and templates are the only non-code files that belong in the repo.

These conventions ensure that skills can execute in any environment: Cowork, Antigravity, local terminal, or Claude web.
