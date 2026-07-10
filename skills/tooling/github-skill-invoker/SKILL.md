---
name: github-skill-invoker
description: >
  Invoke any skill from the GitHub skill registry stored in the stockmarket
  monorepo. Use this skill whenever the user asks for: concall analysis,
  forensic accounting, equity deep dive, growth triggers, peer comparison,
  stock report, sector research, DRHP / IPO analysis, quarterly results,
  market share analysis, pre-PEAD scanner, tweet investor playbook,
  watchlist catalyst scan, fundamental shift scan, management credibility
  tracker, watchlist sync, gainers signal, insight validation, equity
  extraction, equity dashboard, equity master, stock documents fetcher,
  cowork task architect, announcement keyword explorer, skill manager,
  investment thesis engine, financial model, value chain analysis,
  annual report analysis, stage 2 catalyst analysis — or references any
  of these skills by name or alias. Fetches the LATEST version of the skill
  from GitHub and executes it with the user's parameters. Always use this
  skill even when the user names a skill directly — it ensures they get the
  most current version from the repo.
---

# GitHub Skill Invoker

Single installed meta-skill that dynamically fetches and executes any skill

> **Data compliance:** any fetched skill that persists data must follow
> `docs/DATA_RULES.md` (write via `packages/jobs-runtime/lib/db.js`, record
> envelope, no deletes in write paths, finish with `scripts/data.js push`).
> If a fetched skill's instructions contradict DATA_RULES, DATA_RULES wins.
from the stockmarket monorepo on GitHub. Edit skills in GitHub → instantly
live in Claude Web on the next invocation. No reinstall required.

## Registry URL

```
https://raw.githubusercontent.com/darshan0919/stockmarket/main/skills/registry.json
```

## Execution protocol

### Step 0 — Prefer local repo over remote (always check first)

Before any `web_fetch`/`curl`/`git clone` against GitHub, check whether the
stockmarket monorepo is already available locally (mounted Cowork folder or
workspace checkout, e.g. `/Users/darshan.patel/code/personal/stockmarket`):

- If `skills/**/SKILL.md` for the resolved skill exists locally → `Read` it
  directly. Do the same for `shared` files (Step 5) and reference files
  (Step 7): resolve them under the local `skills/` tree first.
- If the skill's `mode` is `bundle` and `stock-api/dist-skills/<skill>.cjs`
  exists locally → run it from the local path; skip the curl-to-`/tmp` step.
- If `mode` is `clone` → run scripts directly from the local checkout
  (`stock-api/bin/<skill>.js`); skip the shallow `git clone` to `/tmp/sm-clone`
  entirely.
- Only fall back to the registry URL / raw.githubusercontent.com fetch /
  `git clone` when the local repo path is not mounted/available, or the local
  file is missing/unreadable. If you fall back, say so explicitly in your
  response ("local repo not found, fetching skill from GitHub").
- This local-first rule applies to every downstream skill and job invoked
  through this meta-skill, not just this file.

### Step 1 — Parse the request

Extract from the user's message:
- **Skill name** (explicit or inferred from context/aliases)
- **Ticker / params** (e.g. `NSE:PARACABLES`, branch override, doc types)
- **Branch** (default: `main`; user can say "use branch dev" to override)

### Step 2 — Fetch the registry

```
web_fetch: https://raw.githubusercontent.com/darshan0919/stockmarket/main/skills/registry.json
```

Parse the JSON. Build `base_url` from the `base_url` field in the registry
(replace `/main/` with `/<branch>/` if a branch was requested).

### Step 3 — Resolve skill

Match the user's request against `skills` keys AND each skill's `aliases`
array (case-insensitive, partial match OK).

- **Exact match** → proceed.
- **Unique fuzzy match** → confirm inline ("Using `concall-analysis` — proceeding...") then proceed.
- **Multiple matches** → list them, ask user to pick.
- **No match** → list all skills from registry keys + aliases, ask user to clarify.

### Step 4 — Fetch SKILL.md

```
web_fetch: {base_url}/{skill_entry.skill_md}
```

Read it fully into context. This is the skill's authoritative instructions.

### Step 5 — Fetch shared files (if listed in skill's "shared" array)

For each path in the skill's `shared` array:
```
web_fetch: {base_url}/{shared_path}
```

Keep file contents in context — they are referenced by the skill instructions
(conventions, pdf_utils, etc.).

### Step 6 — Resolve execution mode

Check the skill's `mode` field in the registry:

