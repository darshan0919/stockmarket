# The Skill Grilling Rubric: 6-Dimension Deep Audit

This rubric forms the architectural lens through which `grill-skill` evaluates, challenges, and refactors existing skills. It enforces the **Design Tree** methodology from `/grill-me`, mapping every skill optimization as an explicit frontier of decisions.

---

## 🏛️ The Supreme Thinker Philosophy & Two-Round Architecture

> **/grill-skill is an unconstrained thinker meta-skill. Quality, depth, and institutional rigor mean everything; execution cost is negligible.**

1. **Two Exhaustive Review Rounds:**
   - **Round 1 (Pre-Human Holistic Probe):** Evaluates the entire baseline state holistically, grounds in SOIC/Lamba, and isolates true reasoning from mechanics to formulate deep, grounded trade-offs for the human.
   - **Round 2 (Post-Human Holistic Stress-Test):** Evaluates the entire proposed target state holistically, stress-testing against real-world promoter tricks, accounting red flags, and ensuring prompts are institutional-grade rather than hollow.

2. **The Living Thinking Ledger vs Deterministic Idempotency:**
   - **Deterministic Parts (Code, Caching, AST Invariants):** Checked via cryptographic content hashes (`SHA-256`) and static linting. If unchanged, zero churn is guaranteed.
   - **Thinking Parts (Qualitative Reasoning, Nuance, Mental Models):** Stored in `db.reports` (`type: 'skill-review'`) as living **Bayesian Priors**. Re-runs treat prior feedback as an intellectual launching pad—never as rigid dogma—open to continuous elevation by newer KB transcripts, smarter models, and sharper human understanding.

---

## 🚨 The Non-Negotiable Rule: Criticality is User-Decided, Model Tiering is Heuristic-Decided

> **NEVER judge or assume the importance/criticality of a reasoning task by yourself — ALWAYS stop and confirm with the user.**

- **Why?** In Indian listed equity research and scanner systems, the value of an insight depends entirely on investment thesis conviction, position sizing, and risk asymmetry. An LLM cannot know whether detecting an ambiguous Capex timeline postponement is a dealbreaker or secondary background unless the user states it.
- **The Mandatory Checkpoint:** During Phase 3 of any grilling session, the agent **MUST HALT** and present every discovered candidate reasoning task to the user.
- **The Separation of Powers:**
  1. **"How important is this reasoning task?"** $\rightarrow$ **Exclusively the User's Decision.**
  2. **"What kind of LLM model does this task require?"** $\rightarrow$ **The Agent's Heuristic Decision**, based on the User's Criticality $\times$ Analytical Ambiguity $\times$ Failure Cost.

---

## The Primary vs. Secondary Goal

1. **PRIMARY GOAL: Maximize Output Quality & Isolate "True Reasoning"**
   - The primary objective of grilling is **NOT** to make skills dumber or cheaper; it is to make them **substantially sharper, deeper, and more institutional-grade**.
   - Strip away cognitive pollution: When an LLM is relieved of arithmetic, string formatting, regex parsing, and JSON boilerplate, its entire attention budget is focused on true qualitative reasoning.
   - Demand verifiable, page-anchored evidence: No vague adjectives ("strong demand", "solid performance"); require exact quotes, numbers, and cross-quarter consistency checks.

2. **SECONDARY GOAL: Cost Cutting & FinOps**
   - Cost reduction is vital, but it is a **natural byproduct** of sound architecture:
     - Moving deterministic logic into companion scripts saves thousands of tokens per run.
     - Caching immutable documents and previous extractions eliminates 100% of rerun costs.
     - Offloading _verified routine/commodity_ tasks to local or cheap models saves budget for the mission-critical frontier calls.
   - **Cost cutting must NEVER downgrade or degrade a Mission-Critical Alpha task.**

---

## Dimension 1: True Value & Reasoning Quality

> **"What value is this skill truly providing? What specific questions does it answer? What are its TRUE reasoning parts?"**

