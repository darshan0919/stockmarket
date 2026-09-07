#!/usr/bin/env node
'use strict';

/**
 * orderBookDigest.js — Daily/Weekly Order Book updates tracker
 *
 * Uses Stockscans API to search for corporate announcements related to
 * "order", "contract", "award", "LOA", "L1 bidder", etc.
 */

const { StockscansClient } = require('@stock/api');
const fs = require('fs');
const path = require('path');
const { loadEnv } = require('./lib/env');
const apiUsageTracker = require('./lib/apiUsageTracker');
const { resolveJobName } = require('./lib/scriptJobName');
const db = require('./lib/db');

loadEnv(path.join(__dirname, '../../.env'));

/**
 * Synthesis is no longer done by this script (conventions.md §24 —
 * NO script in this repo may call an LLM provider API directly; that was
 * `lib/anthropicClient.js`'s job and it has been removed). Extraction
 * (fetching + combining the announcement text below) stays here per §17;
 * the "extract order wins, contract values, and winning company from this
 * batch" step is now an AGENT-executed instruction, run by reading the
 * pending-synthesis file this script writes and following the prompt text
 * embedded in it — see `writePendingSynthesis` below.
 */
function writePendingSynthesis(text) {
  const runsDir = path.join(db.dataRoot(), 'runs');
  fs.mkdirSync(runsDir, { recursive: true });
  const outPath = path.join(runsDir, 'order-book-digest-pending-synthesis.md');
  const body = `# Order Book Digest — pending synthesis

This is an AGENT step (not a script LLM call — see conventions.md §24). Read the
announcements below and extract every specific order win, contract awarded, or LOA:
for each, name the client, the order value (if any), and the company winning the
order. Then record this run's observed token usage via:
  yarn record-token-usage --job <job-name> --input <n> --output <n>

## Announcements

${text.substring(0, 80000)}
`;
  fs.writeFileSync(outPath, body);
  return outPath;
}

async function runOrderBookDigest({ jobName = null } = {}) {
  console.log('Starting Order Book Digest...');
  const client = new StockscansClient();
  client.setJobName(jobName);

  const payload = {
    scan: {
      scanId: '',
      scanName: 'Order Book Scan',
      filters: [],
      industry: [],
      index: [],
      watchlistIds: [],
      searchFilters: [],
      announcementType: 'All',
      alerts: false,
      searchMode: 'full',
      companyIds: [],
      companyFilters: [],
      query: 'order OR contract OR award OR LOA OR L1 bidder',
    },
    offset: 0,
    quarterDate: '',
  };

  try {
    const data = await client.scanAnnouncements(payload, { optionalAuth: true });
    const items = data?.announcements || data?.items || [];
    console.log(`Found ${items.length} recent order announcements.`);

    if (items.length > 0) {
      const combinedText = items
        .map((i) => `[${i.companyName || i.ticker}] ${i.subject}\n${i.description}`)
        .join('\n\n');
      const pendingPath = writePendingSynthesis(combinedText);
      console.log(`Wrote pending synthesis for an agent to pick up: ${pendingPath}`);
    }
    console.log('Order Book Digest completed successfully.');
  } catch (err) {
    console.error('Failed to run Order Book Digest:', err.message);
  }
}

if (require.main === module) {
  const jobName = resolveJobName('manual-order-book-digest');
  runOrderBookDigest({ jobName })
    .catch(console.error)
    .finally(() => apiUsageTracker.flush(jobName));
}

module.exports = { runOrderBookDigest };
