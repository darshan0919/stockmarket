# IPO float-unlock watch

**Rule (AGENTS.md §12 #19, conventions §35):** every card, brief or report about a company that **listed on NSE/BSE within
the last 24 months** (mainboard _and_ SME) must show **how far the next IPO lock-in expiry is and how much it releases**.
Nothing to print for older listings.

## What is printed

One line, produced by `lockinText()` (`packages/jobs-runtime/lib/ipoLockins.js`) — the same string in email cards and reports:

```
IPO unlock: Anchor rest (90d) 10 Dec 2026 (in 37d) · 25.06 L sh (3.16% of equity, ≈₹239 Cr, +18% of tradable float) · +2 later
```

| Part                    | Meaning                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------- |
| date + `(in Nd)`        | next unlock on/after today (IST); same-date tranches merged; `today` when it is today   |
| shares / % equity / ₹   | released shares, share of post-issue capital, value at the card's market cap            |
| `+N% of tradable float` | released shares vs shares freely tradable just before (exact records only)              |
| `+N later`              | further unlock events still pending                                                     |
| `size n/a … est.`       | date-only **estimate** from the listing date (sizes unknown) — upgrade to exact (below) |
| `all expired (last …)`  | listed ≤24m ago but every tranche has already unlocked                                  |

Colour on email cards: red ≤14 days, amber ≤45, grey otherwise.

## How each surface gets it

- **Email cards** (post-close digest, gainers/volume/weekly signals, watchlist digests): automatic — both renderer entry points
  (`buildDigestHtml`, `buildScanSignalEmail`) call `attachIpoLockins` (`lib/ipoLockinStore.js`). Nothing for a skill to do.
- **Agent-written PDF/HTML reports:** run `yarn ipo-lockin show <companyId> --mcap <marketCapCr>`; print its first line in the
  header/risk strip and the full tranche timeline in the supply/overhang section. No output line → not a recent listing.

## Data

| Layer    | Where                                                                | Content                                                                     |
| -------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| exact    | `ipos` collection, `type: 'ipo-lockin'`, id `ipo-lockin_<companyId>` | tranche dates **and sizes**, derived from offer-document numbers            |
| estimate | `data/cache/ipo-lockin-estimates.json` (regenerable)                 | tranche **dates only**, every ≤24m listing in `data/cache/ipo-history.json` |

An exact record always overrides an estimate.

**Refresh (automation):** `yarn ipo-history-cache` → `yarn ipo-lockin build` (script-only; suitable for the nightly `ipo-supply-daily` slot).

**Upgrade an estimate to exact** (agent step — reading the offer document needs judgement; when the next unlock is ≤120 days away
or the company is on an ACT/WATCH card): read the RHP/prospectus "Capital Structure" pages _"Details of Promoter's contribution and
lock-in"_ and the pre-offer shareholding table, then write a seed (OS temp dir, not the repo) and run `yarn ipo-lockin save <seed.json>`:

```json
{
  "companyId": "NSE:KANOHAR",
  "ipoType": "MainBoard",
  "listingDate": "2026-09-16",
  "allotmentDate": "2026-09-11",
  "postIssueShares": 79186835,
  "ipoSharesOffered": 16704750,
  "anchorShares": 5011424,
  "mpcMonths": 18,
  "source": "RHP pp.128-131"
}
```

`ipoSharesOffered` = fresh + OFS shares. `mpcShares` defaults to 20% of post-issue capital. `mpcMonths` defaults to 18 (mainboard) /
36 (SME) — use what the RHP states (36 when the issue funds project capex). Allotment date: basis-of-allotment date (listing minus 2
trading days when unknown).

## Rules encoded (SEBI ICDR) and known limits

- Anchor: 50% of allotted anchor shares +30 days, rest +90 days from **allotment**. Vendors differ by ±1 day in how they count; this
  module adds N days literally.
- Mainboard: promoter minimum contribution (20% of post-issue capital) +18 months (36 if capex-funded); every other pre-offer holding
  — promoter excess, promoter group, pre-IPO investors — +6 months.
- SME: contribution +36 months; all other pre-offer holdings +12 months. **Secondary-source — verify against ICDR Ch. IX.**
- Not modelled: VC/AIF/FVCI holders locked 6 months from _purchase_ date (can unlock earlier), pledged shares, shares of untraceable
  holders (KANOHAR: 2,08,000), later bonus/ESOP/rights issues.
- "Unlocks" means **eligible to trade**, not forecast selling. Promoter tranches are the largest by size but rarely sold.
- `ipo-history.json` is built by `yarn ipo-history-cache` (IPOPlatform); a listing missing from it has no estimate until refreshed.
- `lib/ipoSupply.js` P4 (daily supply watch) still approximates dates from the listing date and does not use these records.
