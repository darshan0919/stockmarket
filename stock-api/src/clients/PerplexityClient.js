'use strict';

const { HttpClient } = require('../http/HttpClient.js');
const { PerplexityAuth } = require('../auth/perplexityAuth.js');

const BASE_URL = 'https://www.perplexity.ai/rest/finance/earnings';

/**
 * Perplexity Finance earnings/transcript client — an UNOFFICIAL, undocumented
 * internal API (see perplexityAuth.js for the auth-fragility notes). Used as a
 * soft middle tier in the concall-transcript-extractor waterfall: tried after
 * Stockscans' own official Transcript document is confirmed absent, and before
 * falling back to the recording-announcement + NotebookLM pipeline.
 *
 * BOTH endpoints require a full authenticated Cookie session — confirmed live
 * 2026-07-24: a request with zero cookies got a Cloudflare 403 challenge page
 * even on the events-list endpoint, despite that endpoint's per-event
 * `requiresLogin: false` field suggesting otherwise. See perplexityAuth.js for
 * why this session is fragile (short-lived `cf_clearance`, IP/fingerprint
 * sensitivity) and must be treated as a soft, best-effort tier.
 *
 * Ticker format is Perplexity/Yahoo-style, NOT Stockscans' `EXCHANGE:SYMBOL`:
 *   NSE:STLTECH -> STLTECH.NS
 *   BSE:500325  -> Perplexity does not reliably resolve bare BSE scrip codes;
 *                  prefer the NSE symbol when the company is dual-listed.
 * Use {@link toPerplexityTicker} to convert; it throws for tickers it can't map
 * confidently rather than silently querying the wrong symbol.
 */
class PerplexityClient {
  constructor({ auth, http } = {}) {
    this.auth = auth || new PerplexityAuth({ envPath: `${process.cwd()}/.env` });
    this.http = http || new HttpClient({ timeout: 30000 });
  }

  /**
   * List earnings events for a company. CONFIRMED LIVE 2026-07-24 (STLTECH.NS)
   * — Cloudflare returns a 403 challenge page without a valid cookie session
   * (tested with zero cookies first: 403 "Just a moment..."), so despite the
   * `requiresLogin: false` field seen per-event, the HTTP call itself still
   * needs PERPLEXITY_COOKIES. Confirmed response shape (newest-first array):
   *   [{ date: "2026-07-24T10:30:00.000Z", id: 656796, fiscalYear: 2027,
   *      fiscalPeriod: "Q1", actualRevenue: null, estimatedRevenue: 15832000000.0,
   *      actualEps: null, estimatedEps: null, requiresLogin: false, ... }, ...]
   * `actualRevenue`/`actualEps` are non-null once results are out — useful as
   * an independent "has this quarter reported yet" signal alongside Stockscans.
   * @param {string} pplxTicker - e.g. "STLTECH.NS"
   * @returns {Promise<Array<{id:number,date:string,fiscalYear:number,fiscalPeriod:string,actualRevenue:?number,actualEps:?number,requiresLogin:boolean}>>}
   */
  async earningsEvents(pplxTicker) {
    const endpoint = `${BASE_URL}/${encodeURIComponent(pplxTicker)}`;
    const { data } = await this.http.get(endpoint, {
      headers: this.auth.headers({
        endpoint,
        referer: `https://www.perplexity.ai/finance/${pplxTicker}/earnings`,
        requireCookie: true,
      }),
    });
    return Array.isArray(data) ? data : data.events || data.earnings || [];
  }

  /**
   * Fetch the transcript for one earnings event. Requires an authenticated
   * session (PERPLEXITY_COOKIES) — throws a clear, actionable error if unset.
   * CONFIRMED LIVE 2026-07-24 (STLTECH.NS, eventId 656796) — response shape:
   *   { date, wentLiveAt, status: "final"|..., audio: "<m3u8 stream url>",
   *     paragraphs: [{ time: 0.1, text: "...", speakers: ["Operator"] }, ...] }
   * This is ALREADY a verbatim, speaker-attributed transcript sourced from
   * Quartr — no further transcription step (NotebookLM etc.) is needed when
   * this tier succeeds. Use {@link paragraphsToText} to flatten it.
   * @param {string} pplxTicker
   * @param {string|number} eventId
   * @returns {Promise<{date:string,wentLiveAt:string,status:string,audio:string,paragraphs:Array<{time:number,text:string,speakers:string[]}>}>}
   */
  async transcript(pplxTicker, eventId) {
    const endpoint = `${BASE_URL}/${encodeURIComponent(pplxTicker)}/transcript/${encodeURIComponent(eventId)}`;
    const { data } = await this.http.get(endpoint, {
      headers: this.auth.headers({
        endpoint,
        referer: `https://www.perplexity.ai/finance/${pplxTicker}/earnings?eventId=${eventId}`,
        requireCookie: true,
      }),
    });
    return data;
  }
}

/**
 * Flatten a {@link PerplexityClient#transcript} response's `paragraphs` array
 * into a plain speaker-labelled transcript, matching the format
 * `save-concall-transcript.js` stores for the NotebookLM tier so downstream
 * readers don't need to branch on source.
 * @param {{paragraphs:Array<{text:string,speakers:string[]}>}} transcriptData
 * @returns {string}
 */
function paragraphsToText(transcriptData) {
  const paragraphs = (transcriptData && transcriptData.paragraphs) || [];
  return paragraphs
    .map((p) => {
      const speaker = p.speakers && p.speakers.length ? p.speakers.join(' & ') : null;
      return speaker ? `${speaker}: ${p.text}` : p.text;
    })
    .join('\n\n');
}

/**
 * Convert a Stockscans-style ticker ("NSE:STLTECH") to Perplexity's Yahoo-style
 * ticker ("STLTECH.NS"). Throws on anything it can't map confidently — silently
 * guessing wrong here means querying data for the wrong company.
 * @param {string} stockscansTicker
 * @returns {string}
 */
function toPerplexityTicker(stockscansTicker) {
  const m = /^(NSE|BSE):(.+)$/i.exec(String(stockscansTicker || '').trim());
  if (!m) {
    throw new Error(
      `Cannot convert "${stockscansTicker}" to a Perplexity ticker — expected ` +
        `"NSE:SYMBOL" or "BSE:SYMBOL".`
    );
  }
  const [, exchange, symbol] = m;
  if (exchange.toUpperCase() === 'BSE') {
    throw new Error(
      `"${stockscansTicker}" is a BSE-only ticker — Perplexity Finance is keyed ` +
        `off NSE symbols (SYMBOL.NS) in observed testing. If this company is ` +
        `also NSE-listed, resolve its NSE symbol (e.g. via StockscansClient) ` +
        `and retry with that instead of guessing a .BO suffix.`
    );
  }
  return `${symbol.toUpperCase()}.NS`;
}

module.exports = {
  PerplexityClient,
  toPerplexityTicker,
  paragraphsToText,
  PERPLEXITY_BASE_URL: BASE_URL,
};
