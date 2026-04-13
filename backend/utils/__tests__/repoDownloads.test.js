/**
 * Unit tests for repo downloads path helper
 * @file backend/utils/__tests__/repoDownloads.test.js
 */

const path = require('path');
const { getRepoDownloadsRoot, ensureRepoDownloadsRoot } = require('../repoDownloads');

describe('repoDownloads', () => {
  it('getRepoDownloadsRoot resolves to repo downloads next to backend/', () => {
    const root = getRepoDownloadsRoot();
    expect(root).toBe(path.resolve(__dirname, '..', '..', '..', 'downloads'));
  });

  it('ensureRepoDownloadsRoot returns existing or created path', () => {
    const root = ensureRepoDownloadsRoot();
    expect(root).toBe(getRepoDownloadsRoot());
  });
});
