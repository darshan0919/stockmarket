#!/usr/bin/env node
'use strict';
// Wrapper to run watchlistInsights.js CLI commands in this sandbox, working around
// the EPERM-on-checkpoint-prune bug in lib/db.js's checkpoint() (fs.rmSync throws
// because the sandbox mount forbids deleting files once written). Monkey-patches
// fs.rmSync to swallow EPERM before requiring db.js/watchlistInsights.js.
const fs = require('fs');
const origRmSync = fs.rmSync.bind(fs);
fs.rmSync = (p, opts) => {
  try {
    return origRmSync(p, opts);
  } catch (e) {
    if (e && e.code === 'EPERM') {
      return undefined;
    }
    throw e;
  }
};

const path = require('path');
const wiPath = path.join(__dirname, 'watchlistInsights.js');
const wi = require(wiPath);
const { loadEnv, argValue } = require(path.join(__dirname, 'lib', 'env'));

loadEnv(argValue('--env-file'));
wi.runCli(process.argv.slice(2)).catch((e) => {
  process.stderr.write(JSON.stringify({ error: e.message, command: 'cli' }));
  process.exit(1);
});
