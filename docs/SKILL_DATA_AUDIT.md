# Skill Data Audit — what each skill needs, generates, and should store

Basis for `docs/DATA_ECOSYSTEM.md`. Audited 2026-07-08 from all 39 SKILL.md files +
runtime libs (`packages/jobs-runtime/*`). Storage rule applied: **DB stores only
metadata, links, and LLM/analyst outputs. Anything regenerable at runtime via
script/API is NOT stored** (exception: heavy + frequently-read derivables → `cache/`).

## A. Company-scoped LLM research reports (on-demand)

annual-report-analysis, concall-analysis, consecutive-filings-diff, drhp-ipo-analysis,
equity-research-deepdive, equity-research-dashboard, equity-research-master,
financial-model, forensic-accounting, growth-triggers-1pager,
management-credibility-tracker, quarterly-result-analysis, stage2-catalyst-analysis,
stock-report, value-chain-analysis.

- **Need**: company identity (Kite master), primary docs (Stockscans fetch — regenerable),
  prior reports + notes + thesis + recent events for the same company (**context**).
- **Generate**: analysis DTO (LLM output) + rendered PDF/HTML.
- **Store**: DTO body in `reports/<id>.json`, index entry in `reports.json`. Rendered
  PDF/HTML → `assets/` (regenerable from DTO via template → not precious).
- **Do NOT store**: fetched PDFs/transcripts (stock-documents-fetcher re-fetches),
  extraction `.txt` (regenerable; if heavy → `cache/extracts-<ticker>.json`).

## B. Multi-company / sector LLM reports

market-share-analysis, peer-comparison, sector-research-deepdive, pre-pead-scanner,
tweet-investor-playbook.

- Same as A but DTO carries `companyIds[]` (and/or `sector`) instead of single `companyId`.
  pre-pead-scanner ranking snapshot is an LLM+data composite → store as report DTO.

## C. Scheduled event/signal jobs

| Skill                                                  | Regenerable inputs (don't store)                                            | LLM/derived output (store)                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| gainers-signal                                         | NSE gainers API, delivery data, quality filters → `runs/`                   | classified signals → `events-YYYY-MM.json` (type=gainer)                     |
| tweet-signals                                          | — (browser capture is NOT re-fetchable → raw capture IS source, store slim) | classified signals → `events-*.json` (type=tweet); raw capture → `runs/` 90d |
| daily-deals-digest                                     | NSE/BSE bulk/block/SAST/insider APIs (re-fetchable ~short window)           | digest records → `events-*.json` (type=deal)                                 |
| watchlist-insights                                     | announcements API + PDFs                                                    | per-company insight notes → `notes.json`                                     |
| announcement-keyword-explorer                          | announcements API                                                           | keyword hits if annotated → `events-*.json` (type=announcement)              |
| fundamental-shift-scanner / watchlist-catalyst-scanner | filings via Stockscans                                                      | scan verdicts → `reports.json` (type=scan) or `events-*.json`                |

## D. State & ledgers (always store — not regenerable)

- insight-validation → `validation.json` (ledger records; needs `date` + `companyId`
  keys to fetch "the morning's insights" for a given day — retrieval fields required).
- investment-thesis-engine → `theses.json` (current) + `thesis-history.jsonl` (append-only).
- notes DB (watchlist-notes entity) → `notes.json`.
- watchlist-sync → watchlist state lives in Stockscans (regenerable); store only the
  sync-run summary (diff) → `events-*.json` (type=watchlist-sync).

## E. Reference / heavy derivables → `cache/` (regenerable, kept for speed)

- `cache/company-master.json` — Kite instruments dump distillation (12,232 rows; rebuilt
  by `companyMasterSync.js`; read synchronously by many skills).
- `cache/bse-scrip-codes.json`, `cache/sector-context-*.json`.
- Config (keyword ignore lists, templates, schemas) → **git**, not DB.

## G. Conversation capture (chat → knowledge)

conversation-capture (weekly job + migration). See `docs/CONVERSATION_CAPTURE_PLAN.md`.

- **Need**: exported chat transcripts (Cowork via session archive / session_info; cloud via
  account Data Export), `cache/company-master.json` names for the Stage-2 classifier.
- **Generate**: a conversation DTO per stockmarket chat + fanned-out extracts.
- **Store**: conversation index → `conversations.json`, full transcript body →
  `conversations/<id>.json` (via `db.saveConversation`); company-scoped extracts →
  `notes.json` (type=chat-insight/macro-note/framework/feedback), full analyses + non-skill
  artifacts → `reports.json` (type=chat-analysis/artifact) + `assets/`; feedback → Claude
  memory. `creator: "conversation-capture"`.
- **Do NOT store**: non-stockmarket chats (classifier-gated), personal/sensitive docs
  (e.g. tax/ITR files with PAN), or artifacts a skill already persisted (skip by hash).

## F. Tooling skills (no DB writes)

render-pdf (pure DTO→asset function), skill-manager, find-skills, cowork-task-architect,
token-usage-analyzer, github-skill-invoker, output-dto-standard, stock-documents-fetcher
(fetch-only; downloads are transient).

## Cross-skill context needs (drives `buildCompanyContext`)

Every Category A/B skill benefits from: identity, thesis, last N reports (same company,
any type), notes, last 90d events, validation verdicts, and recent captured conversations
(chat history about the company). Today none of them read prior outputs (each starts cold)
— the single biggest reuse win of v2.
