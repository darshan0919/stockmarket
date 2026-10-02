# Order Metrics (book-to-bill on post-close order cards)

Order-win thesis cards in `post-close-scan-insights` carry an **ORDER** block:
book-to-bill against TTM and last-FY revenue, when the revenue lands, and — for
the top three ratios of the run — the total unexecuted order book including the
new order. Code: `packages/jobs-runtime/lib/orderMetrics.js` (pure maths),
`orderCardEnrichment.js` (orchestration), `orderBookRollup.js` (batched ledger
refresh), `keyedLock.js`, rendering in `thesisCardEmail.js` (`orderMetricsHtml`).

## Definitions

| Metric            | Formula                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TTM book-to-bill  | new order value ÷ TTM revenue                                                                                                          |
| YoY book-to-bill  | new order value ÷ last completed financial year revenue                                                                                |
| Impact schedule   | order value spread evenly per day over the filing's timeline, bucketed by fiscal quarter (Apr–Mar); first/last quarter flagged partial |
| Top-3 book ratios | (base order book + gross wins since + this order) ÷ TTM / last-FY revenue                                                              |

Revenue: `getCompanyFinancials` (Stockscans company page, consolidated, whole
₹ Cr). Very small revenue bases are flagged `lowPrecision`.

## Order status

`classifyOrderStatus` labels each filing `firm | l1 | loi | framework | indirect`.
Only **firm** orders add to totals and compete for a top-3 slot. Others still show
a ratio, greyed and tagged (IF AWARDED / IF CONVERTED / FRAMEWORK / GDV). `indirect`
covers gross-development-value "orders" (real estate), which are not contract revenue.

## Top-3 selection

Ranked by TTM book-to-bill (not rupees), firm only, floor `TOP_MIN_TTM_B2B = 0.02`
so a trivial order never uses a slot.

## Order-book ledger

Base = last concall's declared order book (already net of executed work) + gross
wins since (idempotent by filing id, `orderBookLedger.js`). **Caveat: no burn-down,
so the total drifts high until the next concall resets it**; cards note base age
(> `STALE_BASE_DAYS`). Companies with no disclosed total show no book line.
History comes from the Stockscans announcement search with
`announcementType: "Orders / Contracts"` (batched through a throwaway watchlist,
10-company cap handled by `scanAnnouncementsForCompanies`). Bucket recall is
below 100% (a missed NCC aggregate letter), so each ledger gets a **weekly
exhaustive sweep** as backstop.

## Agent-resolved items (no LLM API keys anywhere)

When code cannot decide, it reports it and the agent resolves it in-session:

1. Run `run enrich-orders <insights.json>` (dry, sends nothing).
2. `orderCards.pendingBases[]` → read `llmFallbackPrompt`, then `recordLlmResolution(...)`
   (`scripts/orderbook/extractOrderBook.js`).
3. Unreadable order value → `recordAnnouncementResolution(...)`
   (`scripts/orderbook/getCompanyOrderBook.js`).
4. Run `send-digest`; every prior result is cached.

## Concurrency

Per-company `keyedLock` around ledger mutation; per-company ledger files; no
module-level state; job name via client instance. Safe for parallel jobs.

## Persistence

Event type `order-card-metrics` (`orderBookEvents.saveOrderCardMetrics`),
idempotent id per (company, date, filing), for later D+1 return validation by
B2B bucket.

## Known limits

GST-inclusive titles are reconciled to the lower PDF figure and noted; timelines
missing from the filing show "timing not computable"; revenue is consolidated
and rounded; first-time ledgers cost concall-notes calls (600/month cap).
