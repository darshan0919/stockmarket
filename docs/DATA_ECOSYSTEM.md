# Data Ecosystem v2 — Flat, JSON-Linked, Drive-Backed

Status: APPROVED + IN IMPLEMENTATION (2026-07-08). Supersedes `docs/COWORK_DRIVE_DATA.md`
(`StockMarket/data/v2`) and the separate `stockmarket-theses` Drive folder.
Companions: `docs/SKILL_DATA_AUDIT.md` (what each skill needs/generates/stores) and
`docs/DATA_RULES.md` (mandatory checklist for anything that creates/modifies
skills, jobs, or collections — meta-skills like skill-manager and
cowork-task-architect enforce it).

## Principles

1. **Drive is the DB** (`StockMarket/data/v2`); local `data/` is a kept 1:1 mirror
   (hydrate via `pull`, publish via `push`). No generated data in git.
2. **Flat structure.** Collections are single JSON files at the data root. Nesting is
   expressed by **id links inside DTOs**, never by folder hierarchy.
3. **Store only** (a) metadata, (b) links, (c) LLM/analyst outputs, (d) non-regenerable
   state (ledgers, theses, notes, tweet captures). Anything reproducible via
   script/API at runtime is not stored — except heavy + frequently-read derivables,
   which go to `cache/` (disposable by definition).
4. **JSON-first render**: DTO → committed template → PDF/HTML in `assets/`. Assets are
   regenerable, gitignored, disposable.
