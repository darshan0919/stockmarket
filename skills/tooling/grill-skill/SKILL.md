---
name: grill-skill
description: >-
  Adversarially review, audit, and optimize an existing skill by applying the /grill-me relentless interview methodology to the skill's design. Conducts multi-round self-grilling across 6 core dimensions: true value & reasoning quality (orchestration vs reasoning), reusability, caching & avoiding rework, token reduction, skill-to-script migration (logic vs reasoning boundary), and offloading cloud LLM reasoning to cheap or local models. Produces concrete, actionable improvement RFCs and code/prompt diffs. Use whenever the user asks to "review a skill", "grill this skill", "audit skill X", "optimize skill Y", "improve skill quality", "reduce skill token usage", or runs /grill-skill.
---

# Grill Skill: Adversarial Architectural Review

A relentless, self-grilling review system that stress-tests an existing skill's design. Its primary mandate is to **maximize the quality of analytical outputs** by isolating and elevating the **"true reasoning parts"**, while aggressively migrating deterministic logic to scripts, eliminating duplicate spend with multi-tier caching, and tiering models from cloud frontier down to local cheap models.

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

## The Primary vs. Secondary Goal

| Objective                           | Priority                      | Philosophy & Execution                                                                                                                                                                                                                                         |
| :---------------------------------- | :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Output Quality & True Reasoning** | **PRIMARY**                   | Elevate institutional rigor, demand page-anchored evidence, zero hallucinations, deep qualitative synthesis (e.g. Q&A evasion detection, promoter walk-the-talk, EPS accretion catalysts). Give the frontier model unpolluted context so it can reason deeply. |
| **Cost Cutting & FinOps**           | **SECONDARY (Yet Essential)** | Move deterministic arithmetic, regex, sorting, and schema builds into companion scripts (Principle 17). Cache immutable documents/filings. Route verified routine tasks to cheap/local models. **Cost cutting must never compromise analytical depth.**        |

---

## The 6 Core Grilling Dimensions

Every review evaluates the target skill along these 6 dimensions (detailed in [references/grilling-rubric.md](references/grilling-rubric.md)):

1. **True Value & Quality of Reasoning:**
   - What value is this skill truly providing? What specific questions does it answer?
   - How much is orchestration (procedural piping) vs. true intellectual reasoning?
   - Is output verifiable, cited, and institutional-grade, or generic prose?
2. **Reusability & Composability:**
   - Can extraction logic be reused across skills (e.g. `skills/_shared/`, `packages/jobs-runtime/lib/`, `stock-api/src/utils/`)?
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
   - The Griller is not an abstract code reviewer; it is an institutional buy-side inquisitor.
   - It actively leverages our repository's Knowledge Base:
     - **`ask-soic` & `ask-expert`:** Queries ~1,100 SOIC transcripts (Learnyst & YouTube) and Dr. Anil Lamba's corporate finance corpus via `search_soic.py` / `search_expert.py` to challenge analytical depth against real market teachings (guidance sandbagging vs overpromising, operating leverage thresholds, working capital traps, J-curve catalysts).
     - **Database Notes & Reports (`packages/jobs-runtime/lib/db.js`):** Inspects historical company notes (`notes`) and existing reports (`reports`) to uncover edge cases, previous analytical oversights, and real company case studies.

---

## Execution Workflow

```
┌────────────────────────────────────────────────────────┐
│ Phase 1: Static Inspection & Knowledge Base Grounding  │
│ 1. Run `inspect-skill.js` to extract metrics/tasks     │
│ 2. Query `ask-soic` / `ask-expert` for domain models   │
│ 3. Sample DB `reports` and `notes` for real edge cases │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 2: Mandatory Human Criticality Checkpoint        │
│ 🛑 STOP & ASK: Interactive option prompt for user      │
│ User classifies: Mission-Critical Alpha vs Context     │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 3: The Knowledge-Grounded Dialectic              │
│ The Griller (armed with SOIC/Lamba/DB) vs Architect    │
│ Round 1: Core Value, Quality & Script Migration        │
│ Round 2: Model Tiering, Caching & Token Reduction      │
│ Round 3: Convergence & Settled Architecture            │
└──────────────────────────┬─────────────────────────────┘
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 4: Synthesized Improvement RFC & Action Plan     │
│ Actionable Blueprint: Code diffs, Script specs, Evals  │
└────────────────────────────────────────────────────────┘
```

---

### Phase 1: Static Inspection & Knowledge Base Grounding

1. **Static Inspection:** Run the companion inspector script:

   ```bash
   node skills/tooling/grill-skill/scripts/inspect-skill.js <target-skill-name>
   ```

   The script extracts size, progressive disclosure, deterministic logic candidates, caching audit, and candidate reasoning tasks.

