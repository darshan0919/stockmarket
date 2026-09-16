---
name: dead-code-scanner
description: Run static analysis and rigorously cross-validate the results to find and report truly unused files, dead exports, dead local variables/constants, and unused dependencies in the project. Trigger this skill whenever the user asks to find dead code, clean up unused files, find unused dependencies, or look for dead files in the codebase.
---

# Dead Code Scanner

A skill that automates finding truly dead code, files, and dependencies in the stockmarket project by running `knip` static analysis, an ESLint `no-unused-vars` pass, and filtering false positives with a rigorous global text search (`git grep`). It also catches a related but distinct smell: downloads and generated artifacts (rendered reports, raw concall audio, scraped PDFs) that a skill run wrote to the wrong place instead of `data/` — see `docs/DATA_RULES.md` §1 — where they risk being committed by accident.

**Why both knip AND ESLint are required, not just one.** `knip` operates entirely at the module boundary — files, exports, package dependencies, unresolved imports. It has no visibility into a variable that's declared and dead _within_ a file but never exported: that class of dead code is invisible to knip by design, not a knip bug. Caught live on 2026-09-16: `stockscansAnnouncementScansPage.js` had seven `const` URL strings (`ANNOUNCEMENT_SCAN_URL` and siblings) — each referenced exactly once, on its own declaration line, real leftovers from before the file was refactored to route calls through `@stock/api`'s `StockscansClient` — that a knip-only scan reported as completely clean. ESLint's `no-unused-vars` rule catches exactly this, and the repo's `.eslintrc.js` already has it configured — it just wasn't part of this skill's workflow. Skipping this step silently narrows "dead code" to "dead exports," which is a materially smaller claim than what the skill's name promises.

## Core Blueprint

When the user wants to scan for dead code, perform the following steps:

### 0. Scan for Stray Downloads/Artifacts

Run the companion detector before or alongside the knip pass — it's a much cheaper check and often surfaces the more urgent problem (large binaries or one-off reports already committed to git):

```bash
node scripts/find_stray_artifacts.js
```

This walks the repo (skipping `node_modules`, `.git`, and `data/` — `data/` is where these files are _supposed_ to live, per `docs/DATA_RULES.md`) looking for two things:

- Files with artifact extensions (`.pdf`, `.docx`, `.pptx`, `.xlsx`, `.mp3`, `.mp4`, `.webm`, `.wav`, `.zip`, ...) anywhere outside `data/`.
- Files at the repo root, or matching a known skill-report naming convention (e.g. `TICKER_FilingsDiff.html`, `Company_DRHP_Analysis.md`), that aren't on a small allowlist of legitimate root docs.

Each finding is tagged `[TRACKED — was committed]` or `[untracked]` and classified into a DATA*RULES bucket (`assets` for rendered reports, `runs-or-delete` for raw/regenerable downloads) with a concrete `mv`/`git rm --cached` fix. Full output also lands in `data/runs/stray_artifacts*<date>.json` for auditing.

Treat every `[TRACKED]` hit as higher priority than ordinary dead code — it means a binary or one-off report is sitting in git history, not just the working tree. For those, run the suggested `git rm --cached` first, then move the file per its `suggestedAction`, then extend `.gitignore` if the location is likely to recur (see the "Stray generated artifacts" block already in `.gitignore` for the pattern to follow).

### 1. Run Static Analysis (Knip)

The project uses `knip` to generate candidates for dead code. Because the project is a monorepo, it's best to run `knip` in the individual workspaces (`screener-api`, `screener-web`, `jobs`) to get comprehensive candidate lists.

```bash
# Example
npx knip > /tmp/screener-api-knip.txt
```

Knip's scope stops at files/exports/dependencies — it will not find a dead local `const`/`let`/`var`. That is Step 1b's job, not an extension of this one.

### 1b. Run ESLint for Dead Local Bindings (MANDATORY, not optional)

```bash
npx eslint . --ext .js,.jsx --rule '{"no-unused-vars":"error"}' --no-inline-config -f json > /tmp/eslint-unused-vars.json
```

`-f json` is required — `verify_dead_code.js` parses this file and the default stylish/text format
is not a stable parse target. `--rule`/`--no-inline-config` forces the check to `error` severity
and ignores any file-level `/* eslint-disable */` for this run, regardless of the repo's own
`.eslintrc.js` setting (which runs `no-unused-vars` at `'warn'` — see the note in Step 3 on why
that matters and why this skill does not depend on it). This is a real, always-on finding category
for this skill, not a
best-effort extra: a dead local binding is exactly as much "dead code" as a dead file or a dead
export, and skipping this step is how the class of bug this file's header describes gets missed.

