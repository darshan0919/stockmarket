# Claude Skills Registry

All Claude AI skills for the stockmarket monorepo, managed as version-controlled files.

## How it works

1. **`github-skill-invoker`** is the only skill installed locally in Claude Web
2. It reads `registry.json` from this directory at runtime
3. Fetches the target skill's `SKILL.md` + support files from GitHub raw URLs
4. Executes the skill with user-provided parameters

**To update a skill:** Edit the files in this repo → commit → push. Changes are live on the next Claude invocation. No reinstall needed.

**To add a new skill:**
1. Create `skills/<skill-name>/SKILL.md`
2. Add scripts, references, assets as needed
3. Add an entry to `registry.json`
4. Done — the invoker will find it automatically

## Directory structure

```
skills/
├── README.md                    # this file
├── registry.json                # skill name → file paths + aliases map
├── _shared/                     # shared across all skills (single source of truth)
│   ├── conventions.md           # Indian market conventions, citation format, anti-hallucination
│   └── pdf_utils.py             # ReportLab helpers, palettes, table builder
├── github-skill-invoker/
│   └── SKILL.md                 # the meta-skill (install this one in Claude)
├── stock-documents-fetcher/     # CORE — fetches Stockscans documents
│   ├── SKILL.md
│   ├── scripts/
│   │   ├── fetch_documents.py   # Annual Report / PPT / Result / Transcript
│   │   └── fetch_announcements.py  # free-text announcement search
│   └── references/
│       └── api_details.md
├── concall-analysis/
├── forensic-accounting/
├── equity-research-deepdive/
├── growth-triggers-1pager/
├── management-credibility-tracker/
├── peer-comparison/
├── market-share-analysis/
├── sector-research-deepdive/
├── drhp-ipo-analysis/
├── quarterly-result-analysis/
├── consecutive-filings-diff/
├── pre-pead-scanner/
├── watchlist-catalyst-scanner/
├── fundamental-shift-scanner/
├── equity-research-extraction/
├── equity-research-dashboard/
├── equity-research-master/
├── tweet-investor-playbook/
├── announcement-keyword-explorer/
├── stock-report/
├── watchlist-sync/
├── insight-validation/
├── gainers-signal/
├── watchlist-insights/
└── cowork-task-architect/
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

`_shared/conventions.md` and `packages/stock-api/python/utils/pdf_utils.py` were previously duplicated inside each skill's own `_shared/` directory. After the migration, `conventions.md` lives in `skills/_shared/` and `pdf_utils.py` lives in `packages/stock-api/python/utils/`. Skills reference them via their absolute or relative paths.

**Do not edit the per-skill `_shared/` copies** — they are legacy and will be removed in a future cleanup pass. Edit the root `_shared/` files only.

## Authtoken for Stockscans

Scripts that call the Stockscans API need a JWT authtoken. They look for it at:
1. `--authtoken-file` CLI arg
2. `STOCKSCANS_AUTHTOKEN` env var
3. `/mnt/project/Stockscans_authtoken` (Claude project file — default)
4. `/mnt/user-data/uploads/Stockscans_authtoken`
5. `~/.stockscans_authtoken`

When the token expires, refresh it from stockscans.in (DevTools → Application → Cookies → `authtoken`) and update the project file.
