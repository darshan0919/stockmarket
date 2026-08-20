# IPO Subscription Quality Ranking Framework

Reference for the deterministic `subscriptionQualityScore` computed in
`packages/jobs-runtime/ipoSubscriptionScanner.js` (`computeSubscriptionScore`) and for
the judgment-layer narrative the `ipo-subscription-ranker` skill writes on top of it.
The formula and its weights live in code; this document is the citation trail for
_why_ those weights were chosen, and the read the LLM step should apply when writing
per-IPO rationale (never just repeat the raw multiples).

## Source basis

This framework was scoped against four SOIC (Sovereign Investment/Old-school-value
style) YouTube videos on evaluating IPO subscription quality, which the user linked
as the design brief for this job:

- https://www.youtube.com/watch?v=yRzrR4RD4lU
- https://www.youtube.com/watch?v=wl6Eq5MOXlI
- https://www.youtube.com/watch?v=mQspsAvbS-w
- https://www.youtube.com/watch?v=fiLVHI8CUZE

Video transcripts were not directly accessible to the agent that authored this
framework (no transcription tool was invoked against them in this run — flagged
explicitly per the anti-hallucination convention rather than inventing quotes). The
weights below are instead grounded in the same widely-taught QIB/HNI/RII read these
videos are built on — corroborated via web search against multiple independent
IPO-education sources (cited per section). **Follow-up recommended**: watch/transcribe
the four videos once and diff their specific heuristics against this doc; tighten the
weights in `ipoSubscriptionScanner.js` if they prescribe something materially
different (e.g. a different QIB threshold banding, a specific sHNI/bHNI leverage-cost
adjustment). Track that as a TODO on this skill rather than silently drifting.

## Why QIB gets the largest weight (0.40)

