#!/usr/bin/env node
'use strict';

const path = require('path');
const { fetchAndExtract } = require('../src/fetchers/announcementScanner.js');

function parseArgs(argv) {
  const opts = {
    keyword: null,
    quarters: 4,
    minMcap: 300,
    output: null,
  };

  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--keyword':
        opts.keyword = argv[++i];
        break;
      case '--quarters':
        opts.quarters = parseInt(argv[++i], 10);
        break;
      case '--min-mcap':
        opts.minMcap = parseFloat(argv[++i]);
        break;
      case '--output':
        opts.output = argv[++i];
        break;
      default:
        if (!arg.startsWith('--')) positional.push(arg);
        break;
    }
  }

  // Allow `announcement-keyword-explorer.js "hydrogen train"` without --keyword
  if (!opts.keyword && positional.length > 0) {
    opts.keyword = positional.join(' ');
  }

  return opts;
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.length === 0) {
    console.log(`Usage: announcement-keyword-explorer --keyword "<seed keyword>" [options]`);
    console.log(`Options:
  --keyword <phrase>   Seed keyword to search (required; positional arg also works)
  --quarters <n>       How many past quarters to scan (default 4)
  --min-mcap <n>       Market cap floor in Cr (default 300)
  --output <path>      Write full JSON result to this path (also prints to stdout)
  --help               Show this help message

Auth: requires STOCKSCANS_AUTH_TOKEN (or legacy STOCKSCANS_AUTHTOKEN) env var,
or a .env file with that key on disk. Log in to stockscans.in and copy the
'authtoken' cookie to get one.`);
    process.exit(argv.length === 0 ? 1 : 0);
  }

  const opts = parseArgs(argv);

  if (!opts.keyword) {
    console.error(
      JSON.stringify({
        ok: false,
        outputs: [],
        warnings: ['No --keyword provided. Run with --help for usage.'],
      })
    );
    process.exit(1);
  }

  if (!Number.isFinite(opts.quarters) || opts.quarters <= 0) opts.quarters = 4;
  if (!Number.isFinite(opts.minMcap) || opts.minMcap < 0) opts.minMcap = 300;

  const outputPath = opts.output ? path.resolve(opts.output) : null;

  try {
    const data = await fetchAndExtract(opts.keyword, {
      quarters: opts.quarters,
      minMcap: opts.minMcap,
      output: outputPath,
    });

    const errorCount = data.errors ? data.errors.length : 0;
    const quarterCount = data.quarters_fetched ? data.quarters_fetched.length : 0;
    // Every quarter errored (e.g. auth failure) -> this is a hard failure, not
    // "no announcements found". Surface it as ok:false so callers don't mistake
    // a broken auth token for a genuinely quiet keyword.
    const allQuartersFailed = quarterCount > 0 && errorCount === quarterCount;

    const result = {
      ok: !allQuartersFailed,
      outputs: outputPath ? [outputPath] : [],
      warnings: data.errors && data.errors.length ? data.errors : [],
      summary: {
        keyword: data.keyword,
        quarters_fetched: data.quarters_fetched,
        total_announcements: data.total_announcements,
        per_quarter_counts: Object.fromEntries(
          Object.entries(data.per_quarter).map(([qd, v]) => [qd, v.count])
        ),
      },
      data: outputPath ? undefined : data,
    };

    if (allQuartersFailed) {
      console.error(JSON.stringify(result));
      process.exit(1);
    }
    console.log(JSON.stringify(result));
  } catch (e) {
    console.error(
      JSON.stringify({
        ok: false,
        outputs: [],
        warnings: [e.message],
      })
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseArgs };
