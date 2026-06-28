---
name: pre-pead-scanner
description: Pre-results conviction scanner for Indian listed companies. Given a Stockscans saved-scan URL of companies about to report, it reads each one's latest concall, extracts revenue/margin/PAT guidance, validates it against order book, capacity, utilisation and history, projects next-quarter Revenue/OPM/PAT/EPS, and ranks every name highest-to-lowest conviction in an HTML table. Use when the user provides a Stockscans saved-scan URL and asks to find pre-results candidates, rank companies before earnings, estimate next quarter from guidance, build a pre-PEAD briefing, or get a guidance-vs-capability ranking ahead of a results season. Auto-fetches concalls; excludes names already declared or lacking a prior-quarter concall.
---

# Pre-PEAD Scanner

Turns a Stockscans saved-scan of soon-to-report companies into a conviction-ranked, next-quarter estimate table. A scan tells you *who* reports next; this skill tells you *which of them management has set up to beat* — by reading what they guided and checking whether the order book, capacity, utilisation and history actually support it.

The deliverable is one institutional HTML briefing: a master table sorted highest-conviction -> lowest, each row carrying the extracted guidance, the validation evidence, and a back-computed Revenue / OPM / PAT / EPS estimate for the upcoming quarter, plus a per-name "what could be wrong" flag.

This is a **business-first, guidance-vs-capability** workflow. A confident management quote is worthless if the order book or capacity can't honour it; a quiet management with a full order book and idle capacity is the real signal. Weight evidence over tone.

## When to use this skill

- User pastes a Stockscans saved-scan URL (`https://www.stockscans.in/scans/saved/<id>`) and asks to work through the companies before results
- "rank these companies by conviction before earnings", "which will beat next quarter", "pre-PEAD candidates", "estimate next quarter for each of these"
- A results season is approaching and the user wants a screen of names where management guidance looks credible and *deliverable*
- The user has a saved scan built around `Days From Result` (companies about to report) and wants it turned into an actionable pre-results briefing

Do **not** use this for a single named stock (use `growth-triggers-1pager` or `equity-research-deepdive`), for post-results interpretation (use `quarterly-result-analysis`), or for a two-quarter forensic diff (use `consecutive-filings-diff`).

## The workflow at a glance

Six steps, run in order — each gates the next. A company that fails an early gate drops out and is reported as *excluded*, never silently dropped. **Read `references/workflow.md` for the commands, decision rules, and gates before starting** — it is the operational heart of this skill.

1. **Resolve the scan -> universe.** `scripts/run_scan.py <SCAN_URL>` fetches the live saved-scan definition and returns the matching companies, keyed by `companyId`.
2. **Drop already-declared names** — `Last Result Date` plus a `Result`-document check.
3. **Drop names with no prior-quarter concall** — `Transcript`-document check (PPT-only -> degraded scope; nothing -> excluded).
4. **Read the concall: extract guidance, then validate it** against order book, capacity, utilisation and history. Fetch more concalls if guidance-drift needs checking. Framework in `references/guidance_extraction.md`.
5. **Extrapolate next-quarter Revenue / OPM / PAT / EPS** — `FY guidance - YTD actual`, else run-rate x seasonality. Method in `references/forward_estimation.md`.
6. **Rank by conviction and render** the HTML briefing using `assets/briefing_template.html`.

## Core principles

**Live definition, every time.** The scan runner re-fetches the saved-scan definition on each run. Users edit their saved scans (filter thresholds, result-window days); the skill must reflect the current definition, not a cached one.

**Evidence over tone.** A CEO sounding confident is not evidence. Order book covering the guided revenue, commissioned capacity with utilisation headroom, and a run-rate consistent with the implied jump — that is evidence. Rank on evidence. When tone and evidence diverge, say so explicitly (chairman-vs-CFO asymmetries and guidance walk-backs are material signals).

**Strip one-offs before extrapolating.** Reported PAT often contains deferred-tax credits, forex, one-time provisions, inventory losses. Distinguish reported from cleaned earnings before projecting, or the EPS estimate inherits the noise.

**Show the maths.** Every next-quarter estimate must be reconstructable from the inputs shown. Tag each input `[guided]` / `[actual]` / `[estimate]`. Never present an analyst estimate as company guidance.

**Honest exclusions.** A company excluded for already declaring, or for having no concall, is part of the output — list it with its reason. The reader needs to know the universe wasn't cherry-picked.

**Self-audit before finalising.** Re-run the scan immediately before delivering and confirm none of the ranked names declared results in the interim. Spot-check headline figures (a guided number, a 9M actual, an EPS) against source.

## Reference files

- `references/workflow.md` — the six-step mechanics: commands, gates, and decision rules. **Start here.**
- `references/scan_api.md` — the saved-scan and scan-run endpoints; response shape; column glossary.
- `references/guidance_extraction.md` — extracting revenue/margin/PAT guidance, the tone/clarity read, the order-book/capacity/utilisation/history validation, guidance-drift tracking, and the conviction-tier rubric. Read before analysing the first company.
- `references/forward_estimation.md` — next-quarter Revenue/OPM/PAT/EPS extrapolation, the OPM->PAT bridge, one-off stripping, and EPS share-count gotchas.
- `assets/briefing_template.html` — the conviction-sorted master table + deep-dive card structure for the HTML deliverable.

## Dependencies

- `stock-documents-fetcher` (sibling skill) — used in Steps 2-4 to fetch results, transcripts, PPTs.
- A valid Stockscans `authtoken` — resolved by both scripts from `--authtoken-file`, `STOCKSCANS_AUTHTOKEN`, or `/mnt/project/Stockscans_authtoken`. On a 401/403, the token expired — ask the user to refresh it from the browser.
