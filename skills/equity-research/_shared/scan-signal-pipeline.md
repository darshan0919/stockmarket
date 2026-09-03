# Scan-Signal Pipeline (shared)

The pipeline behind `gainers-signal` and `volume-rocketing`. **This file is the
source of truth for everything the two skills do in common**, which is
everything except which Stockscans scan supplies the universe and what the
emails are called. Their SKILL.md files are deliberately thin: each names its
universe fetcher, its labels, and the handful of things genuinely unique to it,
and points here for the rest.

Why it is written this way. The two skills answer the same question — _which
names moved today for a reason worth acting on_ — from two different entry
filters: gainers-signal sorts the market by price, volume-rocketing by volume
against a name's own 5-day average. A stock up 3% on 4x normal volume is often
the earlier tell, and price-sorting misses it. But once you have a candidate
list, everything you do to it is identical, and it must LOOK identical too —
Darshan reads both back to back most mornings, and two layouts for one kind of
report is friction with no payoff. Before this file existed the shared logic was
described twice, drifted, and the two emails stopped matching.

**Read this file in full before running either skill.**

---

## The bar: actionability, not information

A name is worth the reader's attention only when a real-world CAUSE (a strong
filing, a live re-rating catalyst, or a sector-wide move) coincides with
EVIDENCE OF CONVICTION (delivery-backed buying, ideally sustained across
sessions). Either alone is merely interesting: an order win the market shrugged
at is not tradeable, and delivery with no discoverable cause is unexplained
rather than necessarily good. Every design decision below serves that
distinction and putting the short list at the top.

## Script-first

Two deterministic companion steps resolve every fact, and a third renders and
sends the email. Judgment is spent on exactly four things:

1. Reading announcement PDFs to identify the actual trigger (Step 4).
2. Resolving the WHY for each name in the email (Step 5).
3. Building or reusing the EPS thesis for the top 10 (Step 6).
4. Writing the lead paragraph and each card's content fields (Step 7).

Everything else — fetching, filtering, delivery, tiering, streaks, clusters,
sorting, HTML — is already done by a script. **Do not re-fetch or re-compute
anything the scripts produced**, and do not hand-write email markup; that is
what `scanSignalEmail.js` is for.

---

## Step 1 — Scanner (Node, deterministic)

```bash
node "$SCAN"                     # add --date YYYY-MM-DD to override the market date
```

`$SCAN` is the skill's own scanner (`gainersScanner.js` /
`volumeRocketingScanner.js`); the latter is a thin universe-fetcher wrapper that
calls the former's `main()`, so everything below is identical for both. Writes
`data/runs/<prefix>_raw_{YYYYMMDD}.json`. Zero rows (holiday, API issue) → send
a "no signals today" email and stop; that is a legitimate outcome, not a failure
to dress up.

**Trust the API's list as-is.** Both scans are server-sorted and neither skill
re-sorts or re-derives membership — the pipeline only _layers analysis_ on top
of whatever the API returns. Two fetches minutes apart can legitimately return
different names; that is live data moving, not a bug to chase.

**Announcement windows — two, on purpose.** The scanner fetches **14 days** of
announcements but only the last **7** feed conviction scoring and tiering. Every
announcement is stamped `days_ago` and `in_scoring_window`, and the aggregate
fields the classifier reads (`ann_count`, `has_material_ann`, `ann_strength`,
`ann_categories`, `strong_announcements`) are computed from the 7-day subset
alone. The extra week reaches the WHY step through `announcements_recent_14d`
and `announcements_prior_week`.

The reason for the split is worth understanding rather than just obeying: the
14 days exist because the WHY section used to be blank for most names — on any
given day most gainers have filed nothing in 7 days, so the report had nothing
to say and a reader could not tell "nothing happened" from "we didn't look".
The 7 days stay because widening the _scoring_ window would move every
ACT/WATCH/NOTED boundary overnight and make today's tiers non-comparable with
every `gainer`/`volume-rocket` event already recorded — which streaks, novelty,
and `insight-validation`'s D+2 follow-ups all read. A content refactor should
not silently re-tune the model underneath it.

Also in Step 1, unchanged: quality filters (Mcap ≥ 300 Cr, delivery ≥ ₹5 Cr,
retail stake ≥ ₹50 Cr), price history _before_ the quality filter (BSE delivery
value is derived from a close price — reordering these lets micro-caps
delivering ₹0.08 Cr sail through a ₹5 Cr floor), per-symbol delivery at
concurrency 8, batched retail holdings, the throwaway-watchlist announcement
scan, industry clusters, and concall sentiment enrichment.

## Step 2 — Classifier (Node, deterministic, no API)

```bash
node "$RUNTIME/lib/<skill>Classifier.js"
```

