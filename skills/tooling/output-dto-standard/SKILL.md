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

| Field          | Type              | Meaning                                                                                                                                                                                                                                                                                           |
| -------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `companyId`    | string            | The unique identifier for the company/ticker this record is about. Use the canonical symbol/ISIN-style ID already used elsewhere in the codebase — see `insightValidator.js`'s existing `companyId` usage (e.g. `"NSE:SWARAJENG"`) for the established convention. Do not invent a new ID scheme. |
| `creationTime` | string (ISO 8601) | Timestamp of when this record was first created.                                                                                                                                                                                                                                                  |
| `modifiedTime` | string (ISO 8601) | Timestamp of the last update to this record. Equals `creationTime` on first write.                                                                                                                                                                                                                |
| `creator`      | string            | The skill name (kebab-case, matching the skill directory / frontmatter `name`) that produced this record, e.g. `"gainers-signal"`, `"insight-validation"`.                                                                                                                                        |

These four fields live inside the record itself, alongside whatever domain-specific
fields the skill needs (e.g. `primary_driver`, `conviction`, `verdict`, `d2Return`, ...).

## `modelUsed` — required whenever an LLM produced (part of) this record

If any part of a record's content was produced by an LLM doing reasoning, judgement,
synthesis, classification-by-prompt, or writing (as opposed to deterministic code —
arithmetic, sorting, regex/keyword matching, template rendering, API/file I/O), the
record MUST also carry:

| Field | Type | Meaning |
|---|---|---|
| `modelUsed` | string | The exact model string that generated the LLM-authored content in this record, e.g. `"claude-sonnet-5"`, `"claude-opus-5"`, `"gemini-2.5-pro"`. |

Rules:
- **Pure-script records carry no `modelUsed` field at all** — don't write `null` or
  `"none"`, just omit it. Example: `gainersClassifier.js` in `gainers-signal` is 100%
  deterministic (keyword/threshold rules, Jaccard similarity, no API call) — its event
  records correctly have no `modelUsed`. The moment a skill step asks an LLM to write
  the analyst commentary/insight text that then gets saved into a note or report DTO,
  that DTO needs `modelUsed`.
- **Mixed records** (some fields scripted, some fields LLM-written — e.g. a gainers
  signal whose `conviction` is rule-based but whose top-3 follow-up briefing prose is
  LLM-written) get `modelUsed` on the record that contains the LLM-written part, not on
  the purely-scripted one.
- **Scheduled tasks**: a task can be executed by any configured model (Sonnet, Opus,
  Haiku, or a cheaper model like Gemini/Haiku the user has routed a sub-step to for cost
  reasons — see user preference on delegating low-judgement steps to cheaper models).
  Whatever model actually ran the task's LLM steps for that invocation must be captured
  as `modelUsed` on every DTO/note/report that invocation writes. Never hardcode a
  model name in a skill/script — read it from the running context (the model executing
  the skill's reasoning step at that moment) and pass it through explicitly into the
  DTO, the same way `creator` is passed through today. See
  `skills/tooling/cowork-task-architect/SKILL.md` for how this is wired for scheduled
  tasks specifically.
- Where a pipeline calls more than one model for different LLM sub-steps that land in
  the *same* record (e.g. Sonnet drafts, Opus reviews), use an array:
  `"modelUsed": ["claude-sonnet-5", "claude-opus-5"]` rather than picking one arbitrarily.

## The `additional` field — escape hatch for nuance the schema didn't anticipate

Every DTO SHOULD include a top-level `additional` field. Its value can be any JSON shape — a
scalar string, a flat object, a nested object of objects, an array of dicts, an array of
strings. Use it for stock/sector/scenario-specific insight that doesn't fit the skill's fixed
schema (a bear/base/bull table, a one-off dependency note, a geography split unique to this
company) — put the fact where it naturally belongs in `additional` rather than distorting it
into an existing field, or worse, leaving it out because "there's no field for it."

The render layer must not hand-write bespoke markup per insight. Use the shared shape-sniffing
renderer at [`skills/_shared/render_additional.py`](../../_shared/render_additional.py)
(`render_additional_html(dto.get("additional"))`) — it inspects the JSON shape at render time
(callout vs table vs kpi-grid vs card-grid vs bullets) and lays it out automatically using the
same component vocabulary as `skills/_shared/pdf-design-guide.md`, so every skill gets this for
free without writing per-insight rendering code. See that module's docstring for the full
shape → layout rule table.

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
`date`, and `type` where applicable. When authoring a NEW skill/collection, follow the checklist in `docs/DATA_RULES.md`.
Persist reports via `db.saveReport(dto)`,
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
- `drhp-ipo-analysis` (`db.saveReport(dto)` → reports collection, type=`drhp-ipo-analysis`;
  render step is `scripts/render_drhp.py`, a pure function of the persisted DTO — see the
  skill's SKILL.md "Phase 4" for the enforced data/UI split. Retrofitted 2026-07-24 after a
  compression pass on a hand-written report silently dropped facts because no DTO existed to
  render from.)

The remaining ~50 skills in this repo are being migrated incrementally. This document is
the target standard for all future skill work; treat any new analytical/reportable output
as non-conformant until it carries these four fields, and retrofit existing skills
opportunistically as they're touched.

`modelUsed` (2026-07-30): added as a fifth envelope concern — required on any record with
LLM-authored content, omitted on pure-script records. `lib/db.js`'s `ensureEnvelope` now
passes it through (never invents or defaults it, since most collections are mixed
script/LLM). Retrofitted so far: `gainers-signal` (the top-3-by-conviction briefing
reports, which are LLM-written narrative — the classifier's `gainer` events stay
script-only, no `modelUsed`), `watchlist-insights` (per-announcement insight notes —
reading the PDF and writing the insight is the LLM step), `drhp-ipo-analysis` (the whole
report DTO is LLM-authored analysis). `insight-validation` was checked and correctly
gets NO `modelUsed` — `insightValidator.js` is fully deterministic (no LLM call
anywhere in that job), a useful worked example of the "omit, don't null" rule.
Scheduled-task runs additionally get `modelUsed` wired in via `cowork-task-architect`
(the task prompt must pass the executing model's string into `track_invocation.py
--model` and into any DTO its LLM steps write), since a task's executing model can vary
per run and is never known ahead of time by the companion script. Remaining skills: add
`modelUsed` opportunistically per the rule above whenever touched.
