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
 * Announcement values are resolved in two deterministic tiers before any LLM
 * is considered:
 *   tier 1 — title + description regex (free, no fetch)
 *   tier 2 — the filing PDF's text layer (lib/announcementPdfText.js +
 *            lib/orderPdfExtractor.js). This tier also supplies the product
 *            quantities and the execution timeline, which are essentially
 *            never present in the announcement metadata.
 * Anything still unresolved after tier 2 (a scanned filing, or one that
 * genuinely omits the figure) lands in `pendingLlmFallback` for a cheap
 * model to read — it is never silently dropped.
 *
 * Every artifact this touches is permanently cached and content-addressed:
 *   - concall notes text + its order-book extraction  → concallNotesStore
 *   - each announcement PDF's text layer               → announcementPdfText
 *   - each announcement's classification + extraction  → orderAnnouncementStore
 *   - the running per-company total                    → orderBookLedger
 * A second call for the same company with no new concall/announcements
 * makes ZERO network calls and reuses every prior computation verbatim.
 *
 * The durable facts (each order win, each concall-declared order book) are
 * additionally written to the events collection by lib/orderBookEvents.js —
 * the ledger above is derived state and lives in cache, the events are the
 * database of record.
 *
 * Usage: node getCompanyOrderBook.js <TICKER> [--env-file <path>] [--no-db]
 */

const { loadEnv, argValue, hasFlag } = require('../../lib/env');
loadEnv(argValue('--env-file'));
const { stockscans } = require('@stock/api');
const concallStore = require('../../lib/concallNotesStore');
const annStore = require('../../lib/orderAnnouncementStore');
const ledger = require('../../lib/orderBookLedger');
const {
  isOrderAnnouncement,
  extractOrderValue,
  AnnouncementValueNotFoundError,
} = require('../../lib/orderAnnouncementExtractor');
const pdfText = require('../../lib/announcementPdfText');
const { extractFromPdfText } = require('../../lib/orderPdfExtractor');
const obEvents = require('../../lib/orderBookEvents');
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

/**
 * Ensure the ledger's base reflects the latest available concall order-book figure. Idempotent.
 * @param {string} companyId
 * @param {Object} [opts]
 * @param {boolean} [opts.forceRecompute] - re-run the extractor over cached
 *   concall text, ignoring a previously cached verdict. Use after the
 *   extractor improves, so old "needs LLM" verdicts get re-judged.
 */
async function ensureBase(companyId, { forceRecompute = false } = {}) {
  const targets = await resolveTargets(companyId, { lastN: 1 });
  if (!targets.length) {
    return { ok: false, reason: 'no Transcript with hasNotes:true found for this company' };
  }
  const doc = targets[0];
  const existing = ledger.get(companyId);
  const hasUsableBase = (l) => !!(l && l.base && Number.isFinite(l.base.valueCr));

  // The stored verdict is consulted BEFORE the ledger, even when the ledger
  // looks current. The ledger is derived state, so a base whose quarter still
  // matches proves only that nothing has re-run since — not that the figure is
  // still believed. When a later verdict retracts a base (a segment bullet the
  // extractor had mistaken for a company total), trusting the ledger first
  // would re-serve the superseded number forever. processQuarter() is itself
  // cache-first, so leading with it costs a file read, not a network call.
  const result = await processQuarter(companyId, doc, { forceRecompute });

  // A terminal "this company doesn't report an order book" verdict — not a
  // failure to be retried, and not something an LLM can fix. Surfaced as its
  // own reason so the batch job can stop re-queueing it every day.
  if (result.noOrderBookDisclosed) {
    if (existing && existing.base) ledger.clearBase(companyId, result.reason);
    return {
      ok: false,
      reason: 'noOrderBookDisclosed',
      quarter: doc.date,
      detail: result.reason,
    };
  }

  if (result.needsLlmFallback) {
    if (hasUsableBase(existing)) {
      return {
        ok: true,
        changed: false,
        quarter: existing.base.sourceQuarter,
        note: `latest concall (${doc.date}) needs LLM fallback for order-book value — continuing to use prior base (${existing.base.sourceQuarter})`,
      };
    }
    return {
      ok: false,
      reason: 'needsLlmFallback',
      llmFallbackPrompt: result.llmFallbackPrompt,
      quarter: doc.date,
    };
  }

  // A resolved verdict carrying no number means the notes mention an order
  // book only as segment/qualitative colour, with no company-wide total ever
  // stated — the same settled answer as `noOrderBookDisclosed`, just reached
  // one tier later. It must NOT become a base: setBase() would fold `null`
  // into the arithmetic and publish a ₹0 order book as if it were a fact.
  if (!Number.isFinite(result.valueCr)) {
    const detail =
      result.reasoning ||
      'no company-wide order-book total stated (segment/qualitative bullets only)';
    // Retract any base a weaker earlier verdict had set, or the ledger would
    // keep serving that superseded figure on every future run.
    if (existing && existing.base) ledger.clearBase(companyId, detail);
    return { ok: false, reason: 'noOrderBookDisclosed', quarter: doc.date, detail };
  }

  // Base already current and unchanged — leave the applied wins in place
  // rather than resetting them via setBase().
  if (
    hasUsableBase(existing) &&
    existing.base.sourceQuarter === doc.date &&
    existing.base.valueCr === result.valueCr
  ) {
    return { ok: true, changed: false, quarter: doc.date };
  }

  ledger.setBase(companyId, {
    valueCr: result.valueCr,
    unit: result.unit || 'cr',
    sourceType: 'concall',
    sourceQuarter: doc.date,
    sourceQuarterEndDate: quarterEndDate(doc.date),
    label: result.label,
    sourceLine: result.sourceLine,
  });
  return { ok: true, changed: true, quarter: doc.date };
}

