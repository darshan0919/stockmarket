---
name: announcement-insights
description: Generate a single, actionable, quantified insight for ONE corporate announcement — the modular building block behind watchlist-insights and gainers-signal. Invoke directly whenever the user pastes/uploads a single announcement PDF and asks "what does this mean", "read this filing", "is this a big deal", or names a category (demerger, merger, acquisition, management change, SAST, order win, etc.) and asks for analysis. Also invoke on-demand from any other skill that needs a per-announcement insight instead of re-implementing extraction logic. Supports depth control (quick/standard/deep) and always treats demerger, merger, acquisition, and management_change as HIGH-CONVICTION categories worth deep, SOTP/governance-grade research even at small deal sizes.
---

# Announcement Insights

This skill's ONLY job is: given one corporate announcement (PDF + metadata), produce
one well-formed insight. It does not fetch watchlists, does not send digests, does not
push to Drive — those are orchestration jobs that CALL this skill per-announcement
(`watchlist-insights`, `gainers-signal`). If you're doing one of those broader jobs,
you arrived here correctly — read this once, apply it per announcement, then return to
the orchestrating skill's remaining steps.

## Why this exists as its own skill

Announcement-insight generation used to be duplicated logic sitting inside
`watchlist-insights`. As the category-template library grows (today: 18 categories,
more coming — see "Expanding the library" below), every orchestrating skill that reads
announcement PDFs would otherwise have to re-embed the same extraction checklists and
drift out of sync. Now there is exactly one place templates live
(`references/templates/`), and orchestrators are thin callers of the same CLI command.

## Inputs

| Param       | Required | Meaning                                                                                          |
| ----------- | -------- | ------------------------------------------------------------------------------------------------ |
| `pdfUrl`    | yes      | the announcement PDF to read                                                                     |
| `category`  | yes      | one of the categories below (an orchestrator usually supplies this via `categoriseAnnouncement`) |
| `companyId` | yes      | for notes-DB context lookup and (if saving) note persistence                                     |
| `depth`     | no       | `quick` \| `standard` (default) \| `deep` — see Depth below                                      |

If you (the caller) don't already know the category, run it through
`categoriseAnnouncement()` (`packages/jobs-runtime/lib/announcementTaxonomy.js`) first —
don't guess by eye; the taxonomy is the single source of truth shared by every skill.

## Setup

```bash
JOB=$(find /sessions -path '*packages/jobs-runtime/watchlistInsights.js' -not -path '*/node_modules/*' 2>/dev/null | head -1)
run(){ node "$JOB" "$@"; }
```

`watchlistInsights.js` is the shared I/O runtime for this skill (PDF parsing, notes-DB
read/write) even though the orchestration logic that calls it lives elsewhere — it is
NOT being deprecated, just repositioned: think of it as this skill's companion script.

## Caching: two tiers, never fewer, never conflated

Re-reading a PDF or re-deriving an insight that already exists wastes the caller's time
budget for no benefit — but two different callers reading the SAME announcement are not
automatically doing the SAME work, so there are two independent caching tiers with very
different sharing rules. Get this wrong in either direction and you either burn budget
re-parsing PDFs unnecessarily, or silently serve one skill's extraction to a caller that
needed something else entirely.

- **Tier 1 — raw PDF text, ALWAYS shared, no usecase.** `read-pdf` / `read-pdf-with-meta`
  cache the extracted `{text, numPages, isHeavyParse}` keyed only on the PDF URL
  (`cache/pdf-text/<hash>.json`). The text of a document is an objective fact, not a
  judgment call — it doesn't matter whether `watchlist-insights`, `gainers-signal`, or
  some future caller is asking. This is automatic; you don't do anything differently to
  get the cache hit, it's built into these two commands.
- **Tier 2 — the generated insight/note itself, scoped by `usecase`.** A "standard" note
  is not a substitute for a "deep" one on the same announcement, and a different skill's
  extraction (different template, different output shape) is not a substitute for
  either. Every `add-note` call MUST include a `usecase` field:
  `"announcement-insights:<depth>"` (e.g. `"announcement-insights:standard"`,
  `"announcement-insights:deep"`, `"announcement-insights:quick"`) — never the calling
  orchestrator's name; two orchestrators asking for the same depth on the same category
  SHOULD land in the same cache bucket, because they're asking for the same extraction.
  Similarly, every `mark-processed` call should pass that SAME `usecase` string as its
  3rd argument, so a different skill's own dedup check (via `--usecase-prefix` on
  `fetch-announcements`) never mistakes "announcement-insights already looked at this"
  for "I already looked at this," or vice versa.

