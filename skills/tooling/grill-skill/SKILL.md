---
name: grill-skill
description: >-
  Adversarially review, audit, and optimize an existing skill by applying the /grill-me relentless interview methodology to the skill's design. Conducts multi-round self-grilling across 6 core dimensions: true value & reasoning quality (orchestration vs reasoning), reusability, caching & avoiding rework, token reduction, skill-to-script migration (logic vs reasoning boundary), and offloading cloud LLM reasoning to cheap or local models. Produces concrete, actionable improvement RFCs and code/prompt diffs. Use whenever the user asks to "review a skill", "grill this skill", "audit skill X", "optimize skill Y", "improve skill quality", "reduce skill token usage", or runs /grill-skill.
---

# Grill Skill: Adversarial Architectural Review

A relentless, adversarial review system that stress-tests an existing skill's design. Its primary mandate is to **maximize the quality of analytical outputs** by isolating and elevating the **"true reasoning parts"**, while aggressively migrating deterministic logic to scripts, eliminating duplicate spend with multi-tier caching, and tiering models from cloud frontier down to local cheap models.

---

## 🏛️ The Core Philosophy: The Supreme Thinker Meta-Skill

> **/grill-skill is the ultimate thinker meta-skill. Quality, depth, and institutional rigor mean everything; execution cost is negligible.**

1. **Cost Asymmetry:**
   - **Runtime Skills** (daily scanners, filing digests, extraction workers) run hundreds of times per month; they must be lean, deterministic, cheap, and cached.
   - **/grill-skill** runs rarely, on high-leverage occasions when architecting or refining a skill. Spending frontier model reasoning, deep dialectic rounds, and extensive token budgets here yields compounding returns across all downstream executions.
2. **True Value Driver:**
   - The true output of `/grill-skill` is not cosmetic prompt editing. It comes from:
     - **Updated Knowledge Base Grounding:** Integrating newly indexed SOIC teachings (`ask-soic`), Dr. Anil Lamba Corporate Finance principles (`ask-expert`), and real company edge cases from our database (`db.reports` / `db.notes`).
     - **Advanced LLM Reasoning:** Leveraging frontier model intelligence to uncover subtle management evasions, accounting tricks, and thesis blindspots.
     - **Updated Human Conviction:** Elevating the human's clarity on the core investment questions the skill asks.
3. **Mechanics vs. Mind:**
   - Companion scripts and caching handle deterministic mechanics (math, regex, JSON validation, immutable filings).
   - The prompt and LLM attention budget are reserved entirely for **unconstrained, deep qualitative reasoning**.

---

## 🚨 The Non-Negotiable Criticality Rule

> **Never assume anything when it comes to identifying the importance of a reasoning task — ALWAYS stop and confirm with the user.**

1. **"How much a certain reasoning task is important?"**
   - The agent **MUST NEVER** decide or assume the criticality of a reasoning task on its own.
   - The user holds the domain conviction and investment thesis context. What looks like "just a summary" to an LLM might be the core signal determining position sizing, while a lengthy section might just be compliance context.
   - The skill **MUST STOP** during the review, present all discovered reasoning tasks, and ask the user to classify their criticality.