/**
 * Resolve one order announcement to a value (+ quantities + timeline).
 *
 * Tier 1 is the free title/description regex. Tier 2 reads the filing PDF's
 * text layer, which is where roughly half of filings state the value and
 * where the execution timeline essentially always lives — so tier 2 runs even
 * when tier 1 already found a value, purely to pick up the timeline and
 * product quantities that metadata never carries.
 *
 * @returns {Promise<Object>} the record to cache for this announcement
 */
async function resolveAnnouncement(companyId, ann, date, { client } = {}) {
  const base = { title: ann.title, description: ann.description };

  if (!isOrderAnnouncement(ann.title)) {
    return { ...base, isOrderAnnouncement: false, extraction: null, needsLlmFallback: false };
  }

  let tier1 = null;
  try {
    tier1 = extractOrderValue(ann);
  } catch (e) {
    if (!(e instanceof AnnouncementValueNotFoundError)) throw e;
  }

  let pdf = null;
  if (ann.ssUrl) {
    const doc = await pdfText.fetchText(companyId, ann.ssUrl, date, { client });
    if (doc.error) {
      // Transient — leave it unresolved so a later run retries the fetch.
      return {
        ...base,
        isOrderAnnouncement: true,
        extraction: tier1 ? { ...tier1, source: 'title' } : null,
        needsLlmFallback: !tier1,
        pdfError: doc.error,
      };
    }
    if (doc.scanned) {
      return {
        ...base,
        isOrderAnnouncement: true,
        extraction: tier1 ? { ...tier1, source: 'title' } : null,
        needsLlmFallback: !tier1,
        pdfScanned: true,
        fallbackReason: 'PDF has no text layer (scanned) — needs an LLM/vision read',
      };
    }
    pdf = extractFromPdfText(doc.text, { announcementDate: date });
  }

  // Prefer whichever tier carries the stronger evidence for the VALUE, but
  // always take quantities/timeline from the PDF since only it has them.
  const pdfHasValue = pdf && Number.isFinite(pdf.valueCr);
  const preferPdf = pdfHasValue && (!tier1 || pdf.confidence === 'high');
  const valueCr = preferPdf
    ? pdf.valueCr
    : tier1
      ? tier1.deltaCr
      : pdfHasValue
        ? pdf.valueCr
        : null;

  if (!Number.isFinite(valueCr)) {
    // Some issuers never publish a figure, only the SEBI size class. That is
    // a complete answer to what the filing discloses, so it is resolved with
    // a band rather than parked as a failure an LLM could somehow fix.
    if (pdf && pdf.valueBand) {
      return {
        ...base,
        isOrderAnnouncement: true,
        needsLlmFallback: false,
        extraction: {
          deltaCr: 0,
          value: null,
          unit: 'cr',
          confidence: 'band-only',
          source: 'pdf',
          valueBand: pdf.valueBand,
          quantities: pdf.quantities,
          timeline: pdf.timeline,
          isAggregate: false,
          components: [],
          sourceText: pdf.valueBand.text,
        },
      };
    }
    return {
      ...base,
      isOrderAnnouncement: true,
      extraction: null,
      needsLlmFallback: true,
      fallbackReason:
        'order-win filing but no value found in title, description, or PDF text layer',
    };
  }

  return {
    ...base,
    isOrderAnnouncement: true,
    needsLlmFallback: false,
    extraction: {
      deltaCr: valueCr,
      value: valueCr,
      unit: 'cr',
      confidence: preferPdf ? pdf.confidence : tier1 ? tier1.confidence : 'medium',
      source: preferPdf ? 'pdf' : 'title',
      quantities: pdf ? pdf.quantities : [],
      timeline: pdf ? pdf.timeline : null,
      isAggregate: pdf ? pdf.isAggregate : false,
      components: pdf ? pdf.components : [],
      sourceText: preferPdf ? pdf.sourceText : tier1 && tier1.sourceText,
      // Kept for auditability: when the two tiers disagree the difference is
      // usually GST-inclusive vs exclusive, which is worth being able to see.
      titleTierCr: tier1 ? tier1.deltaCr : null,
      pdfTierCr: pdfHasValue ? pdf.valueCr : null,
    },
  };
}

