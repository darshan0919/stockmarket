# The nine-step workflow (detailed mechanics)

This is the operational heart of the skill. SKILL.md gives the one-line summary of each step; this file gives the commands, decision rules, and gates. Follow the steps in order — each gates or feeds the next, and a company that fails a gate drops out of the universe and is reported as *excluded*, never silently dropped.

Underlying thesis: a scan tells you *who* reports next; this workflow tells you *which of them is set up to surprise, in a way you can trade*. That means four things, checked across the steps: a surprise is coming (your estimate diverges from street **and** guidance), the company can deliver it (evidence, not tone), it isn't already priced (valuation), and it's tradeable (liquidity + historical drift).

Commands below show `python3 /tmp/run_scan.py` and `python3 stock-api/python/fetchers/fetch_documents.py` as the invocation shape the runtime uses; when running from the JS package directly, the equivalents are `resolveUniverse()` / `postEventReturns()` in `stock-api/src/analyzers/`. Use whichever the environment exposes — the logic and the JSON shapes are identical.

## Step 0 — Resolve the scan into a universe, then GATE ON LIQUIDITY

The scan URL is the only required input. Run the scan runner, which fetches the **live** saved-scan definition (so any edits the user made are respected — never hardcode filters) and returns the matching companies, with the liquidity gate applied.

```bash
python3 /tmp/run_scan.py "<SCAN_URL>" \
    --min-atv-cr 5 --min-free-float-cr 50 \
    --json-out /tmp/pead_universe.json
```

The runner partitions the raw universe into:
- `companies` — the **liquid, tradeable** names that pass both floors. Only these proceed.
- `excluded_illiquid` — names dropped for **50D average traded value < ₹5 Cr** or **free float < ₹50 Cr**, each carrying its measured `atvCr` and `freeFloatCr`.
- `unresolved_liquidity` — names where the traded-value or free-float column wasn't in the scan output. **Do not pass these silently.** Add the missing ratio to the saved scan (or fetch it via card-details) and re-run; if truly unavailable, list them as "liquidity unverified" and exclude them from the ranked table.

The critical field on every row is **`companyId`** (e.g. `NSE:PGEL`) — every downstream call keys off it. Each row also carries `Name`, `Sector`, `Last Result Date`, `Next Result Date`, `Close Price`, `Market Capitalization`, `Revenue`, `EPS`, `Equity Shares`, `PAT Growth TTM/YoY/QoQ`, `ROE`, `ROCE`, valuation multiples, and the liquidity/returns columns — keep them all; they feed the later steps. See `liquidity_gate.md` for the gate internals and `scan_api.md` for the full column glossary.

**Why gate first:** reading a concall, projecting a quarter, and scoring a surprise for a name you can't trade is wasted work. The gate is deliberately the very first thing after resolving the universe.

## Step 1 — Drop names that have already declared

A "pre-results" thesis is void the moment a company reports. The freshest signal is `Last Result Date` from the scan row: if it equals today's date (or any date in the current results window the user cares about), the company has *already* declared — exclude it.

Confirm via the documents API — a brand-new `Result` document dated to the quarter about to be reported means results are out:

```bash
python3 stock-api/python/fetchers/fetch_documents.py "<companyId>" \
    -t Result --last-n 1 --list-only
```

If the latest `Result` date corresponds to the quarter about to be reported (e.g. a `202603` result when scanning for Q4 FY26), exclude it. Record every exclusion with its reason.

## Step 2 — Drop names with no prior-quarter concall

The whole method rests on management's most recent guidance. No concall, no guidance, no analysis. Check for a transcript dated to the **previous** quarter (the one already reported):

```bash
python3 stock-api/python/fetchers/fetch_documents.py "<companyId>" \
    -t Transcript --last-n 2 --list-only
```

Decision rule:
- A `Transcript` for the most recent reported quarter exists → **in scope**, fetch and analyse it.
- Only an investor `PPT` exists (no transcript) → **degraded scope**. PPTs carry some guidance but no Q&A, no tone. Flag it; include only if the PPT has explicit numerical guidance, otherwise move to honourable mentions.
- Neither transcript nor recent PPT (only a bare `Result` sheet) → **exclude**, with the reason recorded.

