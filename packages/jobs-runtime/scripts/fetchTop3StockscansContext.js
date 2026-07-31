#!/usr/bin/env node
'use strict';

/**
 * DEPRECATED — renamed to scripts/fetchResearchStockscansContext.js.
 *
 * gainers-signal's briefing step went from "top 3 by conviction" to "top 20 by
 * delivery % / delivery value", and the seed file it reads was renamed with it
 * (gainers_top3_context_*.json → gainers_research_seed_*.json). The name "Top3"
 * no longer describes anything true.
 *
 * This shim delegates so any pinned task or cron still invoking the old path keeps
 * working. It exists only because this mount is delete-restricted (docs/DATA_RULES.md
 * — no deletions in a write path); drop the file when the repo is next pruned and
 * nothing references it.
 */

process.stderr.write(
  '[deprecated] fetchTop3StockscansContext.js — use scripts/fetchResearchStockscansContext.js\n'
);

const delegate = require('./fetchResearchStockscansContext.js');

module.exports = delegate;

if (require.main === module) {
  delegate.main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