### Core Inquiries:

1. **Isolating True Intellectual Reasoning:**
   - Where in this skill does true qualitative judgment occur? Examples:
     - Detecting management evasion or tone shift in earnings concall Q&As.
     - Evaluating whether a corporate announcement sits on the SOIC J-Curve / EPS accretion path.
     - Spotting forensic accounting red flags in Annual Report notes or related-party transactions.
     - Weighing bull/bear scenarios against management credibility ("walk-the-talk").
   - Contrast this with **Pseudo-Reasoning / Procedural Choreography:**
     - Extracting numbers from a table (deterministic).
     - Filtering stocks with $>3\times$ volume surge (deterministic).
     - Assembling a JSON schema envelope (deterministic).

2. **The "Three Questions" Test:**
   - Exactly what 2–3 questions does the user want answered when invoking this skill?
   - Does the skill answer them directly with quantified conviction, or does it drown the user in raw transcripts and generic summaries?

3. **Institutional Rigor & Hallucination Resistance:**
   - Are assertions anchored to verifiable facts (page citations, specific timestamps, exact rupee/metric deltas)?
   - Does the prompt force the model to quote verbatim from primary filings?

4. **Domain Grounding & Knowledge Base Integration (SOIC & Expert Teachings):**
   - Does the skill incorporate SOIC compounding, J-Curve frameworks, and promoter walk-the-talk governance models (`ask-soic`)?
   - Does it enforce Dr. Anil Lamba's corporate finance literacy: profit vs cash, working capital cycle, and operating leverage (`ask-expert`)?
   - Does it account for historical edge cases and analytical findings from existing company notes and reports in `packages/jobs-runtime/lib/db.js`?

---

## Dimension 2: Reusability & Composability

> **"Is this skill an isolated monolith, or can its components be reused across the ecosystem?"**

### Core Inquiries:

1. **Duplication of Shared Logic:**
   - Does this skill reimplement filing downloads, concall fetching, table parsing, or email formatting that already exists in `stock-api/src/utils/`, `packages/jobs-runtime/lib/`, or `skills/_shared/`?
   - Can repetitive analytical frameworks (e.g. tone analysis, guidance tracking) be promoted to shared reference modules?

2. **Composability (Caller / Subagent Interface):**
   - Can another skill (or scheduled sidecar job) invoke this skill without human intervention?
   - Does it accept clean, standardized arguments (e.g. `--ticker`, `--period`, `--depth`, `--json`)?
   - Can it run in "headless" mode returning structured JSON rather than an interactive chat?

3. **Decoupling Extraction from Synthesis:**
   - Is data extraction coupled tightly to the report generator?
   - If extraction and synthesis are decoupled, multiple consumers can reuse the extracted structured data without paying for re-extraction.

---

## Dimension 3: Rework Avoidance & Proper Caching

> **"Are we paying LLM tokens or API latency to re-derive facts we already knew yesterday?"**

### Core Inquiries:

1. **Two-Tier Caching Architecture:**
   - **Tier 1 (Objective Fact Cache):** Raw document text, extracted tables, and API responses must be cached **unconditionally** across all skills. Extracted text from an annual report or concall is immutable.
   - **Tier 2 (Analytical Insight Cache):** Generated insights must be scoped by an explicit `usecase` prefix (e.g. `"<skill-name>:<variant>"`). They must never collide, but re-running the identical skill on the identical filing must yield an instant cache hit.

2. **Window Cursors (`windowCursor.js`):**
   - For recurring or scheduled skills (e.g. scanning filings, tweets, volume surges): Does the skill rely on a moving "now - 24h" window, or does it commit a **resumable cursor**?
   - _Rule:_ Moving windows cause duplicate processing whenever runs overlap, catch-up, or retry. Recurring jobs MUST use `packages/jobs-runtime/lib/windowCursor.js`.

3. **Short-Circuit Gates:**
   - Does the skill verify whether the output already exists before firing heavy subagents or downloading PDFs?
   - If a company reported no new filings or volume delta, does it fast-exit in 50ms for ₹0?

