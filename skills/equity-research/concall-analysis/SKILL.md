---
name: concall-analysis
description: Institutional-grade earnings concall transcript analysis for Indian listed companies — supports four modes (12-section deep dive, 9-section brief, multi-quarter comparison, multi-peer comparison). Use this skill whenever the user uploads a concall transcript and asks for analysis, says "analyse this concall", "concall deep dive", "what did management say in Q3", "compare last 4 concalls", "peer concall comparison", "is management's tone shifting", or provides a Stockscans ticker and asks for the latest quarterly commentary. Auto-fetches transcripts from Stockscans when given only a ticker. Outputs a multi-page institutional PDF with management tone analysis, guidance extraction, analyst-question dodging detection, contradiction-finding, and a quantitative-data summary table.
---

# Concall Analysis

> "The most underrated skill in investing: listening to what management DOESN'T say." — _AI for the Intelligent Investor_, Day 2, p.5

This skill supports four analysis modes. Pick the one that matches the user's intent:

| Mode              | Trigger                                                          | Inputs                                   | Output                            |
| ----------------- | ---------------------------------------------------------------- | ---------------------------------------- | --------------------------------- |
| **deep**          | "deep dive on Q3 concall", "full concall analysis"               | 1 transcript                             | 12-section PDF                    |
| **brief**         | "concall brief", "give me the highlights", "fast read"           | 1 transcript                             | 9-section PDF (lighter)           |
| **multi-quarter** | "compare last 4 concalls", "track the narrative across quarters" | 4–8 transcripts (same company)           | comparison PDF + tone-shift table |
| **multi-peer**    | "compare what XYZ vs ABC vs DEF said this quarter"               | 1 transcript per company × 3–6 companies | peer comparison PDF               |

When in doubt, default to **brief**. It's the right answer for 70% of requests and is cheap to upgrade to deep if needed.

## Conventions

Follow [`_shared/conventions.md`](../_shared/conventions.md). Particularly: anti-hallucination protocol §3 (anchor strictly to the transcript; quote verbatim where management language matters), citation format §2.

## When to use

- User uploads a `.pdf`/`.txt` concall transcript and asks for analysis
- User provides a ticker and asks for "latest concall analysis" → resolve the most recent transcript via `stock-api/bin/get-concall-transcript-url.js` (see Phase 1 below)
- User says "what did management say about [topic]" — pull the relevant transcript sections only
- Other skills delegate here:
  - `equity-research-deepdive` §7 (Analyst Q&A) and §8 (Management Commentary)
  - `equity-research-master` Tab 11 (Concall) consumes the schema this skill produces
  - `consecutive-filings-diff` Phase 2 (Concall Reconciliation) uses the deep mode against the latest transcript
  - `management-credibility-tracker` consumes the multi-quarter mode's guidance extraction

## Workflow — 3 phases (per mode)

### Phase 1 — Document acquisition

If the user provides only a ticker, auto-fetch. **Deep/brief mode (N=1, the
single latest transcript) resolves the official Transcript URL directly** —
Stockscans guarantees a Transcript document for every reported quarter now:

```bash
TICKER="NSE:SWARAJENG"            # replace
yarn workspace @stock/api get-concall-transcript-url --company "$TICKER"
```

Handle its output:

- On success (`ssUrl`/`documentUrl` present) → download/read the document at
  `documentUrl` (`stock-documents-fetcher` / `fetch_documents.py -t
  Transcript --last-n 1`, or fetch `documentUrl` directly).
- On `error` → that quarter's results likely aren't out yet, or the
  transcript genuinely isn't filed (rare) — tell the user no transcript is
  available yet.

For **multi-quarter** (N=4-8, historical) and **multi-peer** modes, check the DB
first — most historical transcripts will already be cached from prior runs:

