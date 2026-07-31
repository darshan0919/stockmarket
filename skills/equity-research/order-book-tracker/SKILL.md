---
name: order-book-tracker
description: Fetch and report a company's current unexecuted order book — the total declared at its latest concall, plus every order win announced since, with order value, product units (MW/Km/MTPA/kWh), and execution start/end dates. Use this whenever the user asks about order book, order backlog, order inflow, order wins, new orders bagged, L1 status, book-to-bill, revenue visibility, or "how much work does X have in hand" — for one company or a list. Also use it when the user asks to refresh, update, or sync order book data for the watchlist, or asks which companies won orders recently. Trigger even when the user names only a ticker and says something loose like "what's their pipeline" or "how big is their backlog", since order book is the standard way that question is answered for EPC, defence, capital goods, railways, and infrastructure companies.
---

# Order Book Tracker

Answer "what is company X's unexecuted order book right now, and what has it won since it last told us" — with the arithmetic shown, and every figure traceable to a filing.

## The model

An order book is a running balance, and this skill maintains it as one:

```
current unexecuted order book
  = the total the company declared at its LATEST concall     (the base)
  + every order win it has announced SINCE that concall      (the deltas)
```

The base resets at every concall rather than accumulating forever, because a
fresh concall figure already reflects the wins that preceded it. Adding old
announcements on top of a new base would double-count them. Deltas are only
ever applied from the base quarter's end date forward, and that boundary is
enforced by a stored watermark, not by remembering to be careful.

What this deliberately does not do is execution burn-down. Companies report
the order book net of work already executed, so the base is already a _net_
figure; the deltas are gross additions on top of it. Between concalls the
running total therefore drifts slightly high, because revenue booked in the
interim isn't subtracted. Say so when it matters rather than implying the
number is exact to the rupee.

## Getting the data

Everything deterministic is already scripted. Run the script; don't re-derive
its work by hand.

**One company:**

```bash
node packages/jobs-runtime/scripts/orderbook/getCompanyOrderBook.js NSE:TICKER
```

**Several companies, or the whole Radar watchlist:**

```bash
yarn order-book-sync --companies NSE:RVNL,NSE:NCC   # specific names
yarn order-book-sync                                # all of Radar
```

Exit code 0 means fully resolved. Exit code 2 means it worked but left
something for you to judge — read on. Any other non-zero code is a real
error (bad ticker, auth, network), so surface it rather than working around
it.

The whole pipeline is cache-first: concall text, each filing's PDF text, each
extraction verdict and the running total are all stored permanently. Re-running
for a company with nothing new costs zero network calls. This matters because
Stockscans' concall-notes endpoint is capped at 600 calls/month across the
account, so never loop over companies calling it directly — always go through
these scripts.

## What comes back

```jsonc
{
  "companyId": "NSE:RVNL",
  "ok": true,
  "base": { "valueCr": 99262, "sourceQuarter": "202603", "label": "Order Book" },
  "cumulative": {
    "valueCr": 105084.51,
    "quantities": [
      { "unit": "Km", "value": 385 },
      { "unit": "MTPA", "value": 10 },
    ],
    "executionWindow": {
      "earliestStart": "2026-04-28",
      "latestEnd": "2029-12-20",
      "withTimeline": 6,
      "withoutTimeline": 1,
    },
  },
  "newlyAppliedAnnouncements": [
    /* wins applied this run */
  ],
  "healedFromFallback": [
    /* previously-parked items now readable */
  ],
  "pendingLlmFallback": [
    /* needs your judgment — see below */
  ],
}
```

`quantities` are kept in separate per-unit buckets and are never summed across
units, because 385 Km and 10 MTPA share no denominator. Treat the rupee figure
as the headline and the quantities as colour on what the money buys.

`executionWindow.withoutTimeline` is the honest part of the timeline: it counts
wins whose filing never stated a duration. A window covering 6 of 7 wins is a
different claim from one covering 2 of 7, so report the coverage alongside the
dates.

## Resolving what the scripts could not

Two kinds of gaps reach you, and they need opposite responses.

**`reason: "noOrderBookDisclosed"` — do nothing.** The company's concall notes
contain no order-book or backlog bullet at all. That is an answer, not a
failure: order book is an EPC/defence/capital-goods concept, and an IT services
firm, a lender or a marketplace will never report one. Say the company doesn't
disclose one and move on. Don't hunt for a number that doesn't exist.

**`needsLlmFallback` / `pendingLlmFallback` — this is your job.** The
deterministic tiers read most filings, and what's left is genuinely ambiguous
in a way that needs judgment. Resolve each one and record it, so the same
question is never asked twice.

For a _base_ that needs help, the payload hands you the order-book bullets
already extracted from the concall notes. Pick the single company-wide
outstanding total — not a segment, JV, product line, guidance figure, or a
ratio like "2x annual revenue". If no such total is stated, that's a legitimate
`null`. Then persist it:

```js
const {
  recordLlmResolution,
} = require('./packages/jobs-runtime/scripts/orderbook/extractOrderBook');
recordLlmResolution('NSE:WABAG', '202603', {
  valueCr: 17200,
  label: 'Liquidity & Backlog',
  reasoning: 'company-wide order backlog',
});
```

