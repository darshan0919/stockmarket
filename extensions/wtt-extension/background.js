/**
 * background.js — Service worker for the Walk the Talk extension.
 * Handles: side panel lifecycle, message relay between content script and side panel.
 * @file extensions/wtt-extension/background.js
 * @see {@link extensions/wtt-extension/IMPLEMENTATION.md} for architecture docs
 */

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "START_ANALYSIS") {
    chrome.sidePanel.open({ tabId: sender.tab.id }).then(() => {
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: "BEGIN_ANALYSIS", payload: msg.payload }).catch(() => {});
      }, 400);
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === "RELAY_TO_CONTENT") {
    getStockscansTab().then(tab => {
      if (!tab) { sendResponse({ error: "No stockscans tab found" }); return; }
      chrome.tabs.sendMessage(tab.id, msg.inner)
        .then(r => sendResponse(r))
        .catch(e => sendResponse({ error: e.message }));
    });
    return true;
  }
});

/**
 * Find the first open tab matching stockscans.in/company/*.
 * @returns {Promise<chrome.tabs.Tab|null>}
 */
async function getStockscansTab() {
  const tabs = await chrome.tabs.query({ url: ["*://www.stockscans.in/company/*"] });
  return tabs.length ? tabs[0] : null;
}
