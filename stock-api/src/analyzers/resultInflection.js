/**
 * @fileoverview Deterministic layer for three quarterly-result-analysis sections:
 *
 *   1. Walk the Talk   — every measurable item management guided in PRIOR quarters, scored
 *                        against this quarter's actuals (not just sales/profit).
 *   2. Inflection Point — three legs: significant margin expansion, guidance confirmed AND
 *                        beaten (so it can now be trusted), and a new C-A-T-A-L-Y-S-T trigger
 *                        (rerating-catalysts framework §4).
 *   3. Next Inflection — dated forward triggers (capacity going live, margin step-up, order-book
 *                        step-change) sorted by quarters-away with Train A/B/C timing.
 *
 * Split of labour (Monorepo Principle 17 — extraction first, analysis second):
 *   - THIS module: period parsing, measurability, auto-filled actuals from headline financials,
 *     tolerance scoring, leg/verdict rules, magnitude arithmetic, sorting. All pure functions,
 *     every input passed explicitly (no ambient state) so concurrent runs cannot collide.
 *   - The agent: filling actuals the record cannot auto-supply (order book, capacity, ROCE,
 *     NIM...), judging which strategic excerpts are genuinely NEW catalysts, and naming the
 *     forward triggers. It never does the arithmetic or applies the thresholds itself.
 *
 * Scoring tolerances reuse management-credibility-tracker's rubric
 * (skills/equity-research/management-credibility-tracker/references/credibility_framework.md):
 * ±10% band for MET; binary for milestones. Inflection legs reuse rerating-catalysts
 * growth_catalyst_framework.md §4 (C-A-T-A-L-Y-S-T), §1d (Train A/B/C), §5a (J-curve stage).
 */

'use strict';

const { parseQuarterString, latestCompletedQuarter } = require('../utils/fiscalQuarter');

/** MET band below the guided floor (credibility_framework.md "within ±10%"). */
const MISS_TOLERANCE = 0.1;
/** Relative overshoot of the guided ceiling that counts as a BEAT for growth/level metrics. */
const BEAT_REL = 0.05;
/** Absolute overshoot (percentage points) that counts as a BEAT for margin/ratio metrics. */
const BEAT_PP = 0.5;
/** EBITDA-margin expansion that qualifies as "significant" (matches the MARGIN INFLECTION chip). */
const MARGIN_INFLECTION_BPS = 200;
/** Partial-margin-leg floor: building but not yet significant. */
const MARGIN_BUILDING_BPS = 100;

const LOWER_IS_BETTER =
  /credit cost|cost[- ]to[- ]income|\bnpa\b|gnpa|nnpa|working capital|debtor days|receivable days|inventory days|\bdebt\b|leverage|opex|tax rate|attrition|cost of funds|d\/e|gearing/i;
const MILESTONE_HINT =
  /commission|capacity|plant|launch|approval|cto\b|go[- ]live|start|commercial|acquisition|demerger|merger|listing|line\b|facility/i;

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * Sequential quarter index so two yyyymm quarter-ends can be subtracted.
 * @param {string} yyyymm
 * @returns {number}
 */
function quarterIndex(yyyymm) {
  const y = parseInt(yyyymm.slice(0, 4), 10);
  const m = parseInt(yyyymm.slice(4, 6), 10);
  return y * 4 + Math.floor((m - 1) / 3);
}

/**
 * Fiscal label for a yyyymm quarter end, e.g. "202609" → "Q2FY27".
 * @param {string} yyyymm
 * @returns {string}
 */
function quarterLabel(yyyymm) {
  const q = parseQuarterString(yyyymm);
  return `${q.fiscalPeriod}FY${String(q.fiscalYear).slice(2)}`;
}

/**
 * Normalise any quarter descriptor seen in the DB ("Q2 FY27", "Q1FY27", "202609",
 * "Q4 FY26 / FY26") to yyyymm. Falls back to the latest quarter completed as of `date`.
 * @param {string|undefined} quarter
 * @param {string} [date] ISO date of the record
 * @returns {string|null}
 */
function normalizeQuarter(quarter, date) {
  const s = String(quarter || '').replace(/\s+/g, '');
  const m = s.match(/Q[1-4]FY\d{2,4}/i) || s.match(/^\d{6}$/);
  if (m) {
    try {
      return parseQuarterString(m[0]).yyyymm;
    } catch (_) {
      /* fall through to date */
    }
  }
  if (date && !isNaN(new Date(date))) return latestCompletedQuarter(new Date(date)).yyyymm;
  return null;
}

/**
 * Parse a guided period / timeline string into its deadline quarter.
 * Handles Q2FY27, H1FY27, FY27 (last FY wins in "FY27-FY28"), "June 2026", and open-ended text.
 * @param {string} text
 * @returns {{kind: 'Q'|'H'|'FY'|'MONTH'|'OPEN', endYyyymm: string|null, label: string}}
 */