Writes events (`type: gainer` / `volume-rocket`), the DTO
`data/runs/<prefix>_insights_{YYYYMMDD}.json`, and the research seed
`data/runs/<prefix>_research_seed_{YYYYMMDD}.json`. Both classifiers are the
same `gainersClassifier.main()` with different labels, so tiering, conviction,
streaks, clusters and novelty cannot drift between the two skills.

What it computes and why each exists — `tier` (ACT/WATCH/NOTED, what the email
is organised by), `conviction_score` + `conviction_reasons[]` (inspectable on
purpose: `insight-validation` can only tell us a threshold is miscalibrated if
it can see which rule fired), `delivery_pct` AND `delivery_value_cr` (both axes
always together — percentage alone flatters illiquid micro-caps and understates
large-caps where 22% delivery is still ₹150 Cr of real buying),
`delivery_value_pct_of_mcap`, `streak` + `streak_prior_dates`, `sector_cluster`,
concall sentiment credit, `novelty`, and `volumeRocketing`.

**Streaks are per-skill.** A gainers streak and a volume-rocketing streak for
the same company are tracked independently, off different event types. They are
different triggers and merging them would invent a streak neither scan saw.

### `delivery_value_pct_of_mcap` — the size-normalising column

Delivery value in ₹ Cr says how much real money changed hands; delivery % says
what share of the day's volume was real. Neither says whether that is a lot _for
this company_. ₹80 Cr delivered is an enormous day for a ₹400 Cr micro-cap —
20% of the entire company traded for keeps — and a rounding error for a ₹40,000
Cr large-cap at 0.2%. That ratio is what makes a list mixing both sizes
comparable, which is exactly what these scans produce every morning.

It is `null`, never `0`, when either input is missing. A company we could not
measure must not rank as one we measured and found empty.

### Sort order: delivery value, descending, everywhere

The DTO's `signals[]`, every email section, and the top-10 EPS selection all
sort on `delivery_value_cr` descending. Delivery value is the only column that
measures how much real money committed to the name today: return % ranks by how
far a stock moved (which flatters thin micro-caps), conviction score ranks by
our own model's opinion (which a reader may want to audit rather than be sorted
by). Rupees delivered is the market's own vote. Names with no delivery data sort
last rather than as zero, with return as a deterministic tiebreak.

---

## Step 3 — Trigger research seed

`<prefix>_research_seed_{YYYYMMDD}.json` carries two selections:

- **`companies[]` — 20 names for trigger research.** Top 10 by delivery %, then
  top 10 by delivery value excluding the first list. Two axes on purpose:
  percentage finds high-conviction accumulation in small/mid caps, absolute
  value finds where the real money went. Companies with no delivery data are
  excluded rather than ranked as zero.
- **`rerating_targets[]` — 10 names for an EPS thesis.** Top 10 by delivery
  value alone (Step 6). A single axis, because a re-rating thesis costs real
  document reads and that budget belongs where the market itself put the most
  money — not where a ratio looked flattering on a thin float.

Each `companies[]` entry carries its STRONG announcements with resolved
`pdfUrl`s, its `prior_week_announcements` (days 8-14, with `days_ago`), its
`buildCompanyContext()` bundle, and `needs_transcript_research`.

## Step 4 — Trigger research (MANDATORY, judgment)

For each of the 20, as documented in each skill's own Step 4: read only
`announcements_to_read[]` PDFs via `node "$WI" read-pdf`, use the
`announcement-insights` category template (`--depth quick`, except the four
`HIGH_CONVICTION_CATEGORIES` — demerger/merger/acquisition/management_change —
which get `--depth standard` even in this batch context), weigh the context
bundle and `novelty`, and save one DTO per company. Never write a trigger from a
title alone: the title says "Award of Order", the PDF says ₹512 Cr from NTPC
over 30 months, and only the second is actionable.

**Cost control.** The expensive part is PDF reads, not the 20 companies. If a
run would exceed ~30 PDFs, prioritise ACT tier, then SUPER_STRONG cluster
members, then the rest — and say which were deferred rather than silently
dropping them.

---

## Step 5 — The WHY resolution ladder (MANDATORY, judgment)

**The problem.** The WHY cell used to be blank for most names, because the only
thing feeding it was "did a STRONG filing land in the last 7 days" — and on most
days, for most gainers, nothing had. A report whose most common answer is a
blank reads as "we didn't look", even when the honest answer is "there is
nothing".

**The fix** is a ladder, walked in order, stopping at the first rung that
answers. `why.basis` records which rung it was, and the email renders that label
so the reader can weigh the answer accordingly.

1. **`filing`** — a STRONG filing in the 14-day window plausibly accounts for
   the move. Use the Step 4 read. If the filing is from days 8-14
   (`prior_week_announcements`), **say how many days ago** — "order win filed 9
   days ago, market delivering into it now" is a legitimate and common
   explanation, but only if the lag is stated rather than implied to be today.

