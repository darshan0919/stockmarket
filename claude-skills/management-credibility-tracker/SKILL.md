---
name: management-credibility-tracker
description: The "Walk-the-Talk" guidance tracker for Indian listed companies — systematically compares what management guided across 4-8 quarterly concalls vs what actually happened. Computes a credibility score (+1 beat/on-track, 0 mixed, -1 miss). Use whenever the user wants to assess management quality, asks "is management walking the talk", "are they overpromising", "guidance tracker", "credibility score", "did they deliver on guidance", or wants to score management before sizing a position. Auto-fetches 4-8 concall transcripts from Stockscans when given only a ticker. Outputs an HTML widget (color-coded scoreboard with per-quarter breakdown) AND optionally a PDF — both rendering the same underlying schema. Delegated to by equity-research-deepdive §9 (Management Track Record).
---

# Management Credibility Tracker

> "Compare each quarter's results against previous quarter's guidance. +1 for beat/on-track. -1 for miss. Aggregate over 4–8 quarters." — *AI for the Intelligent Investor*, Day 2, p.16

This skill encodes the Walk-the-Talk system from Day 2 — the one that produced the documented case studies on Mayur (+2), Hikal (-1), Navin Fluorine (+3), and Gravita (0). The output is a credibility score that goes directly into the investment verdict.

## When to use this skill

- User wants to assess management quality before sizing a position
- User says: "is management walking the talk", "are they overpromising", "did they deliver on guidance", "credibility score", "guidance tracker"
- After a results miss, user asks "have they missed before?"
- Other skills delegate here:
  - `equity-research-deepdive` §9 (Management & Promoter Track Record)
  - `equity-research-master` Tab 0 verdict + Tab 11 concall context

## Conventions

Follow [`_shared/conventions.md`](../_shared/conventions.md). Particularly: the credibility taxonomy in §6 (+1 / 0 / -1) and FY26 = April 2025–March 2026.

## Workflow — 4 phases

### Phase 1 — Document acquisition

```bash
TICKER="NSE:SWARAJENG"
SAFE=$(echo "$TICKER" | tr ':' '_')
DOCS_DIR="/tmp/${SAFE}_credibility_docs"

# 6-8 quarterly transcripts is the sweet spot
python3 /tmp/fetch_documents.py "$TICKER" \
    -t Transcript --last-n 8 -o "$DOCS_DIR"

# Also pull the latest annual report for the long-form Vision/Strategy guidance
python3 /tmp/fetch_documents.py "$TICKER" \
    -t "Annual Report" --last-n 1 -o "$DOCS_DIR"
```

If only 4-5 transcripts are available (recent IPO), proceed but flag in the output that the credibility window is short.

### Phase 2 — Guidance extraction (delegate to concall-analysis)

This skill **does not re-implement** concall extraction. Call `concall-analysis` in `multi-quarter` mode and consume its output:

```python
import sys
sys.path.insert(0, '/tmp')
sys.path.insert(0, '/tmp')

# concall-analysis will return a dict with `themes`, `promises`, `confidence_counter`
# We use the `promises` table as our primary input
```

The `promises` table has these fields per row:
```
{
    "quarter": "Q4 FY24",
    "promise": "FY26 revenue growth 20% YoY",
    "outcome": "FY26 actual: 14% (Q3 TTM)",
    "status": "DELIVERED" | "ON TRACK" | "MISSING" | "MISSED" | "TOO EARLY",
    "metric_type": "revenue" | "margin" | "capex" | "capacity" | "client" | "other",
}
```

