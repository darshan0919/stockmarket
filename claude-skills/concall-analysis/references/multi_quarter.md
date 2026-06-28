# Multi-Quarter Concall Comparison

Track how management's narrative evolves across 4-8 sequential quarterly calls. The goal is to detect:
- Topics that were prominent in early quarters but quietly disappeared
- Promises made but never delivered (precursor to `management-credibility-tracker`)
- Tone shifts from confident to cautious (or vice versa)
- Guidance that was repeated, modified, or abandoned

**Master prompt:**

> You are a senior equity analyst examining [Company]'s narrative across the last [N] quarterly concalls. Build a quarter-by-quarter narrative tracker. For each major theme, show how the language has evolved. Highlight: (a) topics that appeared in early quarters but were dropped; (b) explicit promises made and whether they've been delivered; (c) tone shifts from confident to cautious. Quote verbatim where the language change matters.

## Required input

`N` transcripts (4-8 recommended), most recent last. Use `manifest.json` `date` to confirm sequence — newest has the highest `date` value.

## Required tables

### Table 1 — Theme tracker

```
| Theme               | Q1 FY26 stance         | Q2 FY26 stance        | Q3 FY26 stance        | Trend         |
|---------------------|------------------------|-----------------------|-----------------------|---------------|
| FY26 revenue growth | "20% achievable"       | "20% guidance held"   | "narrowed to 15-17%"  | DETERIORATING |
| Margin expansion    | "200bps in FY26"       | "150-200bps"          | "modest improvement"  | DETERIORATING |
| New plant Hyderabad | "commissioning Q2 FY26"| "Q3 FY26 (delayed)"   | "Q4 FY26 (delayed)"   | DETERIORATING |
| Order book          | "Rs 1,200 Cr"          | "Rs 1,400 Cr"         | "Rs 1,650 Cr"         | IMPROVING     |
```

Pick 6-12 themes — typically: revenue, margin, capex/capacity, capital allocation, key customer/contract, segment-X performance, new product launches.

### Table 2 — Promises made and delivered

```
| Quarter made | Promise (verbatim)                         | Outcome (when due)         | Status      |
|--------------|--------------------------------------------|----------------------------|-------------|
| Q4 FY24      | "FY26 revenue growth 20% YoY"              | FY26 actual: 14% (Q3 TTM)  | MISSING     |
| Q2 FY25      | "Hyderabad plant commissioning Q2 FY26"    | Delayed to Q4 FY26         | MISSED      |
| Q1 FY26      | "EBITDA margin 18% by H2 FY26"             | Q3 FY26 actual: 17.3%      | ON TRACK    |
```

Status values: **DELIVERED** / **ON TRACK** / **MISSING** / **MISSED** / **TOO EARLY**.

### Table 3 — Topics dropped or muted

```
| Topic                 | First mentioned    | Last mentioned     | Reason given (if any)  |
|-----------------------|--------------------|--------------------|------------------------|
| US export expansion   | Q4 FY24            | Q1 FY25            | Not addressed in Q2-Q3 |
| Battery JV with X     | Q3 FY24            | Q3 FY24            | Silent thereafter      |
```

These dropped topics are often the most valuable insights. Once-promised initiatives that quietly disappear usually didn't work out — and management isn't going to flag that.

## Confidence-language shift counter

Count occurrences of HIGH-commitment language across quarters:

```
| Quarter | "We will" | "Target is" | "We expect" | "Likely to" | "May" / "Aspire" |
|---------|-----------|-------------|-------------|-------------|------------------|
| Q1 FY26 | 8         | 5           | 12          | 6           | 2                |
| Q2 FY26 | 5         | 4           | 14          | 9           | 3                |
| Q3 FY26 | 3         | 2           | 11          | 12          | 6                |
```

This is a quantitative signal that often precedes earnings deterioration. Day 2's Hikal case shows exactly this pattern: HIGH-commitment language dropping over 4 quarters before the FY26 guidance was effectively withdrawn.

## What to flag

- **Repeated dropped promises** = governance / execution credibility issue (consider feeding into `management-credibility-tracker`)
- **Vocabulary shifts** = tone deterioration even before numbers turn
- **Silent topics** = often the biggest signal; ask "what happened to the [thing] we discussed in Q2?"
- **Replaced narratives** = a new strategy emerging without explicit acknowledgement that the old one failed

## Output structure (PDF)

Page 1: Executive summary + Tone-shift summary
Page 2: Theme tracker (Table 1)
Page 3: Promises tracker (Table 2)
Page 4: Dropped topics (Table 3) + Confidence-language counter

Total: 4-5 pages.

## Cross-skill: feeding `management-credibility-tracker`

The Promises Tracker (Table 2) is the primary input to `management-credibility-tracker`. The credibility skill computes the +1/0/-1 score per row and aggregates. When called from `management-credibility-tracker`, return the data dict; don't render a separate PDF.
