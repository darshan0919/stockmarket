# Skills Workflow & Contracts

This document outlines the architecture and execution contracts for autonomous agent skills and cowork jobs in the `stockmarket` repository.

## 1. Code Resolution (`skills/_shared/resolve.sh`)

All skills resolve their execution environment using a standard contract:

- **Local First**: If the project is in-context (e.g., Cursor, local terminal, Cowork), the skill will execute the local file at `stock-api/bin/<skill>.js`.
- **Remote Fallback**: If the project is not local (no mounted checkout), `resolve.sh` shallow-clones the repo into `/tmp/sm-clone` and executes `stock-api/bin/<skill>.js` from there. (The earlier bundle-mode fallback via `github-skill-invoker` fetching `stock-api/dist-skills/*.cjs` to `/tmp/` was retired 2026-09-16 — confirmed unused, deleted along with the `dist-skills/` folder.)

Every `SKILL.md` uses this standard invocation:

```bash
bash ./skills/_shared/resolve.sh <skill-name> "$@"
```

## 2. Environment & Secrets (`lib/env.js`)

Secrets are decentralized and **Drive-resident**.

- A local `.env` is preferred when the project is in context.
- When remote, a single bootstrap secret (e.g. `GOOGLE_REFRESH_TOKEN` or a decryption key) is provided by the platform.
- The `env.js` shim automatically fetches `_secrets/.env.age` from Google Drive, decrypts it, and caches it to `/tmp/.env` for the session.
- **Never** commit `.env` or `_secrets/` files.

## 3. Data Storage (`packages/jobs-runtime/lib/db.js`)

Data is structured as flat, id-keyed JSON collections (Data Ecosystem v2 — see docs/DATA_ECOSYSTEM.md), with all reads/writes passing through the `db.js` abstraction — it is the only module permitted to touch `data/*.json` directly (per `skills/_shared/conventions.md`):

- Format: single-file JSON collections, one per data type, envelope-enforced (id, creationTime, modifiedTime, creator, modelUsed).
- Storage Location: `data/` locally, mirrored to Google Drive `StockMarket/data/v2/`.
- Durability: tmp-file + rename writes, per-collection advisory lockfiles, pre-mutation checkpoints with auto-restore on corrupt JSON.
- All data synchronization goes through `packages/jobs-runtime/scripts/data.js` (`yarn data:push` / `data:pull`) over `googleDriveApi.js` — see docs/DATA_ECOSYSTEM.md.

## 4. Node Execution Context

- The repo's earlier Python execution paths (`stock-api/python/...`) were removed outright, not archived — some were migrated to Node equivalents (e.g. `stock-api/bin/orchestrate.js`), others had no replacement built and were simply deleted along with the skills/scripts that depended on them.
- All automation must run via Node (`stock-api/bin/*.js`).
- Scripts and skills read configuration purely from environment variables and command-line flags.

## 5. Adding a New Skill

1. Create a CLI entrypoint at `stock-api/bin/<skill-name>.js`.
2. Add `<skill-name>/SKILL.md` inside the `skills/` directory using the `resolve.sh` block.
3. Update `skills/registry.manifest.json` with the new entry, including its `mode` (`bundle` or `clone`, per `resolve.sh`'s local-first/remote-fallback contract in §1), plus `skill_md`, `entry`, `modules`/`scripts`, `references`, `shared`, `aliases`.
4. Run `yarn registries:generate` (`node scripts/build/generate-registries.js`) to regenerate `skills/registries/workflow-dependencies.json` and `DEPENDENCIES.md`. `skills/registry.json` itself is hand-maintained alongside `registry.manifest.json`, not auto-generated — update both by hand.
