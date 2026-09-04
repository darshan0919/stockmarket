---
name: announcement-info-classifier
description: For ONE corporate announcement (PDF, ssUrl, or a specific quoted news sentence), classify every piece of information in it into NEW / KNOWN / FOLLOW-UP against the company's documented history (last 4 concalls, latest investor PPT, full announcement archive, notes DB, and thesis file) — applying the SOIC "new information" framework so signal strength is judged by what actually changes an investor's information set, not by category label alone. Use whenever the user asks "is this actually new information", "was this already known/committed", "how much of this announcement is new vs already flagged", "does this deserve a re-rating", or pastes an announcement/PDF/news sentence and asks whether it's already priced in / already known. Distinct from announcement-insights (which produces the base insight+category) and management-credibility-tracker (which tracks whether guidance was DELIVERED, not whether an announcement is NEW) — this skill sits on top of the former and answers a different question than the latter.
---

# Announcement Info Classifier

Given one corporate announcement, this skill's only job is to split what it says into
three buckets — **NEW**, **KNOWN**, **FOLLOW-UP** — by checking every claim against what
the company has already told the market. It does not invent a category taxonomy of its
own and does not re-parse the PDF from scratch: it calls `announcement-insights` for the
base read (category + insight text), then adds the classification layer on top.

## Why this exists as its own skill

An acquisition, demerger, or management change is flagged `HIGH_CONVICTION` by
`announcement-insights` regardless of whether the market already knew it was coming. But
under SOIC's "new information" framework, price action tracks **the surprise**, not the
category. A ₹500 Cr acquisition that management flagged as "under advanced discussion"
on the last two concalls moves the stock far less than the same acquisition sprung with
zero prior mention — even though both are `HIGH_CONVICTION acquisition` announcements to
`announcement-insights`. Conflating the two produces a signal that is loud on paper and
wrong in practice. This skill exists to make that distinction explicit and repeatable,
rather than left to a one-off judgment call buried inside a longer report.

## Inputs

| Param                 | Required | Meaning                                                                                                   |
| --------------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| announcement          | yes      | a PDF URL, a Stockscans `ssUrl`, a company name + announcement title, or a specific quoted news sentence  |
| companyId             | yes      | resolved ticker (e.g. `NSE:SWARAJENG`) — see Step 1 if the user only gave a name                          |
| lookbackConcalls      | no       | how many recent concalls to check (default 4)                                                             |
| lookbackAnnouncements | no       | how far back to search the full announcement archive (default: no cap — `searchMode: "full"`, see Step 3) |

If the user pastes only a sentence ("X is acquiring Y for ₹200 Cr") with no PDF/link,
treat that sentence itself as the announcement text for Step 2 onward, and note in the
output that no primary document was available to corroborate it — flag this as a
limitation rather than silently treating the sentence as fully verified.

## Step 1 — Identify the company and map to ticker

If given a company name, ticker fragment, or BSE code instead of a canonical companyId,
resolve it via `StockscansClient.companySearch(query)` / `searchCompany(query)` (see
`docs/stockscans-api-schemas.md` "Other endpoints") before doing anything else. Run the
result through `sanitizeCompanyId()` (`stock-api/src/utils/companyId.js`) per
conventions.md §15 — a `-BE`/`-SM` suffix on a raw feed symbol will silently break every
lookup below if it isn't stripped first.

## Step 2 — Get the base read from `announcement-insights`

```bash
JOB=$(find /sessions -path '*packages/jobs-runtime/watchlistInsights.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
run(){ node "$JOB" "$@"; }
run read-pdf-with-meta "<pdfUrl>"          # Tier-1 cached PDF text
run get-company-notes "<companyId>"
run insight-template "<category>" --depth standard
```

Follow `announcement-insights`' SKILL.md exactly for this step — same Step 0 heavy-doc
skip check, same `ocrFailed` hard-stop handling, same category resolution via
`categoriseAnnouncement()` (`packages/jobs-runtime/lib/announcementTaxonomy.js`). Do not
re-derive any of that logic here; if you find yourself writing a second PDF-parsing or
categorization step, stop and go read that skill instead (conventions.md §17 — never
think or write the same thing twice).