- **If `mode` is `bundle`**:
  The skill is pre-bundled in a single file. Curl it to `/tmp/`:
  ```bash
  [ -f /tmp/<skill_name>.cjs ] || \\
    curl -fsSL "{base_url}/stock-api/dist-skills/<skill_name>.cjs" -o /tmp/<skill_name>.cjs
  ```

- **If `mode` is `clone`**:
  The skill uses Puppeteer or heavy deps. Run a shallow clone into `/tmp/sm-clone` (cached per session):
  ```bash
  if [ ! -d /tmp/sm-clone ]; then
    git clone --depth 1 https://github.com/darshan0919/stockmarket.git /tmp/sm-clone
    cd /tmp/sm-clone/stock-api && npm ci
  fi
  ```

### Step 7 — Fetch reference files (lazy — only when skill instructs)

Reference files are large context docs. Do NOT pre-fetch all of them. Instead,
fetch each reference file only when the SKILL.md instructs you to open/read it:

```
web_fetch: {base_url}/{reference_path}
```

### Step 7.5 — Additional stock/sector context sources

For any invoked skill whose task involves researching or evaluating a
specific stock or sector (equity-research/* skills, thesis engine, sector
research, stock reports, etc.), pull in these two sources as additional
context on top of whatever the skill already specifies — cite them like any
other source, don't let them override primary filings/financials:

1. Stockscans DD reports: https://stockscans-dd-reports.netlify.app/
2. Drive folder (research notes/reports): https://drive.google.com/drive/folders/17jpBv_1pzmWN4qHNUKjk7L_NW33JlPHx

### Step 8 — Execute the skill

Follow the SKILL.md instructions exactly, with:
- The executed path being either `/tmp/<skill_name>.cjs` (bundle) or `/tmp/sm-clone/stock-api/bin/<skill_name>.js` (clone).
- The user's ticker/params passed through as CLI arguments.
- Shared file content already in context (conventions, pdf_utils).

### Step 9 — Track Invocation (Token Usage)

After the skill has finished executing and generating its output for the user, you MUST log the invocation by running the token usage tracker script:
```bash
/Users/darshan.patel/code/personal/stockmarket/scripts/track_invocation.py --name {skill_name} --type skill
```
(Include `--files /tmp/...` if specific files were heavily read and generated large outputs).

## Script path substitution table

All scripts are resolved according to their mode (bundle or clone).

| Entrypoint / Mode | Cached / Execution path |
|---|---|
| `dist-skills/stock-documents-fetcher.cjs` (bundle) | `/tmp/stock-documents-fetcher.cjs` |
| `dist-skills/concall-analysis.cjs` (bundle) | `/tmp/concall-analysis.cjs` |
| `dist-skills/forensic-accounting.cjs` (bundle) | `/tmp/forensic-accounting.cjs` |
| `stock-api/bin/equity-research-deepdive.js` (clone) | `/tmp/sm-clone/stock-api/bin/equity-research-deepdive.js` |
| `dist-skills/growth-triggers-1pager.cjs` (bundle) | `/tmp/growth-triggers-1pager.cjs` |
| `dist-skills/management-credibility-tracker.cjs` (bundle) | `/tmp/management-credibility-tracker.cjs` |
| `dist-skills/peer-comparison.cjs` (bundle) | `/tmp/peer-comparison.cjs` |
| `dist-skills/market-share-analysis.cjs` (bundle) | `/tmp/market-share-analysis.cjs` |
| `dist-skills/sector-research-deepdive.cjs` (bundle) | `/tmp/sector-research-deepdive.cjs` |
| `dist-skills/drhp-ipo-analysis.cjs` (bundle) | `/tmp/drhp-ipo-analysis.cjs` |
| `dist-skills/quarterly-result-analysis.cjs` (bundle) | `/tmp/quarterly-result-analysis.cjs` |
| `dist-skills/consecutive-filings-diff.cjs` (bundle) | `/tmp/consecutive-filings-diff.cjs` |
| `dist-skills/pre-pead-scanner.cjs` (bundle) | `/tmp/pre-pead-scanner.cjs` |
| `dist-skills/watchlist-catalyst-scanner.cjs` (bundle) | `/tmp/watchlist-catalyst-scanner.cjs` |
| `dist-skills/equity-research-extraction.cjs` (bundle) | `/tmp/equity-research-extraction.cjs` |
| `dist-skills/tweet-investor-playbook.cjs` (bundle) | `/tmp/tweet-investor-playbook.cjs` |
| `dist-skills/announcement-keyword-explorer.cjs` (bundle) | `/tmp/announcement-keyword-explorer.cjs` |
| `stock-api/bin/render-pdf.js` (clone) | `/tmp/sm-clone/stock-api/bin/render-pdf.js` |


## Branch override

If user says "use branch dev" or "test version" or similar:
- Replace `/main/` with `/dev/` (or the named branch) in all URLs
- Announce: "Fetching skills from branch `dev`"

## Error handling

| Error | Action |
|---|---|
| Registry fetch fails (404/timeout) | Tell user the registry URL may be wrong or repo is private. Show the URL being fetched. |
| Skill not found in registry | List all available skill names + aliases from the last successful registry fetch |
| Script curl fails | Show the URL that failed. Suggest checking if repo is public. |
| Script import error in /tmp | Re-cache both `fetch_documents.py` and `fetch_announcements.py` together — they have a mutual dependency |
| Auth token missing for Stockscans scripts | The scripts look for `/mnt/project/Stockscans_authtoken` — prompt user to ensure it's present |

## Private repo handling

If the monorepo is private, raw GitHub URLs will return 404.
Options (tell user to pick one):

1. **Recommended**: Make `skills/` a separate public repo or GitHub Pages site.
   Then update `base_url` in registry.json to point to the public URL.
2. **Alternative**: Set up a thin read-only proxy (Cloudflare Worker) that injects
   the GitHub token server-side. Point `base_url` to the proxy URL.
3. **Local fallback**: For sessions where GitHub is unreachable, skills can be
   invoked directly from the local `skills/` directory in the monorepo.

## Important: no skill should be installed locally except this one

Once migration is complete:
- Uninstall all `.skill` files from Claude except `github-skill-invoker`
- All skill logic lives in GitHub; this file is the only local entry point
- To add a new skill: add folder to `skills/` in GitHub + entry in `registry.json`
- To update a skill: edit in GitHub; no Claude reinstall needed

## Available skills (quick reference — authoritative list is registry.json)

| Skill key | Primary aliases |
|---|---|
| stock-documents-fetcher | fetch documents, fetch transcripts, get concall |
| concall-analysis | concall, earnings call analysis, transcript analysis |
| forensic-accounting | forensic, fraud check, accounting quality, piotroski |
| equity-research-deepdive | deep dive, research report, investment memo |
| growth-triggers-1pager | growth triggers, 1 pager, catalyst note |
| management-credibility-tracker | management credibility, walk the talk, credibility score |
| peer-comparison | peer comparison, compare companies, side by side |
| market-share-analysis | market share, competitive landscape, industry concentration |
| sector-research-deepdive | sector report, sector deep dive, industry analysis |
| drhp-ipo-analysis | drhp, ipo analysis, should I subscribe ipo |
| quarterly-result-analysis | quarterly results, result analysis, what changed this quarter |
| consecutive-filings-diff | diff decks, compare presentations, qoq diff |
| pre-pead-scanner | pre pead, pre results scanner, guidance ranking |
| watchlist-catalyst-scanner | catalyst scanner, scan watchlist, any catalysts today |
| fundamental-shift-scanner | fundamental shift, what changed this week, recent filings |
| equity-research-extraction | equity extraction, ar extracts, document extraction |
| equity-research-dashboard | equity dashboard, 15 tab dashboard |
| equity-research-master | equity master, full equity research, complete analysis |
| tweet-investor-playbook | tweet playbook, investor tweets, analyse tweets |
| announcement-keyword-explorer | announcement keywords, keyword explorer |
| stock-report | stock report, equity report, buy sell recommendation |
| watchlist-sync | watchlist sync, near highs sync |
| insight-validation | insight validation, validate insights |
| gainers-signal | gainers signal, top gainers, daily gainers |
| watchlist-insights | watchlist insights, daily insights |
| cowork-task-architect | cowork task, create task, schedule task |
| skill-manager | skill manager, create skill, skill creator |
| investment-thesis-engine | investment thesis, thesis engine, update thesis, should i still hold |
| financial-model | financial model, 3 year forecast, bear base bull, irr from here |
| value-chain-analysis | value chain, where does margin sit, chokepoint analysis, value migration |
| annual-report-analysis | annual report analysis, analyse this ar, governance check, kmp resignations |
| stage2-catalyst-analysis | stage 2, weinstein stage, breakout analysis, why now catalyst |
| render-pdf | render pdf, html to pdf, generate pdf from html |
| dead-code-scanner | dead code scan, unused exports, unused dependencies |

- **Files-touched manifest (docs/DATA_RULES.md §7):** end the run by listing every file created/modified — collections with record counts (db.js helper stats / `db.touchedFiles()`), plus `runs/`/`cache/`/`assets/` files (`StorageService.touchedFiles()`), plus the `data:push` `↑ <file>` lines. A run that stored data without reporting what it touched is incomplete.
