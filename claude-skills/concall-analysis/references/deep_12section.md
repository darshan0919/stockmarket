# Concall Deep Dive — 12-Section Framework

The most comprehensive concall analysis in the library. Apply when the transcript is for a portfolio company or a company under serious consideration.

**Master prompt:**

> You are a senior equity analyst at a top-tier Indian institutional fund. The fund manager has asked for a deep analysis of the attached concall transcript for [Company], [Quarter] [FY]. Be factual and comprehensive. Avoid assumptions or unsupported inferences. Prioritize the most critical points in each section. For industry- and company-specific details, focus on providing a deep explanation (do not summarize). Quote verbatim where the exact language matters. For every claim, cite the speaker (designation) and the line in the transcript. Strictly follow the 12-section structure below.

## §1 Executive Summary

- Overall performance (one paragraph)
- Top 3 highlighted topics in the call
- Management tone and sentiment in one phrase: **Bullish / Neutral / Cautious / Defensive**
- One-line bottom line: what the PM should know in 30 seconds

## §2 Detailed Analysis

- Business model evolution since the prior quarter — anything new?
- Revenue impact discussion (segment-wise if multi-segment)
- Cost structure commentary (raw materials, labour, overhead, finance costs)
- Working capital narrative — receivables, inventory, payables
- Competitive positioning narrative
- **Tone shifts or inconsistencies** within the call (CFO vs CEO contradictions are gold)

## §3 Industry & Company-Specific Detail

- Market trends mentioned (volume, pricing, demand)
- Competitive landscape comments
- Regulatory / policy updates referenced (PLI, tariffs, emission norms)
- Supply chain / raw material commentary

Don't summarise. Provide deep explanations of the specifics so a generalist PM understands the dynamics.

## §4 Forward-Looking Statements & Guidance

The most important section. Every guidance number needs a row in this table:

```
| Metric            | Guidance        | Timeline   | Confidence | Source quote                  |
|-------------------|-----------------|------------|------------|-------------------------------|
| Revenue growth    | 15%             | FY27       | HIGH       | "we will achieve 15% in FY27" |
| EBITDA margin     | 18%-20%         | by H2 FY27 | MEDIUM     | "we expect to reach..."       |
| Capex             | Rs 250 Cr       | FY26-FY28  | HIGH       | "approved by board"           |
```

Confidence ratings:
- **HIGH** — "we will", "target is", "guidance is", "approved", "contracted"
- **MEDIUM** — "we expect", "likely to", "should", "anticipate"
- **LOW** — "may", "endeavor to", "aspire to", "could be"

Track separately: revenue growth, EBITDA margin, capex, new orders, capacity utilisation, recovery timelines.

## §5 Risk Assessment

Risks management acknowledged on the call (often more credible than risk factors in the AR):
- Competitive threats
- Regulatory / policy
- Technology disruption
- Execution / timeline
- Customer concentration
- Currency / commodity

Plus risks management did NOT acknowledge that the analyst should flag.

## §6 Comparison to Peers

If management mentioned peers (rare but happens) — capture verbatim.

If not, the analyst's task: how does what was said today compare to what peer companies said this quarter? (cross-reference with `multi-peer` mode if peer transcripts are available.)

## §7 Long-Term Strategy

- Vision alignment with prior calls — same long-term narrative or has it shifted?
- Strategic priorities reaffirmed vs new
- Capital allocation language

## §8 Analyst Q&A

The single most valuable section of the transcript. For each significant Q:
- Analyst name + firm
- Question (verbatim or close paraphrase)
- Management's response (verbatim or close paraphrase)
- Was it answered? **YES / PARTIAL / DODGED**
- If dodged or partial — note it

Pattern flags:
- Same question asked by 2+ analysts and not getting a clear answer = signal
- Question on a specific number (margin, order book, capex) answered with a generic statement = signal
- "We'll come back to you on that" said and then no follow-up = signal

## §9 Quantitative Data

Compile every number stated on the call into one table:

```
| Metric            | Value      | Source        | Significance         |
|-------------------|------------|---------------|----------------------|
| Q3 revenue        | Rs 234 Cr  | CFO opening   | +12% YoY             |
| Order book        | Rs 1,800Cr | MD response   | 1.6x TTM rev         |
| Capacity util.    | 78%        | analyst Q     | +4pp QoQ             |
```

This table is the primary feed to the `equity-research-master` Tab 11.

## §10 Key Insights Table

Synthesise the call's analytical takeaways:

```
| Insight                                | Impact   | Evidence                |
|----------------------------------------|----------|-------------------------|
| Margin expansion driven by mix shift   | POSITIVE | CFO commentary p.5      |
| Order book quality is deteriorating    | NEGATIVE | Vague answers on margin |
```

## §11 Connecting the Dots

One-paragraph synthesis: how does this concall change the broader thesis? What's the new narrative? What 2 or 3 things should the analyst track over the next 1-2 quarters?

## §12 Analysts on the Call

List of analyst names + firms. This signals coverage breadth and which institutions are paying attention.

## Output structure (PDF)

Page 1: §1 + §4 (the executive sees these first)
Pages 2-4: §2, §3, §5, §6, §7
Page 5: §8 — analyst Q&A goldmine (often spans 2 pages)
Page 6: §9 — quantitative data table
Page 7: §10 + §11 + §12

Total: 6-8 pages.

## What can be wrong with deep mode

- **Hallucinated quotes** — easy mistake. Always verify quotes verbatim against the transcript before publishing.
- **Misclassified confidence** — "We expect to achieve..." is MEDIUM, not HIGH. Resist promotion.
- **Missing §8 entries** — the dodged-question section is hard work but the most valuable. Don't skip it.
- **Tone over-confidence** — "Bullish" should be reserved for clear positivity. Default to **Neutral** when unclear.
