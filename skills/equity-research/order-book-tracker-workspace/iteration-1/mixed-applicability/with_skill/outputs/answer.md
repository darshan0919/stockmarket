# Order book — NSE:POWERMECH and NSE:PERSISTENT

Only one of the two names has an order book to report. Power Mech is an EPC
contractor and discloses one; Persistent Systems is an IT services firm and
does not — that's a property of the business, not a hole in the data.

| Company        | Unexecuted order book | Base (concall)          | Added since | Status                   |
| -------------- | --------------------- | ----------------------- | ----------- | ------------------------ |
| NSE:POWERMECH  | **₹17,384 Cr**        | ₹15,898 Cr (Q4FY26)     | +₹1,486 Cr  | Resolved                 |
| NSE:PERSISTENT | n/a                   | —                       | —           | Doesn't disclose one      |

---

## NSE:POWERMECH — unexecuted order book ₹17,384 Cr

Power Mech declared a total order backlog of **₹15,898 Cr** at its Q4FY26
(Mar-26) concall, up 10.5% YoY. On top of that it has announced **5 order wins
worth ₹1,485.82 Cr** since the quarter closed — a 9.3% addition in roughly
three months.

```
15,898.00  base declared at Q4FY26 concall
+ 1,485.82  five wins announced since 31-Mar-2026
-----------
 17,383.82  current unexecuted order book (₹ Cr)
```

| Date       | Order                                                                | Value (₹ Cr) | Units   | Execution by |
| ---------- | -------------------------------------------------------------------- | ------------ | ------- | ------------ |
| 2026-06-20 | JSW Thermal Energy — civil & structural, BTG area, 2x800 MW thermal    | 1,008.90     | —       | 2029-06-20   |
| 2026-06-03 | Adani Infrastructure Management Services — KPI/O&M services            | 66.26        | —       | not stated   |
| 2026-04-27 | South Western Railway — Vande Bharat sleeper depot, Thanisandra        | 5.00         | —       | 2028-10-27   |
| 2026-04-10 | Maha Mumbai Metro Operation Corp — metro O&M                           | 296.44       | 19.54 Km | not stated  |
| 2026-04-01 | Hindustan Zinc — comprehensive O&M                                     | 109.22       | 91.5 MW | not stated   |

**Execution window:** Apr-2026 → Jun-2029, but stated on only **2 of the 5**
wins. Three filings gave no duration, so treat that window as indicative
rather than as the shape of the whole ₹1,486 Cr.

**What the inflow mix says.** The single JSW Thermal order is 68% of everything
won since the concall, so the quarter's inflow is concentrated in one thermal
BTG contract. The remaining four are smaller O&M and railway-infrastructure
jobs. Worth noting against the FY26 backdrop the company described on the
concall: inflow of ₹7,210 Cr came in well short of its ₹10,000 Cr target,
largely because of a ₹1,563 Cr BESS cancellation, and the backlog still grew
10.5%. Management guided to 21% FY27 revenue growth off this base.

**Caveats.**

- The running total does not subtract revenue executed since the Mar-26
  concall. The base is a net figure, the five wins are gross additions on top,
  so ₹17,384 Cr reads slightly high. The next concall resets it.
- Base is one quarter old (Mar-26), which is current, not stale.
- All five extractions carry `medium` confidence; each traces to a specific
  Reg-30 filing PDF (`ssUrl` recorded in `result.json`).
- No book-to-bill multiple is quoted here because revenue isn't in this
  pipeline's data — quoting one would mean inventing the denominator.

## NSE:PERSISTENT — no order book disclosed

Persistent's latest concall (Q1FY27, quarter `202606`) contains no order-book
or backlog bullet at all. Order book is an EPC / defence / capital-goods
disclosure; IT services companies report metrics like TCV, ACV, and revenue
growth instead. This is a settled answer — not a fetch that failed and not
something to retry.

## Resolution notes

One item needed judgment and is now permanently recorded, so it won't be asked
again. Power Mech's concall base initially came back as `needsLlmFallback`:
two bullets in the notes both stated the same company-wide figure of
₹15,898 Cr. I recorded that as the base for quarter `202603` via
`recordLlmResolution`. No segment/JV/guidance figure was involved, so no
pattern was taught to the classifier.

Nothing is left unresolved: `pendingLlmFallback` is empty for both companies.

## Files touched

From `db.touchedFiles()` and the `data push` manifest:

- `data/companies.json`
- `data/reports.json`
- `data/reports/rpt_order-book-tracker_NSE:POWERMECH_2026-07-31_f16ebb2f.json`
- `data/cache/order-book-ledger/NSE:POWERMECH.json`
- `data/cache/concall-notes/NSE:POWERMECH/202603.json`
- `data/cache/announcement-pdf-text/NSE:POWERMECH/` — 5 filing texts
- `data/cache/order-announcements/NSE:POWERMECH/` — 18 announcement records
- `data/events/` — 1 `order-book-declared` + 5 `order-win` events

`node packages/jobs-runtime/scripts/data.js push` finished clean:
`uploaded=231 merged=5 skipped=662`, no errors. The push also carried
pre-existing `.local-conflict.*` files from earlier unrelated runs (concall
extractor, `tasks.json`); those aren't from this run.
