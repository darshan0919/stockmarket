# Conversation Capture & Knowledge-Retention Plan

Status: PROPOSED (2026-07-16). Owner: Darshan. Executor: Claude (Cowork), in ordered
runs. Companion docs: `docs/DATA_ECOSYSTEM.md` (design), `docs/DATA_RULES.md` (enforcement),
`docs/SKILL_DATA_AUDIT.md` (per-skill I/O).

## 0. Goal (what "done" means)

Never lose stockmarket research context again. Every stockmarket-related chat (Cowork
_and_ Claude web) must leave a durable, reusable trace in exactly one of the six sinks:
**(1) Database** (existing collection + new `type`, or the new `conversations` collection),
**(2) Skills**, **(3) Claude memory**, **(4) Scripts**, **(5) StockMarket app**,
**(6) Automations/jobs**. Past chats are back-filled into the same sinks. Reuse happens
automatically because company-scoped extracts land in `notes.json`/`reports.json`, which
`buildCompanyContext()` already feeds into every research skill.

Two independent workstreams:

- **Workstream A — Go-forward capture:** a rule + skill that runs at the end of every
  stockmarket chat from now on.
- **Workstream B — Historical migration:** a batched back-fill of the 132+ existing local
  Cowork sessions and (separately) exported Claude-web chats.

Both write through the _same_ extraction/routing engine so there is one code path to trust.

---

## 1. Design decisions (settled before any code)

### 1.1 A chat log is a genuinely new entity → new `conversations` collection

Per `DATA_RULES.md` §2 the default is "new `type` in an existing collection." A raw
conversation is not a report, event, note, validation, or thesis — it is a new entity
class, so §3 (new collection) applies. We follow the **`reports/` two-file pattern**
because transcript bodies are large (10s–100s of KB): a slim index record in
`conversations.json` + a full body in `conversations/<id>.json`.

The conversation record is the **provenance anchor**. It is deliberately _not_ where reuse
happens — reuse happens through the extracts it fans out into existing collections
(§2). This keeps `buildCompanyContext()` unchanged in spirit: it already reads
notes/reports/events/validation; we just add conversations as one more linked kind.

New-collection checklist (`DATA_RULES.md` §3) — every step is a task in Phase 2:

1. Justify: done above (new entity class).
2. Register `conversations` in `SINGLE_FILE_COLLECTIONS` in
   `packages/jobs-runtime/lib/db.js` (currently `['companies','reports','notes','theses','validation']`).
3. Register the filename in the `IS_COLLECTION` regex in
   `packages/jobs-runtime/scripts/data.js` (enables record-level sync merge).
4. Add `conv: 'conversations'` to `LINK_KIND` in `db.js` (currently
   `{ rpt:'reports', evt:'events', note:'notes', val:'insights' }`); extend
   `scripts/rebuildLinks.js` and `lib/companyContext.js` to surface conversation links.
5. Document: add `conversations.json` + `conversations/<id>.json` to `DATA_ECOSYSTEM.md`
   §1 layout and add the capture skill to `SKILL_DATA_AUDIT.md`.
6. Test: add a `db.test.js` case — same session captured twice ⇒ 1 record (dedup),
   and envelope enforcement. Tests set `process.env.DATA_V2_DIR` to a temp dir.
7. Flat file at data root; large bodies in `conversations/` (the sanctioned sub-folder
   pattern, mirroring `reports/`).

Because the two-file pattern needs a `saveConversation(dto)` helper analogous to
`saveReport(dto)`, Phase 2 adds that one helper to `db.js` (index write + body write +
company-link fan-out) rather than letting the skill touch files directly (§5 rule).

### 1.2 Extraction routing — chat content is split, not dumped

The user's taxonomy (questions / thinking / responses / feedback) maps to sinks as
follows. **The conversation body keeps the full trace; the extractor additionally fans
structured, reusable pieces into the right existing collection.** Storing only through
`db.js` helpers (never raw writes).

