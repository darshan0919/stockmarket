# The nine-step workflow (detailed mechanics)

This is the operational heart of the skill. SKILL.md gives the one-line summary of each step; this file gives the commands, decision rules, and gates. Follow the steps in order — each gates or feeds the next, and a company that fails a gate drops out of the universe and is reported as _excluded_, never silently dropped.

Underlying thesis: a scan tells you _who_ reports next; this workflow tells you _which of them is set up to surprise, in a way you can trade_. That means four things, checked across the steps: a surprise is coming (your estimate diverges from street **and** guidance), the company can deliver it (evidence, not tone), it isn't already priced (valuation), and it's tradeable (historical drift).

Commands below show `python3 /tmp/run_scan.py` and `python3 stock-api/python/fetchers/fetch_documents.py` as the invocation shape the runtime uses; when running from the JS package directly, the equivalents are `resolveUniverse()` / `postEventReturns()` in `stock-api/src/analyzers/`. Use whichever the environment exposes — the logic and the JSON shapes are identical.

## Preflight — verify session tokens BEFORE running (do not skip)

This skill depends on two session-authenticated sources whose tokens expire: **Stockscans** (`STOCKSCANS_AUTH_TOKEN`) and **Screener.in** (`SCREENER_SESSIONID` / `SCREENER_CSRFTOKEN`), both in `.env`. An expired token either errors (Stockscans → 401/403) or, worse, silently degrades to a thin public page (Screener). Ranking on half-authenticated data is worse than not running at all, so check first:

1. Confirm both tokens are present in `.env`.
2. Probe each: run one Stockscans call and one Screener `companyPage` + `detectAuthState`.
3. If **either** is expired/rejected, **STOP — do not run the ranking prompt.** Tell the user exactly which key to refresh and how, e.g.:

   > "Your **Screener** session has expired. Log in at screener.in → DevTools → Application → Cookies → copy fresh `sessionid` (and `csrftoken`) → update `SCREENER_SESSIONID` / `SCREENER_CSRFTOKEN` in `.env`, then re-run."
   > "Your **Stockscans** token has expired. Refresh the `authtoken` cookie from stockscans.in and update `STOCKSCANS_AUTH_TOKEN` in `.env`, then re-run."

Only once both probes pass do you proceed to Step 0. Details and the exact detection logic are in `screener_insights.md` (Preflight section).

## Step 0 — Resolve the scan into a universe

The scan URL is the only required input. If the user doesn't provide one, use the default: `https://www.stockscans.in/scans/saved/429918e3098ce660baec9f22`. Run the scan runner, which fetches the **live** saved-scan definition (so any edits the user made are respected — never hardcode filters) and returns the matching companies. The scan already filters out illiquid stocks, so no additional liquidity gating is needed.

```bash
python3 /tmp/run_scan.py "<SCAN_URL>" \
    --json-out /tmp/pead_universe.json
```

The runner returns:

- `companies` — the names that matched the scan. All of these proceed.

The critical field on every row is **`companyId`** (e.g. `NSE:PGEL`) — every downstream call keys off it. Each row also carries `Name`, `Sector`, `Last Result Date`, `Next Result Date`, `Close Price`, `Market Capitalization`, `Revenue`, `EPS`, `Equity Shares`, `PAT Growth TTM/YoY/QoQ`, `ROE`, `ROCE`, valuation multiples, and the returns columns — keep them all; they feed the later steps. See `scan_api.md` for the full column glossary.

## Step 1 — Drop names that have already declared

A "pre-results" thesis is void the moment a company reports. The freshest signal is `Last Result Date` from the scan row: if it equals today's date (or any date in the current results window the user cares about), the company has _already_ declared — exclude it.

Confirm via the documents API — a brand-new `Result` document dated to the quarter about to be reported means results are out:

```bash
python3 stock-api/python/fetchers/fetch_documents.py "<companyId>" \
    -t Result --last-n 1 --list-only
```

If the latest `Result` date corresponds to the quarter about to be reported (e.g. a `202603` result when scanning for Q4 FY26), exclude it. Record every exclusion with its reason.

