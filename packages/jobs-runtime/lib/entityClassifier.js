'use strict';

/**
 * entityClassifier.js — classify bulk/block deal counterparties into
 * fundamentally different groups so dealsDigest doesn't lump HFT/prop
 * facilitation desks together with brokers acting as real principals,
 * institutions, or individuals.
 *
 * Why this matters (see 24-Jul-2026 SHADOWFAX / unnamed-495 analysis):
 * on a single day, most "buy" and "sell" bulk-deal legs for a name are the
 * SAME entity buying and selling ~identical quantities within minutes —
 * e.g. Kotak Securities Ltd bought 54,89,436 @ ₹205 and sold 54,89,436 @
 * ₹205 the same session. That is not directional investing; it's a
 * riskless-principal crossing trade (an HFT/prop desk warehousing a block
 * from a seller like a VC/anchor investor and immediately re-distributing
 * it to real buyers). Treating that as "buying interest" materially
 * misreads the digest. Genuine net buyers (e.g. Carnelian Asset
 * Management, Goldman Sachs Bank Europe SE ODI) show up with one-sided,
 * unmatched quantities instead.
 *
 * Classification is two-layered:
 *   1. BEHAVIORAL (primary, always computed): same symbol + same client,
 *      same day — if buy qty and sell qty are both present and nearly
 *      equal, the entity is tagged 'HFT_FACILITATOR' regardless of what
 *      its name looks like. Name-based labels are unreliable on their own
 *      (e.g. "NK Securities Research Private Limited" sounds like a
 *      broker but trades like a prop/HFT desk).
 *   2. NAME-BASED (fallback, for one-sided rows only): curated keyword
 *      lists distinguish Broker / Institution-FPI / HFT-Prop / Other.
 *
 * Exported:
 *   classifyByName(name) -> 'HFT_PROP' | 'BROKER' | 'INSTITUTION_FPI' | 'OTHER'
 *   tagEntityTypes(rows)  -> same rows, each stamped with `entityType` +
 *                            `sameDayNetQty` (mutates and returns rows)
 */

// Curated — extend as new names are observed. Substring match, case-insensitive.
// Known Indian/global HFT & proprietary-trading desks (not broking clients).
const HFT_PROP_NAMES = [
  'jump trading',
  'nk securities research',
  'microcurves trading',
  'graviton research',
  'tower research',
  'xtx markets',
  'quadeye',
  'alphagrep',
  'da capital',
  'quantbox',
  'tradelab',
  'espresso',
  'waverock',
  'chetan securities',
  'algo capital',
  'two roads trading',
  'yuga stocks and commodities',
  'grt strategic ventures',
];

// Well-known broking houses — when they show a one-sided (non-flat) position,
// treat as a broker's own book / client-facilitated directional trade.
const BROKER_NAMES = [
  'kotak securities',
  'motilal oswal',
  'icici securities',
  'hdfc securities',
  'zerodha',
  'angel one',
  'iifl',
  'edelweiss',
  'axis securities',
  'nuvama',
  'jm financial',
  'anand rathi',
  'emkay global',
  'irage broking',
  'prb securities',
  'dipan mehta commodities',
  'elixir wealth management',
];

// Institutional / FPI / ODI signatures.
const INSTITUTION_PATTERNS = [
  /asset management/i,
  /mutual fund/i,
  /\bamc\b/i,
  /insurance/i,
  /pension/i,
  /\baif\b/i,
  /\bpms\b/i,
  /alternative investment/i,
  /provident fund/i,
  /\bodi\b/i,
  /offshore derivative/i,
  /\bfpi\b/i,
  /foreign portfolio/i,
  /(goldman sachs|morgan stanley|merrill lynch|citigroup|nomura|jpmorgan|jp morgan|societe generale|barclays|hsbc|deutsche bank|ubs).*(bank|se\b)/i,
];

function classifyByName(name) {
  const n = String(name || '').toLowerCase();
  if (!n) return 'OTHER';
  if (INSTITUTION_PATTERNS.some((re) => re.test(n))) return 'INSTITUTION_FPI';
  if (HFT_PROP_NAMES.some((k) => n.includes(k))) return 'HFT_PROP';
  if (BROKER_NAMES.some((k) => n.includes(k))) return 'BROKER';
  if (/broking|stock broker/i.test(n)) return 'BROKER';
  if (/securities|trading|capital|ventures/i.test(n)) return 'HFT_PROP'; // prop-desk-shaped name, unconfirmed
  return 'OTHER';
}

const BUY_RE = /buy|acq/i;
const SELL_RE = /sell|sale|dispos/i;

/**
 * Tags each row with:
 *  - sameDayNetQty: signed net qty for that (symbol, client) pair across
 *    the whole rows array (buys positive, sells negative)
 *  - entityType: 'HFT_FACILITATOR' when both sides present and roughly
 *    balanced (within FLAT_TOLERANCE of gross qty), else the name-based
 *    classification from classifyByName()
 *
 * @param {Array<{symbol:string, client:string, side:string, qty:number}>} rows
 * @param {number} flatTolerance fraction of gross qty allowed as "flat" (default 0.15)
 */
function tagEntityTypes(rows, flatTolerance = 0.15) {
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.symbol}__${(r.client || '').trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, { buyQty: 0, sellQty: 0 });
    const g = groups.get(key);
    const qty = r.qty || 0;
    if (BUY_RE.test(r.side || '')) g.buyQty += qty;
    else if (SELL_RE.test(r.side || '')) g.sellQty += qty;
  }

  for (const r of rows) {
    const key = `${r.symbol}__${(r.client || '').trim().toLowerCase()}`;
    const g = groups.get(key) || { buyQty: 0, sellQty: 0 };
    const netQty = g.buyQty - g.sellQty;
    const grossQty = g.buyQty + g.sellQty;
    r.sameDayNetQty = netQty;

    const bothSides = g.buyQty > 0 && g.sellQty > 0;
    const flatRatio = grossQty > 0 ? Math.abs(netQty) / grossQty : 1;

    if (bothSides && flatRatio <= flatTolerance) {
      r.entityType = 'HFT_FACILITATOR';
    } else {
      r.entityType = classifyByName(r.client);
    }
  }
  return rows;
}

const ENTITY_TYPE_LABELS = {
  HFT_FACILITATOR: { label: 'HFT/Facilitator', color: '#8e24aa' },
  HFT_PROP: { label: 'HFT/Prop', color: '#8e24aa' },
  BROKER: { label: 'Broker', color: '#1565c0' },
  INSTITUTION_FPI: { label: 'Institution/FPI', color: '#2e7d32' },
  OTHER: { label: 'Other', color: '#757575' },
};

module.exports = { classifyByName, tagEntityTypes, ENTITY_TYPE_LABELS };
