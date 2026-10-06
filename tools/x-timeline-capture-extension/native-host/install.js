#!/usr/bin/env node
'use strict';

/**
 * One-time installer: lets the extension talk to this repo's KB.
 *   node tools/x-timeline-capture-extension/native-host/install.js [--browser chrome|chromium|brave|edge] [--print] [--soft]
 * --soft = for `yarn setup`: never fail the setup (unsupported OS, CI, read-only home -> warn and exit 0).
 * Writes a launcher script (absolute node path) and registers the native-messaging host manifest for the
 * extension's fixed id (derived from the public key in ../manifest.json). Re-run after moving the repo or
 * changing node. Nothing is installed system-wide; remove the manifest file to uninstall.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const HOST_NAME = 'com.stockmarket.x_kb';
const HERE = __dirname;

/** Chrome derives an extension id from the SHA-256 of the DER public key: first 16 bytes, hex -> a..p. */
function extensionIdFromKey(b64Key) {
  const der = Buffer.from(b64Key, 'base64');
  const hex = crypto.createHash('sha256').update(der).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode('a'.charCodeAt(0) + parseInt(c, 16))).join('');
}

function manifestDir(browser, platform = process.platform, home = os.homedir()) {
  const mac = {
    chrome: 'Google/Chrome',
    chromium: 'Chromium',
    brave: 'BraveSoftware/Brave-Browser',
    edge: 'Microsoft Edge',
  };
  const linux = {
    chrome: 'google-chrome',
    chromium: 'chromium',
    brave: 'BraveSoftware/Brave-Browser',
    edge: 'microsoft-edge',
  };
  if (!mac[browser]) throw new Error(`unknown browser: ${browser}`);
  if (platform === 'darwin')
    return path.join(home, 'Library/Application Support', mac[browser], 'NativeMessagingHosts');
  if (platform === 'linux')
    return path.join(home, '.config', linux[browser], 'NativeMessagingHosts');
  throw new Error(`unsupported platform: ${platform} (macOS/Linux only)`);
}

function buildHostManifest({ launcherPath, extensionId }) {
  return {
    name: HOST_NAME,
    description: 'Writes X timeline captures into the stockmarket KB',
    path: launcherPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };
}

function main() {
  const args = process.argv.slice(2);
  const browser = args.includes('--browser') ? args[args.indexOf('--browser') + 1] : 'chrome';
  const printOnly = args.includes('--print');

  const ext = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'manifest.json'), 'utf8'));
  if (!ext.key)
    throw new Error('extension manifest.json has no "key" — cannot derive a stable extension id');
  const extensionId = extensionIdFromKey(ext.key);

  const genDir = path.join(HERE, '.generated');
  const launcherPath = path.join(genDir, 'launcher.sh');
  const launcher = `#!/bin/sh\nexec "${process.execPath}" "${path.join(HERE, 'host.js')}"\n`;
  const dir = manifestDir(browser);
  const manifestPath = path.join(dir, `${HOST_NAME}.json`);
  const manifest = buildHostManifest({ launcherPath, extensionId });

  if (printOnly) {
    console.log(JSON.stringify({ extensionId, launcherPath, manifestPath, manifest }, null, 2));
    return;
  }
  // Create the manifest dir FIRST: if it cannot be written (read-only HOME, wrong user) we must fail before
  // touching the existing launcher, otherwise a failed run leaves a working install pointing at a wrong node.
  fs.mkdirSync(dir, { recursive: true });
  fs.accessSync(dir, fs.constants.W_OK);
  fs.mkdirSync(genDir, { recursive: true });
  fs.writeFileSync(launcherPath, launcher, { mode: 0o755 });
  fs.chmodSync(launcherPath, 0o755);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(
    `Installed native host for ${browser}.\n  extension id: ${extensionId}\n  manifest:     ${manifestPath}\n  launcher:     ${launcherPath}\nNow reload the extension in chrome://extensions.`
  );
}

if (require.main === module) {
  if (process.argv.includes('--soft')) {
    if (process.env.CI) {
      console.log('x-timeline-capture host: skipped (CI).');
    } else {
      try {
        main();
      } catch (e) {
        console.warn(`x-timeline-capture host: skipped (${e.message}). Run install.js manually if you use the extension.`);
      }
    }
  } else main();
}
module.exports = { extensionIdFromKey, manifestDir, buildHostManifest, HOST_NAME };
