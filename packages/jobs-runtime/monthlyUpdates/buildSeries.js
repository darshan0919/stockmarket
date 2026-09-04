'use strict';
/**
 * Deterministic series/growth builder (conventions §17: Extraction — all
 * arithmetic lives here in JS, never in the model, so a growth figure always
 * follows from the stored levels it was computed from).
 */

const { normalizeUnit, classifyPeriodType } = require('./normalizeUnit.js');

/** Month arithmetic on "YYYY-MM" labels. */
function addMonths(label, delta) {
  const [y, m] = String(label).split('-').map(Number);
  const t = y * 12 + (m - 1) + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

function pct(cur, base) {
  if (cur === null || cur === undefined || base === null || base === undefined) return null;
  if (!(base > 0)) return null;
  return Number((((cur - base) / base) * 100).toFixed(2));
}

/**
 * Group parsed filings into one time series per company.
 *
 * A company may file more than once for the same period (a revision, or a
 * cover letter plus a press release). Newest filing wins, with a preference
 * for the higher-confidence reading, so a revision supersedes cleanly.
 */
function buildCompanySeries(parsedRecords) {
  const byCompany = new Map();
  const CONF = { high: 3, medium: 2, low: 1 };

  for (const r of parsedRecords) {
    const p = r && r.parsed;
    if (!p || !p.usable || !p.periodLabel) continue;
    const cid = r.companyId;
    if (!byCompany.has(cid)) {
      byCompany.set(cid, { companyId: cid, name: r.name || cid, points: new Map() });
    }
    const entry = byCompany.get(cid);
    const prev = entry.points.get(p.periodLabel);
    const better =
      !prev ||
      (CONF[p.confidence] || 0) > (CONF[prev.confidence] || 0) ||
      ((CONF[p.confidence] || 0) === (CONF[prev.confidence] || 0) && r.date > prev.filedOn);
    if (better) {
      entry.points.set(p.periodLabel, {
        period: p.periodLabel,
        value: p.currentValue,
        priorYearValue: p.priorYearValue,
        ytdValue: p.ytdValue,
        unit: p.unit,
        metricName: p.metricName,
        scope: p.scope,
        segments: p.segments || [],
        confidence: p.confidence,
        notes: p.notes || null,
        filedOn: r.date,
        ssUrl: r.ssUrl,
        periodInferred: !!p.periodInferred,
      });
    }
  }

  const out = [];
  for (const entry of byCompany.values()) {
    const series = [...entry.points.values()].sort((a, b) => a.period.localeCompare(b.period));
    if (!series.length) continue;
    const latest = series[series.length - 1];
    const byPeriod = new Map(series.map((s) => [s.period, s]));

    // MoM: previous calendar month.
    const prevMonth = byPeriod.get(addMonths(latest.period, -1));
    // YoY: same month a year earlier. Prefer the filing's OWN stated prior-year
    // figure — it is the company's own restated comparable and handles
    // reclassifications our history wouldn't know about — and fall back to the
    // series only when the filing didn't state one.
    const yoyBaseFromSeries = byPeriod.get(addMonths(latest.period, -12));
    const yoyBase =
      latest.priorYearValue !== null && latest.priorYearValue !== undefined
        ? latest.priorYearValue
        : yoyBaseFromSeries
          ? yoyBaseFromSeries.value
          : null;

    // QoQ on a monthly series = latest 3 months vs the preceding 3 months,
    // which is the like-for-like comparison; a single month vs a single month
    // three months back would just be a lagged MoM and would read as seasonal
    // noise rather than a trend.
    // Detect reporting cadence from the median gap between consecutive
    // periods. Not every filer in this scan is monthly — banks, NBFCs and
    // several retailers file QUARTERLY business updates through the same
    // announcement categories, and summing three of those as if they were
    // three months would silently triple-count a quarter.
    const gaps = [];
    for (let i = 1; i < series.length; i++) {
      const [y1, m1] = series[i - 1].period.split('-').map(Number);
      const [y2, m2] = series[i].period.split('-').map(Number);
      gaps.push(y2 * 12 + m2 - (y1 * 12 + m1));
    }
    const sortedGaps = gaps.slice().sort((a, b) => a - b);
    const cadence = sortedGaps.length ? sortedGaps[Math.floor(sortedGaps.length / 2)] : null;
    const isMonthly = cadence === null || cadence === 1;

    const sum = (arr) => (arr.length ? arr.reduce((a, b) => a + b.value, 0) : null);
    const last3 = series.slice(-3);
    const prev3 = series.slice(-6, -3);
    // QoQ is only meaningful as a 3-month roll-up for a MONTHLY filer. For a
    // quarterly filer, the previous data point already IS the prior quarter.
    let qoq = null;
    if (isMonthly) {
      qoq = last3.length === 3 && prev3.length === 3 ? pct(sum(last3), sum(prev3)) : null;
    } else if (cadence === 3 && series.length >= 2) {
      qoq = pct(latest.value, series[series.length - 2].value);
    }

    // Normalise the unit and classify what kind of quantity this is, so the
    // UI can refuse to compare things that aren't comparable (see
    // normalizeUnit.js for why the raw labels can't be trusted on their own).
    const u = normalizeUnit(latest.unit, {
      companyId: entry.companyId,
      scope: latest.scope,
      notes: latest.notes,
    });
    const periodType = classifyPeriodType({
      scope: latest.scope,
      metricName: latest.metricName,
      notes: latest.notes,
      cadence,
    });

    out.push({
      companyId: entry.companyId,
      name: entry.name,
      unit: latest.unit,
      unitFamily: u.family,
      canonicalUnit: u.canonicalUnit,
      unitMultiplier: u.multiplier,
      unitUncertain: !!u.uncertain,
      unitNote: u.note || null,
      // Comparable base value: the printed figure expressed in the family's
      // base unit (Rs cr for currency, tonnes for volume). Null when the unit
      // couldn't be resolved — better absent than silently wrong.
      canonicalValue:
        u.multiplier !== null && latest.value !== null
          ? Number((latest.value * u.multiplier).toPrecision(12))
          : null,
      periodType,
      isFlow: periodType !== 'stock',
      metricName: latest.metricName,
      scope: latest.scope,
      latestPeriod: latest.period,
      latestValue: latest.value,
      latestFiledOn: latest.filedOn,
      confidence: latest.confidence,
      cadence,
      isMonthly,
      momPct: isMonthly && prevMonth ? pct(latest.value, prevMonth.value) : null,
      yoyPct: pct(latest.value, yoyBase),
      yoyBasis:
        latest.priorYearValue !== null && latest.priorYearValue !== undefined
          ? 'filing-stated'
          : yoyBaseFromSeries
            ? 'series'
            : null,
      qoqPct: qoq,
      qoqBasis: isMonthly ? '3m-rollup' : cadence === 3 ? 'consecutive-quarters' : null,
      quarterSum: isMonthly && last3.length === 3 ? sum(last3) : null,
      priorQuarterSum: isMonthly && prev3.length === 3 ? sum(prev3) : null,
      months: series.length,
      segments: latest.segments,
      series: series.map((s) => ({
        period: s.period,
        value: s.value,
        confidence: s.confidence,
        ssUrl: s.ssUrl,
      })),
    });
  }

  return out.sort((a, b) => (b.yoyPct ?? -Infinity) - (a.yoyPct ?? -Infinity));
}

module.exports = { buildCompanySeries, addMonths, pct };
