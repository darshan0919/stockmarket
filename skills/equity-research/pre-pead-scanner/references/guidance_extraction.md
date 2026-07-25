# Guidance extraction, validation & the capability tier

This is Step 3 — the analytical core, and the **deliverability leg** of the surprise score. The goal: separate companies management has _credibly_ set up to beat from those merely _talking_ a good quarter. Read this before analysing the first company.

Its output — the capability tier (HIGH/MEDIUM/LOW) — is not the final rank. It is the credibility gate on the surprise: `surprise_scoring.md` multiplies your predicted surprise _down_ when deliverability is weak, because a "beat" resting on tone rather than a booked order book isn't a real surprise. A large predicted beat with LOW deliverability should never rank above a moderate beat with HIGH deliverability.

## Mindset: guidance vs capability

A pre-results edge does not come from management optimism — everyone is optimistic on a concall. It comes from the gap between what management _says_ and what the order book, capacity, utilisation and history say they can _deliver_. Three archetypes:

1. **Confident + corroborated** — explicit guidance, plus a booked order book / commissioned capacity / consistent run-rate that supports it. _High conviction._
2. **Confident + uncorroborated** — bullish tone, but the guided number needs a sequential jump nothing in the evidence supports. _Low conviction — a setup for a miss._
3. **Quiet + corroborated** — management understated, but order book is full and idle capacity is being switched on. _Often the best risk-reward; the beat isn't priced into the narrative._

Rank on which archetype each company fits, not on how good the quarter "sounds".

## Step 3a — Extract the guidance (verbatim)

For each in-scope concall, pull the three guidance dimensions as **verbatim quotes** with **speaker name and date**. Paraphrasing a number is how errors enter the model — quote it.

- **Revenue** — full-year guidance (₹ Cr or % growth) and any explicit next-quarter colour.
- **Margin** — OPM / EBITDA margin guidance (a band like "13–14%" or "maintain current margin profile").
- **PAT** — absolute PAT target if given, else infer from revenue × margin commentary.

Extraction mechanics:

- `pdftotext -layout <file.pdf> <file.txt>` for text-based PDFs.
- Image-based PPTs: `pdftoppm -jpeg -r 150 <pdf> <prefix>` then `tesseract <page>.jpg <out>` — run four pages in parallel to avoid timeouts.
- Grep for signal words near numbers: `guid`, `outlook`, `expect`, `target`, `aspire`, `FY26`, `FY27`, `Q4`, `next quarter`, `full year`, `crore`, `%`, `margin`, `EBITDA`.
- Distinguish a _company_ statement from a _response to an analyst's framing_. "We are maintaining guidance of ₹5,700–5,800 Cr" is company guidance; "so you'd need ₹160 Cr in Q4? — around that" is management _agreeing_ to an analyst's number. Both are usable, but tag the latter as _directional, not formal guidance_.
- Watch for **chairman-vs-CFO asymmetry** and any **walk-back** of a previously firm target to an "aspiration" — both are material conviction signals.

## Step 3b — Validate against hard evidence

For each company, score the guidance against five evidence pillars. The first four are forward-looking (order book, capacity/capex-live, utilisation, and balance-sheet deleverage — the last two of which feed the direct PAT levers in Step 4); the fifth is the historical reality check.

### 1. Order book / backlog

- Is there booked, executable revenue covering the guided figure? Compute **order-book coverage** = executable order book ÷ guided revenue for the relevant period.
- Is the book _growing or being burned_? Order intake < execution means the book is shrinking — a yellow flag even if current coverage is fine.
- For book-to-bill businesses (EPC, capital goods, defence), this is the single most important pillar. For consumer/FMCG/pharma-formulation names there is no order book — lean on capacity + history instead, and say so.

### 2. Capacity (and capex going live — the operating-leverage lever)

- Is there physical headroom to produce the guided volume? New lines _commissioned_ (not just announced) are the strongest signal — idle-but-ready capacity converts directly to revenue when demand pulls.
- **Capture the capex-live status precisely** — it drives the operating-leverage PAT lever in Step 4. Extract: which line/plant is now _commissioned and producing this quarter_, its capacity and current ramp/utilisation, and any stated **contribution/incremental margin** (management often says the incremental tonne earns far more than the blended margin). Incremental revenue on already-built capacity drops through at a high margin — that's how a company beats on PAT while guiding flat blended margin.
- A capacity addition that lands _next_ fiscal year does **not** help the upcoming quarter — don't credit it to the near-term estimate (a common error). Also note the flip side to feed the bridge: when the asset capitalises, interest stops being capitalised and book depreciation starts — capture the expected D&A/interest step-up so Step 4 can net it against the leverage gain.
- **Asset-light reinterpretation:** for visa/retail/platform/services names, "capacity" means hiring pipeline, store roll-out velocity, contract licences, or processing throughput. Reinterpret explicitly rather than marking "N/A".

