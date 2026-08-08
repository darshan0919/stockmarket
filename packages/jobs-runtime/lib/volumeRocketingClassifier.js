#!/usr/bin/env node
/**
 * Volume Rocketing classifier — thin wrapper around gainersClassifier.js's `main()`.
 * Reads:  data/runs/volume_rocketing_raw_{YYYYMMDD}.json (written by volumeRocketingScanner)
 * Writes: classified signals → events collection via lib/db.js (type: "volume-rocket"),
 *         plus data/runs/volume_rocketing_insights_{YYYYMMDD}.json (full DTO for the
 *         email render — same shape/tiering as gainers-signal's DTO).
 *
 * No tiering/conviction/evidence logic is duplicated here — see gainers-signal
 * SKILL.md Step 2 for what each field means; this file only supplies the
 * different filename prefixes / event type / creator gainersClassifier.main()
 * needs to run the identical pipeline against the Volume Rocketing raw scan.
 */
const gainersClassifier = require('./gainersClassifier');

function main() {
  return gainersClassifier.main({
    rawPrefix: 'volume_rocketing_raw',
    insightsPrefix: 'volume_rocketing_insights',
    seedPrefix: 'volume_rocketing_research_seed',
    eventType: 'volume-rocket',
    creator: 'volume-rocketing',
  });
}

module.exports = { main };

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
