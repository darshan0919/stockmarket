/**
 * content.js — Injected into stockscans.in/company/* pages.
 * Handles: symbol detection, document API calls, financial table scraping,
 * analyst notes fetching, and "Walk the Talk" button injection.
 * @file extensions/wtt-extension/content.js
 * @see {@link extensions/wtt-extension/IMPLEMENTATION.md} for architecture docs
 */
(function () {
  "use strict";

  // ── Symbol Detection ──────────────────────────────────────────────────────

  /**
   * Extract the company symbol from the current URL path.
   * Expects URLs like /company/NSE:INFY or /company/BSE:500209.
   * @returns {string|null} Uppercase symbol or null if not on a company page
   */
  function getSymbol() {
    const m = location.pathname.match(/\/company\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]).toUpperCase() : null;
  }

  // dateToQuarter() is provided by utils.js (loaded before this file via manifest)

  // ── Stockscans API ────────────────────────────────────────────────────────

  /**
   * Fetch the documents list for a company from the stockscans API.
   * Uses same-origin cookies for authentication.
   * @param {string} symbol - Company symbol
   * @returns {Promise<Object>} API response with documents array
   * @throws {Error} If the API returns a non-OK status
   */
  async function fetchDocsList(symbol) {
    const res = await fetch(`/api/company/documents/${encodeURIComponent(symbol)}`, {
      headers: { accept: "application/json", "content-type": "application/json" },
      credentials: "include"
    });
    if (!res.ok) throw new Error(`Docs API ${res.status}`);
    return res.json();
  }

  // ── Financial Table Scraping ──────────────────────────────────────────────

  /**
   * Scrape quarterly financial tables (income statement, balance sheet, cash flow)
   * from the currently rendered page DOM.
   * @returns {Object<string, Object<string, string>>} Nested map: quarter -> table type -> text
   */
  function scrapeFinancialTables() {
    const out = {};
    document.querySelectorAll("table").forEach(table => {
      const rows = [...table.querySelectorAll("tr")];
      if (rows.length < 3) return;
      const headers = [...rows[0].querySelectorAll("th,td")].map(c => c.textContent.trim());
      const qCols = headers.map((h, i) => ({ h, i })).filter(x => /^Q[1-4]FY\d{2}$/i.test(x.h));
      if (!qCols.length) return;

      const firstColVals = rows.slice(1).map(r => (r.querySelector("td,th")?.textContent || "").toLowerCase());
      let ttype = null;
      if (firstColVals.some(v => v.includes("revenue") || v.includes("sales"))) ttype = "income_stmt";
      else if (firstColVals.some(v => v.includes("equity") || v.includes("reserve"))) ttype = "balance_sheet";
      else if (firstColVals.some(v => v.includes("operating cash") || v.includes("cash from"))) ttype = "cashflow";
      if (!ttype) return;

      qCols.forEach(({ h: qtr, i: ci }) => {
        if (!out[qtr]) out[qtr] = {};
        let txt = `=== ${ttype.replace("_", " ").toUpperCase()} · ${qtr} ===\n`;
        rows.slice(1).forEach(row => {
          const cells = [...row.querySelectorAll("td,th")].map(c => c.textContent.trim());
          if (cells[0] && cells[ci]) txt += `${cells[0]}: ${cells[ci]}\n`;
        });
        out[qtr][ttype] = txt;
      });
    });
    return out;
  }

  // ── Message Listener ──────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "FETCH_DOCS_LIST") {
      const symbol = getSymbol();
      if (!symbol) { sendResponse({ error: "Cannot detect symbol from URL" }); return true; }
      fetchDocsList(symbol)
        .then(data => sendResponse({ ok: true, symbol, data }))
        .catch(e => sendResponse({ error: e.message }));
      return true;
    }

    if (msg.type === "GET_FINANCIALS") {
      sendResponse({ ok: true, tables: scrapeFinancialTables() });
      return true;
    }

    if (msg.type === "FETCH_NOTES") {
      const { symbol, ssUrl } = msg;
      fetch(`/api/company/concall-notes/${encodeURIComponent(symbol)}/${ssUrl}`, {
        headers: { accept: "application/json", "content-type": "application/json" },
        credentials: "include"
      })
        .then(r => { if (!r.ok) throw new Error(`Notes API ${r.status}`); return r.json(); })
        .then(data => sendResponse({ ok: true, data }))
        .catch(e => sendResponse({ error: e.message }));
      return true;
    }
  });

  // ── Button Injection ──────────────────────────────────────────────────────

  /**
   * Check if an element is actually visible in the viewport.
   * @param {HTMLElement} el - Element to check
   * @returns {boolean} True if the element has non-zero dimensions and is within the viewport
   */
  function isElementVisible(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 &&
           rect.bottom > 0 && rect.top < window.innerHeight &&
           rect.right > 0 && rect.left < window.innerWidth;
  }

  /**
   * Remove any previously injected WTT button and its wrapper from the DOM.
   */
  function cleanupButton() {
    const existing = document.getElementById("wtt-btn");
    if (existing) {
      const wrapper = existing.closest("#wtt-btn-wrap");
      if (wrapper) wrapper.remove();
      else existing.remove();
    }
  }

  /**
   * Create the styled "Walk the Talk" button element.
   * @param {string} symbol - Company symbol to pass in the analysis message
   * @returns {HTMLButtonElement}
   */
  function createButton(symbol) {
    const btn = document.createElement("button");
    btn.id = "wtt-btn";
    btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="flex-shrink:0">
        <circle cx="7" cy="7" r="6.5" stroke="#07090d" stroke-width="1"/>
        <polygon points="5.5,4 10.5,7 5.5,10" fill="#07090d"/>
      </svg>
      Walk the Talk
    `;

    Object.assign(btn.style, {
      display: "inline-flex", alignItems: "center", gap: "7px",
      background: "#e5b84a", color: "#07090d",
      border: "none", borderRadius: "8px",
      padding: "9px 16px", fontSize: "13px", fontWeight: "700",
      fontFamily: "'DM Sans', system-ui, sans-serif",
      cursor: "pointer", zIndex: "9999",
      boxShadow: "0 2px 8px rgba(229,184,74,.35)",
      transition: "background .15s, transform .1s",
      letterSpacing: "-.1px",
      whiteSpace: "nowrap"
    });

    btn.addEventListener("mouseenter", () => { btn.style.background = "#f5d070"; });
    btn.addEventListener("mouseleave", () => { btn.style.background = "#e5b84a"; });
    btn.addEventListener("mousedown", () => { btn.style.transform = "scale(.97)"; });
    btn.addEventListener("mouseup", () => { btn.style.transform = "scale(1)"; });

    btn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "START_ANALYSIS", payload: { symbol } });
    });

    return btn;
  }

  /**
   * Apply fixed-position bottom-right styling to the button as a fallback.
   * @param {HTMLButtonElement} btn
   */
  function applyFixedFallback(btn) {
    Object.assign(btn.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      boxShadow: "0 4px 16px rgba(229,184,74,.4)",
      zIndex: "99999"
    });
    document.body.appendChild(btn);
  }

  /**
   * Inject the "Walk the Talk" button into the page. Tries to insert it
   * near the company header; if not visible after insertion, falls back to
   * fixed positioning at the bottom-right of the viewport.
   */
  function injectButton() {
    cleanupButton();

    const symbol = getSymbol();
    if (!symbol) return;

    const btn = createButton(symbol);

    const targets = [
      "[class*='company-overview']",
      "[class*='companyHeader']",
      "[class*='stock-header']",
      "[class*='CompanyHeader']",
      "[class*='StockHeader']",
      "[class*='company-name']",
      "[class*='stockName']",
      "h1",
    ];

    let inserted = false;
    for (const sel of targets) {
      const el = document.querySelector(sel);
      if (!el) continue;

      const parent = el.closest("[class*='header'], [class*='overview'], [class*='Header'], section") || el.parentElement;
      if (!parent) continue;

      const wrap = document.createElement("div");
      wrap.id = "wtt-btn-wrap";
      wrap.style.cssText = "display:inline-block;margin-left:12px;vertical-align:middle";
      wrap.appendChild(btn);

      const titleEl = parent.querySelector("h1, [class*='company-name'], [class*='stockName'], [class*='CompanyName']") || parent;
      titleEl.insertAdjacentElement("afterend", wrap);

      // Verify the button is actually visible after DOM insertion
      requestAnimationFrame(() => {
        if (!isElementVisible(btn)) {
          wrap.remove();
          applyFixedFallback(createButton(symbol));
        }
      });

      inserted = true;
      break;
    }

    if (!inserted) {
      applyFixedFallback(btn);
    }
  }

  // ── SPA Navigation Detection via MutationObserver ─────────────────────────

  let lastUrl = location.href;

  /**
   * Handle URL changes (SPA navigation). Re-injects the button on new company pages,
   * cleans up on non-company pages.
   */
  function onUrlChange() {
    const newUrl = location.href;
    if (newUrl === lastUrl) return;
    lastUrl = newUrl;
    if (/\/company\/[^/?#]+/i.test(location.pathname)) {
      setTimeout(injectButton, 800);
    } else {
      cleanupButton();
    }
  }

  // Use MutationObserver to detect SPA navigations (title/URL changes)
  const observer = new MutationObserver(() => onUrlChange());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Also listen for History API navigation events
  window.addEventListener("popstate", onUrlChange);
  const origPushState = history.pushState;
  history.pushState = function () {
    origPushState.apply(this, arguments);
    onUrlChange();
  };
  const origReplaceState = history.replaceState;
  history.replaceState = function () {
    origReplaceState.apply(this, arguments);
    onUrlChange();
  };

  // ── Initial Injection ─────────────────────────────────────────────────────
  if (document.readyState === "complete") {
    setTimeout(injectButton, 1000);
  } else {
    window.addEventListener("load", () => setTimeout(injectButton, 1000));
  }
})();
