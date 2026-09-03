---
name: ask-soic
description: Answer a free-text investing/framework question by searching SOIC's own teaching corpus — Learnyst membership course transcripts and SOIC YouTube channel transcripts — and synthesizing a direct answer with citations back to the specific course/lesson/video (and timestamp). Use whenever the user asks "what does SOIC say about X", "how does SOIC think about Y", "ask SOIC about Z", "did SOIC ever teach/cover X", "find the lesson where SOIC explains X", or asks an investing/framework question and wants it answered the SOIC way rather than from general knowledge. NOT for company-specific research (that's the equity-research skills) and NOT for durably changing another skill's instructions based on lesson content (that's concept-transcript-integrator) — ask-soic is a one-off lookup-and-answer tool.
---

# Ask SOIC

Answers a free-text question by searching the ~1,100-transcript SOIC teaching corpus
already cached in this repo — 545+ Learnyst membership course-video transcripts
(`data/learnyst-lessons.json` + `data/learnyst-lessons/<id>.json`) and 573+ SOIC
YouTube channel video transcripts (`data/youtube-transcripts.json` +
`data/youtube-transcripts/<id>.json`) — and synthesizing a direct answer grounded in
what SOIC has actually taught, with a citation (course/lesson or channel/video, plus
timestamp) for every claim.

