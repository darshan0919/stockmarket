#!/usr/bin/env node
'use strict';

/**
 * One-time OAuth2 consent flow for Google Drive API access.
 *
 * Usage:
 *   node lib/googleDriveAuth.js
 *   yarn cowork:data:auth
 *
 * Prerequisites:
 *   1. Create a Google Cloud project at https://console.cloud.google.com/
 *   2. Enable the Google Drive API
 *   3. Create an OAuth 2.0 Client ID (Desktop application type)
 *   4. Download credentials.json → place at packages/cowork-jobs/data/credentials.json
 *      OR set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env
 *
 * What this script does:
 *   1. Reads client credentials from credentials.json or .env
 *   2. Opens a browser for Google consent
 *   3. Starts a local HTTP server to receive the callback
 *   4. Exchanges the auth code for a refresh token
 *   5. Appends GOOGLE_REFRESH_TOKEN (and optionally client ID/secret) to root .env
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { URL } = require('url');
const { loadEnv, argValue } = require('./env');

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
const REDIRECT_PORT = 3456;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

function readCredentialsFile() {
  const candidates = [
    path.join(process.cwd(), 'credentials.json'),
    path.join(__dirname, '..', 'data', 'credentials.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        const creds = raw.installed || raw.web || raw;
        return {
          clientId: creds.client_id,
          clientSecret: creds.client_secret,
        };
      } catch {
        continue;
      }
    }
  }
  return null;
}

function resolveCredentials() {
  // Priority: env vars > credentials.json file
  const fromEnv =
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }
      : null;

  const fromFile = readCredentialsFile();

  const creds = fromEnv || fromFile;
  if (!creds) {
    throw new Error(
      'No Google OAuth credentials found.\n' +
        'Either:\n' +
        '  1. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env, OR\n' +
        '  2. Place credentials.json (from Google Cloud Console) in packages/cowork-jobs/data/\n\n' +
        'To get credentials:\n' +
        '  1. Go to https://console.cloud.google.com/\n' +
        '  2. Create a project → Enable Google Drive API\n' +
        '  3. Create OAuth 2.0 Client ID (Desktop app type)\n' +
        '  4. Download as credentials.json'
    );
  }
  return creds;
}

function getOAuth2Client(creds) {
  let google;
  try {
    google = require('googleapis').google;
  } catch {
    throw new Error(
      'googleapis package is required. Run: yarn add googleapis'
    );
  }
  return new google.auth.OAuth2(creds.clientId, creds.clientSecret, REDIRECT_URI);
}

function openBrowser(url) {
  const { exec } = require('child_process');
  const platform = process.platform;
  if (platform === 'darwin') exec(`open "${url}"`);
  else if (platform === 'win32') exec(`start "" "${url}"`);
  else exec(`xdg-open "${url}"`);
}

/**
 * Start a temporary local server to receive the OAuth callback.
 * @returns {Promise<string>} The authorization code
 */
function waitForAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Authorization failed</h1><p>${error}</p>`);
          server.close();
          reject(new Error(`Authorization denied: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(
            '<h1>✅ Authorization successful!</h1>' +
              '<p>You can close this tab. The refresh token has been saved.</p>' +
              '<script>setTimeout(() => window.close(), 2000)</script>'
          );
          server.close();
          resolve(code);
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      } catch (e) {
        res.writeHead(500);
        res.end('Internal error');
        reject(e);
      }
    });

    server.listen(REDIRECT_PORT, () => {
      // Server ready, caller should open browser
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${REDIRECT_PORT} is in use. Close the conflicting process and try again.`
          )
        );
      } else {
        reject(err);
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timed out after 5 minutes'));
    }, 5 * 60 * 1000);
  });
}

function appendToEnvFile(entries) {
  const envPath =
    process.env.COWORK_ENV || path.join(__dirname, '..', '..', '..', '.env');
  let content = '';
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, 'utf8');
    if (!content.endsWith('\n')) content += '\n';
  }

  content += '\n# Google Drive API credentials (generated by yarn cowork:data:auth)\n';
  for (const [key, val] of Object.entries(entries)) {
    // Remove existing line for this key (if any)
    const re = new RegExp(`^${key}=.*$`, 'm');
    content = content.replace(re, '').replace(/\n{3,}/g, '\n\n');
    content += `${key}=${val}\n`;
  }

  fs.writeFileSync(envPath, content);
  return envPath;
}

async function main() {
  const creds = resolveCredentials();
  const oauth2 = getOAuth2Client(creds);

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force consent to always get a refresh token
  });

  console.log('Opening browser for Google authorization...');
  console.log(`\nIf the browser doesn't open, visit this URL manually:\n${authUrl}\n`);
  openBrowser(authUrl);

  console.log('Waiting for authorization (timeout: 5 minutes)...');
  const code = await waitForAuthCode();

  console.log('Exchanging auth code for tokens...');
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      'No refresh token received. This can happen if you previously authorized this app.\n' +
        'Go to https://myaccount.google.com/permissions → remove this app → try again.'
    );
  }

  // Save to .env
  const entries = {
    GOOGLE_CLIENT_ID: creds.clientId,
    GOOGLE_CLIENT_SECRET: creds.clientSecret,
    GOOGLE_REFRESH_TOKEN: tokens.refresh_token,
  };

  const envPath = appendToEnvFile(entries);
  console.log(`\n✅ Refresh token saved to ${envPath}`);
  console.log('You can now use Drive API mode:');
  console.log('  yarn cowork:data:doctor   — check status');
  console.log('  yarn cowork:data:push     — upload local data to Drive');
  console.log('  yarn cowork:data:pull     — download Drive data locally');
}

if (require.main === module) {
  loadEnv(argValue('--env-file'));
  main().catch((e) => {
    console.error(`\n❌ ${e.message}`);
    process.exit(1);
  });
}

module.exports = { resolveCredentials, appendToEnvFile };
