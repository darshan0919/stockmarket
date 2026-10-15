---
model: flash_lite
name: daily-thesis-delta-scan
description: Thesis Delta Scan — apply new announcements/results to stored theses, flag signal changes
---

You are running the daily Investment Thesis delta scan for Darshan's stockmarket project (stockmarket monorepo).

1. Read skills/equity-research/investment-thesis-engine/SKILL.md (local mounted repo path) plus its references/ (thesis_schema.md, signal_rules.md) and skills/\_shared/data-verification.md. Follow them strictly. Also pull additional stock/sector context from https://stockscans-dd-reports.netlify.app/ and the Drive research folder (ID 17jpBv_1pzmWN4qHNUKjk7L_NW33JlPHx), on top of primary filings/financials.
2. Load every thesis: list files in the Google Drive folder "stockmarket-theses" (ID 1MKK_WjVcvKCodIUaosTCZ8d_HXz6JPpL) via the Google Drive connector; fall back to the local theses collection (`data/theses.json` + `data/thesis-history.jsonl`).
3. For each ticker, check the last 24h (Mon: since Friday) for material events: new quarterly result/concall, corporate announcements (order wins, fundraises, pledge changes, auditor/KMP changes, rating actions), or a >5% price move. Reuse the repo's stock-documents-fetcher / fundamental-shift-scanner skill logic; do not re-fetch documents already in downloads/ or the corpus.
4. For tickers with material events, run investment-thesis-engine mode "update": append dated, cited evidence entries, check monitorable thresholds, re-score ONLY affected pillars, recompute the signal deterministically per signal_rules.md, bump version, write thesis.json + thesis.md + history line, and sync to Drive.
5. Output a briefing table: Ticker | Event | Pillar(s) touched | Signal (old → new) | Monitorable breaches. Lead with any signal changes. If nothing material happened, say so in one line.

Rules: date and cite every claim; never invent events; anchor CMP/PE to Screener/Stockscans, never training data. This is research aid, not investment advice.

Final step (every run, per `skills/tooling/cowork-task-architect/SKILL.md`): execute `python scripts/metrics/track_invocation.py --name daily-thesis-delta-scan --type task --model <the exact model executing this run, e.g. claude-sonnet-5>`, and set that same model string as `modelUsed` on every thesis you write in step 4 (re-scoring and signal recomputation are LLM judgment, per `investment-thesis-engine/SKILL.md`).

## Email delivery (mandatory last step of EVERY run)

The owner reads job output in Gmail, so this job must always end with an email — success, partial or failure, even when there was nothing new (a one-line "nothing to do" email is the heartbeat that proves the job ran).

1. Write the report text — the briefing table from step 5 (Ticker | Event | Pillar(s) | Signal old→new | Monitorable breaches); if nothing material, one line saying so — as markdown to a temp file _outside the repo_ (`f=$(mktemp)`). Keep it to what matters, lead with the headline.
2. Execute script (bash): `STOCKMARKET_JOB_NAME=daily-thesis-delta-scan yarn job-report-email --job daily-thesis-delta-scan --status <ok|partial|failed> --title "<one-line outcome>" --body-file "$f"`
3. If the run stopped early (a dependency check failed, a script exited non-zero), still run step 2 with `--status failed` and the exact error as the body.
4. If the command exits non-zero (`email.status` is `skipped` or `error`, e.g. `GOOGLE_APP_PASSWORD not set`), surface the exact reason in your final report — never report the job as delivered.
