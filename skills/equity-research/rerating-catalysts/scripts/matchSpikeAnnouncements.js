#!/usr/bin/env node
'use strict';

/**
 * matchSpikeAnnouncements.js — deterministic half of the "Price-Volume Spike
 * Days" WHY step. For each spike day found by
 * `stock-api/src/analyzers/priceSpikeSignals.js`, fetches the corporate
 * announcements in a window around that date and provisionally annotates
 * them (title/description only, via `announcementTaxonomy.annotate()`).
 *
 * This script does NOT decide why a day spiked. It only assembles the
 * CANDIDATE announcements for the agent to read and reason over, exactly the
 * same script/judgment split `gainers-signal`/`volume-rocketing` use for
 * their WHY ladder (`skills/equity-research/_shared/scan-signal-pipeline.md`
 * Step 5) — annotate() output here is provisional (`strengthSource: 'title'`)
 * and must never be reported as a final verdict; the agent must call
 * `resolveFilingContent()` / read the PDF and use `annotateFromContent()`
 * before asserting STRONG/SUPPORTING/ROUTINE for any candidate that ends up
 * cited as the WHY (conventions: strength is never judged from a title alone).
 *
 * Why a window, not just the spike date itself: an order win or result filed
 * a few days before delivery-backed buying shows up is a legitimate, common
 * pattern (see scan-signal-pipeline.md's "prior_week_announcements" / rung 1
 * lag-reporting rule) — and NSE/BSE dissemination can lag same-day price
 * action by hours. Default window: [-3, 0] calendar days relative to the
 * spike date (the announcement must be ON or BEFORE the spike — an
 * announcement disseminated AFTER a spike cannot have caused it and is
 * excluded rather than left for the agent to discard).
 *
 * No LLM calls here (conventions §24) — fetch + provisional classify only.
 */

const {
  fetchAnnouncements,
} = require('../../../../stock-api/src/fetchers/announcementsFetcher.js');
const taxonomy = require('../../../../packages/jobs-runtime/lib/announcementTaxonomy.js');

/**
 * @param {string} companyId - canonical EXCH:SYMBOL (e.g. "NSE:EMUDHRA").
 * @param {Array<{date: string}>} spikeDays - output of priceSpikeSignals.findSpikeDays()/findRecentSpikeDays().spikeDays.
 * @param {Object} [opts]
 * @param {number} [opts.lookbackDays=3] - how many calendar days BEFORE the spike date to include.
 * @returns {Promise<Array<{spikeDate: string, windowStart: string, windowEnd: string, candidates: Array}>>}
 */
async function matchSpikeAnnouncements(companyId, spikeDays, { lookbackDays = 3 } = {}) {
  const results = [];
  for (const day of spikeDays) {
    const spikeDate = day.date;
    const windowStart = shiftDate(spikeDate, -lookbackDays);
    const windowEnd = spikeDate; // never include announcements disseminated after the spike

    const { matched } = await fetchAnnouncements(companyId, {
      start: windowStart,
      end: windowEnd,
      outputDir: null,
      listOnly: true,
      maxResults: 50,
    });

    const candidates = (matched || []).map((ann) => taxonomy.annotate({ ...ann }));
    // Provisional sort only — STRONG-titled first so the agent reads the
    // plausibly-cheap wins first; this is NOT a filter, every candidate stays.
    const order = { STRONG: 0, SUPPORTING: 1, ROUTINE: 2 };
    candidates.sort((a, b) => (order[a.strength] ?? 3) - (order[b.strength] ?? 3));

    results.push({
      spikeDate,
      windowStart,
      windowEnd,
      returnPct: day.returnPct,
      volumeMultiple: day.volumeMultiple,
      candidateCount: candidates.length,
      candidates,
    });
  }
  return results;
}

function shiftDate(isoDate, deltaDays) {
  const ms = Date.parse(`${isoDate}T00:00:00+05:30`) + deltaDays * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

module.exports = { matchSpikeAnnouncements, shiftDate };

// CLI: node matchSpikeAnnouncements.js NSE:EMUDHRA '[{"date":"2026-08-04"},{"date":"2026-08-18"}]'
if (require.main === module) {
  const [companyId, spikeDaysJson] = process.argv.slice(2);
  if (!companyId || !spikeDaysJson) {
    console.error('Usage: node matchSpikeAnnouncements.js <EXCH:SYMBOL> <spikeDaysJsonArray>');
    process.exit(1);
  }
  const spikeDays = JSON.parse(spikeDaysJson);
  matchSpikeAnnouncements(companyId, spikeDays)
    .then((out) => console.log(JSON.stringify(out, null, 2)))
    .catch((e) => {
      console.error('ERROR:', e.message);
      process.exit(1);
    });
}
