# Model Cost Orchestration — Claude vs Gemini (and Claude vs plain scripts)

Purpose: cut Claude/Cursor token spend by routing deterministic and extraction-heavy
work to Gemini (unlimited quota) or to plain Node scripts, and reserving Claude for
synthesis, judgment, and anything where a confidently-wrong answer is costly.

Author aid, not investment advice. Written 2026-07-17.

---

## 0. Key facts this plan rests on (verified)

- **Gemini is already integrated.** `screener-api/src/core/api/geminiClient.js` calls
  `gemini-2.5-flash` with SHA-256 prompt-hash caching (`ModelResponse` cache) and already
  parses PDFs (earnings-call transcripts via `geminiApi.js`, order PDFs via
  `orderParser.js`/`orderbookBaselineParser.js`). `GEMINI_API_KEY` is in `.env`. So the
  Gemini pipe is not greenfield — extend it, don't build it.
- **Gemini 2.5 Flash capability fit:** 1,048,576-token (~1M) context; Google positions it
  for "long-context summaries, multimodal understanding, light reasoning, structured
  extraction, high-volume text workflows." PDFs are read natively (1 page ≈ 1 image).
  Flash-Lite is cheaper still and has a Batch API. (Sources at bottom.)
- **The system is already script-first.** The canonical pattern is
  `scanner (Node, deterministic) → classifier (Node, deterministic) → LLM compose/synthesis
  → data.js push to Drive`. The JSON DTO written to `data/runs/…` is the handoff bus.
  Cost optimization = pushing more of the "LLM compose/synthesis" box down into Gemini or
  scripts, and shrinking what's left for Claude.

## 1. The routing rule — a strict decision tree (Darshan's principle)

The governing insight: **if a script can *validate* an output deterministically, a script
can *generate* it too — so it must be a script, not Gemini.** Verification is not where you
place a task; it's a consequence of where the task genuinely belongs. This collapses the
routing to an ordered tree — take the first branch that applies:

1. **Can a script produce it deterministically?** (a number, sort, diff, table, reformat,
   threshold check, classification with fixed rules, email render from a DTO.)
   → **Script. No LLM at all.** Do not route these to Gemini "to be safe" — if you'd verify
   it with a script, you'd have written the script anyway.

2. **Does it need genuine language understanding of unstructured input** (read a PDF, mine a
   chat, parse a tweet) **that no script can do — AND is fabrication cost low AND is Gemini's
   inherent error rate low** (verbatim extraction, restatement, rule-based tagging)?
   → **Gemini.** Design the task so it needs **minimal Claude verification** by construction:
   verbatim-only, rigid schema, `null` for missing, source anchors (see §5). Claude spot-checks
   lightly; script-verify only in the rare case a cheap deterministic check exists (e.g. a
   percentage must be 0–100) — but if a *full* script check exists, you're in branch 1, not here.

3. **Everything else** — synthesis, judgment, "new vs known", anything that becomes a stored
   thesis / investment signal / applied proposal (high fabrication cost, the credibility axis).
   → **Claude.**

Consequence for verification: **mostly Claude verifies Gemini, rarely a script does.** A task
that a script could fully verify never should have gone to Gemini — it belongs in branch 1.
So the aim when handing Gemini a job is to pick jobs so clean (verbatim, schema-bound) that
Claude's verification is a light glance, not a re-derivation.

Corollary: several of your jobs currently spend a whole Claude session to run one Node
script and echo its output — pure branch 1 leakage. Fix those first (§2 Tier A).

## 2. Three tiers of cost win (ordered by effort/reward)

### Tier A — Delete the LLM entirely (free wins, do first)
These jobs already say "your only job is to orchestrate the script; do NOT run any logic":

| Job | Today | Change |
|---|---|---|
| `daily-deals-digest` | Claude session runs `dealsDigest.js`, echoes JSON | Run `dealsDigest.js` on a plain node cron. No model. |
| `near-highs-digest` | Claude session runs `nearHighsDigest.js` | Plain node cron. No model. |
| `watchlist-sync` | Fetch + diff + email, no judgment | Plain node cron. No model. |

