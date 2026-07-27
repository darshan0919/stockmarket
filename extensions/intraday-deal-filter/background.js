/**
 * background.js — Service worker for Intraday Deal Filter.
 * Receives intraday-square-off detections from content.js, maintains a
 * deduplicated "known HFT" watchlist in chrome.storage.local, keyed by
 * shareholder name.
 * @file extensions/intraday-deal-filter/background.js
 */

const STORAGE_KEY = 'idf_hft_watchlist';

/** @typedef {{ shareholder: string, companies: Object<string, {count:number, lastSeen:string}>, occurrences: number, firstSeen: string, lastSeen: string }} HftEntry */

async function loadWatchlist() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return stored[STORAGE_KEY] || {};
}

async function saveWatchlist(watchlist) {
  await chrome.storage.local.set({ [STORAGE_KEY]: watchlist });
}

async function recordDetections(symbol, detections) {
  const watchlist = await loadWatchlist();
  const now = new Date().toISOString();

  for (const d of detections) {
    const key = d.shareholder;
    if (!watchlist[key]) {
      watchlist[key] = {
        shareholder: key,
        occurrences: 0,
        companies: {},
        firstSeen: now,
        lastSeen: now,
      };
    }
    const entry = watchlist[key];
    entry.occurrences += 1;
    entry.lastSeen = now;

    const companyKey = symbol || 'UNKNOWN';
    if (!entry.companies[companyKey]) {
      entry.companies[companyKey] = { count: 0, dates: [] };
    }
    entry.companies[companyKey].count += 1;
    if (!entry.companies[companyKey].dates.includes(d.date)) {
      entry.companies[companyKey].dates.push(d.date);
    }
  }

  await saveWatchlist(watchlist);
  return watchlist;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'IDF_DETECTIONS') {
    recordDetections(msg.symbol, msg.detections).then(() => sendResponse({ ok: true }));
    return true; // async response
  }
  if (msg?.type === 'IDF_GET_WATCHLIST') {
    loadWatchlist().then((w) => sendResponse({ ok: true, watchlist: w }));
    return true;
  }
  if (msg?.type === 'IDF_CLEAR_WATCHLIST') {
    saveWatchlist({}).then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});
