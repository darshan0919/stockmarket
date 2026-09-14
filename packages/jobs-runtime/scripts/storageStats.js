#!/usr/bin/env node
'use strict';

/**
 * storageStats.js — CLI script to generate and print collection storage stats table.
 *
 * Usage:
 *   yarn data:stats
 *   node packages/jobs-runtime/scripts/storageStats.js
 */

const { printStorageStatsTable } = require('../lib/storageStats');

printStorageStatsTable();