Scope this to the same workspaces knip covers. A local binding referenced only inside its own
declaration is the same shape of miss knip cannot see by construction — most often a leftover raw
API URL/constant/config value from before a file was refactored to route through a shared client
or config module (exactly the pattern found in `stockscansAnnouncementScansPage.js` — seven URL
constants dead since a `@stock/api` `StockscansClient` migration; the sibling file
`stockscansAnnouncementScan.js` had the identical smell — `STOCKSCANS_ANNOUNCEMENTS_SCAN_URL`
plus a dead `parseCompanyIdInput` function — found the same day once this step existed), so weight
findings in files that recently gained a new shared-client/import accordingly.

### 2. Run Cross-Validation Script

Because `knip` produces false positives for dynamic imports and CommonJS exports (like `module.exports` object properties), you must run the cross-validation script.

```bash
node scripts/verify_dead_code.js
```

_Note: Make sure the `verify_dead_code.js` script knows where your `knip` output txt files **and**
your `eslint-unused-vars.txt` file are located (by default it looks in the same directory or the
scratch directory)._

### 3. Review the Output

The verification script generates a JSON file (e.g. `verified_dead_code.json`) containing four arrays:

- `unusedFiles`: True orphans with zero references anywhere.
- `unusedDependencies`: Dependencies confirmed as truly unused.
- `unusedExports`: Exported functions/variables that are not imported outside of their defining file.
- `unusedLocalBindings`: Local `const`/`let`/`var` declarations ESLint's `no-unused-vars` flagged —
  dead _within_ a file, never exported, therefore invisible to knip's import-graph model. Kept as
  its own array rather than folded into `unusedExports` because the two are structurally different
  findings (module-graph vs. single-file scope) with different fixes (delete the export vs. delete
  the whole declaration).

A note on severity, so this doesn't get quietly skipped: `.eslintrc.js` runs `no-unused-vars` at
`'warn'`, so `yarn lint` reports these without ever failing the command — that muted severity is
part of why the seven-constant miss this skill's header describes went unnoticed. **Do not treat
`warn`-level `yarn lint` output as "nothing to report."** This skill's own Step 1b run forces
`error` severity specifically so its findings are never silently absorbed into a non-failing
`yarn lint` pass. There are 117 pre-existing `no-unused-vars` violations across 57 files repo-wide
as of 2026-09-16 (found running Step 1b for the first time) — report new findings against that
known baseline rather than treating every run as starting from zero, and don't recommend flipping
the repo's own `.eslintrc.js` severity to `error` as a fix for a single finding; that's a separate,
deliberate cleanup decision given the backlog size, not something this skill should trigger as a
side effect.

Per the [output-dto-standard](../../tooling/output-dto-standard/SKILL.md), every entry in these
four arrays carries the record-level envelope (`companyId`, `creationTime`, `modifiedTime`,
`creator`). Note: this skill is about dead CODE, not companies — there is no ticker/company
concept here, so `companyId` is a deliberate semantic stretch of the field name, reused to hold
the record's own unique identifier (the file path, dependency name, export name, or
`file:line:bindingName` for local bindings, being flagged), per the standard's guidance for
non-company skills. `creator` is always `"dead-code-scanner"`. Example entries:
`{ "file": "src/utils/oldHelper.js", "companyId": "src/utils/oldHelper.js", "creationTime":
"2026-07-07T10:00:00.000Z", "modifiedTime": "2026-07-07T10:00:00.000Z", "creator":
"dead-code-scanner" }`,
`{ "binding": "ANNOUNCEMENT_SCAN_URL", "file": "screener-api/src/features/announcements/stockscansAnnouncementScansPage.js", "line": 17, "companyId": "screener-api/src/features/announcements/stockscansAnnouncementScansPage.js:17:ANNOUNCEMENT_SCAN_URL", "creationTime": "2026-09-16T00:00:00.000Z", "modifiedTime": "2026-09-16T00:00:00.000Z", "creator": "dead-code-scanner" }`.

### 4. Present Findings

Create a markdown report summarizing the findings — dead code AND stray artifacts from step 0 — and ask the user if they'd like you to proceed with removing/relocating them.

## Removal Guidelines

- **Files**: Use terminal `rm` commands to delete fully unused files.
- **Exports**: Use AST tools or custom Node.js regex scripts to safely strip out the `export` keyword or remove the item from `module.exports` without deleting the underlying utility if it's used internally in the same file.
- **Local bindings**: Delete the whole declaration (not just an `export` keyword — there isn't one). Before deleting, check whether the binding was itself derived from another local (e.g. `const A = f(B)` where only `A` is dead) — deleting `A` can leave `B` newly dead too; re-run Step 1b rather than assuming one pass catches a chain.
- **Stray artifacts (from step 0)**: Never just `rm` a `[TRACKED]` hit — `git rm --cached` it first so it stops being committed, then either move it (rendered reports → `data/assets/misc/` or the producing skill's `data/assets/<skill>/`; raw downloads → `data/runs/` or delete) or leave it in place if it turns out to be intentional. Since `data/*` is gitignored wholesale, anything moved there automatically stops being tracked. If a directory keeps reproducing this problem (a skill's output-path resolution is falling back to `process.cwd()`), fix the skill's script to write into `data/` directly rather than relying on this scanner to clean up after every run.
