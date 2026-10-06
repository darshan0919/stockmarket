# X Timeline Capture (Chrome extension → stockmarket KB)

Captures posts, replies, quotes, long posts and articles of followed X accounts from **your logged-in Chrome**
(replays X's own web GraphQL, same-origin; no API keys, no tokens stored) and writes them **straight into the repo KB**.

## One-time install

1. On the Mac: `yarn setup` already does this (or run `yarn x-capture:install-host`); manual form: `node tools/x-timeline-capture-extension/native-host/install.js` (registers the native host `com.stockmarket.x_kb`; `--browser brave|edge|chromium` for others, `--print` to dry-run).
2. `chrome://extensions` → Developer mode → remove any older copy → **Load unpacked** → this folder. (The manifest `key` pins the id to `okbgiakbbchmpifkhdocihneopfginjf`, which the host allows.)
3. Be logged in to x.com in that Chrome.

## Use

- **Users**: multi-select checklist. Selection is saved to `data/x-experts.json` on every change, so it is restored on every load. "+ add" registers a new account.
- **Interval**: 1 week … 1 year … everything available. The range always ends **today**.
- **Start**: only the part of the interval _not already cached_ is fetched.
- **Auto-refresh** (checkbox): once a day, for the selected users, fetches only new posts since the last capture (≈1–2 pages/user). Needs Chrome open + logged in + host installed.

## What is captured (three streams per user = the profile tabs)
1. **Posts & replies** (incl. quotes, long posts) — `UserRepliesTimeline`
2. **Reposts** (`/reposts` tab) — `UserRepostsTimeline`; stored as `repost` docs (text of the original, labelled with its author)
3. **Articles** (`/articles` tab) — `UserArticlesTweets`; always fetched in full (few), full text indexed

Each stream has its own cached range. Stored counts (posts / replies / reposts / articles) show per user in the popup.

## Nothing waits in the browser
On **Pause**, on an **X rate limit**, and on an **error / login-needed** stop, everything fetched so far is written to the KB and the cache range is advanced as far as it is contiguous. A later run continues from there.

## Cache semantics

Per user the KB stores one contiguous captured range `coverage {fromMs,toMs,exhausted,olderCursor}` in `data/x-experts.json`.

- Interval already inside coverage → nothing fetched.
- Newer than coverage → "new" pass (1 h overlap).
- Older than coverage → "older" pass, resumed from the saved cursor.
- A gap would break contiguity, so a stale user gets the new pass first (honest, slower).
  Raw rows are kept in `data/cache/x-posts-raw/<handle>.jsonl` so threads/reply context rebuild across runs; docs go to the `x-posts` collection with stable ids (re-runs never duplicate). `ask-expert` reads the experts from the same registry.

## Limits / fallbacks

- X rate limit ≈26 pages/15 min: the job pauses and resumes itself (service-worker alarms); keep Chrome open.
- Host missing → popup warns; rows download as JSON instead (`yarn x-posts:import --dir ~/Downloads` ingests them).
- Do not run this and `tools/x-timeline-capture` at the same time (shared rate limit).

## Tests

`node --test tools/x-timeline-capture-extension/tests/core.test.js` and `cd packages/jobs-runtime && npx jest test/xCaptureBridge.test.js`.

## Verify button

Verify audits what the saved ranges *claim* against X and the KB. It is refused while a capture runs. Per user and per stream that has coverage (never-captured streams are skipped) it:

- re-fetches the newest page and checks each tweet exists in the KB, healing missing rows (plus reply parents);
- probes the older edge with the stored cursor; a dead cursor is dropped and `toMs` shrinks to the last confirmed row;
- checks an "exhausted" claim against X's `statuses_count` when X returns it (silently skipped when absent) and drops the claim if the KB holds far fewer posts.

Result is stored as `verify:{at,state}` in coverage (popup shows ✓ verified / ⚠ check). Cost is ~5 requests per user; if X rate-limits, Verify reports "Rate-limited, try later". Nothing is deleted; a shrunk range just means the next Start re-walks the gap.