The script already builds and sends the email. The model adds only a status echo you can
get from the script's own exit code + a log line. **Route: none (cron the script).**

### Tier B — Shared deterministic email renderer (recurring win)
Five jobs each end with "compose a Gmail-safe inline-CSS dark-theme HTML email from the
insights JSON." That is templating, not judgment — the DTO already carries every fact
(`evidence[]`, conviction, counts). Build one `packages/jobs-runtime/lib/renderDigestEmail.js`
that takes a DTO + a section spec and returns HTML. Then:

- gainers, tweet-signals, watchlist-insights, deals, near-highs all render via the same
  function — **no model composes email**.
- The only genuinely-synthetic sentence is the header "dominant theme" line. Two options:
  (a) drop it, or (b) let **Gemini** write just that one sentence from the counts. Not Claude.

This removes the single most frequent Claude token sink in the daily jobs.

### Tier C — Split extraction (Gemini) from synthesis (Claude)
For the analytical work, insert a Gemini extraction stage that writes structured JSON, and
let Claude reason only over that JSON — never over raw PDFs. Details in §3–4.

## 3. Per-task routing table

Legend: **S** = plain script (no LLM) · **G** = Gemini · **C** = Claude · **G→C** = Gemini
extracts, Claude synthesizes.

### Scheduled — daily
| Job | Sub-step | Route | Why |
|---|---|---|---|
| deals-digest | everything | **S** | pure fetch/sort/email |
| near-highs-digest | everything | **S** | pure fetch/count/email |
| watchlist-sync | everything | **S** | fetch/diff/email |
| gainers-signal | scanner, classifier, novelty | **S** | already deterministic Node |
| gainers-signal | email compose | **G/S** | render from DTO (Tier B) |
| gainers-signal | top-3 briefing ("known vs new", catalyst tie-in) | **C** | synthesis + fabrication risk |
| tweet-signals | Chrome capture, master sync, classifier | **S** | browser + deterministic Node |
| tweet-signals | email compose | **G/S** | render from `companies[]` DTO |
| watchlist-insights | fetch announcements, routine filter | **S** | already Node |
| watchlist-insights | read each PDF → extract quantified facts per category template | **G** | high-volume structured extraction; Gemini reads PDF natively |
| watchlist-insights | significance / actionability of *material* items only | **G→C** | Gemini drafts, Claude judges the few that matter |
| thesis-delta-scan | detect 24h material events per ticker (fetch/filter/>5% move) | **S/G** | deterministic + extraction |
| thesis-delta-scan | re-score pillars, signal change, monitorables | **C** | investment judgment, credibility |

### Scheduled — weekly
| Job | Sub-step | Route | Why |
|---|---|---|---|
| insight-validation | D+2 return / delivery% validation | **S** | deterministic math (already scripted) |
| insight-validation | prompt-refinement proposals | **C** (light) | judgment, but small |
| conversation-enrichment | verbatim extraction of prompts/notes/facts | **G** | "extract ONLY what's written" + 6–10 convos/batch = ideal Gemini |
| conversation-enrichment | framework promotion / feedback routing / proposals | **C** | judgment about what's reusable |
| insight-review | delta, dedup clustering, hygiene | **S** | `reviewInsights.js` already |
| insight-review | synthesize proposals (6 targets) | **C** | governance-sensitive, creative |
| thesis-review | valuation re-anchor, staleness, monitorable checks | **S** | deterministic fetch + threshold math |
| thesis-review | signal synthesis + "what could be wrong" | **C** | judgment, credibility |
| weekly-conversation-capture | capture bodies + artifacts | **S/G** | IO + verbatim extraction |