```bash
SAFE=$(echo "$TICKER" | tr ':' '_')
DOCS_DIR="/tmp/${SAFE}_concall_docs"
N=4  # 4-8 for multi-quarter; 1 per peer for multi-peer

# Step 1: list available official transcripts — manifest only, no downloads yet
python3 stock-api/python/fetchers/fetch_documents.py "$TICKER" \
    -t Transcript --last-n $N --list-only -o "$DOCS_DIR"

# Step 2: bulk DB check for all quarters in the manifest
BULK=$(python3 -c "
import json, sys
docs = json.load(open('$DOCS_DIR/manifest.json'))
print(json.dumps([{'ticker': '$TICKER', 'quarter': d['date']} for d in docs]))
")
yarn workspace @stock/api get-latest-concall-transcript --bulk "$BULK"
# Returns: [{status:"db-hit"|"official-transcript-exists"|..., ticker, quarter, id?}]

# Step 3: for "db-hit"/"saved" entries — read fullText from data/reports/<id>.json (no PDF download)

# Step 4: for "official-transcript-exists" entries — download ONLY those PDFs
python3 stock-api/python/fetchers/fetch_documents.py "$TICKER" \
    -t Transcript -o "$DOCS_DIR" --start-date "$YYYYMM" --end-date "$YYYYMM"
# After reading each downloaded PDF, save its text to DB (see below) so future runs skip the download
```

**Save after read (mandatory for every downloaded PDF transcript):** After reading
any official transcript PDF that was NOT already in the DB, persist its text:

```bash
cat > /tmp/${SAFE}_${YYYYMM}_transcript.txt << 'EOF'
<full verbatim transcript text>
EOF
yarn workspace @stock/api save-concall-transcript "$TICKER" "$YYYYMM" \
    /tmp/${SAFE}_${YYYYMM}_transcript.txt \
    --fiscal-year "$FY" --fiscal-period "$QN"
```

Use `$DOCS_DIR/manifest.json`'s `date` field to identify Q1/Q2/Q3/Q4 ordering
— newest first. If the most recent quarter is missing from the manifest,
resolve it via `stock-api/bin/get-concall-transcript-url.js` (as above) and
merge it into the set rather than silently analyzing N-1 quarters.

### Phase 2 — Mode-specific analysis

Pick the framework reference for your mode:

- **deep** → [`references/deep_12section.md`](references/deep_12section.md)
- **brief** → [`references/brief_9section.md`](references/brief_9section.md)
- **multi-quarter** → [`references/multi_quarter.md`](references/multi_quarter.md)
- **multi-peer** → [`references/multi_peer.md`](references/multi_peer.md)

All four frameworks share three core extraction tasks — extract these from every transcript regardless of mode:

1. **Guidance & quantitative data** — every number management states (revenue growth, margin, capex, capacity, order book). Format as a table with **Source-quote column** so the analyst can verify.
2. **Tone & confidence language** — count of HIGH-commitment phrases ("we will", "target is", "guidance is") vs MEDIUM ("we expect", "likely to") vs LOW ("may", "endeavor to", "aspire to"). The mix predicts credibility.
3. **Dodged or evaded questions** — analyst questions that received vague or non-answers. Quote the question verbatim AND the management response so the reader can judge.
4. **Income Statement Signal Scan (mandatory).** When margin/PAT performance is discussed, run `skills/_shared/income-statement-signals.md` against QoQ and YoY baselines rather than checking inventory gains in isolation — it also covers Other Income composition, RM-cost moves, employee-cost leverage, D&A/interest step-ups, exceptional items, tax-rate swings, and EPS dilution, plus the combination reads (e.g. Other Income up + operating profit flat = non-operating beat). Quantify the estimated PAT/EBITDA contribution of whatever clears the materiality bar and state plainly whether the quarter's result is driven by that effect (non-recurring) or structural/operating (sustainable) — see §2/§8/§9 of the deep/brief frameworks for exactly where this lands in each mode's output. **Sourcing rule:** pull every P&L line from the quarter's Result filing via `stock-documents-fetcher` (`documentsFetcher.js`/`StockscansClient.documents()`) — do not infer these from web search or news writeups, which rarely disclose the line-item figures. Transcripts must always come from `concall-transcript-extractor`, per this skill's existing rule; the same "repo API, not internet" rule applies to the financial-statement figures needed for this scan. Report only what clears the shared scan's materiality bar.

