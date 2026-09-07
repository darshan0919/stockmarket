# Extraction profiles

> **Read every heavy document with `read-pdf-with-meta --full`.** The default
> read stops at 8,000 characters. Every profile below except `announcement`
> describes content that lives well past that point — an annual report's RPT
> tables and auditor notes are hundreds of thousands of characters in. Extracting
> from a truncated read produces a schema full of `null`s that passes quote
> verification and looks complete. `verifyExtract` now rejects it outright.

One schema per document type. All five obey the five rules in SKILL.md Step 2 —
JSON only, literal facts only, `null` + `missing[]` for absent, a verbatim quote
and page for every fact, `{"error":"unreadable"}` for a scan that won't read.

Every profile shares this envelope:

```jsonc
{
  "companyId": "NSE:XYZ", // as supplied by the queue; do not re-derive
  "documentDate": "YYYY-MM-DD|null", // the DOCUMENT's own dateline, not today
  "data": {
    /* profile-specific, below */
  },
  "missing": ["data.facts.amount_inr_cr"], // dotted paths you could not find
}
```

**`documentDate` is the letter's own dateline**, read off the document body —
never the filing timestamp and never today. Downstream, `announcement-info-classifier`
uses it to decide whether a prior filing genuinely preceded this one (its Step 3e),
and a wrong date there turns a same-day companion filing into false "prior
knowledge". This one field carries more weight than its size suggests.

A quote object is always `{"text": "...", "page": N}`. Page numbers are
1-indexed; use `null` if the document genuinely has no page markers, never 0.

---

## `announcement`

Mirrors the fields the `announcement-insights` category templates ask for, so a
consuming skill can fill its template from the extract without re-reading.

```jsonc
{
  "category_hint": "order_book|fundraise|shareholding_change|credit_rating|management_change|acquisition|merger|demerger|capacity|dividend|buyback|regulatory|agm_egm|investor_meet|general",
  "facts": {
    "amount_inr_cr": null, // ₹ crore, as stated; convert only stated units
    "counterparty": null,
    "shares_absolute": null,
    "pct_of_capital": null,
    "who": null, // person/entity the announcement concerns
    "buy_or_sell": null, // "buy"|"sell"|null
    "price": null,
    "threshold_crossed": null,
    "effective_date": null, // YYYY-MM-DD
    "completion_date": null, // YYYY-MM-DD, if the filing states a deadline
    "rating_from": null,
    "rating_to": null,
    "rating_agency": null,
  },
  "stated_rationale": null, // management's own stated reason, verbatim-ish, or null
  "verbatim_quotes": [{ "text": "...", "page": 1 }], // max 5, the ones supporting the facts above
}
```

`category_hint` is a HINT: the taxonomy in `announcementTaxonomy.js` remains the
single source of truth for category, and a consuming skill uses that, not this.
The field exists only to flag a mismatch worth looking at — one of the documented
taxonomy gaps (a bare `"PPT <Month> <Year>"` title, generic `"Scheme of
Arrangement"` language, a generic `"Press Release"`) shows up as a disagreement
between the two, which is useful. Never "correct" the taxonomy from here.

**Convert nothing.** "Rs. 51.2 crore" is `51.2`; "Rs. 512 lakh" is `5.12` ONLY
because lakh→crore is a stated-unit conversion, not an estimate. A figure given
in USD stays in USD in the quote and `amount_inr_cr` is `null` with the field
listed in `missing[]` — do not apply an exchange rate you were not given.

---

## `result`

The line items that decide whether a headline beat is real. The
`skills/_shared/income-statement-signals.md` scan needs these specific lines, and
several of them (changes in inventories, the other-income break-up, the tax
reconciliation) rarely appear in news summaries at all — which is why the
extraction has to come from the filing.

