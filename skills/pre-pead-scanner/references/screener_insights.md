# Screener insights — the independent cross-check

Screener.in publishes, for every company, an auto-generated **Pros/Cons "insights"** panel plus a strip of **key ratios**. This is a *second, independent* read on the same name — computed by Screener from filed financials, with no knowledge of your concall work. Used well, it sharpens a surprise call two ways: it **corroborates** a thesis you built bottom-up (raising conviction when they agree), and it **flags contradictions** worth resolving *before* you rank a name (when your projected beat collides with a Screener "poor profit growth" or "increasing debt" flag, one of you is wrong — find out which).

This is a cross-check, **not** a new source of truth. Screener's insights are backward-looking and rule-based; your concall-driven estimate is forward-looking. When they disagree, investigate — don't just average them.

## Preflight — the session-token check (do this FIRST, every run)

Screener's company page is session-authenticated. The `sessionid` cookie **expires**, and an expired session silently degrades the page to a public, thinner view — so the skill must verify auth *before* doing any work, and **halt and prompt the user** if the token is stale rather than proceeding on a degraded read.

At the start of every run, alongside the Stockscans token check:

1. Confirm `SCREENER_SESSIONID` (and `SCREENER_CSRFTOKEN`) are present in `.env`. Missing → stop, tell the user to add them.
2. Do a **live probe**: fetch one company page and run `detectAuthState({status, html})`. If it returns `authenticated:false`, the session has expired.
3. On expiry, **STOP before running the ranking prompt** and tell the user, verbatim intent:

   > "Your Screener session has expired. Log in at screener.in → DevTools → Application → Cookies → copy fresh `sessionid` (and `csrftoken`) → update `SCREENER_SESSIONID` / `SCREENER_CSRFTOKEN` in `.env`, then re-run. I've paused so we don't rank on stale/partial Screener data."

Do the same for the Stockscans token. The principle: never produce a briefing on half-authenticated data — a silent downgrade is worse than a clear "refresh your token" stop.

## Fetching and parsing

```
screener = new ScreenerClient()           // stock-api/src/clients/ScreenerClient.js
resp     = await screener.companyPageWithFallback('PGEL')   // consol→standalone fallback
insights = parseScreenerInsights(resp)     // stock-api/src/analyzers/screenerInsights.js
```

`parseScreenerInsights` returns:
- `authExpired` + `authReason` — if true, halt (see preflight); do not use the rest.
- `pros`, `cons` — the raw insight bullets.
- `insightTags` — the bullets classified into decision-relevant tags (below).
- `keyMetrics` — `stockPE`, `roce`, `roe`, `debtToEquity`, `marketCap`, `currentPrice`, `bookValue`, `dividendYield`, `highLow`.
- `ratios` — the full label→value map (for anything not in `keyMetrics`).
- `warnings` — markup-drift notices (empty Pros/Cons or ratios ⇒ Screener changed its HTML; the extractors fail soft rather than throwing).

The company slug is the NSE/BSE symbol (`PGEL`, `ARE&M`). Map from the scan's `companyId` by stripping the `NSE:`/`BSE:` prefix; on a consolidated 404 the client falls back to standalone automatically.

## The insight tags that move a surprise call

`tagInsights` classifies bullets so you weight them instead of reading prose. The ones that matter here, and how to use each:

| Tag | Bearing on the surprise decision |
|---|---|
| `good-quarter-expected` | Screener's own "expected to give a good quarter" flag — **direct corroboration** of a projected beat. Agreement with your Step-4 estimate raises conviction. |
| `poor-quarter-expected` | Screener expects a weak quarter. If *you* project a beat, this is a **contradiction to resolve** before ranking — re-check your guidance read and one-off stripping. |
| `debt-reduced` | Corroborates the **deleverage PAT lever** (Step 4, Lever 2). Independent confirmation that interest cost should fall. |
| `debt-increased` | Cuts against the deleverage lever and raises interest — discount a PAT beat that assumed lower finance cost. |
| `good-profit-growth` / `poor-profit-growth` | Trend context for whether your implied jump fits the trajectory. |
| `improving-returns` / `low-returns` | Business-quality read (ROCE/ROE direction) — quality names sustain surprises better. |
| `working-capital-stretch` | Cash-conversion red flag; a "profit" beat with deteriorating working capital is lower-quality and often reverses. |
| `promoter-pledge` / `promoter-selling` | Governance/overhang flags — a beat into promoter selling or a pledge is a lower-conviction long; note prominently. |
| `rich-valuation-flag` | Screener's own "trading at N times book / expensive" flag — reinforces the Step-6 "is the beat priced in?" read. |

## Key ratios — how they sharpen each existing step

- **`stockPE`** → cross-check against the **50D-avg-P/E** valuation read (Step 6). If Screener's current P/E is far from your 50D average, the stock has just re-rated — expectations moved; recompute whether the beat is still under-priced.
- **`debtToEquity`** → sizes the **deleverage lever** (Step 4). Low/falling D-E with a stated repayment = a credible interest-saving tailwind; high/rising D-E = the opposite.
- **`roce` / `roe`** → quality gate on the surprise; pair with the capability tier (Step 3). A high-ROCE name commissioning capacity converts operating leverage to PAT more reliably.
- **`bookValue` / `highLow` / `dividendYield`** → context for the expectations read and the "what could be wrong" (e.g. a name near its 52-week high has less room to re-rate on a beat).

## Feeding it into the rank

The Screener cross-check is a **conviction modifier**, not a new leg with its own weight — it confirms or challenges the legs you already built:
- **Agreement** (Screener `good-quarter-expected` + `debt-reduced` alongside your projected beat and deleverage lever) → nudge the composite up; the thesis has independent support.
- **Contradiction** (you project a beat but Screener flags `poor-quarter-expected` / `debt-increased` / `working-capital-stretch`) → do **not** silently proceed. Resolve it: re-examine the concall, the one-off stripping, or the consensus anchor. If unresolved, downgrade conviction and say so explicitly in "what could be wrong".
- **Governance flags** (`promoter-pledge` / `promoter-selling`) → cap the conviction regardless of how good the numbers look.

Record the Screener pros/cons, the tags, and the two or three key ratios in the deep-dive card so the reader sees the second opinion next to your own.

## What could be wrong here

- **Stale session → silent downgrade.** The single biggest risk: an expired `sessionid` returns a public, thinner page and the insights come back empty. The preflight check exists precisely to stop this — never treat empty Pros/Cons as "no flags"; treat it as "unverified" and halt.
- **Screener insights are rule-based and lagging.** "Expected to give a good quarter" is a heuristic off recent trends, not a forecast of *this* quarter. It corroborates; it doesn't override your forward estimate.
- **Markup drift.** The parser is regex-based; if `warnings` flags empty Pros/Cons or ratios, Screener changed its HTML — fix the extractor rather than trusting the empty result.
- **Consolidated vs standalone mismatch.** Make sure the Screener view matches the basis you modelled (Step 4 prefers consolidated). The client defaults to consolidated with a standalone fallback — note if it fell back.
- **Symbol-slug mismatch.** A few names use a Screener slug that differs from the NSE symbol; if the page 404s both consol and standalone, resolve the slug manually rather than dropping the cross-check.
