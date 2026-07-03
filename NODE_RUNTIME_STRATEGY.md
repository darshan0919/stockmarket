# Node Runtime Strategy — Stay All-Node

**Owner:** Darshan · **Repo:** github.com/darshan0919/stockmarket · **Executor:** Antigravity
**Status:** Recommendation · **Companion to:** `SKILLS_WORKFLOW_PLAN.md` (§5 code-resolution) · **Drafted:** 2026-07-03

> Decision (Darshan, 2026-07-03): **do not revert to Python. Everything runs on Node.**
> This doc is the concrete route to make that safe and portable. It refines
> `SKILLS_WORKFLOW_PLAN.md` §5; where they overlap, this doc is the authority on runtime.

---

## 1. Why all-Node is the right call (short)

- Sandbox has **Node 22.22** — `node x.js` runs anywhere `python3 x.py` did. Language is not
  the blocker.
- One runtime matches the **Node backend** and the **`@stock/api`** library (DI + fixture
  tests already exist). No duplicated auth/HTTP logic.
- The only real dependency footprint is **`axios` + `puppeteer`**. `axios` bundles trivially;
  **`puppeteer` is the sole heavy/native dep, used by exactly 2 files** (`utils/pdfRenderer.js`,
  `utils/pdfUtils.js`). So "Node doesn't work on web" is really "one Chromium binary is
  awkward on web" — a contained problem, not a systemic one.

The single thing the migration lost is **self-containment** (a skill is now a package graph,
not a file). Sections 2–4 buy that back without leaving Node.

---

## 2. Portability model: bundle-first, clone-for-Chromium

Classify every skill entrypoint into one of two **modes** (declared in
`registry.manifest.json`, per `SKILLS_WORKFLOW_PLAN.md` §5e):

### Mode `bundle` (default — for ~95% of skills)
Pure-JS + `axios` code (fetchers, analyzers, HTML generators, the 4 cowork jobs).

- Build step: **esbuild** compiles each `bin/<skill>.js` → `dist-skills/<skill>.cjs`, all
  deps inlined, one self-contained file (`--bundle --platform=node --format=cjs --target=node22`).
- Portability restored: the invoker curls **one** `dist-skills/<skill>.cjs` to `/tmp` and
  runs `node /tmp/<skill>.cjs …` — identical simplicity to the old "curl one `.py`, run it".
- Bundles are **committed** and **CI-verified** (rebuild → fail if diff), so GitHub always
  serves a current, runnable artifact.

### Mode `clone` (only for PDF/Chromium skills)
Entrypoints that transitively need `puppeteer` (the report PDF generators).

- The invoker shallow-clones the repo to `/tmp/sm`, runs `npm ci` in `packages/stock-api`,
  caches for the session, then `node bin/<skill>.js`.
- Chromium (~150 MB) downloads on first install — slow but works; cache in `/tmp` for reuse.

**Decision rule:** a skill is `clone` **iff** its dependency graph reaches `pdfRenderer.js`/
`pdfUtils.js` (i.e. puppeteer). Everything else is `bundle`. Today that's ~9 report-PDF
skills on `clone`, the rest on `bundle`.

---

## 3. Solve the puppeteer asterisk (pick one, Phase 2)

Ranked; you can adopt incrementally.

| Option | What | Cost | When |
|---|---|---|---|
| **P1 — clone + cached Chromium (default now)** | Keep puppeteer; `clone` mode; cache Chromium in `/tmp` | Slow first run per session; no code change | Ship this first |
| **P2 — split render boundary (recommended target)** | Generators emit **HTML only** (bundleable); a *single* tiny `render-pdf` step turns HTML→PDF | HTML generators move to `bundle`; only one component needs Chromium | Do after P1 works |
| **P3 — swap renderer** | Replace puppeteer with a lighter engine (`playwright-core` + system Chromium, or `pdfkit`/`@react-pdf` for non-HTML layouts) | One-time rewrite of 2 files; must re-verify visual fidelity (page-1 no-clip rule) | If clone stays too slow/fragile |

The strategic move is **P2**: isolate Chromium behind one `renderHtmlToPdf(html) → pdfPath`
boundary so *all* content generation is pure-JS/bundleable and only the final render is
`clone`/native. That shrinks the "hard to port" surface from ~9 skills to **1 component**.

---

## 4. Prevent drift (the real manageability fix)

The 19 dead registry paths happened because centralized code had no reference guard. Never
again, via **generate + verify in CI**:

- `registry.manifest.json` is the **only** hand-edited source. `scripts/gen-registry.js`
  emits `registry.json`, the invoker substitution table, and the esbuild entry list.
- CI gates (all fast, offline):
  - `gen-registry.js --check` — `registry.json` matches generator output (no manual drift).
  - `verify-registry.js` — every referenced path exists **on disk and on `origin/main`**;
    **no path points at `packages/stock-api/python/**`** (migration guard).
  - `build-skills.js --check` — every `dist-skills/*.cjs` is up to date with its source.
- Pre-commit hook runs the three `--check`s so drift is caught before it lands.

This is what converts "centralized = fragile" into "centralized = safe."

---