2. **Domain Grounding & Knowledge Base Retrieval:**
   Before forming challenges, the Griller queries the repository's Knowledge Base for domain context:
   - **SOIC & Expert Teachings:**
     ```bash
     python3 skills/tooling/ask-soic/scripts/search_soic.py --query "<skill topic / core concepts>" --data-root data --top 6
     ```
     _(or `python3 skills/tooling/ask-expert/scripts/search_expert.py --query "<skill topic>" --expert auto --data-root data --top 6`)_
   - **Historical DB Reports & Notes:**
     Query `packages/jobs-runtime/lib/db.js` (`db.find('reports', {type: ...})`, `db.find('notes', ...)`) to inspect how real companies performed on these dimensions historically, identifying past analytical blindspots, common management tricks, or edge-case failures.

Read the target skill's `SKILL.md`, references, companion scripts, and retrieved domain lessons thoroughly.

---

### Phase 2: Mandatory Human Criticality Checkpoint

Before proceeding to architectural recommendations, **you MUST halt and ask the user**.

> 💡 **Interactive UI Mode (Mandatory when available):**
> If operating in an environment with interactive UI tools (such as Antigravity's `ask_question`), **DO NOT** output a raw text list expecting the user to type answers. You **MUST** trigger an interactive prompt with single-select options for each discovered reasoning task:
>
> - **Mission-Critical Alpha:** Core to investment thesis, signal conviction, or risk detection (Frontier models + verification).
> - **Valuable Context:** Helpful background or secondary color (Balanced models).
> - **Routine / Commodity:** Standard summary, boilerplate extraction, or categorization (Local/cheap models or scripts).
>
> If interactive UI tools are not supported in the active runtime, fall back to the markdown checkpoint below:

```markdown
🛑 **Reasoning Criticality Checkpoint (/grill-skill)**

I have inspected `<skill-name>` and identified the following candidate reasoning tasks:

1. **[Task Name 1]**: [Summary & context from prompt]
2. **[Task Name 2]**: [Summary & context from prompt]
3. **[Task Name 3]**: [Summary & context from prompt]

Per the core protocol, I will not assume the business/investment importance of any reasoning task.
👉 **Please tell me for each task:**

- **Mission-Critical Alpha:** Core to investment thesis, signal conviction, or risk detection. (Must receive maximum frontier reasoning and verification).
- **Valuable Context:** Helpful background or secondary color. (Can use balanced cloud models).
- **Routine / Commodity:** Standard summary, boilerplate extraction, or categorization. (Candidate for cheap/local models or scripts).
```

_Wait for the user's response before proceeding._

---

### Phase 3: The Knowledge-Grounded Dialectic (Challenger vs Defender)

Once the user confirms the criticality ratings, execute the self-grilling dialectic. The AI embodies two distinct personas:

- 🥊 **The Griller (Adversarial Buy-Side Inquisitor):** Skeptical, quality-obsessed, domain-grounded purist. Armed with specific **SOIC lesson citations**, **Dr. Anil Lamba corporate finance rules**, and **real historical company reports from our DB**, the Griller probes why the LLM is calculating numbers instead of a script, exposes naive assumptions, and challenges how the skill handles real-world management tricks and financial traps.
- 🛡️ **The Skill Architect (Defender):** Deeply knowledgeable about the stockmarket codebase and data layer. Defends the mission-critical reasoning confirmed by the user, concedes deterministic script candidates, and proposes exact refactoring seams.

#### Round 1: Core Value, Quality & Script Migration

- **Q1 — Domain Value & Quality Elevation (Grounded in SOIC / Lamba / DB):**
  How do we make the user-confirmed Mission-Critical tasks institutional-grade? The Griller must challenge the Architect using retrieved domain concepts:
  - _"SOIC teaches in [Lesson Name @ Timestamp] that [Concept X]... Why does your skill not enforce this check?"_
  - _"Dr. Anil Lamba emphasizes that [Rule Y]... Why does your framework allow [Z]?"_
  - _"In our historical DB notes on [Company A], [Pattern B] occurred... How does your prompt catch this?"_
- **Q2 — Script Migration Candidates:** What deterministic logic (math, percentages, regex, JSON formatting) is polluting the prompt and distracting the LLM?
- **Q3 — Seam & Interface Definition:** What companion script will take over the deterministic extraction pass?

#### Round 2: Model Tiering, Caching & Token Reduction

- **Q4 — Model Tiering Assignment (Agent Heuristics):** Given the user's criticality ratings, what model tier does each step require? (Frontier vs Balanced vs Local).
- **Q5 — Caching & Window Cursors:** How do we ensure zero redundant reprocessing? (`windowCursor.js`, Tier 1 raw cache, Tier 2 scoped `usecase`).
- **Q6 — Payload Truncation & Progressive Disclosure:** How do we shrink input token context (e.g. relevance pre-filtering)?

---

### Phase 4: Synthesized Improvement RFC & Action Plan

Present a comprehensive **Skill Optimization Blueprint**:

#### 1. Executive Summary & Value Verdict

- Core capability & primary questions answered.
- Ratio of True Reasoning vs. Deterministic Logic.
- Quality elevation summary (how the critical analysis becomes sharper).

#### 2. Reasoning Tasks & Model Tiering Matrix

Mapping user-confirmed criticality to heuristic model assignments:

| Reasoning Task                    | User Criticality           | Analytical Complexity | Assigned Model Tier       | Rationale                              |
| :-------------------------------- | :------------------------- | :-------------------- | :------------------------ | :------------------------------------- |
| e.g. Management Dodging Detection | **Mission-Critical Alpha** | High Ambiguity        | Claude 3.5 Sonnet / Opus  | Direct signal for promoter credibility |
| e.g. Filing Categorization        | **Routine**                | Low Ambiguity         | Local Ollama / Flash Lite | Standard multi-class labeling          |

#### 3. The Logic-to-Script Migration Matrix

List every operation migrating from `SKILL.md` into deterministic scripts:

| Operation in Prompt       | Target Script Location                        | Inputs & Outputs                | Rationale                           |
| :------------------------ | :-------------------------------------------- | :------------------------------ | :---------------------------------- |
| e.g. YoY Growth & Margins | `stock-api/src/analyzers/financialMetrics.js` | Financial JSON -> Computed KPIs | Pure math; eliminates hallucination |

#### 4. Caching & Cursors Architecture

- Cache paths (`data/cache/...`) and `usecase` scoping.
- `windowCursor.js` integration for recurring/scheduled tasks.

#### 5. Concrete Code & Prompt Diff

Exact proposed edits for `SKILL.md` and draft implementations for new scripts.

#### 6. Verification & Evals Plan

2–3 test cases checking both quality improvement (richer insights) and efficiency (tokens saved).

---

### Phase 5: Implementation & Interactive Confirmation

1. **Automatic Implementation of Script Migrations (Deterministic Logic):**
   - Migrating deterministic arithmetic, ratio calculations, JSON validation, and extraction filtering from prompts to companion scripts is a **no-op architectural change** (preserves analytical behavior while eliminating token waste and calculation errors).
   - The agent **MUST automatically implement** all accepted Script Migrations directly without blocking for human confirmation.
   - **Architectural Rules for Companion Scripts (MANDATORY per `/skill-manager` and monorepo conventions):**
     - **NEVER store companion scripts in the `skills/` folder** (e.g. `skills/<skill-name>/scripts/` is forbidden for core logic).
     - **Store scripts in dedicated monorepo locations:**
       - Domain analyzers & computational logic: `stock-api/src/analyzers/` or `stock-api/src/utils/`.
       - Data jobs, persistence helpers, & extractors: `packages/jobs-runtime/lib/` or `packages/jobs-runtime/scripts/`.
       - Standalone CLI entry points: `stock-api/bin/<skill-name>.js`.
       - Workspace facade: Expose runnable entry points in `package.json` per Workspace Facade Pattern (Rule 5).
     - **Standing Monorepo Conventions:**
       - Call `loadEnv()` from `packages/jobs-runtime/lib/env.js` before reading any secrets/env variables (Rule 2).
       - Route all data persistence through `packages/jobs-runtime/lib/db.js` (DATA_RULES.md).
       - Maintain comprehensive JSDoc typing (`@param`, `@returns`, `@typedef`) on exported functions (Rule 4).

2. **Interactive Confirmation for Remaining Qualitative & Prompt Suggestions:**
   - For all non-script suggestions (changes to reasoning prompts, analytical frameworks, tolerance thresholds, model tiering changes, or new analytical rules like Q1/Q3 WC caps or evasion patterns):
   - The agent **MUST prompt the user** using `ask_question` (interactive multi-question prompt) to individually confirm whether to implement each suggestion.
   - Once the user confirms which suggestions to implement, the agent applies the prompt diffs to `SKILL.md` and related references, runs tests/formatting, and verifies synchronization.

---

## Standing Conventions Check

Before declaring a review complete, verify compliance with monorepo standards:

- [x] **Extraction First (Principle 17):** Deterministic logic lives in `stock-api/` or `packages/jobs-runtime/`.
- [x] **Env Resolution (Rule 2):** Any companion script reading `process.env` calls `loadEnv()`.
- [x] **Data Persistence (DATA_RULES.md):** Writes route through `packages/jobs-runtime/lib/db.js`.
- [x] **Attribution (Rule 21):** `sourceSkill` is explicitly passed on all `add-note` calls.
- [x] **Envelope Integrity (Rule 22):** No rogue `createdAt` fields competing with `creationTime`.
- [x] **Synchronization:** Skill registered in `skills/registry.manifest.json` and synced via `yarn antigravity:sync`.
- [x] **Rule 11:** Final response includes an evidence-based token-optimization suggestion.
