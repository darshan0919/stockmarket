# Intraday Deal Filter (Stockscans)

Chrome extension (Manifest V3) that cleans up the **Bulk/Block Deals** table on
`stockscans.in/company/*` shareholdings pages.

## Problem

The Bulk/Block Deals table mixes two very different things:

1. Real position changes by an institution/fund.
2. Same-day intraday churn by prop desks / HFTs (e.g. arbitrage or
   market-making firms like NK Securities Research, Microcurves Trading, QE
   Securities LLP, Junomoneta Finsol, AlphaGrep Securities) who buy and sell
   on the *same day* — net effect on the free float is small-to-zero, but it
   still shows up as rows of "big money" activity, which is noise for
   fundamental/technical reads.

## Detection logic

For every row in the table:

1. Parse `shareholder`, `type` (Buy/Sell), `date`, `value` (₹, handles the
   "Cr" suffix), and `avg price`.
2. Derive `quantity = value_in_rupees / avg_price` (stockscans doesn't render
   quantity directly on this table, but it's recoverable this way — verified
   against the exact figure the site shows in its own "Quantity" tooltip).
3. Group rows by `(shareholder, date)`.
4. For every group that has at least one Buy leg and one Sell leg that day,
   compute `totalBuy`, `totalSell`, `gross = totalBuy + totalSell`,
   `net = |totalBuy - totalSell|`, `ratio = net / gross`.
5. Whether the group counts as intraday depends on a popup-configurable
   toggle:
   - **"Remove all same-day Buy+Sell traders" (default ON)** — any group with
     both a Buy and a Sell that day is treated as intraday, *regardless of
     the ratio*. This is the broadest, simplest rule: if you traded both ways
     the same day, you're an intraday trader for this purpose.
   - **Off** — falls back to the ratio test: the group counts as intraday
     only if `ratio` is at or below a configurable **threshold %** (default
     2%). This catches both a clean 1-buy/1-sell square-off (`ratio` ≈ 0) and
     lopsided-quantity churn like QE Securities LLP's buy-17.1L/sell-17.5L
     day (`ratio` ≈ 1.1%), while leaving real directional trades (large net
     change relative to gross) visible.
   - Either way, trades below 1,000 total shares (`MIN_GROSS_QTY`) are
     ignored as noise regardless of ratio.
6. Every row in a matching group is hidden (`display: none`, tagged
   `data-idf-hidden-reason="intraday-churn"`, not deleted from the DOM) and
   the shareholder is reported to the background service worker.

## The "Load All" problem, and how it's solved

Stockscans only renders the first ~10 rows of the Bulk/Block Deals table by
default; the rest of a shareholder's history (e.g. an older Buy whose
matching Sell is further down the list) only appears after the on-page "Load
All" control is used. That data is **not** fetched over the network on
click — it's already present in the page's client-side state and is just
sliced to 10 rows until expanded, so there's no API call to intercept.

`content.js` automatically clicks every "Load All"/"Show All" control it
finds on each poll (`clickLoadAllControls()`), so the full history is visible
and classifiable without the user ever needing to click it. This control
turned out to be a plain `<div>` with no button semantics, not a
`<button>`/`<a role="button">` — an earlier version's selector matched the
wrong element, and clicking *that* threw inside stockscans' own click
handler, which is why auto-clicking was initially avoided. The fix walks up
from the "Load All" text node to the nearest ancestor with `role="button"`
or CSS `cursor: pointer` (i.e. the actual clickable target a real click would
hit), which clicks cleanly.

## Files

- `manifest.json` — MV3 manifest.
- `content.js` — runs on company pages: auto-clicks "Load All" controls,
  detects + hides intraday rows on a 400ms poll (the shareholdings section
  re-renders live on price ticks, which silently reverts DOM mutations made
  outside React's own render, so a poll — not a MutationObserver — is what
  reliably holds the hidden state).
- `background.js` — service worker; maintains a deduplicated HFT watchlist
  in `chrome.storage.local`, keyed by shareholder name.
- `popup.html` / `popup.js` — on/off toggle, "remove all same-day traders"
  toggle + retained-shares % threshold input, and the current watchlist
  (downloadable as JSON, or synced directly into a local folder such as this
  repo's `data/` via the File System Access API — pick the folder once, it's
  remembered via IndexedDB and reused on future syncs).

## Settings (popup)

- **Filtering intraday deals** — master on/off switch. Off shows every deal,
  unmodified.
- **Remove all same-day Buy+Sell traders** (default **on**) — see step 5
  above. When on, the threshold input below is ignored (and visually greyed
  out) since every same-day pair is removed regardless of ratio.
- **Max retained-shares threshold** (default **2%**) — only used when the
  toggle above is off. Lower = stricter (only near-exact square-offs count);
  higher = looser (catches more lopsided-but-still-churny days).

All three settings are stored in `chrome.storage.local` (`idf_enabled`,
`idf_remove_all_samedays`, `idf_threshold_pct`) and take effect immediately
on every open stockscans tab via `chrome.storage.onChanged` — no page reload
needed.

## Data: `data/hft-watchlist.json`

The canonical, versioned list lives at `../../data/hft-watchlist.json` in
this repo. Use the popup's **"Save to stockmarket/data"** button (pointed at
that `data/` folder) to keep it updated as you browse more companies —
it overwrites the file with the latest deduplicated watchlist each time.

## Install / reload (unpacked)

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this folder
   (`extensions/intraday-deal-filter`).
3. Visit a stockscans company page, e.g.
   `https://www.stockscans.in/company/NSE:GANDHAR#shareholdings`, open the
   Bulk Block Deals tab. Matched intraday rows disappear on first load (no
   click needed) and a small toast in the bottom-right shows how many were
   hidden.
4. Click the extension icon to see/export the accumulated HFT list, or to
   change the toggle/threshold settings.

**Important:** Chrome does not auto-reload an unpacked extension's source
when the files on disk change. After any code update, go to
`chrome://extensions` and click the reload icon (circular arrow) on
"Stockscans Intraday Deal Filter" — otherwise you'll keep running whatever
version was loaded last, which can look confusingly like a regression.

## Known limitations / what could be wrong

- **CSS class names**: row parsing uses table position (columns 0–4), not
  the hashed CSS-module class names, so it should survive stockscans style
  rebuilds — but a *column reorder* would break it silently.
- **"Load All" selector**: `clickLoadAllControls()` matches by the literal
  text "Load All"/"Show All" and walks up the DOM for a clickable ancestor.
  If stockscans renames the control or restructures its markup so no
  ancestor within 6 levels has `role="button"`/`cursor: pointer`, the
  auto-click would silently no-op (rows beyond the default ~10 would stay
  undetected, same as before this feature existed) — not a crash, just a
  missed catch.
- **Multi-leg days**: with "remove all same-day traders" on, any group with
  ≥1 Buy and ≥1 Sell leg that day is removed in full, including all legs —
  by design, since the toggle's purpose is to be maximally inclusive.
- **Not a fraud signal**: appearing on the HFT list only means "traded both
  ways the same day" (or, with the toggle off, "churned above the retained
  threshold"), which is normal for market makers / arb desks — it is not
  evidence of wrongdoing.
