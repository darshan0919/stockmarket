# Cowork Jobs Drive Data Store — RETIRED

> **This document is retired (2026-07-08).** The jobs/v1 Drive store and the
> `jobs/data/` local layout no longer exist. Everything lives in the
> **Data Ecosystem v2**: flat JSON collections in `<repo>/data/`, mirrored 1:1
> to Drive **`StockMarket/data/v2`** by `packages/jobs-runtime/scripts/data.js`
> (`yarn data:push` / `yarn data:pull` / `yarn data:status`). Push is
> **push-only** — nothing is deleted locally; the local folder is a full mirror.
>
> See **`docs/DATA_ECOSYSTEM.md`** (design + layout + envelope + sync rules) and
> **`docs/SKILL_DATA_AUDIT.md`** (what each skill stores). Historical jobs/v1
> content was migrated by `scripts/migrateToV2.js`; the Drive folder
> `StockMarket/jobs/v1` can be archived/deleted once v2 push is confirmed.
