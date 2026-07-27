/**
 * content.js — Injected into stockscans.in/company/* pages.
 *
 * Detects two flavours of same-day intraday churn in the Bulk/Block Deals
 * table and hides those rows via DOM manipulation:
 *
 *   1. Exact square-off: a shareholder's Buy quantity on a day matches a
 *      Sell quantity on the same day almost exactly (net position ~0).
 *   2. Large-gross / small-net churn: a shareholder trades a huge quantity
 *      on both sides the same day, but the NET (bought - sold) is a tiny
 *      fraction of the gross traded — e.g. buys 17.1L shares and sells
 *      17.5L shares (net ~39k, ~1% of gross). Net delivered position barely
 *      moves even though headline "buy"/"sell" rows look big.
 *
 * Both are really the same underlying signal — a market-maker/arb desk
 * doing same-day round trips rather than a real position change — so they
 * share one group-level ratio test (case 1 is just the ratio=0 case of
 * case 2), see `findIntradayGroups`.
 *
 * Detected shareholders are reported to the background service worker so
 * they can be tracked as known intraday traders ("HFTs") across companies.
 * @file extensions/intraday-deal-filter/content.js
 */
(function () {
  'use strict';

  const HIDDEN_ATTR = 'data-idf-hidden-reason';

  // Default net (buy - sell) / gross (buy + sell) ratio, at or below which we
  // call it intraday churn rather than a real position change. Calibrated
  // against live GANDHAR data: an exact square-off is ratio 0; QE Securities
  // LLP's large-gross/small-net day (~17.5L sold vs ~17.1L bought) was ~1.1%.
  // Overridable from the popup (stored as idf_threshold_pct, a plain number
  // like 2 meaning 2%).
  const DEFAULT_THRESHOLD_PCT = 2;
  // Ignore tiny/noise volumes so rounding doesn't manufacture false positives.
  const MIN_GROSS_QTY = 1000;

  // Keys of detections already reported to the background worker, so we don't
  // spam duplicate messages every time the (live-price-driven) page re-renders.
  const reportedDetections = new Set();

  let enabled = true; // toggled from the popup via chrome.storage
  let thresholdPct = DEFAULT_THRESHOLD_PCT; // % — ignored when removeAllSameDay is on
  let removeAllSameDay = true; // when true, ANY same-day buy+sell pair is hidden regardless of ratio

  /** Get the NSE/BSE symbol from the URL, e.g. /company/NSE:GANDHAR -> NSE:GANDHAR */
  function getSymbol() {
    const m = location.pathname.match(/\/company\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]).toUpperCase() : null;
  }

  /** Parse a "₹15.98 Cr" / "₹288.02" style cell into a plain number (Cr stays in Cr; price stays in Rs). */
  function parseMoney(text) {
    if (!text) return null;
    const cleaned = text.replace(/[₹,]/g, '').trim();
    const isCr = /cr/i.test(cleaned);
    const num = parseFloat(cleaned.replace(/cr/i, '').trim());
    if (Number.isNaN(num)) return null;
    return { value: num, isCr };
  }

  /**
   * Find candidate Bulk/Block Deals tables on the page by header signature.
   * Stockscans renders duplicate tables for desktop/mobile breakpoints, so
   * we process every match to keep both in sync.
   */
  function findDealsTables() {
    const tables = Array.from(document.querySelectorAll('table'));
    return tables.filter((t) => {
      const head = (t.querySelector('thead')?.innerText || '').replace(/\s+/g, ' ').trim();
      return /Shareholder/i.test(head) && /Type/i.test(head) && /Date/i.test(head) && /Value/i.test(head);
    });
  }

  /** Extract a structured row object from a <tr>, or null if it doesn't parse. */
  function parseRow(tr) {
    const cells = tr.querySelectorAll('td');
    if (cells.length < 5) return null; // needs name, type, date, value, avg price

    const shareholder = cells[0].textContent.trim();
    const typeText = cells[1].textContent.trim().toLowerCase();
    const type = typeText.includes('buy') ? 'BUY' : typeText.includes('sell') ? 'SELL' : null;
    const date = cells[2].textContent.trim();
    const valueParsed = parseMoney(cells[3].textContent);
    const avgPriceParsed = parseMoney(cells[4].textContent);

    if (!shareholder || !type || !date || !valueParsed || !avgPriceParsed) return null;

    const valueRupees = valueParsed.isCr ? valueParsed.value * 1e7 : valueParsed.value;
    const avgPrice = avgPriceParsed.value;
    if (!avgPrice) return null;

    const quantity = valueRupees / avgPrice;

    return { tr, shareholder, type, date, avgPrice, quantity };
  }

  /**
   * Group rows by shareholder+date. A group is "intraday churn" if it has
   * BOTH a buy leg and a sell leg, and either:
   *   - `removeAllSameDay` is on (default): any same-day buy+sell activity
   *     is treated as intraday, regardless of how the quantities net out; or
   *   - the net position change is at or below `thresholdPct`% of the gross
   *     quantity traded that day.
   * When a group matches, every row in it is intraday noise (not just a
   * single matched pair) and gets hidden — this covers a clean 1-buy/1-sell
   * square-off (net ratio 0) and multi-leg/lopsided-quantity churn like QE
   * Securities LLP's buy-17.1L/sell-17.5L day (net ratio ~1.1%).
   */
  function findIntradayGroups(rows) {
    const groups = new Map();
    for (const r of rows) {
      const key = `${r.shareholder}|||${r.date}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }

    const intradayRows = [];
    const detections = [];

    for (const [, groupRows] of groups) {
      const buyRows = groupRows.filter((r) => r.type === 'BUY');
      const sellRows = groupRows.filter((r) => r.type === 'SELL');
      if (!buyRows.length || !sellRows.length) continue; // needs activity on both sides that day

      const totalBuy = buyRows.reduce((s, r) => s + r.quantity, 0);
      const totalSell = sellRows.reduce((s, r) => s + r.quantity, 0);
      const gross = totalBuy + totalSell;
      if (gross < MIN_GROSS_QTY) continue;

      const net = Math.abs(totalBuy - totalSell);
      const ratio = net / gross;

      if (!removeAllSameDay) {
        const thresholdRatio = thresholdPct / 100;
        if (ratio > thresholdRatio) continue;
      }
      // When removeAllSameDay is on, any same-day buy+sell activity above
      // MIN_GROSS_QTY qualifies — the ratio is computed only for reporting.

      intradayRows.push(...groupRows);
      detections.push({
        shareholder: buyRows[0].shareholder,
        date: buyRows[0].date,
        totalBuyQuantity: Math.round(totalBuy),
        totalSellQuantity: Math.round(totalSell),
        netQuantity: Math.round(net),
        netRatioPct: +(ratio * 100).toFixed(2),
        legCount: groupRows.length,
      });
    }
    return { intradayRows, detections };
  }

  /** Restore any rows we previously hid (used when the extension is toggled off). */
  function unhideAll() {
    document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((tr) => {
      tr.style.display = '';
      tr.removeAttribute(HIDDEN_ATTR);
    });
  }

  const AUTOCLICK_ATTR = 'data-idf-autoclicked';

  /**
   * Click every "Load All"/"Show All" control on the page so intraday pairs
   * whose second leg lives beyond the default ~10-row preview (like a Buy
   * from months ago whose matching Sell is further down the full list) are
   * visible immediately, without the user needing to click it themselves.
   *
   * Earlier versions of this extension avoided auto-clicking because a
   * naive `button, a[role="button"]` selector sometimes matched the wrong
   * element and clicking it threw inside stockscans' own handler. The
   * control is actually a plain <div> with no button semantics — walking up
   * from the matching text node to the nearest ancestor with role="button"
   * or CSS cursor:pointer (which is what a real click would hit) finds the
   * correct target and clicks cleanly with no error, tested repeatedly.
   * Guarded by AUTOCLICK_ATTR so each control is only ever clicked once per
   * page load (stockscans doesn't provide a "collapse" control back).
   */
  function clickLoadAllControls() {
    const leaves = Array.from(document.querySelectorAll('*')).filter(
      (el) => el.children.length === 0 && /load all|show all/i.test(el.textContent || '')
    );
    for (const leaf of leaves) {
      let target = leaf;
      for (let i = 0; i < 6 && target; i++) {
        if (target.hasAttribute(AUTOCLICK_ATTR)) {
          target = null;
          break;
        }
        if (target.getAttribute('role') === 'button' || getComputedStyle(target).cursor === 'pointer') break;
        target = target.parentElement;
      }
      if (!target || target.hasAttribute(AUTOCLICK_ATTR)) continue;
      target.setAttribute(AUTOCLICK_ATTR, '1');
      try {
        target.click();
      } catch (err) {
        console.warn('[Intraday Deal Filter] auto-click of Load All failed (harmless, will retry on next poll):', err);
      }
    }
  }

  /**
   * Process every deals table currently in the DOM; hide intraday rows.
   *
   * Note: this stockscans page re-renders the shareholdings section live
   * (price ticks over a socket), sometimes staggering row mounts — a Buy row
   * can appear a beat before its matching Sell row. So every pass
   * re-evaluates ALL currently-rendered rows (not just "new" ones); hiding an
   * already-hidden row is idempotent, and detections are deduped via
   * `reportedDetections` before notifying the background worker.
   */
  function processTables() {
    // The whole pass is wrapped defensively: this page is a live, actively
    // re-rendering React app. A poll that can silently die on one bad tick
    // and never recover would defeat the entire point of polling — so any
    // unexpected error here is logged and swallowed, and the next tick
    // (400ms later) tries again.
    try {
      if (!enabled) {
        unhideAll();
        showBanner(0, true);
        return;
      }

      clickLoadAllControls();

      const symbol = getSymbol();
      const tables = findDealsTables();
      const newDetections = [];
      let hiddenCount = 0;

      for (const table of tables) {
        const trs = Array.from(table.querySelectorAll('tbody tr'));
        if (!trs.length) continue;

        const rows = trs.map(parseRow).filter(Boolean);
        const { intradayRows, detections } = findIntradayGroups(rows);

        for (const r of intradayRows) {
          if (r.tr.style.display !== 'none') hiddenCount += 1;
          r.tr.style.display = 'none';
          r.tr.setAttribute(HIDDEN_ATTR, 'intraday-churn');
        }

        for (const d of detections) {
          const key = `${d.shareholder}|||${d.date}|||${d.totalBuyQuantity}|||${d.totalSellQuantity}`;
          if (reportedDetections.has(key)) continue;
          reportedDetections.add(key);
          newDetections.push(d);
        }
      }

      if (newDetections.length) {
        chrome.runtime.sendMessage({
          type: 'IDF_DETECTIONS',
          symbol,
          pageUrl: location.href,
          detections: newDetections,
        });
      }

      showBanner(hiddenCount, false);
    } catch (err) {
      console.warn('[Intraday Deal Filter] processTables failed, will retry next tick:', err);
    }
  }

  let bannerEl = null;
  let totalHidden = 0;
  function ensureBanner() {
    if (bannerEl) return bannerEl;
    bannerEl = document.createElement('div');
    bannerEl.style.cssText =
      'position:fixed;bottom:16px;right:16px;z-index:999999;background:#111827;color:#fff;' +
      'font:12px/1.4 -apple-system,system-ui,sans-serif;padding:8px 12px;border-radius:8px;' +
      'box-shadow:0 2px 10px rgba(0,0,0,.25);opacity:.92;';
    document.body.appendChild(bannerEl);
    return bannerEl;
  }
  function showBanner(newlyHidden, isOff) {
    if (isOff) {
      if (bannerEl) bannerEl.textContent = 'Intraday Deal Filter: OFF (showing all deals)';
      totalHidden = 0;
      return;
    }
    if (!newlyHidden && !totalHidden) return; // nothing to say yet
    totalHidden += newlyHidden;
    const el = ensureBanner();
    el.textContent = `Intraday Deal Filter: hid ${totalHidden} intraday (HFT churn) row${
      totalHidden === 1 ? '' : 's'
    }`;
  }

  function applyEnabledState(value) {
    enabled = value !== false; // default true
    if (!enabled) {
      unhideAll();
      showBanner(0, true);
    } else {
      totalHidden = 0;
      processTables();
    }
  }

  function applyThresholdPct(value) {
    const n = Number(value);
    thresholdPct = Number.isFinite(n) && n >= 0 ? n : DEFAULT_THRESHOLD_PCT;
    if (enabled) processTables();
  }

  function applyRemoveAllSameDay(value) {
    removeAllSameDay = value !== false; // default true
    if (enabled) processTables();
  }

  function init() {
    chrome.storage.local.get(['idf_enabled', 'idf_threshold_pct', 'idf_remove_all_samedays'], (res) => {
      thresholdPct = Number.isFinite(Number(res.idf_threshold_pct)) && res.idf_threshold_pct !== undefined
        ? Number(res.idf_threshold_pct)
        : DEFAULT_THRESHOLD_PCT;
      removeAllSameDay = res.idf_remove_all_samedays !== false; // default true
      applyEnabledState(res.idf_enabled);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (Object.prototype.hasOwnProperty.call(changes, 'idf_enabled')) {
        applyEnabledState(changes.idf_enabled.newValue);
      }
      if (Object.prototype.hasOwnProperty.call(changes, 'idf_threshold_pct')) {
        applyThresholdPct(changes.idf_threshold_pct.newValue);
      }
      if (Object.prototype.hasOwnProperty.call(changes, 'idf_remove_all_samedays')) {
        applyRemoveAllSameDay(changes.idf_remove_all_samedays.newValue);
      }
    });

    // Stockscans hydrates the deals table asynchronously (the full deal
    // history is often still loading behind the "Load All" button when the
    // page first paints), AND — important — the shareholdings section
    // re-renders live (price ticks over a socket). React's reconciliation on
    // those re-renders silently reverts any `style.display` we set outside
    // its own render. A fixed-cadence poll handles the steady state (hiding
    // matched rows is idempotent and cheap even run every fraction of a
    // second), but relying on it ALONE means we only catch late-arriving
    // rows (e.g. the full deals list finishing its async load) up to 400ms
    // late — acceptable, since a fixed-cadence poll is what actually holds
    // up here: hiding matched rows is idempotent and cheap even run every
    // fraction of a second. (A MutationObserver+debounce was tried instead
    // of/alongside the poll and rejected: unrelated high-frequency DOM
    // churn elsewhere on the page, like the live price ticker, can starve
    // or storm it, and running one unthrottled risks feedback loops with
    // this same script's own attribute-setting mutations.)
    //
    // The "Load All" list itself turned out NOT to be async-loaded data at
    // all — it's already in the page's client state, just rendered as a
    // `.slice(0, 10)` until the control is clicked; no network request
    // fires either way. So without a click, a same-day pair whose second
    // leg is past the first 10 rows can never appear in the DOM, no matter
    // how long we poll. We now call clickLoadAllControls() (see above)
    // every pass to expand it automatically. An earlier version skipped
    // auto-clicking because its `button, a[role="button"]` selector matched
    // the wrong element and clicking IT threw inside stockscans' handler;
    // clickLoadAllControls() instead walks up from the "Load All" text to
    // the real clickable ancestor (role="button" or CSS cursor:pointer),
    // which clicks cleanly — verified with no thrown error, repeatedly.
    setInterval(processTables, 400);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
