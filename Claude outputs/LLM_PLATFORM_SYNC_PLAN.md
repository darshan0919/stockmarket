# `yarn llm-platform:sync` — design plan

Status: proposal, not yet implemented. Nothing in the repo has been changed.

## 1. What you asked for, restated

A single command, `yarn llm-platform:sync`, that becomes the one thing you run
when setting up this repo on a new computer (or periodically) to get Claude,
Antigravity, and Cursor all wired up to this repo's skills/jobs/rules —
replacing today's `yarn antigravity:sync`, which only handles Antigravity.

## 2. The constraint that shapes everything: only Antigravity has a pull-able store

`yarn antigravity:sync` works today because Antigravity exposes a real,
predictable, on-disk global config directory: `~/.gemini/config/{sidecars,skills,rules,projects}`.
The script reads repo files and **writes into that directory** on the local
machine. That's a genuine two-way-capable sync target.

Neither Claude nor Cursor has an equivalent:

| Tool                      | Repo-side source of truth                                         | Global/account-side store                                                                                                                                                                                                                                                                                                              | Is it a local file?                                           |
| ------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Antigravity               | `jobs/Scheduled/*/SKILL.md`, `skills/{equity-research,tooling}/*` | `~/.gemini/config/{sidecars,skills,rules}`                                                                                                                                                                                                                                                                                             | **Yes** — plain JSON/Markdown files                           |
| Cursor                    | `AGENTS.md`, `.cursor/rules/*.mdc`, `.cursorrules`                | none — Cursor reads rules straight from the repo, there's no separate global copy to sync                                                                                                                                                                                                                                              | N/A, already synced by definition                             |
| Claude Code (CLI)         | `CLAUDE.md` → `@AGENTS.md`                                        | `~/.claude/` (global settings), `.claude/settings.local.json` (per-repo, already checked in)                                                                                                                                                                                                                                           | Yes, but it's session/permission config, not skills or memory |
| Claude Cowork / claude.ai | none today                                                        | (a) cross-surface user memory — server-side on Anthropic's infra, no file, ever; (b) Cowork project memory — desktop-app-managed state behind `project_memory_read/write`, not a plain file path; (c) account custom skills — created/edited via the `propose_skills` tool call, which is a user-approved API action, not a file write | **No** for all three                                          |

Given your answer (push-only for Claude, treat memory/session skills as
genuinely non-syncable rather than faking it), the honest design is
**asymmetric by tool**, not a uniform pull+push for all three. Pretending
otherwise would mean `llm-platform:sync` silently no-ops the Claude "restore
my memory" step on a new machine and you'd only discover that the day you
actually need it.

## 3. What "sync" means per tool, concretely

### Antigravity — unchanged, still the only true two-way sync

- Source: `jobs/Scheduled/*/SKILL.md` (schedules + prompts) and
  `skills/{equity-research,tooling}/*` (skill bodies).
- Target: `~/.gemini/config/sidecars/*/sidecar.json`, `~/.gemini/config/skills/*/SKILL.md`, `~/.gemini/config/rules/*`.
- Direction: repo → Antigravity, always. (Nothing pulls Antigravity state
  back into the repo — sidecar `enabled` flags and cron overrides are the
  only state that lives Antigravity-side, and the current script already
  preserves those on write, per `SIDECAR_OVERRIDES` and the
  cron-preservation logic in `syncScheduledTasks()`.)
- This becomes one phase of the new orchestrator, logic untouched.

### Cursor — verify-only (nothing to push, nothing to pull)

- `.cursorrules` and `.cursor/rules/*.mdc` already live in the repo and are
  already what Cursor reads directly. There's no separate global Cursor
  store on the machine to write into.
- `yarn rules:sync` / `yarn rules:check` already keeps these files aligned
  with `AGENTS.md`. This becomes a phase that just calls the existing
  `sync-rules.js --fix`, same as today.
- On a new machine: cloning the repo _is_ the entire Cursor setup. Nothing
  else to do. The command's job here is just to confirm parity, not move
  any files around.

### Claude — push repo skills outward, verify rules, and print what's not automatable

1. **Rules**: `CLAUDE.md` is already a thin pointer to `AGENTS.md`. Same
   `rules:sync`/`rules:check` phase covers it — no new logic needed here
   either.