Some companies file under a BSE security code rather than the NSE symbol — if a real-looking ticker returns zero documents, retry as `BSE:<6-digit-code>` (see the dependency skill's failure-modes section).

Fetch the in-scope documents for real (drop `--list-only`, add `-o`):

```bash
SAFE=$(echo "<companyId>" | tr ':' '_')
python3 stock-api/python/fetchers/fetch_documents.py "<companyId>" \
    -t Transcript --last-n 1 -o "/tmp/pead/${SAFE}_docs"
```

Convert to text (`pdftotext -layout`; OCR image-PPTs via `pdftoppm -r 150` + `tesseract` in batches of four pages). Extraction mechanics are in `guidance_extraction.md`.

**Record the concall and transcript dates now** — Step 7 needs them to anchor post-event returns.

## Step 3 — Read the concall: extract guidance, then validate capability

For each in-scope company, read the latest concall and extract two things, in this order:

**(a) The guidance itself** — revenue, margin (OPM/EBITDA), and PAT, as *verbatim quotes* with speaker and date. Capture FY guidance and any explicit next-quarter colour. Never paraphrase a number; quote it.

**(b) How credibly they can hit it** — assess tone/clarity/data-backedness, then **validate against hard evidence**: order-book/backlog coverage, capacity & utilisation headroom, historical run-rate/seasonality fit. A guided figure needing a >30% sequential jump needs a *specific* mechanism or it earns a red flag.

If the latest concall alone can't settle the validation (guidance narrowing vs widening across calls, order book growing vs burning), **fetch the previous 2–4 concalls** and track guidance drift:

```bash
python3 stock-api/python/fetchers/fetch_documents.py "<companyId>" \
    -t Transcript --last-n 4 -o "/tmp/pead/${SAFE}_docs"
```

The full extraction-and-validation framework — the four evidence pillars and the capability tier — is in `guidance_extraction.md`. **Read it before analysing the first company.**

## Step 4 — Project next-quarter Revenue / OPM / PAT / EPS

Combine guidance with YTD (9M) actuals and historical financials. Cleanest method when both are available:

```
Next-quarter estimate = FY guidance − YTD actual
```

Carry ranges. Where there's no full-year figure, extrapolate from the recent quarterly run-rate adjusted for stated seasonality and any new-capacity ramp. Always compute Revenue (with implied YoY/sequential growth), OPM, PAT, and EPS (PAT ÷ equity shares). **Strip one-offs from the base quarter first.** Show the maths; tag each input `[guided]`/`[actual]`/`[estimate]`. Method, OPM→PAT bridge, one-off stripping, and EPS share-count gotchas are in `forward_estimation.md`.

This your-estimate is the input to the surprise in Step 5 — it is what you are comparing *against* the street and the guide.

## Step 5 — Score the surprise, two benchmarks

A surprise needs a reference. Compute your Step-4 estimate against *both*:

**(a) Versus street/consensus.** Anchor on research-report estimates for the quarter/FY where the user has supplied broker PDFs or you can source a consensus figure; otherwise use the documented consensus proxies. `Surprise_street = (your estimate − street estimate) / street estimate`.

**(b) Versus guidance-implied.** The number the market reads straight off management's guidance (FY guide − YTD, taken at face value). `Surprise_guidance = (your estimate − guidance-implied) / guidance-implied`.

Report both, and **flag the divergence**: a name that beats street but not its own guide (street is lowballing) is a different setup from one that beats its guide but not street (street already expects the beat). Divergence is where the edge hides. Full framework, sourcing, and the sign/label conventions are in `surprise_scoring.md`.

## Step 6 — Valuation & expectations: is the beat already priced?

A surprise only moves a stock to the extent it wasn't expected, and price *is* expectations. For each name read:
- **50-day average P/E** vs the stock's own trailing history and its industry median (from the scan's valuation columns) — rich-to-history means good news is discounted.
- **Research-report price targets and valuation models** where supplied — upside/downside to target, and what growth the target implies.

