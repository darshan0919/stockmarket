# Skills Workflow & Contracts

This document outlines the architecture and execution contracts for autonomous agent skills and cowork jobs in the `stockmarket` repository.

## 1. Code Resolution (`skills/_shared/resolve.sh`)

All skills resolve their execution environment using a standard contract:
- **Local First**: If the project is in-context (e.g., Cursor, local terminal), the skill will execute the local file at `stock-api/bin/<skill>.js`.
- **Remote Fallback**: If the project is not local (e.g., running from a web UI), the skill expects `github-skill-invoker` to have fetched it (either as a bundle or cloned sandbox) to `/tmp/`, and executes it from there.

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

## 3. Data Storage (`DataStore.js`)

Data is structured in a "files-as-a-lakehouse" model, with all reads/writes passing through the `DataStore` abstraction:
- Formats: Parquet (for tabular), JSON (for state/notes), CSV (legacy).
- Storage Location: `data/` locally, mirrored to Google Drive `StockMarket/data/v2/`.
- Preflight: Data operations will not hang; an `AbortController` handles timeouts. 
- All data synchronization goes through `packages/jobs-runtime/scripts/data.js` (`yarn data:push` / `data:pull`) over `googleDriveApi.js` — see docs/DATA_ECOSYSTEM.md.

## 4. Node Execution Context

- Python execution paths are deprecated and archived in `stock-api/legacy/`.
- All automation must run via Node (`stock-api/bin/*.js`).
- Scripts and skills read configuration purely from environment variables and command-line flags.

## 5. Adding a New Skill

1. Create a CLI entrypoint at `stock-api/bin/<skill-name>.js`.
2. Add `<skill-name>/SKILL.md` inside the `skills/` directory using the `resolve.sh` block.
3. Update `skills/registry.manifest.json` with the new entry and its mode (`bundle` or `clone`).
4. Run `node scripts/gen-registry.js` to regenerate the `registry.json` and `github-skill-invoker` configurations.
