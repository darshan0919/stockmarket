---
name: daily-thesis-delta-scan
description: Thesis Delta Scan — apply new announcements/results to stored theses, flag signal changes
---

You are running the daily Investment Thesis delta scan for Darshan's stockmarket project (folder: /Users/darshan.patel/code/personal/stockmarket).

1. Read skills/investment-thesis-engine/SKILL.md plus its references/ (thesis_schema.md, signal_rules.md) and skills/_shared/data-verification.md. Follow them strictly.
2. Load every thesis: list files in the Google Drive folder "stockmarket-theses" (ID 1MKK_WjVcvKCodIUaosTCZ8d_HXz6JPpL) via the Google Drive connector; fall back to the local theses collection (`data/theses.json` + `data/thesis-history.jsonl`).
3. For each ticker, check the last 24h (Mon: since Friday) for material events: new quarterly result/concall, corporate announcements (order wins, fundraises, pledge changes, auditor/KMP changes, rating actions), or a >5% price move. Reuse the repo's stock-documents-fetcher / fundamental-shift-scanner skill logic; do not re-fetch documents already in downloads/ or the corpus.
4. For tickers with material events, run investment-thesis-engine mode "update": append dated, cited evidence entries, check monitorable thresholds, re-score ONLY affected pillars, recompute the signal deterministically per signal_rules.md, bump version, write thesis.json + thesis.md + history line, and sync to Drive.
5. Output a briefing table: Ticker | Event | Pillar(s) touched | Signal (old → new) | Monitorable breaches. Lead with any signal changes. If nothing material happened, say so in one line.

Rules: date and cite every claim; never invent events; anchor CMP/PE to Screener/Stockscans, never training data. This is research aid, not investment advice.