| Chat content                                                                          | Sink               | Collection / mechanism                                                                           | `type` / where                                                                  |
| ------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Full transcript (Q's, thinking summary, responses, feedback)                          | 1 DB               | `conversations.json` + `conversations/<id>.json`                                                 | new collection, `creator:"conversation-capture"`                                |
| Company-specific insight / observation surfaced in chat                               | 1 DB               | `notes.json` via `db.appendNotes`                                                                | `type:"chat-insight"`, `companyId` set                                          |
| A full analysis produced in chat (deep-dive, thesis reasoning, model)                 | 1 DB               | `reports.json` + `reports/<id>.json` via `db.saveReport`                                         | `type:"chat-analysis"` (or the matching skill's type if a skill produced it)    |
| An output file / artifact (docx, md, xlsx, pdf) not already skill-persisted           | 1 DB               | `reports.json` `type:"artifact"` + file → `data/assets/` (§1.6)                                  | linked from conversation `artifacts[]`                                          |
| Sector / macro view or thematic call                                                  | 1 DB               | `notes.json` via `db.appendNotes`                                                                | `type:"macro-note"`, `sector`/`scope` set, no `companyId`                       |
| Investment thesis change decided in chat                                              | 1 DB               | `theses.json` via `db.saveThesis`                                                                | thesis + `thesis-history.jsonl` line                                            |
| Dated market occurrence discussed (a specific deal/gainer/announcement worth keeping) | 1 DB               | `events-YYYY-MM.json` via `db.appendEvents`                                                      | existing types                                                                  |
| Reusable **framework / methodology / analysis recipe**                                | 2 Skills (backlog) | append to `docs/SKILLS_BACKLOG.md` (git) + `notes.json` `type:"framework"` as the durable record | promote to a real skill later                                                   |
| Feedback on **how Claude should work** (project-agnostic or stockmarket-specific)     | 3 Memory           | write a `feedback`/`project` memory file + `MEMORY.md` pointer                                   | plus `notes.json` `type:"feedback"` scoped to project for DB-side searchability |
| A repeatable heavy-lift identified in chat                                            | 4 Scripts          | append to `docs/SCRIPTS_BACKLOG.md` (git)                                                        | build later                                                                     |
| A UI/app need identified in chat                                                      | 5 App              | append to `jira/features/ideas.md` (existing file)                                               | existing backlog                                                                |
| A recurring task identified in chat                                                   | 6 Automations      | note in conversation record `followups[]`; propose a scheduled job                               | `mcp__scheduled-tasks__create_scheduled_task`                                   |

Decision rule the extractor follows (deterministic, in order): company mentioned + a
claim about it → `chat-insight` note (or `chat-analysis` report if it's a full worked
analysis); no company but a sector/macro claim → `macro-note`; a reusable method → skill
backlog + `framework` note; a "you should do X differently" → memory. Everything, always,
is also captured verbatim in the conversation body so nothing is lost even if routing is
imperfect.

### 1.3 Trigger — a single weekly job (DECIDED)

Capture runs as **one scheduled weekly job** (Darshan's decision — no per-chat live rule,
no daily sweeper). Each week the job:

1. Lists all local Cowork sessions (`mcp__session_info__list_sessions`) touched since the
   last run (cursor in `data/_meta/conversation-capture.json`).
2. Keeps only stockmarket-related ones (§4.2 classifier).
3. For each new session: reads the transcript, saves the conversation, extracts + fans out,
   captures its artifacts (§1.6). Dedup by `sessionId` ⇒ re-runs never duplicate.
4. Ends with `data.js push` + Files-touched manifest.

The same job body powers the historical back-fill (Workstream B) — back-fill is just the
first weekly run with an empty cursor, processed in batches across runs. One code path.

Staggered ≥ 30 min from existing slots (`DATA_RULES.md` §6); proposed weekly slot
**Saturday 11:04 IST** (after the existing weekly Sat 10:04 thesis review, +60 min).

### 1.4 Where past + future conversations and artifacts actually come from

Three distinct sources — only one needs manual effort:

- **Local Cowork chats (this app):** fully automatable. `session_info` exposes all 133
  sessions and their transcripts; the weekly job reads them directly. The desktop app's
  **"Chat" tab is the same local-session data** rendered as UI — so there's nothing to
  scrape there that the tool doesn't already give me cleanly. (I could not open the Chat tab
  to confirm visually — macOS Accessibility/Screen-Recording permission for computer-use is
  currently denied — but session-info is the reliable programmatic source regardless, and
  UI-scraping 130+ chats would be slow and lossy for artifacts.)
- **Cloud chats (Claude web / mobile / desktop cloud conversations):** NOT on local disk and
  NOT readable by any tool here. These need a **manual account Data Export** (see below).
  This is the one unavoidable manual step.
- **Artifacts:** covered in §1.6.

**Data Export — the least-effort path for cloud chats.** In Claude (web app _or_ Claude
Desktop): click your initials (lower-left) → **Settings → Privacy → Export data**; a
download link is emailed to your account address (link expires 24 h; re-request anytime).
The export is **account-level and identical whether triggered from web or desktop** — no
difference in output; the only limit is you can't trigger it from iOS/Android. Per
Anthropic's docs it contains "conversation data and the user data for your account" —
i.e. a `conversations.json` with **full message text**, so text-based artifacts (markdown,
code, tables written into the reply) come inline. Darshan drops the file in the repo and the
same extractor ingests it (`captureConversation.js --source cloud --file <path>`).

**Answer to "does the Export button suffice for both conversations and artifacts?" —
mostly, with one gap.** It fully covers conversations and any _text_ artifact (which is just
message content). It does **not** guarantee **binary artifact files** (a generated
`.xlsx`/`.pdf`/`.docx`) or uploaded attachments as separate downloadable files — the
personal export is JSON text, and the docs don't promise file blobs. In practice this gap is
small for us because **almost all binary artifacts are produced in Cowork sessions, which
are local** (captured via §1.6 folder mount), not in cloud chats. For the rare binary
artifact created in a _cloud_ chat, the only recovery is downloading it from that chat
manually; the job will record its metadata from the transcript and flag `bytesUnavailable`.
So: Export button = all conversations + all text artifacts; local mount = all Cowork
binary artifacts; residual = cloud-chat binaries (rare, manual).

Note the export does **not** include Cowork local sessions (those are the `session_info`
path) — the two sources are complementary, not overlapping, and dedup by id prevents
collisions.

### 1.6 Artifacts & outputs (DECIDED — capture all non-skill artifacts)

Every output/artifact produced in a stockmarket chat is captured **except** those a skill
already persists through the normal workflow (e.g. a concall-analysis PDF that
`db.saveReport` + `assets/` already stored — skip, no double-storage). Applies to **all
existing and future artifacts**.

- **Detection.** For a Cowork session, artifacts are the files in that session's `outputs/`
  folder (and any the transcript shows were written into the repo, e.g.
  `LaserPower_IPO_DRHP_Analysis.md`, `Granules_..._Roadmap.docx` at repo root). For cloud
  chats, artifacts are the inline blocks in the export. **Skip rule:** if an artifact's
  content hash already matches a file under `data/assets/` or a `reports/<id>.json` body, it
  was skill-persisted → reference it, don't re-store.
- **Storage.** A non-skill artifact is a non-regenerable LLM output = report-class. Store it
  as a `reports.json` record `type:"artifact"` (metadata: title, companyIds, summary,
  sourceConversationId) with the actual file copied into `data/assets/<reportId>.<ext>` and
  the body pointer set. This routes it into `buildCompanyContext` and `companies.links`
  automatically — so a future deep-dive on that company sees the artifact.
- **Reference from the conversation.** The conversation record's `artifacts[]` lists
  `{ artifactId, path, hash, skillPersisted: bool }` for full provenance.
- **Reaching every past artifact's bytes (Q3 — DECIDED: capture everything; mount BLOCKED,
  revised mechanism).** UPDATE 2026-07-16: the sessions root
  `~/Library/Application Support/Claude/local-agent-mode-sessions/` **cannot be mounted** —
  the folder-picker refuses it as "Cowork's internal session storage … intentionally not
  accessible." So bulk-reading other sessions' `outputs/` is not possible. Revised, reliable
  mechanism instead:
  1. **Repo + Drive first (covers most).** Skill-generated reports/assets are already pushed
     to Drive (`data/v2/assets`, `reports/`), and ad-hoc artifacts were mostly saved into the
     `stockmarket` repo (e.g. `LaserPower_IPO_DRHP_Analysis.md`, `Granules_…docx` at repo
     root) — both reachable. The migration walks these, hashes, and stores/links.
  2. **Per-session tool-result reads (targeted).** For a specific past Cowork session whose
     artifact lives only in its own `outputs/`, that session's tool-result files ARE readable
     by the rules; the agent can pull named files during the migration read pass (not bulk,
     but reachable when the transcript names them).
  3. **Cloud-chat uploads are NOT in the export** (see §1.4) — only the analysis text is.
  4. Anything still unreachable is recorded metadata-only with `bytesUnavailable:true` +
     `whereToFind` so it is flagged, never silently missed.
     Net: the "everything" goal holds for analysis text (fully captured) and for
     repo/Drive-resident artifacts; the residual is bytes that exist only inside an old
     session's private outputs or as a cloud upload — flagged, and recoverable case-by-case.