2. **"What kind of LLM model a certain reasoning task requires?"**
   - Once the user confirms the criticality, the agent **CAN and SHOULD** decide the model tier based on heuristics (combining the User's Criticality Rating $\times$ Analytical Ambiguity $\times$ Failure Cost).

---

## 🧠 The Living Thinking Ledger vs. Deterministic Idempotency

To prevent endless re-grilling churn while keeping qualitative reasoning open to continuous learning, `/grill-skill` splits state into two planes:

| Dimension                      | Deterministic Plane (Code, Math, Schemas, Invariants)                                           | Thinking Plane (Reasoning, Nuance, Domain Frameworks)                                          |
| :----------------------------- | :---------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| **Tracking Mechanism**         | Cryptographic Content Hash (`SHA-256`) & AST Invariant Checks.                                  | **Living Review Ledger** stored in `db.reports` (`type: 'skill-review'`).                      |
| **On Re-run (Unchanged Code)** | **Zero churn.** Static checks verify $<500$ lines, zero inline math, and passing tests in 50ms. | **Bayesian Prior.** Previous review feedback is loaded as the baseline starting thesis.        |
| **Handling Evolution**         | Re-verified only if source files change or unit tests fail.                                     | Re-evaluated against **newer KB transcripts, smarter models, or refined human understanding**. |
| **Rule on Prior Feedback**     | Strict compliance with monorepo rules.                                                          | **Never written in stone.** Treated as living prior context to elevate further during re-runs. |

---

## The 6 Core Grilling Dimensions

Every review evaluates the target skill along these 6 dimensions (detailed in [references/grilling-rubric.md](references/grilling-rubric.md)):

1. **True Value & Quality of Reasoning:**
   - What value is this skill truly providing? What specific questions does it answer?
   - How much is orchestration (procedural piping) vs. true intellectual reasoning?
   - Is output verifiable, cited, and institutional-grade, or generic prose?
2. **Reusability & Composability:**
   - Can extraction logic be reused across skills (`skills/_shared/`, `packages/jobs-runtime/lib/`, `stock-api/src/utils/`)?
   - Can this skill be composed cleanly into scheduled sidecars or multi-skill pipelines?
3. **Avoid Rework & Multi-Tier Caching:**
   - Is raw document text cached unconditionally (Tier 1)?
   - Are analytical insights scoped by an explicit `usecase` prefix (Tier 2)?
   - For recurring/windowed skills, is `windowCursor.js` used to eliminate reprocessing overlap?
   - Are short-circuit gates present so unchanged data exits in 50ms for ₹0?
4. **Reduce LLM Token Usage:**
   - Does `SKILL.md` follow progressive disclosure (< 500 lines)?
   - Are reference materials split into `references/` loaded only on demand?
   - Does candidate pre-filtering shrink 40-page documents to 4 paragraphs before the model sees them?
5. **Skill-to-Script Migration (Logic vs. Reasoning):**
   - Which calculations, thresholds, regexes, sorting, filtering, and JSON schema builds can move from prompt instructions to deterministic scripts?
   - Enforce Principle 17: _Extraction first (script), Analysis second (LLM)._
6. **Cloud LLM to Local / Cheap LLM Offloading:**
   - High-criticality tasks get frontier cloud models (Claude 3.5 Sonnet / Opus, Gemini Pro).
   - Routine tasks (categorization, boilerplate stripping, polarity scoring) get local models (Ollama Llama 3 8B, Qwen 2.5 7B) or cheap cloud models (Gemini Flash / Flash Lite).
7. **Domain Grounding & Knowledge Base Integration (SOIC, Anil Lamba, & DB Notes):**
   - **`ask-soic` & `ask-expert`:** Queries ~1,100 SOIC transcripts (Learnyst & YouTube) and Dr. Anil Lamba's corporate finance corpus via `search_soic.py` / `search_expert.py`.
   - **Database Notes & Reports (`packages/jobs-runtime/lib/db.js`):** Inspects historical company notes (`notes`) and existing reports (`reports`) to uncover edge cases, previous analytical oversights, and real company case studies.

---

## Execution Workflow

```
┌────────────────────────────────────────────────────────┐
│ Phase 1: Preparation, Prior Review & KB Grounding      │
│ 1. Run `grill-skill.js`: computes SHA-256 hash         │
│ 2. Load latest `skill-review` from DB (Prior Context)  │
│ 3. Retrieve KB: SOIC, Anil Lamba, DB Reports           │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 2: Round 1 — Pre-Human Exhaustive Review         │
│ (Holistic Diagnostic Probe of Baseline State)          │
│ • Griller vs Architect probe current skill             │
│ • Separate true reasoning from procedural piping       │
│ • Formulate deep domain dilemmas & options for user    │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 3: Mandatory Human Alignment Checkpoint          │
│ 🛑 STOP & ASK: Interactive UI prompt via ask_question  │
│ User classifies: Mission-Critical Alpha vs Context     │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 4: Round 2 — Post-Human Exhaustive Review        │
│ (Holistic Stress-Test of Target State)                 │
│ • Incorporate human conviction into proposed design    │
│ • Stress-test: Management evasion, accounting traps    │
│ • Verify reasoning rigor (no hollow prompts)           │
│ • Settle exact companion scripts, caching & diffs      │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 5: Implementation, Living Ledger Update & Sync   │
│ 1. Auto-implement deterministic companion scripts      │
│ 2. User confirms qualitative prompt diffs              │
│ 3. Save updated `skill-review` DTO to DB (Living Prior)│
│ 4. Run `yarn antigravity:sync` & quality sweep         │
└────────────────────────────────────────────────────────┘
```

---

### Phase 1: Preparation, Prior Review Retrieval & KB Grounding

1. **CLI Execution & Hash Computation:**
   Run the unified preparation CLI:

   ```bash
   node stock-api/bin/grill-skill.js <target-skill-name>
   ```

   The script automatically:
   - Computes the deterministic `contentHash` (`SHA-256` of `SKILL.md` + `references/`).
   - Retrieves the most recent `skill-review` report from `packages/jobs-runtime/lib/db.js` (`reports`), loading settled decisions and prior thinking rationales.
   - Runs static inspection ([inspect-skill.js](file:///Users/darshanpatel/code/stockmarket/scripts/inspect-skill.js)) for line count, script candidates, and caching.
   - Queries `ask-soic` (`search_soic.py`), `ask-expert` (`search_expert.py`), and historical DB reports for relevant market teachings and failure edge cases.

2. **Re-Run Evaluation Check:**
   - If `hashMatched === true` AND static invariants pass:
     - Check whether new KB lessons, historical company notes, or advanced model capabilities justify re-evaluating the thinking parts.
     - If no new domain insights or conceptual leaps are available, exit early with a clean bill of health:
       > _"✅ Skill `<name>` was audited on `<date>` (hash `<hash>`). All 6 rubric invariants satisfied. Zero drift detected."_
     - If new domain insights exist, proceed to Round 1 using the prior review as starting context, focusing exclusively on the elevated reasoning frontier.

---

### Phase 2: Round 1 — Pre-Human Exhaustive Review (Holistic Baseline Probe)

Before halting to ask the user, the AI conducts an unsparing, holistic baseline audit embodying two personas:

- 🥊 **The Griller (Adversarial Buy-Side Inquisitor):** Armed with SOIC citations, Dr. Anil Lamba rules, and past DB company reports, the Griller probes why the LLM is doing arithmetic, challenges naive assumptions, and spots gaps in real-world corporate governance detection.
- 🛡️ **The Skill Architect (Defender):** Deeply knowledgeable about the monorepo, defends core analytical logic, concessions deterministic script candidates, and drafts modular seams.

#### Core Probes in Round 1:

1. **The Three Questions Test:** Exactly what 2–3 questions does the user want answered when invoking this skill? Does it answer them with quantified conviction, or drown the user in boilerplate?
2. **True Reasoning vs. Procedural Choreography:** Where does true qualitative judgment happen (e.g. concall evasion, walk-the-talk track record, J-curve catalysts)? What is deterministic arithmetic/regex disguised as reasoning?
3. **Domain Grounding:** Cross-reference against SOIC and Dr. Anil Lamba teachings. Why does the current prompt not enforce specific red-flag checks taught by the experts?
4. **Formulate Grounded User Dilemmas:** Instead of a generic list of task names, construct domain-grounded dilemmas:
   - _"Task X evaluates Capex commercialization. Dr. Anil Lamba teaches that capitalized interest without revenue ramp-up is a liquidity trap. Is catching this specific nuance **Mission-Critical Alpha** for your position sizing, or secondary background?"_

---

### Phase 3: Mandatory Human Alignment Checkpoint

Before proceeding to architectural diffs, **you MUST halt and ask the user**.

> 💡 **Interactive UI Mode (Mandatory when available):**
> Use Antigravity's `ask_question` tool with single-select options for each discovered reasoning task:
>
> - **Mission-Critical Alpha:** Core to investment thesis, signal conviction, or risk detection (Frontier models + verification).
> - **Valuable Context:** Helpful background or secondary color (Balanced models).
> - **Routine / Commodity:** Standard summary, boilerplate extraction, or categorization (Local/cheap models or scripts).
>
> If interactive UI tools are unavailable, render the structured checkpoint below:

```markdown
🛑 **Reasoning Criticality Checkpoint (/grill-skill)**

I have completed Round 1 (Pre-Human Holistic Probe) for `<skill-name>` and identified the following candidate reasoning tasks:

1. **[Task Name 1]**: [Summary & context from prompt]
   - _Domain Context:_ [SOIC / Dr. Anil Lamba relevance]
2. **[Task Name 2]**: [Summary & context from prompt]
   - _Domain Context:_ [SOIC / Dr. Anil Lamba relevance]

👉 **Please tell me for each task:**

- **Mission-Critical Alpha:** Core to investment thesis, signal conviction, or risk detection.
- **Valuable Context:** Helpful background or secondary color.
- **Routine / Commodity:** Standard summary, boilerplate extraction, or categorization.
```

_Wait for the user's response before proceeding._

---

### Phase 4: Round 2 — Post-Human Exhaustive Review (Target State Stress-Test)

Once human conviction is incorporated, execute the second holistic review. This round evaluates the **entire proposed target state** end-to-end:

1. **The Reasoning Rigor & Depth Test:**
   - Does stripping deterministic arithmetic leave the prompt truly deeper and institutional-grade, or did it leave it hollow?
   - Ensure the frontier model is provided rich, unpolluted domain instructions, verified quotation rules, and cross-quarter consistency checks.
2. **Adversarial Real-World Stress-Testing:**
   - Challenge how the refactored target state handles real management tricks:
     - _Promoter dodging:_ Deflecting analyst questions to order book while margins compress.
     - _Working capital rot:_ Revenue growing while debtor days surge past 120 days.
     - _Circular guidance:_ Shifting milestones from FY26 to FY27 without explanation.
3. **FinOps & Operational Architecture:**
   - Model Tiering Matrix: Assign model tiers based on User Criticality $\times$ Analytical Ambiguity.
   - Two-Tier Caching: Tier 1 raw document text cached unconditionally; Tier 2 insights scoped by `usecase`.
   - Progressive Disclosure: Verify target `SKILL.md` remains $< 500$ lines, moving specialized patterns into `references/`.
4. **Finalized Seams & Specifications:**
   - Exact companion script paths (`stock-api/src/analyzers/`, `packages/jobs-runtime/lib/`).
   - JSDoc typed input/output signatures.
   - Comprehensive unit test specifications for all migrated scripts.

---

### Phase 5: Implementation, Living Ledger Update & Sync

1. **Automatic Implementation of Script Migrations:**
   - Automatically implement all accepted deterministic Script Migrations directly without blocking for human confirmation.
   - Add companion scripts to dedicated monorepo locations:
     - Domain analyzers: `stock-api/src/analyzers/` or `stock-api/src/utils/`.
     - Data jobs & extractors: `packages/jobs-runtime/lib/`.
     - CLI entry points: `stock-api/bin/<skill-name>.js` (exposed in `package.json` per Workspace Facade Pattern).
   - Write comprehensive Jest unit tests and verify they pass (`yarn workspace @stock/api test` or `yarn test`).

2. **Interactive Confirmation for Qualitative & Prompt Diffs:**
   - For changes to reasoning prompts, analytical frameworks, or model tiering assignments:
   - Prompt the user using `ask_question` to individually confirm each proposal.
   - Apply confirmed diffs to `SKILL.md` and related references.

3. **Render Full Insight Report & Markdown Artifact:**
   - Render the complete adversarial dialogue transcript and synthesized blueprint to the user.
   - Write the full report as a persistent artifact: `<appDataDir>/brain/<conversation-id>/<skill-name>-grill-report.md`.

4. **Persist Living Thinking Ledger to DB (`db.reports`):**
   Save the review record via `db.saveReport(dto)` so all audit decisions and qualitative rationales become the starting baseline for future runs:

   ```javascript
   db.saveReport({
     type: 'skill-review',
     targetSkill: '<name>',
     contentHash: '<sha256>',
     status: 'SETTLED',
     invariantsAudit: {
       lineCount: 320,
       scriptCandidatesRemaining: 0,
       cachingConfigured: true,
     },
     settledDecisions: {
       criticalityClassifications: [...],
       scriptMigrations: [...],
       qualitativeProposals: [...],
     },
     thinkingRationale: {
       coreQuestionsAnswered: [...],
       domainFrameworksIntegrated: ['SOIC J-Curve', 'Lamba Operating Leverage'],
       openFrontiersForFuture: [...],
     },
     creator: 'grill-skill',
     modelUsed: '...',
     creationTime: new Date().toISOString(),
   });
   ```

5. **Synchronization & Pre-Submit Sweep:**
   - Run `yarn antigravity:sync` to mirror updated skills.
   - Run `yarn dead-code:scan` and `yarn format` to ensure clean repo state.

---

## Standing Conventions Check

Before declaring a review complete, verify compliance with monorepo standards:

- [x] **Extraction First (Principle 17):** Deterministic logic lives in `stock-api/` or `packages/jobs-runtime/`.
- [x] **Env Resolution (Rule 2):** Any companion script reading `process.env` calls `loadEnv()`.
- [x] **Data Persistence (DATA_RULES.md):** Writes route through `packages/jobs-runtime/lib/db.js`.
- [x] **Attribution (Rule 21):** `sourceSkill` is explicitly passed on all `add-note` calls.
- [x] **Envelope Integrity (Rule 22):** No rogue `createdAt` fields competing with `creationTime`.
- [x] **Synchronization:** Synced via `yarn antigravity:sync`.
- [x] **Rule 11:** Final response includes an evidence-based token-optimization suggestion.
