#!/usr/bin/env node
'use strict';

/**
 * offloadToDrive.js — COMPATIBILITY WRAPPER (Data Ecosystem v2).
 *
 * The legacy jobs/v1 offload (upload-then-delete) is retired. "Offload" now
 * means: push the full data/ mirror to Drive `StockMarket/data/v2` and KEEP
 * everything locally — nothing is deleted (docs/DATA_ECOSYSTEM.md §5).
 *
 * Kept only so older SKILL.md instructions and scheduled jobs that still call
 * `node packages/jobs-runtime/scripts/offloadToDrive.js` keep working.
 * New code should call `node packages/jobs-runtime/scripts/data.js push`
 * (yarn data:push) directly.
 */

console.log('[Offload] v2: delegating to data.js push (push-only, no local deletes).');
process.argv[2] = 'push';
require('./data.js');