- **Future artifacts → Drive at creation (DECIDED).** Going forward, any stockmarket artifact
  is written into `data/assets/` (or a `reports/` body) at creation and pushed to Drive in
  the same run — so it's captured immediately, not a week later. This becomes a line in
  `skills/_shared/conventions.md` (§5 render pipeline already does this for skill outputs;
  extend it to ad-hoc chat artifacts). The weekly job remains the safety net for anything
  that slips through.

### 1.7 When extraction happens (DISCUSS — my recommendation)

Darshan's expectation: extract and fan out into stock-context collections **right after**
saving the conversation, in the same job. **I agree**, with one ordering guarantee:

Per conversation, sequentially: **(1) save the conversation record + body first** (cheap,
durable), **(2) then run extraction and fan out** to notes/reports/theses/events/memory,
**(3) capture artifacts**, then move to the next chat; `data.js push` once at the end of the
job. Saving the raw conversation _before_ extraction means a failure in the fallible LLM
extraction step never loses the chat — because ids are deterministic, a later run
re-extracts with zero duplicates. So we get "same job, immediately after save" (what you
want) plus crash-safety for free.

The only alternative I'd flag is a two-pass design (ingest all raw first, extract all
second). I do **not** recommend it — it adds a second traversal for no benefit here, since
the per-conversation save-then-extract ordering already gives the same durability. If you
agree, no further discussion needed and this becomes the implemented behavior.