This is a **lookup-and-answer** tool, not a framework-integration tool: it answers
"what does SOIC teach about X" for the person asking right now. If the user's actual
intent is to durably wire a concept into how another skill works (e.g. "update our
valuation skill with what SOIC teaches about X"), use `concept-transcript-integrator`
instead — don't do that heavier workflow here.

## Division of labour (logic vs reasoning, per conventions.md rule 17)

- **Logic → script (deterministic):** finding which of the ~1,100 transcripts are
  relevant to the query, and pulling the single best-matching excerpt out of each, is
  pure lexical scoring — no judgment involved. This is `scripts/search_soic.py`.
- **Reasoning → you:** reading the returned excerpts, deciding what they actually
  say, resolving disagreement or nuance across multiple lessons, and writing the
  synthesized answer is the only part that should spend LLM tokens on this task.

Never grep or read raw transcript files yourself to answer a query — always go
through the script. Reading transcript bodies directly defeats the point of the
cached index (rebuilding it in your head, token by token, on every query) and will
miss the excerpt/timestamp/citation bookkeeping the script already does correctly.

## Steps

### 1. Resolve the local repo

Locate the local `stockmarket` checkout (same local-first resolution as every other
skill's router — check the currently connected/selected workspace folder for a
top-level `skills/`, `stock-api/`, `packages/` layout). This skill needs the local
`data/` directory to exist with a populated corpus; it does not have a GitHub-raw
fallback, because `data/` is gitignored (conventions.md rule 7) and isn't on GitHub.
If no local checkout with `data/learnyst-lessons.json` and
`data/youtube-transcripts.json` is available, tell the user this skill needs the
local repo's `data/` folder and stop.

### 2. Run the search script

```
python3 skills/tooling/ask-soic/scripts/search_soic.py \
  --query "<the user's question, verbatim or lightly cleaned up>" \
  --data-root data --top 8
```

- Use the user's question close to verbatim as `--query` — the script does its own
  stopword removal and TF-IDF-style scoring, so extra phrasing doesn't hurt, but
  stripping it down to two or three keywords loses the context that helps distinguish
  e.g. "moats in cyclical businesses" from "moats" alone.
- The first call after a corpus refresh (or ever) rebuilds and caches the index
  (~5s over the full corpus); every call after that against an unchanged corpus is a
  cache hit (under a second). You don't need to think about this — the script handles
  it via `data/cache/ask-soic/index.json`, invalidated automatically whenever
  `learning-resources-refresh` adds/updates transcripts. Only pass `--reindex` if you
  have a specific reason to believe the cache is stale despite the fingerprint check
  (e.g. you just know a refresh ran seconds ago and want to force a rebuild rather
  than trust the automatic invalidation).
- If the query is broad or the topic could reasonably be phrased multiple ways
  (e.g. "PE ratio" vs "valuation multiple" vs "price to earnings"), it's fine to run
  the script 2-3 times with different phrasings and merge/dedupe the results by `id`
  before moving to synthesis — this is still Extraction, still cheap, and meaningfully
  improves recall against a pure lexical matcher (no semantic understanding of
  synonyms).

### 3. Handle no matches or a thin corpus

- `"results": []` — tell the user directly that nothing in the current SOIC corpus
  matches, rather than guessing from general knowledge and passing it off as "what
  SOIC teaches." Offer to broaden/rephrase the query once before concluding there's
  truly nothing on the topic.
- If results come back but all scores are low/marginal (use judgment — a handful of
  weak partial matches vs one or two strong ones), say so explicitly in the answer
  ("SOIC doesn't have a dedicated lesson on this; the closest related material is...")
  rather than presenting a thin match as a confident, well-covered answer.
- If the corpus looks like it might be stale for the topic (e.g. the user references
  a recent SOIC video/lesson by name that isn't showing up at all), suggest running
  `yarn learning-resources-refresh` (wraps both `learnyst-transcript-refresh` and
  `youtube-transcript-refresh`) rather than silently working around a gap.

### 4. Synthesize the answer (this is the actual analysis step)

Read the excerpts the script returned — not the full transcripts, the excerpts are
the point — and write a direct answer to the user's question:

- Lead with the answer itself, in your own words, grounded in what the excerpts
  actually say. Don't just concatenate/summarize the excerpts in result order; digest
  across them the way an analyst would, especially when two results are the same
  underlying content re-surfaced from both Learnyst and YouTube (this happens often —
  SOIC posts a lot of its course content to YouTube too) or when different lessons
  give complementary or genuinely conflicting takes on the same question.
- **Cite every substantive claim** with the `citation` field the script returned
  (e.g. "SOIC Learnyst · Level 2-Intensive Course... · Understanding ROE vs ROCE vs
  ROIC" or "SOIC YouTube · SOIC · Peter Lynch's 10 Bagger Framework..."), and include
  the `timestamp` inline (e.g. "around 49:49") so the user can jump to the exact
  moment if they open the source themselves. For a YouTube result, the script already
  built a `url` with a `&t=` deep link when a timestamp exists — surface that link.
- If the question spans multiple sub-topics (e.g. "how does SOIC screen for
  multibaggers AND how do they think about entry timing"), it's fine to structure the
  answer with those as natural sub-sections — but don't force headers/bullets on a
  simple direct-answer question; plain prose with inline citations reads better for
  most of these.
- Stay inside what the transcripts actually say. If the user's question drifts into
  something SOIC's material doesn't clearly address, say so rather than filling the
  gap with general investing knowledge presented as if it came from SOIC.
- This skill answers "what does SOIC teach", not "should I buy/sell this stock" —
  if the user's real question is company-specific investment advice, answer the SOIC
  framework part from the corpus, and point them to the relevant equity-research skill
  (e.g. `investment-thesis-engine`, `stock-report`) for the company-specific call.

### 5. Token-optimization note (conventions.md rule 11, always-on)

End with a short, evidence-based note on what could be cheaper next time — this is
naturally trivial for this skill once the index is warm (a cache hit is already
near-free), so the useful thing to flag instead is usually about the corpus itself:
e.g. how many of the transcripts you actually needed the LLM to read excerpts from
(vs how many results came back) or whether a topic the user keeps asking about would
be worth a permanent home instead of a fresh search every time (that's the signal to
suggest `concept-transcript-integrator` if the same question is recurring).

## Scope notes for v1

- **Transcripts only.** The 171 Learnyst lessons that have PDF/worksheet attachments
  are not searched or read by this skill yet — if an answer seems like it would live
  in an attachment rather than the spoken transcript, say so rather than claiming
  the corpus has nothing on the topic. Extending to attachment text is a natural v2
  if transcript-only search proves insufficient on real queries (would need a PDF
  text-extraction pass added to the script, following the `pdf` skill's approach).
- **Lexical (TF-IDF), not semantic.** The search script matches on actual words used,
  not meaning — a query using very different vocabulary from how SOIC phrases the
  concept in the transcript can miss even when the topic is covered (this is why step
  2 suggests trying 2-3 phrasings for broad/ambiguous queries). If this becomes a
  recurring problem, an embeddings-based upgrade is the natural next step, but adds a
  new dependency and ongoing embedding-API cost that wasn't justified for v1.
- **Read-only.** This skill doesn't write any DTO/report/insight to the DB — it only
  writes its own derived search-index cache to `data/cache/ask-soic/index.json`
  (conventions.md rule 6, a re-derivable cache, not source data). No `data:push` step
  is required here specifically; the cache will sync whenever any other job's routine
  push runs, and losing it just costs one ~5s reindex on the next `ask-soic` call.