### Phase 3 — PDF generation

Write the following JSON to a temporary file (e.g. `data.json`). This `data.json` is the canonical DTO — render-pdf's PDF output is a reproducible rendering of it, not a separate source of truth, so the four envelope fields below must be present at the top level alongside the domain fields:

```json
data = {
    "companyId": ticker,                      # e.g. "NSE:SWARAJENG" — same value as $TICKER above
    "creationTime": "2026-07-07T10:00:00+05:30",   # ISO 8601, set on first write
    "modifiedTime": "2026-07-07T10:00:00+05:30",   # equals creationTime on first write
    "creator": "concall-analysis",
    "model_used": "claude-sonnet-5",  # required per output-dto-standard/SKILL.md — tone
                                        # analysis, dodge detection, contradiction-finding
                                        # are all LLM judgment
    "mode": "deep" | "brief" | "multi-quarter" | "multi-peer",
    "company_name": "...",
    "ticker": "NSE: ...",
    "quarter": "Q3 FY26",                    # for deep/brief
    "quarters": ["Q4 FY25", "Q1 FY26", ...], # for multi-quarter
    "peers": [{"name": "...", "ticker": "..."}
```

Then execute the two-step HTML-to-PDF pipeline:

```bash
# 1. Generate HTML (Bundle Mode)
bash ./skills/_shared/resolve.sh $(basename $(dirname skills/concall-analysis/SKILL.md)) --input data.json --output report.html

# 2. Render PDF (Clone Mode)
mkdir -p data/concall-analysis
bash ./skills/_shared/resolve.sh render-pdf --html report.html --pdf "data/concall-analysis/<Company>_Output.pdf"
```

See [`stock-api/src/generators/generateConcallPdf.js`](stock-api/src/generators/generateConcallPdf.js) for the full schema per mode.

## Critical extraction rules

1. **Quote verbatim** for: guidance numbers, tone-shift evidence, dodged questions, key red-flag statements. The exact words matter.
2. **Distinguish** between what management said and what the analyst _interpreted_ it as — these go in separate sections.
3. **Track non-answers.** If a question is asked and management responds with anything other than a number — note it. "We'll get back to you" + "we don't disclose that" + "as we said earlier" repeated 3+ times is a signal.
4. **Don't editorialise.** "Management seemed nervous" without quotation evidence is hallucinated.
5. **Cross-check numbers** stated in the call against the investor presentation released the same day. Mismatches happen and are signals.

## Mode pairing patterns (when called from other skills)

When `equity-research-deepdive` calls this skill, it requests **deep** mode for §7 + §8.

When `management-credibility-tracker` calls this skill, it requests **multi-quarter** mode and consumes only the `guidance_table` field (not the full PDF).

When `consecutive-filings-diff` calls this skill, it requests **deep** mode but feeds the output dict back into its own Phase-2 reconciliation rather than rendering a separate PDF.

## Output file naming

| Mode          | Filename pattern                                   |
| ------------- | -------------------------------------------------- |
| deep          | `<Company>_Concall_<Quarter>_Deep.pdf`             |
| brief         | `<Company>_Concall_<Quarter>_Brief.pdf`            |
| multi-quarter | `<Company>_Concall_MultiQ_<earliest>-<latest>.pdf` |
| multi-peer    | `<Sector>_Concall_PeerCompare_<Quarter>.pdf`       |

## Pitfalls

- **Tone analysis is qualitative.** Don't put "Bullish 85% confidence" labels — use Bullish / Neutral / Cautious / Defensive.
- **Q&A section is the goldmine.** If you only had time to read one part of a 40-page transcript, read the analyst Q&A. That's where the unscripted information lives.
- **Compare to prior quarter wherever possible.** A "we expect 15% growth" carries different meaning depending on whether last quarter said 10%, 15%, or 18%.
- **Beware the "no surprises" call** — if a 50-page transcript has no dodged questions, no tone shift, and identical guidance: either the business genuinely has no story, or you're reading too superficially.