2. **`classified`** — a filing exists but you cannot tell whether it explains a
   move the market may already have priced. Run `announcement-info-classifier`
   on it (its Steps 3-4; you already have the base read from Step 4, which
   satisfies its Step 2) and let the NEW claims be the WHY. This is the rung
   that distinguishes "they announced something" from "they announced something
   the market did not already know" — a filing whose every claim buckets KNOWN
   is a _worse_ explanation for a delivery-backed move than no filing at all,
   and should be reported as `mismatched`, not dressed up as explained.
   Cap this at the ACT tier plus any WATCH name where a filing exists and the
   move is otherwise unexplained; a baseline build touches 4 concalls, a PPT and
   a full announcement history, so it is not free.

3. **`catalyst`** — no filing in 14 days, but the company is one of the top 10
   and its `rerating-catalysts` brief (Step 6) surfaced a live catalyst that
   plausibly accounts for accumulation. Cite the catalyst and its brief date.
   This rung is why Steps 5 and 6 are ordered as they are: **run Step 6 first**
   so the briefs exist when the ladder reaches this rung.

4. **`concall`** — `needs_transcript_research` is set and the transcript carries
   a concrete forward-guidance number. Concall sentiment is corroborating
   evidence, never a standalone trigger: "Bullish concall" alone is not a WHY
   without either a filing or a specific guidance figure behind it.

5. **`sector`** — the name is in a delivery-confirmed sector cluster and nothing
   company-specific explains it. The cluster IS the answer; say so plainly
   rather than reaching for a company-level narrative that isn't there.

6. **`none`** — all of the above checked, genuinely nothing. Set
   `why: {basis: 'none'}` and the renderer prints an explicit
   "No discoverable trigger — checked filings (14d), re-rating catalysts, and
   concall." **This is a real finding and must never be left as an empty
   field.** Fabricated causation is far worse than an honest blank, and an
   unexplained delivery-backed move is often early accumulation ahead of news —
   genuinely interesting, as long as it is labelled honestly.

### Linkage — stated for every ACT and WATCH name

Independently of `why.basis`, every ACT and WATCH card carries `linkage`:

- **`explained`** — a filing or catalyst plausibly accounts for the move (say
  which, with numbers).
- **`unexplained`** — delivery-backed buying with no discoverable cause.
- **`mismatched`** — a filing exists but doesn't fit: a routine disclosure
  alongside +15%, a strong filing with weak delivery, or (per rung 2) a filing
  whose claims are all already known.

Never assert a causal link the evidence doesn't support. The renderer shows
linkage as a chip precisely so "unexplained" cannot quietly read as "explained"
to a skimming reader — the failure that makes a signal report untrustworthy.

---

## Step 6 — EPS thesis for the top 10 (MANDATORY, judgment)

Run **before** Step 5 so rung 3 has briefs to draw on.

```bash
BC=skills/equity-research/rerating-catalysts/scripts/brief_cache.js
node "$BC" plan --tickers "$(comma-joined rerating_targets from the seed)"
```

`plan` returns `{serve, build}`. Everything in `serve[]` is finished — attach it
to that company's card as `epsThesis` unchanged. **Do not re-derive or re-word a
served brief**: the point of the cache is that the same evidence yields the same
thesis, not two differently-phrased ones (conventions §17(b)). Each served brief
carries `cacheHit` and `asOf`, and the renderer shows `asOf` so a reader can
always see how old a thesis is.

