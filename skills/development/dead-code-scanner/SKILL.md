---
name: dead-code-scanner
description: Run static analysis and rigorously cross-validate the results to find and report truly unused files, dead exports, and unused dependencies in the project. Trigger this skill whenever the user asks to find dead code, clean up unused files, find unused dependencies, or look for dead files in the codebase.
---

# Dead Code Scanner

A skill that automates finding truly dead code, files, and dependencies in the stockmarket project by running `knip` static analysis and filtering false positives with a rigorous global text search (`git grep`). It also catches a related but distinct smell: downloads and generated artifacts (rendered reports, raw concall audio, scraped PDFs) that a skill run wrote to the wrong place instead of `data/` — see `docs/DATA_RULES.md` §1 — where they risk being committed by accident.

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

### 2. Run Cross-Validation Script

Because `knip` produces false positives for dynamic imports and CommonJS exports (like `module.exports` object properties), you must run the cross-validation script.

```bash
node scripts/verify_dead_code.js
```

_Note: Make sure the `verify_dead_code.js` script knows where your `knip` output txt files are located (by default it looks in the same directory or the scratch directory)._

### 3. Review the Output

The verification script generates a JSON file (e.g. `verified_dead_code.json`) containing three arrays:

- `unusedFiles`: True orphans with zero references anywhere.
- `unusedDependencies`: Dependencies confirmed as truly unused.
- `unusedExports`: Exported functions/variables that are not imported outside of their defining file.

Per the [output-dto-standard](../../tooling/output-dto-standard/SKILL.md), every entry in these
three arrays carries the record-level envelope (`companyId`, `creationTime`, `modifiedTime`,
`creator`). Note: this skill is about dead CODE, not companies — there is no ticker/company
concept here, so `companyId` is a deliberate semantic stretch of the field name, reused to hold
the record's own unique identifier (the file path, dependency name, or export name being
flagged), per the standard's guidance for non-company skills. `creator` is always
`"dead-code-scanner"`. Example entry: `{ "file": "src/utils/oldHelper.js", "companyId":
"src/utils/oldHelper.js", "creationTime": "2026-07-07T10:00:00.000Z", "modifiedTime":
"2026-07-07T10:00:00.000Z", "creator": "dead-code-scanner" }`.

### 4. Present Findings

Create a markdown report summarizing the findings — dead code AND stray artifacts from step 0 — and ask the user if they'd like you to proceed with removing/relocating them.

## Removal Guidelines

- **Files**: Use terminal `rm` commands to delete fully unused files.
- **Exports**: Use AST tools or custom Node.js regex scripts to safely strip out the `export` keyword or remove the item from `module.exports` without deleting the underlying utility if it's used internally in the same file.
- **Stray artifacts (from step 0)**: Never just `rm` a `[TRACKED]` hit — `git rm --cached` it first so it stops being committed, then either move it (rendered reports → `data/assets/misc/` or the producing skill's `data/assets/<skill>/`; raw downloads → `data/runs/` or delete) or leave it in place if it turns out to be intentional. Since `data/*` is gitignored wholesale, anything moved there automatically stops being tracked. If a directory keeps reproducing this problem (a skill's output-path resolution is falling back to `process.cwd()`), fix the skill's script to write into `data/` directly rather than relying on this scanner to clean up after every run.