Out of this step you have: `{insight, headline, thesisChain, category, high_conviction,
significance}` plus the raw PDF text. Every discrete factual claim in the PDF text is
what gets bucketed in Step 4 — not just the one-line insight, since a filing can contain
several claims of different novelty (e.g. an order-win announcement might restate an
already-known capacity expansion AND disclose a genuinely new customer name).

## Step 3 — Build the "already known" baseline

### Step 3.0 — Read the company's Baseline Card FIRST

```bash
node -e "console.log(JSON.stringify(require('<repo>/packages/jobs-runtime/buildBaselines').readCard('<companyId>')))"
```

`data/cache/company-baselines/<companyId>.json`, built by `yarn baselines:build`
from the pre-processed Filing Extracts. It is the whole of Step 3 pre-assembled:

| Card field                                                                                         | Replaces                                                           |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `claimIndex[]` — `{fingerprint, category, counterparty, amountCr, firstSeen, lastSeen, sources[]}` | 3c's full announcement-archive walk                                |
| `guidanceLedger[]` — dated, quoted guidance from every extracted transcript                        | 3a's four concalls                                                 |
| `commitments[]` — targets/capex/capacity with the date they were stated                            | 3b's PPT read                                                      |
| `latestConcallNotes` + `businessOverview` + `growthCatalysts`                                      | Stockscans' own synthesis, free                                    |
| `baselineCoverage`                                                                                 | what the card actually covers — read this before trusting the rest |

**`claimIndex` is what makes this step cheap.** "Was this already known?" becomes
a dated lookup instead of six document fetches — which is the specific change that
lets this skill run across a night's whole filing set rather than five items.

Match a claim against `claimIndex` by category + counterparty, then check
`firstSeen`. Note the fingerprints bucket amounts by order of magnitude on
purpose: a follow-up filing routinely restates the same deal at a slightly
different figure, and exact matching would file those as unrelated claims, making
a known deal look new every time it is mentioned. A bucket match means "the same
claim, plausibly" — you still read both source records and judge whether the delta
is material. **Grouping is mechanical; judging is yours.**

**Three things the card does NOT do, and must not be read as doing:**

- **`baselineCoverage.thin: true` means the split you are about to write is
  unreliable.** Say so in the output, exactly as this skill already requires for a
  thin baseline — a NEW verdict off a card with no concalls and no PPT may just be
  incomplete lookback, and suppressing a real signal that way is the expensive
  direction of error.
- **A missing card (`null`) is a MISS, not a finding.** It says nothing about the
  company. Fall through to 3a-3d below and build the baseline the old way.
- **The card never says whether guidance was met.** `guidanceLedger[].status` is
  always `"open"` — a script stamping met/missed would be inventing
  `management-credibility-tracker`'s verdict.

**Step 3e's same-day exclusion still applies, and the card makes it easy:** every
`claimIndex` entry carries `firstSeen`, so discarding hits within
[announcement_date − 1 day, announcement_date + 1 day] is a date comparison. Do it —
the rule matters more here than anywhere, because a card built from a same-day
cluster would otherwise let a filing serve as its own alibi.

### Step 3.1 — Fill the gaps the card leaves

Fetch below ONLY what the card didn't cover — typically the older three concalls
when `baselineCoverage.concalls < 4`, or everything when the card is missing.
State in `baselineCoverage` which sources came from the card and which were
fetched, so a reader can tell how the baseline was assembled.

Four sources, all queried for the SAME companyId, run in parallel where independent:

**3a. Last N concalls (default 4).** Prefer the AI-synthesized notes endpoint over
re-reading full transcripts — it's already condensed and this classification doesn't need
verbatim quotes the way `concall-analysis` does.

