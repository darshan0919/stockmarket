'use strict';

const axios = require('axios');
const { apiUsageCounter } = require('@stock/cloud-utils');

// Host substring → short label used for API-usage attribution (see
// apiUsageCounter.js / packages/jobs-runtime/lib/apiUsageTracker.js). Checked
// in order; first match wins. Kept intentionally small and host-based (not a
// per-endpoint map) — the audit need is "how many calls did this job make
// to Stockscans vs NSE vs BSE vs Screener vs Perplexity", not per-endpoint
// granularity, and a host-substring list survives new endpoints being added
// to any client with zero maintenance here.
const API_LABELS = [
  ['stockscans.in', 'stockscans'],
  ['screener.in', 'screener'],
  ['nseindia.com', 'nse'],
  ['bseindia.com', 'bse'],
  ['perplexity.ai', 'perplexity'],
];

/** Derive a short API label from a request URL for usage-tracking purposes. */
function apiLabelFor(url) {
  const s = String(url || '');
  for (const [needle, label] of API_LABELS) {
    if (s.includes(needle)) return label;
  }
  return 'other';
}

/**
 * Thin, injectable HTTP wrapper around axios.
 *
 * Holds the cross-cutting concerns every client shares — default User-Agent,
 * timeout, a single retry hook, and API-usage tracking — so the client
 * classes contain *only* endpoint logic (SRP). Inject a custom instance in
 * tests to avoid real network.
 *
 * Every request/response here is recorded via apiUsageCounter, attributed to
 * the `jobName` this instance was constructed with (a no-op if none was
 * given — tracking is opt-in). There is NO shared/global "active job" —
 * jobName lives on the HttpClient INSTANCE, passed down explicitly from
 * whichever script constructed it (directly, or via a *Client class's own
 * `jobName` constructor option — see StockscansClient.js etc.), never read
 * from ambient process state. This means two HttpClient instances in the
 * same process — even concurrently, even for different jobs — never
 * interfere with each other's counts (see apiUsageCounter.js's header for
 * the incident this fixes). Recorded under a short host label
 * (stockscans/screener/nse/bse/perplexity/other) derived from the URL. This
 * is the single choke point for outbound HTTP in this repo (every client in
 * stock-api/src/clients/*.js is constructed with an HttpClient instance), so
 * instrumenting here — rather than each client — automatically covers every
 * current and future API-calling job with zero per-endpoint changes.
 *
 * @example
 * const http = new HttpClient({ timeout: 30000, jobName: 'daily-gainers-signal-stockmarket' });
 * const { data } = await http.get('https://...', { headers });
 */
