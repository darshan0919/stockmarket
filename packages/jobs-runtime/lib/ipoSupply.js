'use strict';
/**
 * ipoSupply — pure evaluators for the IPO/OFS leg of the SOIC "paper supply" watch
 * (kba_x-soic-handles_valuation-playbook_paper-supply). No I/O. ALL thresholds are ASSUMPTIONS (uncalibrated).
 * Sources: ishmohit1 (check new IPOs 12-18 months after listing; triple-digit-PE / loss-making / >50x-PE IPOs are more
 * likely overpriced; study 12-24 months after listing once euphoria cools); Suresh (an OFS causes short-term price
 * pressure; pre-IPO holders exit at the IPO); chartist (IPO under 1 year goes in a separate scan).
 *
 *  P3-ipo-review-window: age 12-18m -> detected; plus cooled (price <= IPO offer price) AND PAT YoY > 0 AND no
 *      OVERPRICED_RISK -> confirmed. Age 18-24m counts only when cooled and growing (detected).
 *      OVERPRICED_RISK = IPO-time P/E > 50, or loss-making (IPO P/E missing/<=0), or current P/E > 100.
 *  P4-lockin-expiry: SEBI ICDR lock-in ends approximated from LISTING date (true clock starts at allotment, ~3 days
 *      earlier; secondary-source rules, verify against ICDR): anchors 50% at +30d, rest at +90d; pre-IPO holders +6m;
 *      promoter minimum contribution +18m. Event within [-2, +5] calendar days -> detected; and issue size >= Rs 2,000 Cr
 *      or market cap >= Rs 10,000 Cr -> confirmed. Share count unlocking is NOT known.
 *  P5-ofs-announcement: announcement (last 7 days) mentioning an offer for sale; detected; confirmed if P/E > 50.
 */
const TH = Object.freeze({
  reviewMin: 12,
  reviewCoreMax: 18,
  reviewMax: 24,
  overpricedPe: 50,
  overpricedPeCurrent: 100,
  lockBeforeDays: 2,
  lockAfterDays: 5,
  lockConfirmIssueCr: 2000,
  lockConfirmMcapCr: 10000,
  ofsPe: 50,
});
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const DAY = 86400000;
const toNum = (x) => (x == null || x === '' ? null : Number(String(x).replace(/,/g, '')));

function monthsBetween(fromIso, toIso) {
  const a = new Date(fromIso + 'T00:00:00Z');
  const b = new Date(toIso + 'T00:00:00Z');
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + (b.getUTCDate() - a.getUTCDate()) / 30;
}
function addMonths(iso, m) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.toISOString().slice(0, 10);
}
function addDays(iso, n) {
  return new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
}

/** @param {{listingDate:string, today:string, offerPrice?:number, close?:number, ipoPe?:number|null, pe?:number|null, patYoY?:number|null}} i */
function ipoReview(i) {
  const age = monthsBetween(i.listingDate, i.today);
  const flags = [];
  const ipoPe = toNum(i.ipoPe);
  if (!num(ipoPe) || ipoPe <= 0) flags.push('LOSS_MAKING_AT_IPO');
  else if (ipoPe > TH.overpricedPe) flags.push('IPO_PE_GT_50');
  if (num(i.pe) && i.pe > TH.overpricedPeCurrent) flags.push('CURRENT_PE_GT_100');
  const cooled = num(i.close) && num(i.offerPrice) && i.offerPrice > 0 && i.close <= i.offerPrice;
  const growing = num(i.patYoY) && i.patYoY > 0;
  const evidence = {
    ageMonths: Math.round(age * 10) / 10,
    ipoPe,
    offerPrice: i.offerPrice ?? null,
    close: i.close ?? null,
    pe: i.pe ?? null,
    patYoY: i.patYoY ?? null,
    cooled: !!cooled,
    flags,
  };
  let state = null;
  if (age >= TH.reviewMin && age <= TH.reviewCoreMax) {
    state = 'detected';
    if (cooled && growing && flags.length === 0) state = 'confirmed';
  } else if (age > TH.reviewCoreMax && age <= TH.reviewMax && cooled && growing) {
    state = 'detected';
  }
  return { state, evidence };
}

/** @returns {{state, evidence}} for the nearest lock-in event around `today` */
function lockInExpiry({ listingDate, today, issueSizeCr, marketCapCr }) {
  const events = [
    ['ANCHOR_50PCT_30D', addDays(listingDate, 30)],
    ['ANCHOR_REST_90D', addDays(listingDate, 90)],
    ['PRE_IPO_HOLDERS_6M', addMonths(listingDate, 6)],
    ['PROMOTER_MIN_CONTRIB_18M', addMonths(listingDate, 18)],
  ];
  const t = Date.parse(today + 'T00:00:00Z');
  const hit = events
    .map(([kind, date]) => ({ kind, date, days: Math.round((Date.parse(date + 'T00:00:00Z') - t) / DAY) }))
    .filter((e) => e.days >= -TH.lockBeforeDays && e.days <= TH.lockAfterDays)
    .sort((a, b) => Math.abs(a.days) - Math.abs(b.days))[0];
  if (!hit) return { state: null, evidence: {} };
  const big = (num(issueSizeCr) && issueSizeCr >= TH.lockConfirmIssueCr) || (num(marketCapCr) && marketCapCr >= TH.lockConfirmMcapCr);
  return {
    state: big ? 'confirmed' : 'detected',
    evidence: { event: hit.kind, date: hit.date, daysAway: hit.days, issueSizeCr: issueSizeCr ?? null, marketCapCr: marketCapCr ?? null },
  };
}

const OFS = /\boffer\s+for\s+sale\b|\bOFS\b/i;
const OFS_NOISE = /\b(ipo|initial public offer)\b.*\boffer for sale\b|red herring|draft red herring|\bDRHP\b|price band/i;
const OFS_PROMOTER = /promoter|government|GoI|disinvest|stake sale/i;
/** @returns {'PROMOTER_OFS'|'OFS'|null} from announcement title + description */
function ofsKind({ title = '', description = '' } = {}) {
  const t = `${title} ${description}`;
  if (!OFS.test(t) || OFS_NOISE.test(t)) return null;
  return OFS_PROMOTER.test(t) ? 'PROMOTER_OFS' : 'OFS';
}
function ofsState(kind, pe) {
  if (!kind) return null;
  return num(pe) && pe > TH.ofsPe ? 'confirmed' : 'detected';
}

module.exports = { TH, monthsBetween, addMonths, addDays, ipoReview, lockInExpiry, ofsKind, ofsState, toNum };