Translate into an *expectations* modifier on the surprise: cheap-to-history + coming beat = amplify; rich-to-history + coming beat = discount (the beat may already be in the price). Method in `valuation_and_expectations.md`.

## Step 7 — Historical post-event drift: is the surprise tradeable?

Knowing a beat is coming is worthless if the stock fades it. For each name, measure the forward return after its three information events:
- **After the last result** — available directly as a scan column (`Returns after result` / equivalent).
- **After the concall** and **after the transcript release** — *derived*: take the concall/transcript dates (recorded in Step 2) and the price history, and compute forward returns at +1D / +5D / +20D.

```bash
python3 stock-api/python/analyzers/post_event_returns.py "<companyId>" \
    --result 2026-01-28 --concall 2026-01-29 --transcript 2026-02-03 \
    --windows 1,5,20 --json-out "/tmp/pead/${SAFE}_returns.json"
```

(JS equivalent: `postEventReturns(prices, {result,concall,transcript})` in `src/analyzers/postEventReturns.js`.)

Summarise the pattern across the last few quarters into a drift signature (`strong-positive-drift` / `positive-drift` / `noisy` / `fade`). A name that reliably drifts up after results is where a correct beat prediction pays; a "fade" name needs a much bigger surprise to be worth it. Method in `post_event_returns.md`.

## Step 8 — Composite surprise score, rank, render

Combine the four legs into a composite surprise score for each name — direction and magnitude of the expected surprise (Step 5), discounted by how much is already priced (Step 6) and weighted by tradeability (Step 7 drift + Step 0 liquidity), with capability evidence (Step 3) as the credibility gate on the whole thing. The rubric — including how the two benchmarks and the modifiers combine — is in `surprise_scoring.md`. Sort the master table highest → lowest composite score.

Render an interactive HTML briefing using `assets/briefing_template.html`. The master table columns must include everything extracted and computed:

| Column | Source |
|---|---|
| Rank, Company, companyId, Sector | scan |
| MCap, CMP | scan |
| 50D avg traded value, Free float | scan (Step 0) |
| FY guidance (verbatim signal) | concall (Step 3a) |
| Tone / clarity read | concall (Step 3b) |
| Validation: order book / capacity / utilisation / history | concall + scan (Step 3b) |
| YTD (9M) actual Revenue / PAT | concall / Result |
| **Est. next-Q Revenue / OPM / PAT / EPS** | Step 4 |
| **Surprise vs street** | Step 5a |
| **Surprise vs guidance** | Step 5b |
| 50D avg P/E vs history/industry; target upside | Step 6 |
| Post-event drift (result / concall / transcript) | Step 7 |
| **Composite surprise score + direction** | Step 8 rubric |
| What could be wrong | per-name risk |

Below the master table, give a per-company deep-dive card (verbatim guidance quotes with speaker + date, the validation evidence, the next-quarter maths shown transparently, both surprises, the valuation and drift reads, and a "what could be wrong" block), then a cross-cutting risks section, an exclusions list split into **illiquid** (with measured values) / **already-declared** / **no-concall**, and a result-day watchlist of the specific metrics to verify when each reports.

If the `visualize` tool is available, render the table through it; otherwise write the self-contained HTML file to `/mnt/project/jobs/data/agent-outputs/` and present it.

## Final self-audit (do not skip)

Before delivering: (1) re-run Step 0 and confirm no ranked name has declared in the interim; (2) spot-check one guided number, one 9M actual, one EPS, one 50D-P/E, and one post-event return against source; (3) confirm every illiquid exclusion shows its measured traded-value and free-float; (4) write the cross-cutting "what could be wrong with this ranking?" paragraph — selection bias from the scan filters, stale consensus, unaudited concall numbers, a market-wide move contaminating the drift history, or a unit error in the liquidity/valuation columns.
