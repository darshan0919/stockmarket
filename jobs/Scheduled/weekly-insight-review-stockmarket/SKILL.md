---
name: weekly-insight-review-stockmarket
description: Insight Review & Upgrade — weekly: turn accumulated insights into proposals + keep the DB lean
---

You are running the weekly Insight Review & Upgrade cycle for Darshan's stockmarket project (stockmarket monorepo). Purpose: close the loop so accumulated insights become concrete upgrades instead of unused, ever-growing data — AND keep each review small enough to comprehend. Read docs/CONVERSATION_CAPTURE_PLAN.md (§6a, §7-review) and skills/tooling/review-proposals/SKILL.md first. "DB" = Google Drive via packages/jobs-runtime/lib/db.js.

GOVERNANCE (critical, unattended job): You may AUTO-APPLY only DB data-hygiene (git-ignored data/ collections). You must NEVER create/edit/delete any git-committed file — nothing under skills/, scripts/, packages/_/lib, docs/, jobs/, registry_.json, tests — and never git add/commit. Every change to code/skills/scheduled-tasks/memory is a PROPOSAL only. Darshan applies approved proposals later via the review-proposals skill (he ticks, Claude edits files, no commit).

Steps:

1. Bounded delta: run `node packages/jobs-runtime/scripts/reviewInsights.js` and read the JSON packet (delta since last review + signals). Review ONLY this delta.
2. AUTO-APPLY safe data-hygiene (data only, keep raw — never hard-delete): merge near-duplicate prompts (signals.promptClusters) via db.savePrompts; consolidate heavy companies (signals.heavyCompanies >8 notes) into ONE type:"rollup" note per company (faithful synthesis of that company's chat-insight notes, dated) so buildCompanyContext stays lean, leaving raw notes in place. No fabrication.
3. ## SYNTHESISE PROPOSALS — one file each at data/\_proposals/<YYYY-MM-DD>-<slug>.md, in this EXACT apply-ready format so they can later be ticked-and-applied deterministically:
   id: prop\_<slug>
   status: pending
   target: <repo-relative path> | new-skill:<name> | scheduled-task:<id> | memory:<name>
   changeType: edit | new-file | new-skill | scheduled-task | memory
   sourceInsights: [ids]
   modelUsed: <the exact model executing this run, e.g. claude-sonnet-5 — every proposal
   here is LLM synthesis, per skills/tooling/output-dto-standard/SKILL.md>
   ***
   # <Title>
   **Why:** <rationale citing source insight ids>
   **Change:** <exact — for edit: the OLD text block + the NEW text block; for new-file/new-skill: full file content; for scheduled-task: taskId+cron+prompt; for memory: file name + body>
   **How to apply:** <deterministic steps>
   Map proposals to the six targets: PROMPTS/QUESTIONS (recurring intent/cluster → new skill), SKILLS (framework note → new skill or improvement), CODEBASE/SCRIPTS (bug/friction/data-quality → fix diff), TASKS (recurring manual ask → new/changed scheduled task), MEMORY (repeated correction/preference → memory add/update), RESEARCH (insight clustering → watchlist/thesis action or themed digest). Each must be concrete enough to apply without re-deriving.
4. Digest at data/\_reviews/<YYYY-MM-DD>.md: counts reviewed, hygiene applied, each proposal (title + one line), top 3 themes. ~one page.
5. Refresh the live dashboard: update_artifact id "stockmarket-insight-review-dashboard" (create_artifact if absent) with current numbers — insight counts by collection, PENDING proposals (data/\_proposals with status: pending, as a tick-list preview), last review date, heavy companies, top prompt intents. Also mirror the HTML to data/\_reviews/dashboard.html.
6. Advance ledger: `node packages/jobs-runtime/scripts/reviewInsights.js --commit`. Then `node packages/jobs-runtime/scripts/rebuildLinks.js` and `node packages/jobs-runtime/scripts/data.js push`.
7. Report: delta reviewed, hygiene applied, proposals raised (titles + paths), digest path, dashboard updated. State clearly that proposals await Darshan's tick-to-apply (review-proposals skill) — you applied NO code/skill/task/memory change.

If the delta is empty, do light hygiene only and report "nothing new to review". Research aid, not investment advice.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name weekly-insight-review-stockmarket --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`.

## Email delivery (mandatory last step of EVERY run)

The owner reads job output in Gmail, so this job must always end with an email — success, partial or failure, even when there was nothing new (a one-line "nothing to do" email is the heartbeat that proves the job ran).

1. Write the report text — the step-7 report: delta reviewed, proposals raised (titles + paths), top 3 themes — the same content as the `data/_reviews/<date>.md` digest — as markdown to a temp file _outside the repo_ (`f=$(mktemp)`). Keep it to what matters, lead with the headline.
2. Execute script (bash): `STOCKMARKET_JOB_NAME=weekly-insight-review-stockmarket yarn job-report-email --job weekly-insight-review-stockmarket --status <ok|partial|failed> --title "<one-line outcome>" --body-file "$f"` `--attach data/_reviews/<YYYY-MM-DD>.md`.
3. If the run stopped early (a dependency check failed, a script exited non-zero), still run step 2 with `--status failed` and the exact error as the body.
4. If the command exits non-zero (`email.status` is `skipped` or `error`, e.g. `GOOGLE_APP_PASSWORD not set`), surface the exact reason in your final report — never report the job as delivered.
