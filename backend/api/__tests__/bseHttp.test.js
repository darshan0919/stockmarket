/**
 * Unit tests for BSE HTTP client (undici)
 * @file backend/api/__tests__/bseHttp.test.js
 * @see docs/backend/api/bseIndiaApi.md for documentation
 */

const { buildBseUrl } = require('../bseHttp');

describe('bseHttp', () => {
  describe('buildBseUrl', () => {
    it('builds URL with query params', () => {
      const url = buildBseUrl('PeerSmartSearch/w', { Type: 'SS', text: 'DSSL' });
      expect(url).toContain('PeerSmartSearch/w');
      expect(url).toContain('text=DSSL');
      expect(url).toContain('Type=SS');
    });

    it('strips leading slash from path', () => {
      const url = buildBseUrl('/Corpforthresults/w');
      expect(url).toContain('Corpforthresults/w');
      expect(url).not.toContain('api//');
    });
  });
});
