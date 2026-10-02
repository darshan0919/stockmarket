# Heuristics: Logic vs. Reasoning & Model Tiering

This reference provides decision heuristics and practical migration patterns for decomposing skills into deterministic scripts and tiered model calls, anchored in our stockmarket ecosystem.

---

## 1. The Core Mandate: Criticality is User-Decided, Tiering is Heuristic-Decided

```
┌────────────────────────────────────────────────────────┐
│ 1. USER'S DOMAIN DECISION (Mandatory Checkpoint)       │
│ - User rates the importance of each reasoning task:    │
│   • Mission-Critical Alpha (High business/thesis risk) │
│   • Valuable Context (Secondary supporting color)      │
│   • Routine / Commodity (Standard procedural task)     │
└──────────────────────────┬─────────────────────────────┘
                           │ Passed to Agent
                           ▼
┌────────────────────────────────────────────────────────┐
│ 2. AGENT'S HEURISTIC MODEL TIERING                     │
│ Agent evaluates (User Criticality × Task Complexity)   │
│ ➔ Assigns: Frontier Cloud vs Balanced Cloud vs Local   │
└────────────────────────────────────────────────────────┘
```

### The Model Tiering Decision Matrix:

| User Criticality           | Analytical Complexity       | Failure Cost                         | Recommended Tier                                                | Stockmarket Example                                                                                         |
| :------------------------- | :-------------------------- | :----------------------------------- | :-------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- |
| **Mission-Critical Alpha** | High Ambiguity              | High (Bad trade / False conviction)  | **Frontier Cloud** (Claude 3.5 Sonnet / Opus, Gemini Pro High)  | Concall Q&A management dodging detection; Forensic AR auditor qualification read; J-Curve inflection thesis |
| **Mission-Critical Alpha** | Structured / Multi-Factor   | High                                 | **Frontier Cloud** + Script Verification                        | Deleveraging trigger validation; Order book-to-bill execution timeline                                      |
| **Valuable Context**       | Moderate Ambiguity          | Medium                               | **Balanced Cloud** (Gemini Flash / Claude Haiku)                | Routine quarter-on-quarter product mix shift; Industry macro tailwind summary                               |
| **Routine / Commodity**    | Low Ambiguity / Categorical | Low                                  | **Local LLM** (Ollama Llama 3 8B, Qwen 2.5 7B) / **Flash Lite** | SEBI Reg-30 filing category labeling; Management sentiment polarity (-1, 0, +1)                             |
| **Deterministic**          | Zero Ambiguity              | Zero tolerance for arithmetic errors | **Deterministic Script** (Node.js / Python)                     | Margin calculations, YoY/QoQ growth %, Volume multiple thresholding, JSON envelope assembly                 |

---

## 2. Quality-First Optimization: Eliminating Cognitive Clutter

The primary goal of grilling is to **elevate output quality**.

When an LLM prompt forces the model to:

1. Parse a 15-column raw text financial table,
2. Compute Gross Profit and EBITDA margins in its head,
3. Check if market cap > 500 Cr,
4. Wrap output in a rigid JSON DTO with envelope timestamps,
5. _And_ evaluate management tone...

The model suffers from **attention dispersion**. Its context window and reasoning budget are consumed by grade-school math and schema formatting. As a result, its qualitative reasoning becomes superficial and prone to hallucinations.

### The Quality Elevation Rule:

> **Offload 100% of the cognitive clutter (math, parsing, formatting) to companion scripts, so the model's entire reasoning capacity is dedicated to deep, nuanced synthesis.**

---

## 3. The Logic vs. Reasoning Boundary (Principle 17)

Every task consists of two phases: **Extraction/Logic** and **Analysis/Reasoning**.

