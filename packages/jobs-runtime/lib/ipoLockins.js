'use strict';
/**
 * ipoLockins — pure evaluators for the IPO float-unlock schedule of a recently listed company.
 * No I/O. Used by the thesis-card renderers (lib/thesisCardEmail.js) and by the `ipo-lockin` CLI so every
 * skill output states how far the NEXT unlock is and how much it releases (skills/_shared/ipo-lockin-watch.md).
 *
 * Two record bases (`basis`):
 *   rhp      EXACT — tranche sizes derived from the offer document's own numbers (post-issue shares, IPO shares,
 *            anchor shares, promoter contribution) via `exactSchedule`.
 *   estimate DATES ONLY — derived from the listing date + ICDR rule table (`estimateSchedule`); tranche sizes unknown.
 *
 * Rules (SEBI ICDR; secondary-source for SME — verify against the regulation text before relying on it):
 *   anchor        50% of allotted anchor shares +30d, the rest +90d from ALLOTMENT (day-count convention differs by
 *                 one day between data vendors; this module uses allotment + N days literally).
 *   mainboard     pre-offer holders + promoter holding above the 20% contribution: +6m; promoter minimum
 *                 contribution (20% of post-issue capital): +18m (the RHP says 36m when the issue funds a project capex —
 *                 pass `mpcMonths` from the RHP for an exact record).
 *   SME           promoter contribution +36m; all other pre-offer holdings +12m.
 */
const { addDays, addMonths, monthsBetween } = require('./ipoSupply');

const RECENT_MONTHS = 24;
const DAY = 86400000;
const MPC_PCT = 20;

const RULES = Object.freeze({
  MAINBOARD: { preOfferMonths: 6, mpcMonths: 18 },
  SME: { preOfferMonths: 12, mpcMonths: 36 },
});
const LABELS = Object.freeze({
  ANCHOR_30D: 'Anchor 50% (30d)',
  ANCHOR_90D: 'Anchor rest (90d)',
  PRE_OFFER: 'Pre-offer holders + promoter excess',
  PROMOTER_MPC: 'Promoter min. contribution',
});

const num = (x) => typeof x === 'number' && Number.isFinite(x);
const daysBetween = (fromIso, toIso) =>
  Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / DAY);

/** @param {string} ipoType free text from IPOPlatform ("MainBoard", "SME", "NSE EMERGE"...) @returns {'MAINBOARD'|'SME'} */
function boardOf(ipoType) {
  return /sme|emerge/i.test(String(ipoType || '')) ? 'SME' : 'MAINBOARD';
}

/** Listed within the last `months` months (default 24) and not in the future. */
function isRecentListing(listingDate, today, months = RECENT_MONTHS) {
  if (!listingDate || !today) return false;
  const age = monthsBetween(listingDate, today);
  return age >= 0 && age <= months;
}

function tranche(kind, date, shares, post) {
  return {
    kind,
    label: LABELS[kind],
    date,
    shares: num(shares) ? shares : null,
    pctEquity: num(shares) && num(post) && post > 0 ? (shares / post) * 100 : null,
  };
}

/**
 * EXACT schedule from offer-document numbers. Every IPO share not under an anchor lock is free at listing;
 * what is left of the post-issue capital after the IPO shares is the pre-offer holders' stock.
 * @param {{companyId:string, ipoType?:string, listingDate:string, allotmentDate:string, postIssueShares:number,
 *   ipoSharesOffered:number, anchorShares?:number, mpcShares?:number, mpcMonths?:number, preOfferMonths?:number,
 *   source?:string, notes?:string[]}} i
 */
function exactSchedule(i) {
  const board = boardOf(i.ipoType);
  const rule = RULES[board];
  const post = i.postIssueShares;
  const anchor = i.anchorShares || 0;
  const mpc = num(i.mpcShares) ? i.mpcShares : Math.round((MPC_PCT / 100) * post);
  const preOffer = post - i.ipoSharesOffered - mpc;
  const a30 = Math.floor(anchor / 2);
  const tranches = [];
  if (anchor > 0) {
    tranches.push(tranche('ANCHOR_30D', addDays(i.allotmentDate, 30), a30, post));
    tranches.push(tranche('ANCHOR_90D', addDays(i.allotmentDate, 90), anchor - a30, post));
  }
  tranches.push(
    tranche(
      'PRE_OFFER',
      addMonths(i.allotmentDate, i.preOfferMonths || rule.preOfferMonths),
      preOffer,
      post
    )
  );
  tranches.push(
    tranche('PROMOTER_MPC', addMonths(i.allotmentDate, i.mpcMonths || rule.mpcMonths), mpc, post)
  );
  return {
    companyId: i.companyId,
    basis: 'rhp',
    board,
    listingDate: i.listingDate,
    allotmentDate: i.allotmentDate,
    postIssueShares: post,
    openFloatShares: i.ipoSharesOffered - anchor,
    tranches: tranches.sort((a, b) => a.date.localeCompare(b.date)),
    source: i.source || null,
    notes: i.notes || [],
  };
}

