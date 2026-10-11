# MTF flush-out entry signal — spec + first backtest (2026-10-11, DRAFT, unreviewed)

## Idea

Shashank1171 tags sharp drops as an "MTF flush-out" and treats the 20 DEMA / ~5% below the 21 DMA as the support
zone ([9 Oct 2026](https://x.com/Shashank1171/status/2108481638367924241),
[1 Jun 2026](https://x.com/Shashank1171/status/2061414201101328409)). His reply to "how to know it's an MTF
flush-out" (11 Oct 2026) is NOT in the KB (text is only the @mention), so the rule below is inferred.

## Conflict to resolve

data/notes.json (MTAR, 2026-06-05) says delivery % spikes UP on an MTF-liquidation day (30-45%+; thresholds
unsourced). Shashank says delivery % is "not as robust as it sounds"
([24 Feb 2026](https://x.com/Shashank1171/status/2026296242272141817)). Untested here: the backfill has no delivery %.

## Data

- Official: NSE "Margin Trading Disclosure" + BSE "Margin Trading" daily Excel (published evening, previous day).
- Backfill used: indiamtf.com `/history/stock/<TICKER>.json` (1,502 stocks; MTF series from 2021-01-01; **price
  series only from 2025-04**; closes only). Attribution: "IndiaMTF.com, from NSE/BSE disclosures".
- mtf.trading bulk export (CC BY 4.0) has NO per-stock history (only market totals, flush_events, stock_latest).

## Candidate rule (thresholds NOT yet justified)

Flush: shares-financed (q) falls >= X% over 3 sessions; location: close within 5% of 20-EMA and above 50-DMA;
book >= Rs 20 Cr. Entry at close of t+1 (file is public the next morning).

## First backtest (docs/mtf-flush-signal/bt.py; 223k stock-days, 980 stocks, 2025-06 -> 2026-09)

Excess return = stock forward return minus equal-weight mean of eligible stocks the same date; 14-day cooldown.
Result: **no usable edge.** Excess means within about +/-0.3% at 5/10/20d, medians mostly negative, hit rates 44-50%
(control: all eligible 46/45/44%). Best-looking subset (q3<=-5%, above 50-DMA, price down >=3%: n=560) showed
20d excess mean +0.79% but median -1.41% and hit 44% -> tail-driven. The harshest flush (q3<=-15% + price down)
was negative (-1.9% 5d, n=83).

## What could be wrong with this test

- Only ~15 months, one regime (bull, with Mar-2026 and Sep-2026 shocks); price data starts Apr 2025.
- q (shares financed) also moves on splits/bonus/corporate actions -> false "flushes" not removed.
- Closes only: no intraday low, no volume/delivery; "DEMA" approximated by EMA20.
- Equal-weight same-day control is crude; clustering of events on market-wide flush days; no costs/slippage.
- A flush may matter only with a catalyst tag (Shashank's condition) - not yet joined.

## Next (needs approval)

1. Join catalyst tag (rerating-catalysts) and test flush-only-with-catalyst.
2. Remove corporate-action days; add delivery % from bhavcopy and test the conflicting rules.
3. Start collecting official NSE/BSE files daily (script + db.js) to remove the third-party dependency.

---

## Update 2026-10-11 (v2): Shashank's calls, relative metrics, candle wicks

Scripts (run in order in a scratch dir containing index.json): dl.py -> dl_ohlc.py -> feat.py -> case.py / uni.py.
Data: indiamtf per-stock MTF history + mtf.trading bhavcopy OHLCV (NSE, 2024-01-01 -> 2026-10-09; 5 weekend/special
sessions missing). No delivery % in this data.

### Case study: his 9 tagged "flush-out/shakeout" calls (1 Oct 2025 - 9 Oct 2026)

- 5 of 9 (Lumax, Dee Dev, AYE, STL Tech, Allcargo) had NO MTF book recorded on the call day -> not measurable as MTF flushes.
- Measurable: MTAR 16 Jun 2026 (MTF shares -18.8% in 3d, 2nd percentile, strong fit); GRSE 1 Oct 2025 (-5.4%, 13th pct, weak);
  Morepen 8 Oct 2026 (-5.3%, book 25% below 60d peak; 9 Oct MTF file not yet published); MTAR 1 Jun 2026: book still ROSE +16%
  that day (liquidation not yet visible in the data).
- Entering at the next close, 6 of 8 with forward prices were lower at 20d (median about -6%); median 10d max adverse move about -13%.
  n=8, entry timing differs from his (he staggers), so this is anecdote, not proof.

### Universe backtest (relative metrics; excess vs same-date MEDIAN; 10-session cooldown; train <2025-07, test >=2025-07)

Median 20d excess / hit rate (train | test):

- Location only (above 50DMA, within -6%..+3% of 20 EMA): -0.12% / 49% | +0.26% / 51%
- - lower wick >=0.4 (price only, no MTF): -0.10% / 49% | +0.22% / 51%
- 3-day relative MTF drop alone (z<=-1.5) + location: +0.28% / 52% | -0.17% / 49% -> noise
- 10-day cumulative MTF drop >=15% + wick + location: +1.02% / 56% | +0.70% / 56% -> best consistent (n=374 | 621)
- Book >=25% below 60d peak + wick + location: +0.41% / 52% | +0.63% / 53%
- 3-day z<=-1.5 + wick + 1.5x volume: n=21 | 70 (too small; 10d median +1.4% | +1.1%)
  Read: cumulative/relative MTF unwinds plus a rejection wick add roughly +0.5-1% median over 20d and +5-7 pts hit rate versus the
  same price location without MTF, in both halves. Short 3-day drops alone add nothing. Effect is small versus a median 10d adverse move of -4%.

### What could be wrong

11 variants tried (multiple testing); overlapping events; before costs/slippage; delivery % and catalyst tag not tested;
quantity can still move on corporate actions I did not detect (>0.5% price gap filter only); EMA20 not DEMA; MTF data lag 1 day.

---

## Update 2026-10-11 (v3): delivery %, leader filter, latest candidates

New data: NSE `sec_bhavdata_full_DDMMYYYY.csv` (delivery qty/%), all 684 sessions 2024-01 -> 2026-10-09, fetched from
nsearchives.nseindia.com with a browser User-Agent (works from the user's computer). Scripts: dl_deliv.py, feat2.py, uni2.py, cand.py.
"Leader" = 120-day return in the top 40% of the market that day AND within 25% of the 250-day high. This is a PRICE proxy for
"earnings-driven catalyst": a point-in-time earnings-catalyst tag is not available historically (rerating-catalysts briefs cover ~44
current names -> look-ahead), so it is NOT tested.

Median 20d excess / hit (train<2025-07 | test>=2025-07), 10-session cooldown, vs same-date median:

- G0 MTF 10d drop >=15% + wick>=.4 + location: +1.02%/56% (n=374) | +0.70%/56% (n=621)
- G4 G0 + leader: +1.59%/58% (n=189) | +0.98%/58% (n=352) <- best consistent single rule
- G1 G0 + delivery >=1.3x own 20d median: +2.10%/68% (n=47) | +0.51%/54% (n=50) (tiny, unstable)
- G3 June-note signature (down day + delivery>=1.3x): +2.47%/74% (n=23) | +2.14%/57% (n=37) (tiny)
- P1 same delivery signature WITHOUT MTF: +1.80%/59% (n=172) | -0.01%/49% (n=347) -> delivery alone not robust
- HG (10d drop AND book>=25% below 60d peak) + leader: +1.64%/59% (n=167) | +0.82%/56% (n=301)
  Read: delivery % adds nothing reliable (agrees with Shashank 24 Feb 2026, disagrees with the unsourced June note). Relative/cumulative
  MTF unwind + rejection wick + leadership is the useful core. Edge is still small (~+1% median 20d, median 10d adverse move about -4%).

### Latest fired (price through 9 Oct, MTF through 8 Oct) — hypotheses, NOT recommendations

Strict (G4 and H4): CASTROLIND (8 Oct), SOUTHBANK (7 Oct, 5 Oct), SCHNEIDER (7 Oct), PAISALO/GLAND/AETHER (5 Oct). Looser H4-only list is long
(60 stock-days in 6 sessions) -> treat as watch list. MOREPENLAB 8-9 Oct: leader (RS 99.7th pct) and book 25% below peak, but 10d MTF drop only
-2.6% and lower wick only 0.23/0.16 -> does NOT meet the wick/cumulative rule yet (closed 129.55 on 9 Oct, near the day's low; his 124 level untested).

---

## Update 2026-10-11 (v4): productionised

**Jobs.** `mtf-flush-daily` (weekdays 22:50 IST) -> `mtfFlushDaily.js` + `lib/mtfFlush.js` + `lib/mtfFlushEmail.js` + `stock-api` `IndiaMtfClient`
(`docs/indiamtf-api-schemas.md`). `mtf-flush-outcomes` (Sat 11:40 IST) -> `mtfFlushOutcomes.js`: realised 5/10/20d returns per signal and tier.

**Rule encoded (G4).** Book >= Rs 20 Cr; shares financed (NSE+BSE) -15% over 10 sessions; lower wick >= 40% of range; close > 50-DMA; close within
-6%/+3% of EMA20; leader = 120d return rank >= 0.60 across the NSE EQ universe (bhavcopy at D and ~174 calendar days earlier) and within 25% of the 250d high.
A price discontinuity (exchange prev-close vs our prior close > 0.5%) in the last 10 sessions excludes the stock (q-change invalid).

**Score (0-100, ASSUMPTION weights, ranking aid only):** flush depth 25 | depth vs 60d peak 15 | wick 20 | leadership 15 | location 10, normalised.
Tier A = all gates and score >= 70; B = all gates; C = flush + leader + above 50-DMA with exactly one soft gate (wick or location) missed (not back-tested).
Ledger: signalId `MTF-flush`, A/B -> `entry-ready`, C -> `detected`, 5 consecutive missed runs invalidate (acts as the cooldown). Email only for NEW signals.

**Timing.** Signal day D = latest disclosed MTF session (file lags one session) and the same-day candle. Back-test entry = close of D+1; the job runs
after D+1's close, so the practical entry is D+2 (tested: edge mostly retained, G4 20d median +1.31%, hit 56%).

**First live run (D = 2026-10-08).** 50 stage-1 flushes (20-session median 64); tiers: A 0, B 1 (CASTROLIND, score 41), C 15.
Note: this run's G4 list differs from the research list above (research used the ~1,000-name book universe with percentile rank over book>=20 Cr stocks;
the job ranks against the whole EQ bhavcopy universe, ~2,940 names) so small differences are expected.

**Open / not encoded:** Shashank's own flush definition (not in the KB), earnings-catalyst tag (no point-in-time history), his DEMA20 (EMA20 used),
11 Oct reply thread (not in the captured X cache, last capture 30 Sep; a live X search found only the 9 Oct MOREPENLAB call), official NSE/BSE MTF file
URLs (unverified; aggregator dependency remains). Calibrate weights only after 30+ matured signals per tier (`mtf-flush-outcomes`).