## 5. Finish the migration — remaining Python to port

"All-Node" isn't true until these leave the execution path. Inventory (verified in repo):

| Still-Python | Used by | Port target |
|---|---|---|
| `packages/cowork-jobs/data/gainers_classifier.py` | `gainers-signal` skill (SKILL.md calls `python3`) | `cowork-jobs/lib/gainersClassifier.js` — pure computation over scanner JSON, no API; straight port |
| `packages/stock-api/python/orchestration/orchestrate.py` | `equity-research-master` | Node orchestrator that composes the already-JS fetchers/generators |
| `packages/stock-api/python/skill_manager/*.py` (10 files) | `skill-manager` skill | Port to Node, or keep `skill-manager` as an explicitly out-of-scope dev-tool (see note) |

Notes:
- `gainers_classifier.py` is the most urgent — it's a **live `python3` dependency in a daily
  scheduled task**, so the "no Python in the execution path" claim is false until it's ported.
  It's pure logic (no API), so it's a clean, well-testable port.
- `skill-manager` is a meta/dev tool (evals, packaging), not a data skill. Decide explicitly:
  port to Node for uniformity, or carve it out as "authoring tooling, Python allowed." Don't
  leave it ambiguous.
- After porting, **delete** `packages/stock-api/python/**` (or `legacy/` for one cycle) and
  remove every `python3` invocation from SKILL.md files. Add a CI grep guard: fail if any
  SKILL.md or job references `python3`.

---

## 6. Avoid ever needing dual-language again (single source of truth)

To make sure you never re-create the "two implementations, silent drift" trap:

1. **One implementation per datum/logic, behind a boundary.** API-heavy skills should *call*
   `@stock/api` (bundled) or the **backend HTTP API** — never re-implement fetch/auth. The
   backend already wraps Stockscans/NSE/BSE, so routing skills through it gives one
   implementation by construction.
2. **`@stock/api` is the canonical library**; `bin/` CLIs and `dist-skills/` bundles are
   *generated views* of it, not parallel code.
3. **If a non-Node consumer ever appears** (a future Python-only platform), do **not** port
   the logic — expose it over the boundary (CLI/HTTP) and let that consumer be a thin client.
   Parity is then automatic because there's still one implementation.
4. If parity across two real implementations is ever unavoidable, gate it with a
   **conformance suite**: `conformance/<case>/{input.json,expected.json}`, run both impls in
   CI against every case, fail on any diff (exact for deterministic JSON, tolerance for
   floats). Treat vendored copies as **generated**, never hand-edited.

---

## 7. Execution order (slots into SKILLS_WORKFLOW_PLAN phases)

1. **Add `bin/<skill>.js` entrypoints** (argv → module → JSON result). *(Plan Phase 1)*
2. **Add esbuild + `build-skills.js`; commit `dist-skills/`; classify modes** in the manifest.
   *(Plan Phase 2)*
3. **Rewrite `github-skill-invoker`** to pick `bundle` vs `clone` per manifest and cache in
   `/tmp`. *(Plan Phase 2)*
4. **Port `gainers_classifier.py` → Node**; repoint the `gainers-signal` skill; verify a live
   run. *(Plan Phase 4)*
5. **Apply P2 render boundary**; move HTML generators to `bundle`. *(Plan Phase 4/5)*
6. **Port `orchestrate.py` + decide `skill_manager`**; delete `python/**`; add the `python3`
   grep guard. *(Plan Phase 5)*
7. **Wire the three CI `--check`s + pre-commit.** *(Plan Phase 1 onward)*

### Acceptance
- A clean cloud environment (no local repo) runs **every `bundle` skill** from one
  `/tmp/*.cjs` and every `clone` skill via shallow-clone, producing non-empty outputs.
- `grep -r python3 skills/ packages/*/skills/` returns nothing.
- All three CI `--check`s green; `verify-registry.js` finds 0 missing/`python`-pointing paths.
- Chromium-dependent surface reduced to a single `render-pdf` component (post-P2).

---

## 8. Risks specific to the all-Node route

- **esbuild silently drops dynamic/computed `require`s.** Only static imports inline. Guard
  with a clean-env smoke test per bundle (`SKILLS_WORKFLOW_PLAN.md` T6), not just a local run.
- **Chromium in ephemeral sandboxes** can be slow or network-blocked. P1 mitigates with a
  `/tmp` cache; P2 shrinks the exposure to one component; keep P3 as the escape hatch.
- **Bundle staleness.** A committed `dist-skills/*.cjs` that lags its source ships old logic.
  The `build-skills.js --check` CI gate is mandatory, not optional.
- **`gainers_classifier.py` port must be output-identical** — it feeds a daily email. Capture
  golden `insights.json` from the Python version and assert the Node port reproduces it
  before repointing the schedule.
- **Bundle size / cold start.** Inlining deps makes larger files; negligible for axios-only
  skills, but re-check if a heavy dep sneaks in.
- **Native module portability (future).** If a skill ever needs a native addon beyond
  puppeteer, it inherits the same `clone`-mode constraint — prefer pure-JS libs to keep
  skills in `bundle` mode.
