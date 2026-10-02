'use strict';

/**
 * orderCardEnrichment.js — attach book-to-bill and execution-timing metrics
 * to the `order_book` cards of a post-close digest, deterministically.
 *
 * For every order_book insight:
 *   1. read the order's facts (value, timeline, status) from the filing via the
 *      existing order-book extractor — cache-first, no LLM (conventions §24);
 *   2. fetch the company's TTM / last-FY revenue (Stockscans company page,
 *      24h cache) and compute both book-to-bill ratios plus the quarter-by-
 *      quarter revenue accretion (lib/orderMetrics.js);
 * and for the top-N companies of the digest (ranked by TTM book-to-bill of
 * their firm orders), 3. refresh the unexecuted-order-book ledger and add the
 * total book including the new order with the same two ratios.
 *
 * Failure of any external step degrades that one card's strip with a stated
 * reason — it never blocks the digest and never invents a number.
 *
 * All state is per-call / per-company; nothing is module-level.
 */

const ist = require('./ist');
const orderMetrics = require('./orderMetrics');
const obEvents = require('./orderBookEvents');

const TOP_N = 3;
const CONCURRENCY = 4;
const PDF_SNIPPET_CHARS = 3000;

/** Lazy requires keep unit tests (which inject every dependency) free of network-loading modules. */
function defaultDeps() {
  const { stockscans } = require('@stock/api');
  const { getCompanyFinancials } = require('@stock/api/analyzers/companyFinancials');
  const { mapWithConcurrency } = require('@stock/api/utils/concurrency');
  const { scanAnnouncementsForCompanies } = require('@stock/api/utils/bulkAnnouncementScan');
  const obScript = require('../scripts/orderbook/getCompanyOrderBook');
  return {
    client: stockscans,
    financialsFn: (companyId) => getCompanyFinancials(companyId, { client: stockscans }),
    mapWithConcurrency,
    scanForCompanies: scanAnnouncementsForCompanies,
    ensureBase: (id) => obScript.ensureBase(id),
    processNewAnnouncements: obScript.processNewAnnouncements,
    resolveAnnouncement: obScript.resolveAnnouncement,
    readPdfText: readPostClosePdfText,
  };
}

/**
 * Filing text via the post-close pipeline's shared Tier-1 PDF cache
 * (`watchlistInsights.readOrFetchPdfMeta`). The digest step already read this
 * exact PDF for the card's insight, so this is normally a cache hit — and it
 * carries the OCR fallback, unlike the tracker's own pdfjs-only reader.
 *
 * @param {Object} item - an order_book insight
 * @returns {Promise<{text: string, scanned: boolean, error?: string}>}
 */
async function readPostClosePdfText(item) {
  const url = item.pdfUrl || `https://www.stockscans.in/document/${item.announcementId}`;
  try {
    const { readOrFetchPdfMeta } = require('../watchlistInsights');
    const r = await readOrFetchPdfMeta(url);
    return { text: r.text || '', scanned: !!r.ocrFailed };
  } catch (e) {
    return { text: '', scanned: false, error: e.message };
  }
}

/**
 * Read one order announcement's facts. Cache-first: the extraction record is
 * the same one the order-book tracker stores, keyed by filing.
 *
 * @param {Object} item - an order_book insight (announcementId = ssUrl)
 * @param {Object} deps
 * @returns {Promise<Object>} facts for `orderMetrics.buildOrderMetrics`
 */
