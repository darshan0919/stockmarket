---
name: dead-code-scanner
description: Run static analysis and rigorously cross-validate the results to find and report truly unused files, dead exports, and unused dependencies in the project. Trigger this skill whenever the user asks to find dead code, clean up unused files, find unused dependencies, or look for dead files in the codebase.
---

# Dead Code Scanner

A skill that automates finding truly dead code, files, and dependencies in the stockmarket project by running `knip` static analysis and filtering false positives with a rigorous global text search (`git grep`).

## Core Blueprint

When the user wants to scan for dead code, perform the following steps:

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
*Note: Make sure the `verify_dead_code.js` script knows where your `knip` output txt files are located (by default it looks in the same directory or the scratch directory).*

### 3. Review the Output
The verification script generates a JSON file (e.g. `verified_dead_code.json`) containing three arrays:
- `unusedFiles`: True orphans with zero references anywhere.
- `unusedDependencies`: Dependencies confirmed as truly unused.
- `unusedExports`: Exported functions/variables that are not imported outside of their defining file.

### 4. Present Findings
Create a markdown report summarizing the findings and ask the user if they'd like you to proceed with removing the identified dead code.

## Removal Guidelines
- **Files**: Use terminal `rm` commands to delete fully unused files.
- **Exports**: Use AST tools or custom Node.js regex scripts to safely strip out the `export` keyword or remove the item from `module.exports` without deleting the underlying utility if it's used internally in the same file.
