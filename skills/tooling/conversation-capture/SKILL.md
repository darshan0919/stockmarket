---
name: conversation-capture
description: Capture a stockmarket chat (and its artifacts) into the DB so research context is never lost. Use at the end of a stockmarket conversation, when running the weekly capture job, or when migrating past chats. Also triggers on "capture this chat", "save this conversation", "log our research", "backfill conversations".
---

# Conversation Capture

Turns a stockmarket chat into durable, reusable knowledge in the Data Ecosystem v2.
Design + rationale: [docs/CONVERSATION_CAPTURE_PLAN.md](docs/CONVERSATION_CAPTURE_PLAN.md).
Data rules are mandatory: [docs/DATA_RULES.md](docs/DATA_RULES.md).

## What counts (scope)

Capture ONLY interactive stockmarket chats — company/sector/macro research, frameworks,
skills/analysis discussion, feedback. Do NOT capture: non-stockmarket chats, **automated
scheduled-job runs** (they persist outputs via their own skills), or **personal/sensitive
docs** (tax/ITR/PAN — the writer skips these; never override that).

## Division of labour (logic vs reasoning)

- **Logic → script (deterministic, heavy-lift):**
  `node packages/jobs-runtime/scripts/captureConversation.js`
  classifies (stockmarket?), applies the automated-run + sensitive guards, saves the raw
  conversation FIRST (`db.saveConversation` → `conversations.json` + `conversations/<id>.json`),
  records artifact metadata, dedups by session id via `_meta/conversation-capture.json`,
  and runs `data.js push` + a files-touched manifest.
- **Reasoning → you (this skill):** read the transcript and produce the fan-out the script
  can't infer — a `--extract` sidecar JSON keyed by session id, plus memory proposals.

## Steps

1. **Identify the source.**
   - Live/interactive: use the current transcript.
   - Weekly job / backfill (Cowork): `--cowork-archive <copied session archive dir>`.
   - Cloud (claude.ai): `--cloud-file <account-export conversations.json>`.
2. **Reason over each in-scope conversation** and build the sidecar
   (`{ "<sessionId>": { notes:[...], reports:[...] } }`) using the routing table
   (plan §1.2). For every company-scoped item, FIRST call
   `buildCompanyContext(companyId)` and set `contextUsed:[ids]` on the produced DTO.
   - company insight/observation → `notes[]` `type:"chat-insight"` (`companyId`,`date`,`text`)
   - full worked analysis → `reports[]` `type:"chat-analysis"` (`companyId`,`date`,`summary`,body)
   - sector/macro view → `notes[]` `type:"macro-note"` (`sector`/`scope`, no `companyId`)
   - reusable method/framework → `notes[]` `type:"framework"` (DB only). Do NOT edit
     git-committed docs; if it merits a new skill, write a PROPOSAL (see Governance below).
   - feedback on how Claude should work → a Claude **memory** file (feedback/project) +
     `notes[]` `type:"feedback"` for DB-side searchability
   - the user's questions/prompts → `prompts` collection via `db.savePrompt` (text +
     intent + linkedSkill/task + inputs + tags + status + improvedVersion + thinking +
     answerSummary + sourceConversationId). Store even for skill-run chats — the user's
     follow-up Q&A on top of a skill is valuable. See CONVERSATION_CAPTURE_PLAN §6a.
   - NOTE: skill-run chats are captured too. Only skip an ARTIFACT when a script confirms
     (by content hash) it is already stored; never skip the chat or an unverifiable artifact.
3. **Artifacts:** any output/artifact NOT already skill-persisted → store as a
   `reports[]` `type:"artifact"` with the file copied to `data/assets/`; skip anything whose
   content hash already matches an existing `assets/`/`reports/` body.
4. **Run the writer** with `--extract <sidecar.json>` (add `--dry-run` first to preview):
   `node packages/jobs-runtime/scripts/captureConversation.js --cloud-file <f> --extract sidecar.json`
5. **Envelope:** every stored record carries `id` (deterministic ⇒ upsert, never dupes),
   `creationTime`, `modifiedTime`, `creator: "conversation-capture"`, plus `companyId(s)`,
   `date`, `type`. Enforced by `db.js` at write time.
6. **Finish** with the writer's `data:push` output and a "Files touched" section listing
   collections + record counts (from `db.touchedFiles()` / the push log).

## Governance — no direct writes to git-committed files

Automated runs (the weekly capture + weekly enrichment jobs) MUST only write DB
collections under `data/` (git-ignored, mirrored to Drive) and Claude memory. They must
NEVER create, edit, or delete any git-committed file — nothing under `skills/`, `scripts/`,
`packages/*/lib`, `docs/`, `jobs/`, `registry*.json`, or tests. If a run concludes that a
skill/script/core-logic SHOULD change (new skill from a framework, a bug fix, a doc update),
it does NOT apply the change — it writes a proposal to `data/_proposals/<date>-<slug>.md`
(git-ignored) containing the rationale + a diff/snippet, and surfaces it in the run report
for Darshan to review and apply manually. Interactive sessions may still edit code with
Darshan's approval; this restriction is for unattended jobs.

## Guarantees

- Raw conversation saved before extraction ⇒ a failed reasoning step never loses the chat;
  re-running re-extracts with zero duplicates (deterministic ids).
- Captured conversations surface in `buildCompanyContext(companyId).conversations` — future
  research automatically sees prior chat history about the company.
- **Staleness / re-chatting:** each conversation carries a `contentHash` (sha256 of the full
  transcript text) and a `dirty` flag. If you keep chatting in an already-captured session,
  the next capture run detects the hash change, re-saves the body, and sets `dirty: true`.
  The weekly enrichment job treats "not yet enriched" OR "dirty" as its work queue, and
  clears `dirty` back to `false` once it re-mines the conversation — so nothing gets
  captured once and then silently ignored forever.