## Step 2 — Drop names with no prior-quarter concall or PPT

The whole method rests on management's most recent guidance. Check for a transcript AND an investor PPT dated to the **previous** quarter (the one already reported):

```bash
python3 stock-api/python/fetchers/fetch_documents.py "<companyId>" \
    -t Transcript,PPT --last-n 2 --list-only
```

Decision rule:

- If a `Transcript` OR `PPT` for the most recent reported quarter exists (one of them must be present) → **in scope**, fetch and analyse BOTH.
- Neither transcript nor recent PPT (only a bare `Result` sheet) → **exclude**, with the reason recorded.

Some companies file under a BSE security code rather than the NSE symbol — if a real-looking ticker returns zero documents, retry as `BSE:<6-digit-code>` (see the dependency skill's failure-modes section).

Fetch the in-scope documents for real (drop `--list-only`, add `-o`):

```bash
SAFE=$(echo "<companyId>" | tr ':' '_')
python3 stock-api/python/fetchers/fetch_documents.py "<companyId>" \
    -t Transcript,PPT --last-n 1 -o "/tmp/pead/${SAFE}_docs"
```

Convert to text (`pdftotext -layout`; OCR image-PPTs via `pdftoppm -r 150` + `tesseract` in batches of four pages). Extraction mechanics are in `guidance_extraction.md`. You MUST read both the concall and the PPT, not only the concall.

**Record the concall and transcript dates now** — Step 7 needs them to anchor post-event returns.

## Step 3 — Read the concall and PPT: extract guidance, then validate capability

For each in-scope company, read the latest concall AND PPT and extract two things, in this order:

**(a) The guidance itself** — revenue, margin (OPM/EBITDA), and PAT, as _verbatim quotes_ with speaker and date. Capture FY guidance and any explicit next-quarter colour. Never paraphrase a number; quote it.

**(b) How credibly they can hit it** — assess tone/clarity/data-backedness, then **validate against hard evidence**: order-book/backlog coverage, capacity & utilisation headroom, historical run-rate/seasonality fit. A guided figure needing a >30% sequential jump needs a _specific_ mechanism or it earns a red flag.

If the latest concall/PPT alone can't settle the validation (guidance narrowing vs widening across calls, order book growing vs burning), **fetch the previous 2–4 concalls** and track guidance drift.

**Business Updates:** Additionally, use the company announcements API to fetch important business updates from the last quarter (e.g., press releases, order book updates, commencement of plant) to strengthen the analysis.

```bash
# Example invocation via node script:
node stock-api/src/fetchers/announcementsFetcher.js "<companyId>" --start "2026-01-01" --end "2026-03-31" --search "press release" "order" "commissioning" "commencement"
```

The full extraction-and-validation framework — the five evidence pillars (order book, capacity/capex-live, utilisation, deleverage, history) and the capability tier — is in `guidance_extraction.md`. **Read it before analysing the first company.**

## Step 3c — Screener insights cross-check (independent second opinion)

Once per in-scope company, pull Screener's **key trackables insights matrix** (the "Insights" table on the Screener page) and **key ratios** — an independent, filings-based read that knows nothing of your concall work:

```
resp     = await screener.companyPageWithFallback('<symbol>')   // strip NSE:/BSE: prefix
insights = parseScreenerInsights(resp)
```

If `insights.authExpired` is true, halt per the Preflight rule — do **not** proceed on a degraded page. Otherwise use the insights table and ratios to **corroborate or challenge** the thesis you just built:

- Positive insights (e.g., debt reduced, strong growth guidance) alongside your projected beat → independent support, raise conviction.
- Negative insights (e.g., poor quarter expected, debt increased) against your projected beat → a **contradiction to resolve before ranking**, not to average away.
- Governance overhangs → cap conviction regardless of the numbers.
- Key ratios like `debtToEquity` vs the deleverage lever (Step 4), `roce`/`roe` vs the capability tier (Step 3).

Full mapping, tag list, and the "what could be wrong" is in `screener_insights.md`. Carry the insights and 2–3 key ratios into the deep-dive card. (Note: ignore Screener's auto-generated Pros/Cons, only use the key trackables insights matrix).

## Step 3d — Macro context overlay (quarter-level, run once, apply to every name)

Every name in the universe reports into the same macro quarter, so this is done once per run, not once per company. Read `references/quarterly_macro_context.md` for the current fiscal quarter (e.g. `## Q1FY27`) — it logs the quarter's major macro events (crude/oil-price shocks, currency moves, rate decisions, monsoon, tariffs, etc.) each with a sector-impact table. If the file has no section for the quarter being scanned, say so explicitly and either ask the user for the macro context or note that the ranking is running without a macro overlay — do not silently skip it.

For each in-scope company, look up its primary sector(s) against the event tables and add a **Macro overlay** line to its deep-dive card: which events are a tailwind, a headwind, or a non-factor, and whether management's own guidance already accounts for it. A rural NBFC guiding growth without acknowledging a flagged monsoon risk is a flag to raise; an exporter's guidance that already cites the rupee tailwind is corroboration, not new information. Macro context sanity-checks the guidance — it is a backdrop, never a substitute for the bottom-up evidence (order book, capacity, utilisation) gathered in Step 3.

Keeping this file current is a standing task: when researching a new quarter for the first time, add a `## Q_FY__` section to `quarterly_macro_context.md` following the existing format (event log with sourced citations + a sector-impact table per event), so future runs in the same quarter don't re-research it from scratch.

**Sector playbooks (complementary, not a substitute).** In addition to the quarter-level macro file, check `skills/_shared/sector-playbooks/` for a sector-specific playbook matching each in-scope company's sector — e.g. `fmcg-consumer-care.md` for hair oil/soap/shampoo/oral-care names. Where `quarterly_macro_context.md` is the _quarter_ lens (what happened this quarter, across all sectors), a sector playbook is the _sector_ lens (how this sector's economics work, its RM basket and pass-through mechanics, its guidance-giving culture, its seasonality, its export exposure — reusable across quarters). Use both: the sector playbook tells you _how_ to read a macro event for that sector (e.g. "this sector's RM basket is ~100% crude-linked with no natural hedge"), the quarter file tells you _what_ actually happened this quarter (e.g. "crude averaged $110/bbl in Apr–May"). If no playbook exists yet for an in-scope company's sector, note the gap — building one is valuable enough to flag to the user, following the shape of `fmcg-consumer-care.md` (sector-level reusable framework + a company note per name analysed).

## Step 4 — Project next-quarter Revenue / OPM / PAT / EPS

Combine guidance with YTD (9M) actuals and historical financials. Cleanest method when both are available:

```
Next-quarter estimate = FY guidance − YTD actual
```

Carry ranges. Where there's no full-year figure, extrapolate from the recent quarterly run-rate adjusted for stated seasonality and any new-capacity ramp. Always compute Revenue (with implied YoY/sequential growth), OPM, PAT, and EPS (PAT ÷ equity shares). **Strip one-offs from the base quarter first.** Show the maths; tag each input `[guided]`/`[actual]`/`[estimate]`.

**Model the two direct PAT levers explicitly** — they are usually where the PAT surprise actually comes from, and they're more bankable than a revenue guess: **(1) capex-live operating leverage** (incremental revenue on newly-commissioned capacity drops through at high incremental margin — a company can guide flat blended margin and still beat on PAT) and **(2) balance-sheet deleverage** (lower debt → lower interest → direct, near-arithmetic lift to PAT after tax). Put both in the bridge as named lines and net the capex interest/depreciation step-up against them, so the PAT beat is _attributable_. Method, formulae, and guardrails in `forward_estimation.md`.

This your-estimate is the input to the surprise in Step 5 — it is what you are comparing _against_ the street and the guide.

## Step 5 — Score the surprise, two benchmarks

A surprise needs a reference. Compute your Step-4 estimate against _both_:

**(a) Versus street/consensus.** Use research reports from top equity research firms (fetch these by searching the web) as a second opinion and to get street consensus estimates. `Surprise_street = (your estimate − street estimate) / street estimate`.

**(b) Versus guidance-implied.** The number the market reads straight off management's guidance (FY guide − YTD, taken at face value). `Surprise_guidance = (your estimate − guidance-implied) / guidance-implied`.

Report both, and **flag the divergence**: a name that beats street but not its own guide (street is lowballing) is a different setup from one that beats its guide but not street (street already expects the beat). Divergence is where the edge hides. Full framework, sourcing, and the sign/label conventions are in `surprise_scoring.md`.

## Step 6 — Valuation & expectations: is the beat already priced?

A surprise only moves a stock to the extent it wasn't expected, and price _is_ expectations. For each name read:

- **Research-report price targets and valuation models** from top equity research firms. Search the web for these reports. Note the upside/downside to target, and what growth the target implies.

Translate into an _expectations_ modifier on the surprise. Method in `valuation_and_expectations.md`.

## Step 7 — Historical post-event drift: is the surprise tradeable?

Knowing a beat is coming is worthless if the stock fades it. For each name, measure the forward return after its three information events:

- **After the last result** — available directly as a scan column (`Returns after result` / equivalent).
- **After the concall** and **after the transcript release** — _derived_: take the concall/transcript dates (recorded in Step 2) and the price history, and compute forward returns at +1D / +5D / +20D.

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

| Column                                                      | Source                                        |
| ----------------------------------------------------------- | --------------------------------------------- |
| Rank, Company, companyId, Sector                            | scan                                          |
| MCap, CMP                                                   | scan                                          |
| FY guidance (verbatim signal)                               | concall / PPT (Step 3a)                       |
| Tone / clarity read                                         | concall / PPT (Step 3b)                       |
| Validation: order book / capacity / business updates        | concall + scan + announcements API (Step 3b)  |
| YTD (9M) actual Revenue / PAT                               | concall / PPT / Result                        |
| **Est. next-Q Revenue / OPM / PAT / EPS**                   | Step 4                                        |
| **Surprise vs street**                                      | Step 5a (via web search for research reports) |
| **Surprise vs guidance**                                    | Step 5b                                       |
| Research report target upside                               | Step 6                                        |
| Screener Insights matrix (agree / contradict) + key ratios  | Step 3c                                       |
| Macro overlay (tailwind / headwind / non-factor, per event) | Step 3d — `quarterly_macro_context.md`        |
| Post-event drift (result / concall / transcript)            | Step 7                                        |
| **Composite surprise score + direction**                    | Step 8 rubric                                 |
| What could be wrong                                         | per-name risk                                 |

Below the master table, give a per-company deep-dive card (verbatim guidance quotes with speaker + date, the validation evidence, the next-quarter maths shown transparently, both surprises, the expectations and drift reads, and a "what could be wrong" block), then a cross-cutting risks section, an exclusions list split into **already-declared** and **no-concall/no-PPT**, and a result-day watchlist of the specific metrics to verify when each reports.

If the `visualize` tool is available, render the table through it; otherwise write the self-contained HTML file to `/mnt/project/data/agent-outputs/` and present it.

## Final self-audit (do not skip)

Before delivering: (1) re-run Step 0 and confirm no ranked name has declared in the interim; (2) spot-check one guided number, one 9M actual, one EPS, and one post-event return against source; (3) confirm the Screener session was authenticated for the run (no name silently ranked on a degraded page) and flag any name where Screener contradicted your call and you couldn't resolve it; (4) confirm `quarterly_macro_context.md` has a section for the quarter being scanned and that it was actually applied per name, not just read — a macro overlay that was fetched but never mapped to a name's sector is as good as skipped; (5) write the cross-cutting "what could be wrong with this ranking?" paragraph — selection bias from the scan filters, stale consensus, unaudited concall numbers, a market-wide move contaminating the drift history, an expired token degrading a source mid-run, or a macro event log that's gone stale (event unwound or reversed since it was logged — e.g. the Iran-war oil spike had already fully reversed by the time Q1FY27 results season started).