Qualified Institutional Buyers (mutual funds, insurance, FPIs, banks) do their own
due diligence — often direct management engagement — before bidding, and are
structurally the largest allocation category (up to 50% of a book-built issue).
Multiple independent sources converge on the same read: heavy QIB demand is a more
substantive confidence signal than retail enthusiasm, which is more sentiment/GMP-
driven; QIB subscription >10x is "strong," >30x is "very strong institutional
interest," and QIB <1x usually means professional money finds the valuation
unappealing. [BlinkX](https://blinkx.in/en/knowledge-base/ipo/what-is-qualified-institutional-buyers-in-ipo),
[Kotak Neo](https://www.kotakneo.com/investing-guide/articles/qib-in-ipo-meaning-role-importance/),
[m.Stock](https://www.mstock.com/articles/qib-route-for-ipo-listing).

## Why HNI/NII gets a moderate, split weight (bHNI 0.14, sHNI 0.11)

NII/HNI demand is split into sNII (₹2L–₹10L applications) and bNII (>₹10L,
frequently leverage/NBFC-funded). Rupeezy's investor-education notes flag that bNII
demand is more leverage-driven and short-horizon (listing-gain-oriented) than QIB
demand, which is why it's weighted below QIB but still meaningfully above a pure
noise floor — big-ticket HNI money still requires real conviction to borrow against.
[Rupeezy](https://support.rupeezy.in/support/solutions/articles/21000005183-what-are-the-retail-hni-and-qib-categories-in-an-ipo-),
[5paisa](https://www.5paisa.com/blog/what-are-qib-hni-retail-investors-in-ipo).

## Why RII gets a smaller weight (0.20) despite often being the loudest number

Retail subscription is the most sentiment/grey-market-premium-driven category and the
easiest to inflate via social buzz without underlying business conviction — a
"balanced subscription profile is the healthiest sign," not a retail-only spike.
[IPOMarket.in](https://www.ipomarket.in/news/ipo-subscription-status-explained-qib-nii-retail),
[IndMoney](https://www.indmoney.com/learn/ipo/ipo-subscription-status).

## Why Total Subscription is kept as a small cross-check term (0.15)

Total subscription is a derived/blended figure (weighted by reserved-category size,
not investor quality), so it's kept as a lightweight sanity check rather than a
primary signal — a headline "100x subscribed" driven almost entirely by retail/HNI
with weak QIB should NOT outrank a more QIB-heavy, lower-headline-multiple IPO.

## Anchor participation bonus (+0.05, flat)

Anchor investors bid a day ahead of the public issue at a fixed price with a lock-in,
so anchor book quality is a genuine pre-commitment signal, not retroactive
subscription noise. The scanner only captures _whether_ anchors participated
(boolean, from IPOPlatform's summary column) — the skill's LLM step should upgrade
this to a qualitative read (marquee vs boutique allottees) only for the top-3 IPOs
that get a full `drhp-ipo-analysis` pass, per that skill's §17 "Anchor Investors"
requirement (uses `WebSearch` to find the published allottee list — the anchor list is
rarely in the DRHP/RHP text itself).

## Log-scaling — why raw multiples aren't used directly

Every category multiple is transformed via `log10(1 + x)` before weighting. Multiples
in this market range from <1x to 1000x+ on hot SME issues; without log-scaling, one
freak 500x sHNI print would dominate every other signal in the sum regardless of QIB
quality. Log-scaling preserves ranking order within a sane dynamic range while still
rewarding genuinely exceptional demand.

## Backtesting the formula

`packages/jobs-runtime/ipoBacktest.js` scores every IPO that listed in a trailing
window (default 3 months, any window via `--from`/`--to`/`--months`) against ACTUAL
listing-day gain and current CMP performance, using the exact same
`lib/ipoScoring.js` formula the live daily scanner uses — see that script's header
for the two data sources (IPOPlatform's performance-tracker API for outcomes, each
IPO's permanent `/ipo/subscription/<slug>/<id>` page for the historical category
multiples). Run it with `yarn ipo-backtest -- --months 3` (or via
`node packages/jobs-runtime/ipoBacktest.js --months 3`); output is a `reports.json`
DTO (`type: ipo-scoring-backtest`) with per-IPO records plus Pearson correlations,
tier-bucket win-rates, and top/bottom-quintile spread against both outcome metrics.

**First live run (2026-05-09..2026-08-09, all types, n=77 scored):** the composite
score correlates with listing-day gain at r=0.66 and with current CMP performance at
r=0.45 — both clearly positive, i.e. the formula has real predictive signal, not
noise. Individually, QIB correlated highest with both outcomes (r=0.70 listing gain,
r=0.51 current performance) — consistent with this doc's rationale for giving it the
largest weight. RII correlated weakest (r=0.59 / r=0.25) — also consistent with
retail being the most sentiment-driven, least differentiating signal, supporting its
lower weight. STRONG-tier IPOs averaged +26% listing gain (88% win rate) vs
WEAK-tier's -6.6% (18% win rate); top-quintile-by-score IPOs beat bottom-quintile by
a 47-61 percentage-point spread on both outcomes. The POOR tier had only n=2 in this
window — too sparse to draw a conclusion; re-check with a longer window before
trusting its bucket stats. Re-run this backtest periodically (window rolls forward)
and update this note — don't let it go stale as the only "does this actually work"
evidence on file.

### Data-availability ceiling on the granular formula (found running a 10-year backtest, 2026-08-09)

Attempting a 10-year backtest surfaced a real constraint worth knowing before trying
to extend the window further back: **IPOPlatform's per-IPO subscription detail page
(`/ipo/subscription/<slug>/<id>`) only carries the granular QIB/sHNI/bHNI/RII/Anchor
JSON-LD breakdown for IPOs listing from ~2025-09-24 onward.** Pages for older IPOs
return HTTP 200 with a genuinely empty `itemListElement` (`numberOfItems: 0`) —
confirmed directly against well-known names (Northern Arc Capital [2024-09-24],
Rikhav Securities [2025-01-22], both 0 items) — this is a third-party data-source
ceiling, not a bug in `parseSubscriptionDetail()`. So the actual weighted composite
score (this doc's formula) can only be backtested over roughly the last 10-11 months
of history, not further back, no matter how the fetch/parse logic is improved.

`ipoBacktest.js --index-only` works around this for a **coarser but full-history**
check: the performance-tracker's own index API carries a `subscription` field (Total
Subscription multiple only, no category split) populated back through at least 2023
and likely the full ~20-year dataset (2313 total IPOs on record since 2006). This
mode skips the per-IPO detail fetch entirely (no bounded-fan-out network cost — a
10-year run completes in single-digit seconds vs the ~2.5 minutes a ~230-IPO/quarter
granular run takes), trading the QIB/HNI/RII split for reach.

**10-year `--index-only` run (2016-08-09..2026-08-09, all types, n=1874 IPOs — by far
the largest sample run to date):**

- Total-subscription vs listing-day gain: **r = 0.62** — the "does high subscription
  predict a listing pop" signal holds up strongly across a full decade and multiple
  market cycles (2016-2020 sluggish IPO market, 2020-21 COVID boom, 2022 correction,
  2023-2026 SME boom), not just the current hot window.
- Total-subscription vs raw (non-time-normalized) current performance: **r ≈ 0.01 —
  essentially zero**, and tier/quintile ordering actually inverted (POOR tier showed
  the highest raw mean return). This is NOT evidence the signal is worthless — it's a
  measurement artifact: raw `cmp/offer-1` mixes a 2017 IPO that's had 9 years to
  compound with a 2026 IPO that's had 2 weeks, so "current performance" was dominated
  by holding-period length, not subscription quality, once the sample spans a decade.
- Fixed by adding `currentPerformanceAnnualizedPct` (CAGR from listing date to
  today, floored at a 90-day minimum hold and clipped to ±500% — both needed after a
  first attempt with a 30-day floor and no clip produced a tier mean of **16,126%**
  driven by a single short-hold outlier; see the clip constant's comment in
  `ipoBacktest.js` for the full story). With that fix: total-subscription vs
  annualized current performance is **r ≈ 0.11** — positive, real, but visibly weaker
  than the listing-gain relationship, and tier medians (STRONG +4.7%/yr, MODERATE
  -0.7%/yr, WEAK -6.8%/yr) are the more trustworthy read than tier means for this
  metric (annualized figures are still outlier-prone even after clipping — prefer
  `medianPct` over `meanPct` when citing `vsCurrentPerformanceAnnualized`).

**What this means for improving the formula:** the current weighting is well-
supported as a **short-horizon (listing-day) signal** — that's what the daily
ranker's email should be understood to predict. Its power as a **longer-horizon
investment-quality signal is real but much weaker** (r≈0.11, not r≈0.6). Two concrete
follow-ups this suggests, neither implemented yet:

1. The `ipo-subscription-ranker` skill's per-IPO `subscriptionView` language should
   not imply long-term investment merit from the subscription score alone — that
   judgment call belongs to `drhp-ipo-analysis`'s fundamentals-based verdict, not this
   demand-side score. Worth an explicit line in that skill's Phase 3 instructions if
   it doesn't already make this distinction clearly.
2. If a genuinely long-horizon-predictive formula is wanted, it likely needs
   fundamentals-side inputs (P/E vs peers, revenue/PAT growth, sector) blended in —
   subscription data alone is structurally a demand/sentiment signal, and demand
   signals decaying in predictive power over multi-year horizons is the expected
   result, not a sign the formula is broken.

### Daily/weekly CAGR supersedes annualized as the outcome metric (2026-08-09)

The annualized metric above technically fixes the holding-period confound but
over-corrects: annualizing extrapolates a realized short-window return out to a
full year, which is itself unstable (needed a 90-day floor + ±500% clip just to be
usable, and even then only kept 47-73 of 150 IPOs in the sample — everything younger
than 90 days got dropped entirely). Expressing the SAME realized compounding rate on
a **daily or weekly basis instead** (`(cmp/offer)^(periodDays/daysHeld) - 1`, i.e.
`periodDays=1` or `7` instead of `365`) needs no clip — the exponent is ≤1 (daily)
or ≤3.5x at the 14-day floor (weekly), nowhere near annual's up-to-122x exponent at a
3-day holder — and keeps nearly the full sample (only IPOs held <3 days for daily,
<14 days for weekly get dropped).

Re-running the same granular window (2025-10-10..2026-08-09, n=149) confirms this is
a real improvement, not just a different number:

| Outcome metric                         | n retained | composite-score r                        |
| -------------------------------------- | ---------- | ---------------------------------------- |
| raw current performance (no time norm) | 149        | not meaningful (holding-period confound) |
| annualized (90d floor, ±500% clip)     | 73         | 0.12                                     |
| **daily CAGR (3d floor, no clip)**     | **148**    | **0.29**                                 |
| **weekly CAGR (14d floor, no clip)**   | **132**    | **0.36**                                 |

Both daily and weekly keep far more sample than annualized and need no clip — either
is a legitimate default outcome metric for weight-tuning work; keep annualized only
for human-readable "%/year" reporting on longer-held stocks, never for statistical
work.

### Why the initial daily-vs-weekly comparison showed a gap (and why it wasn't real)

The first pass at this analysis read the table above as "weekly has more signal than
daily" (0.36 vs 0.29) and, further down, as "QIB's predictive edge takes a
week to show up" — QIB's raw per-category r looked like 0.27 on a daily basis vs 0.44
on a weekly basis, a suspiciously large jump for the same underlying relationship.
**That reading was wrong, and re-checking it live is exactly what the daily/weekly
change was for.**

The actual cause, found by recomputing each category's daily-basis r restricted to
the exact same records the weekly-basis calculation uses (same n, same IPOs): the two
matched almost exactly (QIB r=0.431 same-subset vs 0.436 weekly; every other category
agreed to within 0.005). Daily and weekly time-scale contribute essentially nothing
to the gap. The real cause is a **sample-composition artifact**: weekly's 14-day
minimum hold drops a handful of very-fresh listings (3-13 days old) that daily's
3-day minimum keeps. Those ~12 extra IPOs had a similar mean QIB multiple to the rest
of the sample but a **~4.5x higher standard deviation in daily return** (mean daily
CAGR 4.4% vs 0.16% for the rest — still riding first-week listing volatility). Pooling
a small, much-higher-variance subgroup into a correlation calculation dilutes the
pooled Pearson r even when the within-subgroup relationship is just as strong (that
12-IPO subgroup's own QIB-vs-return r was 0.44 — as strong as the rest) — a variance-
mismatch/pooling artifact, not a "daily granularity has less signal" finding.

**Fix applied in code:** `suggestWeights()`'s call site in `backtest()` now computes
BOTH the daily-basis and weekly-basis suggestion on the SAME record set — the
stricter (weekly, 14-day-floor) eligible subset applied to both — rather than letting
each metric silently pick its own independently-filtered sample. `suggestWeights()`'s
own docstring states this as a caller contract so a future two-basis comparison
doesn't reintroduce the bug. With the fix, daily-basis and weekly-basis suggestions
now agree closely (see the corrected table below) — which is itself confirmation the
fix worked, since there is no longer a first-principles reason for them to disagree.

**Lesson for reading any future backtest output**: a big gap between two supposedly-
equivalent cuts of the same analysis is a prompt to check whether they were actually
computed on the same sample before concluding it's a real economic effect — worth
remembering as a standing check, not just for this specific bug.

### `suggestWeights()` — a data-driven alternative weighting (not applied)

`ipoBacktest.js` now also computes a simple correlation-proportional alternative
weighting whenever the granular category data is available (`summary.suggestedWeights`,
skipped in `--index-only` mode). It floors negative correlations to 0 and normalizes
the rest to the same 1.0 weight budget as `SCORE_WEIGHTS` — a naive but interpretable
first pass, **not a real multivariate regression** (category multiples correlate with
each other, so a single-category Pearson r conflates that category's own signal with
how much it co-moves with the others; see the function's own header for the full
caveat). Both a daily- and a weekly-CAGR-basis suggestion are computed side by side,
now on the same underlying sample (see the diagnosis above) — agreement between the
two is itself a robustness signal, and after the fix they do agree closely.

From the same window, restricted to the 132 IPOs held ≥14 days (the common,
apples-to-apples sample both bases now use):

| Category           | Current weight | Suggested (daily basis) | Suggested (weekly basis) |
| ------------------ | -------------- | ----------------------- | ------------------------ |
| QIB                | 0.40           | 0.321                   | 0.325                    |
| bNII               | 0.14           | 0.21                    | 0.207                    |
| sNII               | 0.11           | 0.164                   | 0.163                    |
| RII                | 0.20           | 0.138                   | 0.137                    |
| Total Subscription | 0.15           | 0.168                   | 0.167                    |

The two bases now agree to within 0.004 on every category — strong confirmation the
underlying relationship is real and not an artifact of which time-scale was used.
**QIB's weight looks over-sized and RII's looks over-sized for predicting longer-run
(post-listing-week+) performance specifically** — even though QIB remains the single
strongest individual correlate, its current 0.40 share of the budget is larger than
its relative predictive edge over bNII/sNII justifies once the outcome is "did this
actually hold up," not "did it pop on day one." bNII and sNII both look
under-weighted by both bases. This is a genuine candidate for revising
`SCORE_WEIGHTS` in `lib/ipoScoring.js` — **not done here** (per this doc's own §17
discipline: a script computes, a person decides). Recommended before adopting: (a)
re-run on a larger sample once more IPOs accumulate past the ~2025-09-24
data-availability floor — 132 IPOs (84 with QIB reported) is a reasonable but not
huge sample, and this window is entirely within one hot SME-IPO market cycle,
which may not generalize; (b) sanity-check against a real multivariate regression
rather than this simplified per-category-correlation proxy, since categories
correlate with each other and a proper regression could attribute the "predictive
edge" differently than a naive per-category correlation does; (c) treat this
specific finding (QIB over-weighted, HNI under-weighted, for longer-run performance)
as the thing to falsify on the next re-run, now that the daily-vs-weekly
discrepancy that looked like a competing finding has been ruled out as an artifact.

## Score → tier mapping

| Score range | Tier     |
| ----------- | -------- |
| ≥ 0.90      | STRONG   |
| 0.55 – 0.89 | MODERATE |
| 0.30 – 0.54 | WEAK     |
| < 0.30      | POOR     |

Thresholds are a first pass, not empirically back-tested against this market's actual
listing-day return distribution. **Recommended follow-up**: once
`daily-ipo-subscription-analysis-stockmarket` has run for a few months, join `ipos`
collection records against actual listing-day returns (fetchable via NSE/BSE once
listed) and re-calibrate the STRONG/MODERATE/WEAK/POOR cut points empirically instead
of by judgment — this is exactly the kind of validation `insight-validation` already
does for watchlist insights; consider whether that skill's pattern (or a small
sibling) should be extended to IPO calls too rather than inventing a second ledger
format.

## Dual-score system (2026-08-09)

Per an explicit ask to stop re-fetching the same data for every experiment and to
score IPOs on two separate bases instead of one, the pipeline now works like this:

1. **`ipoHistoryCache.js`** persists the full IPOPlatform historical dataset to
   `data/cache/ipo-history.json` (index tier: full history, ~2,300+ IPOs, cheap;
   detail tier: per-IPO category breakdown, seeded from already-fetched
   `ipo-scoring-backtest` reports and only net-new-fetched for the ~295 IPOs listing
   on/after the confirmed `2025-09-24` data-availability cutover). Re-run with
   `--refresh-detail` periodically as new IPOs list; the index tier is cheap enough
   to always rebuild in full.
2. **`ipoWeightFinder.js`** runs `suggestWeights()` (see below) against the ENTIRE
   cache in one pass — no network, no date-window chunking — restricted to the 137
   IPOs (as of the 2026-08-09 run) with both performance and granular subscription
   data. It produces two weight sets and evaluates issue size / market cap as
   scoring inputs. Report: `data/reports/rpt_ipo-weight-finder_global_2026-08-09_90d71542.json`.
3. **`lib/ipoScoring.js`** now exposes `SCORE_WEIGHTS_LISTING` and
   `SCORE_WEIGHTS_CAGR` (below) plus `computeDualScores(rec)`, which the live
   scanner (`ipoSubscriptionScanner.js`) calls instead of the old single-score
   `computeSubscriptionScore()`. Every IPO record now carries `listingScore` /
   `listingTier` and `cagrScore` / `cagrTier` / `cagrConfidence`.
4. Top-3 selection (`ipoSubscriptionScanner.js`'s `scan()`) now ranks on
   `combinedScore = listingScore × 0.7 + cagrScore × 0.3` (2026-08-09, replacing
   an earlier equal-weight average) — not `listingScore` alone (`rank`, the
   near-term table ordering, still uses `listingScore` — it's the more
   near-term-relevant basis for a "closes today, lists tomorrow" universe).
   Listing gain gets the larger weight because it's the stronger, better-
   validated signal at every sample size tried (r 0.21-0.38 vs 0.12-0.21 for
   CAGR at n=837 — see `ipo_data_sources.md`).
5. The email (`ipoDigestEmail.js`) shows both score columns plus the Combined
   Score in the top-3 cards and the full table (every ranked IPO, not just the
   top 3).

### The two weight sets (current, full-database run, n=837 eligible IPOs)

**Superseded twice** — this table originally reported an n=137 IPOPlatform-only run,
then an n=591 IPOPlatform+NSE run; both are obsolete. Current values (n=837
IPOPlatform+NSE+BSE merged sample, see `ipo_data_sources.md` for the full source
history and `ipoWeightFinder.js` for the join logic):

| Category           | Original (hand-set) | Listing-gain basis | Daily-CAGR basis |
| ------------------ | ------------------- | ------------------ | ---------------- |
| QIB                | 0.40                | 0.233              | 0.285            |
| bHNI               | 0.14                | 0.229              | 0.183            |
| sHNI               | 0.11                | 0.236              | 0.176            |
| RII                | 0.20                | 0.129              | 0.164            |
| Total Subscription | 0.15                | 0.173              | 0.191            |

Listing-gain-basis correlations (r) are moderate across every category (0.21–0.38) —
weaker than the original n=137 estimate (r 0.49–0.73) but more trustworthy, since the
n=137 sample was drawn entirely from one recent IPO-boom window. The original
hand-set weights still over-concentrate in QIB relative to what the full-database
sample supports; the empirical set spreads weight much more evenly, with bHNI/sHNI
landing close to QIB rather than well below it. Daily-CAGR-basis correlations are
weaker across the board (r 0.12–0.21) — expected, since a same-day demand signal
naturally decays in predictive power the longer you hold. As with the earlier
`suggestedWeights` finding, this is a correlation-proportional heuristic, not a
regression — category multiples co-vary and this method doesn't separate each
category's independent contribution.

### Issue size / market cap: not a scoring input, and NOT a reliable confidence signal either

`ipo_size` (issue size, ₹Cr) and `company_valuation` (IPOPlatform's implied
post-issue market cap, ₹Cr) both live directly on the performance-tracker index API
row — no extra fetch needed, so they're now cached and reported for free on every
IPO. Direct correlation of either with listing gain or daily CAGR is close to zero at
every sample size tried (n=137: r 0.009–0.069; n=591: r 0.001–0.034; n=837:
r 0.001–0.101), and collinearity with QIB is weak too — so **neither belongs in the
weighted score formula**; adding them as regressors would mostly add noise, not
signal.

An earlier version of this doc reported a split-sample finding here (subscription
score predicting large-issue CAGR far better than small-issue CAGR, r=0.426 vs
0.119) and used it to justify a `cagrConfidence: 'LOW'` flag for small/SME issues.
**That finding did not replicate.** Re-running the identical split-sample check on
the n=591 sample reversed the direction (small r=0.209, large r=0.125); a third
re-run on n=837 showed yet another pattern (large now stronger for listing gain,
r=0.595 vs 0.194, but small/large stayed close for CAGR, r=0.186 vs 0.148). Three
re-runs, three different pictures — conclusive evidence this is sample-composition
noise, not a real effect. `computeDualScores()`'s `cagrConfidence` field is kept for
API compatibility but is now **always `'NORMAL'`** — see `ipo_data_sources.md`'s
"What changed" section for the full methodological writeup. Do not re-derive or trust
a size-based confidence rule from a single weight-finder run; it needs to hold up
across at least two independent re-runs on differently-composed samples before it's
worth wiring into the score.

### Caveats / next steps

- n=837 is a much stronger sample than the original n=137, but still a
  correlation-proportional heuristic, not a real regression; both weight sets should
  keep being treated as an evolving empirical estimate, re-run via
  `ipoWeightFinder.js` as the NSE/BSE/IPOPlatform caches accumulate more IPOs.
- The `SCORE_WEIGHTS_LISTING` / `SCORE_WEIGHTS_CAGR` constants in `lib/ipoScoring.js`
  are the empirically-suggested values applied directly (not re-validated against a
  held-out sample) — a genuinely rigorous version would split train/test and check
  the suggested weights actually improve out-of-sample correlation before adopting.
- `SCORE_WEIGHTS` (the original hand-set constant) is kept for backward
  compatibility / any caller still using `computeSubscriptionScore(rec)` with no
  explicit weights argument; it is no longer what the live scanner actually scores
  with.

## Retail float filter (2026-08-11)

Added at explicit user request after reviewing the 2026-08-10 Aegeus Technologies run:
"filter out all the IPOs if the retail float is less than ₹50cr — don't consider them
in top 3 & don't generate rhp analysis for them." This is a **hard gate on Phase
2 spend**, not a scoring input — it doesn't touch `listingScore`/`cagrScore`/
`combinedScore` at all, it only decides which IPOs are _eligible_ for `top3[]`
selection (and therefore for the expensive `drhp-ipo-analysis` deep-dive) after
scoring/ranking has already happened.

**Definition**: "retail float" = `retailSharesOffered × issuePrice`, where
`retailSharesOffered` is the share count reserved for Individual/Retail Investors
specifically (SME terminology; equivalent to RII on a mainboard issue), scraped from
the IPOPlatform detail page's "Share Allocation" block (`Retail Shares Offered:` row —
verified byte-for-byte against Aegeus Technologies' own RHP Capital Structure table,
676,800 shares in both sources). This is deliberately **not**:

- the total issue size (`issueSizeCr` — includes QIB/HNI/Market-Maker portions too);
- post-listing public float (all shares tradeable after lock-in expiry — a completely
  different, much larger number computed from the lock-in schedule, not from the
  Offer Document's category reservation table).

**Why this can't be derived from the two tables the scanner already had**: the Closed
IPOs table has `issueSizeCr` (total ₹) with no category split; the Subscription Status
table has category-wise subscription _multiples_ (e.g. `riiX: 25.59`) with no
underlying share count or ₹ value — a multiple alone can't recover the denominator it
was applied to. Only the per-IPO detail page's "Share Allocation" block carries the
actual retail share count.

**Threshold**: ₹50cr, a user-set judgment call (not backtested/empirically derived
the way the scoring weights are) — the reasoning is that IPOs with a very small retail
allocation are structurally harder for a retail investor to get a meaningful allotment
in even if they wanted to apply, so spending a full DRHP-analysis pass on them has
lower payoff than on an IPO where retail actually has room to participate. Revisit
this number if it turns out to be systematically excluding IPOs worth analyzing (e.g.
by checking, over a few months, whether filtered-out IPOs' listing-day gains were
meaningfully different from included ones) — the same kind of empirical check this doc
already recommends for the STRONG/MODERATE/WEAK/POOR tier cutoffs.

**Fail-open on unknown float**: if the detail-page scrape doesn't yield a
`Retail Shares Offered:` match (markup change, fetch error), the IPO is flagged
`retailFloatUnknown: true` and is treated as NOT filtered — an unmeasured retail float
must never be silently treated as "confirmed below ₹50cr." This mirrors the general
principle elsewhere in this framework (e.g. `cagrConfidence`) of surfacing data gaps
explicitly rather than letting a null silently become a negative judgment.

## What the LLM narrative step should NOT do

- Don't restate the raw multiples the email table already shows — say what they
  _mean_ (e.g. "QIB conviction without matching RII enthusiasm suggests smart money
  sees value the crowd hasn't priced in yet, or vice versa").
- Don't treat a high score as a subscribe/buy call on its own — subscription quality
  is a demand signal, not a valuation or governance one. The `drhp-ipo-analysis` pass
  on the top 3 is where valuation/red-flag judgment actually happens; the ranking
  narrative should say that explicitly rather than implying the score alone is
  investable.
- Don't ignore a small universe. On days with only 1-2 IPOs listing, say so instead
  of manufacturing a comparative "top 3" narrative that doesn't exist.