2. **Skills**: repo skills under `skills/{equity-research,tooling,development}/`
   are the source of truth (per `skill-manager/SKILL.md`'s existing rule:
   "the stockmarket repo is the single source of truth for skill logic —
   Claude-account custom skills are thin routers only"). Today, pushing a
   skill to your Claude account happens by hand via `propose_skills`
   through an interactive session (skill-manager's flow) — it's a
   human-approved action by design (the tool literally renders a review
   card; it never silently writes). `llm-platform:sync` **cannot** call
   `propose_skills` itself — it's not a shell-invocable API, it only exists
   inside a live Claude session. What the script _can_ do:
   - Compute a diff: for every repo skill, hash its `SKILL.md` (+ any
     bundled assets) and compare to a checksum recorded the last time it
     was pushed (new file, `skills-lock.json`-style: `.claude-skills-lock.json`,
     tracking `{skillName: {contentHash, lastPushedAt}}`).
   - Print a clear "N skills changed since last push, run `/skill-manager`
     (or open a Cowork session) to push them" list, rather than silently
     doing nothing.
   - This mirrors the pattern already used for third-party skills in
     `skills-lock.json` (hash-tracked, not auto-applied).
3. **What genuinely can't be synced, documented explicitly rather than
   silently skipped**:
   - Cross-surface Claude memory (your investing philosophy, publishing
     info, etc. under `/profile.md`, `/topics/*.md`) — server-side, no file.
   - Cowork project memory (`MEMORY.md` + topic files under this session's
     desktop-managed store) — **note**: this one is _slightly_ different
     from account memory; ask before assuming it's unreachable (see open
     question in §7).
   - Any Claude-account custom skill content that didn't originate from
     this repo (one-off skills you made ad hoc in a chat) — by definition
     not something the repo can claim as "source of truth" and re-push.

## 4. New file layout

```
scripts/
  llm-platform-sync.js         # new orchestrator (thin — calls the 3 phases below)
  antigravity-sync-tasks-and-skills.js   # UNCHANGED, still does the Antigravity phase
  sync-rules.js                          # UNCHANGED, still does the Cursor+Claude rules phase
  claude-skills-diff.js                  # NEW — hash-diff repo skills vs .claude-skills-lock.json, print report
.claude-skills-lock.json         # NEW — {skillName: {contentHash, lastPushedAt}}, committed
docs/
  LLM_PLATFORM_SYNC.md            # NEW — user-facing doc, replaces relying on tribal knowledge
```

`package.json`:

```json
"llm-platform:sync": "node scripts/llm-platform-sync.js",
"antigravity:sync": "node scripts/llm-platform-sync.js --only=antigravity"
```

Keeping `antigravity:sync` as a thin alias (rather than deleting it
immediately) means nothing that currently calls `yarn antigravity:sync` —
including `.agents/rules/scheduled-tasks-sync.md`'s mandatory instruction —
breaks the moment this ships; it gets updated to call the new command in
the same change, and the alias is removed once you're comfortable dropping
it (suggest: one commit later, not the same one, so a `git blame` shows a
clean deprecation step).

`scripts/llm-platform-sync.js` (orchestrator, ~40 lines):

```
1. syncRules()                    // from sync-rules.js --fix — covers Cursor + Claude rule parity
2. syncAntigravity()              // from antigravity-sync-tasks-and-skills.js — unchanged
3. diffClaudeSkills()             // NEW — prints what's stale, does not push
4. print a one-screen summary: what was written, what needs your manual approval, and where
```

Supports `--only=antigravity|rules|claude-skills` for targeted re-runs and
`--check` (no writes, exit non-zero on drift — for a future CI/pre-commit
hook, matching the existing `--check`/`--fix` convention from `sync-rules.js`).

## 5. AGENTS.md changes

Replace §9 ("Antigravity sync") with a renamed, broader section:

```markdown
## 9. Multi-platform sync

Any change to scheduled tasks (`jobs/Scheduled/`) or `skills/` must be
followed by `yarn llm-platform:sync` (which also runs `yarn dead-code:scan`
internally — no need to call it separately). This one command:

- Re-syncs Antigravity's UI sidecars and global skills from the repo.
- Re-verifies Cursor's and Claude's rule files stay aligned with this
  document (via `yarn rules:sync`).
- Reports which repo skills have changed since they were last pushed to
  your Claude-account custom skills, so you know when to re-run
  `skill-manager`'s `propose_skills` flow by hand — this step is
  intentionally not automatic; Claude requires a human-approved action to
  create or update an account skill.

Full mechanics: [`docs/LLM_PLATFORM_SYNC.md`](docs/LLM_PLATFORM_SYNC.md).

**What this command does NOT do, on purpose:** it cannot pull or restore
your Claude-account cross-surface memory, or Claude Cowork project memory,
onto a new machine — neither has a plain-file form a repo script can read
or write. If you're setting up a new computer, treat that memory as
something you rebuild by using Claude normally (it accumulates again), not
something this repo can hand you back.
```

Bump `rule-platform-sync` in `data/tasks.json` similarly — same rule id,
updated title/description to mention Claude push-verification and the
memory caveat, so `sync-rules.js`'s existing content-match checks
(`checkContentIncludes`) keep passing without new special-casing.

`.agents/rules/scheduled-tasks-sync.md` and `.gemini/rules/scheduled-tasks-sync.md`
get their `yarn antigravity:sync` reference swapped for `yarn llm-platform:sync`
(one line each), through the normal `rules:sync` mechanism if you fold that
file into the sync target set, or by hand if it stays out of scope for
`sync-rules.js` (it currently only touches CLAUDE.md/.cursorrules/general.mdc/gemini-rules-dir, not this specific file — worth deciding when building).

## 6. New-machine bootstrap checklist (what this actually buys you)

```bash
git clone <repo>
cd stockmarket
yarn install
cp .env.example .env   # fill in secrets — sync doesn't touch these, see §7
yarn llm-platform:sync
```

After that:

- Antigravity: fully restored — sidecars, global skills, rules. Zero manual steps.
- Cursor: fully restored — it's just the repo, nothing else needed.
- Claude Code (CLI): rules restored (CLAUDE.md already correct via git).
- Claude Cowork/claude.ai: rules N/A (there's no local rules file for a
  cloud-hosted session — this repo's CLAUDE.md is read when the session is
  pointed at the repo, same as today). Skills: the diff report tells you
  what's stale; you push those by hand, once, the same way you always have.
  Memory: rebuilds itself over use — nothing to restore.

## 7. Open questions to resolve before implementation

1. **Cowork project memory** (`project_memory_read/write` in this very
   session) — I tried to check whether this has a plain-file form
   (`~/Library/Application Support/Claude/...`) reachable from a repo
   script. It doesn't, at least not from here: `device_bash` only sees the
   folder(s) you've explicitly connected to a session (`stockmarket`, in
   this one) plus its own scratch space — nothing else on the Mac,
   app-internal storage included, is reachable by design. So this isn't a
   "we didn't check" gap, it's that the check itself needs to happen from
   inside the real Claude desktop app's own filesystem access (if it has
   any), not from a Cowork session's sandboxed shell. Worth a five-minute
   manual look on your end (Activity Monitor → the app's data dir, or just
   asking in a Claude Code CLI session which runs unsandboxed) before we
   commit to "definitely can't sync this" in the shipped docs. If it turns
   out to be a real file, it's a small addition later, not a redesign.
