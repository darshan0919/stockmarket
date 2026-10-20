#!/usr/bin/env node
'use strict';

const gainersClassifier = require('./gainersClassifier');

if (require.main === module) {
  try {
    gainersClassifier.main({
      rawPrefix: 'volume_rocketing_raw',
      insightsPrefix: 'volume_rocketing_insights',
      seedPrefix: 'volume_rocketing_research_seed',
      eventType: 'volume-rocket',
      creator: 'volume-rocketing',
    });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