/**
 * Re-attempt every announcement still sitting in the unresolved queue.
 *
 * This matters because the watermark has already moved past those filings, so
 * they would otherwise never be looked at again — an item parked as
 * "needs an LLM" under an older, weaker extractor would stay parked forever
 * even after the extractor learned to read it. Retrying is close to free: the
 * PDF text layer is permanently cached, so a genuine miss just re-runs a few
 * regexes, while anything the improved tiers can now handle heals itself.
 *
 * Filings already known to be scanned are skipped — no amount of retrying a
 * deterministic parser will produce a text layer that isn't there.
 */
async function retryUnresolved(companyId, { client } = {}) {
  const healed = [];
  for (const rec of annStore.unresolved(companyId)) {
    if (rec.pdfScanned) continue;
    const ann = {
      title: rec.title,
      description: rec.description,
      ssUrl: rec.ssUrl,
      date: rec.date,
    };
    const fresh = await resolveAnnouncement(companyId, ann, rec.date, { client });
    if (!fresh.extraction || !Number.isFinite(fresh.extraction.deltaCr)) continue;
    annStore.save(companyId, rec.ssUrl, rec.date, fresh);
    const entry = {
      ssUrl: rec.ssUrl,
      date: rec.date,
      deltaCr: fresh.extraction.deltaCr,
      title: rec.title,
      quantities: fresh.extraction.quantities || [],
      timeline: fresh.extraction.timeline || null,
      confidence: fresh.extraction.confidence,
      isAggregate: !!fresh.extraction.isAggregate,
      components: fresh.extraction.components || [],
      source: fresh.extraction.source || null,
    };
    ledger.applyAnnouncement(companyId, entry);
    healed.push(entry);
  }
  return healed;
}

/** Page through announcements newer than `sinceDate` (YYYY-MM-DD), classify+extract each, cache-first. */
async function processNewAnnouncements(companyId, sinceDate, { client } = {}) {
  const applied = [];
  const pendingLlmFallback = [];
  let offset = 0;
  let maxDateSeen = sinceDate;

  for (let page = 0; page < 20; page++) {
    // 20 pages = 600 announcements — generous ceiling
    const data = await stockscans.announcements([companyId], offset);
    const rows = data.companyAnnouncements || [];
    if (!rows.length) break;

    let hitOlder = false;
    for (const ann of rows) {
      const d = (ann.date || '').slice(0, 10);
      if (sinceDate && d && d <= sinceDate) {
        hitOlder = true;
        continue;
      }
      if (d && d > maxDateSeen) maxDateSeen = d;

      let record = annStore.get(companyId, ann.ssUrl, d);
      if (!record) {
        record = await resolveAnnouncement(companyId, ann, d, { client });
        annStore.save(companyId, ann.ssUrl, d, record);
      }

      // A resolved record with a null deltaCr is a filing that genuinely
      // states no figure (only a SEBI size band). It still belongs in the
      // ledger — it contributes nothing to the rupee total but carries the
      // capacity and execution timeline, and omitting it would make a real
      // win invisible.
      if (record.isOrderAnnouncement && record.extraction && !record.needsLlmFallback) {
        const entry = {
          ssUrl: ann.ssUrl,
          date: d,
          deltaCr: Number.isFinite(record.extraction.deltaCr) ? record.extraction.deltaCr : null,
          title: ann.title,
          valueBand: record.extraction.valueBand || null,
          quantities: record.extraction.quantities || [],
          timeline: record.extraction.timeline || null,
          confidence: record.extraction.confidence,
          isAggregate: !!record.extraction.isAggregate,
          components: record.extraction.components || [],
          source: record.extraction.source || null,
        };
        ledger.applyAnnouncement(companyId, entry);
        applied.push(entry);
      } else if (record.needsLlmFallback) {
        pendingLlmFallback.push({
          ssUrl: ann.ssUrl,
          date: d,
          title: ann.title,
          description: ann.description,
          reason: record.fallbackReason || 'value not found deterministically',
        });
      }
    }

    if (hitOlder || rows.length < 30) break;
    offset += 30;
    await new Promise((r) => setTimeout(r, 200)); // polite pagination
  }

  ledger.advanceWatermark(companyId, maxDateSeen);
  return { applied, pendingLlmFallback };
}