### On-demand analytical skills
| Skill | Extraction phase (→ JSON) | Synthesis phase |
|---|---|---|
| concall-analysis | **G**: guidance quotes, segment numbers, capex, order book | **C**: 12-section read, verdict |
| quarterly-result-analysis | **G**: P&L/segment deltas from PDF | **C**: 3-basket interpretation |
| drhp-ipo-analysis | **G**: financials, objects, risk factors, shareholding | **C**: verdict, red flags |
| annual-report-analysis | **G**: statements, notes, RPTs | **C**: quality judgment |
| forensic-accounting | **G/S**: F-score, DuPont, RPT tables (compute) | **C**: fraud-pattern match, verdict |
| management-credibility-tracker | **G**: guided-vs-actual pairs across concalls | **C**: credibility read |
| financial-model | **S**: the math; **G**: extract driver inputs | **C**: assumptions, scenarios |
| equity-research-dashboard | **S/G**: HTML from xlsx + txt (templated) | — (mostly deterministic) |
| peer-comparison / market-share / sector-research | **G**: gather + tabulate per-company data | **C**: comparative synthesis |
| tweet-investor-playbook | **G**: cluster + tag tweet corpus | **C**: playbook synthesis |
| stock-documents-fetcher / announcement-keyword-explorer / gainers scanner | **S** | — pure IO |

**Rule of thumb across the analytical skills:** the long-PDF *reading* is where Claude tokens
bleed today. Move reading to Gemini (1M context, per-page PDF billing), hand Claude a tight
JSON of facts + quotes, and let Claude do only the part you actually pay it for — the read.

## 4. Orchestration & the Gemini↔Claude handoff

You do not need a message bus. The filesystem/Drive JSON you already use *is* the bus.

**Contract:** every Gemini stage writes `data/runs/<date>/<skill>_extract.json` with a fixed
schema (see §5 prompts). Every Claude stage reads that file and must not re-fetch or re-read
the PDF. This mirrors the existing scanner→classifier→composer contract, just with a new
`extract` stage in front of the Claude stage.

**Where Gemini runs:** add `packages/jobs-runtime/lib/gemini.js` — a thin wrapper over the
existing `geminiClient.js` (reuse its cache + prompt-hash) exposing `extract({pdfUrlOrText,
schema, prompt})`. Job scripts call it inline and write the `_extract.json`. No Claude
involved in extraction.

**Two-tier scheduling** (this is the "automate the transfer"):

1. **Extraction cron (no Claude):** a plain node scheduled task runs the scanner + Gemini
   extraction, lands `_extract.json` in `data/runs/…`, and `data.js push`es to Drive. Cheap,
   fast, unlimited-quota.
2. **Synthesis task (Claude), scheduled ~30–60 min later:** reads the `_extract.json`, does
   only the synthesis/verdict/proposal, writes its DTO, sends any email via the shared
   renderer. Short session, no PDF reading, no re-fetch.

Idempotency is already handled: deterministic ids + prompt-hash cache mean re-runs are
cache hits, not re-spends. Keep that — it's a cost feature.

**When NOT to split a job:** splitting adds a second scheduled session with fixed overhead.
Only split where extraction is the bulk of the tokens (long PDFs, many conversations/tweets).
For tiny jobs, either keep them whole on Claude or push the whole thing to a script — don't
introduce a two-hop for a job that reads one short JSON.

## 5. Improved Gemini prompts (tuned to Gemini's strengths/weaknesses)

Gemini 2.5 Flash is excellent at structured extraction but will happily hallucinate narrative
if you let it and is weaker than Claude at "should I trust this." So: **give it a rigid JSON
schema, forbid inference, force `null` for missing, demand source anchors, ban prose** — chosen
so the output needs only a light Claude glance, not a re-derivation.

Verification stance (per §1): don't bolt a *full* deterministic validator onto a Gemini
extract — if the output were fully script-checkable it should have been script-generated
(branch 1). Use only **cheap bound-checks** here (a percentage is 0–100, a date parses, a
required quote is non-empty); **Claude does the substantive verify** on the few material items.
The design goal is to hand Gemini tasks so verbatim and schema-bound that even that Claude
glance rarely finds anything.