async function resolveOrderFacts(item, deps) {
  const annStore = deps.annStore || require('./orderAnnouncementStore');
  const { extractFromPdfText } = deps.extractFromPdfText
    ? { extractFromPdfText: deps.extractFromPdfText }
    : require('./orderPdfExtractor');

  const { companyId, announcementId: ssUrl, date } = item;
  const notes = [];
  const ann = {
    title: item.announcementTitle || '',
    description: item.announcementDescription || '',
    ssUrl,
  };

  // One read of the filing text, shared by the tracker's extractor, the
  // non-standard-title fallback and the status/GST checks below.
  const doc = await deps.readPdfText(item);
  const snippet = doc && doc.text ? doc.text.slice(0, PDF_SNIPPET_CHARS) : '';

  let rec = annStore.get(companyId, ssUrl, date);
  if (!rec) {
    rec = await deps.resolveAnnouncement(companyId, ann, date, {
      client: deps.client,
      textFn: async () => doc,
    });
    // A transient fetch failure is not cached (it would poison the record).
    if (!rec.pdfError) annStore.save(companyId, ssUrl, date, rec);
  }

  let extraction = rec.extraction || null;
  let valueCr = null;
  let source = null;
  let confidence = null;

  if (!rec.isOrderAnnouncement && ssUrl) {
    // Order-flavoured card whose filing title is not the standard Reg-30 order
    // title (e.g. "Bagging/Receiving of orders"): read the PDF text directly,
    // but say so — this path is less certain than the standard one.
    if (doc && doc.text && !doc.scanned) {
      const pdf = extractFromPdfText(doc.text, { announcementDate: date });
      extraction = {
        deltaCr: pdf.valueCr,
        confidence: pdf.confidence,
        source: 'pdf',
        quantities: pdf.quantities,
        timeline: pdf.timeline,
        isAggregate: pdf.isAggregate,
        valueBand: pdf.valueBand,
      };
      notes.push(
        'non-standard filing title — value read from the PDF text, verify against the filing'
      );
    }
  }

  if (extraction) {
    const both =
      Number.isFinite(extraction.titleTierCr) && Number.isFinite(extraction.pdfTierCr)
        ? orderMetrics.reconcileValues(extraction.titleTierCr, extraction.pdfTierCr)
        : null;
    if (both) {
      valueCr = both.valueCr;
      if (both.note) notes.push(both.note);
    } else if (extraction.confidence !== 'band-only' && Number.isFinite(extraction.deltaCr)) {
      valueCr = extraction.deltaCr;
    }
    source = extraction.source || null;
    confidence = extraction.confidence || null;
  } else if (rec.needsLlmFallback) {
    notes.push(rec.fallbackReason || 'order value not readable deterministically');
  } else if (rec.pdfError) {
    notes.push(`filing could not be fetched (${rec.pdfError})`);
  }

  const statusText = [ann.title, ann.description, item.headline, snippet].join(' \n ');
  if (
    valueCr !== null &&
    orderMetrics.statesGstInclusive(`${snippet} ${extraction && extraction.sourceText}`)
  ) {
    notes.push('value includes GST per the filing — ratios may read up to ~18% high');
  }

  return {
    ssUrl,
    date,
    valueCr,
    status: orderMetrics.classifyOrderStatus(statusText),
    timeline: extraction ? extraction.timeline || null : null,
    quantities: extraction ? extraction.quantities || [] : [],
    source,
    confidence,
    isAggregate: !!(extraction && extraction.isAggregate),
    valueBand: extraction ? extraction.valueBand || null : null,
    notes,
  };
}

/**
 * Enrich a digest's insights with `orderMetrics`.
 *
 * @param {Array<Object>} insights - deduped digest insights (fresh + cached notes)
 * @param {Object} [opts]
 * @param {number} [opts.topN=3]
 * @param {Date} [opts.now]
 * @param {Object} [opts.deps] - injectable dependencies (tests); defaults are the real ones
 * @param {(msg: string) => void} [opts.warn]
 * @returns {Promise<{insights: Array<Object>, stats: Object}>}
 */