---

## 2. Component inventory (what gets built, once)

All new code lives beside existing runtime; no new top-level folders.

1. **`db.saveConversation(dto)`** in `packages/jobs-runtime/lib/db.js` — index + body +
   company-link fan-out (mirror of `saveReport`). Plus the 4 registrations from §1.1.
2. **`packages/jobs-runtime/lib/conversationExtractor.js`** — pure function
   `extract(transcript, meta) → { conversationDto, notes[], reports[], macroNotes[],
theses[], events[], memoryProposals[], skillBacklog[], scriptBacklog[], appIdeas[],
followups[] }`. Deterministic, offline-testable with fixtures (convention §4). The LLM
   step (classify/summarize turns) is isolated behind one function so it can be mocked.
3. **`packages/jobs-runtime/scripts/captureConversation.js`** — the **heavy-lift writer**.
   Input: a JSON file `{ sessionId, title, date, source, transcript }` (or an array for
   batch). It calls the extractor, writes every sink via `db.js` helpers, appends git-side
   backlogs, emits `memoryProposals` as a JSON the agent turns into memory files, and ends
   with `data.js push` + a Files-touched manifest (`DATA_RULES.md` §7,§8).
4. **`skills/tooling/conversation-capture/SKILL.md`** — the go-forward skill the live agent
   runs at end of chat. It structures the in-context transcript into the extractor's input
   shape and calls `captureConversation.js`. Registered in `skills/registry.json`.
5. **`packages/jobs-runtime/scripts/migrateConversations.js`** — batch driver for
   Workstream B. Takes a list of `{sessionId, transcriptJsonPath}` and pipes each through
   `captureConversation.js`, resumable via a `data/_meta/conversation-migration.json`
   cursor (records which session ids are done — dedup + restartable, like the migration
   pattern in `DATA_ECOSYSTEM.md` §7).
6. **`docs/SKILLS_BACKLOG.md`**, **`docs/SCRIPTS_BACKLOG.md`** (new, git-committed) —
   promotion queues for sinks 2 and 4.
7. **`db.test.js` cases** — dedup + envelope for `conversations` (§1.1 step 6).

Reused as-is: `data.js push/pull/status`, `rebuildLinks.js`, `companyContext.js`,
`ensureEnvelope`, `makeId`, `appendNotes/appendEvents/saveReport/saveThesis`.

### Conversation record schema (index, in `conversations.json`)

```jsonc
{
  "id": "conv_<source>_<sessionId8>",     // deterministic ⇒ re-capture upserts, never dupes
  "type": "cowork" | "web",
  "creator": "conversation-capture",
  "date": "2026-07-16",                    // the chat's date (business date it is ABOUT)
  "creationTime": "...", "modifiedTime": "...",
  "title": "Laserpower IPO analysis",
  "sessionId": "local_0c66aca1-...",       // dedup key for the sweeper/migration
  "companyIds": ["NSE:...", "..."],        // detected ⇒ fans out to companies.links
  "sectors": ["..."], "topics": ["..."], "tags": ["thesis","macro","framework"],
  "summary": "1–3 sentence gist",
  "questions": ["...", "..."],             // what Darshan asked
  "feedback": ["..."],                     // corrections/preferences he gave
  "extractedInto": ["note_...", "rpt_...", "mem:..."],  // provenance of the fan-out
  "followups": ["propose daily X job", "..."],
  "body": "conversations/<id>.json"
}
```

