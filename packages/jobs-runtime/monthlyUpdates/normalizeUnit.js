'use strict';
/**
 * Unit normalisation + period-type classification.
 *
 * Added after an independent audit (2026-09-04) found two defects that were
 * invisible in the values themselves — every sampled number was exact, but the
 * LABELS around them were lossy:
 *
 *  1. `unit: "other"` destroyed magnitude. UCOBANK printed "(Rs. in lakh crore)"
 *     and stored 6.05; CSBBANK stored 44,246 in Rs cr. Both are "deposits", and
 *     nothing in the typed fields said one was ~605,000 cr and the other
 *     ~44,246 cr. Any cross-company sort or chart over those is nonsense.
 *     Worse, the same company flipped labels month to month (NMDC: MT /
 *     "million tonnes" / other; ADANIPORTS: MT / MMT).
 *  2. Quarterly flows and point-in-time stocks (AUM, deposits, total business)
 *     were stored beside true monthly flows with no discriminator, so ~20% of
 *     records would silently be trended or summed as if they were monthly sales.
 *
 * Fix: map every free-text unit onto a closed {family, canonicalUnit, multiplier}
 * and classify every reading as month-flow / quarter-flow / stock. Values are
 * NOT rewritten — the printed figure stays as filed; the multiplier and
 * canonical unit are carried alongside so downstream can compare correctly.
 */

// family: 'currency' | 'volume' | 'count' | 'energy' | 'unknown'
// multiplier converts the printed figure to the family's base unit
// (currency base = Rs crore; volume base = tonnes).
const UNIT_MAP = [
  // ── currency, base = Rs crore ──────────────────────────────────────────
  [/^(rs\.?\s*)?(in\s*)?lakh\s*crore$/i,            { family: 'currency', canonical: 'Rs cr', multiplier: 100000 }],
  [/^(rs\.?\s*)?(in\s*)?(crore|cr|crores)$/i,        { family: 'currency', canonical: 'Rs cr', multiplier: 1 }],
  [/^(rs\.?\s*)?(in\s*)?(bn|billion)$/i,             { family: 'currency', canonical: 'Rs cr', multiplier: 100 }],
  [/^(rs\.?\s*)?(in\s*)?(mn|million)$/i,             { family: 'currency', canonical: 'Rs cr', multiplier: 0.1 }],
  [/^(rs\.?\s*)?(in\s*)?(lakh|lac|lacs|lakhs)$/i,    { family: 'currency', canonical: 'Rs cr', multiplier: 0.01 }],
  [/^(rs|inr|rupees?)$/i,                            { family: 'currency', canonical: 'Rs cr', multiplier: 1e-7 }],
  [/^usd\s*(mn|million)$/i,                          { family: 'currency', canonical: 'USD mn', multiplier: 1 }],

  // ── volume, base = tonnes ──────────────────────────────────────────────
  // "MT" is genuinely ambiguous in these filings: NMDC prints "(in MT)" but
  // means MILLION tonnes. Resolved per-company below, not by the label alone.
  [/^(mmt|million\s*tonnes?|million\s*ton(ne)?s?|mn\s*t)$/i, { family: 'volume', canonical: 'tonnes', multiplier: 1e6 }],
  [/^(tonnes?|tons?|te)$/i,                          { family: 'volume', canonical: 'tonnes', multiplier: 1 }],
  [/^mt$/i,                                          { family: 'volume', canonical: 'tonnes', multiplier: 1, ambiguous: true }],

  // ── counts / energy ────────────────────────────────────────────────────
  [/^(units?|nos\.?|numbers?|vehicles?)$/i,          { family: 'count', canonical: 'units', multiplier: 1 }],
  [/^mw$/i,                                          { family: 'energy', canonical: 'MW', multiplier: 1 }],
];

// Companies whose "MT" means million tonnes. NMDC's filings print "(in MT)"
// over figures like 3.58 that are plainly millions of tonnes, not 3.58 tonnes.
const MT_MEANS_MILLION = new Set(['NSE:NMDC', 'BSE:NMDC', 'NSE:COALINDIA', 'BSE:COALINDIA']);

/**
 * Resolve a free-text unit string to a canonical descriptor.
 * @param {string} raw unit as printed/reported
 * @param {Object} ctx { companyId, scope, notes } — used to disambiguate
 */
function normalizeUnit(raw, ctx = {}) {
  const s = String(raw || '').trim();
  const hay = `${s} ${ctx.scope || ''} ${ctx.notes || ''}`;

  // A unit of "other"/blank often means the magnitude was stated in prose or
  // in the scope ("Rs Bn", "INR billion") rather than a unit column — recover
  // it from there before giving up.
  let candidate = s;
  if (!s || /^other$/i.test(s)) {
    const m = hay.match(/\b(lakh\s*crore|crores?|cr|billion|bn|million|mn|lakhs?|lacs?)\b/i);
    if (m) candidate = m[1];
  }

  for (const [re, def] of UNIT_MAP) {
    if (re.test(candidate)) {
      const out = { raw: s || null, family: def.family, canonicalUnit: def.canonical, multiplier: def.multiplier };
      if (def.ambiguous) {
        if (MT_MEANS_MILLION.has(ctx.companyId) || /million/i.test(hay)) {
          out.multiplier = 1e6;
          out.note = 'MT read as million tonnes for this filer';
        } else {
          out.uncertain = true;
          out.note = 'MT is ambiguous (tonnes vs million tonnes) — not comparable across filers';
        }
      }
      return out;
    }
  }
  return { raw: s || null, family: 'unknown', canonicalUnit: s || null, multiplier: null, uncertain: true };
}

/**
 * Classify what KIND of quantity a reading is. Mixing these is the error this
 * prevents: a quarterly revenue flow and a point-in-time AUM balance cannot be
 * trended or summed alongside a month of unit sales.
 * @returns {'month-flow'|'quarter-flow'|'year-flow'|'stock'}
 */
function classifyPeriodType({ scope, metricName, notes, cadence } = {}) {
  const hay = `${scope || ''} ${metricName || ''} ${notes || ''}`.toLowerCase();
  // Point-in-time balances — a level, not a flow.
  if (/\b(aum|assets under management|deposits?|advances|total business|loan book|outstanding|balance|gross npa|branches?)\b/.test(hay)) {
    return 'stock';
  }
  if (/\b(fy\s?\d|full[- ]year|annual|12m|year to date|ytd)\b/.test(hay)) return 'year-flow';
  if (/\b(q[1-4]\b|quarter|quarterly|3m|9m|8m)\b/.test(hay)) return 'quarter-flow';
  if (cadence && cadence >= 3) return 'quarter-flow';
  return 'month-flow';
}

module.exports = { normalizeUnit, classifyPeriodType, UNIT_MAP, MT_MEANS_MILLION };
