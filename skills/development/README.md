# Development skills — planning, productivity, and code review

External skill packs imported 2026-09-24 from two sources the user asked to
wire in: [aihero.dev / Matt Pocock's skills](https://www.aihero.dev/skills)
([repo](https://github.com/mattpocock/skills)) and
[cursor/plugins' pstack skills](https://github.com/cursor/plugins/tree/main/pstack/skills)
(imported with a `ps-` prefix — see `ATTRIBUTION.md` in this folder for the
full license/exclusion notes and why the prefix exists).

These are **general software-engineering skills**, not equity-research
skills — they apply across the whole monorepo (`screener-api/`,
`screener-web/`, `stock-api/`, `packages/jobs-runtime/`, and `skills/`
authoring itself), not just to stock analysis. They do NOT touch `data/`,
Stockscans, or any of the equity-research conventions in
`skills/_shared/conventions.md` — that document still governs
`skills/equity-research/` and `skills/tooling/` work untouched.

**Router rule — when to reach for one of these:** before starting non-trivial
engineering work in this repo (planning a feature, writing a spec/tickets,
reviewing a diff or PR, debugging something hard, deciding on an
architecture/refactor, writing docs or a new skill, or resolving a merge
conflict), scan the section headers below for a match and open that skill's
`SKILL.md` before defaulting to ad hoc behavior. This applies to every AI
surface working in this repo — Claude Code, Claude Cowork, Cursor, and
Antigravity/Gemini — see `AGENTS.md` §13 for the wiring into each tool's
entry point.

Registry entries live in `skills/registry.json` (`"source": "external"`)
alongside the repo's own equity-research/tooling skills, so
`skills/_shared/resolve.sh` and the Antigravity sync
(`yarn antigravity:sync`) pick them up the same way.

### Planning & specs

Turn a fuzzy idea into a spec, tickets, or a settled design decision before code gets written.

- **`codebase-design`** — Shared vocabulary for designing deep modules. Use when the user wants to design or improve a module's interface, find deepening opportunities, decide where a seam goes, make code more testable or AI-navigable, or when...
- **`domain-modeling`** — Build and sharpen a project's domain model. Use when discussing codebase terminology, writing or editing a CONTEXT.md, or recording or editing an ADR.
- **`grill-me`** — A relentless interview to sharpen a plan or design.
- **`grill-with-docs`** — A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
- **`grilling`** — Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
- **`ps-architect`** — Sketch types, signatures, and module structure before code, then stay in the loop while implementation fills in. Use for /architect, 'architect this', 'design this', or non-trivial work where jumping to code would lock...
- **`ps-figure-it-out`** — Design an auditable playbook when no narrower one fits: a large migration, an ambitious multi-part change, or work a human reviews after stepping away. Scales rigor to the task, runs a hypothesis loop, and logs...
- **`to-questionnaire`** — Turn a decision you can't fully answer into a questionnaire for someone else to fill in.
- **`to-spec`** — Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed.
- **`to-tickets`** — Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker (edges as text in one file per ticket locally, or native...
- **`wayfinder`** — Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear.

### Implementation & debugging

Build and fix things test-first, trace bugs to root cause, and keep merges clean.

- **`diagnosing-bugs`** — Diagnosis loop for hard bugs and performance regressions. Use when the user says "diagnose"/"debug this", or reports something broken/throwing/failing/slow.
- **`implement`** — Implement a piece of work based on a spec or set of tickets.
- **`prototype`** — Build a throwaway prototype to answer a design question. Use when the user wants to sanity-check whether a state model or logic feels right, or explore what a UI should look like.
- **`ps-principle-boundary-discipline`** — Apply when wiring validation, error handling, or framework adapters. Concentrate guards at system boundaries (CLI, config, network, external APIs); trust internal types and keep business logic in pure functions.
- **`ps-principle-fix-root-causes`** — Apply when debugging. Trace each symptom to its root cause and fix it there; reproduce first, ask why until you reach it, resist nil-check guards that silence crashes.
- **`ps-principle-make-operations-idempotent`** — Apply when designing commands, lifecycle steps, or processing loops that run amid crashes, restarts, and retries. Converge to the same end state regardless of partial prior runs.
- **`ps-principle-model-the-domain`** — Apply when writing stateful logic, or when code branches a lot or repeats a shape assumption across files. Encode the domain in a structure instead of scattered conditionals.
- **`ps-principle-test-behavior-not-implementation`** — Apply when you write, change, or keep a test. Call the code the way its users do and assert the result they observe against a literal expected value. If the test would still pass when every imported function returns...
- **`ps-principle-type-system-discipline`** — Apply when designing types, reviewing a function signature, or writing code in any statically-typed language. Make illegal states unrepresentable, brand semantic primitives, parse external data at boundaries, refuse to...
- **`ps-tdd`** — Use only when the user explicitly asks for TDD, a failing test, or a regression test, OR when the bug has an obvious cheap local test target. Skip when the test path is unclear, expensive, integration-heavy, or not...
- **`resolving-merge-conflicts`** — Use when you need to resolve an in-progress git merge/rebase conflict.
- **`tdd`** — Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.

### Code review & quality

Review a diff or PR, find what it could break, and cut AI-generated slop before it ships — pairs naturally with this repo's own `yarn quality` sweep.

- **`code-review`** — Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating...
- **`improve-codebase-architecture`** — Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick.
- **`ps-blast-radius`** — Find what a change could break somewhere else before it ships, beyond the diff, and prove the one fact it's safe because of by running real code instead of writing it up. Use for 'blast radius of X', 'what could this...
- **`ps-interrogate`** — Use for "interrogate", "adversarial review", "multi-model review", "challenge this", "stress test this code", "find blind spots", or "tear this apart". Multiple LLM reviewers challenge changes from independent angles.
- **`ps-no-comments`** — Spawn Comment Sicko, fix accepted findings, and offer encodings for claimed constraints.
- **`ps-principle-encode-lessons-in-structure`** — Apply when you catch yourself writing the same instruction a second time, or notice a recurring correction. Encode the rule as a lint, metadata flag, runtime check, or script instead of more text.
- **`ps-principle-laziness-protocol`** — Apply when refactoring, evaluating diff size, or tempted to add abstractions, layers, or signal threading. Bias toward deletion and the smallest change that solves the problem.
- **`ps-principle-migrate-callers-then-delete-legacy-apis`** — Apply when introducing a new internal API while old callers still exist. Migrate callers and delete the old API in the same wave instead of preserving compatibility layers.
- **`ps-principle-minimize-reader-load`** — Apply when reviewing or shaping code that's hard to trace. Count layers between question and answer, and hidden state in the reader's head; collapse one-caller wrappers and shrink mutable scope.
- **`ps-principle-prove-it-works`** — Apply after completing a task, before declaring done. Verify against the real artifact (run the feature, read the actual value, inspect the diff), not a proxy, self-report, or 'it compiles.
- **`ps-principle-separate-before-serializing-shared-state`** — Apply when concurrent actors might write to the same file, branch, key, or state object. Eliminate the sharing first; serialize structurally only when one shared writer is a real invariant.
- **`ps-principle-sequence-verifiable-units`** — Apply to multi-step work (sweeps, migrations, runs of similar edits) and to how you stack commits and PRs. Break work into small units that each end in a verifiable state, check each before the next, and order delivery...
- **`ps-principle-subtract-before-you-add`** — Apply when sequencing an addition, refactor, or rewrite. Remove dead code, redundant validators, and stub references first, then build on the simpler base.
- **`ps-unslop`** — Cut AI tells from any writing. Must always apply.

### Architecture & design principles

One-concept reference cards for non-trivial design/architecture decisions and long-running agent work.

- **`ps-principle-attack-the-premise`** — Apply when two or more fixes that share one premise have failed the same gate. Take a census of which actors hold the imbalance before the next fix, then question the premise instead of writing another fix that assumes...
- **`ps-principle-build-the-lever`** — Apply to any non-trivial work, not just bulk work: edits, migrations, analyses, checks. Build the tool that does it or proves it (codemod, script, generator, or a skill your subagents follow) instead of working by hand....
- **`ps-principle-exhaust-the-design-space`** — Apply when facing a novel UI interaction or architectural decision with no precedent in the codebase. Build 2-3 competing prototypes and compare side by side before committing.
- **`ps-principle-experience-first`** — Apply when product, UX, or feature-scope tradeoffs come up. Choose user delight over implementation convenience; ship fewer polished features over more rough ones.
- **`ps-principle-foundational-thinking`** — Apply before writing logic: choosing core types and data structures, sequencing scaffold-vs-feature work, asking what concurrent actors share. Get the data structures right so downstream code becomes obvious.
- **`ps-principle-guard-the-context-window`** — Apply when context is filling up: large outputs, long files, repeated reads, fan-out planning. Route bulk to subagents; keep summaries in the main thread, not raw payloads.
- **`ps-principle-never-block-on-the-human`** — Apply when tempted to ask 'should I do X?' on reversible work. Proceed, present the result, let the human course-correct after the fact; reserve confirmation for irreversible actions.
- **`ps-principle-outcome-oriented-execution`** — Apply during planned rewrites and migrations with explicit phase boundaries. Converge on the target architecture; don't preserve smooth intermediate states with throwaway compatibility code.
- **`ps-principle-redesign-from-first-principles`** — Apply when integrating a new requirement into an existing design. Redesign as if the requirement had been a foundational assumption from day one, instead of bolting it on.

### Research, docs & knowledge capture

Investigate with citations, write things down for the next agent/session, and keep a reviewable trail on long or unattended work.

- **`git-guardrails-claude-code`** — Set up Claude Code hooks to block dangerous git commands (push, reset --hard, clean, branch -D, etc.) before they execute. Use when user wants to prevent destructive git operations, add git safety hooks, or block git...
- **`handoff`** — Compact the current conversation into a handoff document for another agent to pick up.
- **`ps-automate-me`** — Use for "automate me", "create/update/refresh my -mode skill", "turn/capture my preferences or working style into a skill", or wanting agents to follow how the user works. Drafts or revises a personal -mode skill via...
- **`ps-create-verification-skill`** — Generate a project-local verification skill that drives your app the way a user does — any language, framework, or platform. Use for /create-verification-skill, "make a control skill for this repo", or when a project...
- **`ps-how`** — Use for "how does X work", code walkthroughs before changing something, and placement / ownership / layering questions ("where should this live", "which package owns this", "is this the right layer"). Explains subsystem...
- **`ps-maintain-verification-skill`** — Periodic pass that keeps a project's verification skill and feature map honest: parallel source readers per feature, one live session driving every feature, at most one PR of proven corrections. Use for...
- **`ps-recall`** — Reconstruct your recent working context from your own chat history, live state, and the shared record (user reports, prior fixes, incidents), then hand back a tight current-state brief. Use for 'recall my work on X',...
- **`ps-reflect`** — Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
- **`ps-show-me-your-work`** — Keep a reviewable decision trail for long-running or unattended work: a TSV log with one row per decision (what, why, evidence, result). Local by default; commit it when a reviewer needs the trail to trust the result....
- **`ps-teach`** — Explain a body of work plainly so a person actually understands it. Runs the `how` and `why` skills and weaves what they find into one clear explanation. Use for 'teach me this', 'help me really understand X', 'explain...
- **`ps-technical-writing`** — Layered technical-writing standard: Diátaxis structure, Google developer style sentences, STE instruction rules, Global English syntax. Use for /technical-writing or when writing or reviewing docs, RFCs, readmes, PR...
- **`ps-why`** — Use for 'why does X work this way', 'why we picked Y', design rationale, regressions, postmortems, or data-backed thresholds. Discovers available MCPs and queries each evidence category (source control, issue tracker,...
- **`research`** — Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to...
- **`teach`** — Teach the user a new skill or concept, within this workspace.
- **`wait-what`** — Stop. That last message did not land: re-pitch it.
- **`wizard`** — Generate an interactive bash wizard that walks a human through steps only they can perform. Use when provisioning infrastructure, setting up credentials or CI secrets, walking an unfamiliar third-party dashboard, or...
- **`writing-for-agents`** — Writing documents for agents. Use when creating or editing skills, or modifying AGENTS.md or CLAUDE.md.

---

- Full list with generated aliases: `skills/registry.json` (`"source": "external"` entries).
- Attribution and license notes: `skills/development/ATTRIBUTION.md`.
