# Synthesis Rules

Read this during Phase 3 (synthesis). It governs how tagged tweets are aggregated into the four content tabs (Insights, Quotes, Playbook, Track Record). Track Record has its own dedicated reference — see `track_record_methodology.md`.

## Universal grouping logic

The single biggest failure mode is producing 80 disconnected insights instead of 12 well-supported ones. Aggressively cluster.

**Clustering procedure:**

1. Within each tag bucket (`concept`, `process`, `macro_view`, etc.), read all tweets.
2. Identify recurring ideas. A recurring idea = same operational meaning expressed in different words across ≥ 2 tweets.
3. Merge into one entry. Keep ALL supporting citations.
4. If a tweet is a one-off but high-quality (specific, actionable), keep as a singleton entry with `frequency = 1` and `confidence = Low or Medium`.

**Confidence calibration:**

- **High**: ≥ 5 tweets supporting, consistent over time, no contradictions
- **Medium**: 2–4 tweets, or a strong single statement repeated verbatim, no contradictions
- **Low**: single tweet, or contradicted elsewhere in the corpus

When the investor's view evolved over time (e.g., bearish on PSU banks in 2022, bullish in 2024), DO NOT average — show the evolution as a single insight with a "stance shifted [date]" note.

## Tab 1: Insights — what to include

Insights = recurring views about how markets work, what to look for, how to think.

Each insight should answer: *"After reading the corpus, what does this investor consistently believe about markets?"*

Good insights:
- "Prioritises management quality over financial ratios" (Philosophy)
- "Bullish India PSU re-rating since FY24 budget" (Macro / Sector-View)
- "Cuts position when stop-loss hits 15% from entry" (Risk-Mgmt)

Bad insights (cull these):
- "Likes RIL" — too narrow, belongs in Track Record
- "Talks about markets" — empty
- "Said one positive thing about banks" — singleton, low confidence

## Tab 2: Quotes — copyright and dedup rules

**Rule 1: Well-known concepts get named, not quoted.**

If the tweet is restating a well-known investing concept, just name the concept. Don't quote. Examples:

| Tweet content | Output |
|---|---|
| "Cigar butts and 50-cent dollars are the way" | "Cigar-butt investing (Graham/Buffett)" |
| "Be greedy when others are fearful" | "Contrarian buying in fear (Buffett)" |
| "Margin of safety > forecast accuracy" | "Margin of safety (Graham)" |
| "Inversion is underrated" | "Inversion (Munger)" |

**Rule 2: Unique formulations get reworded, never quoted verbatim.**

If the investor has their own phrasing, capture the *idea* in fewer than 15 words in analyst voice. The original tweet text is for our internal reference only — never in the final output.

Example:
- Tweet: "Promoter buying when stock is bleeding is the single highest-conviction signal I know of"
- Output (reworded): "Promoter buys during drawdowns = top conviction signal"

**Rule 3: Cluster duplicates.**

If five tweets express the same heuristic, ONE quote card with five citations. Not five cards.

**Rule 4: Cull operational nothing.**

If a "quote" has no operational signal ("markets are humbling", "investing is hard"), drop it.

## Tab 3: Playbook — extract operations, not opinions

Insights live in Tab 1. Tab 3 is for things the user can DO.

Each playbook entry must be an imperative or a checklist item. If you can't rewrite it as "Do X" or "Check Y", it doesn't belong here.

**Three columns:**

### Screens & Filters
Quantitative or qualitative filters the investor uses to find ideas. Examples:
- "Screen for RoCE > 18% over 5 years AND D/E < 0.5"
- "Reject any business with promoter pledge > 20%"
- "Only buy when FCF / PAT > 0.7"

### Entry / Exit Triggers
Specific buy and sell triggers. Examples:
- "Buy on 30% drawdown from 52-week high if thesis intact"
- "Trim half when position size exceeds 15% of portfolio"
- "Sell if quarterly EBITDA margin contracts > 300 bps"

### Process & Risk SOPs
Checklists, diligence steps, position-sizing rules. Examples:
- "Read last 8 concalls before initiating"
- "Cap any single bet at 8% cost basis"
- "Re-evaluate every position quarterly post-result"

## Citation format

Inside the widget JSON, every citation is a string of the form `#<tweet_id>` (preferred) or `<YYYY-MM-DD>` if ID is missing. Cap citations per entry at 8 (if more exist, write "8 of 23 supporting tweets"). The widget will render these as small clickable chips, but it doesn't need to actually link out — they're attribution markers.

## Tone

Neutral analyst voice. Past-tense narration of what the investor said. Avoid:

- "This is a brilliant insight" — moralising
- "You should follow this rule" — prescriptive to the reader
- "Investor X believes..." — fine, this is correct

Prefer:

- "X consistently flags promoter pledge as a screen-out criterion."
- "Across 14 tweets, X attributes failed bets to ignoring management track record."
