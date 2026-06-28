/**
 * @fileoverview BSE low-level HTTP transport.
 *
 * Thin adapter over the centralized `@stock/api` transport. The implementation
 * (malformed-header-tolerant fetch, URL building) lives in the package; this file
 * preserves the historical export surface so existing consumers don't change.
 */

const { bseHttp } = require('@stock/api');

module.exports = {
  BSE_API_URL: bseHttp.BSE_API_URL,
  BSE_REQUEST_TIMEOUT_MS: bseHttp.BSE_REQUEST_TIMEOUT_MS,
  BSE_BROWSER_HEADERS: bseHttp.BSE_BROWSER_HEADERS,
  buildBseUrl: bseHttp.buildBseUrl,
  bseGetText: bseHttp.bseGetText,
  bseGetJson: bseHttp.bseGetJson,
};
