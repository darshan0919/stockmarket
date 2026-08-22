---
name: concept-transcript-integrator
description: Learn a concept from Learnyst course transcripts (SOIC membership) and wire that learning directly into the equity-research skills that use it — reusable version of the workflow used to bring sector valuation KPIs and J-Curve growth-catalyst frameworks into the skill library. Trigger this whenever the user says things like "go through the transcripts on X and update our skills", "learn from the lessons about Y and apply it to our valuation/analysis skills", "integrate what SOIC teaches about Z into the [skill name] skill", or names one or more specific Learnyst lesson/course titles and asks for their content to become part of how a skill works. Do NOT use this for a one-off question about what a lesson says (that's just reading a transcript) — use it when the explicit intent is to durably change a skill's instructions/references based on lesson content.
---

# Concept Transcript Integrator

## What this is

A generalized, repeatable version of a workflow already run twice by hand in this
project: (1) find the Learnyst lessons that teach a concept, (2) digest what they
actually teach, (3) update the equity-research skill(s) that concept applies to so
the learning becomes part of how the skill works — not just a one-off report about
what the lessons said.

Two worked examples this skill is built from:

- **Sector valuation KPIs**: read the full "Level 3 How to Value a Company &
  Portfolio Creation" module plus every lesson with "Valuation" in its course/lesson
  title → produced `skills/_shared/sector-valuation-kpis.md` → wired it into 6 skills
  wherever they touch valuation (`equity-research-deepdive`, `peer-comparison`,
  `financial-model`, `investment-thesis-engine`, `consecutive-filings-diff`).
- **J-Curve growth catalysts**: read 8 named lessons on growth catalysts/J-Curve
  stocks → produced a checklist system → extended `rerating-catalysts`'s framework
  doc, SKILL.md phases, extraction script, and scoring code with a new J-Curve
  inflection tag.

This skill is the reusable shape of that same two-pass workflow: **Extraction**
(mechanical — find lessons, fetch bodies, concatenate) is scripted; **Analysis**
(digest the content, decide what it means for a skill, write the actual prose
changes) is the LLM's job, per `skills/_shared/conventions.md` rule 17.

## Phase 0 — Resolve the concept and locate the local repo

Confirm (from the user's request, or by asking if genuinely ambiguous) the concept
being learned in a few words (e.g. "valuation", "J-Curve growth catalysts",
"management credibility signals"), and whether the user already named specific
lesson/course titles or wants a keyword sweep. Locate the local `stockmarket`
checkout (same local-first / GitHub-raw-fallback resolution as every other skill —
see the router template) so the scripts below run against the real
`data/learnyst-lessons.json` and `skills/registry.json`.

## Phase 1 — Find the matching lessons (scripted, zero LLM)

Run `scripts/find_concept_lessons.py`:

- If the user named specific lesson titles, pass `--lesson-titles "title 1,title 2,..."`.
- Otherwise pass `--keywords "term1,term2"` — this substring-matches both
  `courseTitle` and `lessonTitle`, the same approach used for the "Valuation"-keyword
  sweep. Add `--course-title "..."` to scope to one module (e.g. "Level 3 How to
  Value a Company") when the user pointed at a whole module rather than a bare
  keyword.

```
python3 skills/tooling/concept-transcript-integrator/scripts/find_concept_lessons.py \
  --keywords "valuation" --data-root data > /tmp/concept_matches.json
```

**If the result is `[]` (no matches):** the concept isn't in the cached Learnyst
index yet. Tell the user, and offer to run `yarn learnyst-transcript-refresh`
(full catalog refresh — the underlying job is course-scoped, not lesson-title-
scoped, so there's no narrower refresh option) to pull the latest catalog, then
retry the search. Don't run the refresh unprompted — it's a real network job
against a third-party API with its own auth-token-expiry failure mode (see
`docs/learnyst-api-schemas.md`); confirm with the user first unless you are
operating unattended, in which case run it and say you did.

**If the result is large (rule of thumb: more than ~15 lessons):** this is likely
too broad a sweep to digest economically in one pass. Show the matched lesson
titles and ask the user to narrow (a tighter keyword, a specific course, or a
subset of titles) rather than concatenating dozens of transcripts into one
subagent call.

## Phase 2 — Concatenate transcripts (scripted, zero LLM)

Run `scripts/concat_transcripts.py` on the Phase 1 output to produce one ordered
`.txt` file with `====`/`COURSE:`/`LESSON:` delimiters (the same shape used for all
three prior digestions this project has done):

```
python3 skills/tooling/concept-transcript-integrator/scripts/concat_transcripts.py \
  --matches-file /tmp/concept_matches.json --data-root data \
  --out /tmp/concept_transcripts.txt
```

Read the script's JSON summary — it reports which matched lessons were actually
included vs. skipped (missing body file, no transcript, non-video lesson type) and
why. **Always surface the skipped list to the user** (even a short "2 lessons
skipped — not yet fetched" line) rather than silently digesting a subset; a silent
gap here is exactly the kind of thing that made the prior two integrations
worth double-checking by hand.

## Phase 3 — Digest the transcripts (this is the Analysis pass — LLM judgment)

Dispatch the concatenated file to a subagent (general-purpose) with a detailed
extraction prompt, mirroring the pattern used for all three prior digestions:

- State the concept being learned and why (what downstream skill work this feeds).
- Ask the subagent to read the whole file and return a **structured markdown
  digest**, not a full re-transcription: the concrete frameworks, checklists,
  thresholds, numeric rules-of-thumb, case studies/examples, and any named
  exceptions or caveats the lessons actually teach.
- Explicitly instruct it to flag duplicated content across lessons (SOIC lessons
  frequently repeat the same point across a module) and to note any ASR
  (speech-to-text) ambiguity it notices rather than silently guessing.
- Ask it to organize the digest so each distinct framework/checklist/threshold is
  a clearly labeled section — this becomes the raw material for Phase 4's actual
  skill edits, so structure matters more than prose polish.

Do not skip straight to editing skill files from the raw transcript text yourself in
the main context — the concatenated file is often hundreds of KB; let the subagent
spend tokens digesting it and return only the structured result.

## Phase 4 — Identify target skill(s) (scripted candidates, human confirms)

Run `scripts/suggest_target_skills.py` against the same keywords from Phase 1 to get
a ranked candidate list of skills whose registry aliases/description overlap the
concept:

```
python3 skills/tooling/concept-transcript-integrator/scripts/suggest_target_skills.py \
  --registry skills/registry.json --keywords "valuation,DCF,P/E"
```

This is a **candidate list, not a decision** — always show it to the user (or, in
an unattended run, state the chosen targets plainly as your working assumption)
before editing anything. In both prior integrations the user ultimately named or
confirmed the actual target skill(s); don't silently auto-apply a low-confidence
match. If the concept is genuinely cross-cutting (like both prior examples — sector
valuation touched 6 skills; J-Curve touched 1 skill but across SKILL.md + a
reference file + 2 scripts), say so and propose the shared-reference-file pattern
(`skills/_shared/<topic>.md`, referenced from each target skill) rather than
duplicating the same content into multiple skills — this is the established
pattern (see `skills/_shared/sector-valuation-kpis.md`,
`skills/_shared/sector-playbooks/`).

## Phase 5 — Apply the edits (this is Analysis, done by you, not scripted)

Using the Phase 3 digest, edit the target skill file(s) directly:

- New durable, reusable framework content → a `references/*.md` file (or a new
  `skills/_shared/*.md` if genuinely shared across skills — check first whether an
  existing shared file should be extended instead of a new one created, per
  conventions.md rule 17's "never think or write the same thing twice").
- Changes to *when/how* a skill uses that framework → the skill's own `SKILL.md`
  (phase instructions, DTO fields, render instructions) — this is what makes the
  learning actually load-bearing rather than a reference nobody reads.
- Any new deterministic threshold/pattern-matching logic the digest surfaces (like
  the J-Curve PAT-growth-threshold regex pass) → a script, not a prompt instruction,
  per the Extraction/Analysis split.
- Before writing, read the current state of every file you're about to touch — do
  not assume the digest is the only source of truth for what's already there; both
  prior integrations found and fixed small inconsistencies (a stray cross-reference,
  an outdated table) by re-reading the live file first.
- After editing, do a consistency read-through of anything you cross-referenced by
  section number/name (e.g. "see §5f") — a renumbered or renamed section is an easy
  self-inflicted bug, as happened once in the J-Curve integration and was caught
  only by a final full-file read.

## Phase 6 — Persist a run record (mandatory — see docs/DATA_RULES.md)

This skill's own output is a **non-company-scoped report DTO**: "concept X was
learned from lessons Y,Z and applied to skills A,B on date D". Per
`docs/DATA_RULES.md` §2 ("prefer an existing collection + new type"), this fits the
existing `reports.json` collection — do **not** create a new collection.

Call `db.saveReport(dto)` (`packages/jobs-runtime/lib/db.js`) with:

```js
{
  type: "concept-integration",
  creator: "concept-transcript-integrator",
  date: "<YYYY-MM-DD run date>",
  // no companyId/companyIds — this is not company-scoped, same precedent as
  // learnyst-lessons.json / ipos.json / supportive-investors.json.
  summary: "<one-line: concept, lesson count, target skills>",
  modelUsed: "<the model that ran Phase 3/5's reasoning>",
  concept: "<the concept string>",
  lessonsUsed: ["<learnyst-lessons id>", ...],   // from Phase 1/2's included[] list
  lessonsSkipped: [{id, reason}, ...],            // from Phase 2's skipped[] list
  targetSkillsUpdated: ["<skill-name>", ...],
  filesChanged: ["<repo-relative path>", ...],
  digestSummary: "<short recap of what the subagent's Phase 3 digest found>"
}
```

(`ensureEnvelope` fills `id`/`creationTime`/`modifiedTime` — a deterministic id from
`creator`+`date`+`type`, so re-running the same concept+date upserts rather than
duplicating.) This is a genuinely mixed record — `targetSkillsUpdated`/
`filesChanged` are scripted facts, `digestSummary` is LLM-authored — so `modelUsed`
is required per `skills/tooling/output-dto-standard/SKILL.md`.

End the run with `yarn data:push`, then report the **Files touched** manifest
(§7 of DATA_RULES): every repo file edited in Phase 5, plus the `reports.json`
record just written (with its id), read from `db.touchedFiles()` / the `data:push`
output — never reconstructed from memory.

## Pitfalls

- **Don't skip the human-confirmation step in Phase 4** even when the keyword
  overlap score looks obviously high — a wrong or incomplete target-skill list is
  far more expensive to unwind than one extra confirmation round-trip, especially
  once a shared reference file is wired into several skills.
- **Don't let the subagent's digest silently override existing skill content** —
  Phase 5 explicitly re-reads the live file first; a digest reflects only what the
  transcripts said, not what a skill may have already learned from a different
  source in the meantime.
- **Don't treat an empty search result as "concept doesn't exist"** — it may just
  mean the Learnyst cache is stale; offer the refresh path in Phase 1 before
  concluding there's nothing to learn.
- **Don't inline dozens of transcripts into your own context** — Phase 1's ~15-
  lesson soft cap and Phase 3's subagent dispatch exist specifically to keep this
  skill cheap to run; if a sweep keeps coming back oversized, that's a signal to
  ask the user to narrow the concept, not to push through anyway.

## Token-optimization note (every run — see conventions.md rule 11)

Phases 1, 2, and 4 are 100% scripted and cost no LLM tokens regardless of how many
lessons match — only Phase 3 (digestion) and Phase 5 (editing) spend tokens, and
Phase 3's cost scales with transcript volume, not with how many downstream skills
end up touched. If a concept is likely to recur (e.g. re-running this after every
new Learnyst module release), the highest-leverage next optimization is caching
Phase 3's digest per lesson-set (keyed by the sorted list of included lesson ids)
under `data/cache/concept-digests/` so a partially-overlapping later sweep reuses
already-digested lessons instead of re-digesting them — not yet implemented; add it
if this skill is run more than a couple of times against overlapping lesson sets.