2. **`.claude-skills-lock.json` hashing scope**: hash just `SKILL.md`, or
   the whole skill directory (so bundled assets like the `briefing_template.html`
   gotcha your own `save-skill-asset-sync-gotcha` memory documents don't
   silently drift out of the diff)? Recommend whole-directory hash, given
   that documented gotcha.
3. Should `--check` mode (no-op, exit-code-only) be wired into a pre-commit
   or CI step now, or left as a manually-invoked flag for later? Not
   strictly part of "the sync command" but it's the natural next step once
   the command exists, and cheap to add now if wanted.

## 8. Additional scope worth folding into the same effort (you asked what else should be part of this)

Ranked by how much they save you on a fresh machine, since that's the
stated trigger ("switching to some new computer"):

1. **`.env` bootstrap check** — `llm-platform:sync` could `diff .env.example .env`
   and print which required keys are missing, rather than you discovering a
   missing key mid-job-run days later. Cheap, high value, zero risk (read-only).
2. **MCP server config sync** — if you have local MCP servers configured
   (the `localMcpServers` your desktop app tracks), a new machine needs
   those reconfigured too; worth a `docs/`-documented manual checklist item
   at minimum, since — per the constraint in §2 — this is 100% Claude-desktop-
   app state, not something a repo script can write.
3. **`yarn dead-code:scan` already gets folded in** (AGENTS.md §9 already
   mandates running it alongside the Antigravity sync; the new orchestrator
   should just call it as a final phase so it's truly one command instead
   of two).
4. **A `--report-only` JSON output mode** — so a future "onboarding wizard"
   web page or Cowork skill could render "here's what's synced / stale /
   needs your action" instead of you reading terminal output. Low priority,
   but cheap to design for now (have the orchestrator build a structured
   result object internally either way, print it as human text by default,
   `--json` to dump it raw) rather than bolting it on later.
5. **Explicitly out of scope, flagging so it's a decision not an oversight**:
   syncing actual _data_ (`data/*.json`) between machines — that's already
   handled by the separate, existing `yarn data:sync` (Drive-backed), and
   conflating it with platform/skill sync would make one command do two
   unrelated things.

## 9. What I did NOT do

Per your "design doc first" choice, no repo file has been touched — this is
purely a plan for review. Once you confirm the shape (especially §7's open
questions), the implementation is mechanical: the Antigravity and rules
phases are lift-and-shift of existing, working code; the only genuinely new
logic is the small hash-diff script for Claude skills (~60-80 lines,
same shape as the existing `skills-lock.json` verification pattern).
