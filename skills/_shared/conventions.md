# Skill Conventions

This document outlines the standard conventions that all stockmarket skills must follow.

1. **Deterministic Execution:** Skills must run deterministically, loading explicitly defined modules.
2. **Env Resolution:** Secrets and configuration must be pulled from the unified DataStore/Env abstraction. DO NOT rely on manual `.env` file parsing in the script if it bypasses `lib/env.js`.
3. **Data Access:** All data read/write operations must go through `DataStore.js` to ensure the local-first, Drive-fallback contract is honored.
4. **Offline Testability:** All API clients and business logic must be testable offline with mocked fixtures.
5. **PDF Rendering:** Must support running from a single file entrypoint.

These conventions ensure that skills can execute in any environment: Cowork, Antigravity, local terminal, or Claude web.