### 5a. Announcement-PDF extraction (for watchlist-insights)
```
You are a data-extraction engine. Read the attached corporate-announcement PDF for an
Indian listed company. Return ONLY valid JSON matching this schema — no prose, no markdown:

{
  "company": string|null, "ticker": string|null,
  "category": "order_win|fundraise|shareholding_change|rating|kmp_change|capex|other",
  "facts": {
    "amount_inr_cr": number|null,        // absolute, in ₹ crore; null if not stated
    "counterparty": string|null,
    "shares_absolute": number|null, "pct_of_capital": number|null,
    "who": string|null, "buy_or_sell": "buy|sell|null",
    "price": number|null, "threshold_crossed": string|null,
    "effective_date": "YYYY-MM-DD|null"
  },
  "verbatim_quotes": [ {"text": string, "page": number} ],  // max 5, exact from body
  "missing": [ string ]   // schema fields you could NOT find in the document
}

Rules: extract ONLY what is literally written in the PDF body. Never infer, estimate, or
use outside knowledge. If a number is not in the document, use null and list the field in
"missing". Every fact must be supported by a verbatim quote. If the PDF is empty/scanned/
unreadable, return {"error":"unreadable"} and nothing else.
```
Then a deterministic check (script): if `pct_of_capital` present, sanity-bound 0–100; flag
if `amount_inr_cr` and quotes disagree. Only after that does Claude write the "significance."

### 5b. Concall / result extraction (for concall + quarterly skills)
```
Extract from the attached concall transcript / results PDF. Output ONLY this JSON:

{
  "period": "QxFYyy", "reported": {"revenue_cr":n|null,"ebitda_cr":n|null,
     "ebitda_margin_pct":n|null,"pat_cr":n|null,"yoy_rev_pct":n|null,"qoq_rev_pct":n|null},
  "segments": [ {"name":s,"revenue_cr":n|null,"growth_pct":n|null} ],
  "guidance": [ {"metric":s,"guided_value":s,"timeframe":s,"quote":s,"page":n} ],
  "order_book_cr": n|null, "capex_plan": s|null, "capacity": s|null,
  "management_quotes": [ {"topic":s,"text":s,"page":n} ],   // max 10, verbatim
  "missing": [ s ]
}

Extract only what is stated. No inference, no narrative, no valuation, no opinion.
null for anything absent. Every guidance/quote entry carries its exact page number.
Never compute P/E or valuation — leave that to the synthesis stage.
```
Claude then does the 12-section read / 3-basket interpretation over this JSON — never the PDF.

### 5c. Conversation verbatim extraction (for conversation-enrichment)
```
From the conversation text below, extract reusable knowledge. Output ONLY JSON:

{
  "prompts": [ {"text":verbatim_user_question, "intent":short, "linkedSkill":s|null} ],
  "company_notes": [ {"ticker":s|null, "text":verbatim_quantified_fact, "date":"YYYY-MM-DD|null"} ],
  "frameworks": [ {"title":s, "summary":s} ]   // only if a reusable method is described
}

Anti-hallucination is the ONLY priority. Copy facts VERBATIM from the text. Never infer a
ticker, figure, or claim not present. If a field isn't in the text, omit it. If the
conversation has no reusable signal, return {"prompts":[],"company_notes":[],"frameworks":[]}.
```
Claude reviews only `frameworks` + ticker-resolution ambiguities; the bulk (`prompts`,
`company_notes`) is written straight to the DB from Gemini's output.

**General Gemini prompt hygiene:** (1) schema first, prose banned; (2) `null`/`missing` for
absent data; (3) verbatim + page/source anchors; (4) forbid outside knowledge and any
valuation math; (5) one job = one schema (reuse the prompt hash → cache hits); (6) prefer
Flash-Lite + Batch API for the highest-volume passes (conversation backfill, tweet corpora).