```
┌────────────────────────────────────────────────────────┐
│ Phase 1: Logic & Extraction (Deterministic Script)     │
│ - Fetch APIs, read files, download PDFs                │
│ - Calculate deltas, growth rates, ratios, sums         │
│ - Filter arrays, apply numeric thresholds, sort lists  │
│ - Parse regex, extract structured text snippets        │
│ ➔ Stores intermediate JSON DTO in cache / data / runs  │
└──────────────────────────┬─────────────────────────────┘
                           │ Passes structured JSON /
                           │ pre-filtered candidate excerpts only
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 2: Analysis & Reasoning (LLM Prompt)             │
│ - Interpret what the numbers mean for valuation       │
│ - Detect subtle shifts in management tone / confidence │
│ - Synthesize catalyst narrative & conviction level     │
│ - Formulate investment thesis & risks                  │
└────────────────────────────────────────────────────────┘
```

### The Boundary Checklist:

Ask these 4 questions for every instruction in a `SKILL.md`:

1. **Can this step be expressed as a pure function `f(x) -> y` with unit tests?**
   - _If YES:_ Move to script. Never leave pure functions in prompt text.
2. **Does this step require human-like intuition, subjective taste, or domain synthesis?**
   - _If YES:_ Keep in prompt. Provide clear examples and explain the _why_.
3. **Does this step assemble or validate JSON structure?**
   - _If YES:_ Create the JSON schema shell in a script. Let the LLM fill only the analytical text fields.
4. **Does this step compare two numbers or dates?**
   - _If YES:_ Never ask an LLM to compare timestamps or check if $A > B$. Compute the delta in a script and pass `{ deltaPercent: 14.2, isBreach: true }` to the prompt.

---

## 4. Migration Patterns: Skill to Script

### Pattern A: Extracting Calculations to a Companion Analyzer

_Before (Prompt Bloat):_

```markdown
Read the income statement table. Compute the Gross Profit Margin for Q3 FY25 by subtracting
COGS from Revenue and dividing by Revenue. Then calculate YoY growth by comparing with Q3 FY24.
If YoY growth is less than 10%, tag as "Slowdown".
```

_After (Script Lever):_
Companion script `stock-api/src/analyzers/financialMetrics.js`:

```js
function computeMarginsAndGrowth(currentQtr, priorYearQtr) {
  const gpm = (currentQtr.rev - currentQtr.cogs) / currentQtr.rev;
  const yoyGrowth = (currentQtr.rev - priorYearQtr.rev) / priorYearQtr.rev;
  return {
    gpm: Number((gpm * 100).toFixed(2)),
    yoyGrowth: Number((yoyGrowth * 100).toFixed(2)),
    tag: yoyGrowth < 0.1 ? 'Slowdown' : 'Expanding',
  };
}
```

_Prompt in SKILL.md:_

```markdown
Run `stock-api/src/analyzers/financialMetrics.js` to get computed margins and growth tags.
Analyze the strategic drivers behind any "Slowdown" tag using management's concall remarks.
```

---

### Pattern B: Candidate Pre-Filtering (Relevance Shrinking)

_Before:_
Feed 45 pages of concall transcript (40,000 tokens) to the model and ask:
_"Did management say anything about capacity expansion or capex?"_

_After:_
A cheap regex or Flash pass extracts the 4 paragraphs mentioning `capex`, `capacity`, `brownfield`, `greenfield`, `MW`, `commissioning` (800 tokens).
The prompt receives only the candidate excerpts:

```markdown
Evaluate the feasibility and timeline of management's capex plans from these 4 excerpts:
{{candidate_excerpts}}
```

_Token Savings:_ 98% reduction (from 40k tokens to 800 tokens).

---

### Pattern C: Local LLM Batching via Ollama / vLLM

When running high-volume batch jobs (e.g. classifying 500 daily exchange filings):

1. In script, query local Ollama endpoint:
   `POST http://localhost:11434/api/generate` with a tiny structured prompt:
   `{"model": "llama3.2:3b", "prompt": "Classify this filing into [M&A, Capex, Order, Other]: ...", "stream": false}`
2. Only items classified as material (e.g. M&A, Capex) are queued for Frontier Cloud LLM thesis evaluation.
3. 90% of routine compliance filings are filtered locally at zero cost.
