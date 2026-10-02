'use strict';

/**
 * orderMetrics.js — pure book-to-bill and execution-timing arithmetic for an
 * order-win announcement. No I/O, no clock reads, no LLM: every number on the
 * order-book strip of a Thesis Card comes from here, so the agent never
 * recomputes (and never disagrees with) a figure a script already produced
 * (skills/_shared/conventions.md §17).
 *
 * Definitions (Darshan's spec, 2026-09-30):
 *   TTM book-to-bill  = new order value / TTM revenue
 *   "YoY" book-to-bill = new order value / last completed financial year revenue
 *                        (labelled "vs FY26" on the card — it is not a growth rate)
 * and, for the top-ranked orders of a digest, the same two ratios computed on the
 * TOTAL unexecuted order book including the new order.
 *
 * Every function here is keyed by its arguments only — no module state — so
 * concurrent runs (several slots, several companies) cannot interfere.
 */

/** A base older than this (days after its quarter end) is flagged stale. */
const STALE_BASE_DAYS = 150;
/** Revenue below this (₹ Cr) carries >1% rounding noise (Stockscans shows whole ₹ Cr). */
const LOW_PRECISION_REVENUE_CR = 50;
/** ₹ Cr per quarter for a straight-line spread: one quarter = 365.25 / 4 days. */
const DAYS_PER_QUARTER = 365.25 / 4;

const DAY_MS = 86400000;

const round = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

/**
 * Safe ratio: null (never 0, never Infinity) when either side is unusable.
 * @param {number|null} numerator
 * @param {number|null} denominator
 * @returns {number|null}
 */
function ratio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return round(numerator / denominator, 2);
}