## 6. Cost wins that stay inside Claude (prompt → script)

Independent of Gemini, these convert model tokens into deterministic code:

- **Path-resolution boilerplate.** Every skill re-derives paths with
  `find /sessions -path '*packages/jobs-runtime/…'`. Ship one `lib/paths.js` /
  `bin/resolve.sh` and have skills source it. Saves repeated in-context reasoning + the
  scattered-output bugs your own notes flag.
- **Email rendering** (Tier B) — the biggest one; deterministic templating masquerading as
  "compose by judgment."
- **Files-touched manifest** — already partly scripted (`db.touchedFiles()`); make it a
  single call the skill just prints, not a paragraph the model assembles.
- **Valuation re-anchor** in thesis-review — CMP/PE/MCap fetch + `CMP×shares≈MCap` sanity is
  pure arithmetic; script it, hand Claude the anchored numbers.
- **Novelty/dedup** — already deterministic in the gainers classifier; replicate that model
  wherever "is this new?" is currently asked of the model in prose.
- **DTO validation** — validate the envelope (`companyId`, `creationTime`, `creator`) in code,
  not by asking the model to check.

## 7. What could be wrong with this analysis (read before trusting it)

- **Scanned PDFs.** Your own memory notes OCR fails on scanned result PDFs (Screener
  fallback). Gemini vision helps but table-number extraction from scans is error-prone.
  Every Gemini-extracted number must pass a deterministic reconciliation (totals add up,
  `CMP×shares≈MCap`, 0≤pct≤100) before Claude treats it as fact. Don't remove the human/Claude
  check on the *few* material items.
- **Splitting has overhead.** Two scheduled sessions (extract-cron + Claude-synth) beat one
  only when extraction dominates tokens. For short jobs it's net-negative — the table in §3
  reflects that (small jobs stay whole or go fully-script).
- **"Unlimited Gemini" ≠ no limits.** Rate/quota and per-page PDF billing still apply. The
  existing prompt-hash cache is your main defense — reuse it; don't re-extract the same PDF.
- **Losing the thematic read.** Fully templated emails lose the one-line "dominant theme"
  synthesis. Acceptable, or delegate just that sentence to Gemini — but verify it doesn't
  overstate (it will, if unconstrained).
- **Credibility asymmetry is real and directional.** Route *toward* Claude on anything that
  becomes a stored thesis, an investment signal, or an applied proposal; route *toward*
  Gemini on extraction, formatting, and high-volume first passes. When unsure, the safe
  default is Gemini-extracts-Claude-verifies, not Gemini-decides.
- **This is a routing design, not a benchmark.** Before committing a skill to Gemini
  extraction, run 3–5 real PDFs through 5a/5b and diff Gemini's JSON against a Claude read;
  keep on Claude any extraction type where Gemini's error rate on numbers is material.

## 8. Suggested rollout order

1. Tier A: cron the three pure-script jobs (deals, near-highs, watchlist-sync). Zero risk.
2. Tier B: `renderDigestEmail.js`; retire email-compose-by-model in the 5 digest jobs.
3. `lib/gemini.js` wrapper + prompt 5a; pilot on watchlist-insights PDF extraction; validate.
4. Two-tier schedule for gainers (extract-cron → Claude top-3) and thesis-delta.
5. Prompt 5c + Flash-Lite Batch for the conversation-enrichment backlog.
6. Analytical skills (5b) — concall/quarterly first, measure number-accuracy, then expand.

---

### Sources
- Gemini 2.5 Flash capabilities/context: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/2-5-flash
- Gemini API pricing (Flash / Flash-Lite / Batch, PDF-as-image billing): https://ai.google.dev/gemini-api/docs/pricing
- Flash-Lite: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/2-5-flash-lite
- Repo (verified in place): `screener-api/src/core/api/geminiClient.js`, `geminiApi.js`, skill/job SKILL.md files under `skills/` and `jobs/Scheduled/`.