For each promise, score per the credibility taxonomy:
- DELIVERED → +1
- ON TRACK → +1
- MISSING (yet to come due) → 0 (don't count yet)
- MISSED (>10% below guided value) → -1
- TOO EARLY → 0 (skip)

### Phase 3 — Score aggregation

Compute these aggregates:
- **Total credibility score** = Σ(scores) over all closed promises (excluding MISSING/TOO EARLY)
- **Promises closed** = count of promises that have either delivered or missed
- **Beat rate** = (count of +1) / promises closed
- **Most-missed metric** = which metric type (revenue/margin/capex/capacity) has the worst beat rate?
- **Most-credible metric** = best beat rate
- **Confidence trajectory** = from `confidence_counter` table — is HIGH-language declining over time?

Apply the rating bands from conventions §6:
- Score **+5 to +8** → **HIGH credibility** (Mayur/Navin pattern)
- Score **+1 to +4** → **MEDIUM credibility** (most mid-cap managements)
- Score **0** → **MIXED** (Gravita pattern — some delivered, some missed)
- Score **-1 to -2** → **WATCH** (Hikal pattern after FY25)
- Score **-3 or worse** → **RED** — management is not walking the talk; resize accordingly

### Phase 4 — Render

Two output formats, same schema:
- **HTML widget** — interactive scoreboard with per-quarter drill-down. Default. Saved to `/mnt/project/packages/cowork-jobs/data/agent-outputs/<Company>_Credibility.html`.
- **PDF** — for sharing in committee meetings; uses the standard ReportLab pipeline. Saved to `<Company>_Credibility.pdf`.

```python
import sys
sys.path.insert(0, '<skill_path>/scripts')
from generate_credibility_widget import create_credibility_widget

data = {
    "company_name": "...",
    "ticker": "NSE: ...",
    "tracking_window": "Q1 FY24 - Q3 FY26",   # 8 quarters
    "score": int,                  # e.g., +3
    "rating": "HIGH" | "MEDIUM" | "MIXED" | "WATCH" | "RED",
    "promises_closed": int,
    "beat_rate": float,            # 0.0-1.0
    "most_missed_metric": str,
    "most_credible_metric": str,
    "promises": [                  # full table, color-coded in widget
        {"quarter": "Q4 FY24", "promise": "...", "outcome": "...",
         "status": "DELIVERED", "score": 1, "metric_type": "revenue"},
        ...
    ],
    "case_study_match": "Mayur" | "Navin" | "Hikal" | "Gravita" | None,
    "interpretation": "1-paragraph synthesis",
    "output_path": "/mnt/project/packages/cowork-jobs/data/agent-outputs/<Company>_Credibility.html",
}
create_credibility_widget(data)
```

## The 4 documented case studies (calibration anchors)

These are the reference patterns from Day 2. Every credibility output should declare which pattern (if any) the company most resembles.

| Company | Pattern | Score | Action implied |
|---|---|---|---|
| Mayur Uniquoters | Under-promise / over-deliver | +2 | HOLD (high quality, accumulate on dips) |
| Navin Fluorine | Multiple-driver outperformance | +3 | HOLD/BUY (premium-quality compounder) |
| Hikal | Over-optimistic guidance, deteriorating language | -1 | WATCH/RED |
| Gravita India | Mixed delivery, vision-2028 nuance | 0 | MONITOR |

The `case_study_match` field in the output schema names the closest reference pattern.

## HTML widget structure

The widget is a single self-contained HTML file with:
- Top banner: company name + score badge (color-coded green/yellow/red)
- KPI strip: tracking window, promises closed, beat rate, most-missed metric
- Color-coded scoreboard table: one row per promise, sortable by quarter / metric type / status
- Confidence-language trajectory mini-chart (optional, Chart.js 4.4.1)
- Interpretation paragraph + case-study match callout

Strict rules from `_shared/conventions.md` §5:
- Single self-contained file, one `<style>`, one `<script>`
- ASCII hyphen-minus for negatives in JS
- CSS variables in both `:root` and `[data-theme="dark"]`
- Missing data → `---------`

## Cross-skill integration

When called from `equity-research-deepdive`:
- Run in **schema mode**: don't render the widget; return the dict
- Deepdive consumes `score`, `rating`, `interpretation`, `case_study_match` to populate §9

When called from `equity-research-master`:
- Schema mode; the master orchestrates the rendering into the master HTML dashboard

When called standalone:
- Render both HTML widget AND optionally a PDF via the parameter `output_format="both"`

## Pitfalls

- **MISSING is not the same as MISSED.** A promise still in flight (e.g., "FY28 revenue 25% CAGR" stated in Q4 FY24, with FY26 just ending) is not a miss — it's TOO EARLY. Don't count it.
- **Cherry-picking.** Use the multi-quarter framework's `promises` table — don't selectively pick promises that support a narrative.
- **Single-metric overweight.** A company that misses revenue but beats margins is +0, not -1. Score per promise, then aggregate.
- **Vague guidance is not a promise.** "We will continue to grow" is not scoreable. Only quantitative or time-specific guidance counts.
- **Tone language alone is not credibility.** A company can use HIGH-language ("we will") and miss; vice versa. Calibrate to actuals, not language.

## File tree

```
management-credibility-tracker/
├── SKILL.md                                 (this file)
├── _shared/
│   ├── conventions.md                       (linked)
│   └── pdf_utils.py                         (shared)
├── references/
│   ├── credibility_framework.md             (full scoring rubric + case studies)
│   └── case_study_calibration.md            (the 4 reference patterns in detail)
├── scripts/
│   ├── generate_credibility_widget.py       (HTML widget generator)
│   └── generate_credibility_pdf.py          (optional PDF version)
└── assets/
    └── widget_template.html                 (Jinja2-style template)
```