/** @param {string} iso YYYY-MM-DD @returns {number|null} UTC ms at midnight */
function toUtcMs(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Indian fiscal quarter containing a date.
 * @param {string} iso YYYY-MM-DD
 * @returns {{label: string, startMs: number, endMs: number}|null} endMs is exclusive
 */
function fiscalQuarterOf(iso) {
  const ms = toUtcMs(iso);
  if (ms === null) return null;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth(); // 0-11
  // Quarter index within the FY: Apr-Jun=0 ... Jan-Mar=3
  const q = mo >= 3 ? Math.floor((mo - 3) / 3) : 3;
  const fy = mo >= 3 ? y + 1 : y;
  const startMonth = [3, 6, 9, 0][q];
  const startYear = y; // every quarter starts in the same calendar year as `d`
  const startMs = Date.UTC(startYear, startMonth, 1);
  const endMs = Date.UTC(startMonth + 3 > 11 ? startYear + 1 : startYear, (startMonth + 3) % 12, 1);
  return { label: `Q${q + 1}FY${String(fy).slice(2)}`, startMs, endMs };
}

/**
 * Normalise a Stockscans company-financials payload into the revenue basis
 * used for the ratios, with every reason a ratio might be unusable.
 *
 * @param {Object|null} fin - `getCompanyFinancials()` payload
 * @returns {{ok: boolean, reason?: string, ttmCr: number|null, lastFyCr: number|null,
 *   lastFyLabel: string|null, ttmAsOf: string|null, basis: string|null,
 *   lowPrecision: boolean, warnings: string[]}}
 */
function revenueBasis(fin) {
  const blank = {
    ttmCr: null,
    lastFyCr: null,
    lastFyLabel: null,
    ttmAsOf: null,
    basis: null,
    lowPrecision: false,
    warnings: [],
  };
  if (!fin) return { ok: false, reason: 'no financials available', ...blank };
  // Bank/NBFC "revenue" is interest income — not comparable to an order value.
  if (fin.layout && fin.layout !== 'industrial') {
    return {
      ok: false,
      reason: `${fin.layout} balance-sheet layout — revenue not comparable to order value`,
      ...blank,
    };
  }
  const warnings = [];
  const quarters = Array.isArray(fin.quarters) ? fin.quarters : [];
  const last4 = quarters.slice(-4);
  const last4Sum =
    last4.length === 4 && last4.every((q) => Number.isFinite(q.revenue))
      ? last4.reduce((s, q) => s + q.revenue, 0)
      : null;

  let ttmCr = fin.ttm && Number.isFinite(fin.ttm.revenue) ? fin.ttm.revenue : null;
  if (ttmCr === null && last4Sum !== null) {
    ttmCr = last4Sum;
    warnings.push('TTM derived from the last 4 reported quarters');
  } else if (ttmCr !== null && last4Sum !== null && last4Sum > 0) {
    // Validate the scraped TTM against the quarters it should be the sum of.
    if (Math.abs(ttmCr - last4Sum) / last4Sum > 0.03) {
      warnings.push(`TTM ₹${ttmCr} Cr differs from the last-4-quarter sum ₹${last4Sum} Cr`);
    }
  }

  const years = Array.isArray(fin.years) ? fin.years : [];
  const lastFy = years.length ? years[years.length - 1] : null;
  const lastFyCr = lastFy && Number.isFinite(lastFy.revenue) ? lastFy.revenue : null;

  const smallest = [ttmCr, lastFyCr]
    .filter(Number.isFinite)
    .reduce((a, b) => Math.min(a, b), Infinity);
  const lowPrecision = Number.isFinite(smallest) && smallest < LOW_PRECISION_REVENUE_CR;
  if (lowPrecision) {
    warnings.push(
      `small revenue base (₹${smallest} Cr, shown to whole ₹ Cr) — ratio is approximate`
    );
  }
  if (ttmCr === null && lastFyCr === null) {
    return { ok: false, reason: 'no revenue history (new listing?)', ...blank, warnings };
  }
  return {
    ok: true,
    ttmCr,
    lastFyCr,
    lastFyLabel: lastFy ? lastFy.fy || null : null,
    ttmAsOf: last4.length ? last4[last4.length - 1].fq || last4[last4.length - 1].period : null,
    basis: fin.basis || null,
    lowPrecision,
    warnings,
  };
}

/**
 * Both book-to-bill ratios for a rupee amount against a revenue basis.
 * @param {number|null} amountCr
 * @param {{ttmCr: number|null, lastFyCr: number|null}|null} basis
 * @returns {{ttm: number|null, lastFy: number|null}}
 */
function ratios(amountCr, basis) {
  return {
    ttm: ratio(amountCr, basis && basis.ttmCr),
    lastFy: ratio(amountCr, basis && basis.lastFyCr),
  };
}

/**
 * Straight-line revenue recognition spread of one order across fiscal quarters,
 * pro-rated by days (so a partial first/last quarter gets a partial amount).
 *
 * @param {{orderCr: number, startDate: string, endDate: string}} p
 * @returns {Array<{quarter: string, revenueCr: number, partial: boolean}>}
 */
function accretionSchedule({ orderCr, startDate, endDate }) {
  const startMs = toUtcMs(startDate);
  const endMs = toUtcMs(endDate);
  if (!Number.isFinite(orderCr) || orderCr <= 0 || startMs === null || endMs === null) return [];
  if (endMs <= startMs) return [];
  const totalDays = (endMs - startMs) / DAY_MS;
  const out = [];
  let cursor = startMs;
  // Safety bound: 80 quarters = 20 years, far beyond any real execution window.
  for (let i = 0; i < 80 && cursor < endMs; i++) {
    const q = fiscalQuarterOf(toIso(cursor));
    const segEnd = Math.min(q.endMs, endMs);
    const days = (segEnd - cursor) / DAY_MS;
    out.push({
      quarter: q.label,
      revenueCr: round((orderCr * days) / totalDays, 2),
      // A few days short of the full quarter is rounding of month-end, not a real partial quarter.
      partial: days < (q.endMs - q.startMs) / DAY_MS - 3,
    });
    cursor = segEnd;
  }
  return out;
}

/**
 * When and how much this order adds to reported revenue.
 *
 * Assumptions, stated on the result so the card can show them: start = the
 * filing date unless the filing gave one; revenue is recognised straight-line
 * over the stated duration. Nothing is invented when no timeline exists.
 *
 * @param {Object} p
 * @param {number} p.orderCr
 * @param {Object|null} p.timeline - `{startDate, endDate, durationMonths, basis}` from orderPdfExtractor
 * @param {string} [p.announcementDate] - YYYY-MM-DD, start fallback
 * @param {{ttmCr: number|null}|null} [p.basis]
 * @returns {Object}
 */
function executionImpact({ orderCr, timeline, announcementDate, basis }) {
  if (!Number.isFinite(orderCr) || orderCr <= 0) {
    return { available: false, note: 'order value not stated — timing not computable' };
  }
  if (!timeline || !Number.isFinite(timeline.durationMonths)) {
    return {
      available: false,
      note: 'no execution timeline in the filing — timing not computable',
    };
  }
  const startDate = timeline.startDate || announcementDate || null;
  let endDate = timeline.endDate || null;
  if (startDate && !endDate) {
    const s = new Date(toUtcMs(startDate));
    s.setUTCMonth(s.getUTCMonth() + timeline.durationMonths);
    endDate = toIso(s.getTime());
  }
  if (!startDate || !endDate) {
    return { available: false, note: 'timeline has a duration but no anchor date' };
  }
  const schedule = accretionSchedule({ orderCr, startDate, endDate });
  if (!schedule.length) return { available: false, note: 'timeline dates unusable' };
  const days = (toUtcMs(endDate) - toUtcMs(startDate)) / DAY_MS;
  const runRatePerQtrCr = round((orderCr / days) * DAYS_PER_QUARTER, 2);
  const avgQtrRevenue =
    basis && Number.isFinite(basis.ttmCr) && basis.ttmCr > 0 ? basis.ttmCr / 4 : null;
  return {
    available: true,
    startDate,
    endDate,
    durationMonths: timeline.durationMonths,
    // 'duration-from-filing-date' means the filing gave a duration only and the
    // start is our assumption; surface that instead of implying certainty.
    startAssumed: !timeline.startDate || timeline.basis === 'duration-from-filing-date',
    schedule,
    runRatePerQtrCr,
    pctOfAvgQtrRevenue: avgQtrRevenue ? round((runRatePerQtrCr / avgQtrRevenue) * 100, 1) : null,
    firstQuarter: schedule[0].quarter,
    lastQuarter: schedule[schedule.length - 1].quarter,
  };
}

const L1_RE = /\bL[-\s]?1\b|lowest\s+(?:evaluated\s+)?bidder/i;
const FIRM_DONE_RE = /\b(?:has|have)\s+(?:been\s+)?(?:awarded|received)\b/i;
const FRAMEWORK_RE =
  /rate\s+contract|framework\s+(?:agreement|contract)|empanel|panel\s+of\s+(?:vendors|suppliers)/i;
const LOI_RE = /letter\s+of\s+intent|\bLOI\b/i;
// Real-estate / redevelopment "orders" quote gross development value: sales
// potential over the project life, not contract revenue. Never a book-to-bill.
const INDIRECT_RE = /gross\s+development\s+value|\bGDV\b|revenue\s+potential|sales\s+potential/i;
const FIRM_EVIDENCE_RE =
  /letter\s+of\s+(?:award|acceptance)|\bLOA\b|work\s+order|purchase\s+order|contract\s+(?:has\s+been\s+)?(?:signed|awarded|executed)/i;

/**
 * Is this a binding order? L1 / LOI / framework filings are NOT yet revenue-
 * bearing orders and are excluded from the top-N book roll-up; their ratio is
 * still shown, greyed, as "if awarded".
 *
 * @param {string} text - title + description + headline + PDF snippet
 * @returns {'firm'|'l1'|'loi'|'framework'|'indirect'}
 */
function classifyOrderStatus(text) {
  const t = String(text || '');
  if (INDIRECT_RE.test(t)) return 'indirect';
  if (L1_RE.test(t) && !FIRM_DONE_RE.test(t)) return 'l1';
  if (FRAMEWORK_RE.test(t)) return 'framework';
  if (LOI_RE.test(t) && !FIRM_EVIDENCE_RE.test(t)) return 'loi';
  return 'firm';
}

/**
 * Reconcile the title/description value with the PDF value. The usual reason
 * they differ is GST (18%): prefer the lower, ex-GST, figure — concall order
 * books are ex-GST — and say so.
 *
 * @param {number|null} titleCr
 * @param {number|null} pdfCr
 * @returns {{valueCr: number|null, note: string|null}}
 */
function reconcileValues(titleCr, pdfCr) {
  const t = Number.isFinite(titleCr) ? titleCr : null;
  const p = Number.isFinite(pdfCr) ? pdfCr : null;
  if (t === null && p === null) return { valueCr: null, note: null };
  if (t === null) return { valueCr: p, note: null };
  if (p === null) return { valueCr: t, note: null };
  const hi = Math.max(t, p);
  const lo = Math.min(t, p);
  const r = hi / lo;
  if (r < 1.02) return { valueCr: p, note: null };
  if (r >= 1.12 && r <= 1.2) {
    return {
      valueCr: lo,
      note: `title ₹${t} Cr vs PDF ₹${p} Cr differ by ~${round((r - 1) * 100, 0)}% — used ex-GST ₹${lo} Cr`,
    };
  }
  return { valueCr: p, note: `title ₹${t} Cr vs PDF ₹${p} Cr disagree — used the PDF figure` };
}

const GST_INCL_RE = /incl(?:uding|usive)?\s+(?:of\s+)?(?:GST|taxes)/i;
const GST_EXCL_RE = /excl(?:uding|usive)?\s+(?:of\s+)?(?:GST|taxes)|ex[-\s]?GST/i;

/** Filing says the figure includes GST and never gives an ex-GST one. */
function statesGstInclusive(text) {
  const t = String(text || '');
  return GST_INCL_RE.test(t) && !GST_EXCL_RE.test(t);
}

/**
 * Assemble the per-announcement metrics object attached to a card.
 *
 * @param {Object} p
 * @param {Object} p.facts - `{valueCr, status, timeline, quantities, source, confidence,
 *   notes[], isAggregate, valueBand, ssUrl, date}`
 * @param {Object} p.revenue - `revenueBasis()` result
 * @returns {Object} orderMetrics (schema in docs/ORDER_METRICS.md)
 */
function buildOrderMetrics({ facts, revenue }) {
  const status = facts.status || 'firm';
  const valueCr = Number.isFinite(facts.valueCr) ? facts.valueCr : null;
  const notes = [...(facts.notes || [])];
  if (facts.isAggregate) notes.push('period-aggregate filing (monthly order letter)');
  if (facts.valueBand && valueCr === null) {
    notes.push(`filing gives only a size band (${facts.valueBand.text || facts.valueBand.band})`);
  }
  const rev = revenue || { ok: false, reason: 'no financials available' };
  if (rev.ok) notes.push(...(rev.warnings || []));
  return {
    version: 1,
    ssUrl: facts.ssUrl || null,
    date: facts.date || null,
    orderCount: 1,
    order: {
      valueCr,
      status,
      conditional: status !== 'firm',
      source: facts.source || null,
      confidence: facts.confidence || null,
      quantities: facts.quantities || [],
      valueBand: facts.valueBand || null,
    },
    revenue: rev.ok
      ? {
          ttmCr: rev.ttmCr,
          lastFyCr: rev.lastFyCr,
          lastFyLabel: rev.lastFyLabel,
          ttmAsOf: rev.ttmAsOf,
          basis: rev.basis,
          lowPrecision: rev.lowPrecision,
        }
      : null,
    revenueUnavailableReason: rev.ok ? null : rev.reason,
    ratios: ratios(valueCr, rev.ok ? rev : null),
    impact: executionImpact({
      orderCr: valueCr,
      timeline: facts.timeline,
      announcementDate: facts.date,
      basis: rev.ok ? rev : null,
    }),
    book: null,
    topRank: null,
    notes,
  };
}

/**
 * Merge several same-company order metrics (one company filing several orders
 * in a window collapses into ONE card) into a single company-level object.
 * Only firm orders add to the totals; conditional ones are counted apart.
 *
 * @param {Array<Object>} list - per-announcement orderMetrics of one company
 * @returns {Object|null}
 */
function mergeOrderMetrics(list) {
  const items = (list || []).filter(Boolean);
  if (!items.length) return null;
  if (items.length === 1) return items[0];
  const firm = items.filter((m) => !m.order.conditional && Number.isFinite(m.order.valueCr));
  const counted = firm.length ? firm : items.filter((m) => Number.isFinite(m.order.valueCr));
  const valueCr = counted.length
    ? round(
        counted.reduce((s, m) => s + m.order.valueCr, 0),
        2
      )
    : null;
  const first = items[0];
  const rev = first.revenue;
  const basis = rev ? { ttmCr: rev.ttmCr, lastFyCr: rev.lastFyCr } : null;

  const byQuarter = new Map();
  const order = [];
  for (const m of counted) {
    if (!m.impact || !m.impact.available) continue;
    for (const s of m.impact.schedule) {
      if (!byQuarter.has(s.quarter)) {
        byQuarter.set(s.quarter, { quarter: s.quarter, revenueCr: 0, partial: false });
        order.push(s.quarter);
      }
      const row = byQuarter.get(s.quarter);
      row.revenueCr = round(row.revenueCr + s.revenueCr, 2);
      row.partial = row.partial || s.partial;
    }
  }
  const timed = counted.filter((m) => m.impact && m.impact.available);
  const schedule = order
    .map((q) => byQuarter.get(q))
    .sort((a, b) => fyQuarterKey(a.quarter) - fyQuarterKey(b.quarter));
  const untimed = counted.length - timed.length;
  const runRate = timed.length
    ? round(
        timed.reduce((s, m) => s + m.impact.runRatePerQtrCr, 0),
        2
      )
    : null;
  const avgQtr = rev && Number.isFinite(rev.ttmCr) && rev.ttmCr > 0 ? rev.ttmCr / 4 : null;
  const notes = [...new Set(items.flatMap((m) => m.notes || []))];
  if (untimed > 0 && timed.length)
    notes.push(`${untimed} of ${counted.length} orders carry no timeline`);
  const conditionalCount = items.length - firm.length;
  if (firm.length && conditionalCount > 0)
    notes.push(`${conditionalCount} non-firm filing(s) excluded from totals`);

  return {
    ...first,
    ssUrl: first.ssUrl,
    orderCount: items.length,
    order: {
      ...first.order,
      valueCr,
      status: firm.length ? 'firm' : first.order.status,
      conditional: !firm.length,
    },
    ratios: ratios(valueCr, basis),
    impact: timed.length
      ? {
          available: true,
          startDate: timed.map((m) => m.impact.startDate).sort()[0],
          endDate: timed
            .map((m) => m.impact.endDate)
            .sort()
            .slice(-1)[0],
          durationMonths: null,
          startAssumed: timed.some((m) => m.impact.startAssumed),
          schedule,
          runRatePerQtrCr: runRate,
          pctOfAvgQtrRevenue: avgQtr ? round((runRate / avgQtr) * 100, 1) : null,
          firstQuarter: schedule[0].quarter,
          lastQuarter: schedule[schedule.length - 1].quarter,
        }
      : { available: false, note: 'no execution timeline in the filings — timing not computable' },
    book: items.map((m) => m.book).find(Boolean) || null,
    topRank: items.map((m) => m.topRank).find((r) => r) || null,
    notes,
  };
}

/** Sortable key for "Q3FY27" → 27*4+2. */
function fyQuarterKey(label) {
  const m = /^Q([1-4])FY(\d{2})$/.exec(label);
  return m ? +m[2] * 4 + (+m[1] - 1) : 0;
}

/**
 * Rank companies by TTM book-to-bill of their firm orders and return the top N.
 * Ranked by ratio, not rupees: ₹500 Cr means very different things across a
 * ₹800 Cr and a ₹40,000 Cr revenue base.
 *
 * @param {Array<{companyId: string, metrics: Object}>} entries - company-level metrics
 * @param {number} [n=3]
 * @returns {string[]} companyIds, best first
 */
const TOP_MIN_TTM_B2B = 0.02;

function selectTopCompanies(entries, n = 3, minTtm = TOP_MIN_TTM_B2B) {
  return (entries || [])
    .filter(
      (e) =>
        e.metrics &&
        e.metrics.ratios.ttm >= minTtm &&
        !e.metrics.order.conditional &&
        Number.isFinite(e.metrics.order.valueCr) &&
        Number.isFinite(e.metrics.ratios.ttm)
    )
    .sort(
      (a, b) =>
        b.metrics.ratios.ttm - a.metrics.ratios.ttm ||
        b.metrics.order.valueCr - a.metrics.order.valueCr
    )
    .slice(0, n)
    .map((e) => e.companyId);
}

/**
 * Total unexecuted order book including the new order, and its ratios.
 *
 * The base is the last concall's declared book (already net of work executed);
 * wins since are gross additions, so the total drifts slightly high until the
 * next concall resets it — that caveat is part of the result, not a footnote.
 *
 * @param {Object} p
 * @param {Object|null} p.ledger - `orderBookLedger.get()` record
 * @param {number} p.orderCr - this card's firm order value
 * @param {string[]} p.orderSsUrls - filing ids this card covers
 * @param {string} p.orderDate - YYYY-MM-DD
 * @param {Object|null} p.revenue - `{ttmCr, lastFyCr}`
 * @param {string} p.today - YYYY-MM-DD
 * @param {number} [p.unresolvedCount] - filings since base whose value could not be read
 * @returns {Object} `{ok, reason?, ...}`
 */
function unexecutedBook({
  ledger,
  orderCr,
  orderSsUrls = [],
  orderDate,
  revenue,
  today,
  unresolvedCount = 0,
}) {
  if (!ledger || !ledger.base || !Number.isFinite(ledger.base.valueCr)) {
    return { ok: false, reason: 'company declares no order-book total' };
  }
  const cumulative = ledger.cumulative ? ledger.cumulative.valueCr : null;
  if (!Number.isFinite(cumulative)) return { ok: false, reason: 'order-book ledger empty' };
  const applied = new Set((ledger.announcementsApplied || []).map((a) => a.ssUrl));
  const baseEnd = ledger.base.sourceQuarterEndDate;
  // A filing dated on/before the base quarter's end is already inside the base.
  const alreadyInBase = !!baseEnd && !!orderDate && orderDate <= baseEnd;
  const inLedger = orderSsUrls.some((u) => applied.has(u));
  const notes = [];
  let afterCr = cumulative;
  let beforeCr;
  if (alreadyInBase) {
    beforeCr = afterCr;
    notes.push('order predates the base concall quarter-end — already inside the declared book');
  } else if (inLedger) {
    beforeCr = round(afterCr - orderCr, 2);
  } else {
    // The order is not in the ledger yet (feed lag): add it so the total is still "with this order".
    beforeCr = afterCr;
    afterCr = round(afterCr + orderCr, 2);
    notes.push('order not yet in the ledger feed — added on top');
  }
  const ageDays =
    toUtcMs(today) !== null && toUtcMs(baseEnd) !== null
      ? Math.round((toUtcMs(today) - toUtcMs(baseEnd)) / DAY_MS)
      : null;
  const stale = ageDays !== null && ageDays > STALE_BASE_DAYS;
  if (stale) notes.push(`base is ${ageDays} days old — next concall will reset it`);
  if (unresolvedCount > 0) {
    notes.push(
      `${unresolvedCount} filing(s) since base had no readable value — total may be understated`
    );
  }
  const winsSinceBase = (ledger.announcementsApplied || []).length;
  return {
    ok: true,
    beforeCr,
    afterCr,
    baseCr: ledger.base.valueCr,
    baseQuarter: ledger.base.sourceQuarter,
    baseAgeDays: ageDays,
    stale,
    winsSinceBase,
    ratios: ratios(afterCr, revenue),
    notes,
  };
}

module.exports = {
  ratio,
  ratios,
  revenueBasis,
  fiscalQuarterOf,
  accretionSchedule,
  executionImpact,
  classifyOrderStatus,
  reconcileValues,
  statesGstInclusive,
  buildOrderMetrics,
  mergeOrderMetrics,
  selectTopCompanies,
  TOP_MIN_TTM_B2B,
  unexecutedBook,
  STALE_BASE_DAYS,
  LOW_PRECISION_REVENUE_CR,
};
