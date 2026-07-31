# Order book: NSE:POWERMECH and NSE:PERSISTENT

Only one of the two companies actually has an order book to pull. Power Mech Projects is an EPC contractor, so it reports one; Persistent Systems is an IT services firm and does not disclose an order book or backlog at all.

## NSE:POWERMECH — ₹17,384 Cr outstanding

|                                                   |                                                       |
| ------------------------------------------------- | ----------------------------------------------------- |
| Concall-declared base (Q4 FY26, quarter `202603`) | ₹15,898 Cr                                            |
| Order wins since 31-Mar-2026                      | +₹1,485.82 Cr across 5 filings                        |
| **Current cumulative order book**                 | **₹17,383.82 Cr**                                     |
| Data current through                              | 26-Jun-2026 (announcements), 20-Jun-2026 (latest win) |

The base comes from the FY26 concall, where management stated total order backlog grew 10.5% year on year to ₹15,898 Cr. Note the context around that number: FY26 order inflow was ₹7,210 Cr against a ₹10,000 Cr target, largely because of a ₹1,563 Cr BESS cancellation — the backlog still grew, but inflow missed materially.

Order wins layered on top of that base, each read out of the filing PDF:

| Date        | Value (₹ Cr) | Quantities | Execution timeline     |
| ----------- | ------------ | ---------- | ---------------------- |
| 20-Jun-2026 | 1,008.90     | —          | 36 months, to Jun-2029 |
| 03-Jun-2026 | 66.26        | —          | not stated             |
| 27-Apr-2026 | 5.00         | —          | 30 months, to Oct-2028 |
| 10-Apr-2026 | 296.44       | 19.54 Km   | not stated             |
| 01-Apr-2026 | 109.22       | 91.5 MW    | not stated             |

Across the wins that do state a schedule, execution runs from Apr-2026 out to Jun-2029. Three of the five filings give no timeline, so treat that window as a floor rather than the full runway.

Nothing is left unresolved for this company — no filings are parked awaiting a manual or LLM read, and all five wins plus the declared backlog are persisted to the events collection.

## NSE:PERSISTENT — no order book disclosed

The pipeline checked the latest concall (quarter `202606`) and found no order-book or backlog bullet anywhere in the notes. This is recorded as a terminal answer rather than a parsing failure: order book is an EPC/defence/capital-goods concept, and an IT services company will never report one. Persistent's forward-revenue visibility is instead communicated through TCV/ACV bookings, which is a different metric and not what this pipeline tracks.

## How this was produced

Everything came from the repo's existing cache-first orchestrator, `packages/jobs-runtime/scripts/orderbook/getCompanyOrderBook.js`, run once per ticker. It resolves a concall-derived base and then adds every order-win announcement dated after that quarter, reading values out of each filing's PDF text layer.

One manual step was needed. The deterministic extractor found two candidate backlog bullets in the Power Mech concall and refused to guess between them, returning a `needsLlmFallback` prompt. Both bullets stated the same company-wide figure of ₹15,898 Cr, so I recorded that via `recordLlmResolution` and re-ran. That resolution is now cached permanently and will not be re-asked on future runs.