/**
 * @param {string} companyId
 * @param {Object} [opts]
 * @param {boolean} [opts.persist=true] - write facts to the events collection
 * @param {Object} [opts.client] - injectable Stockscans client (tests)
 * @param {boolean} [opts.forceRecompute] - re-judge a cached base verdict
 */
async function getCompanyOrderBook(companyId, { persist = true, client, forceRecompute } = {}) {
  const baseResult = await ensureBase(companyId, { forceRecompute });
  if (!baseResult.ok) return { companyId, ok: false, ...baseResult };

  const current = ledger.get(companyId);
  const sinceDate = current.watermark || current.base.sourceQuarterEndDate;
  const { applied } = await processNewAnnouncements(companyId, sinceDate, { client });
  const healed = await retryUnresolved(companyId, { client });

  const final = ledger.get(companyId);

  // The database of record: the concall-declared figure and each order win.
  // Idempotent — ids derive from the source document, so a re-run updates in
  // place rather than duplicating.
  let dbStats = null;
  if (persist) {
    const declared = obEvents.saveDeclaredOrderBook(companyId, final.base);
    const wins = obEvents.saveOrderWins(companyId, final.announcementsApplied || []);
    dbStats = { declared, wins };
  }

  return {
    companyId,
    ok: true,
    base: final.base,
    newlyAppliedAnnouncements: applied,
    // Previously-parked items the improved extractor was able to read.
    healedFromFallback: healed,
    // Recomputed from disk every call — includes fallback items from ANY
    // prior run, not just ones seen in this call (fixes the "watermark
    // silently hides unresolved items" gap found during validation).
    pendingLlmFallback: annStore.unresolved(companyId),
    cumulative: final.cumulative,
    watermark: final.watermark,
    dbStats,
  };
}

/**
 * A skill calls this after resolving a pendingLlmFallback item (from either
 * getCompanyOrderBook's list or extractOrderBook's concall-level list) via a
 * cheap LLM call. Persists the resolution permanently — it is never re-asked
 * of the LLM again — and folds it into the running cumulative total.
 */
function recordAnnouncementResolution(
  companyId,
  ssUrl,
  date,
  { deltaCr, unit = 'cr', reasoning, quantities = [], timeline = null, valueBand = null }
) {
  annStore.recordResolution(companyId, ssUrl, date, {
    deltaCr,
    unit,
    reasoning,
    quantities,
    timeline,
    valueBand,
  });
  const rec = annStore.get(companyId, ssUrl, date);
  // Applied even when deltaCr is null: "the filing states no figure" is a
  // resolution, not a failure, and the win's capacity and timeline are still
  // worth carrying. It adds 0 to the rupee total.
  const entry = {
    ssUrl,
    date,
    deltaCr: Number.isFinite(deltaCr) ? deltaCr : null,
    title: rec.title,
    valueBand,
    quantities,
    timeline,
    confidence: 'llm-resolved',
    source: 'llm',
  };
  ledger.applyAnnouncement(companyId, entry);
  obEvents.saveOrderWins(companyId, [{ ...entry, valueCr: entry.deltaCr }]);
  return ledger.get(companyId);
}

async function main() {
  const ticker = process.argv[2];
  if (!ticker || ticker.startsWith('--')) throw new Error('Usage: getCompanyOrderBook.js <TICKER>');
  const result = await getCompanyOrderBook(ticker, { persist: !hasFlag('--no-db') });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.ok || (result.pendingLlmFallback && result.pendingLlmFallback.length))
    process.exitCode = 2;
}

module.exports = {
  getCompanyOrderBook,
  ensureBase,
  processNewAnnouncements,
  resolveAnnouncement,
  retryUnresolved,
  quarterEndDate,
  recordAnnouncementResolution,
};

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
