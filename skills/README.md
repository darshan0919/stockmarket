# Claude Skills Registry

All Claude AI skills for the stockmarket monorepo, managed as version-controlled files.

## How it works

Skills are invoked directly from the locally-mounted repo checkout (Cowork
sessions, or any environment with this repo cloned) — there is no remote
fetch-and-execute meta-skill anymore. The old `github-skill-invoker` +
`stock-api/dist-skills/*.cjs` bundle architecture (for Claude Web sessions
with no local checkout) was retired 2026-09-16: confirmed unused, deleted.

1. Claude reads a skill's `SKILL.md` directly from `skills/<category>/<skill-name>/SKILL.md` in the mounted repo.
2. `registry.json` (and `registry.manifest.json`/`skills/registries/`) still document each skill's entry points, shared files, and references for discovery/dependency-mapping purposes.
3. A skill that needs to run a compiled entry point does so via `skills/_shared/resolve.sh <skill-name>`, which resolves to `stock-api/bin/<skill-name>.js` in the local checkout — falling back to a shallow `git clone` into `/tmp/sm-clone` only if no local checkout is mounted (see `resolve.sh` for the exact fallback chain).

**To update a skill:** Edit the files in this repo. Changes are live on the
next invocation from any session with the repo mounted — no build/publish
step required.

**To add a new skill:**

1. Create `skills/<category>/<skill-name>/SKILL.md` — `<category>` is
   `equity-research/`, `tooling/`, or `development/` (see below).
2. Add scripts, references, assets as needed.
3. Add an entry to `registry.json` (and, if it should also show up in
   `skills/registries/DEPENDENCIES.md`, to `registry.manifest.json`, then run
   `yarn registries:generate`).
4. Done.

## Directory structure

Skills are organized into three categories. This tree is generated from
`find skills -name SKILL.md` — if it drifts from the actual directory list,
regenerate it rather than hand-editing entries one at a time.

```
skills/
├── README.md                       # this file
├── registry.json                   # skill name → file paths + aliases map (skill discovery/dependency-mapping)
├── registry.manifest.json          # hand-maintained source for skills/registries/DEPENDENCIES.md
├── registries/                     # generated: DEPENDENCIES.md, workflow-dependencies.json (yarn registries:generate)
├── _shared/                        # shared across all skills (single source of truth)
│   ├── conventions.md              # mandatory skill/job conventions — data layer, API docs, deterministic execution
│   ├── data-verification.md
│   ├── income-statement-signals.md
│   └── pdf-design-guide.md          # institutional palette/typography spec (implemented by stock-api/src/utils/pdfUtils.js)
├── equity-research/                # company/sector research skills (51)
│   ├── stock-documents-fetcher/    # CORE — fetches Stockscans documents (Annual Report/PPT/Result/Transcript)
│   ├── concall-analysis/
│   ├── forensic-accounting/
│   ├── equity-research-deepdive/
│   ├── equity-research-extraction/
│   ├── equity-research-dashboard/
│   ├── equity-research-master/
│   ├── growth-triggers-1pager/       # deprecated → rerating-catalysts
│   ├── rerating-catalysts/
│   ├── fundamental-shift-scanner/    # deprecated → rerating-catalysts
│   ├── management-credibility-tracker/
│   ├── peer-comparison/
│   ├── market-share-analysis/
│   ├── sector-research-deepdive/
│   ├── value-chain-analysis/
│   ├── drhp-ipo-analysis/
│   ├── annual-report-analysis/
│   ├── quarterly-result-analysis/
│   ├── quarterly-result-extractor/
│   ├── consecutive-filings-diff/
│   ├── financial-model/
│   ├── pre-pead-scanner/
│   ├── pead-surprise-ranker/
│   ├── forward-guidance-extractor/
│   ├── guidance-document-extractor/
│   ├── guidance-document-fetcher/    # deprecated → guidance-document-extractor
│   ├── guidance-ppt-fallback/        # deprecated → guidance-document-extractor
│   ├── guidance-relevance-filter/    # deprecated → guidance-document-extractor
│   ├── investment-thesis-engine/
│   ├── watchlist-catalyst-scanner/
│   ├── watchlist-insights/
│   ├── watchlist-sync/
│   ├── insight-validation/
│   ├── gainers-signal/
│   ├── volume-rocketing/
│   ├── announcement-insights/
│   ├── announcement-info-classifier/
│   ├── announcement-keyword-explorer/
│   ├── announcement-taxonomy/
│   ├── document-preprocessor/
│   ├── post-close-scan-insights/
│   ├── transcript-availability-scanner/
│   ├── stage2-catalyst-analysis/
│   ├── stock-report/
│   ├── monthly-sales-tracker/
│   ├── monthly-updates-tracker/
│   ├── order-book-tracker/
│   ├── order-book-tracker-workspace/
│   ├── ipo-subscription-ranker/
│   ├── tweet-signals/
│   └── tweet-investor-playbook/
├── tooling/                         # meta-skills that operate on this repo itself
│   ├── find-skills/
│   ├── skill-manager/
│   ├── review-proposals/
│   ├── cowork-task-architect/
│   ├── conversation-capture/
│   ├── concept-transcript-integrator/
│   ├── token-usage-analyzer/
│   ├── render-pdf/
│   ├── output-dto-standard/         # a written standard, not an invocable skill
│   ├── ask-soic/                    # lookup & answer tool for SOIC teaching corpus
│   ├── ask-anil-lamba/              # lookup & answer tool for Dr. Anil Lamba corpus
│   └── ask-expert/                  # multi-expert orchestrator (Anil Lamba + SOIC)
└── development/                     # generic engineering-practice skills (Cursor/Claude Code, not Claude Web)
    ├── api-design/
    ├── api-documentation/
    ├── code-refactoring/
    ├── dead-code-scanner/
    ├── documentation-update/
    ├── file-organization/
    ├── frontend-design/
    ├── frontend-patterns/
    ├── jest-react-testing/
    ├── jira/
    ├── mongodb/
    ├── nextjs-best-practices/
    ├── nodejs-backend-patterns/
    ├── tailwind-design-system/
    ├── daisyui/
    └── vercel-react-best-practices/
```

## Script caching (/tmp)

Python scripts are cached to `/tmp/` at the start of each Claude session:

- Scripts persist within a session (no re-fetch on each skill call)
- Scripts are re-fetched at the start of a new session
- `fetch_announcements.py` imports from `fetch_documents.py` — both must be in `/tmp/` together

## Shared files

`_shared/conventions.md` and the shared PDF palette/helpers were previously duplicated inside each skill's own `_shared/` directory. After the migration, `conventions.md` lives in `skills/_shared/`; the PDF helpers were later ported from Python/ReportLab to `stock-api/src/utils/pdfUtils.js` (puppeteer-based HTML rendering — see `skills/_shared/pdf-design-guide.md` for the palette spec). Skills reference them via their absolute or relative paths.

**Do not edit the per-skill `_shared/` copies** — they are legacy and will be removed in a future cleanup pass. Edit the root `_shared/` files only.

## Authtoken for Stockscans

Scripts that call the Stockscans API need a JWT authtoken. They look for it at:

1. `--authtoken-file` CLI arg
2. `STOCKSCANS_AUTHTOKEN` env var
3. `/mnt/project/Stockscans_authtoken` (Claude project file — default)
4. `/mnt/user-data/uploads/Stockscans_authtoken`
5. `~/.stockscans_authtoken`

When the token expires, refresh it from stockscans.in (DevTools → Application → Cookies → `authtoken`) and update the project file.
