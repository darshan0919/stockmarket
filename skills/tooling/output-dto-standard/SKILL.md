---
name: output-dto-standard
description: Standard for how skills must persist analytical/reportable output as canonical JSON (DTOs) with a required record-level envelope, so rendered formats (email/PDF/HTML) are always reproducible from JSON and never drift from it. Reference this when creating a new skill that produces reports/signals/insights, or when retrofitting an existing one.
---

# Output DTO Standard

## The rule

Every skill that produces an analytical or reportable output must persist a canonical
JSON object — its **DTO** — as the source of truth for that output. Any rendered format
derived from it (email HTML, PDF, Markdown report, chat message, etc.) MUST be
reproducible FROM that JSON via a template/render step. Never generate the rendered
output independently of the JSON in a way that lets the two drift apart — if the JSON
says X, the render must always be able to reproduce X; the render step is a pure
function of the DTO, not a second source of facts.

Concretely: compute/classify → write JSON → render (template) from JSON → email/output.
Not: compute → email directly while separately, optionally, writing JSON as an
afterthought. The JSON is not a debug log; it is the thing the render is built from.

## Required record-level envelope

Every output JSON object, at the record level (e.g. one object per company/ticker/signal
inside a `signals[]`, `results[]`, etc. array — not just once per file), MUST include
these four fields, always:

| Field | Type | Meaning |
|---|---|---|
| `companyId` | string | The unique identifier for the company/ticker this record is about. Use the canonical symbol/ISIN-style ID already used elsewhere in the codebase — see `insightValidator.js`'s existing `companyId` usage (e.g. `"NSE:SWARAJENG"`) for the established convention. Do not invent a new ID scheme. |
| `creationTime` | string (ISO 8601) | Timestamp of when this record was first created. |
| `modifiedTime` | string (ISO 8601) | Timestamp of the last update to this record. Equals `creationTime` on first write. |
| `creator` | string | The skill name (kebab-case, matching the skill directory / frontmatter `name`) that produced this record, e.g. `"gainers-signal"`, `"insight-validation"`. |

These four fields live inside the record itself, alongside whatever domain-specific
fields the skill needs (e.g. `primary_driver`, `conviction`, `verdict`, `d2Return`, ...).

## Recommended (not yet mandatory)

Each skill should ideally also:
- Define its own typed DTO shape for its record (JSON Schema, or a documented TS/JSDoc
  type) alongside the code that produces it.
- Provide a corresponding render template that is a pure function of that DTO — same
  input always produces the same rendered output.

These are recommendations for now, not a hard gate — but write new skills this way from
the start; it's cheaper than retrofitting later.

## Relationship to Data Ecosystem v2 (docs/DATA_ECOSYSTEM.md)

This standard IS the record-level envelope of Data Ecosystem v2, enforced at write time
by `packages/jobs-runtime/lib/db.js` (`ensureEnvelope`): every stored object carries
`id` (deterministic), `creationTime`, `modifiedTime`, `creator`, plus `companyId(s)`,
`date`, and `type` where applicable. Persist reports via `db.saveReport(dto)`,
signals/deals/tweets via `db.appendEvents`, notes via `db.appendNotes`, validation via
`db.appendValidations` — never by writing collection files directly.

## Rollout status

As of Data Ecosystem v2 (2026-07-08), all runtime jobs conform via lib/db.js:
- `gainers-signal` (`gainersClassifier.js` → events collection, type=`gainer`)
- `insight-validation` (`insightValidator.js` → validation collection)
- `daily-deals-digest` (`dealsDigest.js` → events, type=`deal`)
- `tweet-signals` (`tweetSignalsClassifier.js` → events, type=`tweet`)
- `watchlist-sync` (`watchlistUpdater.js` → events, type=`watchlist-sync`)
- `watchlist-insights` (`notesDb.js` → notes collection)

The remaining ~51 skills in this repo are being migrated incrementally. This document is
the target standard for all future skill work; treat any new analytical/reportable output
as non-conformant until it carries these four fields, and retrofit existing skills
opportunistically as they're touched.