### 3. Utilisation

- Current utilisation tells you how much of the guided growth is "free" (filling idle capacity, high incremental margin) vs needs _new_ capacity (capex, ramp risk, lower near-term margin).
- A jump from, say, 80% → 100% utilisation on an existing line is high-confidence and margin-accretive. A guided number requiring utilisation above nameplate is not credible.

### 4. Balance-sheet / deleverage (the direct PAT lever)

- Extract the **net-debt trajectory and repayment schedule** — where is net debt now vs a year ago, and what has management committed to repay this year? Lower debt cuts interest expense, which flows _directly_ to PBT/PAT with no operating assumption — the most bankable piece of a PAT beat. Feed it to Lever 2 in Step 4.
- Also capture the **blended cost of debt** (interest ÷ average borrowings) and whether the debt is floating (rate moves matter) or fixed.
- **Check how the deleverage is funded:** repayment from operating cash flow is clean and un-dilutive; repayment from an equity raise/QIP cuts interest but raises the share count — a wash-or-worse for EPS, so flag it.
- For net-cash or already-lightly-levered names this pillar is N/A — say so rather than forcing it.

### 5. Historical performance (the reality check)

- Does the implied next-quarter number fit the company's run-rate and **seasonality**? Many Indian businesses are Q4-loaded (March year-end push) or Q1-loaded (govt-fiscal-driven) — a big sequential jump can be perfectly normal _for that business_.
- **The >30% rule:** if the implied next-quarter figure requires a sequential jump greater than ~30%, demand a _specific_ mechanism (stated seasonality, a named order milestone, a line commissioning this quarter). Absent one, flag it red regardless of how confident the tone was.
- Cross-check the run-rate against the scan's `Revenue` (TTM), `Revenue Growth TTM`, and `PAT Growth YoY/QoQ`.

### When one concall isn't enough — track guidance drift

Fetch the previous 2–4 transcripts and watch how the _same_ guidance moved across calls:

- **Narrowing upward** ("18–20%" → "20%") = rising confidence, corroborating signal.
- **Widening / lowering** ("mid-teens" → "low-teens", "target" → "aspiration") = deteriorating confidence, a quiet de-risking — discount the headline.
- **Silent flags** — items disclosed in a filing but never raised by management or analysts on the call. Surface them; they're often where the surprise hides.

```bash
python3 stock-api/python/fetchers/fetch_documents.py "<companyId>" \
    -t Transcript --last-n 4 -o "/tmp/pead/${SAFE}_docs"
```

## The capability tier (deliverability leg)

Assign each company a tier from the _evidence_, not the optimism — this is the `Deliverability` input to the composite surprise score. Use as a guide, not a rigid score:

**HIGH** — all of:

- Explicit numerical guidance (revenue and/or PAT), ideally reiterated or narrowed-up across calls.
- At least one strong corroborating pillar: order-book coverage ≥ guided number, OR commissioned capacity with utilisation headroom, OR a run-rate that already lands the implied number without a big jump.
- Implied next-quarter jump is modest (<~30%) _or_ backed by a specific, stated mechanism.
- No internal contradictions (no chairman-vs-CFO split, no target→aspiration walk-back).

**MEDIUM** — guidance exists but one leg is weak: the implied jump is aggressive but plausible (e.g. a 2× seasonal Q4 that the business has historically delivered), or order book/capacity supports _most_ but not all of the number, or earnings quality is muddied by one-offs (deferred tax, forex). Deliverable, but with execution risk worth naming.

**LOW** — guidance is qualitative or hand-wavy, _or_ the implied number requires a jump the evidence doesn't support, _or_ management walked back a prior target, _or_ the only document is a PPT with no Q&A. Include for completeness but flag the gap clearly. (Often these belong in "honourable mentions" rather than the ranked table.)

## What to record per company (feeds the table + card)

- Verbatim guidance quotes (revenue, margin, PAT) with speaker + date.
- A one-line **tone/clarity** read ("precise reiteration with a Q4 PAT bridge" vs "vague, deflected the guidance question").
- Each validation pillar with its evidence value (order-book coverage, commissioned capacity, current utilisation, run-rate vs implied jump).
- The guidance-drift note if you pulled multiple calls.
- A **"what could be wrong"** flag — the single most likely reason the estimate misses (one-off in the base, seasonality not repeating, order-book execution slippage, margin mean-reversion, commodity/forex move since the call).
