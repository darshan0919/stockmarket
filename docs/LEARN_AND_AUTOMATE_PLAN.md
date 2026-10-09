# learn-and-automate — Plan (2026-10-08) · **M1+M2 IMPLEMENTED**

> **Build status (2026-10-08):** skill at `skills/tooling/learn-and-automate/` (SKILL.md, 7 references, `scripts/lna.py` + `scripts/lna/*`, `scripts/persist.js`, 6 Python tests + 3 jest cases). Collection `knowledge-units` registered (db.js + data.js + docs + tests). Decisions taken while building: D1b → new `knowledge-units` collection; KB markdown is a render at `data/assets/knowledge-<slug>.md` (data/ is never in git — supersedes `knowledge/experts/` below); template questions + follower Q&A stay in `data/runs/` (re-derivable), only answered/decided/parked questions are persisted.
> **Measured on SureshKBN 2023-26:** 19,436 docs → prefilter kept 14,261 (one-line answers to follower questions rescued) → 129 chunks (~10k tokens each) · 3,487 follower Q→A pairs mined · 150 chart images downloaded. Pilot recall on 1 chunk (Haiku): 38 units, 38/38 passed verbatim verification. Subagent start-up ≈100k tokens → batch ~5 chunks per subagent.

> Motto: **digest the knowledge → convert to actionable frameworks → automate into jobs/skills.**
> First source: @SureshKBN X corpus. Skill must be source-agnostic and interactive (Darshan learns + decides at gates).

## 0. TL;DR

- New skill `skills/tooling/learn-and-automate/` — a **resumable, multi-session learning state machine**, not a one-shot report.
- Pipeline: `ingest → prefilter (script) → recall extraction (cheap tier) → verify quotes (script) → cluster (script) → teach-back module + quiz + doubts (interactive) → frameworks → fit-gap map to skills/jobs (script candidates, human confirms) → apply via skill-manager / cowork-task-architect → weekly delta refresh`.
- Pilot window: SureshKBN **2023-26** (decided). Note: that is ~94% of his own tweets (21,982 of 23,280), so the pilot is scoped by **modules** (2 modules end-to-end), not by window. Then remaining modules, then the other 3 experts.
- **Question Engine at the core (§4A):** 13 question lenses on every rule, an 8-step answer ladder (corpus → experts → data → track record → web → Darshan → ask Suresh on X → park), questions-first sessions that train Darshan's own questioning, and question checklists as the framework output.
- Reuses: `tweet-investor-playbook` (taxonomy, track-record method), `concept-transcript-integrator` (find→digest→suggest-targets→apply loop), `search_xposts.py`, `scale-funnel-pattern.md`. No LLM API keys anywhere.

## 1. What the SureshKBN corpus actually looks like (measured 2026-10-08)

Source: `data/cache/x-posts-raw/sureshkbn.jsonl` (+ `data/x-posts/` shards, `data/x-experts.json`).