```jsonc
{
  "period": "Q1FY27",
  "consolidated": true, // false if these are standalone figures
  "reported": {
    "revenue_cr": null,
    "other_income_cr": null,
    "total_income_cr": null,
    "cogs_cr": null,
    "changes_in_inventories_cr": null,
    "employee_cost_cr": null,
    "other_expenses_cr": null,
    "ebitda_cr": null,
    "ebitda_margin_pct": null,
    "depreciation_cr": null,
    "finance_cost_cr": null,
    "pbt_cr": null,
    "tax_cr": null,
    "tax_rate_pct": null,
    "pat_cr": null,
    "eps": null,
    "exceptional_items_cr": null,
  },
  "prior_period": { "label": "Q1FY26", "revenue_cr": null, "ebitda_cr": null, "pat_cr": null },
  "segments": [
    { "name": "...", "revenue_cr": null, "ebit_cr": null, "quote": { "text": "...", "page": 3 } },
  ],
  "one_offs": [{ "what": "...", "amount_inr_cr": null, "quote": { "text": "...", "page": 4 } }],
  "auditor_note": null, // any qualification/emphasis of matter, verbatim
  "verbatim_quotes": [{ "text": "...", "page": 1 }],
}
```

**Report the sign as printed.** A bracketed `(12.4)` in an Indian filing is
negative — record `-12.4`. `changes_in_inventories` in particular flips sign
between presentations and getting it wrong inverts the entire inventory-gain
signal the consuming scan is built to detect.

Do NOT compute anything the filing doesn't print: if `ebitda_cr` isn't stated,
it's `null`, even when the components are all there. Derivation is the consuming
skill's job, and a derived number indistinguishable from a reported one is how a
reconciliation check stops being able to catch anything.

---

## `transcript`

```jsonc
{
  "period": "Q1FY27",
  "guidance": [ {
    "metric": "revenue growth", "guided_value": "18-20%", "timeframe": "FY27",
    "direction": "up|down|flat|null",   // ONLY if management states it
    "speaker": "...", "quote": {"text":"...","page":12}
  } ],
  "segment_commentary": [ {"segment": "...", "point": "...", "quote": {"text":"...","page":8}} ],
  "capex": [ {"what": "...", "amount_inr_cr": null, "timeframe": null, "quote": {...}} ],
  "order_book": {"value_inr_cr": null, "as_of": null, "quote": {...}},
  "capacity": [ {"what": "...", "value": null, "unit": null, "timeline": null, "quote": {...}} ],
  "questions_deflected": [ {"question": "...", "asked_by": "...", "quote": {...}} ],
  "verbatim_quotes": [ {"text": "...", "page": 1} ]
}
```

Extract **every** guidance statement, not the important ones — recall-first. A
range stays a range (`"18-20%"`), never a midpoint. `direction` is filled only
when management says it; do not infer direction from the numbers.

