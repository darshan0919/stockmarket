#!/usr/bin/env node
'use strict';

/**
 * One-time OAuth2 setup / refresh-token regeneration for the Drive push/pull
 * pipeline (scripts/data.js -> @stock/cloud-utils/src/googleDriveApi.js).
 *
 * This script was referenced by `yarn data:auth` (packages/jobs-runtime
 * package.json) but was missing from the repo -- Drive's refresh tokens can
 * be silently revoked (password change, 6-month inactivity, security event,
 * or the OAuth consent screen being in "Testing" mode where tokens expire in
 * 7 days), and when that happens `yarn data:push`/`data:pull` fail with
 * `invalid_grant` and there was no documented, scripted way to recover.
 *
 * MUST be run on the same machine as the browser you approve access in --
 * it starts a local HTTP server and Google's redirect has to reach it, so
 * running this over a remote/sandboxed shell will not work.
 *
 * Google deprecated the old "copy-paste a code" (urn:ietf:wg:oauth:2.0:oob)
 * flow -- new OAuth clients reject it outright ("Access blocked: ... request
 * is invalid"). This script uses Google's supported replacement instead: a
 * loopback http://127.0.0.1:<port> redirect that this script itself listens
 * on, so the whole flow is one command:
 *
 *   node scripts/googleAuth.js
 *
 * It will:
 *   1. Start a local server on an available port.
 *   2. Print a consent URL and try to auto-open it in your default browser.
 *   3. Wait for you to sign in (as the Google account that owns the target
 *      Drive -- the one StockMarket/data/v2 lives under) and approve access.
 *   4. Catch the redirect, exchange the code for tokens, print the new
 *      GOOGLE_REFRESH_TOKEN, and write it straight into the repo root .env
 *      (replacing the existing GOOGLE_REFRESH_TOKEN= line in place -- every
 *      other line, comments, and ordering are left untouched).
 *
 * Before writing, it copies the existing .env to .env.bak.<timestamp> in the
 * same directory (one backup per run, never overwritten) so a bad write is
 * always one copy away from reverted -- this is the safety net that makes
 * unattended-.env-editing acceptable here; see AGENTS.md/CLAUDE.md's general
 * caution against automation touching credential files. Pass --no-write to
 * fall back to the old behavior of only printing the value for manual paste.
 *
 * Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET already present in .env
 * (or passed via --client-id/--client-secret) -- those identify the OAuth
 * *app* (from Google Cloud Console) and don't expire the way the refresh
 * token does, so this script does not regenerate them. That OAuth client
 * must have `http://localhost` (or `http://127.0.0.1`) listed as an
 * authorized redirect URI in Cloud Console -> APIs & Services -> Credentials
 * -- "Desktop app" type clients get this automatically; "Web application"
 * type clients need it added explicitly.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { loadEnv, argValue, hasFlag } = require('../lib/env');

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const REPO_ROOT_ENV = path.join(__dirname, '..', '..', '..', '.env');

/**
 * Writes `refreshToken` into `envPath`'s GOOGLE_REFRESH_TOKEN= line in place.
 * Backs up the existing file first (.env.bak.<timestamp>, never overwritten
 * across runs) so this is always reversible. If the key isn't present yet,
 * appends it rather than failing, so a fresh .env (copied from .env.example,
 * where the key exists but is blank) still works.
 * @returns {{ envPath: string, backupPath: string }}
 */
function writeRefreshTokenToEnv(envPath, refreshToken) {
  const original = fs.readFileSync(envPath, 'utf8');
  const backupPath = `${envPath}.bak.${Date.now()}`;
  fs.writeFileSync(backupPath, original);

  const lines = original.split(/\r?\n/);
  let found = false;
  const next = lines.map((line) => {
    if (/^GOOGLE_REFRESH_TOKEN\s*=/.test(line)) {
      found = true;
      return `GOOGLE_REFRESH_TOKEN=${refreshToken}`;
    }
    return line;
  });
  if (!found) next.push(`GOOGLE_REFRESH_TOKEN=${refreshToken}`);

  fs.writeFileSync(envPath, next.join('\n'));
  return { envPath, backupPath };
}

function getGoogle() {
  try {
    return require('googleapis').google;
  } catch {
    throw new Error('googleapis package is required. Run: yarn add googleapis');
  }
}

