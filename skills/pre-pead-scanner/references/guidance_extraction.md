# Guidance extraction, validation & conviction rubric

This is the analytical core of the skill (Step 4 and Step 6). The goal: separate companies management has *credibly* set up to beat from those merely *talking* a good quarter. Read this before analysing the first company.

## Mindset: guidance vs capability

A pre-results edge does not come from management optimism — everyone is optimistic on a concall. It comes from the gap between what management *says* and what the order book, capacity, utilisation and history say they can *deliver*. Three archetypes:

1. **Confident + corroborated** — explicit guidance, plus a booked order book / commissioned capacity / consistent run-rate that supports it. *High conviction.*
2. **Confident + uncorroborated** — bullish tone, but the guided number needs a sequential jump nothing in the evidence supports. *Low conviction — a setup for a miss.*
3. **Quiet + corroborated** — management understated, but order book is full and idle capacity is being switched on. *Often the best risk-reward; the beat isn't priced into the narrative.*

Rank on which archetype each company fits, not on how good the quarter "sounds".

## Step 4a — Extract the guidance (verbatim)

For each in-scope concall, pull the three guidance dimensions as **verbatim quotes** with **speaker name and date**. Paraphrasing a number is how errors enter the model — quote it.

- **Revenue** — full-year guidance (₹ Cr or % growth) and any explicit next-quarter colour.
- **Margin** — OPM / EBITDA margin guidance (a band like "13–14%" or "maintain current margin profile").
- **PAT** — absolute PAT target if given, else infer from revenue × margin commentary.

Extraction mechanics:
- `pdftotext -layout <file.pdf> <file.txt>` for text-based PDFs.
- Image-based PPTs: `pdftoppm -jpeg -r 150 <pdf> <prefix>` then `tesseract <page>.jpg <out>` — run four pages in parallel to avoid timeouts.
- Grep for signal words near numbers: `guid`, `outlook`, `expect`, `target`, `aspire`, `FY26`, `FY27`, `Q4`, `next quarter`, `full year`, `crore`, `%`, `margin`, `EBITDA`.
- Distinguish a *company* statement from a *response to an analyst's framing*. "We are maintaining guidance of ₹5,700–5,800 Cr" is company guidance; "so you'd need ₹160 Cr in Q4? — around that" is management *agreeing* to an analyst's number. Both are usable, but tag the latter as *directional, not formal guidance*.
- Watch for **chairman-vs-CFO asymmetry** and any **walk-back** of a previously firm target to an "aspiration" — both are material conviction signals.

## Step 4b — Validate against hard evidence

For each company, score the guidance against four evidence pillars. The first three are forward-looking; the fourth is the reality check.

### 1. Order book / backlog
- Is there booked, executable revenue covering the guided figure? Compute **order-book coverage** = executable order book ÷ guided revenue for the relevant period.
- Is the book *growing or being burned*? Order intake < execution means the book is shrinking — a yellow flag even if current coverage is fine.
- For book-to-bill businesses (EPC, capital goods, defence), this is the single most important pillar. For consumer/FMCG/pharma-formulation names there is no order book — lean on capacity + history instead, and say so.

### 2. Capacity
- Is there physical headroom to produce the guided volume? New lines *commissioned* (not just announced) are the strongest signal — idle-but-ready capacity converts directly to revenue when demand pulls.
- A capacity addition that lands *next* fiscal year does **not** help the upcoming quarter — don't credit it to the near-term estimate (a common error).
- **Asset-light reinterpretation:** for visa/retail/platform/services names, "capacity" means hiring pipeline, store roll-out velocity, contract licences, or processing throughput. Reinterpret explicitly rather than marking "N/A".

### 3. Utilisation
- Current utilisation tells you how much of the guided growth is "free" (filling idle capacity, high incremental margin) vs needs *new* capacity (capex, ramp risk, lower near-term margin).
- A jump from, say, 80% → 100% utilisation on an existing line is high-confidence and margin-accretive. A guided number requiring utilisation above nameplate is not credible.

### 4. Historical performance (the reality check)
- Does the implied next-quarter number fit the company's run-rate and **seasonality**? Many Indian businesses are Q4-loaded (March year-end push) or Q1-loaded (govt-fiscal-driven) — a big sequential jump can be perfectly normal *for that business*.
- **The >30% rule:** if the implied next-quarter figure requires a sequential jump greater than ~30%, demand a *specific* mechanism (stated seasonality, a named order milestone, a line commissioning this quarter). Absent one, flag it red regardless of how confident the tone was.
- Cross-check the run-rate against the scan's `Revenue` (TTM), `Revenue Growth TTM`, and `PAT Growth YoY/QoQ`.

### When one concall isn't enough — track guidance drift
Fetch the previous 2–4 transcripts and watch how the *same* guidance moved across calls:
- **Narrowing upward** ("18–20%" → "20%") = rising confidence, corroborating signal.
- **Widening / lowering** ("mid-teens" → "low-teens", "target" → "aspiration") = deteriorating confidence, a quiet de-risking — discount the headline.
- **Silent flags** — items disclosed in a filing but never raised by management or analysts on the call. Surface them; they're often where the surprise hides.

```bash
python3 packages/stock-api/python/fetchers/fetch_documents.py "<companyId>" \
    -t Transcript --last-n 4 -o "/tmp/pead/${SAFE}_docs"
```

## Step 6 — Conviction-tier rubric

Assign each company a tier from the *evidence*, not the optimism. Use this as a guide, not a rigid score:

**HIGH** — all of:
- Explicit numerical guidance (revenue and/or PAT), ideally reiterated or narrowed-up across calls.
- At least one strong corroborating pillar: order-book coverage ≥ guided number, OR commissioned capacity with utilisation headroom, OR a run-rate that already lands the implied number without a big jump.
- Implied next-quarter jump is modest (<~30%) *or* backed by a specific, stated mechanism.
- No internal contradictions (no chairman-vs-CFO split, no target→aspiration walk-back).

**MEDIUM** — guidance exists but one leg is weak: the implied jump is aggressive but plausible (e.g. a 2× seasonal Q4 that the business has historically delivered), or order book/capacity supports *most* but not all of the number, or earnings quality is muddied by one-offs (deferred tax, forex). Deliverable, but with execution risk worth naming.

**LOW** — guidance is qualitative or hand-wavy, *or* the implied number requires a jump the evidence doesn't support, *or* management walked back a prior target, *or* the only document is a PPT with no Q&A. Include for completeness but flag the gap clearly. (Often these belong in "honourable mentions" rather than the ranked table.)

## What to record per company (feeds the table + card)

- Verbatim guidance quotes (revenue, margin, PAT) with speaker + date.
- A one-line **tone/clarity** read ("precise reiteration with a Q4 PAT bridge" vs "vague, deflected the guidance question").
- Each validation pillar with its evidence value (order-book coverage, commissioned capacity, current utilisation, run-rate vs implied jump).
- The guidance-drift note if you pulled multiple calls.
- A **"what could be wrong"** flag — the single most likely reason the estimate misses (one-off in the base, seasonality not repeating, order-book execution slippage, margin mean-reversion, commodity/forex move since the call).