/** DATES-ONLY schedule from the listing/allotment date. Anchor rows only when anchors participated (or unknown). */
function estimateSchedule({ companyId, ipoType, listingDate, allotmentDate, anchorParticipated }) {
  const board = boardOf(ipoType);
  const rule = RULES[board];
  const t = [];
  if (anchorParticipated !== false) {
    t.push(tranche('ANCHOR_30D', addDays(allotmentDate, 30)));
    t.push(tranche('ANCHOR_90D', addDays(allotmentDate, 90)));
  }
  t.push(tranche('PRE_OFFER', addMonths(allotmentDate, rule.preOfferMonths)));
  t.push(tranche('PROMOTER_MPC', addMonths(allotmentDate, rule.mpcMonths)));
  return {
    companyId,
    basis: 'estimate',
    board,
    listingDate,
    allotmentDate,
    tranches: t.sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/**
 * The next unlock event on/after `today` (same-date tranches are merged) and how much it releases.
 * @returns {null | {date:string, daysAway:number, label:string, shares:number|null, pctEquity:number|null,
 *   pctOfFloat:number|null, laterEvents:number}}
 */
function nextUnlock(rec, today) {
  const upcoming = (rec.tranches || []).filter((t) => t.date >= today);
  if (!upcoming.length) return null;
  const date = upcoming[0].date;
  const group = upcoming.filter((t) => t.date === date);
  const known = group.every((t) => num(t.shares));
  const shares = known ? group.reduce((s, t) => s + t.shares, 0) : null;
  const post = rec.postIssueShares;
  let pctOfFloat = null;
  if (known && num(rec.openFloatShares) && rec.tranches.every((t) => num(t.shares))) {
    const floatNow =
      rec.openFloatShares +
      rec.tranches.filter((t) => t.date < today).reduce((s, t) => s + t.shares, 0);
    pctOfFloat = floatNow > 0 ? (shares / floatNow) * 100 : null;
  }
  return {
    date,
    daysAway: daysBetween(today, date),
    label: group.map((t) => t.label).join(' + '),
    shares,
    pctEquity: known && num(post) && post > 0 ? (shares / post) * 100 : null,
    pctOfFloat,
    laterEvents: upcoming.length - group.length,
  };
}

/**
 * The block every card/report prints. Null when the company is not a ≤24-month listing (or has no record).
 * @param {Object|undefined} rec schedule record
 * @param {string} today YYYY-MM-DD (IST)
 * @param {{marketCapCr?:number|null}} [opts]
 */
function lockinWatch(rec, today, { marketCapCr } = {}) {
  if (!rec || !isRecentListing(rec.listingDate, today)) return null;
  const nxt = nextUnlock(rec, today);
  const base = { basis: rec.basis, listingDate: rec.listingDate, board: rec.board };
  if (!nxt) {
    const last = rec.tranches[rec.tranches.length - 1];
    return { ...base, status: 'CLEARED', lastDate: last ? last.date : null };
  }
  return {
    ...base,
    status: 'PENDING',
    ...nxt,
    valueCr: num(nxt.pctEquity) && num(marketCapCr) ? (nxt.pctEquity / 100) * marketCapCr : null,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = (iso) =>
  `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
/** Indian grouping: crore / lakh shares. */
const fmtShares = (n) =>
  n >= 1e7
    ? `${(n / 1e7).toFixed(2)} Cr sh`
    : n >= 1e5
      ? `${(n / 1e5).toFixed(2)} L sh`
      : `${n} sh`;

/**
 * One plain-text line for a `lockinWatch` block — the SAME string the email cards and the PDF/markdown
 * reports print, so the two can never disagree. Null when `w` is null.
 * @param {Object|null} w result of lockinWatch
 */
function lockinText(w) {
  if (!w) return null;
  if (w.status === 'CLEARED') {
    return `IPO lock-ins: all expired${w.lastDate ? ` (last ${fmtDate(w.lastDate)})` : ''}`;
  }
  const when = w.daysAway === 0 ? 'today' : `in ${w.daysAway}d`;
  let size = ' · size n/a';
  if (num(w.shares)) {
    const bits = [`${w.pctEquity.toFixed(2)}% of equity`];
    if (num(w.valueCr)) bits.push(`≈₹${Math.round(w.valueCr).toLocaleString('en-IN')} Cr`);
    if (num(w.pctOfFloat)) bits.push(`+${w.pctOfFloat.toFixed(0)}% of tradable float`);
    size = ` · ${fmtShares(w.shares)} (${bits.join(', ')})`;
  }
  const more = w.laterEvents > 0 ? ` · +${w.laterEvents} later` : '';
  const est = w.basis === 'estimate' ? ' · est.' : '';
  return `IPO unlock: ${w.label} ${fmtDate(w.date)} (${when})${size}${more}${est}`;
}

module.exports = {
  lockinText,
  fmtDate,
  RULES,
  RECENT_MONTHS,
  boardOf,
  isRecentListing,
  exactSchedule,
  estimateSchedule,
  nextUnlock,
  lockinWatch,
  daysBetween,
};
