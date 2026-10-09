# Recall extraction contract (Phase 3 — cheap tier, NO judgment)

Run by a cheap-tier subagent (Haiku/Sonnet) per chunk. The job is **recall**: pull every
investing idea out of the chunk faithfully. Do not rank, adopt, criticise or synthesise —
that happens later with Darshan in the loop.

## Priority order (Darshan, 2026-10-08)

Chunks arrive in this order and the extraction effort follows it:

1. **Tier 1 — his own posts, threads, quotes and X articles** (`T1`): highest effort and recall. Long-form
   reasoning, frameworks, process descriptions and sector/macro views live here.
2. **Tier 2 — his replies** (`T2`): extract when the reply states a rule, threshold, view or process
   (the Q line is framing only). Skip pure acknowledgements.
3. **Tier 3 — reposts** (`T3`, header line `REPOSTED from @x — these are THEIR words`): lowest effort.
   Extract only a concrete data point, sector/macro view or pick-with-reason worth knowing, and only
   `macro_view` / `sector_view` / `heuristic` / `pick` kinds. State it as the _author's_ claim, never as his
   rule. The script marks such units `explicitness: curated` automatically (amplification ≠ endorsement
   of every word) — don't use them to infer his own rules.

## Input

A chunk file `data/runs/learn-and-automate/<slug>/chunks/cNNNN.txt`. Each doc:

```
<<D <docId> | <date> | <kind> | T<tier> | likes N | <url>>>
Q (@follower): <follower question>        ← context only, NOT the expert's words
A: <expert's reply>                       ← the expert's words
[CHART] <description of an attached chart> (only after the vision pass)
```

(Posts without a Q line: the whole text is the expert's words.)

## Output

Write JSONL to the `out` path `next-chunks` gave you (`units-raw/cNNNN.jsonl`), one unit per line:

```json
{
  "kind": "rule",
  "topic": "liquidity-float",
  "statement": "Avoid low-float companies you cannot verify with a plant visit",
  "verbatim": "Unless I make plant visits i would stay away with that float",
  "docIds": ["<docId the verbatim comes from>", "<other docIds saying the same, optional>"],
  "conditions": "small/low-float names with no concalls or PPTs",
  "explicitness": "explicit",
  "fromMedia": false
}
```

## Hard rules (a script rejects violations — `lna verify`)

1. `verbatim` is copied **exactly** from the expert's own text in the FIRST docId (A: line or post text) —
   never from the Q line. Keep it short (the key clause). Typos stay as written.
2. `kind` ∈ rule · checklist_item · do · dont · framework · heuristic · entry_signal · exit_signal ·
   sizing · sector_view · macro_view · pick · anti_pattern · mindset · process.
3. `topic` ∈ keys of `topic_taxonomy.json`; sector views use `sector:<name>` (e.g. `sector:power`).
4. One idea per unit. Generalise the `statement` into an imperative or declarative rule a reader
   can apply without the tweet ("Exit when earnings visibility breaks").
5. `pick` only when a named stock comes WITH a reason (the reason is the learning). Bare tickers,
   jokes, greetings, politics, film/personal posts → skip.
6. A one-line answer is a unit when the Q makes it a rule (Q: "how do you treat stocks with no
   concalls?" A: "stay away with that float" → rule). Put the Q's framing into `conditions`.
7. `[CHART]` content: set `fromMedia: true`, `explicitness: "inferred"`, verbatim from the [CHART] text.
8. Sarcasm / unclear → skip rather than guess. Missing one weak unit is cheaper than a wrong one.
9. Set nothing else (ids, dates, citations are added by the script).

Expected yield: ~1 unit per 4-8 docs. A chunk with zero investing content → write an empty file
(so the chunk is marked done).
