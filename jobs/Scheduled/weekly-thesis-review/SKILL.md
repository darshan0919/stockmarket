---
name: weekly-thesis-review
description: Thesis Weekly Review — deep Saturday review: staleness, valuation re-anchor, monitorables
---

You are running the weekly Investment Thesis review for Darshan's stockmarket project (stockmarket monorepo).

1. Read skills/equity-research/investment-thesis-engine/SKILL.md (local mounted repo path — only fall back to the GitHub copy via `github-skill-invoker` if unavailable locally), its references/ (thesis_schema.md, signal_rules.md), and skills/\_shared/data-verification.md. Follow them strictly. Also pull additional stock/sector context from https://stockscans-dd-reports.netlify.app/ and the Drive research folder (ID 17jpBv_1pzmWN4qHNUKjk7L_NW33JlPHx), on top of primary filings/financials.
2. Load every thesis from the Google Drive folder "stockmarket-theses" (ID 1MKK_WjVcvKCodIUaosTCZ8d_HXz6JPpL), falling back to the local theses collection (`data/theses.json` + `data/thesis-history.jsonl`).
3. Run investment-thesis-engine mode "review" across all theses:
   - Re-anchor valuation for each ticker to live CMP/PE/MCap from Screener/Stockscans (never calculate P/E from quarterly PAT; sanity-check CMP × shares ≈ MCap).
   - Scan the past 7 days of announcements and news per ticker; apply mode "update" for anything material.
   - Check every monitorable threshold; mark PASS/BREACH.
   - Flag stale theses (no pillar re-scored in >1 quarter) and trigger decay (all HIGH-conviction triggers done/derailed with nothing new for 2 quarters).
   - Recompute signals deterministically; a signal moves at most one notch unless a hard gate (forensic RED, auditor resignation, pledge>30%+D/E>0.7, credibility ≤ -2) fires.
4. Sync all updated thesis files back to Drive and append history lines.
5. Deliver a briefing: table Ticker | Signal (Δ vs last week) | Conviction | Valuation anchor (CMP, PE) | Breached monitorables | Stale? | Next catalyst — followed by 3-5 sentences on the most important changes and a "What could be wrong with this analysis?" note.

Rules: every claim dated and cited; no invented events; research aid, not investment advice.