---

## Dimension 4: Token Usage Reduction & Context Guardrails

> **"Are we stuffing 100,000 tokens into prompt context when 2,000 would deliver superior accuracy?"**

### Core Inquiries:

1. **Progressive Disclosure (< 500 Line Rule):**
   - Does `SKILL.md` exceed 500 lines?
   - Is background documentation, edge-case tables, and domain theory loaded into context on EVERY turn, or split into `references/<topic>.md` files read only on demand?

2. **Payload Truncation & Pre-Filtering:**
   - Does the prompt pass 50-page raw PDF text to Claude Sonnet/Opus?
   - Can a deterministic regex or cheap pre-filter extract the 3 relevant candidate pages before the LLM is invoked? (Example: `guidance-relevance-filter` shrinks 40 pages to 4 candidate paragraphs).

3. **Eliminating Prompt Redundancy ("Never Think or Write Twice"):**
   - Does the skill prompt instruct the model to calculate tables, then summarize the tables, then write an email containing the same tables?
   - Compute data once in a JSON DTO (`packages/jobs-runtime/lib/db.js`), and render templates via script into HTML/PDF/Email without re-prompting.

---

## Dimension 5: Skill-to-Script Migration (Logic vs. Reasoning)

> **"Why is an expensive AI doing grade-school arithmetic, regex parsing, and array sorting?"**

### Core Inquiries:

1. **The Determinism Rule (Principle 17):**
   - If an operation has zero ambiguity and maps an input to an exact deterministic output, it **MUST be moved to a companion script**.
   - Examples of logic that must NEVER be in LLM prompts:
     - Math calculations (CAGR, EBITDA margins, EPS accretion, YoY% deltas).
     - Filtering lists by market cap, volume, or date thresholds.
     - Date manipulation, IST conversions, timezone offsets.
     - JSON schema validation and structural boilerplate wrapping.
     - Sorting and ranking items.

2. **Building the Lever:**
   - Where can a 25-line Node.js or Python script replace 150 lines of English instructions in `SKILL.md`?
   - Scripts don't hallucinate, don't suffer from attention drift, don't cost tokens, and execute in 5ms.

---

## Dimension 6: Cloud LLM to Local / Cheap LLM Offloading

> **"Can this step run on a local Llama 3 8B or Gemini Flash Lite for $0 / negligible cost?"**

### Core Inquiries:

1. **The Criticality $\times$ Complexity Decision Matrix (Agent Heuristics):**

| User Criticality Rating    | Analytical Complexity     | Recommended Model Tier                                           | Rationale                                                     |
| :------------------------- | :------------------------ | :--------------------------------------------------------------- | :------------------------------------------------------------ |
| **Mission-Critical Alpha** | High Ambiguity            | **Frontier Cloud** (Claude 3.5 Sonnet / Opus, Gemini Pro High)   | Direct investment decision driver; zero compromise on quality |
| **Mission-Critical Alpha** | Low / Structured          | **Frontier or Balanced Cloud** with rigid verification script    | Ensure exactitude while keeping reasoning sharp               |
| **Valuable Context**       | High / Moderate Ambiguity | **Balanced Cloud** (Gemini Flash, Claude Haiku)                  | Good qualitative synthesis at 1/10th cost                     |
| **Routine / Commodity**    | Low Ambiguity / Labeling  | **Local LLM** (Ollama Llama 3 8B, Qwen 2.5 7B) or **Flash Lite** | Standard classification or extraction; $0 local cost          |
| **Deterministic**          | Zero Ambiguity            | **Node.js / Python Script**                                      | Never spend model tokens on codifiable logic                  |

2. **Local Deployment Architecture:**
   - Can high-frequency routine steps (e.g. classifying 300 exchange announcements daily) run through local Ollama (`http://localhost:11434`)?
   - Can boilerplate stripping run locally before sending high-conviction candidates to cloud models?
