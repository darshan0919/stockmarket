# Credibility Framework

The full scoring rubric for the Walk-the-Talk system. Apply uniformly; don't bend rules to fit a desired outcome.

## Core principle

Compare each closed promise (where the time window has elapsed and the actual outcome is known) against management's quantitative guidance from a prior quarterly call. The actual must be within ±10% of the guided range to count as MET.

## Status definitions

| Status | Definition | Score |
|---|---|---|
| **DELIVERED** | Actual met or exceeded the guided value (or fell within the lower bound of a range, with margin of safety on the timeline) | +1 |
| **ON TRACK** | Promise still in flight, but interim quarters consistent with the guided trajectory | +1 |
| **MIXED** | Multi-component promise where some sub-targets met and others missed (e.g., Gravita: PAT CAGR on track, capacity addition missed) | 0 |
| **MISSING** | Promise not yet at its due date; outcome unknown | excluded from scoring |
| **MISSED** | Actual >10% below guided value at the due date | -1 |
| **TOO EARLY** | Promise made very recently, no interim data | excluded from scoring |
| **WITHDRAWN** | Management explicitly walked back the promise on a later call | -1 (counts as miss) |

The 10% tolerance is calibrated for normal volatility. For step-function metrics (e.g., capacity commissioning by date), miss is binary — either delivered by the date or not.

## Metric types and how they score

Different metrics have different signal value. Score each consistently within its type.

### Revenue / volume guidance
- "FY26 revenue growth 20% YoY" → if FY26 actual is 18-22%, **DELIVERED**; if <18%, **MISSED**
- Range guidance ("18-22%") → middle of range as anchor; bottom of range with -10% tolerance is the miss line

### Margin guidance
- "EBITDA margin 18%" → if FY26 actual is 16-20%, **DELIVERED** (margin tolerance is wider since input costs are volatile)
- "Margin expansion of 200bps in FY26" → directional; if expansion was <100bps, **MISSED**

### Capex / capacity guidance
- "Capacity 7 lakh MTPA by FY28" — score on the path, not just the endpoint. If 50% of work needed by Year 1 was done, **ON TRACK**. If <25%, **MISSED** even if the FY28 deadline hasn't arrived.
- "Hyderabad plant commissioning Q2 FY26" → binary on date. If commissioned in Q3 FY26 with reasonable explanation: **MISSED** (one quarter late = ~25% delay); if Q4 FY26: **MISSED** (full half-year late).

### Order book / order win guidance
- "Order book to grow 20% in FY26" — same rules as revenue.
- "Win an order from Customer X by H2 FY26" — binary; missed = full -1.

### Strategic milestones
- "Demerger / IPO of subsidiary by FY27" — binary on date.
- "New product launch by Q3 FY26" — binary; partial launch (e.g., pilot only) = **MIXED** (0).

## Aggregation

Total score = Σ(scores of closed promises). Beat rate = (count of +1) / (total closed).

Apply rating bands:

| Score range | Rating | Implied action |
|---|---|---|
| +5 to +8 | **HIGH** | Premium credibility — under-promise / over-deliver pattern (Navin/Mayur). Accumulate on dips; positive surprises likely. |
| +1 to +4 | **MEDIUM** | Above-average; competent execution. Standard portfolio weight. |
| 0 | **MIXED** | Some delivery, some misses (Gravita). Watch for trend deterioration. Tracking position. |
| -1 to -2 | **WATCH** | More misses than beats (Hikal post-FY25). Reduce position; downgrade thesis confidence. |
| -3 or worse | **RED** | Systematic over-promising. Resize materially or exit. Increase scrutiny on next concall. |

## Cross-checks (avoid mis-scoring)

1. **Was the promise quantitative?** "We will continue to grow" is not a promise. Skip.
2. **Was the promise quoted from the management's own commentary?** Analyst restatements ("you said you'd hit Rs 250 Cr") that management didn't endorse don't count.
3. **Did the timeline elapse?** A FY28 promise made in FY24 cannot be scored in FY26.
4. **Did external conditions change the goalposts?** A FY26 capex commissioning delayed by 6 months because of a regulatory approval delay outside management's control: still **MISSED**, but flag as "external cause" so the analyst can interpret. Doing this consistently avoids penalising managements for genuine bad luck while still tracking outcomes.
5. **Is the metric the same?** "EBITDA margin" guided vs "Operating margin" reported are not the same number. Verify definitions match.

## Confidence-language trajectory (qualitative overlay)

Beyond the +1/0/-1 score, track the **language trend**:

```
| Quarter | "We will" | "Target is" | "We expect" | "Likely to" | "May" / "Aspire" |
|---------|-----------|-------------|-------------|-------------|------------------|
```

A monotonic decline in HIGH-commitment columns ("We will", "Target is") with corresponding rise in LOW columns ("May", "Aspire") often precedes a guidance miss by 1-2 quarters. This is a leading indicator that the credibility score (which is lagging) hasn't yet captured.

If the language shift is observed, the rating may be downgraded one band on a discretionary basis (e.g., MEDIUM → MIXED) — note this in the interpretation paragraph.

## Output paragraph template

The interpretation paragraph in the output should follow this structure:

> [Company] scored [+X / 0 / -X] over [N quarters tracked]. [Most-credible metric] has been the strongest area ([beat rate]% delivered), while [most-missed metric] has been the persistent miss ([X of Y missed]). The confidence-language trajectory [is stable / has shifted from HIGH to MEDIUM / has shifted from MEDIUM to LOW], suggesting [tone interpretation]. The closest documented case-study pattern is [Mayur / Navin / Hikal / Gravita], which implies [action: HOLD-BUY / HOLD / MONITOR / WATCH / RED].

Write this paragraph **after** the score is computed; don't reverse-engineer the score from a desired narrative.
