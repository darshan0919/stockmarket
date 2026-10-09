---
name: learn-and-automate
description: Interactive, multi-session learning engine that digests a knowledge source (an X/Twitter expert's posts, Learnyst lessons, YouTube channel, or a book/notes file) into a verified knowledge base, teaches it to Darshan through question-first sessions, quizzes and grilling rounds, derives actionable frameworks from the rules he adopts, and maps them onto existing skills/jobs or new routines. Use for "learn from @SureshKBN", "digest this expert's tweets into rules", "what are X's investing rules/checklists/do's and don'ts", "continue my learning session on <topic>", "turn what we learned into frameworks/automation", "learn-and-automate status", or the weekly expert-KB refresh. Questioning is the core: it asks as many questions as possible, answers most itself with citations, and only asks Darshan what needs his judgment.
---

# Learn and Automate

Motto: **digest the knowledge → convert it into actionable frameworks → automate into jobs/skills.**
Plan & rationale: `docs/LEARN_AND_AUTOMATE_PLAN.md`. Deterministic half = `yarn learn-and-automate <cmd>`
(`scripts/lna.py`, zero LLM). Writes = `yarn learn-and-automate:persist` (`scripts/persist.js` → `lib/db.js`).
No script calls an LLM API (conventions §24) — every reasoning step below is done by you (or a cheap-tier
subagent you spawn).

Every command takes `--source <key>` explicitly — `x:<handle>` · `learnyst:<kw,kw>` ·
`youtube:<channelHandle>[:<kw,kw>]` · `file:<path>`. State is keyed per source
(`data/runs/learn-and-automate/<slug>/state.json`, flock-guarded), so several sources can be learned in
parallel; never keep a global "current source".

## Pick the mode

| Darshan says                                 | Mode                                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| "learn from <source>" (first time)           | **init** (Phases 0-5) then offer the first session          |
| "continue / next session / teach me <topic>" | **session** (Phase 6)                                       |
| "turn this into frameworks / automate"       | **frameworks** + **automate** (Phases 7-9)                  |
| weekly job / "refresh <source>"              | **refresh** (Phase 10)                                      |
| "status"                                     | `yarn learn-and-automate status --source <key>` → summarise |

## init — Phases 0-5

**0. Scope gate (G1).** Confirm with Darshan (AskUserQuestion, one round): source, window (`--since`),
focus (investing / trading / both), exclusions. If the source is an X handle, check
`data/x-experts.json` coverage first and say if any lane is not exhausted.

**1. Ingest + profile** — `yarn learn-and-automate ingest --source <key> --since <date>`. Report the
profile (docs, years, kinds, media, question-context count).

**2. Prefilter (recall-first)** — `… prefilter --source <key>`. Report the funnel. Then audit
recall: read `dropped-audit-sample.jsonl` (200 docs) — cheap tier is fine — and count docs that
carried a rule/view. If > 5%, propose extra rescue terms for `FIN` in `scripts/lna/pipeline.py`,
re-run, and report the change. Never skip this audit; recall loss is invisible otherwise.

**3a. Tweet images (all photos; GIFs and videos ignored)** - `lna.py img-collect|img-fetch|img-ocr --source x:<handle>` (zero LLM; download + local tesseract; run in <=110s foreground batches, idempotent, most-liked first). Text-heavy images (>=40 words: frameworks, tables, report pages) are joined to their tweet as `[IMAGE]` text via `sources.load_xposts`, so topic-scan keyword matching and extraction see them. `chart`-class images (few words) go to the vision pass below, topic-driven (only images on topic-matched docs). Re-run `img-collect/fetch/ocr` in the weekly refresh for new posts.

**3b. Vision pass (charts)** — `… media-queue --top 150`, `… media-fetch`. For each image in the queue
(view it with the Read tool; stage from the device first when remote), write
`{docId, mediaText, modelUsed}` lines describing ticker, timeframe, pattern, levels, annotations —
factual, no advice — to `data/runs/learn-and-automate/<slug>/media.desc.jsonl`, then
`… media-apply --file <that>`. Sonnet-tier subagents, batches of ~25 images.

**3. Chunk + recall extraction** — extraction priority is **his own posts/threads/quotes/articles (tier 1) → replies (tier 2) → reposts (tier 3)**, newest first within each tier; `… chunk` builds `t1-cNNNN`/`t2-…`/`t3-…` chunks in that order and `next-chunks` serves them in that order (`pendingByTier` shows what is left). Do tier 1 completely before starting tier 2; tell the subagents the tier of their chunks (`recall_extraction.md` has the per-tier effort rules). Then loop:
`… next-chunks --n 20` → spawn up to 4 cheap-tier subagents (model `haiku` or `sonnet`), **each handling ~5 chunks in sequence** (a subagent's fixed start-up cost is ~100k tokens — measured 2026-10-08 — so one-chunk-per-agent wastes most of the spend), each with
`references/recall_extraction.md` + `references/topic_taxonomy.json` + the chunk path + its `out` path
→ when they finish, `… verify --chunks <ids> --model-used <model>`. Report accepted/rejected and the
reject reasons; if `verbatim-not-in-source` > 15% for a chunk, re-run that chunk once with the reason
quoted to the subagent. Continue until `pending` is 0 (or the window Darshan approved). Progress is
checkpointed per chunk — safe to stop and resume in a later session.

**4. Persist** — `yarn learn-and-automate:persist --file data/runs/learn-and-automate/<slug>/units.verified.jsonl`
(re-persisting never overwrites Darshan's stances — persist.js preserves user-owned fields).

**5. Curriculum** — `… modules`, `… mine-questions`, `… render`. Present the module list (title,
rule count, date span) and the follower-question counts per topic; recommend the first module
(highest rule count that Darshan has not done), and stop. The KB lives at
`data/assets/knowledge-<slug>.md` (a render of the DB — regenerate, never hand-edit).

## session — Phase 6 (one module per session)

Follow `references/session_protocol.md` exactly: open → **questions first** (Darshan writes his own
questions before any teaching; `lens-score`) → teach-back brief → quiz → **grilling rounds on the
frontier** → stances → close. Question engine rules: `references/question_lenses.md`; how to find
answers: `references/answer_ladder.md`. Generate wide, answer most yourself with citations, surface
only decisions / low-confidence leftovers / teaching items. A module is done only when its frontier is
empty (answered, decided or parked with reason).

## frameworks + automate — Phases 7-9

From units Darshan adopted/adapted (never from unreviewed units) draft `kb-framework` records per
`references/framework_template.md` — each check typed deterministic vs judgment, each threshold traced
to an answered question, platform-reuse-first checked. Ask Darshan to confirm thresholds (G3). Then
`… map --file <frameworks.jsonl>` for candidate skills/jobs, propose `kb-automation` records in three
buckets (enhance existing skill · new skill · new daily/weekly/quarterly routine), and get approval
(G4) before touching anything. Apply approved items only: existing skill → edit its repo SKILL.md;
new skill → `skill-manager`; routine/job → `cowork-task-architect`. Persist frameworks and automation
records; patch automation to `applied` with `appliedFiles`.

## refresh — Phase 10 (weekly scheduled job: `jobs/Scheduled/weekly-learn-and-automate-refresh/`)

`… ingest --delta` → `… prefilter --delta` → `… chunk --delta` → recall loop on new chunks → verify →
persist → compare new units with active ones in the same topic: flag **NEW** rules, **CHANGED** views
(newer statement on the same idea → patch older `status: superseded`, conventions §28) and
**CONTRADICTS** (queue as an L6 question for the next session) → check whether any
`ask-expert-on-x` question got a reply → `… render` → short digest to Darshan → only then
`… commit-cursor` (never after a partial failure — conventions §19).

## Model tiers (grill-skill criticality, 2026-10-08)

| Task                                                    | Class                  | Tier                                                                                     |
| ------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| Recall extraction                                       | Valuable Context       | cheap (Haiku) + script quote check + `audit-sample` (>15% tag mismatch → tighten prompt) |
| Chart vision pass                                       | Valuable Context       | Sonnet; stored `inferred`, never presented as his claim                                  |
| Answer-ladder judgment, fit-gap mapping                 | Mission-Critical Alpha | flagship; script shortlists top-k (`map`), Darshan approves every mapping                |
| Framework derivation, teach-back, supersession/conflict | Mission-Critical Alpha | flagship, only with Darshan present                                                      |

## Data rules (DATA_RULES.md)

- Collection `knowledge-units` (types `kb-unit`, `kb-question`, `kb-framework`, `kb-automation`,
  `kb-learner-profile`) — written ONLY via persist.js. Template questions and mined follower Q&A are
  re-derivable → they stay in `data/runs/`; only answered/decided/parked questions are persisted.
- Run record at the end of every init/session/refresh: `yarn learn-and-automate:persist --report <file>`
  with `{summary, sourceKey, mode, module?, modelUsed, metrics…}` (type `learning-run` in reports.json).
- Set `modelUsed` on every LLM-authored record (units, answers, frameworks). Never invent dates for
  undated material (Learnyst).
- Finish with `yarn data:push` and a **Files touched** list from persist.js's `touched` output and the
  `data:push` ↑ lines (never from memory).

## What could be wrong — say it in every report

Stated ≠ practised (check L3/track record) · regime bias (most posts are 2024-26) · sector
concentration · prefilter recall loss (audit numbers) · chart reads are interpretations (`inferred`) ·
tweets are dated opinions, not advice.

## Token notes (conventions §11)

Recall extraction and the vision pass are transcription — run them on the cheapest tier that passes
`verify`. Keep the main model for sessions, ladder judgment, frameworks. End each run with one concrete
suggestion based on this run's numbers (e.g. reject rate, chunks remaining, cache hits).
