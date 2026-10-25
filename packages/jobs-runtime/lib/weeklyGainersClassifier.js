#!/usr/bin/env node
'use strict';

const gainersClassifier = require('./gainersClassifier');

if (require.main === module) {
  try {
    gainersClassifier.main({
      rawPrefix: 'weekly_gainers_raw',
      insightsPrefix: 'weekly_gainers_insights',
      seedPrefix: 'weekly_gainers_research_seed',
      eventType: 'weekly_gainer',
      creator: 'weekly-gainers-signal',
    });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