function parsePeriod(text) {
  const s = String(text || '');
  const compact = s.replace(/\s+/g, '').toUpperCase();
  let m = compact.match(/Q([1-4])FY'?(\d{2,4})/);
  if (m) {
    const p = parseQuarterString(`Q${m[1]}FY${m[2]}`);
    return { kind: 'Q', endYyyymm: p.yyyymm, label: `Q${m[1]}FY${String(p.fiscalYear).slice(2)}` };
  }
  m = compact.match(/H([12])FY'?(\d{2,4})/);
  if (m) {
    const p = parseQuarterString(`Q${m[1] === '1' ? 2 : 4}FY${m[2]}`);
    return { kind: 'H', endYyyymm: p.yyyymm, label: `H${m[1]}FY${String(p.fiscalYear).slice(2)}` };
  }
  const fys = [...compact.matchAll(/FY'?(\d{2,4})/g)];
  if (fys.length) {
    const p = parseQuarterString(`Q4FY${fys[fys.length - 1][1]}`);
    return { kind: 'FY', endYyyymm: p.yyyymm, label: `FY${String(p.fiscalYear).slice(2)}` };
  }
  m = s.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*[-']?\s*(20\d{2})\b/i
  );
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    const endMonth = Math.ceil(month / 3) * 3;
    const yyyymm = `${m[2]}${String(endMonth).padStart(2, '0')}`;
    return { kind: 'MONTH', endYyyymm: yyyymm, label: quarterLabel(yyyymm) };
  }
  return { kind: 'OPEN', endYyyymm: null, label: s.trim() || 'Open-ended' };
}

/**
 * Pull a numeric range out of a guidance string ("26%-30%", "₹150 - ₹170 Cr", "~16%").
 * @param {string} text
 * @returns {{low: number|null, high: number|null, mid: number|null, unit: string|null}}
 */
function parseRange(text) {
  const s = String(text || '').replace(/,/g, '');
  const unit = /%/.test(s)
    ? '%'
    : /\bcr\b|crore/i.test(s)
      ? 'cr'
      : /\bdays?\b/i.test(s)
        ? 'days'
        : null;
  const r = s.match(/(-?\d+(?:\.\d+)?)\s*%?\s*(?:cr)?\s*(?:-|–|to)\s*₹?\s*(-?\d+(?:\.\d+)?)/i);
  if (r) {
    const a = parseFloat(r[1]);
    const b = parseFloat(r[2]);
    if (b > a) return { low: a, high: b, mid: (a + b) / 2, unit };
  }
  const one = s.match(/(-?\d+(?:\.\d+)?)/);
  if (one) {
    const v = parseFloat(one[1]);
    return { low: v, high: v, mid: v, unit };
  }
  return { low: null, high: null, mid: null, unit };
}

/**
 * Classify how a guided metric is measured.
 * @param {string} metric
 * @param {string|null} unit
 * @param {boolean} isGrowth
 * @returns {'growth'|'ratio'|'level'|'milestone'}
 */
function metricKind(metric, unit, isGrowth) {
  if (isGrowth || /growth|cagr|\byoy\b/i.test(metric)) return 'growth';
  if (unit === '%') return 'ratio';
  if (MILESTONE_HINT.test(metric) && unit !== 'cr') return 'milestone';
  return 'level';
}

/**
 * Normalise one forward-guidance DTO item (forward-guidance-extractor schema).
 * @param {Object} g
 * @param {Object} src {sourceType, sourceId, sourceYyyymm}
 * @returns {Object}
 */
function fromForwardGuidanceItem(g, src) {
  const isGrowth = g.relative_pct != null && g.absolute_unit !== '%';
  const mid = isGrowth ? g.relative_pct : g.absolute_value;
  const range = parseRange(g.quote);
  const useRange = range.low != null && mid != null && mid >= range.low && mid <= range.high;
  const unit = isGrowth ? '%' : g.absolute_unit || null;
  return {
    metric: g.metric,
    metricCategory: g.metric_category || null,
    period: parsePeriod(g.period_guided),
    kind: metricKind(g.metric, unit, isGrowth),
    guidedLow: useRange ? range.low : mid,
    guidedHigh: useRange ? range.high : mid,
    guidedMid: mid,
    unit,
    quote: g.quote || null,
    ...src,
  };
}

/**
 * Normalise one prior quarterly-result DTO guidanceTable row (free-text cells).
 * @param {Object} r
 * @param {Object} src
 * @returns {Object|null}
 */
function fromGuidanceTableRow(r, src) {
  if (!r || r.nature === 'UNGUIDED' || !r.guidedValue) return null;
  const range = parseRange(r.guidedValue);
  const growthText = /growth|yoy|cagr/i.test(`${r.metric} ${r.guidedValue}`);
  return {
    metric: r.metric,
    metricCategory: null,
    period: parsePeriod(`${r.timeline || ''}`),
    kind: metricKind(r.metric, range.unit, growthText && range.unit === '%'),
    guidedLow: range.low,
    guidedHigh: range.high,
    guidedMid: range.mid,
    unit: range.unit,
    quote: `${r.guidedValue}${r.derivationBasis ? ` — ${r.derivationBasis}` : ''}`,
    ...src,
  };
}

/**
 * Collect every guidance item stated BEFORE the current quarter, newest statement winning per
 * metric+period, keeping the superseded value so a raise/cut is visible.
 * @param {Object} args
 * @param {string} args.currentYyyymm Quarter being analysed
 * @param {Array<Object>} [args.forwardGuidanceDtos] Full forward-guidance DTOs for the company
 * @param {Array<Object>} [args.priorResultDtos] Full prior quarterly-result DTOs for the company
 * @param {Array<Object>} [args.callDigests] concall-digest DTOs (history pack). Used only for
 *   quarters with no forward-guidance DTO, so one call is never counted twice.
 * @returns {Array<Object>}
 */
function collectPriorGuidance({
  currentYyyymm,
  forwardGuidanceDtos = [],
  priorResultDtos = [],
  callDigests = [],
}) {
  const curIdx = quarterIndex(currentYyyymm);
  const rows = [];
  const fgQuarters = new Set(
    forwardGuidanceDtos.map((d) => normalizeQuarter(d.quarter, d.date)).filter(Boolean)
  );
  for (const dto of callDigests) {
    const yyyymm = normalizeQuarter(dto.quarter, dto.date);
    if (!yyyymm || quarterIndex(yyyymm) >= curIdx || fgQuarters.has(yyyymm)) continue;
    for (const g of dto.guidance || []) {
      rows.push(
        fromForwardGuidanceItem(g, {
          sourceType: 'concall-digest',
          sourceId: dto.id,
          sourceYyyymm: yyyymm,
        })
      );
    }
  }
  for (const dto of forwardGuidanceDtos) {
    const yyyymm = normalizeQuarter(dto.quarter, dto.date);
    if (!yyyymm || quarterIndex(yyyymm) >= curIdx) continue;
    for (const g of dto.guidance || []) {
      rows.push(
        fromForwardGuidanceItem(g, {
          sourceType: 'forward-guidance',
          sourceId: dto.id,
          sourceYyyymm: yyyymm,
        })
      );
    }
  }
  for (const dto of priorResultDtos) {
    const yyyymm = normalizeQuarter(dto.quarter, dto.date);
    if (!yyyymm || quarterIndex(yyyymm) >= curIdx) continue;
    for (const r of dto.guidanceTable || []) {
      const row = fromGuidanceTableRow(r, {
        sourceType: 'quarterly-result',
        sourceId: dto.id,
        sourceYyyymm: yyyymm,
      });
      if (row) rows.push(row);
    }
  }

  const key = (r) => `${r.metric.toLowerCase().replace(/[^a-z0-9]/g, '')}|${r.period.label}`;
  const byKey = new Map();
  rows
    .sort((a, b) => quarterIndex(a.sourceYyyymm) - quarterIndex(b.sourceYyyymm))
    .forEach((r) => {
      let k = key(r);
      // Two rows for the same metric+period inside ONE source (e.g. blended vs segment margin)
      // are distinct guides, not a revision — keep both.
      while (byKey.has(k) && byKey.get(k).sourceYyyymm === r.sourceYyyymm) k += '#';
      const prev = byKey.get(k);
      if (prev && prev.guidedMid != null && r.guidedMid != null && prev.guidedMid !== r.guidedMid) {
        r.revision = {
          from: prev.guidedMid,
          to: r.guidedMid,
          direction: r.guidedMid > prev.guidedMid ? 'RAISED' : 'CUT',
          fromQuarter: quarterLabel(prev.sourceYyyymm),
        };
      }
      r.firstStated = prev ? prev.firstStated : quarterLabel(r.sourceYyyymm);
      byKey.set(k, r);
    });
  return [...byKey.values()];
}

/**
 * Can this guided item be judged with the current quarter's numbers?
 * @param {{kind: string, endYyyymm: string|null}} period
 * @param {string} currentYyyymm
 * @returns {'FINAL'|'OVERDUE'|'INTERIM'|'NOT_YET'}
 */
function measurability(period, currentYyyymm) {
  if (!period.endYyyymm) return 'INTERIM'; // standing / open-ended guide — check the run-rate
  const gap = quarterIndex(period.endYyyymm) - quarterIndex(currentYyyymm);
  if (gap < 0) return 'OVERDUE';
  if (gap === 0) return 'FINAL';
  if ((period.kind === 'FY' && gap <= 3) || (period.kind === 'H' && gap <= 1)) return 'INTERIM';
  return 'NOT_YET';
}

/**
 * Auto-fill the actual from headline financials when the metric is a headline one.
 * Quarterly YoY is used as the run-rate proxy for an in-flight FY growth guide and labelled so.
 * @param {Object} row Normalised guidance row
 * @param {Array<Object>|Object} headline record.headlineFinancials
 * @returns {{actual: number, actualBasis: string}|null}
 */
function autoActual(row, headline) {
  const cards = Array.isArray(headline) ? headline : [];
  const get = (k) => cards.find((c) => c.key === k);
  const m = row.metric.toLowerCase();
  const proxy =
    row.period.kind === 'FY' || row.period.kind === 'H' ? ' (quarter as run-rate proxy)' : '';
  const rev = get('revenue');
  const pat = get('pat');
  if (row.kind === 'growth') {
    if (/revenue|sales|top ?line|income from operations/.test(m) && rev?.yoyPct != null)
      return { actual: round(rev.yoyPct), actualBasis: `Revenue YoY${proxy}` };
    if (/\beps\b/.test(m) && get('eps')?.yoyPct != null)
      return { actual: round(get('eps').yoyPct), actualBasis: `EPS YoY${proxy}` };
    if (/\bpat\b|net profit|profit after tax|bottom ?line/.test(m) && pat?.yoyPct != null)
      return { actual: round(pat.yoyPct), actualBasis: `PAT YoY${proxy}` };
  }
  if (row.kind === 'ratio') {
    const em = get('ebitdaMargin');
    if (/ebitda|operating (profit )?margin|\bopm\b/.test(m) && em?.value != null)
      return { actual: round(em.value), actualBasis: 'Quarter EBITDA margin' };
    if (/pat margin|net (profit )?margin/.test(m) && pat?.value != null && rev?.value)
      return { actual: round((pat.value / rev.value) * 100), actualBasis: 'Quarter PAT / Revenue' };
    const tax = get('effectiveTaxRate');
    if (/tax rate/.test(m) && tax?.value != null)
      return { actual: round(tax.value), actualBasis: 'Quarter effective tax rate' };
  }
  return null;
}

/**
 * Score one row. Numeric rows need `actual`; milestone rows need `milestoneOutcome`
 * ('DELIVERED'|'DELAYED'|'PENDING'|'WITHDRAWN').
 * @param {Object} row
 * @returns {{status: string, gap: string|null}}
 */
function scoreRow(row) {
  const interim = row.measurability === 'INTERIM';
  if (row.exclude) return { status: 'EXCLUDED', gap: row.excludeReason || 'Excluded by analyst' };
  if (row.measurability === 'NOT_YET') return { status: 'NOT_YET_MEASURABLE', gap: null };
  if (row.measurability === 'OVERDUE' && row.kind !== 'milestone')
    return { status: 'EXPIRED', gap: 'Period closed before this quarter — judged in that quarter' };
  if (row.kind === 'milestone' && row.actual == null) {
    const o = String(row.milestoneOutcome || '').toUpperCase();
    if (o === 'DELIVERED') return { status: 'MET', gap: 'Delivered on/before timeline' };
    if (o === 'WITHDRAWN') return { status: 'MISSED', gap: 'Walked back by management' };
    if (o === 'DELAYED') return { status: interim ? 'BEHIND' : 'MISSED', gap: 'Timeline slipped' };
    if (o === 'PENDING' && interim)
      return { status: 'ON_TRACK', gap: 'In progress, timeline intact' };
    return { status: 'NEEDS_ACTUAL', gap: null };
  }
  if (row.actual == null || row.guidedMid == null) return { status: 'NEEDS_ACTUAL', gap: null };

  const lowerBetter = LOWER_IS_BETTER.test(row.metric);
  const low = row.guidedLow ?? row.guidedMid;
  const high = row.guidedHigh ?? row.guidedMid;
  const ppMetric = row.unit === '%' && row.kind !== 'growth';
  const a = row.actual;
  let beat;
  let met;
  if (!lowerBetter) {
    beat = ppMetric ? a - high >= BEAT_PP : a > high * (1 + BEAT_REL);
    met = a >= low - Math.abs(low) * MISS_TOLERANCE;
  } else {
    beat = ppMetric ? low - a >= BEAT_PP : a < low * (1 - BEAT_REL);
    met = a <= high + Math.abs(high) * MISS_TOLERANCE;
  }
  const ref = lowerBetter ? low : high;
  const diff = a - (beat ? ref : row.guidedMid);
  const gap = ppMetric
    ? `${diff >= 0 ? '+' : ''}${Math.round(diff * 100)} bps vs ${beat ? 'top' : 'mid'} of guide`
    : `${diff >= 0 ? '+' : ''}${round(diff)}${row.unit === '%' ? 'pp' : ''} vs ${beat ? 'top' : 'mid'} of guide`;
  if (interim) return { status: beat ? 'AHEAD' : met ? 'ON_TRACK' : 'BEHIND', gap };
  return { status: beat ? 'BEAT' : met ? 'MET' : 'MISSED', gap };
}

/**
 * Build the walk-the-talk ledger for the current quarter (prepare step).
 * @param {Object} args
 * @param {string} args.currentYyyymm
 * @param {Array<Object>} args.priorGuidance Output of collectPriorGuidance()
 * @param {Array<Object>|Object} args.headline record.headlineFinancials
 * @returns {Array<Object>}
 */
function buildWalkTheTalkLedger({ currentYyyymm, priorGuidance, headline }) {
  return priorGuidance.map((g) => {
    const row = {
      metric: g.metric,
      kind: g.kind,
      period: g.period.label,
      measurability: measurability(g.period, currentYyyymm),
      guidedLow: g.guidedLow,
      guidedHigh: g.guidedHigh,
      guidedMid: g.guidedMid,
      unit: g.unit,
      statedIn: quarterLabel(g.sourceYyyymm),
      firstStated: g.firstStated,
      revision: g.revision || null,
      quote: g.quote,
      sourceId: g.sourceId,
      actual: null,
      actualBasis: null,
    };
    const auto = ['NOT_YET', 'OVERDUE'].includes(row.measurability)
      ? null
      : autoActual({ ...row, period: g.period }, headline);
    if (auto) Object.assign(row, auto, { actualSource: 'auto:headlineFinancials' });
    return row;
  });
}

/**
 * Score a ledger (after the agent filled remaining actuals) and summarise delivery.
 * @param {Array<Object>} ledger
 * @param {Array<string>} [priorVerdicts] walkTheTalk.verdict of earlier quarterly-result DTOs, newest first
 * @returns {Object} {rows, summary}
 */
function scoreWalkTheTalk(ledger, priorVerdicts = []) {
  const rows = ledger.map((r) => ({ ...r, ...scoreRow(r) }));
  const count = (...s) => rows.filter((r) => s.includes(r.status)).length;
  const beats = count('BEAT', 'AHEAD');
  const met = count('MET', 'ON_TRACK');
  const missed = count('MISSED', 'BEHIND');
  const scored = beats + met + missed;
  const needsActual = count('NEEDS_ACTUAL');
  let verdict;
  if (scored === 0) verdict = 'INSUFFICIENT_DATA';
  else if (missed === 0 && beats > 0) verdict = 'CONFIRMED_AND_BEAT';
  else if (missed === 0) verdict = 'DELIVERED';
  else if ((beats + met) / scored >= 0.5) verdict = 'MIXED';
  else verdict = 'MISSED';

  const clean = (v) => v === 'CONFIRMED_AND_BEAT' || v === 'DELIVERED';
  let streak = clean(verdict) ? 1 : 0;
  for (const v of priorVerdicts) {
    if (!streak || !clean(v)) break;
    streak += 1;
  }
  return {
    rows,
    summary: {
      verdict,
      scored,
      beats,
      met,
      missed,
      needsActual,
      notYetMeasurable: count('NOT_YET_MEASURABLE'),
      beatRate: scored ? round((beats / scored) * 100) : null,
      deliveryRate: scored ? round(((beats + met) / scored) * 100) : null,
      credibilityScore: beats + met - missed,
      consecutiveCleanQuarters: streak,
      revisions: rows.filter((r) => r.revision).map((r) => `${r.metric} ${r.revision.direction}`),
    },
  };
}

/**
 * Margin leg: significant, sustained, and not inventory-gain driven.
 * @param {Object} record quarterly-result-documents record
 * @returns {Object}
 */
function marginLeg(record) {
  const cards = Array.isArray(record.headlineFinancials) ? record.headlineFinancials : [];
  const em = cards.find((c) => c.key === 'ebitdaMargin');
  if (!em || em.yoyBpsChange == null) {
    return {
      status: 'NOT_APPLICABLE',
      reason: 'EBITDA margin not available (NBFC/bank — use NIM via override)',
    };
  }
  const yoy = em.yoyBpsChange;
  const qoq = em.qoqBpsChange;
  const fake = (record.incomeStatementSignals?.combinations || []).some((c) =>
    ['INVENTORY_GAIN_DRIVEN', 'RM_COST_PRESSURE_MASKED_BY_INVENTORY_BUILD'].includes(c.flag)
  );
  const bsAbsent = record.statementAvailability?.balanceSheet?.status !== 'fresh';
  const base = `EBITDA margin ${round(em.value)}% (${sign(yoy)} bps YoY, ${qoq == null ? 'QoQ n/a' : `${sign(qoq)} bps QoQ`})`;
  let status;
  let reason;
  if (yoy >= MARGIN_INFLECTION_BPS && (qoq == null || qoq >= 0) && !fake) {
    status = 'PASS';
    reason = `${base} — significant and still rising sequentially`;
  } else if (yoy >= MARGIN_INFLECTION_BPS && fake) {
    status = 'PARTIAL';
    reason = `${base} — but inventory-gain flag in P&L scan; not verified as operational`;
  } else if (yoy >= MARGIN_INFLECTION_BPS) {
    status = 'PARTIAL';
    reason = `${base} — YoY expansion fading sequentially`;
  } else if (yoy >= MARGIN_BUILDING_BPS && qoq != null && qoq >= 50) {
    status = 'PARTIAL';
    reason = `${base} — building, below the ${MARGIN_INFLECTION_BPS} bps bar`;
  } else {
    status = 'FAIL';
    reason = `${base} — below the ${MARGIN_BUILDING_BPS} bps bar`;
  }
  return {
    status,
    reason,
    yoyBps: yoy,
    qoqBps: qoq ?? null,
    conditional: status === 'PASS' && bsAbsent ? 'CONDITIONAL ON H1 WORKING CAPITAL AUDIT' : null,
  };
}

/**
 * Revenue → EBITDA → PAT growth ordering (J-curve §5a Acceleration test: PAT > EBITDA > Revenue).
 * @param {Array<Object>} headline
 * @returns {Object|null}
 */
function operatingLeverage(headline) {
  const cards = Array.isArray(headline) ? headline : [];
  const rev = cards.find((c) => c.key === 'revenue');
  const em = cards.find((c) => c.key === 'ebitdaMargin');
  const pat = cards.find((c) => c.key === 'pat');
  if (rev?.yoyPct == null || em?.value == null || em?.priorYValue == null || pat?.yoyPct == null)
    return null;
  const ebitdaYoY = ((1 + rev.yoyPct / 100) * (em.value / em.priorYValue) - 1) * 100;
  return {
    revenueYoY: round(rev.yoyPct),
    ebitdaYoY: round(ebitdaYoY),
    patYoY: round(pat.yoyPct),
    leverageOrdered: pat.yoyPct > ebitdaYoY && ebitdaYoY > rev.yoyPct,
  };
}

/**
 * Guidance-trust leg from the scored walk-the-talk summary.
 * @param {Object} summary scoreWalkTheTalk().summary
 * @returns {Object}
 */
function guidanceTrustLeg(summary) {
  const v = summary.verdict;
  if (v === 'CONFIRMED_AND_BEAT')
    return {
      status: 'PASS',
      reason: `${summary.beats}/${summary.scored} measurable guides beaten, none missed (${summary.consecutiveCleanQuarters} clean quarter(s) in a row)`,
    };
  if (v === 'DELIVERED')
    return {
      status: 'PARTIAL',
      reason: `All ${summary.scored} measurable guides met, none beaten`,
    };
  if (v === 'MIXED' && summary.beats > 0 && summary.deliveryRate >= 75)
    return {
      status: 'PARTIAL',
      reason: `${summary.beats}/${summary.scored} guides beaten but ${summary.missed} missed — trust not yet earned`,
    };
  if (v === 'INSUFFICIENT_DATA')
    return { status: 'NOT_APPLICABLE', reason: 'No prior guidance measurable this quarter' };
  return { status: 'FAIL', reason: `${summary.missed}/${summary.scored} measurable guides missed` };
}

/**
 * New-catalyst leg from agent-judged C-A-T-A-L-Y-S-T triggers.
 * @param {Array<Object>} catalysts [{letter, title, number, timeline, conviction, isNew}]
 * @returns {Object}
 */
function catalystLeg(catalysts = []) {
  const fresh = catalysts.filter((c) => c.isNew);
  const firm = fresh.filter(
    (c) => /HIGH|MEDIUM/i.test(c.conviction || '') && c.number && c.timeline
  );
  if (firm.length)
    return {
      status: 'PASS',
      reason: firm.map((c) => `[${c.letter}] ${c.title}`).join('; '),
      count: firm.length,
    };
  if (fresh.length)
    return {
      status: 'PARTIAL',
      reason: `${fresh.length} new trigger(s) but optionality-only or missing number/timeline`,
      count: fresh.length,
    };
  return {
    status: 'FAIL',
    reason: 'No new C-A-T-A-L-Y-S-T trigger this quarter (confirmations only)',
    count: 0,
  };
}

/**
 * Combine the three legs into the inflection verdict.
 * @param {Object} legs {margin, guidanceTrust, newCatalyst}
 * @param {Object} [opts]
 * @param {boolean} [opts.priorConfirmed] Previous quarter's DTO already had INFLECTION_CONFIRMED
 * @param {Object} [opts.operatingLeverage] operatingLeverage() output — PAT > EBITDA > Revenue upgrades to Stage 3
 * @returns {Object}
 */
function inflectionVerdict(legs, { priorConfirmed = false, operatingLeverage: ol = null } = {}) {
  const st = Object.values(legs).map((l) => l.status);
  const pass = st.filter((s) => s === 'PASS').length;
  const partial = st.filter((s) => s === 'PARTIAL').length;
  let verdict;
  if (legs.margin.status === 'PASS' && pass >= 2) verdict = 'INFLECTION_CONFIRMED';
  else if (pass >= 1 || partial >= 2) verdict = 'INFLECTION_EMERGING';
  else verdict = 'NO_INFLECTION';
  let jCurveStage = null;
  const accelerating = ol && ol.leverageOrdered && ol.revenueYoY >= 20 && ol.patYoY >= 40;
  if (verdict === 'INFLECTION_CONFIRMED')
    jCurveStage = accelerating ? 'Stage 3 — Acceleration' : 'Stage 2 — Inflection';
  else if (verdict === 'INFLECTION_EMERGING' && legs.margin.status !== 'PASS')
    jCurveStage = 'Stage 1 — Base Building';
  const chips = [];
  if (verdict === 'INFLECTION_CONFIRMED') chips.push('INFLECTION CONFIRMED');
  if (verdict === 'INFLECTION_EMERGING') chips.push('INFLECTION EMERGING');
  if (verdict === 'INFLECTION_CONFIRMED' && !priorConfirmed) chips.push('Q+1 CONFIRMATION PENDING');
  if (legs.guidanceTrust.status === 'PASS') chips.push('GUIDANCE BEAT');
  if (legs.guidanceTrust.status === 'FAIL') chips.push('GUIDANCE MISS');
  return { verdict, legsPassed: pass, jCurveStage, chips };
}

/**
 * Magnitude arithmetic for a forward trigger; inputs come from the agent, maths stays here.
 * @param {Object} t trigger
 * @param {Object} ctx {quarterRevenueCr}
 * @returns {string|null}
 */
function triggerMagnitude(t, ctx = {}) {
  const m = t.magnitude || {};
  if (t.type === 'CAPACITY' && m.addedCapacity && m.currentCapacity) {
    const pct = (m.addedCapacity / m.currentCapacity) * 100;
    const rev =
      m.capexCr && m.assetTurn
        ? `; ~₹${round(m.capexCr * m.assetTurn)} Cr peak revenue at ${m.assetTurn}x asset turn`
        : '';
    return `+${round(pct)}% capacity (${m.currentCapacity} → ${m.currentCapacity + m.addedCapacity}${m.capacityUnit ? ` ${m.capacityUnit}` : ''})${rev}`;
  }
  if (t.type === 'MARGIN' && m.currentMarginPct != null && m.targetMarginPct != null) {
    const bps = Math.round((m.targetMarginPct - m.currentMarginPct) * 100);
    return `${sign(bps)} bps (${m.currentMarginPct}% → ${m.targetMarginPct}%)`;
  }
  if (t.type === 'ORDER_BOOK' && m.orderBookCr) {
    const annual = m.ttmRevenueCr || (ctx.quarterRevenueCr ? ctx.quarterRevenueCr * 4 : null);
    const parts = [];
    if (annual)
      parts.push(
        `${round(m.orderBookCr / annual)}x ${m.ttmRevenueCr ? 'TTM' : 'annualised-quarter'} revenue`
      );
    if (m.quarterInflowCr && ctx.quarterRevenueCr)
      parts.push(`book-to-bill ${round(m.quarterInflowCr / ctx.quarterRevenueCr)}x`);
    if (m.guidedOrderBookCr)
      parts.push(
        `guided ${sign(round(((m.guidedOrderBookCr - m.orderBookCr) / m.orderBookCr) * 100))}% to ₹${m.guidedOrderBookCr} Cr`
      );
    return parts.join('; ') || null;
  }
  return null;
}

/**
 * Sort forward triggers by distance, tag Train A/B/C, pick the next inflection.
 * @param {Array<Object>} triggers [{type, what, expectedBy, magnitude, conviction, source, quote}]
 * @param {Object} args {currentYyyymm, quarterRevenueCr}
 * @returns {Object}
 */
function buildNextInflection(triggers = [], { currentYyyymm, quarterRevenueCr }) {
  const curIdx = quarterIndex(currentYyyymm);
  const rows = triggers
    .map((t) => {
      const p = parsePeriod(t.expectedBy);
      const away = p.endYyyymm ? quarterIndex(p.endYyyymm) - curIdx : null;
      const train = away == null ? 'A' : away <= 0 ? 'C' : away <= 2 ? 'B' : 'A';
      return {
        ...t,
        expectedQuarter: p.label,
        quartersAway: away,
        train,
        magnitudeText: t.magnitudeText || triggerMagnitude(t, { quarterRevenueCr }),
      };
    })
    .sort((a, b) => (a.quartersAway ?? 99) - (b.quartersAway ?? 99));
  const firm = rows.filter(
    (r) => /HIGH|MEDIUM/i.test(r.conviction || '') && (r.quartersAway ?? 0) >= 0
  );
  const nearestByType = {};
  for (const r of firm) if (!nearestByType[r.type]) nearestByType[r.type] = r.expectedQuarter;
  const next = firm[0] || null;
  return {
    triggers: rows,
    nearestByType,
    next: next
      ? {
          type: next.type,
          what: next.what,
          expectedQuarter: next.expectedQuarter,
          quartersAway: next.quartersAway,
          train: next.train,
        }
      : null,
    checklistSeeds: firm.map((r) => ({
      kpi: `${r.type.replace('_', ' ')}: ${r.what}`,
      threshold: r.magnitudeText || r.what,
      horizon: r.expectedQuarter,
      source: r.source || 'next-inflection',
    })),
  };
}

/**
 * Deterministic seeds for the agent: strategic/guidance excerpts that look like C-A-T-A-L-Y-S-T
 * triggers, plus forward capacity/margin/order-book guides for the next-inflection timeline.
 * @param {Object} record quarterly-result-documents record
 * @param {Object} [opts]
 * @param {Object} [opts.currentForwardGuidance] forward-guidance DTO for the current quarter
 * @param {Object} [opts.reratingReport] latest rerating-catalysts DTO (if fresher than prior result)
 * @returns {{catalystCandidates: Array<Object>, nextInflectionSeeds: Array<Object>}}
 */
function buildSeeds(record, { currentForwardGuidance = null, reratingReport = null } = {}) {
  const catalystRe =
    /capex|capacity|plant|greenfield|brownfield|commission|launch|new product|acqui|merger|demerger|alliance|jv\b|usfda|approval|pli|order|contract|turnaround|de-?leverag|backward integration|export|new market|geograph/i;
  const catalystCandidates = [
    ...(record.strategicExcerpts || []).map((s) => ({
      title: s.initiative || s.title,
      detail: s.detail || s.details,
      quote: s.quote,
      page: s.page,
      source: s.source || 'strategicExcerpts',
    })),
    ...(reratingReport?.catalysts || []).map((c) => ({
      title: c.name,
      detail: c.newVsConfirmation,
      conviction: c.conviction,
      source: `rerating-catalysts ${reratingReport.date}`,
    })),
  ].filter((c) => catalystRe.test(`${c.title} ${c.detail}`));

  const forwardRe = /capacity|utili[sz]ation|order ?book|order inflow|margin|commission|plant/i;
  const curIdx = record.quarter
    ? quarterIndex(normalizeQuarter(record.quarter, record.date))
    : null;
  const nextInflectionSeeds = [
    ...(currentForwardGuidance?.guidance || [])
      .filter((g) => forwardRe.test(g.metric))
      .filter((g) => {
        const p = parsePeriod(g.period_guided);
        return !p.endYyyymm || curIdx == null || quarterIndex(p.endYyyymm) >= curIdx;
      })
      .map((g) => ({
        metric: g.metric,
        period: g.period_guided,
        display: g.display,
        quote: g.quote,
        source: 'forward-guidance',
      })),
    ...(record.guidanceExcerpts || [])
      .filter((g) => forwardRe.test(`${g.metric} ${g.guidedValue}`))
      .map((g) => ({
        metric: g.metric,
        display: g.guidedValue,
        quote: g.quote,
        page: g.page,
        source: g.source,
      })),
    ...(record.kpiExcerpts || [])
      .filter((k) => /order ?book|order inflow|capacity|utili[sz]ation/i.test(k.label))
      .map((k) => ({
        metric: k.label,
        display: `${k.value} (${k.comparison || ''})`,
        source: k.source,
      })),
  ];
  return { catalystCandidates, nextInflectionSeeds };
}

/**
 * Prepare step: everything the agent needs for the three sections, from explicit inputs only.
 * @param {Object} args
 * @param {Object} args.record quarterly-result-documents record (current quarter)
 * @param {Array<Object>} [args.forwardGuidanceDtos] all forward-guidance DTOs for the company
 * @param {Array<Object>} [args.priorResultDtos] all quarterly-result DTOs for the company
 * @param {Array<Object>} [args.reratingReports] rerating-catalysts DTOs for the company
 * @param {Array<Object>} [args.priorGuidance] pre-collected prior guidance (history pack's
 *   `priorGuidance`); when given, it is used as-is instead of re-collecting from the DTOs
 * @returns {Object}
 */
function prepareInflectionContext({
  record,
  forwardGuidanceDtos = [],
  priorResultDtos = [],
  reratingReports = [],
  priorGuidance: packedPriorGuidance = null,
}) {
  const currentYyyymm = normalizeQuarter(record.quarter, record.date);
  if (!currentYyyymm) return { error: 'Cannot resolve the current quarter from the record' };
  const curIdx = quarterIndex(currentYyyymm);
  const priorGuidance =
    packedPriorGuidance ||
    collectPriorGuidance({
      currentYyyymm,
      forwardGuidanceDtos,
      priorResultDtos,
    });
  const currentFg =
    forwardGuidanceDtos.find((d) => normalizeQuarter(d.quarter, d.date) === currentYyyymm) || null;
  const prior = priorResultDtos
    .filter((d) => {
      const q = normalizeQuarter(d.quarter, d.date);
      return q && quarterIndex(q) < curIdx;
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const lastResultDate = prior[0]?.date || null;
  const rerating =
    reratingReports
      .filter((r) => !lastResultDate || String(r.date) >= String(lastResultDate))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
  return {
    currentQuarter: quarterLabel(currentYyyymm),
    walkTheTalkLedger: buildWalkTheTalkLedger({
      currentYyyymm,
      priorGuidance,
      headline: record.headlineFinancials,
    }),
    priorGuidanceSources: [...new Set(priorGuidance.map((g) => g.sourceId))],
    priorWalkTheTalkVerdicts: prior.map((d) => d.walkTheTalk?.summary?.verdict).filter(Boolean),
    priorInflectionConfirmed: prior[0]?.inflectionPoint?.verdict === 'INFLECTION_CONFIRMED',
    marginLeg: marginLeg(record),
    operatingLeverage: operatingLeverage(record.headlineFinancials),
    ...buildSeeds(record, { currentForwardGuidance: currentFg, reratingReport: rerating }),
  };
}

/**
 * Score step: turn the agent's filled-in inputs into the three DTO blocks.
 * @param {Object} args
 * @param {Object} args.record quarterly-result-documents record
 * @param {Object} args.prep output of prepareInflectionContext()
 * @param {Object} args.agentInput {walkTheTalkLedger, newCatalysts, nextTriggers, marginLegOverride}
 * @returns {{walkTheTalk: Object, inflectionPoint: Object, nextInflection: Object}}
 */
function finalizeInflection({ record, prep, agentInput = {} }) {
  const currentYyyymm = normalizeQuarter(record.quarter, record.date);
  const walkTheTalk = scoreWalkTheTalk(
    agentInput.walkTheTalkLedger || prep.walkTheTalkLedger,
    prep.priorWalkTheTalkVerdicts
  );
  const legs = {
    margin: agentInput.marginLegOverride || prep.marginLeg,
    guidanceTrust: guidanceTrustLeg(walkTheTalk.summary),
    newCatalyst: catalystLeg(agentInput.newCatalysts),
  };
  const quarterRevenueCr = (
    Array.isArray(record.headlineFinancials) ? record.headlineFinancials : []
  ).find((c) => c.key === 'revenue')?.value;
  return {
    walkTheTalk,
    inflectionPoint: {
      ...inflectionVerdict(legs, {
        priorConfirmed: prep.priorInflectionConfirmed,
        operatingLeverage: prep.operatingLeverage,
      }),
      legs,
      operatingLeverage: prep.operatingLeverage,
      newCatalysts: agentInput.newCatalysts || [],
    },
    nextInflection: buildNextInflection(agentInput.nextTriggers, {
      currentYyyymm,
      quarterRevenueCr,
    }),
  };
}

function round(n) {
  return Math.round(n * 10) / 10;
}
function sign(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

module.exports = {
  quarterIndex,
  normalizeQuarter,
  quarterLabel,
  parsePeriod,
  parseRange,
  collectPriorGuidance,
  measurability,
  buildWalkTheTalkLedger,
  scoreRow,
  scoreWalkTheTalk,
  marginLeg,
  operatingLeverage,
  guidanceTrustLeg,
  catalystLeg,
  inflectionVerdict,
  buildNextInflection,
  buildSeeds,
  prepareInflectionContext,
  finalizeInflection,
};