class HttpClient {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.timeout=30000] - Default per-request timeout (ms).
   * @param {string} [opts.userAgent]     - Default User-Agent header.
   * @param {string} [opts.jobName]       - Job name (jobs/Scheduled/<name>) to attribute
   *   this instance's calls to for API-usage auditing. Omit for an untracked/ad-hoc call
   *   (tracking simply no-ops). Lives on the instance, not any shared/global state.
   * @param {import('axios').AxiosInstance} [opts.axiosInstance] - Override (for tests).
   * @param {number} [opts.max429Retries=3] - Max retries on HTTP 429 before giving up
   *   and letting the error propagate. Set to 0 to disable (old behavior).
   * @param {number} [opts.retryBaseDelayMs=2000] - Base delay for the 429 backoff.
   *   Actual wait is `retryBaseDelayMs * 2^attempt` (plus jitter), honoring a
   *   `Retry-After` response header (seconds or HTTP-date) when present.
   * @param {(ms: number) => Promise<void>} [opts.sleep] - Injectable delay fn (for tests).
   */
  constructor({
    timeout = 30000,
    userAgent,
    jobName,
    axiosInstance,
    max429Retries = 3,
    retryBaseDelayMs = 2000,
    sleep,
  } = {}) {
    this.timeout = timeout;
    this.jobName = jobName || null;
    this.userAgent =
      userAgent ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
    this.axios = axiosInstance || axios.create();
    this.max429Retries = max429Retries;
    this.retryBaseDelayMs = retryBaseDelayMs;
    this._sleep = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /**
   * Delay to wait before retry attempt `attempt` (0-indexed) on a 429,
   * honoring the server's `Retry-After` header when present (seconds, or an
   * HTTP-date) — a server telling us exactly how long to wait should always
   * win over our own guess. Falls back to exponential backoff with jitter:
   * `retryBaseDelayMs * 2^attempt` up to a 15s jitter band, capped at 2 min
   * so a misbehaving header/backoff never stalls a job indefinitely.
   * @param {number} attempt
   * @param {import('axios').AxiosResponse} [response]
   * @returns {number} ms
   */
  _retryDelayMs(attempt, response) {
    const retryAfter = response && response.headers && response.headers['retry-after'];
    if (retryAfter) {
      const asSeconds = Number(retryAfter);
      if (Number.isFinite(asSeconds)) return Math.min(asSeconds * 1000, 120000);
      const asDate = Date.parse(retryAfter);
      if (!Number.isNaN(asDate)) return Math.min(Math.max(asDate - Date.now(), 0), 120000);
    }
    const backoff = this.retryBaseDelayMs * 2 ** attempt;
    const jitter = Math.random() * 15000;
    return Math.min(backoff + jitter, 120000);
  }

  /**
   * Runs `fn` (one axios call), retrying on HTTP 429 up to `max429Retries`
   * times with backoff. Any other error, or exhausting retries, rethrows the
   * original axios error unchanged — callers that already catch/log errors
   * (every client in this repo does) need no changes to benefit from this.
   * @param {string} url - for logging only.
   * @param {() => Promise<import('axios').AxiosResponse>} fn
   */
  async _withRetry(url, fn) {
    let attempt = 0;
    for (;;) {
      try {
        return await fn();
      } catch (err) {
        const status = err && err.response && err.response.status;
        if (status !== 429 || attempt >= this.max429Retries) throw err;
        const delay = this._retryDelayMs(attempt, err.response);
        process.stderr.write(
          `[HttpClient] 429 from ${url} — retry ${attempt + 1}/${this.max429Retries} in ${Math.round(delay / 1000)}s\n`
        );
        await this._sleep(delay);
        attempt += 1;
      }
    }
  }

  /** @param {Object} [headers] */
  _headers(headers = {}) {
    return { 'User-Agent': this.userAgent, ...headers };
  }

  /** Record one outbound call for API-usage auditing. Never throws. */
  _track(url, ok) {
    try {
      apiUsageCounter.record(this.jobName, { api: apiLabelFor(url), ok });
    } catch {
      // Tracking must never break a real request — swallow any error here.
    }
  }

  /**
   * @param {string} url
   * @param {Object} [options] - { params, headers, timeout, responseType }
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  async get(url, { params, headers, timeout, responseType } = {}) {
    try {
      const res = await this._withRetry(url, () =>
        this.axios.get(url, {
          params,
          headers: this._headers(headers),
          timeout: timeout ?? this.timeout,
          responseType,
        })
      );
      this._track(url, true);
      return res;
    } catch (err) {
      this._track(url, false);
      throw err;
    }
  }

  /**
   * @param {string} url
   * @param {*} body
   * @param {Object} [options] - { headers, timeout }
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  async post(url, body, { headers, timeout } = {}) {
    try {
      const res = await this._withRetry(url, () =>
        this.axios.post(url, body, {
          headers: this._headers(headers),
          timeout: timeout ?? this.timeout,
        })
      );
      this._track(url, true);
      return res;
    } catch (err) {
      this._track(url, false);
      throw err;
    }
  }

  /**
   * @param {string} url
   * @param {*} body
   * @param {Object} [options] - { headers, timeout }
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  async put(url, body, { headers, timeout } = {}) {
    try {
      const res = await this._withRetry(url, () =>
        this.axios.put(url, body, {
          headers: this._headers(headers),
          timeout: timeout ?? this.timeout,
        })
      );
      this._track(url, true);
      return res;
    } catch (err) {
      this._track(url, false);
      throw err;
    }
  }

  /**
   * @param {string} url
   * @param {Object} [options] - { headers, timeout, data } - `data` is a
   *   request body for DELETE calls that need one (e.g. Stockscans'
   *   `DELETE /api/user/watchlists` takes `{watchlistId}` in the body, not
   *   as a path param — confirmed live, the path-param form 404s).
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  async delete(url, { headers, timeout, data } = {}) {
    try {
      const res = await this._withRetry(url, () =>
        this.axios.delete(url, {
          headers: this._headers(headers),
          timeout: timeout ?? this.timeout,
          data,
        })
      );
      this._track(url, true);
      return res;
    } catch (err) {
      this._track(url, false);
      throw err;
    }
  }
}

module.exports = { HttpClient, apiLabelFor };