| Metric                             | Value                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Raw rows                           | 31,206 (23,280 by Suresh, 7,926 others' questions = free Q&A context)                                                         |
| Unique own (dedup by id)           | 22,182 (~1.1k duplicate rows in raw cache)                                                                                    |
| Excl. pure reposts                 | 21,224                                                                                                                        |
| ≥40 chars after stripping @/URLs   | 14,211                                                                                                                        |
| + crude finance-keyword filter     | **8,275 (~1.35M chars ≈ 340k tokens)**                                                                                        |
| With chart/media (in filtered set) | 339 (1,805 overall) — images not read today                                                                                   |
| Date span                          | 2015-02 → 2026-10-07; **85% from 2024-26** (7,672 / 6,685 / 5,454)                                                            |
| Replies                            | 9,095 own replies — many are rules stated as one-liners (e.g. "Unless I make plant visits I would stay away with that float") |

Implication: whole-corpus LLM read is wasteful; a **scale-funnel** (script prefilter → cheap recall → flagship synthesis on clustered units) is mandatory.

## 2. Architecture

### 2.1 Source adapters (script, zero LLM) → common `Doc` shape

`{docId, sourceKey, author, date, text, contextText (parent Q / thread), url, kind(post|reply|quote|thread|lesson|video), engagement, hasMedia}`

- `x:<expertKey>` — from `data/x-posts` (thread + parent reply assembled)
- `learnyst:<concept>` — wraps `concept-transcript-integrator/scripts/find_concept_lessons.py`
- `youtube:<channel>` — `data/youtube-transcripts`
- `file:<path>` — uploaded book/PDF (via existing pdfText/OCR path)

### 2.2 Phases (each a `--mode`, each resumable)

| #   | Phase                                                                                                                                                                                                                                                                                           | Who                                    | Output                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------- |
| 0   | **Scope gate (G1)** — source, window, focus (investing vs trading vs both), exclusions; verify capture completeness (`x-experts.json` coverage; `posts` lane shows `exhausted:false`)                                                                                                           | user + script                          | `state.json`                      |
| 1   | Ingest + profile: dedupe, thread assembly, year/type/engagement stats                                                                                                                                                                                                                           | script                                 | `docs.jsonl`, profile             |
| 2   | Prefilter (recall-first): drop RT-only, pleasantries, off-topic; **keep short replies if parent question is finance**; write dropped set + random 200-sample for audit                                                                                                                          | script (+ cheap audit)                 | `candidates.jsonl`, funnel report |
| 3b  | **Vision pass (decided)**: top-150 media tweets by engagement (finance-filtered) → download image → describe chart (ticker, timeframe, pattern, levels, annotations) → attach as `mediaText` to the doc before recall                                                                           | Sonnet subagent                        | `media.jsonl`                     |
| 3   | **Tiered priority (decided 2026-10-08): own posts/articles → replies → reposts**, newest first inside each tier; reposts become `curated` units only. Recall extraction in ~15-20k-token chunks (by month/thread): emit atomic **knowledge units** with verbatim quote + tweet id. No judgment. | **cheap-tier subagent** (Haiku/Sonnet) | `units.raw.jsonl`                 |
| 4   | Verify: every `verbatim` must substring-match its source doc; dedupe near-duplicates; reject unverifiable                                                                                                                                                                                       | script                                 | `units.jsonl`                     |
| 5   | Cluster into **curriculum modules** (TF-IDF + taxonomy keywords)                                                                                                                                                                                                                                | script                                 | `modules.json`                    |
| 5b  | **Question generation + auto-answer** (§4A): lenses × units + mined follower Qs → dedupe/rank → answer ladder                                                                                                                                                                                   | script + cheap tier                    | `questions.jsonl`                 |
| 6   | **Module session (G2, interactive)** per module: _questions-first exercise_ → teach-back brief (≤5-min read) → quiz (quiz widget) → doubts (AskUserQuestion: ambiguity, missing thresholds, contradictions) → Darshan's stance per rule: adopt / adapt / reject / unsure                        | flagship + user                        | KB pages, `userStance`            |
| 7   | Framework derivation from adopted/adapted units: `trigger → inputs (data source) → checks (deterministic vs judgment, thresholds) → action → cadence`. **Platform-reuse-first** check (Stockscans/Screener/NSE native?). **G3** to confirm thresholds                                           | flagship + user                        | `frameworks/<fwId>.md`            |
| 8   | Fit-gap map: candidates from `registry.json` aliases + `jobs/Scheduled/*` + SKILL.md grep → buckets **Enhance existing skill / New skill / New routine (daily/weekly/quarterly checklist)**. **G4** approval                                                                                    | script + user                          | `automation-map.md`               |
| 9   | Apply approved items: skill edits (cite KB unit ids), new skills via `skill-manager`, jobs via `cowork-task-architect` (script-first). Never auto-apply                                                                                                                                         | flagship                               | diffs, run record                 |
| 10  | Refresh (scheduled weekly): new tweets since cursor → phases 2-5 on delta only → flag NEW / CHANGED / CONTRADICTS-existing rules → email digest; contradictions queue for next module session                                                                                                   | cheap tier + script                    | delta report                      |

### 2.3 Never block on the human

If a session is unattended, doubts go to `open-questions.md` and the run continues with independent modules. Gates G1-G4 only block steps that depend on the answer.

### 2.4 Concurrency (per standing rule)

All state keyed by `sourceKey` (e.g. `x:sureshkbn`), passed explicitly to every script; no global "active learning" pointer; per-key lock file + idempotent chunk checkpoints (`chunkId` → done) so two experts can be learned in parallel and a crashed run resumes.

## 3. Knowledge base design

### 3.1 Knowledge unit (structured, searchable)

```
{unitId, sourceKey, kind: rule|checklist_item|do|dont|framework|heuristic|entry_signal|exit_signal|sizing|sector_view|macro_view|pick|anti_pattern|mindset,
 topic, statement (paraphrase), verbatim, citations:[{docId,url,date}], firstSeen, lastSeen,
 conditions (regime / cap-size / sector), explicitness: explicit|inferred,
 status: active|superseded|contradicted, supersededBy, userStance, userNote,
 companyId, creationTime, modifiedTime, creator, modelUsed}   # output-dto-standard envelope
```

Recency rule (standing): when units conflict, **latest wins**; older one marked `superseded`, both kept in `evolution.md`.

### 3.2 Human-readable KB (for Darshan to learn from)

```
knowledge/experts/<expertKey>/
  00-profile.md          style, universe, holding period, sectors, regime of most posts
  principles.md          mindset / philosophy
  screening-checklist.md what qualifies a stock
  entry-rules.md  exit-rules.md  sizing-and-risk.md
  sector-playbooks/<sector>.md   (power, renewables, T&D, capex cycle …)
  macro-lens.md          oil, bonds, rates as gating conditions ("macros need to stabilise")
  dos-and-donts.md
  evolution.md  contradictions.md  open-questions.md
  frameworks/<fwId>.md   automation-map.md
```

`ask-expert` reads these pages **before** raw tweets (distilled answer + tweet citations).

## 4. Interaction design (the "learn" half)

- **Teach-back brief** per module: 5-8 rules max, each with 1-2 verbatim tweets + date, "when it applies / when it doesn't".
- **Quiz**: 5 Qs using real scenarios from his tweets ("stock X, low float, no concalls — what does Suresh do?").
- **Doubt types the skill must raise** (not guess): missing thresholds ("low float" = ?), regime dependence, contradiction old vs new, sarcasm/ambiguity, rule vs one-off comment, conflict with SOIC/Anil Lamba (pull via `ask-expert`).
- **Stance capture**: adopt / adapt (with Darshan's edit) / reject / unsure → only adopt/adapt feed frameworks.

## 4A. Question Engine — questioning is the core of learning (added 2026-10-08)

Principle: **every rule/framework is only learned once it has survived questions.** The skill asks _as many questions as possible_, answers most of them itself, and only puts to Darshan the ones that need his judgment. It also trains Darshan to ask better questions, and turns good question sets into reusable checklists.

### 4A.1 Free question data already in the corpus (measured)

| Signal                                    | Count                                     | Use                                                                                                                                                                                                               |
| ----------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Follower question → Suresh reply pairs    | **2,678** (of 7,723 captured reply pairs) | Ready-made question bank _with expert answers_ — mine which questions he answers and how (e.g. "What do you look at in price action before initiating?" → "Did it cross the most recent resistance, and volumes") |
| Questions Suresh himself asks (top-level) | **1,389**                                 | Learn the expert's _own_ questioning style (e.g. "It is investor's duty to understand what is possible or not?")                                                                                                  |

### 4A.2 How to ask — the question lens set (applied to every unit/framework)

Built on the Socratic question taxonomy (clarification, assumptions, reasons/evidence, viewpoints, implications, questioning the question), extended with investing/automation lenses:

| #   | Lens                       | Template questions                                                                        | Typical answer route                  |
| --- | -------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------- |
| L1  | **Clarify**                | What exactly does "<term>" mean? What number/threshold?                                   | corpus → data                         |
| L2  | **Assumptions**            | What must be true for this to work? (liquidity, macro, cycle stage)                       | corpus → expert KB                    |
| L3  | **Evidence**               | Where did he actually apply it? Which stocks/dates? Any counter-examples?                 | corpus → track record                 |
| L4  | **Mechanism (why)**        | Why does this make money? What's the economic cause?                                      | expert KB (SOIC/Anil Lamba)           |
| L5  | **Boundary**               | When does it NOT apply? Sector, cap size, regime, bear market?                            | corpus → data                         |
| L6  | **Conflict/viewpoints**    | Does it contradict his older view / SOIC / other X experts? Who's right now?              | corpus (recency rule) → ask-expert    |
| L7  | **Inversion / pre-mortem** | How would this rule lose money? What's the opposite rule and when does it win?            | engine reasoning → user               |
| L8  | **Operationalize**         | Which field on Stockscans/Screener measures it? Can a script check it? Daily/weekly?      | platform docs (ask-stockscans) → data |
| L9  | **Action**                 | When it triggers: buy/add/trim/exit? How much? What's the stop?                           | corpus → user                         |
| L10 | **Validate**               | How will we know it works? What metric, over what period?                                 | track record / backtest               |
| L11 | **Personal fit**           | Does it suit my style (swing/momentum vs long-term), capital and time?                    | **user only**                         |
| L12 | **Priority**               | How important is this vs other rules? (per grill-skill rule: criticality is user-decided) | **user only**                         |
| L13 | **Meta**                   | Is this the right question? What question did we not ask?                                 | engine + user                         |

### 4A.3 Which questions to ask — generate wide, answer most, surface few

1. **Generate (wide):** script applies L1-L13 templates to every unit → candidate questions; cheap model adds unit-specific ones; plus all 2,678 mined follower questions mapped to topics. Target: ≥10 questions per framework, every lens covered or marked N/A with reason.
2. **Dedupe + rank (script):** merge near-duplicates; score = impact on an actionable framework × uncertainty × how often followers asked it.
3. **Auto-answer (agent, cheap tier first):** walk the answer ladder (4A.4); record answer + citation + confidence.
4. **Surface (interactive):** only questions that are (a) decisions (L11, L12, adopt/adapt), (b) low-confidence after the ladder, or (c) teaching questions for the quiz. Asked in **grilling rounds** (repo `grilling` skill format): numbered, each with a recommended answer, only the current frontier (questions whose prerequisites are settled).
5. **Never silently assume:** a module closes only when its question frontier is empty (answered, decided, or parked with reason).

### 4A.4 How to find answers — the answer ladder (cheapest, most reliable first)

1. **The expert's own corpus** — `search_xposts.py` over his tweets + mined Q&A pairs (his direct answer beats our inference).
2. **Other experts' KB** — `ask-expert` (SOIC, Anil Lamba, other X experts) for mechanism / conflicting views.
3. **Data** — Stockscans/Screener fields to make vague terms measurable (e.g. distribution of free float across his named picks → proposed "low float" threshold).
4. **Track record** — price action after his dated calls (`tweet-investor-playbook` track-record method).
5. **Web / long-form** — his YouTube talks/interviews linked in tweets (WebSearch/WebFetch, cited).
6. **Darshan** — only for judgment/preference (facts are the engine's job; decisions are Darshan's).
7. **Ask the expert directly** — for high-value unresolved questions, draft a short public question for Darshan to post on X (Suresh answers followers often — 2,678 answered questions); the weekly refresh picks up the reply.
8. **Park** — `open-questions.md` with what was tried and why it's unresolved.

### 4A.5 Teaching Darshan to ask questions (meta-skill)

- **Questions first, answers second:** each module session opens with 3-5 raw tweets/rules; Darshan writes his own questions _before_ seeing the engine's set (generation effect).
- **Reveal + compare:** show engine questions grouped by lens; score which lenses Darshan covered/missed.
- **Lens profile over time:** `learning-records/question-lens-profile.md` tracks his habitual blind spots (e.g. "rarely asks L5 boundary / L7 inversion") and the next session leans on those lenses.
- **Expert-style mirror:** show how Suresh answered the same question when a follower asked it, and what questions Suresh asks himself.
- **Retrieval + spacing:** quiz items re-ask earlier modules' key questions in later sessions (spaced, interleaved).

### 4A.6 Questions become frameworks

A strong framework is a **question checklist with answer rules**. Each module outputs `question-checklists/<topic>.md` (e.g. "Before buying a capex-cycle stock: 12 questions, each with data source + pass/fail rule"). Deterministic items → scripts/scans; judgment items → skill prompts (e.g. `rerating-catalysts`, `investment-thesis-engine` monitoring checklist, `stage2-catalyst-analysis` entry check).

### 4A.7 Question record (stored with knowledge units, `kind: question`)

`{qId, sourceKey, target (unitId|fwId|module), lens, text, origin (engine|template|follower|expert|darshan), needsUser (bool + reason: decision|low-confidence|teaching), route tried[], status (open|auto-answered|user-decided|parked), answer, citations[], confidence, priority, askedAt, answeredAt, modelUsed}` — keyed by `sourceKey` (concurrency rule).

### 4A.8 Metrics per module (shown at session end)

Questions generated · % auto-answered with citation · # decided by Darshan · # parked · lens coverage (engine) · lens coverage (Darshan) · questions escalated to expert.

### 4A.9 Use of /grill-skill

Not run now — it audits an _existing_ skill. Planned at **M2.5**: run `/grill-skill` on `learn-and-automate` (6 dimensions, esp. reasoning vs script split, caching of answered questions, cheap-tier offload of question generation). Its "criticality is user-decided" rule is already built in as lens L12.

## 5. Model tiering & token budget (estimates — validate in pilot)

| Step                                                                    | Tier                  | Est. tokens (full SureshKBN) |
| ----------------------------------------------------------------------- | --------------------- | ---------------------------- |
| Ingest, prefilter, verify, cluster, map                                 | script                | 0                            |
| Recall extraction (~340k + ~100k parent context)                        | Haiku/Sonnet subagent | ~450k in / ~120k out         |
| Chart vision pass (top-150 images × ~1.5k tokens)                       | Sonnet subagent       | ~225k in                     |
| Dropped-set audit (200 sample)                                          | Haiku                 | ~15k                         |
| Module synthesis + teach-back (~10-12 modules)                          | Opus                  | ~15-20k each                 |
| Quiz generation                                                         | Haiku/Sonnet          | small                        |
| Question generation + auto-answer (~10-20 Qs × units, ladder steps 1-3) | Haiku/Sonnet          | ~150-250k                    |
| Frameworks + mapping judgment                                           | Opus                  | ~40k                         |
| Weekly refresh                                                          | Haiku + script        | ~10-30k/week                 |

Pilot = 2023-26 window but only 2 modules ≈ 25-30% of these numbers (recall pass runs on the full window once; synthesis only for 2 modules).

## 6. Build milestones

| M    | Deliverable                                                                                                                                                                                       | Done when                             |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| M0   | This plan reviewed; open decisions answered                                                                                                                                                       | Darshan sign-off                      |
| M1   | Scripts: `sources/xposts.py`, `ingest_profile.py`, `prefilter.py`, `chunk.py`, `verify_units.py`, `cluster_units.py`, `map_frameworks.py`, `state.py` + unit tests                                | tests pass on SureshKBN cache         |
| M2   | `SKILL.md` + references (`question_lenses.md`, `answer_ladder.md`, `unit_taxonomy.md`, `framework_template.md`, `doubt_bank.md`, `teachback_format.md`), registry entry, router via skill-manager | skill triggers                        |
| M2.5 | `/grill-skill` audit of learn-and-automate; apply accepted RFCs                                                                                                                                   | grill ledger saved                    |
| M3   | **Pilot**: SureshKBN 2023-26, 2 modules (suggest: _screening checklist_, _exit/sell rules_) end-to-end incl. 1 framework → 1 automation proposal                                                  | eval vs baseline (skill-manager loop) |
| M4   | Full SureshKBN: all modules, frameworks, automation map, approved changes applied                                                                                                                 | KB complete, run record saved         |
| M5   | Weekly refresh job + `ask-expert` KB-first integration; repeat for Shashank1171, thechartist26, ishmohit1                                                                                         | jobs live                             |
| M6   | Fold `concept-transcript-integrator` in as the `learnyst:` adapter (migrate callers, then deprecate)                                                                                              | single learning skill                 |

## 7. Likely automation outputs (hypotheses to validate, not conclusions)

From a skim of high-engagement posts: heavy focus on power/renewables/T&D capex cycle, float/liquidity, plant visits, macro gating (oil, bonds). Plausible mappings:

- Screening rules → new/updated Stockscans saved scan + `watchlist-sync`
- Macro gating (oil, bond yields) → a daily "macro gate" line in `morning` / post-close recap
- Exit rules → `investment-thesis-engine` monitoring checklist + `weekly-thesis-review`
- Sector playbooks → `sector-research-deepdive` / `rerating-catalysts` references
- His new picks/views → `tweet-signals` already captures daily; enrich with "matches/violates his own rules"
- Pick track record → reuse `tweet-investor-playbook` track-record methodology

## 8. What could be wrong (risks & mitigations)

1. **Stated ≠ practiced** — public persona rules may differ from real behaviour → audit picks vs rules with track-record method; mark rules with no evidence of application.
2. **Regime bias** — 85% of posts are from the 2024-26 capex/power bull phase → tag every unit with regime; ask at G3 whether rule holds in drawdowns.
3. **Sector concentration** — frameworks may not generalise beyond power/renewables → keep sector scope explicit in `conditions`.
4. **Prefilter recall loss** — terse but key replies dropped → parent-question rescue + audited dropped sample; tune before full run.
5. **LLM paraphrase drift / hallucinated rules** → verbatim substring verification (Phase 4) is a hard gate.
6. **Capture completeness** — `posts` lane coverage not exhausted; pre-2023 volume very low → verify before claiming "complete"; re-run capture if needed.
7. **Charts** — 1,805 media posts; v1 reads top-150 by engagement. Image URLs (pbs.twimg.com) may be unreachable from the shell allowlist → fall back to Chrome download; chart reads are interpretations, so units from charts are tagged `explicitness: inferred`.
8. **Sarcasm / off-topic** (top-liked posts include films, politics) → off_topic class + human doubt at G2.
9. **Question overload** — wide generation can bury Darshan → only decision/low-confidence/teaching questions surface, in frontier rounds; the rest are answered and logged.
10. **Mined follower questions are biased** (stock tips, "what did you buy") → weight by lens coverage, not frequency alone.
11. **Not advice** — tweets are dated opinions; frameworks are Darshan's adoptions, logged with his stance.

## 9. Decisions

Decided 2026-10-08: D1 markdown KB + DB units · D2 pilot window 2023-26 · D3 one module per session · D4 vision pass on top-N (N=150 default).
Still open:

- D1b DB home for units: new `knowledge-units` collection (DATA_RULES §3 justification) vs a `type` in `reports.json` — will propose in M1.
- D6 Which 2 pilot modules (default: screening checklist + exit/sell rules).
- D5 Skill name: `learn-and-automate` OK?