Body adds: cleaned turn-by-turn transcript (`user` / `assistant` / condensed `thinking`),
plus `rawRef` to the source. Envelope enforced by `ensureEnvelope` at write time.

---

## 3. Phased execution checklist (each phase = one runnable session)

Ordered so nothing depends on a later phase. Every phase ends with a verification gate.
Heavy lifting is in scripts; the agent's job per run is small and mechanical.

### Phase 0 — Approve & freeze decisions (no code)

- [ ] Darshan confirms: new `conversations` collection (vs. forcing into notes), the §1.2
      routing table, and that web chats need manual export.
- [ ] Confirm feedback→memory is desired (memory is per-space; fine).

### Phase 1 — Extraction engine + tests (pure, offline)

- [ ] Write `conversationExtractor.js` with the deterministic router (§1.2) and one mocked
      LLM classify/summarize function.
- [ ] Fixtures: 2 real transcripts (one company deep-dive, one macro/framework chat) saved
      as test inputs under `packages/jobs-runtime/test/fixtures/`.
- [ ] Unit tests: routing correctness on fixtures; extractor is pure (same input ⇒ same
      output). Gate: `yarn test` green.

### Phase 2 — DB plumbing for `conversations`

- [ ] `db.js`: add `conversations` to `SINGLE_FILE_COLLECTIONS`, `conv` to `LINK_KIND`,
      implement `saveConversation(dto)`.
- [ ] `data.js`: add `conversations` to `IS_COLLECTION` regex.
- [ ] `rebuildLinks.js` + `companyContext.js`: surface conversation links (cap like events).
- [ ] `db.test.js`: dedup + envelope cases (set `DATA_V2_DIR` to temp). Gate: two captures
      of one session ⇒ 1 record; `rebuildLinks` idempotent (2 runs identical).
- [ ] Docs: update `DATA_ECOSYSTEM.md` §1 + `SKILL_DATA_AUDIT.md`.

### Phase 3 — Writer script + artifact capture

- [ ] `captureConversation.js` (single + batch): save conversation → extract → fan out →
      capture artifacts (§1.6, with the skill-persisted skip-by-hash rule), ending in
      `data.js push` + Files-touched manifest. Order per §1.7 (save-first).
- [ ] Dry-run on one recent finished session end-to-end. Gate: conversation record present,
      extracts landed in notes/reports, artifacts stored (or flagged `bytesUnavailable`),
      `data:push` shows the uploads, re-running produces zero new records (dedup proof).

### Phase 4 — Historical migration (batched, resumable) — Workstream B

- [ ] `migrateConversations.js` with the `_meta/conversation-migration.json` cursor.
- [ ] Agent loop (per run, ~15–20 sessions): `list_sessions` → for each stockmarket session
      `read_transcript` → shape to extractor input → `captureConversation.js` batch → mark
      done in cursor. Repeat over multiple runs until all 132 done. **This is the only
      agent-driven heavy step** (transcripts are only reachable via the `read_transcript`
      tool, not from a script). Non-stockmarket sessions are skipped and recorded as skipped
      so they're never re-examined.
- [ ] Web export: Darshan drops exported `conversations.json`; run
      `captureConversation.js --source web --file <path>`.
- [ ] Gate: record-count sanity, quarantine review for unmapped items, spot-check 3
      companies' `buildCompanyContext` now include chat-derived notes.

### Phase 5 — Automation & consolidation

- [ ] Schedule the **weekly capture job** (Sat 11:04 IST, §1.3) via
      `mcp__scheduled-tasks__create_scheduled_task` — the same `captureConversation.js` body,
      driven by the session cursor. This is the sole go-forward trigger.
- [ ] Scheduled **weekly memory/skill consolidation** (separate slot) — reviews `framework`
      notes + skill backlog, proposes promotions (runs `consolidate-memory` for memory
      hygiene).
- [ ] Optional **StockMarket app** surface: a "Research history" view over
      `conversations.json` (later; backlog in `jira/features/ideas.md`).

