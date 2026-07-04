/**
 * Port utility - Find available ports when default is in use
 * @module utils/portUtils
 * @see {@link docs/backend/utils/portUtils.md} for utility docs
 */

const net = require('net');

/**
 * Check if a port is available
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} True if port is available, false otherwise
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, '0.0.0.0');
  });
}

/**
 * Find an available port starting from the preferred port
 * Tries preferred port, then preferred+1, preferred+2, up to maxAttempts
 * @param {number} preferredPort - First port to try
 * @param {number} maxAttempts - Maximum number of ports to try (default: 10)
 * @returns {Promise<number>} Available port number
 * @throws {Error} If no available port found within maxAttempts
 */
async function findAvailablePort(preferredPort, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = preferredPort + i;
    const available = await isPortAvailable(port);

    if (available) {
      if (i > 0) {
        console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
      }
      return port;
    }
  }

  throw new Error(
    `Could not find an available port between ${preferredPort} and ${preferredPort + maxAttempts - 1}`
  );
}

module.exports = {
  isPortAvailable,
  findAvailablePort,
};
