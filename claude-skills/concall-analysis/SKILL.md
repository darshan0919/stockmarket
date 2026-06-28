---
name: concall-analysis
description: Institutional-grade earnings concall transcript analysis for Indian listed companies — supports four modes (12-section deep dive, 9-section brief, multi-quarter comparison, multi-peer comparison). Use this skill whenever the user uploads a concall transcript and asks for analysis, says "analyse this concall", "concall deep dive", "what did management say in Q3", "compare last 4 concalls", "peer concall comparison", "is management's tone shifting", or provides a Stockscans ticker and asks for the latest quarterly commentary. Auto-fetches transcripts from Stockscans when given only a ticker. Outputs a multi-page institutional PDF with management tone analysis, guidance extraction, analyst-question dodging detection, contradiction-finding, and a quantitative-data summary table.
---

# Concall Analysis

> "The most underrated skill in investing: listening to what management DOESN'T say." — *AI for the Intelligent Investor*, Day 2, p.5

This skill supports four analysis modes. Pick the one that matches the user's intent:

| Mode | Trigger | Inputs | Output |
|---|---|---|---|
| **deep** | "deep dive on Q3 concall", "full concall analysis" | 1 transcript | 12-section PDF |
| **brief** | "concall brief", "give me the highlights", "fast read" | 1 transcript | 9-section PDF (lighter) |
| **multi-quarter** | "compare last 4 concalls", "track the narrative across quarters" | 4–8 transcripts (same company) | comparison PDF + tone-shift table |
| **multi-peer** | "compare what XYZ vs ABC vs DEF said this quarter" | 1 transcript per company × 3–6 companies | peer comparison PDF |

When in doubt, default to **brief**. It's the right answer for 70% of requests and is cheap to upgrade to deep if needed.

## Conventions

Follow [`_shared/conventions.md`](../_shared/conventions.md). Particularly: anti-hallucination protocol §3 (anchor strictly to the transcript; quote verbatim where management language matters), citation format §2.

## When to use

- User uploads a `.pdf`/`.txt` concall transcript and asks for analysis
- User provides a ticker and asks for "latest concall analysis" → fetch the most recent Transcript via `stock-documents-fetcher`
- User says "what did management say about [topic]" — pull the relevant transcript sections only
- Other skills delegate here:
  - `equity-research-deepdive` §7 (Analyst Q&A) and §8 (Management Commentary)
  - `equity-research-master` Tab 11 (Concall) consumes the schema this skill produces
  - `consecutive-filings-diff` Phase 2 (Concall Reconciliation) uses the deep mode against the latest transcript
  - `management-credibility-tracker` consumes the multi-quarter mode's guidance extraction

## Workflow — 3 phases (per mode)

### Phase 1 — Document acquisition

If the user provides only a ticker, auto-fetch:

```bash
TICKER="NSE:SWARAJENG"            # replace
SAFE=$(echo "$TICKER" | tr ':' '_')
DOCS_DIR="/tmp/${SAFE}_concall_docs"

# Mode-dependent N
# deep / brief: N=1
# multi-quarter: N=4..8
# multi-peer: 1 per peer; iterate
N=1
python3 /tmp/fetch_documents.py "$TICKER" \
    -t Transcript --last-n $N -o "$DOCS_DIR"
```

Use `$DOCS_DIR/manifest.json`'s `date` field to identify Q1/Q2/Q3/Q4 ordering — newest first.

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

### Phase 3 — PDF generation

```python
import sys
sys.path.insert(0, '<skill_path>/scripts')
sys.path.insert(0, '<skill_path>/_shared')
from generate_concall_pdf import create_concall_pdf

data = {
    "mode": "deep" | "brief" | "multi-quarter" | "multi-peer",
    "company_name": "...",
    "ticker": "NSE: ...",
    "quarter": "Q3 FY26",                    # for deep/brief
    "quarters": ["Q4 FY25", "Q1 FY26", ...], # for multi-quarter
    "peers": [{"name": "...", "ticker": "..."}, ...],  # for multi-peer
    "executive_summary": "...",
    "tone_analysis": {
        "overall": "Bullish" | "Neutral" | "Cautious" | "Defensive",
        "high_commitment_count": int,
        "medium_count": int,
        "low_count": int,
        "shift_from_prior": "..." # only if multi-quarter
    },
    "sections": [...],   # mode-dependent
    "guidance_table": [...],
    "dodged_questions": [...],
    "key_quotes": [...],
    "analysts_on_call": [...],
    "output_path": "/mnt/project/packages/cowork-jobs/data/agent-outputs/<Company>_Concall_<Mode>.pdf",
}
create_concall_pdf(data)
```

See [`scripts/generate_concall_pdf.py`](scripts/generate_concall_pdf.py) for the full schema per mode.

## Critical extraction rules

1. **Quote verbatim** for: guidance numbers, tone-shift evidence, dodged questions, key red-flag statements. The exact words matter.
2. **Distinguish** between what management said and what the analyst *interpreted* it as — these go in separate sections.
3. **Track non-answers.** If a question is asked and management responds with anything other than a number — note it. "We'll get back to you" + "we don't disclose that" + "as we said earlier" repeated 3+ times is a signal.
4. **Don't editorialise.** "Management seemed nervous" without quotation evidence is hallucinated.
5. **Cross-check numbers** stated in the call against the investor presentation released the same day. Mismatches happen and are signals.

## Mode pairing patterns (when called from other skills)

When `equity-research-deepdive` calls this skill, it requests **deep** mode for §7 + §8.

When `management-credibility-tracker` calls this skill, it requests **multi-quarter** mode and consumes only the `guidance_table` field (not the full PDF).

When `consecutive-filings-diff` calls this skill, it requests **deep** mode but feeds the output dict back into its own Phase-2 reconciliation rather than rendering a separate PDF.

## Output file naming

| Mode | Filename pattern |
|---|---|
| deep | `<Company>_Concall_<Quarter>_Deep.pdf` |
| brief | `<Company>_Concall_<Quarter>_Brief.pdf` |
| multi-quarter | `<Company>_Concall_MultiQ_<earliest>-<latest>.pdf` |
| multi-peer | `<Sector>_Concall_PeerCompare_<Quarter>.pdf` |

## Pitfalls

- **Tone analysis is qualitative.** Don't put "Bullish 85% confidence" labels — use Bullish / Neutral / Cautious / Defensive.
- **Q&A section is the goldmine.** If you only had time to read one part of a 40-page transcript, read the analyst Q&A. That's where the unscripted information lives.
- **Compare to prior quarter wherever possible.** A "we expect 15% growth" carries different meaning depending on whether last quarter said 10%, 15%, or 18%.
- **Beware the "no surprises" call** — if a 50-page transcript has no dodged questions, no tone shift, and identical guidance: either the business genuinely has no story, or you're reading too superficially.
