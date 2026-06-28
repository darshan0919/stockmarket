'use strict';

const axios = require('axios');

/**
 * Thin, injectable HTTP wrapper around axios.
 *
 * Holds the cross-cutting concerns every client shares — default User-Agent,
 * timeout, and a single retry hook — so the client classes contain *only*
 * endpoint logic (SRP). Inject a custom instance in tests to avoid real network.
 *
 * @example
 * const http = new HttpClient({ timeout: 30000 });
 * const { data } = await http.get('https://...', { headers });
 */
class HttpClient {
  /**
   * @param {Object} [opts]
   * @param {number} [opts.timeout=30000] - Default per-request timeout (ms).
   * @param {string} [opts.userAgent]     - Default User-Agent header.
   * @param {import('axios').AxiosInstance} [opts.axiosInstance] - Override (for tests).
   */
  constructor({ timeout = 30000, userAgent, axiosInstance } = {}) {
    this.timeout = timeout;
    this.userAgent =
      userAgent ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';
    this.axios = axiosInstance || axios.create();
  }

  /** @param {Object} [headers] */
  _headers(headers = {}) {
    return { 'User-Agent': this.userAgent, ...headers };
  }

  /**
   * @param {string} url
   * @param {Object} [options] - { params, headers, timeout, responseType }
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  async get(url, { params, headers, timeout, responseType } = {}) {
    return this.axios.get(url, {
      params,
      headers: this._headers(headers),
      timeout: timeout ?? this.timeout,
      responseType,
    });
  }

  /**
   * @param {string} url
   * @param {*} body
   * @param {Object} [options] - { headers, timeout }
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  async post(url, body, { headers, timeout } = {}) {
    return this.axios.post(url, body, {
      headers: this._headers(headers),
      timeout: timeout ?? this.timeout,
    });
  }

  /**
   * @param {string} url
   * @param {*} body
   * @param {Object} [options] - { headers, timeout }
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  async put(url, body, { headers, timeout } = {}) {
    return this.axios.put(url, body, {
      headers: this._headers(headers),
      timeout: timeout ?? this.timeout,
    });
  }

  /**
   * @param {string} url
   * @param {Object} [options] - { headers, timeout }
   * @returns {Promise<import('axios').AxiosResponse>}
   */
  async delete(url, { headers, timeout } = {}) {
    return this.axios.delete(url, {
      headers: this._headers(headers),
      timeout: timeout ?? this.timeout,
    });
  }
}

module.exports = { HttpClient };