`questions_deflected` is the one judgment-adjacent field, so it is scoped
narrowly and mechanically: include a question **only** when the transcript shows
management explicitly declining to answer ("we don't guide on that", "can't
comment", "let's take that offline"). Do not assess whether an answer was
_adequate_ — that is the consuming skill's read.

---

## `ppt`

```jsonc
{
  "period": "Q1FY27",
  "targets": [{ "metric": "...", "value": "...", "timeframe": "...", "slide": 9 }],
  "capex_pipeline": [
    { "project": "...", "amount_inr_cr": null, "commissioning": null, "slide": 12 },
  ],
  "capacity": [{ "line": "...", "current": null, "planned": null, "unit": null, "slide": null }],
  "order_book": { "value_inr_cr": null, "as_of": null, "slide": null },
  "kpis": [{ "name": "...", "value": null, "unit": null, "period": null, "slide": null }],
  "verbatim_quotes": [{ "text": "...", "page": 1 }],
}
```

Decks state commitments with dates — that is what makes them the best source for
the baseline card's `commitments[]`. Record the commissioning/target date exactly
as printed ("H2FY27", "Q3FY27", "March 2027"); do not normalise it to a date, and
do not treat a chart axis label as a stated target.

For `page` in quotes, use the slide number.

### `kpis` is a highlights slide, not the whole deck (calibration finding, 2026-09-06)

A calibration run against real decks found two independent readers disagreeing on
`kpis` count by 2-10x on every single document (25 items vs 190, 17 vs 165,
9 vs 27, and so on, with no exceptions across 14 decks) — not because either
reader was sloppy, but because the schema never said how exhaustive to be. One
reader treated every number on every slide as a KPI; the other extracted only the
handful on the "highlights" or "at a glance" slide near the front.

The overwhelming source of the gap is investor decks' back-of-deck appendix: a
multi-year or multi-quarter P&L/balance-sheet trend table (revenue, EBITDA, PAT,
margins, working capital, each broken out by FY23/FY24/FY25/FY26, sometimes with
20-50 such cells on a single slide). That table is real data, but it is not a
KPI callout — it is the deck's version of a financial-statements page, and
exploding every line-item×year cell into a separate `kpis` entry is what drove
the disagreement (one deck alone had 94 of its 194 reference `kpis` come from
three appendix slides).

**`kpis` is for the deck's own headline metrics** — the numbers the company chose
to put on its "highlights," "at a glance," "key metrics," or title/cover slide as
the top-line summary of the period, typically 5-15 items per deck (AUM, revenue,
growth %, margin, branch/customer count, and similar single-period callouts).
Do NOT walk a multi-year financial-statement or trend-table slide and extract
every cell — if a slide has more than ~2 years/quarters of the same line item
laid out as a table, that is out of scope for `kpis` entirely (it is not
`capacity` or `targets` either; leave it out of the schema, `misc` catch-alls
included — this profile is not the place to transcribe a financial-statements
appendix). When genuinely unsure whether a number belongs, prefer leaving it out
over including it — an incomplete `kpis` list downstream-merges fine; a
kitchen-sink one does not.

### `capacity` vs `kpis` (calibration finding, 2026-09-06)

`capacity` is specifically physical/operational scale: branch count, plant
capacity (MTPA, Sq Ft), rig count, distribution locations — a "how much
infrastructure do we have" line, whether current or planned. The same
calibration run found the cheap extractor returning `capacity: []` while
putting branch/location counts into `kpis` instead (or missing them entirely).
If a highlights-slide number describes physical footprint or installed/planned
capacity, it belongs in `capacity`, not `kpis`, even though it is also a
"key metric" in the colloquial sense.

---

## `annual_report`

The heaviest profile and the one most likely to fail its calibration gate — long,
often scanned, table-dense. Ship it last, and expect a lower confidence rate.

```jsonc
{
  "fy": "FY26",
  "related_party_transactions": [ {"party": "...", "relationship": "...", "nature": "...", "amount_inr_cr": null, "sourceUnit": "cr|lakh|million", "consolidated": true, "page": null} ],
  "contingent_liabilities": [ {"nature": "...", "amount_inr_cr": null, "sourceUnit": "cr|lakh|million", "consolidated": true, "page": null} ],
  "auditor": {"firm": "...", "appointedDate": "...", "opinion": "...", "qualifications": [], "emphasis_of_matter": [], "page": null},
  "remuneration": [ {"name": "...", "role": "...", "amount_inr_cr": null, "sourceUnit": "cr|lakh|million", "page": null} ],
  "capex_commercialisation": [ {"project": "...", "status": "...", "quote": {...}} ],
  "kmp_changes": [ {"name": "...", "role": "...", "change": "appointed|resigned", "date": null, "quote": {...}} ],
  "misc_expenses": [ {"line": "...", "amount_inr_cr": null, "sourceUnit": "cr|lakh|million", "page": null} ],
  "verbatim_quotes": [ {"text": "...", "page": 1} ]
}
```

Extract the tables as printed. Do not total them, do not compute
remuneration-as-%-of-PAT, do not judge whether an RPT is concerning — every one
of those is `annual-report-analysis`'s job, and doing them here both duplicates
that skill and launders a judgment through a schema.

### Find the table, not the cross-reference (calibration finding, 2026-09-06)

An annual report almost always mentions related-party transactions and
remuneration in the Directors' Report first, and that mention is usually a
cross-reference, not the data itself — e.g. "details are set out in Note
12(ii)(a) of the ... Financial Statements" or "Members may refer to the notes
to accounts." A calibration run against real filings found the extractor
stopping at this first mention and reporting `related_party_transactions: []`
and `remuneration: []`, when the actual numeric table existed later in the
document — sometimes under a completely different heading ("Related Party
Disclosures," "Disclosure of Related Parties," a numbered note like "Note 35")
and sometimes in more than one place (a "transactions during the year" table
AND a separate "year-end balances" table, both legitimate, both extractable).

Before writing `related_party_transactions: []`, `remuneration: []`, or
`contingent_liabilities: []`, do a second pass: search the document for every
occurrence of "related part", "remuneration", "contingent liabilit", "KMP", and
"key managerial personnel" — not just the first hit — and confirm none of them
lead to a table with named parties and rupee figures. Only report an empty
array when that second pass is done and genuinely finds nothing. A one-line
cross-reference to a note is a signal to keep looking, not a place to stop.

### State the unit you read, every time (calibration finding, 2026-09-06)

Indian annual reports report figures in Crores, Lakhs, or Millions
interchangeably — sometimes a single filing uses different units in different
notes. The schema field is always `amount_inr_cr`, so convert before writing
it (1 cr = 100 lakh = 10 million), but record what you actually read via
`sourceUnit` so a wrong conversion is traceable instead of silently baked in.
A calibration run found a filing reporting "(All amounts are in INR Millions
unless otherwise stated)" where the extracted crore figures could not be
traced back to the actual note — get the unit right before you divide or
multiply; when a table itself has no unit line nearby, search backward from
the table for "In Rs. Lakhs", "In ` Crores", or "All amounts are in INR
Millions" rather than assuming the schema's own unit.

### Standalone vs consolidated (calibration finding, 2026-09-06)

Most annual reports carry BOTH a standalone and a consolidated set of
financial statements, each with its own related-party-transactions and
contingent-liabilities notes — and the two legitimately report different
figures (a consolidated contingent liability is typically larger, since it
includes subsidiaries). Default to the **consolidated** figures and set
`consolidated: true`; if the filing has no consolidated statements (a
standalone-only company), set `consolidated: false` and note it in
`verbatim_quotes`. Never mix a standalone RPT table with a consolidated
contingent-liabilities table in the same extract without marking which is
which — a downstream reader comparing two companies' numbers needs to know
they are the same kind of figure.

### Auditor firm and appointment date (added 2026-09-06, docs/REUSE_ARCHITECTURE_PLAN.md §4.2)

`auditor.firm` and `auditor.appointedDate` are new fields — extract them as
printed, never computed or inferred. `forensic-accounting`'s Manpasand-pattern
check (a sudden, unexplained auditor change is one of the four documented
Indian fraud patterns this skill screens for) currently re-reads 2-3
consecutive annual reports by hand just to see whether the auditor firm
changed year over year. Once every annual_report extract carries `firm` and
`appointedDate`, that comparison becomes a diff across cached extracts instead
of a fresh read each time — the fact (which firm, since when) lives here; the
JUDGMENT (is this change suspicious, does it fit the fraud pattern) stays
entirely in `forensic-accounting` and is never computed by this pipeline.

- `firm` — the auditor's name exactly as printed (e.g. "S. C. Varma and Co.",
  "KNAV CPA LLP"). For a joint-auditor filing, use a single string joining
  both names as printed — do not silently pick one.
- `appointedDate` — the date of appointment/reappointment AS PRINTED in the
  filing (a board-meeting date, an AGM date, or a tenure statement like "for a
  period of 5 years from FY24") — do not compute a tenure length or a
  "years since appointment" figure; that arithmetic is `forensic-accounting`'s
  job once it has two or more years of `appointedDate` values to compare.
  `null` when the filing does not state it (common for a long-tenured auditor
  whose original appointment predates the report by many years).

This is a genuine schema change — `PROFILE_SCHEMA_VERSIONS.annual_report` in
`packages/jobs-runtime/lib/docExtracts.js` bumped to 2 alongside it, so
`resolveFilingContent()` treats every extract stored before this change as
stale and routes it back through extraction rather than silently handing a
caller an `auditor` object with no `firm`/`appointedDate` fields.