For each `build[]` entry, invoke `rerating-catalysts --mode brief` (see that
skill's "Modes" section) — narrowed Phase 1-3, filing-level cache checked before
every document read, `put-filing` immediately after each read, `put` the finished
brief. No widget, no PDF.

**The cache is shared across both skills, keyed by company, not by scan.** A name
in both scans on the same day gets one brief, and both emails show the identical
thesis. That is the point: two skills contradicting each other about the same
company on the same morning is worse than either being slightly stale.

Report `epsBriefs` and `briefCacheHits` in the stats footer — those two numbers
are how you know the caching is actually working.

---

## Step 7 — Compose and send the email (judgment: content only)

**Do not write HTML.** `scanSignalEmail.js` renders the Thesis Card layout —
the same cards `post-close-scan-insights` sends, so all three of Darshan's daily
emails read as one product. Your job is the content overlay.

```bash
node packages/jobs-runtime/scanSignalEmail.js send \
  --insights data/runs/<prefix>_insights_{YYYYMMDD}.json \
  --content /tmp/<prefix>_content_{YYYYMMDD}.json \
  --stats-file /tmp/<prefix>_stats_{YYYYMMDD}.json \
  --title "<Daily Gainers Signal|Volume Rocketing Signal>" \
  --subject "<title> — <market_date>"
```

Use `render` instead of `send` for the `email: off` path.

### The content overlay

```json
{
  "lead": "2-3 sentences — the single most important thing first.",
  "caveats": ["announcements API returned partial results — coverage incomplete"],
  "cards": {
    "NSE:XYZ": {
      "headline": "₹512 Cr NTPC order, ~18% of FY26 revenue",
      "thesisChain": ["what happened", "so this follows", "so EPS moves"],
      "why": { "text": "...", "basis": "filing", "sources": ["BSE filing 02-Sep-2026"] },
      "epsThesis": { "...Step 6's brief, verbatim..." },
      "epsImpact": { "direction": "positive", "magnitude": "+12% FY27 EPS", "timeline": "FY27", "confidence": "high" },
      "linkage": "explained",
      "infoClassification": { "claims": [], "verdict": "..." },
      "tags": ["order_book"],
      "pdfUrl": "https://..."
    }
  }
}
```

The merge is one-directional: overlay fields layer on top of the classifier's
record and **never replace a computed fact**. If an overlay claimed a different
delivery figure than the scanner measured, the scanner wins. That is deliberate
— the model cannot accidentally contradict a number the script already resolved.

Anything you omit simply isn't rendered, with one exception: an omitted `why`
renders the explicit "no discoverable trigger" line rather than a silent blank.

### What the renderer does for you

- Groups by tier, sorts every section by delivery value descending.
- **Detail scales with tier** — ACT full cards, WATCH compact cards (header,
  metrics, one-line WHY), NOTED a single line of tickers. This asymmetry IS the
  design: a reader skimming on a phone should get the whole actionable picture
  before scrolling. Padding the lower tiers destroys that, and the renderer now
  enforces it rather than relying on you to remember.
- Renders the metric line: 1D · Mcap · Deliv % · Deliv Val ₹Cr · Deliv/Mcap % ·
  Streak, with Deliv/Mcap coloured amber ≥1% and red ≥2.5%.
- Renders tier and linkage chips, the ⚡ Vol 2.5x badge, the J-curve badge,
  the EPS-impact chip, info-classification claim chips, tag pills.
- Renders the sector-cluster blocks, the streak board, and the pictorial stats
  footer.
- Hyperlinks every name to its Stockscans page via `stockscansLink()`, which
  sanitises series suffixes so a suffixed companyId can't produce a dead URL.
- Attaches the `cid:` expand icon when any card has a `pdfUrl`.

### Lead paragraph

The single most important thing first. A SUPER_STRONG sector cluster is the lead
when one exists; otherwise the strongest ACT name; otherwise plainly "no
actionable signals today — N names moved on price action alone", which is a
perfectly good outcome and should not be dressed up.

`volume-rocketing` additionally states how many names were skipped as
gainers-signal dupes — the number that shows the skill is adding incremental
coverage rather than re-labelling the same list.

### Stats footer

Assemble `<stats.json>` across the run; every key is optional and only present
keys render a tile:

```json
{
  "universe": 50,
  "qualified": 31,
  "act": 3,
  "watch": 9,
  "noted": 19,
  "researched": 20,
  "epsBriefs": 10,
  "briefCacheHits": 7,
  "dedupedFromGainers": 6
}
```

---

## Step 8 — Offload (MANDATORY, even on failure)

```bash
yarn data:push
```

Idempotent, push-only sync of everything under `data/` to Drive. Local files are
kept; nothing is deleted. The run is not complete until this has run.

---

## Rules (both skills)

- **Files-touched manifest** (`docs/DATA_RULES.md` §7, conventions §9) — end
  every run listing every file created or modified: collections with record
  counts (`db.touchedFiles()`), `runs/`/`cache/` files
  (`StorageService.touchedFiles()`), and the `data:push` `↑ <file>` lines. Read
  it from those sources, not from memory.
- **Token-optimization suggestion** (conventions §11) — end every run with a
  concrete, evidence-based suggestion based on what actually happened: brief
  cache hit rate, how many PDF reads were cache hits, whether the 14-day window
  earned its cost this run.
- Do NOT re-fetch or re-compute what the scripts produced, and do NOT hand-write
  email HTML.
- Cite actual numbers everywhere. Delivery is always reported as **% AND ₹ Cr
  together**, tagged `[NSE]`/`[BSE]`.
- Linkage is always `explained`/`unexplained`/`mismatched`. A WHY is always
  present — with `basis: 'none'` when that is the truth.
- Concall sentiment is corroborating evidence, never a standalone trigger.
- All outputs go under `data/` — never the repo root. Scratch goes to the
  session scratchpad, not the repo.
- Report `why_coverage_pct` from the email script's summary in the run report.
  If it drifts back toward zero, the ladder has regressed and the report should
  say so before Darshan notices it in his inbox.