---

## 4. Migration specifics (low-hallucination)

- **Source of truth for local chats:** `mcp__session_info__list_sessions` (132 exist) +
  `mcp__session_info__read_transcript`. Scripts **cannot** read these; only the agent can.
  So migration is agent-driven reads → script-driven writes. Confirmed: the sandbox has no
  access to `~/Library/.../local-agent-mode-sessions`.
- **Stockmarket detection:** title/keyword match + presence of company tickers or
  stockmarket skills in the transcript. When ambiguous, capture anyway (cheap; body is the
  safety net) but tag `low-confidence`.
- **Dedup:** deterministic `id = conv_<source>_<sessionId8>` ⇒ re-running migration upserts,
  never duplicates (same guarantee as the rest of v2). The cursor file additionally skips
  already-processed sessions so re-runs are cheap.
- **Resumability:** each batch commits its cursor + `data:push` before the next, so an
  interrupted run resumes with zero rework and zero dupes.
- **Order:** newest sessions first (most relevant context), so early value even if the long
  tail takes several runs.

### 4.1b Cowork archive quality (findings from the Phase-3 dry-run — for Phase 4)

Dry-run of `captureConversation.js --cowork-archive ~/Downloads/session-archive` over the
133-session copy exposed archive-shape issues the migration MUST handle (the writer is
correct; these are input-cleanup concerns):

- **Automated job runs** (gainers/watchlist/deals/validation scheduled tasks) dominate the
  archive. Handled: the writer skips any conversation with **zero genuine human turns** after
  dropping injected `<scheduled-task>`/system prompts (`skipped-automated`). Dry-run: 53
  caught directly.
- **Multiple transcript files per session + sub-agent sidechains.** One logical session can
  have several `.jsonl` files, and `isSidechain:true` lines are sub-agent (Task-tool) runs,
  not user chats. Raw file count (~333 stock-classified) ≫ real interactive sessions (~80–100
  expected). **Phase-4 TODO:** (a) dedup by the _real_ session id (folder `local_<id>`), not
  the per-file transcript uuid; (b) drop `isSidechain:true` transcripts; (c) prefer the
  primary transcript per session. Until then, run with `--dry-run` and review counts before a
  real write.
- **Net:** cloud export is clean (136 chats → ~122 stock, 1 sensitive skipped). Cowork archive
  needs the dedup/sidechain filter above before its first real write.

### 4.2 Stockmarket classifier (only stockmarket chats are stored)

A chat is stored **only if** it is stockmarket-related. The classifier is a two-stage gate,
cheap-first: (1) keyword/regex match on title + transcript; (2) for borderline hits, a
company-ticker check against `cache/company-master.json` and a one-shot LLM yes/no.
Non-matches are recorded in the cursor as `skipped` (never re-examined) so the job stays
cheap week over week.

