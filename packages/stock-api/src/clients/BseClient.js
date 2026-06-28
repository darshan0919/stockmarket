'use strict';

const { bseGetText, bseGetJson, BSE_REQUEST_TIMEOUT_MS } = require('../http/bseHttp');

/**
 * Parse BSE PeerSmartSearch HTML into autocomplete-shaped symbol objects.
 * Pure function — unit-testable without network.
 * @param {string} html
 * @returns {Array<Object>}
 */
function parseBseSmartSearchHtml(html) {
  const symbols = [];
  const itemRegex = /liclick\('(\d+)','([^']+)'\)[\s\S]*?<span>([\s\S]*?)<\/span>/gi;
  let match = itemRegex.exec(html);
  while (match) {
    const spanPlain = match[3]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .trim();
    const tokens = spanPlain.split(/\s+/).filter(Boolean);
    const symbol = tokens[0] || match[2].split(' ')[0];
    symbols.push({
      symbol,
      symbol_info: match[2],
      result_sub_type: 'equity',
      activeSeries: ['EQ'],
      listing_date: null,
      bse_scrip_code: match[1],
    });
    match = itemRegex.exec(html);
  }
  return symbols;
}

/**
 * BSE client — PRICE-ACTION ONLY: traded/deliverable quantity, delivery %, live
 * quote header, and the scrip-code/smart-search lookups needed to address those
 * price-action endpoints.
 *
 * Intentionally does NOT expose BSE's fundamental endpoints (earnings-call
 * transcript announcements, corporate results calendar, company header metadata)
 * — those are owned by {@link StockscansClient}.
 */
class BseClient {
  /**
   * Resolve a BSE scrip code for an NSE/BSE symbol via smart search.
   * @param {string} symbol
   * @returns {Promise<string|null>}
   */
  async getScripCode(symbol) {
    try {
      const normalized = symbol.trim().toUpperCase();
      const { data } = await bseGetText('PeerSmartSearch/w', {
        params: { Type: 'SS', text: normalized },
        timeout: BSE_REQUEST_TIMEOUT_MS,
      });
      const html = String(data).replaceAll('&nbsp;', ' ');
      const symbols = parseBseSmartSearchHtml(html);
      const exact = symbols.find((item) => item.symbol?.toUpperCase() === normalized);
      if (exact?.bse_scrip_code) return exact.bse_scrip_code;

      const regex = new RegExp(`<strong>${normalized}<\\/strong>\\s+\\w+\\s+(\\d+)`);
      const m = html.match(regex);
      return m?.[1] || null;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('BSE getScripCode failed:', error.message);
      return null;
    }
  }

  /**
   * Smart search (also used as a fallback for symbol resolution).
   * @param {string} query
   * @returns {Promise<{ symbols: Array<Object> }>}
   */
  async smartSearch(query) {
    const { data } = await bseGetText('PeerSmartSearch/w', {
      params: { Type: 'SS', text: query },
      timeout: BSE_REQUEST_TIMEOUT_MS,
    });
    return { symbols: parseBseSmartSearchHtml(String(data || '')) };
  }

  /**
   * Delivery / position data for a BSE-listed stock: trade date, qty traded,
   * deliverable qty, delivery %.
   * @param {string|number} scripCode
   * @returns {Promise<{tradeDate: string|null, qtyTraded: number, deliverableQty: number, deliveryPct: number}|null>}
   */
  async getSecurityPosition(scripCode) {
    try {
      const raw = await bseGetJson('SecurityPosition/w', {
        params: { quotetype: 'EQ', scripcode: String(scripCode) },
        timeout: BSE_REQUEST_TIMEOUT_MS,
      });
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const clean = (val) => parseFloat(String(val ?? '0').replace(/,/g, '')) || 0;
      return {
        tradeDate: data.TradeDate || null,
        qtyTraded: clean(data.QtyTraded),
        deliverableQty: clean(data.DeliverableQty),
        deliveryPct: clean(data.PcDQ_TQ),
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`BSE getSecurityPosition failed for scrip ${scripCode}:`, error.message);
      return null;
    }
  }

  /**
   * Live quote header (LTP, change, company name).
   * @param {string|number} scripCode
   * @returns {Promise<Object>}
   */
  async getQuoteHeader(scripCode) {
    return bseGetJson('getScripHeaderData/w', {
      params: { Market: 'EQ', scripcode: scripCode },
      timeout: BSE_REQUEST_TIMEOUT_MS,
    });
  }
}

module.exports = { BseClient, parseBseSmartSearchHtml };
