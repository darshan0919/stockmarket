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
