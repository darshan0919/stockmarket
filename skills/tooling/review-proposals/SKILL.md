---
name: review-proposals
description: Review pending upgrade proposals from the weekly Insight Review and apply the ones you approve. Use when Darshan says "review my proposals", "show pending proposals", "apply my review picks", "what upgrades are pending", or opens the Insight Review dashboard and wants to act on it.
---

# Review Proposals — tick to apply

Minimal-effort approval loop for the Insight Review & Upgrade cycle. The weekly
`weekly-insight-review-stockmarket` job only PROPOSES changes (it never edits code). This
skill runs INTERACTIVELY: Darshan ticks the proposals he approves and you APPLY them as file
changes. **You make the file edits; you do NOT `git add`/commit — leave changes staged in the
working tree for Darshan to review and commit himself.**

## Proposal format (what the review job writes to `data/_proposals/<date>-<slug>.md`)

```
---
id: prop_<slug>
status: pending            # pending | applied | rejected
target: <repo-relative path> | new-skill:<name> | scheduled-task:<id> | memory:<name>
changeType: edit | new-file | new-skill | scheduled-task | memory | dedup
sourceInsights: [note/report/prompt ids]
---
# <Title>
**Why:** <rationale, citing source insight ids>
**Change:** <exact — for `edit`: OLD block + NEW block; `new-file`/`new-skill`: full content;
             `scheduled-task`: taskId + cron + prompt; `memory`: file name + body>
**How to apply:** <deterministic steps>
```

## Steps

1. **Gather pending.** List `data/_proposals/*.md` with `status: pending`. Read each; summarise
   as a one-line title + target + why.
2. **Present as tick-boxes.** Use the AskUserQuestion tool with `multiSelect: true`, one option
   per pending proposal (label = short title, description = target + why + risk). Darshan ticks
   the ones to apply. Also offer nothing-selected = skip all.
3. **Apply each approved proposal** exactly as its `Change` block specifies:
   - `edit` → Edit the target file (old→new).
   - `new-file` / `new-skill` → Write the file(s); if a skill, also add its `registry.json`
     entry and run `node scripts/build/generate-registries.js`.
   - `scheduled-task` → create/update via the scheduled-tasks tool.
   - `memory` → write the memory file + `MEMORY.md` pointer.
   - `dedup`/data → apply via `db` helpers.
4. **Verify.** If code/skills changed, run `cd packages/jobs-runtime && npx jest` (or the
   relevant tests) and report green/red. Do not leave the tree broken.
5. **Mark outcome.** Set each proposal's frontmatter `status: applied` (or `rejected` for
   unticked ones Darshan explicitly rejects; leave the rest `pending`). Overwrite the file
   (never delete — sandbox forbids it).
6. **Do NOT commit.** Report: what was applied (files changed), test result, what remains
   pending. Remind Darshan the changes are uncommitted for his review.

## Guarantees
- Nothing is applied without Darshan's tick. Unattended jobs still only propose.
- You edit the working tree but never `git commit` — the human owns the commit.
- Applying twice is safe: an `applied` proposal is skipped; edits are idempotent where possible.
