---
name: investment-thesis-engine
description: >
  Maintains a constantly evolving Investment Thesis per company with an explicit
  BUY / ACCUMULATE / HOLD / REDUCE / SELL / AVOID signal, versioned history, and a
  monitoring checklist. Use whenever the user says "build a thesis for X", "update the
  thesis", "what's my thesis on X", "should I still hold X", "recompute the signal",
  "thesis review", "what changed since last quarter", or when any other skill
  (quarterly-result-analysis, fundamental-shift-scanner, management-credibility-tracker,
  forensic-accounting, consecutive-filings-diff, stage2-catalyst-analysis) produces new
  evidence for a company that has a thesis on file. The thesis is a living record: it is
  NEVER rebuilt from scratch when new data arrives — only the affected pillars are
  re-scored, evidence is appended, and the signal is recomputed deterministically.
  Canonical store: `data/theses.json` + `data/thesis-history.jsonl` (Data Ecosystem v2,
  synced to Drive `StockMarket/data/v2`). Write via `lib/db.js saveThesis(companyId, thesis)`.
---

# Investment Thesis Engine

A living, versioned Buy/Hold/Sell thesis per company. Built once, then evolved forever —
delta updates only. This is the top of the skill stack: it _consumes_ other skills'
outputs; it re-does none of their work.

**Philosophy (SOIC):** business first, stock price second. The signal follows four pillars —
**Theme** (where is the wind blowing), **Growth** (what truly drives it: volume, pricing,
operating leverage), **Valuation** (don't overpay, ever), **Promoter** (can minority
shareholders trust them) — gated by forensics and management credibility.

Read before any run:

- `references/thesis_schema.md` — the JSON/MD record format, including the required
  `companyId`/`creationTime`/`modifiedTime`/`creator` envelope fields per
  `skills/tooling/output-dto-standard/SKILL.md`.
- `references/signal_rules.md` — deterministic scoring → signal mapping. Signals must be
  reproducible from the recorded scores, never vibes.
- `skills/_shared/data-verification.md` — anti-hallucination protocol (mandatory).

## Storage contract

- **Source of truth (Data Ecosystem v2):** the theses collection — `data/theses.json`
  (current thesis per company, id = companyId) + `data/thesis-history.jsonl` (one line
  per version — append only, never rewrite). Write via
  `packages/jobs-runtime/lib/db.js` → `saveThesis(companyId, thesis)`; render the human
  memo to `data/assets/{TICKER}_thesis.md` from the JSON (JSON-first).
- **Sync:** end every run with `node packages/jobs-runtime/scripts/data.js push`
  (mirrors `data/` to Drive `StockMarket/data/v2`, push-only, keeps local files). The
  old `stockmarket-theses` Drive folder (ID `1MKK_WjVcvKCodIUaosTCZ8d_HXz6JPpL`) is
  LEGACY/read-only — migrated into the collection; do not write to it.
- On every run, load the existing thesis first (`db.get('theses', companyId)` — or
  `buildCompanyContext(companyId)` for the full research bundle). If versions
  diverge, the higher `version` number wins.

## Modes

### 1. `init` — build the first thesis (once per company)

1. Resolve ticker; fetch market anchors (CMP, P/E, MCap, promoter holding/pledge) per the
   anchor rules in `data-verification.md`.
2. Gather evidence by REUSING existing artifacts before fetching anything new: check
   `downloads/`, `data/`, prior skill outputs, and the user's company-research corpus
   (`companies/{Slug}/corpus/`) if present. Only invoke `stock-documents-fetcher` for gaps.
3. Score the four pillars (0–10 each, with dated, cited evidence):
   - **Theme** — sector tailwind/structural change; feed from `sector-research-deepdive` /
     `value-chain-analysis` / `market-share-analysis` if available.
   - **Growth** — triggers with quantified impact, timeline, conviction tags (delegate to
     `growth-triggers-1pager` logic); order book, capacity, guidance.
   - **Valuation** — current multiple vs history and peers, what's already in the price,
     base-case IRR (delegate to `financial-model` when a model exists).
   - **Promoter** — governance, remuneration vs PAT, pledge, RPTs (feed from
     `annual-report-analysis`), plus **credibility score** from
     `management-credibility-tracker`.
4. Run the gates: **forensic gate** (CLEAN / AMBER / RED from `forensic-accounting`) and
   record the **technical stage** (from `stage2-catalyst-analysis`, optional overlay).
5. Compute the signal per `signal_rules.md`. Write `version: 1`, the monitoring checklist
   (`monitorables[]` with metric, threshold, check-by date), and explicit
   `what_would_change_thesis` (upgrade AND downgrade conditions).
6. Write JSON + MD + history line; sync to Drive.

### 2. `update` — delta update (the normal case)

Triggered by: new quarterly result, new concall, material announcement, credibility-tracker
refresh, forensic re-run, price move that changes valuation materially, or a scheduled scan.

1. Load current thesis. Identify ONLY the pillars/gates the new evidence touches.
2. Append dated evidence entries (`evidence_log[]`) with source citations. Never delete old
   evidence; never re-derive untouched pillars.
3. Check each `monitorables[]` threshold against the new data — mark PASS/BREACH.
4. Re-score affected pillars, recompute signal deterministically, bump `version`.
5. If the signal changed, the MD memo MUST open with a "Signal change" block: old → new,
   the specific rule that fired, and the evidence line that triggered it.
6. Sync to Drive; append history line.

### 3. `review` — batch review across all theses

Iterate every `*_thesis.json` in the store. For each: check staleness (>1 quarter without
update = flag), re-anchor valuation to live CMP, run `fundamental-shift-scanner`-style
7-day announcement check, apply mode 2 for anything material. Output a one-table briefing:
Ticker | Signal (Δ) | Conviction | Stale? | Breached monitorables | Next catalyst.

### 4. `signal` — recompute only

Re-anchor market data, recompute signal from recorded scores. No document work.

## Output

Always: updated `{TICKER}_thesis.md` (the human memo — signal badge, conviction /10,
pillar scoreboard, top 3 triggers, top 3 risks, monitorables table, "what would change this
thesis", full evidence log at the bottom) + one-paragraph chat summary of what changed.
End every memo with the mandatory section **"What could be wrong with this analysis?"**

## Rules

- **Files-touched manifest (docs/DATA_RULES.md §7):** end the run by listing every file created/modified — collections with record counts (db.js helper stats / `db.touchedFiles()`), plus `runs/`/`cache/`/`assets/` files (`StorageService.touchedFiles()`), plus the `data:push` `↑ <file>` lines. A run that stored data without reporting what it touched is incomplete.

- **Never rebuild what exists.** A thesis update that re-fetches all documents is a bug.
- **Signals are deterministic** — apply `signal_rules.md`; if judgment overrides a rule,
  record the override and the reason in the JSON (`overrides[]`).
- **This is not investment advice** — the memo footer must carry the standard disclaimer;
  final decisions are Darshan's.
- Position-sizing language is allowed only as: High conviction / Standard / Tracking.
