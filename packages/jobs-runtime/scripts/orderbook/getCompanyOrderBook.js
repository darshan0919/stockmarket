#!/usr/bin/env node
'use strict';

/**
 * getCompanyOrderBook.js — the single cache-first entry point for "what is
 * company X's outstanding order book right now". Orchestrates:
 *
 *   1. base = latest concall-derived order book (packages/jobs-runtime/lib/
 *      concallNotesStore's cached `orderBook` field — never recomputed once
 *      cached; see extractOrderBook.js's processQuarter()).
 *   2. cumulative = base + every order-win announcement dated after the
 *      base's quarter (packages/jobs-runtime/lib/orderBookLedger.js).
 *
 * Every artifact this touches is permanently cached and content-addressed:
 *   - concall notes text + its order-book extraction  → concallNotesStore
 *   - each announcement's classification + extraction  → orderAnnouncementStore
 *   - the running per-company total                    → orderBookLedger
 * A second call for the same company with no new concall/announcements
 * makes ZERO network calls and reuses every prior computation verbatim.
 *
 * Usage: node getCompanyOrderBook.js <TICKER> [--env-file <path>]
 */

const { loadEnv, argValue } = require('../../lib/env');
loadEnv(argValue('--env-file'));
const { stockscans } = require('@stock/api');
const concallStore = require('../../lib/concallNotesStore');
const annStore = require('../../lib/orderAnnouncementStore');
const ledger = require('../../lib/orderBookLedger');
const { isOrderAnnouncement, extractOrderValue, AnnouncementValueNotFoundError } = require('../../lib/orderAnnouncementExtractor');
const { resolveTargets } = require('./fetchConcallNotes');
const { processQuarter } = require('./extractOrderBook');

