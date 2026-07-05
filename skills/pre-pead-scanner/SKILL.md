---

## name: pre-pead-scanner
description: Institutional-grade pre-results EARNINGS-SURPRISE predictor for Indian listed companies. Given a Stockscans saved-scan URL of companies about to report (defaults to https://www.stockscans.in/scans/saved/429918e3098ce660baec9f22 if none provided), it reads each survivor's latest concall AND investor PPT, extracts revenue/margin/PAT guidance, validates it against order book / capacity / utilisation / history / important business updates from last quarter (press releases, order book, commencement of plant etc. via company announcements API), projects next-quarter Revenue/OPM/PAT/EPS, then scores the SURPRISE two ways — versus street/research-report estimates (from top equity research firms via web search) AND versus the number management's own guidance implies — layered with the stock's historical drift after result/concall/transcript (is the surprise tradeable?). Cross-checks every name against Screener.in's key trackables insights matrix as an independent second opinion, and runs a session-token preflight that halts and prompts the user if the Stockscans or Screener cookies have expired. Ranks every name by a composite surprise score in an HTML briefing. Use when the user wants to predict earnings surprises, find pre-results candidates, rank companies before earnings, estimate next quarter, build a pre-PEAD briefing, or screen for beats/misses ahead of a results season. Auto-fetches concalls, PPTs, and price history; excludes already-declared and no-concall/no-PPT names.

# Pre-PEAD Scanner — Earnings-Surprise Predictor

Turns a Stockscans saved-scan of soon-to-report companies into a **surprise-ranked** briefing: for each tradeable name, which way it is likely to surprise, by how much, against what the street and management are each expecting, and whether that surprise has historically been worth trading.

The deliverable is one institutional HTML briefing — a master table sorted by composite surprise score, each row carrying the extracted guidance, the capability validation, a back-computed Revenue / OPM / PAT / EPS estimate, the **surprise versus street consensus** and the **surprise versus guidance**, the historical post-event drift, and a per-name "what could be wrong" flag.

## The thesis

Post-earnings-announcement drift (PEAD) exists because the market under-reacts to genuine surprises. To harvest it pre-results you need four things to line up, and the ranking is built to check all four:

1. **A surprise is coming** — your independent next-quarter estimate diverges from what others expect. "Others" is two audiences: the **street** (research-report/consensus estimates) and the **market's read of management guidance**. A number that beats both is the cleanest setup; a number that beats one but not the other is where the interesting disagreements live.
2. **The company can actually deliver it** — order book, commissioned capacity, utilisation headroom and run-rate/seasonality support the number. A confident quote is not evidence; a booked order book is. Weight evidence over tone.
3. **The surprise is tradeable** — some stocks systematically "sell the news". Historical drift after result/concall/transcript tells you whether a beat actually moves *this* stock.

## When to use this skill

- User asks to predict surprises / rank names before results. If they provide a Stockscans saved-scan URL (`https://www.stockscans.in/scans/saved/<id>`), use it; otherwise use the default `https://www.stockscans.in/scans/saved/429918e3098ce660baec9f22`.
- "which will beat next quarter", "predict earnings surprise", "pre-PEAD candidates", "estimate next quarter for each of these", "who beats consensus".
- A results season is approaching and the user wants a screen of names set up to surprise, ranked by how tradeable that surprise is.

Do **not** use this for a single named stock (use `growth-triggers-1pager` or `equity-research-deepdive`), for post-results interpretation (use `quarterly-result-analysis`), or for a two-quarter forensic diff (use `consecutive-filings-diff`).

## The workflow at a glance

Nine steps, run in order — each gates or feeds the next. A company that fails a gate drops out and is reported as *excluded*, never silently dropped. **Read `references/workflow.md` for the commands, decision rules, and gates before starting** — it is the operational heart of this skill.

**Preflight — verify session tokens first.** Before anything, confirm the **Stockscans** and **Screener.in** tokens in `.env` are live. If either has expired, **STOP and tell the user which `.env` key to refresh** (with how) — do not run the ranking on half-authenticated data. See `references/screener_insights.md`.

1. **Resolve the scan → universe.** `run_scan` fetches the live saved-scan definition and returns the matching companies. Use the default scan if the user didn't specify one.
2. **Drop already-declared names** — `Last Result Date` + a `Result`-document check.
3. **Drop names with no prior-quarter concall or PPT** — `Transcript` and `PPT` document check (must have at least one). Read BOTH the concall and the PPT.
4. **Read the concall and PPT: extract guidance, then validate capability** against order book, capacity, utilisation and history. Fetch prior concalls to track guidance drift. Use `stock-api/src/fetchers/announcementsFetcher.js` to fetch important business update documents (press releases, order book, plant commencement) from the last quarter using proper keywords, and use these to strengthen the analysis. Framework in `references/guidance_extraction.md`.
5. **Project next-quarter Revenue / OPM / PAT / EPS** — `FY guidance − YTD actual`, else run-rate × seasonality, one-offs stripped, with the **two direct PAT levers modelled explicitly**: capex-live operating leverage and balance-sheet deleverage. Method in `references/forward_estimation.md`.
6. **Score the surprise two ways** — versus street/research-report estimates (search the web for top equity research firm reports as second opinions) AND versus guidance-implied. Where they diverge, say so; divergence is signal. Framework in `references/surprise_scoring.md`.

- **(3c) Screener insights cross-check** — pull Screener.in's key trackables insights matrix (the "Insights" table) and key ratios (ROCE/ROE, debt) as an independent second opinion; corroborate or challenge the concall thesis before ranking. See `references/screener_insights.md`.

1. **Expectations via research reports** — use research-report price targets and valuation models to assess if the beat is already priced in. See `references/valuation_and_expectations.md`.
2. **Measure historical post-event drift** — returns after the last *result*, after the *concall*, and after the *transcript* release, so you know whether a beat is tradeable in this name. Result-return is a scan column; concall/transcript returns are derived from doc dates + price history. See `references/post_event_returns.md`.
3. **Composite surprise score → rank → render** the HTML briefing using `assets/briefing_template.html`.

## Core principles

**Two benchmarks, always.** "Surprise" is meaningless without a reference. Score every name against *both* the street (research/consensus from top equity firms) and management guidance, and flag the gap. A beat versus a lowballed street estimate is a different trade from a beat versus an aggressive guide. Never collapse the two into one number without showing both.

**Evidence over tone.** A CEO sounding confident is not evidence. Order-book coverage of the guided revenue, commissioned capacity with utilisation headroom, recent business updates (like press releases for plant commencement), a run-rate consistent with the implied jump — that is evidence. Rank on evidence. When tone and evidence diverge, say so.

**Is the beat already priced?** A surprise only moves a stock to the extent it wasn't expected. Use top equity research targets and models as a read on expectations.

**Tradeable, not just true.** A correct beat prediction earns nothing if the stock fades every good result. Use the historical drift after result/concall/transcript to separate names where surprises *stick* from "sell-the-news" names.

**Follow the PAT, not just the topline — through the two direct levers.** Most earnings surprises are made below the revenue line. Model both structural PAT levers explicitly and net them: **capex-live operating leverage** (incremental revenue on newly-commissioned capacity drops through at a high incremental margin, so a company can guide flat blended margin and still beat on PAT) and **balance-sheet deleverage** (lower debt → lower interest → a direct, near-arithmetic lift to PAT after tax). Both are more bankable than a revenue guess and are often what the market misses; a beat attributable to them is higher-conviction. Net the capex depreciation/interest step-up against the leverage gain so the PAT beat is honest and attributable.

**Strip one-offs before extrapolating.** Reported PAT often carries deferred-tax credits, forex, one-time provisions. Distinguish reported from cleaned earnings before projecting, or the EPS estimate — and the surprise — inherit the noise.

**Show the maths, tag every input.** Every estimate and every surprise must be reconstructable from the inputs shown. Tag each input `[guided]` / `[actual]` / `[estimate]` / `[consensus]` / `[market]`. Never present an analyst estimate as company guidance, or a guidance-implied number as street consensus.

**Cross-check with Screener, don't average.** Screener.in's key trackables insights matrix and key ratios are an independent, filings-based read on the same name. When they agree with your concall-built thesis, conviction rises; when they contradict it (you project a beat, Screener flags "poor quarter" or rising debt), that disagreement is a signal to resolve *before* ranking — never silently average the two. And never run on an expired Screener session: a stale token degrades the page to a thin public view, so verify the token in preflight and halt if it's dead.

**Honest exclusions.** Already-declared and no-concall/no-PPT names are part of the output — list each with its reason. The reader must know the universe wasn't cherry-picked.

**Self-audit before finalising.** Re-run the scan immediately before delivering and confirm none of the ranked names declared in the interim. Spot-check a guided number, a 9M actual, an EPS, and one post-event return against source. Ask "what could be wrong with this ranking?" and record the answer per name and once across the whole screen — this is a requirement, not a nicety.

## Reference files

- `references/workflow.md` — the nine-step mechanics: commands, gates, decision rules. **Start here.**
- `references/scan_api.md` — the saved-scan and scan-run endpoints; response shape; column glossary (incl. valuation, and post-result-return columns).
- `references/guidance_extraction.md` — extracting revenue/margin/PAT guidance, the tone/clarity read, the order-book/capacity/utilisation/history validation, guidance-drift tracking, and the capability tier. Read before analysing the first company.
- `references/forward_estimation.md` — next-quarter Revenue/OPM/PAT/EPS extrapolation, the OPM→PAT bridge, one-off stripping, EPS share-count gotchas.
- `references/surprise_scoring.md` — the two-benchmark surprise (vs street, vs guidance), sourcing research-report estimates, the composite surprise score and rank rubric.
- `references/valuation_and_expectations.md` — research-report targets & valuation models, and the "is the beat priced in?" read.
- `references/post_event_returns.md` — deriving returns after result/concall/transcript, the drift signature, and translating it into tradeability.
- `references/screener_insights.md` — the Screener.in key trackables insights matrix + key-ratios cross-check, the insight tags that move a surprise call, and the session-token preflight/expiry handling.
- `assets/briefing_template.html` — the surprise-sorted master table + deep-dive card structure for the HTML deliverable.

## Dependencies

- `stock-documents-fetcher` (sibling skill) — used in Steps 1–3 to fetch results, transcripts, PPTs, and in Step 6 to pull any broker/research PDFs the user supplies.
- Analyzer helpers in `stock-api/src/analyzers/`: `runScan.js` (`resolveUniverse` with the built-in liquidity gate), `postEventReturns.js` (forward drift from price history + event dates), and `screenerInsights.js` (`parseScreenerInsights` + `detectAuthState`); client `stock-api/src/clients/ScreenerClient.js`.
- **Two session tokens in `.env`, both of which expire:**
  - Stockscans `authtoken` → `STOCKSCANS_AUTH_TOKEN` (also resolvable from `--authtoken-file` or `/mnt/project/Stockscans_authtoken`). On 401/403 it's expired.
  - Screener.in session → `SCREENER_SESSIONID` + `SCREENER_CSRFTOKEN` (or a full `SCREENER_COOKIES` header). An expired `sessionid` silently degrades the page to a thin public view.
  Run the **preflight token check every time**; if either is dead, halt and tell the user exactly which `.env` key to refresh (copy the cookie from the site's DevTools → Application → Cookies) before re-running.

