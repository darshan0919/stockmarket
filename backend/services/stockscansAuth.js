/**
 * @fileoverview Authentication service for StockScans API
 * @module services/stockscansAuth
 * @see {@link docs/backend/services/stockscansAuth.md} for detailed documentation
 */

const axios = require('axios');

/**
 * Get the StockScans authentication token from environment
 * The token is a JWT that should be obtained from browser cookies after logging into stockscans.in
 * @returns {string} Authentication token
 * @throws {Error} If token not configured in environment
 */
function getAuthToken() {
  const token = (process.env.STOCKSCANS_AUTH_TOKEN || '').trim();
  if (!token) {
    throw new Error(
      'STOCKSCANS_AUTH_TOKEN not configured. Login to stockscans.in and copy the authtoken cookie value to .env'
    );
  }
  return token;
}

/**
 * Create axios instance with authentication headers
 * @param {string} authToken - Authentication token from getAuthToken()
 * @returns {axios.AxiosInstance} Axios instance configured with auth headers
 * @example
 * const token = getAuthToken();
 * const authClient = createAuthenticatedClient(token);
 * const response = await authClient.get('https://www.stockscans.in/api/...');
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
