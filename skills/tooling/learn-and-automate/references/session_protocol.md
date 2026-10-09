# Module session protocol (interactive — one module per session)

A session teaches ONE curriculum module (`lna modules` lists them, biggest first) and ends with
Darshan's stances recorded and the module's question frontier empty. Target: 20-30 minutes of his time.

## 0. Open

`lna session-start --source <key> --module <m>` → payload with `questionsFirst` (raw tweets),
`topUnits`, `followerQA`, `learnerBlindSpots`. Also run `lna questions --module <m>` now (it is
deterministic) and start walking the answer ladder for non-decision questions in the background.

## 1. Questions first (generation effect) — before ANY teaching

Show the 3-5 `questionsFirst` tweets verbatim (date + link). Ask Darshan:

> "Before I explain anything: what questions would you ask about these? Write as many as you can."
> Save his questions one per line to `data/runs/learn-and-automate/<slug>/darshan-questions-<module>.txt`,
> then `lna lens-score --module <m> --file <that file>` → covered / missed lenses. Persist the profile
> patch it prints. Show him, briefly: which lenses he used, which he missed, and one example question
> per missed lens (from the engine's set). Lean on his `learnerBlindSpots` in later steps.

## 2. Teach-back brief (≤ 5-minute read)

5-8 rules max, most-cited and newest first. For each:

- the rule in one line · 1-2 verbatim tweets with date + link · when it applies / when it doesn't
  (from L5 answers) · how it can lose money (L7) · newer vs older view if they conflict (L6).
- If a follower asked about it, show "Follower asked … → he answered …" (the expert's own Q&A).
  Mark inferred items `(inferred)`. Never present a tweet as a recommendation.

## 3. Quiz (retrieval practice)

5 questions with the quiz widget (`mcp__widgets__quiz_display_v0`) built from real scenarios in his
tweets ("Stock X: low float, no concalls, strong chart — what does he do?"). Include 1-2 items from
earlier modules (spacing/interleaving) once ≥2 modules are done.

## 4. Grilling rounds — the frontier

`lna frontier --module <m>` → ask only the current frontier, numbered, each with a recommended answer:

```
❓ Q1 — <title> [L11 Personal fit]: <question>
➡️ Recommended: <answer + one-line why>
```

Use AskUserQuestion for crisp multiple-choice decisions (≤4 per call); plain grilling format otherwise.
Record answers with `status: user-decided, decidedBy: darshan` via `questions-apply`; recompute the
frontier; repeat until empty. Doubts the skill MUST raise rather than guess: missing thresholds,
regime dependence, old-vs-new contradictions, sarcasm/ambiguity, one-off comment vs rule, conflict
with SOIC/Anil Lamba.

## 5. Stances

For every rule-kind unit shown: adopt / adapt (with his edit → `userNote`) / reject / unsure.
Write `{id, type: "kb-unit", sourceKey, userStance, userNote}` lines and persist with `--patch`.
If a newer unit supersedes an older one, patch the older one `{status: "superseded", supersededBy}`.

## 6. Close

`lna session-end --module <m>` (stores question metrics), persist answered questions
(`questions-apply` prints the persist command), `lna render`, then report:
questions generated · % auto-answered with citation · decided by Darshan · parked · his lens coverage
· rules adopted/adapted/rejected · candidate frameworks spotted (→ Phase 7).

## Unattended / Darshan away

Never block. Do steps 0, ladder answers and the teach-back draft; write the frontier into the
session report and stop before stances. Module status stays `in-progress`.
