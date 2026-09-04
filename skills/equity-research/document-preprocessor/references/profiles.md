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

---

## `annual_report`

The heaviest profile and the one most likely to fail its calibration gate — long,
often scanned, table-dense. Ship it last, and expect a lower confidence rate.

```jsonc
{
  "fy": "FY26",
  "related_party_transactions": [ {"party": "...", "relationship": "...", "nature": "...", "amount_inr_cr": null, "page": null} ],
  "contingent_liabilities": [ {"nature": "...", "amount_inr_cr": null, "page": null} ],
  "auditor": {"opinion": "...", "qualifications": [], "emphasis_of_matter": [], "page": null},
  "remuneration": [ {"name": "...", "role": "...", "amount_inr_cr": null, "page": null} ],
  "capex_commercialisation": [ {"project": "...", "status": "...", "quote": {...}} ],
  "kmp_changes": [ {"name": "...", "role": "...", "change": "appointed|resigned", "date": null, "quote": {...}} ],
  "misc_expenses": [ {"line": "...", "amount_inr_cr": null, "page": null} ],
  "verbatim_quotes": [ {"text": "...", "page": 1} ]
}
```

Extract the tables as printed. Do not total them, do not compute
remuneration-as-%-of-PAT, do not judge whether an RPT is concerning — every one
of those is `annual-report-analysis`'s job, and doing them here both duplicates
that skill and launders a judgment through a schema.
