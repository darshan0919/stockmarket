# x-timeline-capture

> Newer, unattended version: see `../x-timeline-capture-extension/` (popup: handles + date window).

Browser-side capture of an X account's posts, replies, quote tweets and long-form notes/articles
into JSON, for the `x-posts` KB collection that `ask-expert` searches.

1. Open https://x.com/<any handle>/with_replies in Chrome (logged in).
2. Run `capture.js` (via Claude in Chrome's `javascript_tool`, or paste in DevTools). Edit `HANDLES` / `SINCE` first.
3. Files `x-capture-<handle>-<date>.json` land in `~/Downloads`.
4. `yarn x-posts:import --dir ~/Downloads` (idempotent; dedupes by handle + thread root).
5. `yarn ask-expert:search --query "..." --expert auto` now also searches the followed X accounts.

Why this instead of `screener-api/.../twitterGraphql.js` (the dashboard Tweet Downloader): that path needs
`TWITTER_AUTH_TOKEN` / `TWITTER_CSRF_TOKEN` / query ids in `.env`, uses the posts-only `UserTweets` operation (no replies),
and its query ids go stale. This capture reads live ids from X's bundle and never touches your tokens.

Limits: X rate-limits to ~25-30 pages per ~15 min (the script sleeps and resumes); the timeline API only reaches
back so far for very prolific accounts; images/charts are stored as URLs, not OCR'd; X's ToS prohibit automated
scraping outside its paid API — personal use, keep the pacing.
