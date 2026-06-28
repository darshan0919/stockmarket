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
  cowork task architect, announcement keyword explorer — or references any
  of these skills by name or alias. Fetches the LATEST version of the skill
  from GitHub and executes it with the user's parameters. Always use this
  skill even when the user names a skill directly — it ensures they get the
  most current version from the repo.
---

# GitHub Skill Invoker

Single installed meta-skill that dynamically fetches and executes any skill
from the stockmarket monorepo on GitHub. Edit skills in GitHub → instantly
live in Claude Web on the next invocation. No reinstall required.

## Registry URL

```
https://raw.githubusercontent.com/darshan0919/stockmarket/main/claude-skills/registry.json
```

> **Before first use:** Replace `YOUR_GITHUB_USER` and `YOUR_MONOREPO` in
> this URL with your actual GitHub username and repo name. The same
> base_url is stored in registry.json — update it there too.

## Execution protocol

### Step 1 — Parse the request

Extract from the user's message:
- **Skill name** (explicit or inferred from context/aliases)
- **Ticker / params** (e.g. `NSE:PARACABLES`, branch override, doc types)
- **Branch** (default: `main`; user can say "use branch dev" to override)

### Step 2 — Fetch the registry

```
web_fetch: https://raw.githubusercontent.com/darshan0919/stockmarket/main/claude-skills/registry.json
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

### Step 6 — Cache scripts to /tmp

For each path in the skill's `scripts` array:

```bash
# Check cache first (scripts persist for the session)
[ -f /tmp/<filename> ] || \
  curl -fsSL "{base_url}/{script_path}" -o /tmp/<filename>
```

Do this for ALL scripts listed before starting execution, not lazily. The
fetch_documents.py + fetch_announcements.py pair is almost always needed and
should always be cached together when either appears in the scripts array.

**fetch_announcements.py depends on fetch_documents.py** (imports from it via
`sys.path.insert(0, Path(__file__).resolve().parent)`). Both must be in
`/tmp/` for the import to work.

### Step 7 — Fetch reference files (lazy — only when skill instructs)

Reference files are large context docs. Do NOT pre-fetch all of them. Instead,
fetch each reference file only when the SKILL.md instructs you to open/read it:

```
web_fetch: {base_url}/{reference_path}
```

### Step 8 — Execute the skill

Follow the SKILL.md instructions exactly, with:
- All `/tmp/<script>` paths substituted where the skill says to run a script
- The user's ticker/params passed through
- Shared file content already in context (conventions, pdf_utils)

## Script path substitution table

When executing a skill, paths are resolved as follows:

| What SKILL.md says | What to actually run |
|---|---|
| `python3 /tmp/fetch_documents.py` | Already correct — script was cached to /tmp in Step 6 |
| `python3 /tmp/fetch_announcements.py` | Already correct |
| `python3 /tmp/generate_concall_pdf.py` | Already correct |
| Any `python3 /tmp/<script>.py` | Already correct |

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
| Script import error in /tmp | Both fetch_documents.py and fetch_announcements.py must be in /tmp together — re-cache both |
| Auth token missing for Stockscans scripts | The scripts look for `/mnt/project/Stockscans_authtoken` — prompt user to ensure it's present |

## Private repo handling

If the monorepo is private, raw GitHub URLs will return 404.
Options (tell user to pick one):

1. **Recommended**: Make `claude-skills/` a separate public repo or GitHub Pages site.
   Then update `base_url` in registry.json to point to the public URL.
2. **Alternative**: Set up a thin read-only proxy (Cloudflare Worker) that injects
   the GitHub token server-side. Point `base_url` to the proxy URL.
3. **Local fallback**: For sessions where GitHub is unreachable, skills can be
   invoked directly from `/mnt/skills/user/` if still installed there.

## Important: no skill should be installed locally except this one

Once migration is complete:
- Uninstall all `.skill` files from Claude except `github-skill-invoker`
- All skill logic lives in GitHub; this file is the only local entry point
- To add a new skill: add folder to `claude-skills/` in GitHub + entry in `registry.json`
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
