/**
 * Unit tests for portUtils
 * @file backend/utils/__tests__/portUtils.test.js
 * @see docs/backend/utils/portUtils.md for documentation
 */

const { isPortAvailable, findAvailablePort } = require('../portUtils');
const net = require('net');

describe('portUtils', () => {
  let testServer;

  afterEach((done) => {
    if (testServer && testServer.listening) {
      testServer.close(done);
    } else {
      done();
    }
  });

  describe('isPortAvailable', () => {
    it('returns true for available port', async () => {
      const available = await isPortAvailable(9999);
      expect(available).toBe(true);
    });

    it('returns false for busy port', async () => {
      testServer = net.createServer();
      await new Promise((resolve) => testServer.listen(9998, resolve));

      const available = await isPortAvailable(9998);
      expect(available).toBe(false);
    });
  });

  describe('findAvailablePort', () => {
    it('returns preferred port when available', async () => {
      const port = await findAvailablePort(9997);
      expect(port).toBe(9997);
    });

    it('returns next available port when preferred is busy', async () => {
      testServer = net.createServer();
      await new Promise((resolve) => testServer.listen(9996, resolve));

      const port = await findAvailablePort(9996);
      expect(port).toBe(9997); // Should use 9996 + 1
    });

    it('tries multiple ports if needed', async () => {
      // Occupy 9995, 9996, 9997
      const servers = [];
      for (let i = 0; i < 3; i++) {
        const server = net.createServer();
        await new Promise((resolve) => server.listen(9995 + i, resolve));
        servers.push(server);
      }

      const port = await findAvailablePort(9995);
      expect(port).toBe(9998); // Should use 9995 + 3

      // Cleanup
      servers.forEach((s) => s.close());
    });

    it('throws error when no port available within maxAttempts', async () => {
      // Occupy ports 9990-9992
      const servers = [];
      for (let i = 0; i < 3; i++) {
        const server = net.createServer();
        await new Promise((resolve) => server.listen(9990 + i, resolve));
        servers.push(server);
      }

      await expect(findAvailablePort(9990, 3)).rejects.toThrow('Could not find an available port');

      // Cleanup
      servers.forEach((s) => s.close());
    });
  });
});
