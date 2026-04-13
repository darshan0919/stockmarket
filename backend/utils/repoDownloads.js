/**
 * Repository-root `downloads/` directory (sibling of `backend/`), resolved from this file’s location.
 * Works when the process cwd is `backend/`, repo root (`node backend/server.js`), or elsewhere.
 * @module utils/repoDownloads
 * @see {@link docs/API_REFERENCE.md} for download endpoints that persist files here
 */

const fs = require('fs');
const path = require('path');

/**
 * Absolute path to the repo `downloads/` folder.
 * @returns {string}
 */
function getRepoDownloadsRoot() {
  return path.resolve(__dirname, '..', '..', 'downloads');
}

/**
 * Ensure repo `downloads/` exists and return its absolute path.
 * @returns {string}
 */
function ensureRepoDownloadsRoot() {
  const root = getRepoDownloadsRoot();
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  return root;
}

module.exports = {
  getRepoDownloadsRoot,
  ensureRepoDownloadsRoot,
};
