# Liquidity gate — the tradeability floor

This is Step 0's second half, and it is a **hard gate**, not a scoring factor. The scanner exists to surface *tradeable* earnings surprises. Two conditions make a surprise untradeable no matter how well you predict it, so any name failing either is dropped before a single concall is read:

- **50-day average traded value < ₹5 Cr** — you cannot build or exit a position without moving the price against yourself. The predicted drift gets eaten by impact cost.
- **Free float < ₹50 Cr** — with a tiny float, the post-result move is dominated by a handful of holders' decisions rather than genuine repricing of the surprise; the drift is noise, not signal, and often un-exitable.

A name failing **either** is excluded. Both thresholds are defaults and can be overridden (`--min-atv-cr`, `--min-free-float-cr`) if the user runs a large-cap-only or a deliberately small-cap screen.

## Where the numbers come from

Both are Stockscans scan columns. The runner (`resolveUniverse` in `runScan.js`, exposed via `run_scan`) resolves them defensively — Stockscans relabels columns across `ratiosType` configs, so the gate matches a value across a list of candidate aliases rather than one hardcoded label:

- **50D average traded value** — aliases include `Average Traded Value 50D`, `50D Average Traded Value`, `Traded Value SMA 50D`, and the expression fallback `Volume SMA 50D * SMA 50D`.
- **Free float** — aliases include `Free Float Market Capitalization`, `Free Float Mcap`, `Free Float`, `Non Promoter Holdings * Market Capitalization`.

If a column you need is missing, add its label to the alias arrays in `runScan.js` (`ATV_ALIASES` / `FREEFLOAT_ALIASES`) rather than editing call sites — same pattern `scan_api.md` documents for column drift.

## Units — the one thing that can silently break the gate

Stockscans is inconsistent about money units. Dedicated columns (`…Market Capitalization`, `…Value`) come in **₹ Crore** (small numbers like 5–5,000). Expression columns like `Volume SMA 50D * SMA 50D` come in **absolute rupees** (e.g. `50000000` = ₹5 Cr). Get this wrong and every pass/fail flips.

`toCrore()` normalises with a heuristic: any value above ₹1e5 is assumed absolute rupees and divided by 1e7; smaller values are treated as already-in-crore. The runner records the raw value and the assumed unit (`atvUnit`, `freeFloatUnit`) on every row so the analyst can audit. **On the first run against a new scan, eyeball two or three of these** — a name you know to be liquid showing `atvCr` of 0.0004 means the unit heuristic misfired and the threshold is off by 1e7.

## Free-float fallback

If no free-float column is present but promoter holding and market cap are, the runner estimates:

```
free float ≈ (1 − promoter holding %) × market cap
```

and flags the row `freeFloatEstimated: true`. This is a reasonable proxy (free float is everything promoters don't hold) but it ignores locked-in/pledged non-promoter blocks, so treat an estimated free-float sitting right at the ₹50 Cr line as borderline rather than a clean pass. The briefing's exclusion/inclusion note should say "(est.)" where used.

## What the gate returns

```json
{
  "companies":        [ ...liquid, tradeable names — these proceed... ],
  "excluded_illiquid":[ { "companyId": "...", "_liquidity": {"atvCr": 2.1, "freeFloatCr": 220},
                          "_exclusionReason": "illiquid — 50D avg traded value ₹2.1 Cr < ₹5 Cr" } ],
  "unresolved_liquidity": [ { "companyId": "...", "_liquidityNote": "traded-value or free-float column not found in scan output" } ],
  "liquidityGate": { "minAtvCr": 5, "minFreeFloatCr": 50 },
  "raw_total": 31
}
```

## Reporting rules

- **Never silently drop.** Every illiquid name goes into the briefing's exclusions section under an **Illiquid** sub-heading, showing its measured `atvCr` and `freeFloatCr` and which floor it failed. The reader must be able to see the universe wasn't quietly trimmed to flatter the ranking.
- **`unresolved_liquidity` is not a pass.** A name whose liquidity couldn't be measured is *not* assumed liquid. Add the ratio to the scan and re-run; if genuinely unavailable, list it as "liquidity unverified — excluded from ranked table" so a thin name can't sneak in through a missing column.
- **State the floors** used (₹5 Cr / ₹50 Cr, or whatever the user set) in the methodology callout, so the screen is reproducible.

## What could be wrong here

- A **unit misfire** (the 1e7 heuristic) is the highest-impact silent error — audit a couple of rows on every new scan.
- **50D average traded value** is a trailing average; a name can be liquid today but was thin 40 days ago (recent listing, F&O entry, index inclusion). For a name sitting near the floor, glance at recent volume before trusting the average.
- **Free-float estimate** from promoter holding overstates tradeable float when large non-promoter blocks are locked in (anchor lock-ins, strategic holders). Flag borderline estimated cases.
