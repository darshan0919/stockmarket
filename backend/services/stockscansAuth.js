/**
 * @fileoverview Authentication service for StockScans API.
 * @module services/stockscansAuth
 * @see {@link docs/backend/services/stockscansAuth.md} for detailed documentation
 *
 * The token source is now centralized in `@stock/api` (StockscansAuth) so the
 * backend, cowork jobs, and skills all resolve the SAME token. This file keeps its
 * historical export surface (getAuthToken, createAuthenticatedClient).
 */

const axios = require('axios');
const { StockscansAuth } = require('@stock/api');

// Lazy per-request token resolution (env STOCKSCANS_AUTH_TOKEN, legacy fallback).
const auth = new StockscansAuth();

/**
 * Get the StockScans authentication token.
 * @returns {string} Authentication token
 * @throws {Error} If token not configured
 */
function getAuthToken() {
  return auth.getToken();
}

/**
 * Create an axios instance with StockScans auth headers.
 * @param {string} authToken - Token from getAuthToken()
 * @returns {axios.AxiosInstance}
 */
function createAuthenticatedClient(authToken) {
  return axios.create({
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Cookie: `authtoken=${authToken}`,
    },
    timeout: 30000,
  });
}

module.exports = {
  getAuthToken,
  createAuthenticatedClient,
};