/** "YYYYMM" -> "YYYY-MM-DD" of that month's last day (approx quarter-end watermark). */
function quarterEndDate(yyyymm) {
  const s = String(yyyymm);
  const year = parseInt(s.slice(0, 4), 10);
  const month = parseInt(s.slice(4, 6), 10);
  const lastDay = new Date(year, month, 0).getDate(); // month is 1-based here on purpose (JS Date day-0 trick)
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** Ensure the ledger's base reflects the latest available concall order-book figure. Idempotent. */
async function ensureBase(companyId) {
  const targets = await resolveTargets(companyId, { lastN: 1 });
  if (!targets.length) {
    return { ok: false, reason: 'no Transcript with hasNotes:true found for this company' };
  }
  const doc = targets[0];
  const existing = ledger.get(companyId);
  if (existing && existing.base && existing.base.sourceQuarter === doc.date) {
    return { ok: true, changed: false, quarter: doc.date }; // already up to date — no recompute
  }

  const result = await processQuarter(companyId, doc); // cache-first itself
  if (result.needsLlmFallback) {
    if (existing && existing.base) {
      return { ok: true, changed: false, quarter: existing.base.sourceQuarter, note: `latest concall (${doc.date}) needs LLM fallback for order-book value — continuing to use prior base (${existing.base.sourceQuarter})` };
    }
    return { ok: false, reason: 'needsLlmFallback', llmFallbackPrompt: result.llmFallbackPrompt, quarter: doc.date };
  }

  ledger.setBase(companyId, {
    valueCr: result.valueCr, unit: result.unit || 'cr',
    sourceType: 'concall', sourceQuarter: doc.date, sourceQuarterEndDate: quarterEndDate(doc.date),
    label: result.label, sourceLine: result.sourceLine,
  });
  return { ok: true, changed: true, quarter: doc.date };
}

/** Page through announcements newer than `sinceDate` (YYYY-MM-DD), classify+extract each, cache-first. */
async function processNewAnnouncements(companyId, sinceDate) {
  const applied = [];
  const pendingLlmFallback = [];
  let offset = 0;
  let maxDateSeen = sinceDate;

  for (let page = 0; page < 20; page++) { // 20 pages = 600 announcements — generous ceiling
    const data = await stockscans.announcements([companyId], offset);
    const rows = data.companyAnnouncements || [];
    if (!rows.length) break;

    let hitOlder = false;
    for (const ann of rows) {
      const d = (ann.date || '').slice(0, 10);
      if (sinceDate && d && d <= sinceDate) { hitOlder = true; continue; }
      if (d && d > maxDateSeen) maxDateSeen = d;

      let record = annStore.get(companyId, ann.ssUrl, d);
      if (!record) {
        if (!isOrderAnnouncement(ann.title)) {
          record = { title: ann.title, description: ann.description, isOrderAnnouncement: false, extraction: null, needsLlmFallback: false };
        } else {
          try {
            const extraction = extractOrderValue(ann);
            record = { title: ann.title, description: ann.description, isOrderAnnouncement: true, extraction, needsLlmFallback: false };
          } catch (e) {
            if (e instanceof AnnouncementValueNotFoundError) {
              record = { title: ann.title, description: ann.description, isOrderAnnouncement: e.isOrderAnnouncement, extraction: null, needsLlmFallback: e.isOrderAnnouncement };
            } else throw e;
          }
        }
        annStore.save(companyId, ann.ssUrl, d, record);
      }

      if (record.extraction && Number.isFinite(record.extraction.deltaCr)) {
        ledger.applyAnnouncement(companyId, { ssUrl: ann.ssUrl, date: d, deltaCr: record.extraction.deltaCr, title: ann.title });
        applied.push({ ssUrl: ann.ssUrl, date: d, deltaCr: record.extraction.deltaCr, title: ann.title });
      } else if (record.needsLlmFallback) {
        pendingLlmFallback.push({ ssUrl: ann.ssUrl, date: d, title: ann.title, description: ann.description });
      }
    }

    if (hitOlder || rows.length < 30) break;
    offset += 30;
    await new Promise((r) => setTimeout(r, 200)); // polite pagination
  }

  ledger.advanceWatermark(companyId, maxDateSeen);
  return { applied, pendingLlmFallback };
}

async function getCompanyOrderBook(companyId) {
  const baseResult = await ensureBase(companyId);
  if (!baseResult.ok) return { companyId, ok: false, ...baseResult };

  const current = ledger.get(companyId);
  const sinceDate = current.watermark || current.base.sourceQuarterEndDate;
  const { applied } = await processNewAnnouncements(companyId, sinceDate);

  const final = ledger.get(companyId);
  return {
    companyId, ok: true,
    base: final.base,
    newlyAppliedAnnouncements: applied,
    // Recomputed from disk every call — includes fallback items from ANY
    // prior run, not just ones seen in this call (fixes the "watermark
    // silently hides unresolved items" gap found during validation).
    pendingLlmFallback: annStore.unresolved(companyId),
    cumulative: final.cumulative,
    watermark: final.watermark,
  };
}

/**
 * A skill calls this after resolving a pendingLlmFallback item (from either
 * getCompanyOrderBook's list or extractOrderBook's concall-level list) via a
 * cheap LLM call. Persists the resolution permanently — it is never re-asked
 * of the LLM again — and folds it into the running cumulative total.
 */
function recordAnnouncementResolution(companyId, ssUrl, date, { deltaCr, unit = 'cr', reasoning }) {
  annStore.recordResolution(companyId, ssUrl, date, { deltaCr, unit, reasoning });
  if (Number.isFinite(deltaCr)) {
    const rec = annStore.get(companyId, ssUrl, date);
    ledger.applyAnnouncement(companyId, { ssUrl, date, deltaCr, title: rec.title });
  }
  return ledger.get(companyId);
}

async function main() {
  const ticker = process.argv[2];
  if (!ticker || ticker.startsWith('--')) throw new Error('Usage: getCompanyOrderBook.js <TICKER>');
  const result = await getCompanyOrderBook(ticker);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.ok || (result.pendingLlmFallback && result.pendingLlmFallback.length)) process.exitCode = 2;
}

module.exports = { getCompanyOrderBook, ensureBase, processNewAnnouncements, quarterEndDate, recordAnnouncementResolution };

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