5. **No file-deletion handling in any skill/job write path.** Cowork sandbox mounts
   forbid deleting a file once written (EPERM), so any inline `fs.unlink`/`fs.rmSync`/
   `fs.rm` used for cleanup or pruning can abort the operation that triggered it.
   `data/` is a kept, ever-growing local mirror by design (§5) — this applies to
   _everything_ under it, including `_meta/checkpoints/`, not just the top-level
   collections. If a directory ever needs bounding, do it out-of-band (a separate
   maintenance script the user runs locally, never inline in a skill/job's write path).

## 1. Layout (flat)

```
data/
  companies.json        # PRIMARY DB — company metadata objects, keyed by companyId
  reports.json          # index of all analysis reports (metadata + summary + links)
  reports/<id>.json     # full report DTO bodies (LLM outputs; one flat dir, id-named)
  conversations.json    # index of captured stockmarket chats (metadata + summary + companyIds + links)
  conversations/<id>.json # full chat DTO bodies (turn-by-turn transcript; id-named) — see docs/CONVERSATION_CAPTURE_PLAN.md
  notes.json            # all company notes (watchlist-insights, manual, validation follow-ups)
  theses.json           # current thesis per company
  thesis-history.jsonl  # append-only thesis deltas
  events-YYYY-MM.json   # monthly event partitions: gainer | deal | tweet | announcement | watchlist-sync
                        #   | order-win | order-book-declared | order-book-sync (see docs/ORDER_BOOK_EXTRACTION.md)
  validation.json       # insight-validation ledger records
  ipos.json             # per-IPO subscription-quality state (ipo-subscription-ranker skill,
                        #   daily-ipo-subscription-analysis-stockmarket job); id = ipo_<ipoPlatformId>,
                        #   not company-scoped (pre-listing IPOs usually have no companyId yet)
  supportive-investors.json # investor registry (anchor-bulk-deal-tracker script); id = investor_<...>_<hash>,
                        #   keyed by canonicalName (chittorgarh Group Entity when available, else the
                        #   anchor-investor name), not company-scoped; each record's `evidence[]` grows
                        #   across runs (an anchor investor who reappeared BUYING more in an NSE/BSE bulk
                        #   or block deal within the listing window) and `companyIds[]` lists every
                        #   company that evidence touches
  unsupportive-investors.json # same shape/keying as supportive-investors.json, mirror case: an anchor
                        #   investor who reappeared SELLING within the listing window
  learnyst-lessons.json # index of fetched Learnyst course-video AI transcripts
                        #   (learnyst-transcript-refresh job); id = lyt_learnyst-transcript-refresh_<courseId>_<hash8(lessonId)>,
                        #   not company-scoped (personal course content, not stock research)
  learnyst-lessons/<id>.json # full transcript body (timestamped + plain text + raw API
                        #   response; id-named, same two-file pattern as reports/ — bodies
                        #   run tens of KB each across hundreds of lessons)
  cache/                # heavy regenerable derivables: company-master.json, bse-scrip-codes.json, extracts
  assets/               # rendered PDF/HTML, flat: <reportId>.pdf|.html (regenerable from DTOs)
  runs/                 # per-run raw dumps + full run DTOs — synced, kept locally (full mirror)
  _meta/
    sync-state.json     # per-file contentHash + lastPush/lastPull — dedup + idempotency
    checkpoints/        # pre-mutation snapshots (crash recovery), kept indefinitely
                        # (not pruned — see §5: no file-deletion handling in the
                        # write path; Cowork sandbox mounts forbid deleting a file
                        # once written, so an inline prune-via-delete could abort
                        # a save)
```

Why `reports/` bodies are separate files while everything else is single-file: report
DTOs are 50–150 KB each; folding them into `reports.json` would make every save rewrite
a multi-MB file (corruption blast radius + full re-upload per sync). `reports.json` is
the collection; bodies are linked by id — consistent with "linking defines nesting".
Everything else (companies, notes, events, validation, theses) is small records →
single file per collection. `conversations/` follows the same two-file pattern as
`reports/` for the same reason: full chat transcripts are large, so the slim index lives
in `conversations.json` and the turn-by-turn body in `conversations/<id>.json`
(written via `db.saveConversation`; id prefix `conv` links into companies.json and
`buildCompanyContext`).

## 2. Object envelope (every object, every collection)

No `schemaVersion`, no redundant wrappers. Required on every object:

| Field          | Notes                                                              |
| -------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `id`           | Deterministic: `<kind>_<creator>_<companyId                        | scope>_<date>[_<hash8>]` — same logical output twice ⇒ same id ⇒ upsert, never duplicate |
| `creationTime` | ISO 8601 IST, set once                                             |
| `modifiedTime` | ISO 8601 IST, bumped on every change; sync conflict resolution key |
| `creator`      | Source of creation: skill/script/job name, or `user`               |

Required retrieval fields where applicable:

- `companyId` (or `companyIds[]` for multi-company DTOs) — canonical `NSE:{ticker}`,
  fallback `BSE:{scrip}`; alias recorded in the company object, one id per company.
- `date` — the business/market date the record is ABOUT (≠ creationTime; a validation
  run at 21:30 must fetch "insights for date=2026-07-08" regardless of when written).
- `type` — record discriminator within a collection (e.g. event type, report type).

## 3. Company metadata object (in `companies.json`)

```jsonc
{
  "id": "NSE:SWARAJENG",
  "name": "Swaraj Engines Ltd",
  "nseTicker": "SWARAJENG",
  "bseScripCode": "500407",
  "isin": "INE277A01016",
  "sector": "...",
  "industry": "...",
  "keywords": ["SWARAJ"],
  "aliases": ["BSE:500407"],
  "links": {
    // ids only — resolve via collections
    "thesis": "NSE:SWARAJENG", // key into theses.json
    "reports": ["rpt_concall-analysis_NSE:SWARAJENG_2026-07-01"],
    "notes": ["note_..."],
    "events": ["evt_deal_..."], // capped to last 200; older found by scanning events-*.json on companyId
    "insights": ["val_..."],
  },
  "watchlist": true,
  "conviction": null, // rollup convenience fields
  "manual": {}, // user-authored, never machine-overwritten
  "creationTime": "...",
  "modifiedTime": "...",
  "creator": "company-master-sync",
}
```

- Identity fields: written only by `companyMasterSync.js` (Kite) + stockscans enricher.
- `links`/rollups: maintained by the write API on every save, **and** rebuildable from
  the collections via `rebuildLinks.js` (crash between record-write and link-update
  self-heals; `manual` is the only non-reconstructable part).
- Entries exist lazily — only companies that have artifacts (not all 12,232 from master;
  the full master stays in `cache/company-master.json`).

## 4. Access layer — `packages/jobs-runtime/lib/db.js` (single choke point)

- `upsert(collection, record)` / `get(collection, id)` / `find(collection, {companyId, date, type, limit})`
- `saveReport(dto)` (index + body + company link), `appendEvent(record)` (routes to
  monthly partition + fans out links to every `companyId` in the record),
  `appendNote`, `saveThesis` (+history line), `appendValidation`.
- Envelope enforced at write time: missing `id` → derived deterministically; missing
  `creationTime/modifiedTime/creator` → rejected (creator must be explicit).
- `buildCompanyContext(companyId, {tokenBudget})` → `{ identity, thesis, notes,
reports (last N summaries + latest full DTO per type), events (90d), insights }`.
  **Convention §8: every Category A/B skill (see audit) MUST call this before
  generating and record `contextUsed: [ids]` in its DTO.**

### Concurrency & durability (ACID-ish, file-scale)

- **Atomicity**: write to `<file>.tmp` + `fs.renameSync` (atomic on same fs). Never
  in-place writes.
- **Isolation**: advisory lockfile per collection (`data/.locks/<name>.lock`,
  `{pid, owner, ts}`); acquire with O_EXCL, exponential backoff ≤ 30 s, steal if stale
  > 5 min. All mutations are read-modify-write under the lock.
- **Durability/recovery**: batch mutations snapshot the file to `_meta/checkpoints/`
  first; on corrupt JSON at load, auto-restore from latest checkpoint (loud warning).
- **Priority batching**: writers accumulate upserts and flush once per run (or every
  50 records), not per record — one lock window, one rename, one sync delta.
- **Schedule buffers** (operational guard, reviewed in §7): scheduled jobs staggered
  ≥ 30 min apart; any two jobs writing the same collection ≥ 60 min apart.

## 5. Sync — `scripts/data.js push|pull|status`

Idempotent by construction, no duplicates:

- `_meta/sync-state.json` stores per-file `contentHash` (sha256) + Drive fileId +
  `modifiedTime` at last sync. Push uploads only hash-changed files and **updates the
  existing Drive fileId** (never create-if-exists → no `(1)` copies). Pull downloads
  only when Drive hash differs and local file wasn't modified since last sync.
- Both sides changed ⇒ **record-level merge** by `id`, newest `modifiedTime` wins per
  record (collections are id-keyed maps/arrays — merge, not overwrite). Unmergeable
  (non-collection) conflict ⇒ keep both, flag in `status`, never silent-drop.
- Record dedup: deterministic ids make re-runs upserts; merge never appends an id twice.
- Lifecycle: EVERYTHING under data/ (collections, reports/, cache/, assets/, runs/)
  is pushed AND kept locally — full 1:1 mirror, push never deletes local files;
  `cache/` → local-only, never synced (regenerable); downloaded source PDFs → deleted,
  never uploaded. Safety contract inherited from data.js push: delete only what
  is confirmed uploaded; unknown files reported loudly, never deleted.

## 6. Render pipeline

`compute → DTO (reports/<id>.json) → scripts/render.js <id> [--pdf] → assets/<id>.html|pdf`.
Templates live in `templates/` (git). Rendered files embed `sourceDto: <id>` in a meta
tag. Any historical report is re-renderable; assets are never a source of truth.

## 7. Migration (big-bang, ordered)

1. Snapshot: final legacy offload; Drive-side copy `jobs/v1` → `_archive/jobs-v1-20260708`;
   same for `stockmarket-theses`.
2. Ship v2: `db.js`, `companyContext.js`, `data.js`, `rebuildLinks.js`, templates, tests.
3. Seed: `companyMasterSync.js` → `cache/company-master.json`; create `companies.json`
   entries only for companies having artifacts (watchlist + anything found in step 4).
4. Migrate (`scripts/migrateToV2.js`): jobs/v1 gainers/deals/tweets/watchlist-sync →
   `events-*.json`; watchlist-notes entity → `notes.json`; theses → `theses.json` +
   `thesis-history.jsonl`; ledgers → `validation.json`; report JSONs → `reports.json` +
   `reports/`; HTML-only reports → `assets/` (no DTO backfill — flagged in manifest).
   Unmappable → `_meta/migration/quarantine/` + manifest. Then `rebuildLinks.js`.
5. Repoint: `notesDb.js`, `gainersClassifier.js`, `insightValidator.js`, `dealsDigest.js`,
   `watchlistInsights.js`, thesis engine → `db.js`; rewrite
   `skills/_shared/conventions.md` §6–8; `.gitignore` (+`data/`); scheduled jobs:
   offload step → `yarn data:push`, and **restagger run times with ≥ 30 min buffers**.
6. Verify: record-count parity per collection; `rebuildLinks.js` idempotency (2 runs →
   identical); double-push/double-pull produce zero changes (dedup proof); one e2e
   skill run + `buildCompanyContext` smoke test; quarantine review. Archive kept 30 d.

## 8. Known risks (reviewed)

- Single-file collections are whole-file writes → lock + atomic rename is mandatory;
  events partitioned monthly and notes/validation records kept slim to bound file size.
- `events-*.json` company links capped in `companies.json` to stop unbounded growth;
  full history retrievable by scanning partitions on `companyId` (rare path).
- Record-level merge assumes clocks sane across machines — `modifiedTime` from one
  writer per run + staggered schedules makes ties unlikely; ties resolve to lexically
  larger contentHash (deterministic).
- Kite master has BSE-only rows / null NSE tickers → alias dedup in migration, one
  canonical id per company.
- Drive API quota during migration → batched, checkpointed, resumable.
