'use strict';
/**
 * paperSupply — pure evaluators for the SOIC "paper supply at high valuation" watch
 * (kba_x-soic-handles_valuation-playbook_paper-supply): promoter/institution block selling and
 * QIP / preferential issues in stocks trading at rich P/E. Source claim: QIP/placements cluster at
 * peak multiples (~100x P/E cited). ALL thresholds are ASSUMPTIONS (uncalibrated):
 *   P1 high-PE block selling: PE > 50 and 5-session SELL block value >= Rs 25 Cr -> detected; >= Rs 100 Cr -> confirmed
 *   P2 high-PE fundraise: QIP/preferential announcement in last 7 days and PE > 50 -> detected; PE >= 100 -> confirmed
 */
const TH = Object.freeze({ pe: 50, pe2: 100, blockDetectedCr: 25, blockConfirmedCr: 100 });
const num = (x) => typeof x === 'number' && Number.isFinite(x);

const NOISE = /deviation|variation|utili[sz]ation|monitoring agency|disclosure of proceeds/i;
const QIP = /\bQIP\b|qualified institutions?\s+placement/i;
const CONVERSION = /conversion of (warrants?|securities|convertible)/i;
const PREF = /preferential\s+(issue|allotment|basis)|warrants?\b.*\b(preferential|allot)/i;

/** @returns {'QIP'|'PREFERENTIAL'|'PREFERENTIAL_CONVERSION'|null} classification from announcement title + description only (not snippets) */
function fundraiseKind({ title = '', description = '' } = {}) {
  const t = `${title} ${description}`;
  if (NOISE.test(t)) return null;
  if (QIP.test(t)) return 'QIP';
  if (CONVERSION.test(t)) return 'PREFERENTIAL_CONVERSION'; // earlier-priced warrants converting: weaker signal than a fresh raise
  if (PREF.test(t)) return 'PREFERENTIAL';
  return null;
}

function blockSellState(valueCr, pe, th = TH) {
  if (!num(valueCr) || !num(pe) || pe <= th.pe) return null;
  return valueCr >= th.blockConfirmedCr
    ? 'confirmed'
    : valueCr >= th.blockDetectedCr
      ? 'detected'
      : null;
}

function fundraiseState(kind, pe, th = TH) {
  if (!kind || !num(pe) || pe <= th.pe) return null;
  return pe >= th.pe2 && kind !== 'PREFERENTIAL_CONVERSION' ? 'confirmed' : 'detected';
}

/** rows: NSE block-deal rows; returns Map(symbol -> SELL value Rs Cr) */
function sellValueBySymbol(rows) {
  const m = new Map();
  for (const r of rows) {
    if (r.BD_BUY_SELL !== 'SELL') continue;
    const v = (Number(r.BD_QTY_TRD) * Number(r.BD_TP_WATP)) / 1e7;
    if (!Number.isFinite(v) || !r.BD_SYMBOL) continue;
    m.set(r.BD_SYMBOL, (m.get(r.BD_SYMBOL) || 0) + v);
  }
  return m;
}

/** calendar quarter-end YYYYMM for an ISO date */
function quarterDate(iso) {
  const [y, m] = iso.split('-').map(Number);
  const qm = Math.ceil(m / 3) * 3;
  return `${y}${String(qm).padStart(2, '0')}`;
}

module.exports = {
  TH,
  fundraiseKind,
  blockSellState,
  fundraiseState,
  sellValueBySymbol,
  quarterDate,
};