async function enrichOrderCards(insights, opts = {}) {
  const topN = opts.topN || TOP_N;
  const now = opts.now || new Date();
  const warn = opts.warn || (() => {});
  const today = ist.nowIstIso(now).slice(0, 10);
  const orderItems = insights.filter(
    (i) => i && i.category === 'order_book' && i.companyId && i.announcementId
  );
  const stats = {
    orderCards: 0,
    withRatio: 0,
    top: [],
    bookOk: 0,
    bookFailed: [],
    pendingBases: [],
    revenueFailed: [],
  };
  if (!orderItems.length) return { insights, stats };

  const deps = { ...defaultDeps(), ...(opts.deps || {}) };
  const mapC = deps.mapWithConcurrency;
  const companyIds = [...new Set(orderItems.map((i) => i.companyId))];

  // 1) Revenue basis per company (deduped; one page fetch each, 24h cached).
  const revenueByCompany = new Map();
  const revResults = await mapC(companyIds, CONCURRENCY, (id) => deps.financialsFn(id));
  companyIds.forEach((id, idx) => {
    const r = revResults[idx];
    if (r && r.ok) {
      revenueByCompany.set(id, orderMetrics.revenueBasis(r.value));
    } else {
      const reason = `financials fetch failed: ${(r && r.error && r.error.message) || 'unknown'}`;
      stats.revenueFailed.push(id);
      warn(`[WARN] ${id}: ${reason}`);
      revenueByCompany.set(id, { ok: false, reason });
    }
  });

  // 2) Facts + per-announcement metrics.
  const factResults = await mapC(orderItems, CONCURRENCY, (it) => resolveOrderFacts(it, deps));
  const metricsByItem = new Map();
  orderItems.forEach((it, idx) => {
    const r = factResults[idx];
    const facts =
      r && r.ok
        ? r.value
        : {
            ssUrl: it.announcementId,
            date: it.date,
            valueCr: null,
            status: 'firm',
            notes: [`order facts unavailable: ${(r && r.error && r.error.message) || 'unknown'}`],
          };
    metricsByItem.set(
      it,
      orderMetrics.buildOrderMetrics({ facts, revenue: revenueByCompany.get(it.companyId) })
    );
  });
  stats.orderCards = orderItems.length;
  stats.withRatio = [...metricsByItem.values()].filter((m) => m.ratios.ttm !== null).length;

  // 3) Company-level merge → top-N ranking → unexecuted book for the top few.
  const perCompany = new Map();
  for (const it of orderItems) {
    if (!perCompany.has(it.companyId)) perCompany.set(it.companyId, []);
    perCompany.get(it.companyId).push(it);
  }
  const merged = new Map(
    [...perCompany.entries()].map(([id, items]) => [
      id,
      orderMetrics.mergeOrderMetrics(items.map((it) => metricsByItem.get(it))),
    ])
  );
  const top = orderMetrics.selectTopCompanies(
    [...merged.entries()].map(([companyId, metrics]) => ({ companyId, metrics })),
    topN
  );
  stats.top = top;

  if (top.length) {
    let refreshed = new Map();
    try {
      refreshed = await require('./orderBookRollup').refreshOrderLedgers(top, {
        client: deps.client,
        ensureBase: deps.ensureBase,
        processNewAnnouncements: deps.processNewAnnouncements,
        scanForCompanies: deps.scanForCompanies,
        today,
        now,
      });
    } catch (e) {
      warn(`[WARN] order-book roll-up failed: ${e.message}`);
      for (const id of top)
        refreshed.set(id, { ok: false, reason: `roll-up failed: ${e.message}` });
    }
    top.forEach((companyId, rank) => {
      const m = merged.get(companyId);
      const res = refreshed.get(companyId) || { ok: false, reason: 'no roll-up result' };
      const items = perCompany.get(companyId);
      const firmItems = items.filter((it) => !metricsByItem.get(it).order.conditional);
      const revenue = m.revenue ? { ttmCr: m.revenue.ttmCr, lastFyCr: m.revenue.lastFyCr } : null;
      let book;
      if (res.ok) {
        book = orderMetrics.unexecutedBook({
          ledger: res.ledger,
          orderCr: m.order.valueCr,
          orderSsUrls: firmItems.map((it) => it.announcementId),
          orderDate: firmItems.map((it) => it.date).sort()[0],
          revenue,
          today,
          unresolvedCount: res.unresolvedCount,
        });
        if (res.feedWarning) {
          book.notes = [...(book.notes || []), 'order feed unavailable this run — history may lag'];
        }
      } else {
        book = { ok: false, reason: res.reason };
      }
      if (book.ok) stats.bookOk += 1;
      else stats.bookFailed.push({ companyId, reason: book.reason });
      if (res.pendingBase) {
        stats.pendingBases.push({
          companyId,
          quarter: res.pendingBase.quarter,
          llmFallbackPrompt: res.pendingBase.llmFallbackPrompt,
        });
      }
      for (const it of items) {
        const im = metricsByItem.get(it);
        im.book = book;
        im.topRank = rank + 1;
      }
    });
  }

  // 4) Persist the snapshots (events, idempotent) and return enriched insights.
  try {
    obEvents.saveOrderCardMetrics(
      orderItems.map((it) => ({
        companyId: it.companyId,
        date: it.date,
        ssUrl: it.announcementId,
        metrics: metricsByItem.get(it),
      }))
    );
  } catch (e) {
    warn(`[WARN] saveOrderCardMetrics failed: ${e.message}`);
  }
  const out = insights.map((it) =>
    metricsByItem.has(it) ? { ...it, orderMetrics: metricsByItem.get(it) } : it
  );
  return { insights: out, stats };
}

module.exports = { enrichOrderCards, resolveOrderFacts, TOP_N };