If the miss was caused by a recurring phrasing — a segment word the classifier
mistook for a company total — teach the pattern library so the regex handles it
next time without you:

```bash
node packages/jobs-runtime/scripts/orderbook/extractOrderBook.js --learn-segment "<keyword>"
```

For an _announcement_ that needs help, the filing's PDF text is already cached
at `data/cache/announcement-pdf-text/<companyId>/<ssUrl>.json` — read that
rather than re-downloading. Then:

```js
const {
  recordAnnouncementResolution,
} = require('./packages/jobs-runtime/scripts/orderbook/getCompanyOrderBook');
recordAnnouncementResolution('NSE:RVNL', '<ssUrl>', '2026-06-20', {
  deltaCr: 2977,
  quantities: [{ unit: 'MTPA', value: 10 }],
  timeline: {
    startDate: '2026-06-20',
    endDate: '2029-12-20',
    durationMonths: 42,
    basis: 'duration-from-filing-date',
  },
  reasoning: 'value stated in Annexure A row (g)',
});
```

Both calls are permanent and idempotent — the resolution is cached, folded into
the running total, and never re-asked.

### Two traps worth knowing

**Period-aggregate filings.** Some companies (NCC is the clearest case) file a
single monthly letter — "Order(s) received during June 2026" — stating a total
_and_ its constituent orders. Adding both the total and its components would
overcount badly. The extractor detects this when the smaller figures sum to the
largest and marks the record `isAggregate` with `components` listed. If you're
resolving such a filing by hand, record the stated total only.

**GST.** Filings often quote the value "including GST @ 18%", and occasionally
quote both. Order book figures on concalls are usually ex-GST, so prefer the
ex-GST figure when both appear, and note the basis in your `reasoning`.

## Storing what you found

The scripts already write the durable facts to the database — each order win as
an `order-win` event and each concall-declared figure as an
`order-book-declared` event, both in the `events` collection, keyed by their
source document so a re-run updates in place instead of duplicating. You don't
need to write those yourself.

What you should add, when you've produced an actual briefing, is the briefing
itself as a report DTO — so the analysis is retrievable later rather than
living only in a chat log:

```js
const db = require('./packages/jobs-runtime/lib/db');
const { buildCompanyContext } = require('./packages/jobs-runtime/lib/companyContext');

const ctx = buildCompanyContext('NSE:RVNL'); // read context BEFORE writing
db.saveReport({
  type: 'order-book',
  date: '2026-07-31',
  companyId: 'NSE:RVNL',
  creator: 'order-book-tracker',
  summary: 'Order book ₹1,05,085 Cr, +5,823 Cr from 7 wins since Q4FY26 concall',
  contextUsed: ctx.availableIds,
  orderBook: {
    /* the JSON DTO you reported from */
  },
});
```

Every record carries the standard envelope (`id`, `creationTime`,
`modifiedTime`, `creator`, `companyId`, `date`, `type`); `db.js` enforces it.
Write only through `db.js` helpers — never edit files under `data/` directly —
and never delete anything in a write path.

Finish every run with:

```bash
node packages/jobs-runtime/scripts/data.js push
```

## Reporting

Lead with the number the user asked for. Then show the arithmetic, because an
order book figure that can't be traced back to a filing isn't worth much.

For a single company:

```markdown
## NSE:RVNL — unexecuted order book ₹1,05,085 Cr

Declared ₹99,262 Cr at the Q4FY26 (Mar-26) concall, plus ₹5,823 Cr across
7 order wins announced since — a 5.9% addition in four months.

| Date       | Order                         | Value (₹ Cr) | Units   | Execution by |
| ---------- | ----------------------------- | ------------ | ------- | ------------ |
| 2026-06-20 | NMDC Vizag capacity expansion | 2,977        | 10 MTPA | 2029-12-20   |
| 2026-06-17 | ...                           | 967.9        | 385 Km  | 2029-06-17   |

**Execution window:** Apr-2026 → Dec-2029, on 6 of 7 wins (one filing stated
no duration).

**Caveats:** the running total doesn't subtract revenue executed since the
Mar-26 concall, so it reads slightly high; the next concall will reset it.
```

For several companies, lead with a comparison table sorted by order book size,
and include a book-to-bill multiple where you have revenue — an absolute order
book means little without knowing how many years of work it represents. Then
give a short per-company note only where something is actually notable.

Always state explicitly:

- which companies were **not applicable** (no order book disclosed), so their
  absence doesn't read as a data gap
- anything still **unresolved**, with why
- how **stale** the base is — a book anchored to a concall two quarters old
  with no filings since deserves a flag, not a confident headline

End with a "Files touched" section listing every file created or modified, read
from `db.touchedFiles()` and the `data:push` output rather than from memory.

## When the answer is "no data"

Three distinct outcomes, worth distinguishing plainly for the user:

| Outcome                            | What it means                                                               |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `noOrderBookDisclosed`             | Company doesn't report an order book. Settled; not a gap.                   |
| `no Transcript with hasNotes:true` | Stockscans hasn't annotated a transcript yet. Retry after the next concall. |
| `needsLlmFallback`                 | An order book exists but no clean total was stated. Resolve it by judgment. |

Reporting all three as "no data" would be misleading — the first is a property
of the business, the second is a timing artifact, the third is work to do.
