# Claude Skills Registry

All Claude AI skills for the stockmarket monorepo, managed as version-controlled files.

## How it works

1. **`github-skill-invoker`** is the only skill installed locally in Claude Web
2. It reads `registry.json` from this directory at runtime
3. Fetches the target skill's `SKILL.md` + support files from GitHub raw URLs
4. Executes the skill with user-provided parameters

**To update a skill:** Edit the files in this repo → commit → push. Changes are live on the next Claude invocation. No reinstall needed.

**To add a new skill:**

1. Create `skills/<category>/<skill-name>/SKILL.md` — `<category>` is
   `equity-research/`, `tooling/`, or `development/` (see below).
2. Add scripts, references, assets as needed.
3. Add an entry to `registry.json` (and, if it should also show up in
   `skills/registries/DEPENDENCIES.md`, to `registry.manifest.json`, then run
   `yarn registries:generate`).
4. Done — the invoker will find it automatically.

## Directory structure

Skills are organized into three categories. This tree is generated from
`find skills -name SKILL.md` — if it drifts from the actual directory list,
regenerate it rather than hand-editing entries one at a time.

```
skills/
├── README.md                       # this file
├── registry.json                   # skill name → file paths + aliases map (read by github-skill-invoker at runtime)
├── registry.manifest.json          # hand-maintained source for skills/registries/DEPENDENCIES.md
├── registries/                     # generated: DEPENDENCIES.md, workflow-dependencies.json (yarn registries:generate)
├── _shared/                        # shared across all skills (single source of truth)
│   ├── conventions.md              # mandatory skill/job conventions — data layer, API docs, deterministic execution
│   ├── data-verification.md
│   ├── income-statement-signals.md
│   └── pdf_utils.py                # ReportLab helpers, palettes, table builder
├── equity-research/                # company/sector research skills (54)
│   ├── stock-documents-fetcher/    # CORE — fetches Stockscans documents (Annual Report/PPT/Result/Transcript)
│   ├── concall-analysis/
│   ├── concall-transcript-extractor/
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
│   ├── announcement-insights/
│   ├── announcement-keyword-explorer/
│   ├── transcript-availability-scanner/
│   ├── stage2-catalyst-analysis/
│   ├── stock-report/
│   ├── monthly-sales-tracker/
│   ├── order-book-tracker/
│   ├── tweet-signals/
│   └── tweet-investor-playbook/
├── tooling/                         # meta-skills that operate on this repo itself
│   ├── github-skill-invoker/        # the meta-skill (install this one in Claude Web)
│   ├── find-skills/
│   ├── skill-manager/
│   ├── review-proposals/
│   ├── cowork-task-architect/
│   ├── conversation-capture/
│   ├── antigravity-scheduled-tasks-sync/
│   ├── token-usage-analyzer/
│   ├── render-pdf/
│   └── output-dto-standard/         # a written standard, not an invocable skill
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

## Important: repo must be public (or use a proxy)

Claude's `web_fetch` cannot pass auth headers, so raw GitHub URLs must be publicly accessible.

**Option A (recommended):** Keep this `skills/` directory in a public repo (or a public subfolder via GitHub Pages). Your backend/frontend code can stay in a separate private repo.

**Option B:** Set up a read-only Cloudflare Worker proxy that injects a GitHub token. Point `base_url` in `registry.json` to the proxy URL.

## Updating base_url

After forking/cloning this repo, update the `base_url` in `registry.json`:

```json
{
  "base_url": "https://raw.githubusercontent.com/YOUR_USER/YOUR_REPO/main/skills"
}
```

Also update the registry URL in `github-skill-invoker/SKILL.md`.

## Script caching (/tmp)

Python scripts are cached to `/tmp/` at the start of each Claude session:

- Scripts persist within a session (no re-fetch on each skill call)
- Scripts are re-fetched at the start of a new session
- `fetch_announcements.py` imports from `fetch_documents.py` — both must be in `/tmp/` together

## Shared files

`_shared/conventions.md` and `stock-api/python/utils/pdf_utils.py` were previously duplicated inside each skill's own `_shared/` directory. After the migration, `conventions.md` lives in `skills/_shared/` and `pdf_utils.py` lives in `stock-api/python/utils/`. Skills reference them via their absolute or relative paths.

**Do not edit the per-skill `_shared/` copies** — they are legacy and will be removed in a future cleanup pass. Edit the root `_shared/` files only.

## Authtoken for Stockscans

Scripts that call the Stockscans API need a JWT authtoken. They look for it at:

1. `--authtoken-file` CLI arg
2. `STOCKSCANS_AUTHTOKEN` env var
3. `/mnt/project/Stockscans_authtoken` (Claude project file — default)
4. `/mnt/user-data/uploads/Stockscans_authtoken`
5. `~/.stockscans_authtoken`

When the token expires, refresh it from stockscans.in (DevTools → Application → Cookies → `authtoken`) and update the project file.
