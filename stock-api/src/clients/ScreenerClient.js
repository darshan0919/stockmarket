'use strict';

const { HttpClient } = require('../http/HttpClient');
const { ScreenerAuth } = require('../auth/screenerAuth');
const { parseScreenerInsights } = require('../analyzers/screenerInsights');

const BASE_URL = 'https://www.screener.in';

/**
 * ScreenerClient — fetches Screener.in company pages (session-authenticated) for
 * the pre-PEAD insights cross-check. Screener is the single source of the
 * auto-generated Pros/Cons "insights" and the warehouse key-ratios the skill
 * uses to sharpen a surprise call. Price-action and guidance stay with
 * Stockscans / the exchange clients — this client only adds Screener's read.
 *
 * Auth is injected (ScreenerAuth) so the client holds only endpoint logic. The
 * response is raw HTML; parsing lives in analyzers/screenerInsights.js.
 */
class ScreenerClient {
  constructor({ http, auth } = {}) {
    this.http = http || new HttpClient({ timeout: 30000 });
    this.auth = auth || new ScreenerAuth();
    this.baseUrl = BASE_URL;
  }

  /**
   * Resolve a company URL slug. Screener uses the NSE/BSE symbol as the slug
   * (e.g. `ARE&M`, `PGEL`). `consolidated` toggles the consol vs standalone view
   * — Indian analysts model consolidated, so default to it and fall back.
   * @param {string} symbol - bare symbol, or `NSE:PGEL` / `BSE:500...` (prefix stripped).
   */
  _slug(symbol) {
    return String(symbol).replace(/^(NSE|BSE):/i, '').trim();
  }

  /**
   * GET a company page as HTML.
   * @param {string} symbol
   * @param {Object} [opts] - { consolidated=true }
   * @returns {Promise<{ status:number, html:string, url:string }>}
   */
  async companyPage(symbol, { consolidated = true } = {}) {
    const slug = this._slug(symbol);
    const url = `${BASE_URL}/company/${encodeURIComponent(slug)}/${consolidated ? 'consolidated/' : ''}`;
    const { data, status } = await this.http.get(url, {
      headers: this.auth.headers({ referer: `${BASE_URL}/` }),
      // don't throw on 4xx/redirect — the parser inspects the body/status to
      // distinguish "company not found" from "session expired".
      validateStatus: () => true,
    });
    return { status: status || 0, html: typeof data === 'string' ? data : String(data), url };
  }

  /**
   * Company page with a consolidated→standalone fallback (some companies have no
   * consolidated financials, so the consol URL 404s or is thin).
   */
  async companyPageWithFallback(symbol) {
    const consol = await this.companyPage(symbol, { consolidated: true });
    if (consol.status === 200 && consol.html && consol.html.length > 2000) return consol;
    return this.companyPage(symbol, { consolidated: false });
  }

  /**
   * Validate that the Screener session cookie is active.
   * Throws if expired.
   */
  async validateAuth() {
    // RELIANCE is a reliable test subject.
    const res = await this.companyPage('RELIANCE', { consolidated: true });
    const insights = parseScreenerInsights(res);
    if (insights.authExpired) {
      throw new Error(`SCREENER_SESSIONID is expired or invalid: ${insights.authReason}`);
    }
  }
}

module.exports = { ScreenerClient, SCREENER_BASE_URL: BASE_URL };
