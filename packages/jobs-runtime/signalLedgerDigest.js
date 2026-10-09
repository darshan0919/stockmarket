#!/usr/bin/env node
'use strict';

/**
 * signalLedgerDigest — emails ONLY the signal-ledger transitions since a date (default: yesterday,
 * IST). Sends nothing when there are none. Zero LLM.
 *   node signalLedgerDigest.js [--since YYYY-MM-DD] [--no-email] [--env-file path]
 */

const { sendHtmlEmail } = require('@stock/cloud-utils');
const { loadEnv, argValue } = require('./lib/env');
const { istDate } = require('./lib/ist');
const { resolveJobName } = require('./lib/scriptJobName');
const apiUsageTracker = require('./lib/apiUsageTracker');
const signalLedger = require('./lib/signalLedger');
const { formatDigest } = require('./lib/signalDigest');

async function main() {
  loadEnv(argValue('--env-file'));
  const db = require('./lib/db');
  const noEmail = process.argv.includes('--no-email');
  const since =
    argValue('--since') || new Date(istDate().getTime() - 86400000).toISOString().slice(0, 10);

  const transitions = db.find('events', { type: 'signal_transition', since });
  const active = signalLedger.getStates({ activeOnly: true });
  const digest = formatDigest(transitions, active, { label: `since ${since}` });

  let email = { status: 'skipped', reason: digest ? '--no-email' : 'no transitions' };
  if (digest && !noEmail) {
    email = await sendHtmlEmail({
      subject: digest.subject,
      htmlBody: digest.html,
      to: process.env.DEALS_DIGEST_TO || undefined,
    });
  }
  console.log(
    JSON.stringify(
      { since, transitions: transitions.length, active: active.length, email },
      null,
      2
    )
  );
}

if (require.main === module) {
  const jobName = resolveJobName('signal-ledger-digest');
  main()
    .catch((e) => {
      console.error('signalLedgerDigest failed:', e);
      process.exit(1);
    })
    .finally(() => apiUsageTracker.flush(jobName));
}

module.exports = { main };