**Never let a cache hit disappear from a human-facing output.** If a caller's own
skip-check (`fetch-announcements`'s usecase-scoped dedup) means an announcement isn't
returned as "new" today, that's fine for the GENERATION step — but any digest, email,
PDF, or artifact that lists announcements in a time window must still show it, using the
cached note, not omit it. `watchlist-insights`' `collectDigest`/`pickDigestNote` is the
reference implementation of this: it always includes every in-window, non-noise
announcement, and only uses the usecase lookup to decide WHICH note to display, never
whether to display the announcement at all. A raw JSON payload MAY reference an older
note by its `id` instead of duplicating the full insight text if that's more compact for
the consumer — but a rendered, human-facing view never should.

## Step 0 — Should this even be parsed? (heavy-document skip check)

Before fetching anything, check `category` against `HEAVY_DOCUMENT_CATEGORIES`
(`lib/announcementTaxonomy.js`): `results`, `concall_transcript`,
`investor_presentation`, `annual_report`. These are full dedicated-workflow documents
(often 15-300+ pages) that specialist skills already own —
`quarterly-result-analysis`/`pre-pead-scanner`, `concall-analysis`, `stock-report`/
`equity-research-extraction`, `annual-report-analysis` respectively.

- If you were invoked BY an orchestrator that already made this skip decision (e.g.
  `watchlist-insights`), you won't be called at all for these — this step is a no-op
  for you in that flow.
- If you were invoked standalone (a user pasted this exact PDF and asked "what does
  this mean") or by a caller that hasn't checked, still apply the skip: say briefly
  that this category is a dedicated-workflow document, name the specialist skill that
  owns it, and stop — don't parse a 200-page annual report just because you were asked
  to look at it in this skill's context. The one exception is `gainers-signal`, which
  deliberately does NOT skip `results` (its actionability signal needs the beat/miss
  from the filing itself) — respect that caller's explicit instruction if it asks for
  `results` anyway.

## Step 1 — Read the PDF (mandatory, every time you don't skip)

```bash
run read-pdf-with-meta "<pdfUrl>"
```

Returns `{text, numPages, isHeavyParse}` (`isHeavyParse: true` when `numPages > 4`;
`numPages` is `null`, not `false`, when it couldn't be derived — treat that as unknown
rather than "not heavy"). Transparently cache-backed (Tier 1, see above) — if any caller
already fetched this exact PDF URL today, this returns instantly from cache instead of
re-fetching/re-parsing. Never write an insight from the title/description alone. If
the PDF is empty/404/unparseable, say so explicitly in the insight, then fall back to
the description. If `isHeavyParse` came back true for a NON-skip-listed category (i.e.
this category wasn't supposed to be heavy but the actual document turned out to be —
happens with e.g. a lengthy `regulatory` order or a `capacity`-commissioning filing with
a bundled technical annexure), report `numPages` back to your caller — `watchlist-insights`
surfaces this in its digest's Heavy Parse Highlights section, which
`insight-validation` reviews for whether that category needs its own skip rule.

## Step 2 — Load company context

```bash
run get-company-notes "<companyId>"
```

If `null` (new company), use the `stock-report` skill for a 2-3 sentence
`businessSummary` before proceeding — the trend/contradiction check in every template
needs this history to mean anything.

## Step 3 — Fetch the template for this category + depth, and follow it exactly

```bash
run insight-template "<category>" --depth standard   # default
run insight-template "<category>" --depth quick       # 1-2 sentences, time-boxed use
run insight-template "<category>" --depth deep         # full framework, HIGH_CONVICTION categories
```

### Categories (18 today)

`shareholding_change`, `order_book`, `investor_meet`, `credit_rating`, `fundraise`,
`results`, `agm_egm`, `regulatory`, `capacity`, `dividend`, `buyback`, `general`
(uncategorized fallback), the four **HIGH-CONVICTION** categories
(`demerger`, `merger`, `acquisition`, `management_change`), and the three
**HEAVY-DOCUMENT** categories that most orchestrators skip entirely rather than
template (`concall_transcript`, `investor_presentation`, `annual_report`) — plus
`results`, which is both STRONG/SCHEDULED _and_ heavy-document; see Step 0.

**Sourcing rule (applies to the Income Statement Signal Scan below and to all `results`-category insights):** fetch the underlying Result filing via `stock-documents-fetcher`'s `documentsFetcher.js`/`StockscansClient.documents()` API, not web search — several P&L lines (Changes in inventories, the Other Income break-up, the tax-rate reconciliation) rarely appear in news summaries.

The `results` template carries a mandatory **Income Statement Signal Scan** — when a
headline margin/PAT beat or miss is reported, run `skills/_shared/income-statement-signals.md`
against QoQ and YoY baselines rather than checking inventory gains alone, quantify the
estimated contribution of whichever line(s) clear the materiality bar, and keep the insight
terse by reporting only what clears that bar, ranked by contribution to the PBT/PAT delta.
See `references/templates/results.md`.

### High-conviction categories get deep treatment by default

`demerger`, `merger`, `acquisition`, and `management_change` are flagged
`HIGH_CONVICTION_CATEGORIES` in the taxonomy (`lib/announcementTaxonomy.js`) — not
because every such deal is large, but because base-rate research (see
`references/demerger-merger-management-change-playbook.md`, distilled from SOIC's
special-situations research) shows this class of event produces disproportionate
re-rating alpha relative to its frequency, and retail investors have a genuine
structural edge here (institutional mandates can't touch small-cap spin-offs, which is
exactly where the mispricing lives).

**Default to `--depth deep` for these four categories** unless the caller explicitly
asked for `quick` (e.g. a time-boxed batch scan like `gainers-signal`'s top-20 pass).
`deep` walks through SOTP valuation / merger-arbitrage math / governance red-flag
scoring — read the playbook file once per category before writing, not once per
announcement; the checklist in the `.deep.md` template is what you apply per
announcement.

### Uncategorized announcements still get real attention

`general` is not a dumping ground. Per its template: read the PDF fully, cross-reference
the notes DB for continuity, and if the announcement references something outside the
document (an industry dynamic, a regulation, a peer precedent) use your knowledge base
and, if genuinely uncertain, a web search against a credible source (exchange filings,
company IR page, recognised financial outlet) — never fabricate context. If you notice
the same uncategorized subject recurring (e.g. "litigation settlement" three times this
month), say so in the insight's last sentence — that's the signal
`insight-validation`'s nightly review looks for when proposing new categories (see
"Expanding the library" below).

## Step 4 — Save the note (if this is a persistence-oriented call, not a one-off question)

```bash
echo '<json>' | run add-note
```

Payload: `{companyId, ticker, name, businessSummary?, note:{type:"announcement",
announcementId, announcementTitle, pdfUrl, insight, significance, tags, category,
announcementDescription, usecase:"announcement-insights:<depth>",
modelUsed:"<the model you are running as right now>"}}`.

`usecase` is what makes this note distinguishable from a DIFFERENT depth's or a
DIFFERENT skill's note on the same announcement (see "Caching" above) — always pass it
explicitly as `"announcement-insights:<depth>"` (matching whatever `--depth` you used
for `insight-template`) rather than relying on the field's default, which only exists
for backward compatibility with callers written before this convention existed. Then
call `mark-processed <companyId> <announcementId> <that same usecase>` so your caller's
own dedup check stays correctly scoped.

`add-note` deterministically enforces a **significance floor of `medium`** and a
`high_conviction` tag for any HIGH_CONVICTION_CATEGORIES note — this is a code-level
guard (see `cmdAddNote` in `watchlistInsights.js`), not just a prompt instruction, so it
holds even if the model forgets. You still choose the actual significance level and
write the actual insight text; the guard only prevents a high-conviction category from
silently landing as `low`/`routine`.

If you were invoked standalone (user pasted a PDF and asked "what does this mean") with
no `companyId`/persistence intent, skip this step and just answer in chat/output.

## Output contract

A single insight object: `{insight, significance, tags, category, high_conviction,
numPages, isHeavyParse}` (`high_conviction: true` iff `category` is in
`HIGH_CONVICTION_CATEGORIES`, regardless of whether the caller asked for `deep` —
orchestrators should surface this flag independent of the `significance` bucket, e.g.
in a digest email's subject line or a dedicated "high-conviction" section).
`numPages`/`isHeavyParse` come straight from Step 1's `read-pdf-with-meta` call and
exist so a caller can highlight "this wasn't skip-listed but still needed heavy
parsing" separately from the Step 0 skip list.

If Step 0 skipped the announcement entirely, there is no insight object — just a
`{skipped: true, category, reason}` result for the caller to log.

## Expanding the library (this is where new categories get added)

The library is intentionally not "done." Every category here started as recurring
`general` notes that a human or `insight-validation`'s nightly review flagged as
deserving a dedicated checklist. To add a new category:

1. Add its detection keywords to `CATEGORY_RULES` in
   `packages/jobs-runtime/lib/announcementTaxonomy.js` (mind ordering — more specific
   categories must precede broader ones).
2. Add a new `references/templates/<category>.md` (or `.standard.md` + `.deep.md` if
   it should also be high-conviction) following the existing files' structure: what to
   extract, what to assess, and (for deep) a link to a dedicated playbook reference if
   the reasoning is non-trivial (see how `demerger`/`merger`/`management_change` do it).
3. If it should be HIGH_CONVICTION, add it to `HIGH_CONVICTION_CATEGORIES` in the
   taxonomy file and to `CATEGORY_LABELS`. If instead it's a heavy dedicated-workflow
   document type that a specialist skill already owns (the `insight-validation` Heavy
   Parse Highlights review is exactly how these get proposed), add it to
   `HEAVY_DOCUMENT_CATEGORIES` + `HEAVY_DOCUMENT_SKIP_REASONS` instead — a category is
   HIGH_CONVICTION or HEAVY_DOCUMENT, never both (one means "look harder," the other
   means "don't look here, look there").
4. No code changes needed beyond that — `insightTemplate()` in `watchlistInsights.js`
   reads the new file by category name automatically.

`insight-validation` (see its SKILL.md "Template-coverage proposals" section) is the
skill responsible for surfacing WHICH new categories are worth adding, based on
recurring `general`-category notes it observes during nightly validation — this skill
just makes adding one, once proposed, mechanical.

## References

- `references/demerger-merger-management-change-playbook.md` — the full valuation/
  timing/governance framework behind the four high-conviction categories' deep
  templates. Read once per category, not once per announcement.
- `references/templates/` — one `.md` per category (± `.standard.md`/`.deep.md` for
  high-conviction ones). This directory IS the single source of truth for template
  content; `watchlistInsights.js insight-template` is just a loader over it.