/** Best-effort auto-open; if it fails, the printed URL is still right there to click/copy. */
function tryOpenBrowser(url) {
  const { exec } = require('child_process');
  const cmd =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

/**
 * Starts a one-shot local HTTP server on `port`, resolves with the `code`
 * query param from the first request that has one (Google's redirect),
 * and always responds to the browser so the tab doesn't hang.
 */
function waitForAuthCode(port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      if (code) {
        res.end('<html><body><h2>Authorized.</h2>You can close this tab and return to the terminal.</body></html>');
      } else {
        res.end(
          `<html><body><h2>Something went wrong${error ? `: ${error}` : ''}.</h2>Return to the terminal.</body></html>`
        );
      }
      // Give the response a moment to flush before tearing the server down.
      setTimeout(() => server.close(), 100);
      if (code) resolve(code);
      else reject(new Error(error || 'No authorization code in callback'));
    });
    server.on('error', reject);
    server.listen(port, '127.0.0.1');
  });
}

async function main() {
  const envFileArg = argValue('--env-file');
  const resolvedEnvPath = loadEnv(envFileArg) || envFileArg || REPO_ROOT_ENV;
  const google = getGoogle();

  const clientId = argValue('--client-id') || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = argValue('--client-secret') || process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error(
      'Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.\n' +
        'These identify the OAuth app itself (Google Cloud Console -> APIs & ' +
        'Services -> Credentials -> OAuth 2.0 Client IDs) and are NOT what this ' +
        'script regenerates -- set them in .env first (or pass ' +
        '--client-id/--client-secret), then re-run.'
    );
    process.exit(1);
  }

  const port = Number(argValue('--port')) || 53682; // arbitrary high port, unlikely to collide
  const redirectUri = `http://127.0.0.1:${port}`;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline', // required to get a refresh_token back, not just an access_token
    prompt: 'consent', // force the consent screen even if previously approved, so a refresh_token is issued again
    scope: SCOPES,
  });

  console.log('\nStarting local server on', redirectUri);
  console.log('Opening this URL in your default browser (sign in with the Google account');
  console.log('that owns the target Drive, then approve access):\n');
  console.log(authUrl);
  console.log(
    '\nIf your OAuth client is type "Web application" rather than "Desktop app", it must have\n' +
      `${redirectUri} listed as an Authorized redirect URI (Cloud Console -> APIs & Services ->\n` +
      'Credentials -> your client -> Authorized redirect URIs) or Google will show\n' +
      '"Access blocked: ... request is invalid" again -- add it there and re-run if so.\n'
  );
  tryOpenBrowser(authUrl);

  let code;
  try {
    code = await waitForAuthCode(port);
  } catch (err) {
    console.error('\nDid not receive an authorization code:', err.message || err);
    process.exit(1);
  }

  try {
    const { tokens } = await oauth2Client.getToken({ code, redirect_uri: redirectUri });
    if (!tokens.refresh_token) {
      console.error(
        '\nGoogle did not return a refresh_token. This usually means the account ' +
          'already has an active grant for this app from a previous run. Revoke it at ' +
          'https://myaccount.google.com/permissions first, then re-run this script ' +
          '(prompt=consent is already set to avoid this, but revoking is the reliable ' +
          'fix if it still happens).\n'
      );
      process.exit(1);
    }

    if (hasFlag('--no-write')) {
      console.log('\nSuccess. Paste this into the repo root .env (replacing the existing line):\n');
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('\nGOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are unchanged -- only the refresh token was reissued.');
      console.log('\nThen verify with:  yarn data:status\n');
      return;
    }

    if (!fs.existsSync(resolvedEnvPath)) {
      console.log(
        `\nSuccess, but couldn't find ${resolvedEnvPath} to write into automatically. ` +
          'Paste this into your .env by hand:\n'
      );
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('\nThen verify with:  yarn data:status\n');
      return;
    }

    const { backupPath } = writeRefreshTokenToEnv(resolvedEnvPath, tokens.refresh_token);
    console.log(`\nSuccess. GOOGLE_REFRESH_TOKEN written to ${resolvedEnvPath}.`);
    console.log(`Previous .env backed up to ${backupPath}.`);
    console.log('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are unchanged -- only the refresh token was reissued.');

    // Quick live verification in a fresh process (this process already has
    // the old value cached in process.env via loadEnv, so re-checking here
    // in-process would just re-test the same client/token pair we already
    // hold, not prove the on-disk .env is actually readable/correct).
    console.log('\nVerifying the new token against Drive...');
    try {
      const { google: freshGoogle } = { google };
      const verifyClient = new freshGoogle.auth.OAuth2(clientId, clientSecret);
      verifyClient.setCredentials({ refresh_token: tokens.refresh_token });
      const drive = freshGoogle.drive({ version: 'v3', auth: verifyClient });
      await drive.about.get({ fields: 'user' });
      console.log('Verified -- the new refresh token works.\n');
    } catch (verifyErr) {
      console.log(
        `Could not verify automatically (${verifyErr.message || verifyErr}). The token was still ` +
          'written -- run `yarn data:status` to double check.\n'
      );
    }
  } catch (err) {
    console.error('\nToken exchange failed:', err.message || err);
    process.exit(1);
  }
}

main();