**Seed keyword set** (case-insensitive; will be version-controlled in
`packages/jobs-runtime/lib/stockmarketKeywords.js` so it's auditable and extendable):

`company, business, finance, financial, market, sector, industry, stock, share, equity,
nse, bse, sebi, nifty, sensex, ticker, isin, scrip, chart, technical, candlestick,
drhp, rhp, ipo, listing, watchlist, portfolio, holdings, dividend, earnings, results,
quarterly, concall, con-call, earnings call, transcript, annual report, balance sheet,
cash flow, p&l, valuation, pe ratio, ev/ebitda, thesis, conviction, catalyst, pead,
gainers, losers, deal, bulk deal, block deal, sast, insider, promoter, pledge, delivery,
forensic, credibility, management, capex, capacity, order book, guidance, peer, comparison,
market share, value chain, stockscans, screener, kite, zerodha, mutual fund, fii, dii,
buyback, rights issue, qip, merger, acquisition, demerger, tax` + all watchlist company
names/tickers from `cache/company-master.json`.

**Keywords mined from the existing 133 session titles** (evidence the seed set is right,
and additions surfaced by scanning them): watchlist, gainers/losers signal, deals digest,
tweet signals, thesis review/delta, concall/earnings call, DRHP/IPO, credibility check,
capacity & earnings analysis, pre-PEAD scanner, insight validation, stockscans, NSE/BSE
trade data, equity analysis, stock report, sector, peer comparison, dividend tax.

**Two-stage keyword harvest (DECIDED — read bodies too, not just titles):**

**Validation finding (2026-07-16, Stage-1 run over the 136-chat cloud export):** keyword
Stage-1 alone classified 113/136 as stock, 17 borderline. It produced ~6 **false negatives**
— chats titled with a bare company name whose _body text_ is empty because all content was in
**uploaded files** (not in the export's text field): "Bandhan Bank equity research analysis",
"Consecutive filings analysis for Acutaas", "Consecutive diff analysis for Mahabank",
"Bajaj Consumer Care", "ACUTAAS", "Maharashtra Bank". This is exactly why Stage-2 exists: the
`extraKeywords` = company-master name/ticker list recovers company-name-titled chats, and the
borderline→LLM check catches the rest. **Do not ship the classifier on Stage-1 alone** —
company-master matching is mandatory, not optional.

1. _Pass 1 (titles only):_ run the first migration using the seed set + title keywords above
   PLUS company-master names as `extraKeywords` (required per the finding above). Cheap, gets
   the bulk right.
2. _Pass 2 (bodies, one-time):_ after Pass 1 completes, re-scan the **full text of the
   matched conversations** once to harvest recurring domain terms the titles missed (company
   names, sector jargon, framework names, ticker symbols), and append them as _proposed_
   keywords to `stockmarketKeywords.js` for Darshan to approve. A borderline-skipped chat
   whose newly-found keywords now qualify it is re-evaluated in that pass (its raw was not
   stored, but the cursor kept its id, so re-checking is a cheap title/again-body test — no
   data lost). This makes the classifier self-improve from real content without silently
   widening scope (all additions are approval-gated).

**Deliberately borderline titles found** (kept because they're stockmarket-_project_ work,
tagged `project-infra` not research): "Skills data storage ecosystem", "Cowork data file
cleanup issue", "Weekly authtoken refresh", "Scheduled tasks chat access". Clearly
out-of-scope example: "Ask Claude to create something" (generic) → skipped unless its body
trips the classifier.

---

## 5. What could be wrong with this plan (pre-mortem)

- **Extraction quality drift.** LLM routing may mis-file or over-capture. Mitigation: the
  full transcript is always stored verbatim, so nothing is _lost_ — only findability
  degrades. `contextUsed`/`extractedInto` provenance lets a later pass re-route.
- **Noise inflation of `notes.json`.** Chat insights could bloat context. Mitigation:
  `type:"chat-insight"` is filterable; `buildCompanyContext` already caps counts; keep chat
  notes slim (claim + link back to `conv_` id, not full paragraphs).
- **New collection was avoidable?** Re-examined: a transcript fits none of notes/reports/
  events/validation cleanly, so §3 genuinely applies. If Darshan prefers zero new
  collections, fallback is `reports.json type:"conversation"` with bodies in `reports/` —
  workable but pollutes the reports index. Flagged as the §1.1 alternative.
- **Web chats can't be automated.** Stated plainly (§1.4); depends on manual export. No
  workaround exists from this environment.
- **Trigger reliability.** The end-of-chat rule depends on the live agent remembering.
  The scheduled sweeper is the backstop; without it, capture would be lossy — so the sweeper
  is not optional.
- **Sandbox delete-EPERM.** All writes are append/upsert via `db.js`; no delete in any write
  path (`DATA_RULES.md` §5) — the cursor and backlogs are append-only. Compliant.
- **Memory scope.** Claude memory is per-space; feedback saved there won't follow Darshan to
  Claude web. That's why feedback is _also_ mirrored to `notes.json type:"feedback"` (DB is
  the durable, portable copy).

---

## 6. Scaling & automation (how this stays low-effort)

- **One engine, many entry points:** live skill, migration driver, and daily sweeper all
  call the same `captureConversation.js` — no divergent logic to maintain.
- **Self-healing links:** `rebuildLinks.js` reconstructs `companies.links` from records, so
  a crash mid-fan-out heals on next run.
- **Promotion pipelines:** `framework` notes + `SKILLS_BACKLOG.md` are reviewed weekly by an
  automation that proposes new skills — chats compound into capabilities over time, not just
  storage.
- **Zero-touch steady state:** once Phase 3–5 land, the daily sweeper guarantees capture
  even on chats where the live rule didn't fire; Darshan's only recurring manual task is the
  occasional Claude-web export.

---

## 6a. Enrichment format standard (Phase 6) + feedback (2026-07-17)

Grounded in note-taking / prompt-library research and the collection semantics of this repo.

**Notes = atomic.** One insight per note, a few sentences, specific + quantified, linkable
by `companyId`. Independent insights from one chat become separate notes (better recall +
link-ability); a single coherent snapshot (e.g. a quarter's actuals) may be one note.
Fields: `type` (chat-insight | framework | feedback), `companyId`, `date`, `text`,
`sourceConversationId`, `contextUsed[]`, `tags[]`.

**Reports = full/structured.** Multi-company or sector analyses, or a full worked thesis.
Body DTO with `summary` + structured sections + `companyIds[]` (may be empty for a pure
sector view) + `sourceConversationId` + `contextUsed[]`. Types: chat-analysis, sector-note,
artifact.

**Prompts = the library** (new `prompts` collection). Each reusable question/prompt stored
with its thinking + answer + skill/task link. Fields: `text` (prompt), `title`, `intent`,
`linkedSkill`/`linkedTask`, `inputs[]` (variables), `tags[]` (3–5), `status`
(draft|approved|deprecated), `improvedVersion` (a better-phrased template — the "ask better
questions" payoff), `thinking`, `answerSummary`, `sourceConversationId`, `companyIds[]`.
Deterministic id (hash of text) ⇒ same prompt upserts. Written via `db.savePrompt`.
Registered in `SINGLE_FILE_COLLECTIONS` + `data.js` `IS_COLLECTION`.

**Feedback incorporated (2026-07-17):**

1. **Migration completeness — store everything, skip only the verifiable.** All
   conversations AND artifacts are must-have sources (skill runs included). An artifact is
   skipped ONLY when a script can cross-verify it is already stored (content-hash match
   under `assets/`/`reports/`). The chat is never skipped; an artifact that can't be verified
   is stored, not ignored. (For _future_ skill invocations we may assume the skill persisted
   its output — but still capture the chat + any follow-up Q&A.)
2. **Skill-run + follow-ups.** A chat may start as a skill run and continue with the user's
   follow-up questions. Those follow-ups (and Claude's answers on top of the skill) ARE
   captured as the conversation and mined for insights/prompts. If follow-ups modify the
   same artifact the first run produced, the artifact's DB record is updated (same
   deterministic id ⇒ upsert), not duplicated.
3. **Prompt library** as above — questions + thoughts + answers linked and stored.

## 6b. Decisions (all resolved 2026-07-16)

- **Q1 — extraction timing:** RESOLVED — save conversation raw first, then extract + fan out,
  same job (§1.7).
- **Q2 — new `conversations` collection:** RESOLVED — yes, new collection (modularity over
  data cost) (§1.1).
- **Q3 — capture every artifact:** RESOLVED — capture everything. Requires **one action from
  Darshan**: grant the job read access to
  `~/Library/Application Support/Claude/local-agent-mode-sessions/` (folder picker, one-time)
  so historical Cowork artifact bytes are reachable. Future artifacts routed to Drive at
  creation (§1.6).
- **Q4 — cloud export:** RESOLVED — the "Export data" button covers all conversations + text
  artifacts, but **not** binary artifact files from cloud chats (rare for us; §1.4). Run it
  once now for history, ad-hoc thereafter.

**Only outstanding input needed from Darshan:** (a) the one-time folder grant for Q3, and
(b) run the Data Export once and drop the file in the repo. Neither blocks Phase 1.

## 7. Status (2026-07-16)

- **Phases 1–5 DONE.** Extractor + classifier (`lib/conversationExtractor.js`,
  `lib/stockmarketKeywords.js`), `conversations` collection wired into `db.js` /
  `data.js` / `rebuildLinks.js` / `companyContext.js`, writer + transcript parser
  (`scripts/captureConversation.js`, `lib/coworkTranscript.js`), `conversation-capture`
  skill, and the weekly job (`weekly-conversation-capture-stockmarket`, Sat ~11:12 IST).
  87 tests green.
- **Migration complete:** 210 conversations captured raw-only and pushed to Drive
  (116 cloud + 94 Cowork; 85 company-linked). Guards proven on real data: automated-run,
  sensitive/PAN, stockmarket classifier. Bugs found+fixed by verification: tool-result-as-
  human leak, `local_` id collision, empty Cowork titles.
- **Deferred → Phase 6 (enrichment / Pass B):** interpretive fan-out of stored conversation
  bodies into `notes` (chat-insight/macro/framework/feedback), `reports`
  (chat-analysis/artifact), and Claude memory — done in small, reviewable, citation-backed
  batches. Deterministic ids make it safe to run incrementally without duplicating.
