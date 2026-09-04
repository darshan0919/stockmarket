---
name: stockscans-context-warm
description: Warm the Stockscans research-context cache (business overview, growth catalysts, latest concall notes) for the standing universe, so the daily scan skills get them as a free local lookup instead of a document read.
---

Run the warm job and report its output. **This job has no reasoning step** — do not
analyse, summarise, or interpret anything it fetches. It is a pure fetch-and-cache
script (conventions §17: Extraction is a script), and it exists so that
`gainers-signal`, `volume-rocketing`, `post-close-scan-insights` and
`announcement-info-classifier` can read Stockscans' own AI-synthesized research from
a local cache rather than re-deriving it from source documents.

```bash
yarn stockscans:warm --days 30 --limit 40
yarn data:push
```

`--limit` bounds one run's work; the cache makes runs resumable, so a capped run is
not a partial failure — the next run picks up exactly where this one stopped.

**40 is deliberate and low.** Stockscans rate-limits these endpoints hard: a single
run of 400 got 47 companies in before tripping the breaker (measured 2026-09-04),
and a run of 80 tripped it too. Filling a ~1,400-company universe is therefore the
job of many small runs across the day, not one big nightly sweep — which is fine,
because the cache TTL is 7 days and the universe turns over slowly. Raising this
number does not make the backfill faster; it just wastes the run on 429s.

Report verbatim from the script's JSON output: `universeSize`, `alreadyFresh`,
`attempted`, `cached`, `notCachedTransport`, `coverage`, `circuitBreakerTripped`.

Three things to actually flag rather than pass over:

- **`circuitBreakerTripped: true`** means Stockscans rate-limited us and the run
  stopped early. Nothing was cached for those companies (deliberately — see
  `stockscansContext.js`'s `classifyError`), so they stay pending. Say so; do not
  re-run immediately, and do not raise `--limit` in response.
- **`notCachedTransport` above ~10%** means the same thing in milder form: the run
  is pushing the endpoints harder than they want. Lower `--limit`, not concurrency.
- **A `coverage` figure that drops materially run-over-run** is worth naming. It is a
  share of successfully-cached bundles, so it should be stable (~90% business
  overview / ~90% growth catalysts / ~75% concall notes on the NSE names the daily
  skills actually use, measured 2026-09-04). A sharp fall means either the universe
  has shifted toward names Stockscans doesn't cover, or an endpoint changed shape.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute
`python scripts/metrics/track_invocation.py --name stockscans-context-warm --type task --model <the exact model executing this run>`.
No DTO is written by this job, so there is no `modelUsed` to set anywhere.