**Free first move, before any of the fetches below:** call
`buildCompanyContext(companyId, { stockscans: true })` (you are calling
`buildCompanyContext` anyway for 3d — just pass the flag) and read its `stockscans`
block. It carries the LATEST concall's notes, Stockscans' business overview, and its
growth-catalyst report, served from a local cache with no network call and no document
read. That covers the most recent quarter of 3a and a good deal of 3b's ground for free,
so the fetches below are only needed for the quarters it doesn't reach.

Two limits, both of which must be stated rather than assumed away: it is the LATEST
concall only (`concallNotesQuarter` names which), so the older three still come from the
loop below; and `stockscans: null` means the cache was never warmed for this company —
a miss that says nothing about the company, not evidence of a thin baseline. Record what
it did and didn't cover in `baselineCoverage` either way.

```
StockscansClient.documents(companyId)          # list Transcript docs, filter documentType==='Transcript'
                                                 # take the 4 most recent by `date` (YYYYMM)
StockscansClient.concallNotes(companyId, ssUrl) # per transcript → {finalReport, bullets}
```

If `concallNotes` comes back thin/empty for a given quarter (some smaller-cap quarters
aren't AI-annotated yet), fall back to the raw transcript via `stock-documents-fetcher`
for that one quarter only — don't silently skip a quarter from the baseline just because
the cheap path came back empty.

**3b. Latest investor PPT.**

```
StockscansClient.documents(companyId)   # filter documentType==='PPT', most recent by date
```

Fetch and read the actual PDF (`stock-documents-fetcher`'s `fetchDocuments`) — PPTs
routinely disclose plans/numbers (capacity additions, capex phasing, management's own
"under evaluation" list) that never make it into a concall's spoken commentary.

**3c. Full announcement history — `scanAnnouncements` with a company filter, full search
mode** (this is the "announcement scan API with company filter... full search mode"
path, not `companyAnnouncements`, precisely because `companyAnnouncements`/the plain
company-announcements endpoint doesn't expose `searchMode: "full"`):

```json
POST /api/company/announcements/scan
{
  "scan": {
    "scanId": "59822b15a2859d183df3770d",
    "scanName": "Recordings",
    "filters": [], "industry": [], "index": [], "watchlistIds": [],
    "searchFilters": [],
    "announcementType": "All",
    "alerts": false,
    "searchMode": "full",
    "companyIds": [],
    "companyFilters": [{"companyId": "<companyId>"}]
  },
  "offset": 0
}
```

`companyFilters` is an array of **objects**, not bare strings — `[{"companyId":
"<companyId>"}]`, never `["<companyId>"]` (the API returns HTTP 400 "Input should be a
valid dictionary or instance of CompanyFilter" on the bare-string form — confirmed live).
Prefer reusing `buildAnnouncementScanBody()` / `scanAnnouncementsForCompanies()`
(`stock-api/src/utils/bulkAnnouncementScan.js`) over hand-rolling this payload — those
helpers already get the shape right and hide the 10-company cap / throwaway-watchlist
fallback. It accepts up to 10 companyIds without needing a throwaway watchlist for a
single-company lookup — see `docs/stockscans-api-schemas.md` for the full
request/response shape and pagination rule (advance `offset` until the page is empty;
never trust this endpoint's `total`, it self-inflates per conventions.md §16). Paginate
back as far as `lookbackAnnouncements` allows (default: no cap — walk pages until empty,
capped at a sane ceiling of ~400 announcements / ~2 years, whichever comes first, to
keep this bounded for a company with a long filing history) — this is the corpus you
check every claim against, not just the last few months. Note also that a single
`quarterDate` scoped call only searches within that one filing quarter — looping
`quarterDate` across the desired lookback window (e.g. via a computed quarter-end walk)
is required to cover a multi-quarter/multi-year lookback in one pass.

**3e. Same-day / adjacent-filing exclusion — read this before treating anything as KNOWN.**

Companies routinely file a cluster of announcements together — a Reg 30 board-outcome
filing plus a press release plus an investor presentation, often minutes to a few hours
apart, sometimes with the press release timestamped into the next calendar day if it
lands after a market-hours cutoff or gets logged by this pipeline a day later. **Do not
mistake same-day (or next-day) companion filings for prior disclosure.** Two failure
modes to guard against, both caught in a live run of this skill:

- **Note-creation timestamp is not filing date.** The notes DB's `creationTime` records
  when _this pipeline processed_ the document, not when the company filed it — a batch
  job or retry can log a note 30+ hours after the underlying filing. Always read the
  actual filing date from the PDF/announcement body itself (the letter's dateline, e.g.
  "August 28, 2026") before concluding one filing preceded another. A same-day board
  outcome and its companion press release can show up in the notes DB with note
  timestamps two days apart even though both filings are dated the identical day.
- **Companion filings on the SAME calendar day (or filed together after-hours, spilling
  into the next day) are not a prior baseline — they are the SAME disclosure event.**
  When building the "already known" baseline, exclude from KNOWN-source consideration any
  announcement for the same company whose _actual filing date_ is within 1 calendar day
  of the announcement being classified. A press release restating a same-day board
  filing is not confirmation of old news — it _is_ the news, just distributed through a
  second document; if the announcement being classified is one of a same-day cluster and
  no source _older_ than that cluster mentions the claim, the claim is NEW (or FOLLOW-UP
  against a genuinely older baseline), never KNOWN-via-the-companion-filing.

Concretely: when scanning 3a/3b/3c/3d for a prior mention, discard any hit whose own
filing date falls within the [announcement_date - 1 day, announcement_date + 1 day]
window before treating it as a KNOWN source — a hit inside that window either IS the
announcement itself (duplicate/companion document) or a same-cluster filing, and citing
it as "prior disclosure" is circular. A concall, PPT, or announcement dated materially
earlier (the normal case) is unaffected by this rule and remains valid KNOWN evidence.

State which baseline sources were excluded under this rule (if any) in the output's
`baselineCoverage`, so a reader can see the classifier didn't quietly treat the
announcement's own companion document as its own alibi.

**3d. Notes DB + thesis file (per user's stated preference for a fuller baseline).**

```bash
run get-company-notes "<companyId>"
```

Plus, if a thesis file exists for this company (`investment-thesis-engine`'s
`{TICKER}_thesis.json`), read its `evidence_log` and `triggers[]` — a trigger already
logged as `status: "pending"` with a matching `impact`/`timeline` is exactly the kind of
"analyst already knew this was coming" case KNOWN is meant to catch, even if management
never said it out loud on a concall (e.g. Claude's own prior report already flagged "X is
likely to announce a fundraise given the D/E trajectory" — if X then announces exactly
that, it's KNOWN to the research process even though it's not a verbatim management
quote). Call `buildCompanyContext(companyId)` (`packages/jobs-runtime/lib/companyContext.js`)
per conventions.md §8 to pull this in one shot — it already aggregates notes, prior
reports, thesis, and events.

## Step 4 — Classify every claim into NEW / KNOWN / FOLLOW-UP

Read the announcement's factual claims one at a time (a claim is one discrete, checkable
statement — a number, a name, a decision, a timeline) against the Step 3 baseline. This
is the reasoning/judgment part of the skill — the fetching above is Extraction
(conventions.md §17), this is Analysis, and it's the only step an LLM should be doing
real work in.

- **NEW** — this claim (or a claim of this specificity) does not appear anywhere in the
  last 4 concalls, the latest PPT, the full announcement archive, or the notes/thesis
  baseline. Nobody following this company's public disclosure could have known this
  before today. This is the bucket that actually moves the market on surprise.
- **KNOWN** — this claim was already disclosed, committed to, or strongly signaled in
  the baseline — management said "we are in advanced talks for an acquisition" last
  quarter and today's filing confirms that exact acquisition; a capacity expansion was
  in the PPT's capex table three quarters running and today's filing is the
  commissioning notice. Today's filing is confirmation/formalization, not information.
  Quote the specific prior source (which concall/PPT/announcement/date said it) for
  every KNOWN claim — an unsourced "this was probably already known" is not
  acceptable; if you cannot point to where it was said, it isn't KNOWN, it's NEW (or at
  best FOLLOW-UP, see below). **The cited prior source's own filing date must be more
  than 1 calendar day before the announcement being classified** (see Step 3e) — a
  same-day or next-day companion filing is never a valid KNOWN citation, since it's the
  same disclosure event, not prior knowledge.
- **FOLLOW-UP** — a partial/graduated case: something was flagged as a _possibility_ or
  _direction_ (management said "we are exploring inorganic opportunities in this
  segment," a prior order win's execution milestone, a previously-announced buyback's
  next tranche) and today's filing is the next concrete step in a sequence that was
  already visible, but with new specifics (the actual counterparty, the actual price,
  the actual date) that weren't knowable before. Distinguish this from pure KNOWN by
  asking: does this filing add a genuinely new, previously-unknowable specific on top of
  an already-known direction? If yes → FOLLOW-UP. If the filing adds nothing beyond
  confirming what was already fully specified → KNOWN.

Every claim gets exactly one bucket. Don't force a single verdict for the whole
announcement when it contains a mix (this is common — see the order-win example in Step 2) — bucket the claims individually, then roll up.

### Signal-strength verdict (the point of doing this at all)

After bucketing, write a one-line verdict on how much of the announcement's apparent
significance (per `announcement-insights`' `significance`/`high_conviction` flags) is
actually attributable to the NEW bucket versus already-priced-in KNOWN content. This is
where the SOIC "new information" framework is applied in the true sense the skill was
asked to enforce: `high_conviction: true` from the taxonomy is a necessary but not
sufficient signal — a `HIGH_CONVICTION acquisition` announcement where 90% of the
economically material facts were KNOWN going in should be flagged explicitly as
lower-impact-than-the-category-label-suggests, and the reverse (a `general`-category
announcement carrying one genuinely NEW material fact) should be flagged as
under-signaled by the taxonomy alone.

Be honest about the limits of this call — see "What could be wrong with this analysis?"
below; a thin baseline (few concalls available, sparse announcement history, e.g. a
recently-listed company) means an apparent NEW classification could just reflect
incomplete lookback, not genuine novelty. Say so explicitly whenever the baseline is
thin, rather than presenting a confident NEW/KNOWN split built on partial history.

## Step 5 — Save the note

Persist through the same `add-note` path `announcement-insights` uses, so this
classification lives alongside (not instead of) the base insight — one announcement, one
note record, richer payload:

```bash
echo '<json>' | run add-note
```

Payload: everything `announcement-insights` Step 4 specifies, plus an `infoClassification`
field. Set `sourceSkill: "announcement-info-classifier"` (NOT `"announcement-insights"`,
even though this call reuses that step's base payload shape) — `sourceSkill` records
which SKILL.md is actually orchestrating this specific note, and here that's this skill,
not the one whose payload template you're borrowing. `add-note` throws if `sourceSkill`
is missing (see `skills/_shared/conventions.md` §21).

```json
{
  "infoClassification": {
    "claims": [
      {
        "claim": "...",
        "bucket": "NEW|KNOWN|FOLLOW_UP",
        "priorSource": "Q1FY27 concall, 2026-07-15"
      }
    ],
    "verdict": "one-line signal-strength read",
    "baselineCoverage": {
      "concallsChecked": 4,
      "pptChecked": true,
      "announcementLookbackMonths": 24,
      "thinBaseline": false,
      "excludedSameDayFilings": [
        {
          "announcementId": "...",
          "filingDate": "2026-08-28",
          "reason": "companion filing, same disclosure event as the announcement being classified"
        }
      ]
    },
    "modelUsed": "<the model you are running as right now>"
  }
}
```

`usecase: "announcement-info-classifier:standard"` — its own usecase string, distinct
from `announcement-insights:*`, since this is a different extraction (a different
caller's dedup check must never mistake one for the other — see conventions.md /
announcement-insights' Caching section for why usecase scoping matters). Then
`mark-processed <companyId> <announcementId> "announcement-info-classifier:standard"`.

## Output contract

One object: `{insight, headline, thesisChain, category, high_conviction, significance,
infoClassification: {claims[], verdict, baselineCoverage}}`. `claims[]` is the per-claim
bucket breakdown from Step 4; `verdict` is the roll-up signal-strength read; the base
`announcement-insights` fields are passed through unchanged so a caller doesn't have to
call both skills to get the full picture.

## What could be wrong with this analysis?

State this explicitly in every output, per the user's standing preference to validate
analysis against its own weak points before presenting it:

- **Baseline incompleteness is the single biggest failure mode.** A claim classified NEW
  is only as reliable as the lookback was complete. A recently-listed company, a company
  that skips concalls some quarters, or a `scanAnnouncements` pagination that silently
  stopped early all produce false NEW classifications. Always report `baselineCoverage`
  and flag `thinBaseline: true` rather than let a confident-looking NEW verdict hide a
  thin search.
- **Management can under-disclose deliberately.** A KNOWN classification assumes prior
  disclosure was honest and complete — if management concealed advanced deal talks (a
  live governance risk this repo's `management-credibility-tracker` and
  `annual-report-analysis` are built to catch separately), an announcement that LOOKS new
  might actually be new-to-the-market but not new-to-management, which is a different
  and arguably worse signal than either NEW or KNOWN captures. Don't conflate "not
  publicly known" with "not internally known."
- **Concall-notes AI synthesis can drop details** that the underlying transcript
  contains — a claim classified NEW purely against `concallNotes`' condensed bullets
  (rather than the full transcript) carries a small false-NEW risk from summarization
  loss. Cross-check against the full transcript when a NEW classification is
  economically material (i.e. would itself move `significance` to `high`).
- **This skill judges informational novelty, not price reaction.** A NEW classification
  is a necessary input to expecting a re-rating, not a guarantee of one — liquidity,
  broader market conditions, and unrelated news on the same day all affect actual price
  action independent of how new the information was.

## Suggested scale/automate path (per standing preference)

This is currently a per-announcement, on-demand skill (consistent with
`announcement-insights`' own scope). If the user finds themselves running this
repeatedly across a watchlist rather than one-off, the natural next step — mirroring how
`watchlist-insights`/`gainers-signal` wrap `announcement-insights` as a daily batch job —
is a thin scheduled wrapper that calls this skill per new announcement in a watchlist and
rolls the `NEW`-bucket-heavy ones into a digest, rather than re-running the full baseline
build (Step 3) from scratch each time: cache each company's Step-3 baseline
(`data/cache/announcement-info-classifier/<companyId>.json`, refreshed only when a new
concall/PPT/announcement appears) so repeated invocations on the same company don't
re-fetch 4 concalls and 2 years of announcement history every single time — that's the
single biggest token/latency cost in this skill and it's fully cacheable per
conventions.md §17(a).

## References

- `references/soic-new-info-framework.md` — the fuller SOIC "new information" framework
  this skill operationalizes (read once per session, not once per announcement).

## Related skills

- **`announcement-insights`** — produces the base category/insight this skill wraps.
  Call it directly (without this skill) when the user just wants "what does this
  announcement mean," with no interest in novelty-vs-priced-in.
- **`management-credibility-tracker`** — tracks whether management's PRIOR guidance was
  actually delivered on. Different question: that skill looks backward at track record,
  this one looks at whether TODAY's announcement itself contains new information.
- **`rerating-catalysts`** / **`investment-thesis-engine`** — natural downstream
  consumers: a NEW-heavy classification is exactly the kind of evidence that should get
  logged into a thesis's `evidence_log` (tag `[R]`) or surfaced as a fresh trigger.
