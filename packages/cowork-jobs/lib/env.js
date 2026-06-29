'use strict';

const fs = require('fs');

/**
 * Minimal .env loader (no dependency). Loads KEY=VALUE lines into process.env
 * without overwriting values already present. Returns the path used, or null.
 *
 * Resolution: explicit path arg → COWORK_ENV → repo root .env.
 * @param {string} [explicitPath]
 * @returns {string|null}
 */
function loadEnv(explicitPath) {
  const path = explicitPath || process.env.COWORK_ENV || require('path').join(__dirname, '..', '..', '..', '.env');
  if (!fs.existsSync(path)) return null;
  for (const raw of fs.readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = val;
  }
  return path;
}

/** Read --flag value from argv (returns null if absent). */
function argValue(flag, argv = process.argv) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
}

/** Is a boolean flag present in argv? */
function hasFlag(flag, argv = process.argv) {
  return argv.includes(flag);
}

module.exports = { loadEnv, argValue, hasFlag };
