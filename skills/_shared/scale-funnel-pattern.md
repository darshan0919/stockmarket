# The Scale-Funnel Pattern — running a per-company skill across hundreds of names without burning tokens

Any skill built for one company at conviction-note depth (a full LLM read of
several transcripts/PPTs/results) hits a wall the moment someone asks "run
this across my whole watchlist" or "run this for 100s of companies every
day." The naive move — invoke the same skill N times — multiplies the most
expensive step (flagship-model synthesis) by N, even though on most days
most companies have nothing new to say. This doc names the pattern already
implemented independently in `guidance-document-extractor` and
`quarterly-result-extractor`, so the next skill facing this question can
reuse the shape instead of re-deriving it.

## The four stages

**Stage 0 — deterministic pre-filter (script, zero LLM).** Before any model
call, ask what's computable: has anything changed since the last run for
this company? A script diffs the company's latest filings/DB record against
what's already stored (the `buildCompanyContext(companyId)` pattern, per
`skills/_shared/conventions.md` §8) and only passes through companies with a
new Result/PPT/Transcript/announcement, a numeric delta (order book,
shareholding, price/volume), or a date crossed (capex commissioning,
lock-in expiry). This is the single highest-leverage step — on a typical
day it can cut a 100-company universe to 10-20 candidates before any text
is read. `watchlist-catalyst-scanner`'s Step 1-2 (fetch scan + announcements
in bulk, `catalyst_rules.classify()`) is this stage implemented for
announcement-driven catalyst detection.

**Stage 1 — cheap-model recall-first extraction, not synthesis.** For
companies that pass Stage 0, the next step is NOT "run the flagship model
over the full document." It's a recall-first excerpt pass: pull every
passage that plausibly matters (a number near a forward-period cue, a
signature phrase from a taxonomy table, a KPI outside the P&L) without
judging what it means. `guidance-document-extractor` Step 2 and
`quarterly-result-extractor` Step 3 both do exactly this, and both are
explicit that "cheap model" means *whichever agent is already running the
skill does this itself, or spawns a cheap-tier subagent* — it does NOT mean
a separately-billed call to an external provider's API using a stored key.
The point isn't which model executes it; it's that the JOB is recall
(complete but undiscriminating), not judgment, so it tolerates a
lower-capability or lower-effort pass. Report the compression ratio
achieved (raw text size vs. excerpt size) every run — this is the token
line-item that actually matters at scale.

**Stage 2 — a cheap deterministic or lightweight scorecard, only where
judgment is genuinely required.** Some triage signals are fully computable
from structured data already in hand (growth rates, ROCE/debt trend,
scan-column deltas) — script those, don't spend a model call on arithmetic.
Only the handful of signals that need reading text (sector tailwind read,
demand-visibility read, tone shift) should go to a model, and even then at
low effort/cheap tier. `rerating-catalysts`' J-curve scorecard
(`references/growth_catalyst_framework.md` §5c) is a worked example, and an
honest illustration of the limit of this stage: `computeJCurveScore()` in
`stock-api/src/analyzers/catalystRules.js` can currently only compute 1 of
the 9 points (a relative-strength proxy for revenue acceleration) from the
scan-table columns available today — the other 8 (sector tailwind, demand
visibility, new capacity/product/customer, margin expansion, debt/ROCE
trend, guidance upgrades) genuinely need either richer structured columns
that don't exist yet, or a filing read. **Do not force a full score by
guessing** — an unscored point must return `null`, never a defaulted `0`
or `1`, so a partial score is never mistaken for a complete one downstream.
Expanding Stage 2's computed coverage over time (as richer scan columns
become available) is legitimate incremental work; inventing proxies to
make the score look more complete than it is defeats the point of this
stage.

**Stage 3 — flagship-model synthesis, reserved for survivors only.** The
expensive step (multi-document read, ranked catalyst writeup, 3-basket
interpretation, whatever the skill's actual deliverable is) runs only on
the companies that cleared Stages 0-2 — typically a handful, not hundreds.
This is where `rerating-catalysts`, `quarterly-result-analysis`, and
`forward-guidance-extractor` do their real work, each reading the durable
DB record a Stage-0/1 extractor persisted rather than re-fetching.

## Persistence is what makes the funnel cheap on the SECOND run, not just the first

Every implementation of this pattern persists a durable DB record per
company after Stage 1 (`guidance-documents`, `quarterly-result-documents`),
including an explicit "nothing found" record when the company had nothing
new — this is what lets the next day's run distinguish "never checked" from
"checked, genuinely quiet" without re-fetching or re-reading. A company that
was quiet yesterday and is still quiet today should cost zero LLM tokens on
today's run, not repeat Stage 1. This is also why raw downloaded PDFs are
never persisted (`skills/_shared/conventions.md` §6) — they're re-fetchable
source, not the durable artifact; the durable artifact is the extracted
JSON.

## When NOT to reach for this pattern

A skill invoked for one named company at a time (the common case for most
of this repo's skills) doesn't need a funnel — building one adds
indirection for no benefit. This pattern earns its complexity only when the
actual ask is "run this across N companies, repeatedly, on a schedule" —
watchlist-scale or scan-scale invocations, not a single conviction note.

## Applying this to a new skill

1. Identify what's cheaply computable about "has this company changed"
   before any model call — usually a diff against the last stored record.
2. Split the skill into an extractor (Stage 0-1, scripts + cheap-tier
   recall pass, persists a DB record) and an analyzer (Stage 3, reads the
   DB record, does the actual judgment) — the existing two-skill pipelines
   (`guidance-document-extractor`→`forward-guidance-extractor`,
   `quarterly-result-extractor`→`quarterly-result-analysis`) are the
   reference implementation of this split.
3. If a numeric triage scorecard makes sense for the domain, compute as
   much of it as possible from structured data and reserve model judgment
   for the few points that genuinely require reading text.
4. Report compression ratios and call counts every run (per
   `skills/_shared/conventions.md` §11) — this is the visible proof the
   funnel is working, not scaling with company count.

## Related

- [`skills/_shared/conventions.md`](conventions.md) §6 (re-fetchable source
  vs. durable record), §8 (`buildCompanyContext`), §11 (token-optimization
  reporting), §14 (throwaway-watchlist bulk-lookup pattern).
- `guidance-document-extractor` / `forward-guidance-extractor` — reference
  implementation for a batch/scan-scoped pipeline.
- `quarterly-result-extractor` / `quarterly-result-analysis` — reference
  implementation for a per-company extractor/analyzer split.
- `watchlist-catalyst-scanner` — reference implementation of Stage 0-2 for
  announcement-driven catalyst detection at watchlist scale; its
  `scanCatalysts.js` attaches `computeJCurveScore()`'s output to every alert
  and to a `jcurveByCompany` map in its JSON output.
- `rerating-catalysts` — a second, independent worked example of Stages
  0-2 for a *different* trigger (its own last-run DB record, not the
  announcement scan):
  `scripts/prefilter_rerating_candidates.js` (Stage 0 — diffs each company
  against its last `rerating-catalysts` report), `scripts/extract_rerating_signatures.py`
  (Stage 1 — regex recall pass over the "new"-category taxonomy in
  `references/growth_catalyst_framework.md` §2), and `computeJCurveScore()`
  (Stage 2, shared with `watchlist-catalyst-scanner` since it lives in
  `catalystRules.js`) — see that skill's own "Running this across many
  companies" section for how the three compose.
