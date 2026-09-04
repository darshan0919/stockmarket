#!/usr/bin/env node
'use strict';

/**
 * packages/jobs-runtime/lib/thesisCardEmail.js
 *
 * THE shared "thesis card" email renderer. Every skill in this repo that
 * emails a card-per-company digest renders through this module — currently
 * `post-close-scan-insights`, `gainers-signal`, and `volume-rocketing`.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 * The card design (headline + causal thesis chain + EPS-impact chip + metric
 * line + info-classification block + tag pills + pictorial stats footer) was
 * built and iterated inside `postCloseScanInsights.js` over 2026-08/09, with
 * a lot of hard-won, Gmail-specific knowledge baked into it: `cid:` icons
 * because Gmail strips `data:` URIs from `<img src>`, inline-block +
 * vertical-align:middle instead of flexbox because Gmail's sanitizer strips
 * `gap`/`align-items`, inline styles only because `<style>` blocks are
 * removed. Darshan then asked for gainers-signal and volume-rocketing to use
 * "the same Thesis Card UX". Copying the markup into those two skills would
 * have created three divergent copies of that knowledge — the exact failure
 * `skills/_shared/conventions.md` §17 exists to prevent. So the renderer moved
 * here and every caller renders from ONE implementation.
 *
 * ── Two card modes, one card design ─────────────────────────────────────────
 * `buildDigestHtml()`  — announcement digests grouped by significance
 *                        (high/medium/low). post-close-scan-insights.
 * `buildScanSignalEmail()` — daily scan signals grouped by actionability tier
 *                        (ACT/WATCH/NOTED). gainers-signal, volume-rocketing.
 *
 * They share every primitive below the section header: the same card shell,
 * the same `highlightFacts()` number coloring, the same EPS chip, the same
 * info-classification block, the same stats footer. What differs is only what
 * a "group" means (significance vs tier), what the metric line shows (market
 * reaction vs delivery/market-cap), and the sort key. Keeping them as two thin
 * functions over one primitive set — rather than one function with a mode flag
 * threaded through every branch — is what keeps each readable while making a
 * design change to the card itself land in all three skills at once.
 *
 * ── The renderer never judges ───────────────────────────────────────────────
 * Everything here is pure logic over an already-decided payload: escaping,
 * coloring, sorting, grouping, arithmetic. No LLM call, no fetch, no judgment.
 * The CONTENT of a card (the headline, the thesis chain, the WHY, the EPS
 * thesis) is written by the calling skill's analysis pass and handed in as
 * data. That split is conventions §17's Extraction/Analysis line drawn through
 * the email layer: the model spends tokens deciding what to say, never on
 * re-typing HTML it has typed a hundred times before.
 */

const { stockscansLink } = require('@stock/cloud-utils');

// User-supplied "LineExpandView" redirect/expand icon (the external-link
// button on each card). Referenced in HTML as `cid:expand-icon` and sent as a
// real MIME attachment by the caller — NOT a data: URI in any form.
// Confirmed 2026-08-27 (in Gmail, via DevTools inspection of the live
// rendered DOM): Gmail's inbound sanitizer strips the `src` attribute from
// any `<img src="data:...">` entirely, whether the payload is
// `image/png;base64` or `image/svg+xml;base64`. A `cid:` reference to an
// attached MIME part is the only reliable inlining mechanism Gmail supports
// without hosting the image externally. Every caller that renders a card with
// a `pdfUrl` MUST attach this PNG under this cid, or the link button renders
// as a broken image.
const EXPAND_ICON_CID = 'expand-icon';
const EXPAND_ICON_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABwAAAAbCAYAAABvCO8sAAAACXBIWXMAAC4jAAAuIwF4pT92AAAB9UlEQVRIie2WQUsVURTHp1RaZBIYrQIXbmtRUi4fGHPO+HiY8865hCQIkueML9wVEVjzQURcuAsVgiKqTYt0UUHtokXfoFSKQlyo3Kczb3oqM+/N1CI68F8M9575cf/33HOv4+SMcrXWhyxvgPQzkrw/UqyrwPoKSO/GiejLFTAyDST304QkwcjI5BmbBxRMIutuJpFuO6VS2Amsi5mTYsm8BZZMrRtI17LmOcgy2zpMd4EljNxxx8dPA+nrTMC69/vL3QQKKmCmB9Lk+sFFx3FOJPcyK9RB1p2Djxd5C8i7NdODrO/SgNGGPs8NpOAysnz9K8C63STrjf/Jjz8GrK+M9FuioJ65fnAeWN8WDrTn9zcY6VPPmzllx0o3Js4272kuoOdPXUXWjQZMVgZEupJzro/e6UXSD/HBbxcIRq+lwaKojMk5IJ1DI/faAh6ykXW5GWaM6QCjj5D1QRiGJxvJLQJtNSZhyLJ01Mq8qpajOa4JhtoCHir9Y2A2kHQsdqAaUMtAz799wba/hI2PbeM/bj7mBbokg1lhhQCjn3istTRYYcBWAv8D8Z+1FFi/Hwx8irp8MUB5GAONusmBl4kG/Mt2kiKEjbtxy94YMXDYyCVg/dnOyy2T7A3RHN5N6QeSBWT5iCxf8sq+BIHkCVRltJm1B8bvvqa7dbSrAAAAAElFTkSuQmCC';

const SIG_META = {
  high: { label: 'High significance', color: '#b42318', bg: '#fef3f2', border: '#fda29b' },
  medium: { label: 'Medium significance', color: '#b54708', bg: '#fffaeb', border: '#fec84b' },
  low: { label: 'Low significance', color: '#344054', bg: '#f9fafb', border: '#d0d5dd' },
};

// Tone system mirrors skills/_shared/pdf-design-guide.md's g/r/y/b palette
// (translated to inline styles since email clients strip <style> blocks —
// no CSS classes, every color must be inline per company convention). Card
// left-border + category chip use SIG_TONE (by significance, the dimension
// that actually matters for "should I read this"); category-chip label text
// still names the category so two same-tone categories stay distinguishable.
const SIG_TONE = {
  high: { chipBg: '#fcebeb', chipFg: '#791f1f', border: '#e24b4a' },
  medium: { chipBg: '#faeeda', chipFg: '#633806', border: '#ef9f27' },
  low: { chipBg: '#e6f1fb', chipFg: '#0c447c', border: '#3a85c9' },
};

const TAG_CHIP = { bg: '#f2f4f7', fg: '#475467', border: '#d0d5dd' };

function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

// Category/tag values are stored snake_case ("shareholding_change") since
// that's the taxonomy's canonical machine-readable form (announcementTaxonomy.js),
// but the digest is a human-facing email — render them as "Shareholding
// Change" (every word capitalised, underscores to spaces) rather than raw
// snake_case or the old all-caps/monospace look.
function toTitleCase(s) {
  return String(s == null ? '' : s)
    .replace(/_/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function tagPillsHtml(tags) {
  if (!Array.isArray(tags) || !tags.length) return '';
  return tags
    .map(
      (t) =>
        `<span style="display:inline-block;font-size:10px;font-family:monospace;background:${TAG_CHIP.bg};color:${TAG_CHIP.fg};border:1px solid ${TAG_CHIP.border};border-radius:3px;padding:1.5px 6px;margin:0 4px 4px 0;">${esc(toTitleCase(t))}</span>`
    )
    .join('');
}

// Color-codes the numeric/date substance inside a thesis-chain step so the
// reader can spot the load-bearing fact without parsing the sentence — NOT
// the card border/chip (that already carries the significance tone). Escapes
// first, then wraps matches in the escaped string so `&amp;`-style entities
// never get re-matched or mangled. Three highlight classes, kept semantically
// distinct per pdf-design-guide.md's "color the direction that matters, not
// literal up/down": money/percentage amounts (amber — the quantum), dates/
// timelines (blue — the when), explicit EPS/PAT/margin deltas (green if the
// step's own wording reads positive, red if negative — a plain regex can't
// know direction reliably, so this only fires on an explicit +/- sign or an
// unambiguous up/down verb immediately adjacent to the number).
function highlightFacts(escapedText) {
  let out = escapedText;
  // Money amounts: ₹/Rs/Rs. followed by a number+cr/lakh/crore, or a bare
  // "12.5cr"/"₹500cr" style token.
  out = out.replace(
    /((?:₹|Rs\.?\s?)\s?[\d,]+(?:\.\d+)?\s?(?:cr|crore|lakh|lac|L|Cr)\b)/g,
    '<span style="color:#854f0b;font-weight:600;">$1</span>'
  );
  // Percentages.
  out = out.replace(
    /(\(?[+-]?[\d.]+%\)?)/g,
    '<span style="color:#854f0b;font-weight:600;">$1</span>'
  );
  // Explicit signed deltas not already caught above (e.g. "+2%" handled;
  // "up 2%"/"down 2%" phrasing gets its own directional color).
  out = out.replace(
    /\b(up|higher|increase[sd]?|grow[sn]?|beat)\b([^<.,;]{0,28}?\d[^<.,;]{0,10})/gi,
    '<span style="color:#0f6e56;font-weight:600;">$1$2</span>'
  );
  out = out.replace(
    /\b(down|lower|decrease[sd]?|declin\w*|dilut\w*|miss(?:e[sd])?)\b([^<.,;]{0,28}?\d[^<.,;]{0,10})/gi,
    '<span style="color:#a32d2d;font-weight:600;">$1$2</span>'
  );
  // Dates / quarter-year timelines: FY27, Q2FY27, "Aug 2026", "from FY28".
  out = out.replace(
    /\b((?:Q[1-4]\s?)?FY\s?\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2,4})\b/g,
    '<span style="color:#0c447c;font-weight:600;">$1</span>'
  );
  return out;
}

const EPS_TONE = {
  positive: { bg: '#eaf3de', fg: '#27500a', border: '#a9cf8a', icon: '▲' },
  negative: { bg: '#fcebeb', fg: '#791f1f', border: '#ecaaa9', icon: '▼' },
  neutral: { bg: '#e6f1fb', fg: '#0c447c', border: '#a7cdec', icon: '●' },
};

// Tone for the NEW/KNOWN/FOLLOW_UP claim chips rendered by
// infoClassificationHtml() below — NEW is the attention-getting color
// (this is the bucket that actually moves the market on surprise, per
// announcement-info-classifier's own framing), KNOWN is deliberately muted
// (already-priced-in, low reader attention needed), FOLLOW_UP sits between.
const INFO_CLASS_TONE = {
  NEW: { bg: '#fef3f2', fg: '#b42318', border: '#fda29b' },
  FOLLOW_UP: { bg: '#fffaeb', fg: '#b54708', border: '#fec84b' },
  KNOWN: { bg: '#f9fafb', fg: '#667085', border: '#d0d5dd' },
};

// Renders the "Returns 1D / Delivery % / Traded Delivery Value / Vol-vs-7D-Avg"
// market-data line used by resend-with-market-data (see cmdResendWithMarketData
// below) — same visual family as epsImpactHtml's chip, colored green/red by
// return sign like gainers-signal does. `it.marketData` is
// `{returns1d, deliveryPct, deliveryValueCr, volRatio7d}` (any field may be
// null when NSE/BSE/Stockscans had no data for that ticker — rendered as "—",
// never fabricated).
// Thresholds for colouring delivery-value-as-%-of-mcap. Deliberately loose
// bands, not precise cutoffs: the point is to let the eye find the outlier in
// a list, not to imply 0.99% and 1.01% differ. Calibrated from observed daily
// runs — a typical liquid mid-cap turns over well under 0.5% of its market cap
// in delivery on an ordinary day, so >=1% is genuinely unusual and >=2.5% is
// the kind of number worth stopping on. Declared here (above the first
// consumer, marketDataHtml) rather than beside scanMetricsHtml further down,
// so neither consumer depends on module-evaluation order.
const DV_MCAP_NOTABLE = 1.0;
const DV_MCAP_STRIKING = 2.5;

// Uses vertical-align:middle + explicit &nbsp;-separated spacing rather than
// flexbox gap, per this file's Gmail-sanitizer findings above (gap/align-items
// get silently stripped from inline styles in received mail).
function marketDataHtml(marketData) {
  if (!marketData) return '';
  const {
    returns1d,
    deliveryPct,
    deliveryValueCr,
    volRatio7d,
    marketCapCr,
    deliveryValuePctOfMcap,
  } = marketData;
  if (
    returns1d == null &&
    deliveryPct == null &&
    deliveryValueCr == null &&
    volRatio7d == null &&
    marketCapCr == null &&
    deliveryValuePctOfMcap == null
  )
    return '';
  const fmtPct = (v) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`);
  const fmtCr = (v) => (v == null ? '—' : `₹${v.toFixed(1)} Cr`);
  // Same abbreviation scanMetricsHtml uses, so the two metric lines read
  // identically across the announcement digests and the daily scan emails.
  const fmtMcap = (v) =>
    v == null ? '—' : v >= 1000 ? `₹${(v / 1000).toFixed(1)}k Cr` : `₹${v.toFixed(0)} Cr`;
  const retColor = returns1d == null ? '#475467' : returns1d >= 0 ? '#067647' : '#b42318';
  // Same >=2.0x threshold gainersScanner.js's vol_spike boolean uses, just
  // against a 7-day (pre-announcement-day) window instead of its 20-day one —
  // colored so a volume spike alongside the announcement is visually obvious.
  const volColor = volRatio7d == null ? '#475467' : volRatio7d >= 2.0 ? '#b42318' : '#475467';
  // Reuses the SAME bands scanMetricsHtml colours Deliv/Mcap with
  // (DV_MCAP_NOTABLE / DV_MCAP_STRIKING) rather than inventing a second set —
  // the figure means the same thing in both emails, so a reader who has
  // learned "red means unusually heavy delivery for this company's size"
  // should not have to re-learn it per email type.
  const dvPctColor =
    deliveryValuePctOfMcap == null
      ? '#475467'
      : deliveryValuePctOfMcap >= DV_MCAP_STRIKING
        ? '#b42318'
        : deliveryValuePctOfMcap >= DV_MCAP_NOTABLE
          ? '#b54708'
          : '#475467';
  const cell = (label, value, color) =>
    `<span style="display:inline-block;vertical-align:middle;margin-right:12px;">${label}: <b style="color:${color || '#101828'};">${value}</b></span>`;
  return (
    `<div style="margin-top:8px;font-size:11.5px;font-family:monospace;color:#475467;line-height:1.9;">` +
    cell('1D', fmtPct(returns1d), retColor) +
    cell('Mcap', fmtMcap(marketCapCr)) +
    cell('Deliv', deliveryPct == null ? '—' : `${deliveryPct.toFixed(1)}%`) +
    cell('Deliv Val', fmtCr(deliveryValueCr)) +
    cell(
      'Deliv/Mcap',
      deliveryValuePctOfMcap == null ? '—' : `${deliveryValuePctOfMcap.toFixed(2)}%`,
      dvPctColor
    ) +
    cell('Vol/7D-Avg', volRatio7d == null ? '—' : `${volRatio7d.toFixed(2)}x`, volColor) +
    `</div>`
  );
}

function epsImpactHtml(epsImpact) {
  if (!epsImpact || !epsImpact.direction) return '';
  const tone = EPS_TONE[epsImpact.direction] || EPS_TONE.neutral;
  const parts = [esc(epsImpact.magnitude || '')];
  if (epsImpact.timeline) parts.push(esc(epsImpact.timeline));
  const detail = parts.filter(Boolean).join(' &middot; ');
  const confidence = epsImpact.confidence
    ? ` <span style="opacity:0.7;">(${esc(epsImpact.confidence)} confidence)</span>`
    : '';
  return `<div style="display:inline-block;font-size:11.5px;font-weight:600;background:${tone.bg};color:${tone.fg};border:1px solid ${tone.border};border-radius:4px;padding:3px 9px;margin-top:8px;">${tone.icon} EPS impact: ${detail}${confidence}</div>`;
}

// Renders the causal chain "this happened -> so this -> so this -> EPS
// impact" the user asked for. Falls back to a single-step chain built from
// the plain `insight` string when a note predates the thesisChain field
// (older cached notes) so old and new notes render consistently rather than
// the digest silently losing the body for anything generated before this
// schema existed.
function thesisChainHtml(it) {
  const steps =
    Array.isArray(it.thesisChain) && it.thesisChain.length
      ? it.thesisChain
      : String(it.insight || '')
          .split(/(?<=[.!?])\s+/)
          .filter(Boolean);
  if (!steps.length) return '';
  return steps
    .map((step, i) => {
      // The arrow (added below for i>0) already implies causation/sequence —
      // strip a redundant leading "so"/"so that"/"and so" from non-first
      // steps rather than showing "-> so X" (defensive: covers both new
      // notes, which the _global.md prompt now tells not to prefix this way,
      // and older cached notes generated before that instruction existed).
      const cleanedStep =
        i === 0 ? step : String(step).replace(/^\s*(?:and\s+)?so(?:\s+that)?\s+/i, '');
      const escaped = highlightFacts(esc(cleanedStep));
      const arrow = i === 0 ? '' : '<span style="color:#98a2b3;margin-right:6px;">&rarr;</span>';
      return `<div style="font-size:13px;line-height:1.6;color:#344054;margin-top:${i === 0 ? '8' : '4'}px;">${arrow}${escaped}</div>`;
    })
    .join('');
}

// Renders the NEW/KNOWN/FOLLOW_UP breakdown attached by Step 3.5 (top-5
// info-classified items only — see the SKILL.md) as `it.infoClassification`
// = `{claims: [{claim, bucket, priorSource}], verdict, baselineCoverage}`.
// Absent on every other card (the classifier only runs on 5 items a night),
// so this returns '' and the card renders exactly as it did before this
// field existed — same "old notes render fine" guarantee thesisChainHtml
// above already gives for its own optional field.
// Deliberately compact: a one-line verdict banner plus a claims list capped
// at 4 rows (a card is already dense with headline/chain/EPS/tags; the full
// per-claim citation detail lives in the persisted note, not the email) —
// if there are more than 4 claims, the last row says how many were omitted
// rather than silently truncating without saying so.
const INFO_CLASS_MAX_CLAIMS_SHOWN = 4;

function infoClassificationHtml(infoClassification) {
  if (!infoClassification || !Array.isArray(infoClassification.claims)) return '';
  const { claims, verdict, baselineCoverage } = infoClassification;
  if (!claims.length && !verdict) return '';

  const bucketChip = (bucket) => {
    const key = String(bucket || '')
      .toUpperCase()
      .replace(/[\s-]+/g, '_');
    const tone = INFO_CLASS_TONE[key] || INFO_CLASS_TONE.KNOWN;
    const label = key === 'FOLLOW_UP' ? 'FOLLOW-UP' : key;
    return `<span style="display:inline-block;vertical-align:middle;font-size:9.5px;font-weight:700;font-family:monospace;letter-spacing:0.03em;background:${tone.bg};color:${tone.fg};border:1px solid ${tone.border};border-radius:3px;padding:1px 6px;margin-right:6px;white-space:nowrap;">${esc(label)}</span>`;
  };

  const shown = claims.slice(0, INFO_CLASS_MAX_CLAIMS_SHOWN);
  const omitted = claims.length - shown.length;
  const claimRows = shown
    .map((c) => {
      const src = c.priorSource
        ? ` <span style="color:#98a2b3;">(${esc(c.priorSource)})</span>`
        : '';
      return `<div style="font-size:11.5px;line-height:1.6;color:#475467;margin-top:3px;">${bucketChip(c.bucket)}${esc(c.claim || '')}${src}</div>`;
    })
    .join('');
  const omittedRow =
    omitted > 0
      ? `<div style="font-size:11px;color:#98a2b3;margin-top:3px;">+ ${omitted} more claim(s) — see saved note</div>`
      : '';

  const thin = baselineCoverage && baselineCoverage.thinBaseline;
  const thinBadge = thin
    ? ` <span style="font-size:10px;font-weight:700;color:#b54708;">(THIN BASELINE)</span>`
    : '';

  return `
    <div style="margin-top:10px;padding-top:9px;border-top:1px dashed #eaecf0;">
      <div style="font-size:11px;font-weight:700;color:#667085;text-transform:uppercase;letter-spacing:0.02em;">Info classification${thinBadge}</div>
      ${verdict ? `<div style="font-size:12.5px;font-weight:600;color:#101828;margin-top:4px;">${esc(verdict)}</div>` : ''}
      ${claimRows}
      ${omittedRow}
    </div>`;
}

// Pictorial run-summary footer: one tile per funnel stage so the whole
// night's routing outcome is graspable at a glance without reading every
// insight card. `stats` is caller-supplied (the orchestrating skill run,
// not this script, is the only place that knows the full funnel — see
// STATS_TILES below for the expected shape) since fetch-scan/filter-noise/
// categorise/send-digest are separate process invocations with no shared
// in-memory state. Added 2026-08-24 per Darshan's request: "mention the
// count for each category at the footer... total 26, insights 11, ocr
// failed 3, routine 5 etc, pictorial UI, single glance."
const STATS_TILES = [
  { key: 'total', icon: '📋', label: 'Total in window', color: '#344054' },
  // `noiseDropped` is the keyword-filter stage specifically (title/description
  // matched announcementNoiseFilter's lists). Kept adjacent to `total` so the
  // footer reads as an actual funnel top-to-bottom rather than a bag of
  // numbers — Darshan's ask was "total announcements, filtered announcements
  // due to keyword, for how many insights were generated, how many at each
  // significance level", i.e. every stage accounted for.
  { key: 'noiseDropped', icon: '🧹', label: 'Keyword-filtered', color: '#98a2b3' },
  { key: 'alreadyProcessed', icon: '♻️', label: 'Already covered', color: '#98a2b3' },
  { key: 'heavyDocSkipped', icon: '📄', label: 'Heavy-doc skipped', color: '#667085' },
  { key: 'routine', icon: '💤', label: 'Routine (no note)', color: '#98a2b3' },
  { key: 'ocrFailed', icon: '⚠️', label: 'OCR failed / unread', color: '#b54708' },
  { key: 'insights', icon: '✍️', label: 'Insights written', color: '#1b5e20' },
  { key: 'highConviction', icon: '🔥', label: 'High-conviction', color: '#b42318' },
  { key: 'infoClassified', icon: '🔍', label: 'Info-classified', color: '#0c447c' },
  { key: 'knowledgeGaps', icon: '📚', label: 'Knowledge gaps', color: '#b54708' },
];

// Per-tier counts get their OWN strip below the funnel tiles rather than
// seven more tiles in the same row — they answer a different question ("how
// strong was tonight's crop") than the funnel ("where did everything go"),
// and at 5 extra tiles the single row wraps badly in Gmail's fixed-width
// rendering. Derived, never caller-supplied: buildStatsFooterHtml computes
// them from the cards actually rendered (see buildDigestHtml), so the footer
// can never disagree with the sections above it — a hand-counted footer
// drifting from the rendered body is exactly the kind of quiet inconsistency
// that makes a reader stop trusting the numbers.
function tierBreakdownHtml(tierCounts) {
  if (!tierCounts) return '';
  const present = SIGNAL_TIERS.filter((t) => tierCounts[t.tier]);
  if (!present.length) return '';
  const cells = present
    .map(
      (t) => `
      <td style="padding:0 5px;text-align:center;vertical-align:top;">
        <div style="background:${t.bg};border:1px solid ${t.border};border-radius:8px;padding:8px 12px;min-width:70px;">
          <div style="font-size:17px;font-weight:700;color:${t.color};">${tierCounts[t.tier]}</div>
          <div style="font-size:9.5px;font-weight:700;color:${t.color};text-transform:uppercase;letter-spacing:0.03em;margin-top:2px;">${t.code} ${esc(t.label)}</div>
        </div>
      </td>`
    )
    .join('');
  return `
    <div style="margin-top:14px;">
      <div style="font-size:11px;font-weight:600;color:#667085;text-transform:uppercase;letter-spacing:0.02em;margin-bottom:8px;">Signal strength (cards)</div>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:5px 0;"><tr>${cells}</tr></table>
    </div>`;
}

function buildStatsFooterHtml(stats, tierCounts, knowledgeGapNotes) {
  // The footer now has three independent strips (funnel tiles, per-tier
  // breakdown, knowledge gaps) and renders whichever it actually has data
  // for — a caller that passes only tierCounts still gets a footer, where
  // previously the missing-stats guard silently swallowed everything.
  const hasStats = stats && typeof stats === 'object';
  const tierHtml = tierBreakdownHtml(tierCounts);
  const gapsHtml = knowledgeGapsHtml(knowledgeGapNotes);
  if (!hasStats) {
    if (!tierHtml && !gapsHtml) return '';
    return `
    <div style="margin-top:32px;border-top:1px solid #eaecf0;padding-top:16px;">
      ${tierHtml}
      ${gapsHtml}
    </div>`;
  }
  // Two funnels share this footer component, because the tile IS the same
  // component — only the stages differ. An announcement digest's funnel runs
  // announcements -> insights -> routine; a daily scan's runs universe ->
  // quality filter -> tiers -> researched. Rather than a mode flag threaded in
  // from the caller, the renderer simply knows both vocabularies and draws
  // whichever keys are actually present: a caller that passes scan keys gets
  // scan tiles, one that passes digest keys gets digest tiles, and an unknown
  // key is silently ignored rather than rendering a mystery number.
  //
  // Order follows the definition order of each list (funnel order), digest
  // tiles first, so a footer stays in a sensible reading order either way.
  const allTiles = [...STATS_TILES, ...SCAN_STATS_TILES];
  const tiles = allTiles.filter((t) => stats[t.key] !== undefined && stats[t.key] !== null);
  if (!tiles.length) return '';
  const cells = tiles
    .map(
      (t) => `
      <td style="padding:0 6px;text-align:center;vertical-align:top;">
        <div style="background:#fff;border:1px solid #eaecf0;border-radius:10px;padding:12px 10px;min-width:84px;">
          <div style="font-size:22px;line-height:1;">${t.icon}</div>
          <div style="font-size:20px;font-weight:700;color:${t.color};margin-top:6px;">${esc(stats[t.key])}</div>
          <div style="font-size:10px;font-weight:600;color:#667085;text-transform:uppercase;letter-spacing:0.02em;margin-top:2px;">${esc(t.label)}</div>
        </div>
      </td>`
    )
    .join('');
  // OCR-failed tile gets a visible warning strip when non-zero, since that
  // count means "these announcements were never actually read" — the exact
  // failure mode this footer exists to make impossible to miss (2026-08-24).
  const ocrWarning =
    stats.ocrFailed > 0
      ? `<p style="font-size:12px;color:#b54708;background:#fffaeb;border:1px solid #fec84b;border-radius:8px;padding:8px 12px;margin:12px 0 0;">⚠️ ${esc(stats.ocrFailed)} announcement(s) could not be read (scanned PDF, OCR unavailable) and are NOT reflected as routine — flagged for manual follow-up.</p>`
      : '';
  return `
    <div style="margin-top:32px;border-top:1px solid #eaecf0;padding-top:16px;">
      <div style="font-size:12px;font-weight:600;color:#667085;text-transform:uppercase;letter-spacing:0.02em;margin-bottom:10px;">Run summary</div>
      <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:6px 0;"><tr>${cells}</tr></table>
      ${ocrWarning}
      ${tierHtml}
      ${gapsHtml}
    </div>`;
}

/**
 * The knowledge-gaps strip.
 *
 * Darshan's ask (2026-09-04): when the analysis had to reach outside the
 * repo's own skills and course material to judge something — an unfamiliar
 * deal structure, a regulatory mechanism `ask-soic` had no coverage for, a
 * sector convention nothing in the knowledge base explains — say so in the
 * footer instead of quietly absorbing it.
 *
 * This exists because the interesting signal is cumulative, not per-run: one
 * night's "no coverage for CCPS conversion mechanics" is a curiosity, but the
 * same gap appearing three weeks running is a concrete instruction to go add
 * that material to the knowledge base. Surfacing it per-run in the same place
 * every time is what makes the repetition visible at all.
 *
 * Each entry: `{topic, whyItMattered, resolvedVia}` — what was missing, why
 * the judgment needed it, and what was used instead (a web source, first
 * principles, or "left flagged as uncertain"). `resolvedVia` matters: a gap
 * that was papered over with a guess is a different thing from one resolved
 * against a primary source, and the reader should be able to tell.
 */
function knowledgeGapsHtml(gaps) {
  if (!Array.isArray(gaps) || !gaps.length) return '';
  const rows = gaps
    .map(
      (g) => `
      <li style="margin-bottom:6px;">
        <b style="color:#101828;">${esc(g.topic || 'Unnamed gap')}</b>
        ${g.whyItMattered ? ` &mdash; ${esc(g.whyItMattered)}` : ''}
        ${g.resolvedVia ? ` <span style="color:#667085;">(resolved via: ${esc(g.resolvedVia)})</span>` : ' <span style="color:#b42318;">(unresolved)</span>'}
      </li>`
    )
    .join('');
  return `
    <div style="margin-top:14px;background:#fffaeb;border:1px solid #fec84b;border-radius:8px;padding:12px 14px;">
      <div style="font-size:11px;font-weight:700;color:#b54708;text-transform:uppercase;letter-spacing:0.02em;margin-bottom:6px;">📚 Knowledge-base gaps hit this run</div>
      <ul style="margin:0;padding-left:18px;font-size:12px;color:#475467;line-height:1.5;">${rows}</ul>
      <div style="font-size:11px;color:#667085;margin-top:8px;">A topic recurring here across runs is a candidate for adding to the SOIC knowledge base / a skill's reference material.</div>
    </div>`;
}

// Within-bucket ranking score (Step "sort within significance" — added
// 2026-08-30 per Darshan's request that cards not just group by
// significance but also rank within a bucket, since "high" alone still
// spans a wide range of how much attention an item deserves). Purely
// additive and deterministic from fields already on the note payload — no
// LLM call, no extra fetch; this is exactly the kind of pure-logic scoring
// that belongs in the script per skills/_shared/conventions.md §17, not a
// second judgment pass by the model.
//
// Four components, each contributing an independent, capped amount so no
// single signal can dominate silently and the total is easy to reason
// about at a glance (0-100 nominal ceiling on the initial send; the resend
// pass adds a fifth, market-reaction component on top — see
// MARKET_REACTION_WEIGHT below):
//
//   1. Category (0-30): `high_conviction` is the taxonomy's OWN judgment
//      that this category structurally deserves deep attention
//      (demerger/merger/acquisition/management_change) — worth a flat,
//      large weight since it's a considered classification, not a proxy.
//   2. EPS-impact confidence (0-25): how directly the filing supports a
//      quantified number, per announcement-insights' own confidence
//      rubric (a disclosed rupee figure with a stated date is `high`; a
//      qualitative read with no hard number is `low`). A concretely
//      quantified item is more actionable than a vaguely-worded one at
//      the same significance level.
//   3. EPS-impact direction (0-10): a non-neutral directional call
//      (positive or negative) still beats "no EPS linkage at all" even
//      when magnitude/confidence is soft, since direction alone is a
//      usable signal.
//   4. Info-classification NEW-ness (0-35, only present on the ~5 items
//      Step 3.5 actually classifies): the fraction of claims bucketed
//      NEW, scaled to 35. This directly operationalizes the SOIC "new
//      information" framework this whole classifier exists for — within
//      the same significance bucket, an announcement that's mostly
//      genuinely NEW information should outrank one that's mostly
//      KNOWN/restated, even if both got tagged the same significance by
//      announcement-insights (which judges the EVENT's importance, not
//      how much of today's filing is actually new information about it).
//      Items with no infoClassification (the other ~95% of cards, since
//      this only runs on the nightly top 5) score 0 here — unaffected,
//      falls back to components 1-3 exactly as before this field existed.
const EPS_CONFIDENCE_WEIGHT = { high: 25, medium: 15, low: 8 };

// Market-reaction refinement — ONLY available on the resend-with-market-data
// pass (marketData is null/absent on the initial nightly send, see
// cmdResendWithMarketData's Step 4 above), so the initial email's order is
// fully reproducible from the note payload alone, while the morning resend
// can re-rank using what the market actually did overnight. Two capped
// sub-components so a single extreme value (e.g. a thinly-traded stock's
// noisy 1D return) can't swing the ranking on its own:
//   - |returns1d| scaled at 2 points per 1%, capped at 12 (i.e. maxes out
//     at a +/-6% move) — magnitude of reaction, not direction, since both a
//     surprise beat and a surprise miss are "the market found this
//     significant."
//   - volRatio7d >= 2.0x (the same threshold marketDataHtml's own coloring
//     uses to flag a volume spike) contributes a flat 8 — confirms the
//     price move was on real participation, not a thin/illiquid blip.
const MARKET_REACTION_RETURN_CAP = 12;
const MARKET_REACTION_VOLUME_SPIKE_BONUS = 8;

function computeRankScore(it) {
  let score = 0;

  if (it.high_conviction || it.highConviction) score += 30;

  const eps = it.epsImpact;
  if (eps && eps.confidence) {
    score += EPS_CONFIDENCE_WEIGHT[String(eps.confidence).toLowerCase()] || 0;
  }
  if (eps && eps.direction) {
    score += eps.direction === 'neutral' ? 3 : 10;
  }

  const ic = it.infoClassification;
  if (ic && Array.isArray(ic.claims) && ic.claims.length) {
    const newCount = ic.claims.filter((c) => String(c.bucket || '').toUpperCase() === 'NEW').length;
    score += (newCount / ic.claims.length) * 35;
  }

  const md = it.marketData;
  if (md) {
    if (typeof md.returns1d === 'number') {
      score += Math.min(Math.abs(md.returns1d) * 2, MARKET_REACTION_RETURN_CAP);
    }
    if (typeof md.volRatio7d === 'number' && md.volRatio7d >= 2.0) {
      score += MARKET_REACTION_VOLUME_SPIKE_BONUS;
    }
  }

  return score;
}

// ── 5-LEVEL SIGNAL STRENGTH (added 2026-09-04) ────────────────────────────
//
// Darshan's ask: "instead of having just 3 levels of significance, divide the
// significance score in 5 levels. Also show the significance score in the
// thesis card as well."
//
// The important design decision here is WHERE the extra resolution comes
// from. The obvious move — ask the model for five labels instead of three —
// is the wrong one, for two reasons. First, every note already written (and
// every other skill that shares the `announcement-insights` note cache:
// watchlist-insights, gainers-signal, volume-rocketing) speaks the
// three-label vocabulary, so a new vocabulary either orphans that history or
// forces a migration of it. Second, and more importantly, asking an LLM to
// reliably separate "quite significant" from "very significant" adds a
// judgment call it is not well-calibrated to make consistently across runs —
// the distinction it CAN make reliably is the coarse three-way one.
//
// So the five levels are derived, not asked for: the model keeps judging the
// coarse importance of the EVENT (`significance`), and `computeRankScore`'s
// already-existing deterministic evidence signals (category conviction, how
// hard the EPS number is, how much of the filing is genuinely NEW, and — on
// the resend — what the market actually did) supply the resolution WITHIN
// that band. That means the score is reproducible, explainable from fields
// visible on the card itself, and free: no extra tokens, no second pass.
//
// Bands are deliberately NON-overlapping, so a tier is never a surprise
// relative to the underlying label — a `medium` note can rank at the top of
// the medium band but can never present as a top-tier signal on evidence
// weights alone. The refinement only ever reorders within a label.
//
//   significance   base   +refinement   ->  score      tiers reachable
//   high            60      0..40           60..100     S1 (>=80), S2
//   medium          35      0..24           35..59      S3 (>=40), S4
//   low             15      0..19           15..34      S4 (>=20), S5
//   routine          0      0..14            0..14      S5
const SIGNIFICANCE_BAND = {
  high: { base: 60, width: 40 },
  medium: { base: 35, width: 24 },
  low: { base: 15, width: 19 },
  routine: { base: 0, width: 14 },
};

// Divisor that turns computeRankScore into the 0..1 within-band refinement.
//
// CALIBRATION (this number was wrong on the first cut and the fixture caught
// it — worth recording why). The theoretical ceiling of computeRankScore is
// 100 on the initial send (30 category + 25 EPS confidence + 10 EPS direction
// + 35 info-classification newness), and dividing by that theoretical maximum
// is the obvious choice. It is also useless: the two largest components are
// both rare. `high_conviction` applies to four categories out of the whole
// taxonomy, and info-classification runs on only the top ~5 items a night, so
// the overwhelming majority of real cards score 8-25 — a ratio of 0.08-0.25,
// which compressed every `medium` note into the bottom 5 points of its band
// and made tier S3 mathematically unreachable for them. Five tiers where one
// is unreachable is four tiers with extra steps.
//
// 65 is the realistic ceiling instead: the best score an item can reach
// WITHOUT the rare info-classification bonus (30 + 25 + 10). So a
// high-conviction filing with a hard, dated rupee figure tops out its band on
// its own merits, an info-classified item clamps at 1.0 rather than being
// rewarded twice for the same strength, and ordinary notes land across the
// middle of their band instead of pinned at its floor.
//
// The clamp matters for the resend pass too: market reaction can push
// computeRankScore past 65, and clamping means a loud market response moves a
// card to the top of the band its evidence earned rather than promoting it out
// of that band. What the market did is confirmation, not new evidence about
// the filing.
const RANK_SCORE_NOMINAL_MAX = 65;

// Five tiers, strongest first. `min` is inclusive. Labels are short enough to
// fit a chip and are prefixed S1..S5 so the ordering is unambiguous in an
// email where colour may not survive (dark mode, plain-text fallback,
// colour-blind readers) — the number carries the meaning on its own.
const SIGNAL_TIERS = [
  {
    tier: 1,
    code: 'S1',
    label: 'Critical',
    min: 80,
    color: '#7a0c0c',
    bg: '#fdeaea',
    border: '#e08d8d',
  },
  {
    tier: 2,
    code: 'S2',
    label: 'High',
    min: 60,
    color: '#b42318',
    bg: '#fef3f2',
    border: '#fda29b',
  },
  {
    tier: 3,
    code: 'S3',
    label: 'Moderate',
    min: 40,
    color: '#b54708',
    bg: '#fffaeb',
    border: '#fec84b',
  },
  {
    tier: 4,
    code: 'S4',
    label: 'Low',
    min: 20,
    color: '#0c447c',
    bg: '#eff8ff',
    border: '#9cc9ee',
  },
  {
    tier: 5,
    code: 'S5',
    label: 'Marginal',
    min: 0,
    color: '#475467',
    bg: '#f9fafb',
    border: '#d0d5dd',
  },
];

/**
 * The 0-100 signal score shown on every card. Deterministic; depends only on
 * fields already present on the note payload.
 */
function computeSignalScore(it) {
  const sig = String(it.significance || 'low').toLowerCase();
  const band = SIGNIFICANCE_BAND[sig] || SIGNIFICANCE_BAND.low;
  const ratio = Math.min(computeRankScore(it) / RANK_SCORE_NOMINAL_MAX, 1);
  return Math.round(band.base + ratio * band.width);
}

function signalTierFor(it) {
  const score = typeof it.signalScore === 'number' ? it.signalScore : computeSignalScore(it);
  const meta = SIGNAL_TIERS.find((t) => score >= t.min) || SIGNAL_TIERS[SIGNAL_TIERS.length - 1];
  return { ...meta, score };
}

/**
 * The score chip rendered on each card — "S2 High · 72/100".
 *
 * Shows BOTH the tier and the raw number on purpose. The tier is what the eye
 * sorts by; the number is what makes two same-tier cards comparable and, more
 * importantly, what makes the ranking auditable — if a card's position looks
 * wrong, the number is the thing to argue with, and a tier label alone would
 * hide the disagreement.
 */
// Chip shows only the score, out of 10 — the level NAME already sits on the
// section's group header (see buildDigestHtml), so repeating it on every card
// in that group added nothing, and the tier CODE (S1..S5) was internal
// bookkeeping the reader had no use for. The number is what makes two cards
// in the same group comparable and keeps the ranking auditable: if a card's
// position looks wrong, the number is what you argue with.
//
// Scaled 0-10 (one decimal) rather than the underlying 0-100, per Darshan's
// ask — the tooltip still documents where the number comes from, since the
// scaling factor by itself doesn't explain the score's composition.
function signalScoreChipHtml(it) {
  const t = signalTierFor(it);
  const scaled = (t.score / 10).toFixed(1);
  return (
    `<span style="display:inline-block;vertical-align:middle;font-size:10.5px;font-weight:700;` +
    `background:${t.bg};color:${t.color};border:1px solid ${t.border};border-radius:4px;` +
    `padding:2px 7px;margin-left:6px;white-space:nowrap;" ` +
    `title="Signal strength ${scaled}/10 (internally ${t.code} ${t.label}) — deterministic score from significance, category conviction, EPS-impact confidence, NEW-information share and (on resend) market reaction">` +
    `${scaled}/10</span>`
  );
}

// Shared dedupe key: prefer the real announcementId (stable across runs —
// see watchlistInsights.js's announcementId(), which IS the note's ssUrl),
// falling back to companyId+insight text only for the rare note that predates
// announcementId being stored at all. Factored out so cmdSendDigest and
// cmdResendWithMarketData can never drift into two different definitions of
// "same announcement" — see the 2026-09 duplicate-entry bug below for why
// that drift is exactly what let duplicates slip through resend-with-market-data.
function insightDedupeKey(it) {
  return it.announcementId
    ? `${it.companyId}::${it.announcementId}`
    : `${it.companyId}::${it.insight}`;
}

// 2026-09 fix: resend-with-market-data previously read notes straight from
// db.find('notes', {date, type:'announcement'}) with ZERO dedup, so any
// duplicate note already sitting in the DB (the exact STLTECH/VARROC/RAMRAT-
// style duplicates the 2026-08-31 `alreadyProcessed` fix stops from being
// CREATED going forward) would still be re-rendered as two separate cards on
// every resend, forever — the categorise-level fix only prevents new
// duplicates, it doesn't clean up ones already persisted. Both send-digest
// and resend-with-market-data now route through this one function so a
// pre-existing duplicate note is silently collapsed (first-seen wins) rather
// than requiring a manual data cleanup pass.
function dedupeInsights(insights) {
  const seen = new Set();
  const out = [];
  for (const it of insights) {
    const key = insightDedupeKey(it);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

// Per-company thesis-card clubbing (2026-09): when the same company has
// multiple distinct announcements surviving into one digest (e.g. an
// acquisition update PLUS a shareholding-change filing the same evening),
// render ONE card per company instead of one per announcement — a reader
// scanning the digest cares about "what's the state of play on this
// company tonight," not "how many separate filings happened to hit the
// wire." Card-level significance/score use the HIGHEST-scoring individual
// announcement (so a company with one high-conviction item and three
// routine ones still surfaces in the High section) — see scoring notes
// inline below.
function groupInsightsByCompany(insights) {
  const bySig = { high: 0, medium: 1, low: 2 };
  const byCompany = new Map();
  for (const it of insights) {
    const key = it.companyId || it.name || '';
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key).push(it);
  }

  const grouped = [];
  for (const items of byCompany.values()) {
    if (items.length === 1) {
      grouped.push(items[0]);
      continue;
    }
    // Rank each sub-item by (significance rank, then computeRankScore) so
    // "highest scoring announcement" matches the exact ordering the digest
    // already uses to sort cards within a significance bucket — no second,
    // divergent notion of "highest" gets introduced here.
    const bySeverityThenScore = [...items].sort((a, b) => {
      const sigDiff = (bySig[a.significance] ?? 3) - (bySig[b.significance] ?? 3);
      if (sigDiff !== 0) return sigDiff;
      return computeRankScore(b) - computeRankScore(a);
    });
    const primary = bySeverityThenScore[0];

    // Combine headlines/thesis chains from every sub-item, de-duplicated by
    // normalized text so two announcements that happen to restate the same
    // fact (e.g. a board-outcome filing followed by a press-release repeating
    // it) don't double the same line in the combined card.
    const seenLines = new Set();
    const combinedChain = [];
    for (const it of bySeverityThenScore) {
      const steps =
        Array.isArray(it.thesisChain) && it.thesisChain.length
          ? it.thesisChain
          : String(it.insight || '')
              .split(/(?<=[.!?])\s+/)
              .filter(Boolean);
      for (const step of steps) {
        const norm = String(step).trim().toLowerCase().replace(/\s+/g, ' ');
        if (!norm || seenLines.has(norm)) continue;
        seenLines.add(norm);
        combinedChain.push(step);
      }
    }

    // Merge tags (unique, primary's tags first so high_conviction etc. stay
    // prominent), and collect every distinct sub-announcement's PDF link so
    // the reader can still reach each original filing, not just the
    // highest-scoring one's.
    const tagSet = new Set();
    for (const it of bySeverityThenScore) {
      for (const t of Array.isArray(it.tags) ? it.tags : []) tagSet.add(t);
    }
    const subLinks = bySeverityThenScore
      .filter((it) => it.pdfUrl)
      .map((it) => ({
        pdfUrl: it.pdfUrl,
        category: it.category,
        announcementId: it.announcementId,
      }));

    grouped.push({
      ...primary,
      headline: primary.headline || undefined,
      thesisChain: combinedChain,
      tags: [...tagSet],
      // Card keeps the primary (highest-scoring) item's significance,
      // category chip, epsImpact, marketData, infoClassification, and
      // pdfUrl/link-button — those are per-thesis judgments that don't
      // average meaningfully across unrelated filings; only the narrative
      // body (thesisChain) and tags are combined. subAnnouncementCount lets
      // the header note "+N more filings" without changing the score.
      subAnnouncementCount: items.length,
      subLinks,
    });
  }
  return grouped;
}

function buildDigestHtml(
  rawInsights,
  { cutoffIstHuman, runIstHuman, stats, slotLabel, title, knowledgeGaps } = {}
) {
  // Dedupe first (defends against any duplicate note already in the DB —
  // see dedupeInsights above), THEN club by company — clubbing on
  // undeduped input would just combine duplicate text into the same card
  // instead of dropping it.
  const insights = groupInsightsByCompany(dedupeInsights(rawInsights));
  // Sections are the FIVE signal tiers (S1..S5), not the three raw
  // significance labels — see SIGNAL_TIERS / computeSignalScore above. Every
  // card is stamped with its resolved score and tier once here, so the
  // sort, the section grouping, the chip on the card, and the footer's
  // per-tier counts can never disagree about which tier a card is in (three
  // independent recomputations of the same derived value is how that kind
  // of inconsistency creeps in).
  const scored = insights.map((it) => {
    const t = signalTierFor(it);
    return { ...it, signalScore: t.score, signalTier: t.tier };
  });
  const sorted = [...scored].sort((a, b) => {
    // Score IS the sort key now, and it already subsumes the old
    // (significance, then computeRankScore) ordering: the band base
    // preserves significance as the dominant term, and the refinement
    // preserves rank-score ordering within it. A stable sort
    // (Array.prototype.sort is stable per spec since ES2019) keeps exact
    // ties in their original relative order rather than reshuffling them
    // run to run.
    return b.signalScore - a.signalScore;
  });
  const groups = {};
  for (const it of sorted) (groups[it.signalTier] || (groups[it.signalTier] = [])).push(it);

  // Derived from the cards actually rendered, so the footer's per-tier
  // numbers are the same numbers the sections above show — see
  // tierBreakdownHtml on why this is computed rather than passed in.
  const tierCounts = {};
  for (const it of sorted) tierCounts[it.signalTier] = (tierCounts[it.signalTier] || 0) + 1;

  const sections = SIGNAL_TIERS.filter((t) => groups[t.tier] && groups[t.tier].length)
    .map((tierMeta) => {
      // The group header carries the level NAME only (e.g. "High"), not the
      // internal S1..S5 code — Darshan's ask, and it also removes the one
      // remaining place a reader saw the "S1/S2/S3" vocabulary at all.
      const meta = {
        label: tierMeta.label,
        color: tierMeta.color,
        bg: tierMeta.bg,
        border: tierMeta.border,
      };
      const tone = SIG_TONE[groups[tierMeta.tier][0].significance] || SIG_TONE.low;
      const cards = groups[tierMeta.tier]
        .map((it) => {
          // Drop any tag that duplicates the category chip already shown in
          // the header (e.g. category=fundraise + tags=[fundraise,...] used
          // to render "fundraise" twice on the same card) — the chip already
          // says it, the tag row should only add NEW information.
          const dedupedTags = Array.isArray(it.tags)
            ? it.tags.filter((t) => t !== it.category)
            : it.tags;
          const tagsHtml = tagPillsHtml(dedupedTags);
          const headline = it.headline
            ? highlightFacts(esc(it.headline))
            : highlightFacts(esc(String(it.insight || '').split(/(?<=[.!?])\s+/)[0] || ''));
          const chainHtml = thesisChainHtml(it);
          const epsHtml = epsImpactHtml(it.epsImpact);
          const marketHtml = marketDataHtml(it.marketData);
          const infoClassHtml = infoClassificationHtml(it.infoClassification);
          // Icon-only link button to the original filing, sitting in the
          // header row next to the category tag rather than as a full-width
          // footer link — the header is where the reader's eye already is.
          // References the icon via `cid:` (see EXPAND_ICON_CID above) — a
          // real MIME-attached image, not a data: URI, since Gmail strips
          // data: URIs from <img src> entirely (confirmed by direct DOM
          // inspection of the live rendered email). No border/background
          // chrome — just the icon.
          // Gmail's sanitizer strips flexbox alignment props (align-items,
          // gap) from inline styles — confirmed by inspecting the live
          // rendered DOM's computed style (both came back "normal"/0 despite
          // being set in the sent HTML). display:flex alone survives but
          // does nothing without align-items, so the icon defaulted to
          // vertical-align:baseline and looked like it was "hanging" above
          // the text line. Fixed by dropping flexbox entirely for this small
          // icon: inline-block + vertical-align:middle on BOTH the category
          // pill and the icon is the one alignment mechanism Gmail reliably
          // honors (it's table/inline layout, not flex).
          const linkBtn = it.pdfUrl
            ? `<a href="${esc(it.pdfUrl)}" target="_blank" title="View original filing" style="display:inline-block;vertical-align:middle;width:14px;height:14px;margin-left:8px;line-height:0;text-decoration:none;"><img src="cid:${EXPAND_ICON_CID}" width="14" height="14" alt="View filing" style="display:inline-block;vertical-align:middle;"/></a>`
            : '';
          // Display name: only append "(companyId)" when a distinct human
          // name exists — otherwise "NSE:ZEEL (NSE:ZEEL)" duplicates the
          // same string (companyId IS the ticker, there's no separate name).
          const displayName =
            it.name && it.name !== it.companyId ? `${it.name} (${it.companyId})` : it.companyId;
          // Clubbed-card affordances (see groupInsightsByCompany): a "+N
          // more filings" badge next to the category chip, and one small
          // link per additional sub-announcement's original PDF beyond the
          // primary one already covered by linkBtn — so combining cards
          // never loses a reader's ability to open any individual filing.
          const extraCount = (it.subAnnouncementCount || 1) - 1;
          const multiBadge =
            extraCount > 0
              ? `<span style="display:inline-block;vertical-align:middle;font-size:10px;font-weight:600;color:#475467;background:#f2f4f7;border:1px solid #d0d5dd;border-radius:999px;padding:2px 8px;margin-left:6px;white-space:nowrap;">+${extraCount} more filing${extraCount > 1 ? 's' : ''}</span>`
              : '';
          const extraLinksHtml =
            extraCount > 0 && Array.isArray(it.subLinks) && it.subLinks.length > 1
              ? `<div style="margin-top:6px;font-size:11px;">${it.subLinks
                  .filter((l) => l.pdfUrl !== it.pdfUrl)
                  .map(
                    (l) =>
                      `<a href="${esc(l.pdfUrl)}" target="_blank" style="color:#475467;text-decoration:underline;margin-right:10px;">${esc(toTitleCase(l.category))} filing</a>`
                  )
                  .join('')}</div>`
              : '';
          return `
        <div style="background:#fff;border:1px solid #eaecf0;border-radius:8px;padding:14px 16px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;">
            <div style="font-weight:700;font-size:13.5px;margin-right:10px;line-height:20px;">${stockscansLink(displayName, it.companyId, 'NSE', '#101828')}</div>
            <div style="white-space:nowrap;line-height:20px;">
              <span style="display:inline-block;vertical-align:middle;font-size:10.5px;font-weight:700;font-family:monospace;letter-spacing:0.03em;background:${tone.chipBg};color:${tone.chipFg};border-radius:3px;padding:2px 7px;white-space:nowrap;">${esc(toTitleCase(it.category))}</span>
              ${signalScoreChipHtml(it)}
              ${multiBadge}
              ${linkBtn}
            </div>
          </div>
          ${headline ? `<div style="font-size:14.5px;font-weight:600;line-height:1.45;color:#101828;margin-top:9px;">${headline}</div>` : ''}
          ${marketHtml}
          ${chainHtml}
          ${epsHtml}
          ${tagsHtml ? `<div style="margin-top:9px;">${tagsHtml}</div>` : ''}
          ${infoClassHtml}
          ${extraLinksHtml}
        </div>`;
        })
        .join('');
      return `
      <div style="margin-bottom:28px;">
        <div style="border-bottom:2px solid ${meta.border};padding-bottom:6px;margin-bottom:12px;">
          <span style="font-size:15px;font-weight:700;color:${meta.color};text-transform:uppercase;">${meta.label}</span>
          <span style="font-size:12px;font-weight:600;color:${meta.color};background:${meta.bg};border:1px solid ${meta.border};border-radius:999px;padding:2px 10px;margin-left:8px;">${groups[tierMeta.tier].length}</span>
        </div>
        ${cards}
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;background:#f9fafb;padding:24px;color:#101828;">
    <h2 style="margin:0 0 4px;">${esc(title || 'Announcement Signals')}</h2>
    <p style="color:#667085;font-size:13px;margin:0 0 20px;">${slotLabel ? `<b>${esc(slotLabel)}</b> &nbsp;&middot;&nbsp; ` : ''}Window: ${esc(cutoffIstHuman)} &rarr; ${esc(runIstHuman)} &nbsp;&middot;&nbsp; ${insights.length} compan${insights.length === 1 ? 'y' : 'ies'} (${rawInsights.length} filing${rawInsights.length === 1 ? '' : 's'})</p>
    ${sections || '<p style="color:#667085;">No non-routine announcements in this window.</p>'}
    ${buildStatsFooterHtml(stats, tierCounts, knowledgeGaps)}
  </body></html>`;
}

/* ══════════════════════════════════════════════════════════════════════════
 * SCAN-SIGNAL MODE — gainers-signal / volume-rocketing
 *
 * Same card, different grouping axis. A post-close digest groups by how
 * significant an ANNOUNCEMENT is; a daily scan groups by how actionable a
 * COMPANY is (the ACT/WATCH/NOTED tier gainersClassifier.js already computed).
 * Everything above this line is reused verbatim.
 * ══════════════════════════════════════════════════════════════════════════ */

// Tier tone. Deliberately the SAME three-step red/amber/blue-grey family as
// SIG_TONE above rather than a fourth palette — a reader moving between the
// nightly post-close digest and the morning gainers email should not have to
// relearn what a colour means. ACT reads as "act on this" (the attention
// colour), WATCH as "hold this in view", NOTED as "logged, not recommended".
const TIER_META = {
  ACT: { label: 'Act', icon: '🔴', color: '#b42318', bg: '#fef3f2', border: '#fda29b' },
  WATCH: { label: 'Watch', icon: '🟡', color: '#b54708', bg: '#fffaeb', border: '#fec84b' },
  NOTED: { label: 'Noted', icon: '⚪', color: '#344054', bg: '#f9fafb', border: '#d0d5dd' },
};
const TIER_TONE = {
  ACT: { chipBg: '#fcebeb', chipFg: '#791f1f', border: '#e24b4a' },
  WATCH: { chipBg: '#faeeda', chipFg: '#633806', border: '#ef9f27' },
  NOTED: { chipBg: '#e6f1fb', chipFg: '#0c447c', border: '#3a85c9' },
};

// Linkage is the one discipline both scan skills refuse to fudge: is the move
// EXPLAINED by a filing, UNEXPLAINED (delivery-backed buying with no
// discoverable cause — often early accumulation, and genuinely interesting as
// long as it's labelled honestly), or MISMATCHED (a filing exists but doesn't
// fit the move). Rendering it as a chip rather than burying it in prose is
// what stops "unexplained" from quietly reading as "explained" to a skimming
// reader — the failure mode that makes a signal report untrustworthy.
const LINKAGE_TONE = {
  explained: { bg: '#eaf3de', fg: '#27500a', border: '#a9cf8a', label: 'Explained' },
  unexplained: { bg: '#f2f4f7', fg: '#475467', border: '#d0d5dd', label: 'Unexplained' },
  mismatched: { bg: '#fffaeb', fg: '#b54708', border: '#fec84b', label: 'Mismatched' },
};

/**
 * Delivery value as a percentage of market cap — added 2026-09-03 per
 * Darshan's request, and the single most size-normalised number on the card.
 *
 * Delivery value in ₹ Cr answers "how much real money changed hands"; delivery
 * % answers "what share of today's volume was real"; NEITHER answers "is that
 * a lot FOR THIS COMPANY". ₹80 Cr delivered is an enormous day for a ₹400 Cr
 * micro-cap (20% of the entire company traded for keeps) and a rounding error
 * for a ₹40,000 Cr large-cap (0.2%). That ratio is what makes names of wildly
 * different sizes comparable in one sorted list, which is exactly what these
 * two scans produce every morning.
 *
 * Returns null — never 0 — when either input is missing. A company we could
 * not measure must not sort as though we measured it and found nothing; the
 * card renders "—" and the reader knows the difference.
 */
function deliveryValuePctOfMcap(it) {
  if (typeof it.delivery_value_pct_of_mcap === 'number') return it.delivery_value_pct_of_mcap;
  const dv = it.delivery_value_cr;
  const mc = it.market_cap_cr;
  if (typeof dv !== 'number' || typeof mc !== 'number' || !(mc > 0)) return null;
  return (dv / mc) * 100;
}

// Thresholds for colouring the delivery-value-as-%-of-mcap figure. These are
// deliberately loose bands, not precise cutoffs: the point is to let the eye
// find the outlier in a 20-row list, not to imply the difference between
// 0.99% and 1.01% means anything. Calibrated from observed daily runs — a
// typical liquid mid-cap turns over well under 0.5% of its market cap in
// delivery on an ordinary day, so >=1% is genuinely unusual and >=2.5% is the
// kind of number worth stopping on.

/**
 * The metric line — the scan-signal equivalent of marketDataHtml() above.
 *
 * Six figures, in the order a reader actually asks them: how much did it move,
 * how big is it, how much was delivered (both axes, always together — see the
 * gainers-signal SKILL.md on why percentage alone misleads at both ends of the
 * market-cap range), what that delivery is worth relative to the company, and
 * how many sessions this name has been showing up.
 *
 * Monospace and `&nbsp;`-separated inline-blocks rather than a table or
 * flexbox, for the Gmail-sanitizer reasons documented at the top of this file.
 */
function scanMetricsHtml(it) {
  const fmtPct = (v) => (typeof v !== 'number' ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`);
  const fmtCr = (v) => (typeof v !== 'number' ? '—' : `₹${v.toFixed(1)} Cr`);
  const fmtMcap = (v) =>
    typeof v !== 'number'
      ? '—'
      : v >= 1000
        ? `₹${(v / 1000).toFixed(1)}k Cr`
        : `₹${v.toFixed(0)} Cr`;

  const ret = it.return_1d;
  const retColor = typeof ret !== 'number' ? '#475467' : ret >= 0 ? '#067647' : '#b42318';

  const dvPct = deliveryValuePctOfMcap(it);
  const dvPctColor =
    dvPct == null
      ? '#475467'
      : dvPct >= DV_MCAP_STRIKING
        ? '#b42318'
        : dvPct >= DV_MCAP_NOTABLE
          ? '#b54708'
          : '#475467';

  const cell = (label, value, color) =>
    `<span style="display:inline-block;vertical-align:middle;margin-right:14px;">${label}: <b style="color:${color || '#101828'};">${value}</b></span>`;

  const streakCell =
    typeof it.streak === 'number' && it.streak > 1
      ? cell('Streak', `${it.streak}d`, '#b54708')
      : '';

  return (
    `<div style="margin-top:8px;font-size:11.5px;font-family:monospace;color:#475467;line-height:1.9;">` +
    cell('1D', fmtPct(ret), retColor) +
    cell('Mcap', fmtMcap(it.market_cap_cr)) +
    cell('Deliv', typeof it.delivery_pct === 'number' ? `${it.delivery_pct.toFixed(1)}%` : '—') +
    cell('Deliv Val', fmtCr(it.delivery_value_cr)) +
    cell('Deliv/Mcap', dvPct == null ? '—' : `${dvPct.toFixed(2)}%`, dvPctColor) +
    streakCell +
    `</div>`
  );
}

/**
 * The WHY block — the fix for the complaint that started this refactor.
 *
 * Historically the WHY cell was empty for most companies, because the only
 * thing feeding it was "did a STRONG announcement land in the last 7 days",
 * and on any given day most gainers have filed nothing. That produced a report
 * whose most common answer was a blank, which reads as "we didn't look" even
 * when the honest answer was "there is nothing".
 *
 * The resolution ladder (see skills/equity-research/_shared/scan-signal-pipeline.md
 * §WHY) now distinguishes those two states explicitly, and `basis` records
 * which rung actually answered:
 *
 *   `filing`      — a STRONG filing in the last 14 days explains the move.
 *   `catalyst`    — no fresh filing, but rerating-catalysts' brief surfaced a
 *                   live re-rating catalyst that plausibly accounts for it.
 *   `classified`  — a filing exists and announcement-info-classifier judged how
 *                   much of it is genuinely NEW (the NEW claims are the WHY).
 *   `concall`     — a recent bullish concall with concrete forward guidance.
 *   `sector`      — a delivery-confirmed sector cluster is the cause, not
 *                   anything company-specific.
 *   `none`        — checked all of the above, genuinely nothing. This renders
 *                   as an explicit muted line, NOT as an empty cell, because
 *                   "we looked and there is no news" is a real finding and the
 *                   reader deserves to be able to tell it apart from a bug.
 */
const WHY_BASIS_LABEL = {
  filing: 'From filing',
  catalyst: 'From re-rating catalyst',
  classified: 'New information',
  concall: 'From concall',
  sector: 'Sector-wide',
  none: 'No discoverable trigger',
};

function whyHtml(why) {
  if (!why) return '';
  const text = typeof why === 'string' ? why : why.text;
  const basis = (typeof why === 'object' && why.basis) || (text ? 'filing' : 'none');
  const label = WHY_BASIS_LABEL[basis] || WHY_BASIS_LABEL.filing;

  // The honest-blank case. Muted, italic, unmistakably a stated finding rather
  // than a missing value.
  if (!text || basis === 'none') {
    return `<div style="margin-top:9px;font-size:12.5px;color:#98a2b3;font-style:italic;">No discoverable trigger — checked filings (14d), re-rating catalysts, and concall.</div>`;
  }

  const sources =
    typeof why === 'object' && Array.isArray(why.sources) && why.sources.length
      ? `<div style="font-size:11px;color:#98a2b3;margin-top:3px;">${why.sources.map((s) => esc(s)).join(' &middot; ')}</div>`
      : '';

  return `
    <div style="margin-top:10px;padding:9px 11px;background:#f9fafb;border-left:3px solid #d0d5dd;border-radius:0 6px 6px 0;">
      <div style="font-size:10.5px;font-weight:700;color:#667085;text-transform:uppercase;letter-spacing:0.03em;">Why &middot; <span style="color:#98a2b3;font-weight:600;">${esc(label)}</span></div>
      <div style="font-size:13px;line-height:1.6;color:#344054;margin-top:4px;">${highlightFacts(esc(text))}</div>
      ${sources}
    </div>`;
}

/**
 * The EPS thesis block — rerating-catalysts' brief-mode output, folded onto
 * the card for the top-10-by-delivery-value names.
 *
 * `epsThesis` is `{jCurveTag, jCurveReason, thesis, catalysts[], asOf,
 * cacheHit}` as returned by rerating-catalysts --mode brief. The J-curve tag
 * gets the badge treatment that skill's own widget gives it (that skill makes
 * it the first thing a reader sees, and this card should not quietly demote
 * it), the one-sentence thesis carries the actual forward-EPS argument, and up
 * to three catalyst names ride along as compact chips.
 *
 * `asOf` is rendered whenever the brief came from cache rather than a fresh
 * build, so a reader can always tell how old the thesis behind a card is —
 * a cached thesis is fine, a cached thesis silently presented as today's read
 * is not.
 */
const JCURVE_TONE = {
  STRONG: { bg: '#eaf3de', fg: '#27500a', border: '#a9cf8a' },
  MODERATE: { bg: '#fffaeb', fg: '#b54708', border: '#fec84b' },
  WEAK: { bg: '#f2f4f7', fg: '#475467', border: '#d0d5dd' },
  NONE: { bg: '#f9fafb', fg: '#98a2b3', border: '#eaecf0' },
};

function epsThesisHtml(epsThesis) {
  if (!epsThesis) return '';
  const tag = String(epsThesis.jCurveTag || 'NONE').toUpperCase();
  const tone = JCURVE_TONE[tag] || JCURVE_TONE.NONE;
  const badge = `<span style="display:inline-block;vertical-align:middle;font-size:9.5px;font-weight:700;font-family:monospace;letter-spacing:0.04em;background:${tone.bg};color:${tone.fg};border:1px solid ${tone.border};border-radius:3px;padding:1.5px 7px;white-space:nowrap;">J-CURVE ${esc(tag)}</span>`;

  const staleness =
    epsThesis.cacheHit && epsThesis.asOf
      ? ` <span style="color:#98a2b3;font-weight:600;">(as of ${esc(epsThesis.asOf)})</span>`
      : '';

  const catalystChips =
    Array.isArray(epsThesis.catalysts) && epsThesis.catalysts.length
      ? `<div style="margin-top:6px;">${epsThesis.catalysts
          .slice(0, 3)
          .map(
            (c) =>
              `<span style="display:inline-block;font-size:10px;font-family:monospace;background:${TAG_CHIP.bg};color:${TAG_CHIP.fg};border:1px solid ${TAG_CHIP.border};border-radius:3px;padding:1.5px 6px;margin:0 4px 4px 0;">${esc(typeof c === 'string' ? c : c.name || '')}</span>`
          )
          .join('')}</div>`
      : '';

  const reason = epsThesis.jCurveReason
    ? `<div style="font-size:11.5px;color:#667085;line-height:1.55;margin-top:4px;">${highlightFacts(esc(epsThesis.jCurveReason))}</div>`
    : '';
  const thesis = epsThesis.thesis
    ? `<div style="font-size:13px;line-height:1.6;color:#344054;margin-top:5px;">${highlightFacts(esc(epsThesis.thesis))}</div>`
    : '';

  return `
    <div style="margin-top:10px;padding-top:9px;border-top:1px dashed #eaecf0;">
      <div style="font-size:11px;font-weight:700;color:#667085;text-transform:uppercase;letter-spacing:0.02em;">EPS thesis${staleness}</div>
      <div style="margin-top:5px;">${badge}</div>
      ${reason}
      ${thesis}
      ${catalystChips}
    </div>`;
}

function linkageChipHtml(linkage) {
  const key = String(linkage || '').toLowerCase();
  const tone = LINKAGE_TONE[key];
  if (!tone) return '';
  return `<span style="display:inline-block;vertical-align:middle;font-size:9.5px;font-weight:700;font-family:monospace;letter-spacing:0.03em;background:${tone.bg};color:${tone.fg};border:1px solid ${tone.border};border-radius:3px;padding:1.5px 7px;margin-left:6px;white-space:nowrap;">${esc(tone.label)}</span>`;
}

/**
 * Sort key for every section of a scan-signal email: delivery value, descending.
 *
 * Darshan asked for this explicitly, and it is the right default for a reason
 * worth writing down: delivery value is the only column on the card that
 * measures how much real money committed to the name today. Return % ranks by
 * how far a stock moved, which flatters thin micro-caps; conviction score ranks
 * by our own model's opinion, which is exactly what a reader may want to audit
 * rather than be sorted by. Rupees delivered is the market's own vote, and
 * sorting by it means the top of every section is where the money actually went.
 *
 * Names with no delivery data sort last (not as zero — see
 * deliveryValuePctOfMcap's note on the same distinction), with return as the
 * tiebreak so the ordering stays deterministic across re-runs.
 */
function sortByDeliveryValue(items) {
  return [...items].sort((a, b) => {
    const av = typeof a.delivery_value_cr === 'number' ? a.delivery_value_cr : -Infinity;
    const bv = typeof b.delivery_value_cr === 'number' ? b.delivery_value_cr : -Infinity;
    if (av !== bv) return bv - av;
    return (b.return_1d || 0) - (a.return_1d || 0);
  });
}

/**
 * Render one scan-signal card. Structurally identical to buildDigestHtml's
 * card — same shell, same header row, same tag pills, same info-classification
 * block — with the announcement-specific pieces swapped for scan-specific ones:
 * the tier chip replaces the category chip, scanMetricsHtml replaces
 * marketDataHtml, and the WHY + EPS-thesis blocks are additions.
 *
 * `compact` (used for the WATCH tier) drops the thesis chain and EPS-thesis
 * block, keeping the header, metric line and one-line WHY. Detail scaling with
 * tier is the design, not an oversight: a reader skimming on a phone should
 * reach the whole actionable picture before scrolling, and padding the lower
 * tiers is what destroys that.
 */
function scanSignalCardHtml(it, { compact = false } = {}) {
  const tier = String(it.tier || 'NOTED').toUpperCase();
  const tone = TIER_TONE[tier] || TIER_TONE.NOTED;

  const displayName =
    it.name && it.name !== it.companyId ? `${it.name} (${it.companyId})` : it.companyId;

  const tierChip = `<span style="display:inline-block;vertical-align:middle;font-size:10.5px;font-weight:700;font-family:monospace;letter-spacing:0.03em;background:${tone.chipBg};color:${tone.chipFg};border-radius:3px;padding:2px 7px;white-space:nowrap;">${esc(tier)}</span>`;

  // ⚡ badge: this name independently clears the volume-rocketing filter today.
  // On a gainers-signal card that is a genuine second, independent
  // confirmation; on a volume-rocketing card it is definitionally true of
  // every name, so that skill passes `volumeRocketing: false` to suppress it
  // rather than decorating every row with the same uninformative badge.
  const volBadge = it.volumeRocketing
    ? `<span style="display:inline-block;vertical-align:middle;font-size:9.5px;font-weight:700;font-family:monospace;background:#fffaeb;color:#b54708;border:1px solid #fec84b;border-radius:3px;padding:1.5px 6px;margin-left:6px;white-space:nowrap;">⚡ Vol 2.5x</span>`
    : '';

  const linkBtn = it.pdfUrl
    ? `<a href="${esc(it.pdfUrl)}" target="_blank" title="View original filing" style="display:inline-block;vertical-align:middle;width:14px;height:14px;margin-left:8px;line-height:0;text-decoration:none;"><img src="cid:${EXPAND_ICON_CID}" width="14" height="14" alt="View filing" style="display:inline-block;vertical-align:middle;"/></a>`
    : '';

  const headline = it.headline
    ? `<div style="font-size:14.5px;font-weight:600;line-height:1.45;color:#101828;margin-top:9px;">${highlightFacts(esc(it.headline))}</div>`
    : '';

  const dedupedTags = Array.isArray(it.tags) ? it.tags.filter((t) => t !== it.category) : it.tags;
  const tagsHtml = compact ? '' : tagPillsHtml(dedupedTags);

  const extraLinksHtml =
    Array.isArray(it.subLinks) && it.subLinks.length > 1
      ? `<div style="margin-top:6px;font-size:11px;">${it.subLinks
          .filter((l) => l.pdfUrl && l.pdfUrl !== it.pdfUrl)
          .map(
            (l) =>
              `<a href="${esc(l.pdfUrl)}" target="_blank" style="color:#475467;text-decoration:underline;margin-right:10px;">${esc(toTitleCase(l.category))} filing</a>`
          )
          .join('')}</div>`
      : '';

  return `
    <div style="background:#fff;border:1px solid #eaecf0;border-radius:8px;padding:14px 16px;margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;">
        <div style="font-weight:700;font-size:13.5px;margin-right:10px;line-height:20px;">${stockscansLink(displayName, it.companyId, 'NSE', '#101828')}</div>
        <div style="white-space:nowrap;line-height:20px;">
          ${tierChip}${volBadge}${linkageChipHtml(it.linkage)}${linkBtn}
        </div>
      </div>
      ${headline}
      ${scanMetricsHtml(it)}
      ${compact ? '' : thesisChainHtml(it)}
      ${whyHtml(it.why)}
      ${compact ? '' : epsThesisHtml(it.epsThesis)}
      ${compact ? '' : epsImpactHtml(it.epsImpact)}
      ${tagsHtml ? `<div style="margin-top:9px;">${tagsHtml}</div>` : ''}
      ${compact ? '' : infoClassificationHtml(it.infoClassification)}
      ${extraLinksHtml}
    </div>`;
}

// NOTED collapses to one line per name — logged, not recommended. Delivery
// value still leads the line because that is the sort key, so a reader can see
// the ordering is real rather than arbitrary.
function notedLineHtml(items) {
  return items
    .map((it) => {
      const dv =
        typeof it.delivery_value_cr === 'number' ? `₹${it.delivery_value_cr.toFixed(0)} Cr` : '—';
      const ret =
        typeof it.return_1d === 'number'
          ? `${it.return_1d > 0 ? '+' : ''}${it.return_1d.toFixed(1)}%`
          : '—';
      return `<span style="display:inline-block;margin:0 14px 6px 0;font-size:12px;color:#475467;">${stockscansLink(it.companyId, it.companyId, 'NSE', '#475467')} <span style="font-family:monospace;color:#98a2b3;">${esc(ret)} &middot; ${esc(dv)}</span></span>`;
    })
    .join('');
}

/**
 * Sector-cluster block. Kept as its own section rather than folded into cards
 * because a cluster is a statement about several names at once — a SUPER_STRONG
 * cluster is the single strongest thing either scan produces on the days it
 * fires, and burying it inside one member's card would lose that.
 */
function sectorClusterHtml(clusters) {
  const entries = Object.entries(clusters || {}).filter(([, c]) => c && c.tier);
  if (!entries.length) return '';
  const order = { SUPER_STRONG: 0, STRONG: 1 };
  entries.sort((a, b) => (order[a[1].tier] ?? 9) - (order[b[1].tier] ?? 9));
  const blocks = entries
    .map(([industry, c]) => {
      const strong = c.tier === 'SUPER_STRONG';
      const chipBg = strong ? '#fcebeb' : '#faeeda';
      const chipFg = strong ? '#791f1f' : '#633806';
      const members = Array.isArray(c.members)
        ? c.members
            .map((m) =>
              typeof m === 'string'
                ? esc(m)
                : `${esc(m.ticker || m.companyId || '')} <span style="color:#98a2b3;">${typeof m.return_1d === 'number' ? (m.return_1d > 0 ? '+' : '') + m.return_1d.toFixed(1) + '%' : ''}</span>`
            )
            .join(', ')
        : '';
      const agg =
        typeof c.qualified_delivery_value_cr === 'number'
          ? `₹${c.qualified_delivery_value_cr.toFixed(0)} Cr delivered across the cluster`
          : '';
      return `
      <div style="background:#fff;border:1px solid #eaecf0;border-radius:8px;padding:12px 14px;margin-bottom:8px;">
        <div><span style="font-weight:700;font-size:13px;color:#101828;">${esc(industry)}</span>
        <span style="display:inline-block;vertical-align:middle;font-size:9.5px;font-weight:700;font-family:monospace;background:${chipBg};color:${chipFg};border-radius:3px;padding:1.5px 7px;margin-left:8px;">${esc(c.tier)}</span></div>
        <div style="font-size:11.5px;font-family:monospace;color:#475467;margin-top:5px;">${esc(c.qualified_count || 0)} qualified names${agg ? ' &middot; ' + esc(agg) : ''}</div>
        ${members ? `<div style="font-size:12px;color:#344054;margin-top:5px;">${members}</div>` : ''}
        ${c.read ? `<div style="font-size:12.5px;color:#344054;margin-top:6px;line-height:1.55;">${highlightFacts(esc(c.read))}</div>` : ''}
      </div>`;
    })
    .join('');
  return `
    <div style="margin-bottom:28px;">
      <div style="border-bottom:2px solid #d0d5dd;padding-bottom:6px;margin-bottom:12px;">
        <span style="font-size:15px;font-weight:700;color:#344054;text-transform:uppercase;">🏭 Sector clusters</span>
      </div>
      ${blocks}
    </div>`;
}

/**
 * Streak board — names on a 2nd+ consecutive session. The cheapest
 * high-signal read in either report (it costs zero API calls, being derived
 * from our own past events), which is why it gets its own table even though
 * every name on it already appears in a tier above.
 */
function streakBoardHtml(streaks) {
  if (!Array.isArray(streaks) || !streaks.length) return '';
  const rows = [...streaks]
    .sort((a, b) => (b.streak || 0) - (a.streak || 0))
    .map(
      (s) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #f2f4f7;font-size:12.5px;">${stockscansLink(s.name || s.ticker, s.ticker || s.companyId, 'NSE', '#101828')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f2f4f7;font-size:12px;font-family:monospace;color:#b54708;font-weight:700;">${esc(s.streak)}d</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f2f4f7;font-size:12px;font-family:monospace;color:#475467;">${esc(s.tier || '')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #f2f4f7;font-size:12px;font-family:monospace;color:#475467;">${typeof s.delivery_value_cr === 'number' ? `₹${s.delivery_value_cr.toFixed(0)} Cr` : '—'}</td>
      </tr>`
    )
    .join('');
  return `
    <div style="margin-bottom:28px;">
      <div style="border-bottom:2px solid #fec84b;padding-bottom:6px;margin-bottom:12px;">
        <span style="font-size:15px;font-weight:700;color:#b54708;text-transform:uppercase;">🔥 Streak board</span>
      </div>
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fff;border:1px solid #eaecf0;border-radius:8px;border-collapse:collapse;">
        <tr style="background:#f9fafb;">
          <th style="text-align:left;padding:7px 10px;font-size:10.5px;color:#667085;text-transform:uppercase;letter-spacing:0.03em;">Name</th>
          <th style="text-align:left;padding:7px 10px;font-size:10.5px;color:#667085;text-transform:uppercase;letter-spacing:0.03em;">Streak</th>
          <th style="text-align:left;padding:7px 10px;font-size:10.5px;color:#667085;text-transform:uppercase;letter-spacing:0.03em;">Tier</th>
          <th style="text-align:left;padding:7px 10px;font-size:10.5px;color:#667085;text-transform:uppercase;letter-spacing:0.03em;">Deliv Val</th>
        </tr>
        ${rows}
      </table>
    </div>`;
}

/**
 * Build a complete scan-signal email (gainers-signal / volume-rocketing).
 *
 * @param {Array}  signals  one entry per company — see scanSignalCardHtml for
 *                          the card contract. Tier drives grouping; every
 *                          section is sorted by delivery value descending.
 * @param {Object} opts
 *   - title        e.g. "Daily Gainers Signal"
 *   - marketDate   e.g. "2026-09-03"
 *   - lead         2-3 sentence lead paragraph (the calling skill's judgment —
 *                  this is one of the few places the model's prose lands
 *                  directly in the email)
 *   - clusters     sector_clusters from the classifier DTO
 *   - streaks      streaks array from the classifier DTO
 *   - stats        pictorial run-summary footer (see STATS_TILES / SCAN_STATS_TILES)
 *   - caveats      array of data-availability caveat strings
 *
 * Every skill-specific string is a parameter; this function contains no
 * knowledge of WHICH scan it is rendering, which is what lets gainers-signal
 * and volume-rocketing be byte-identical in the reader's eye.
 */
function buildScanSignalEmail(signals, opts = {}) {
  const {
    title = 'Scan Signal',
    marketDate = '',
    lead = '',
    clusters = null,
    streaks = null,
    stats = null,
    caveats = [],
  } = opts;

  const deduped = dedupeInsights(
    (signals || []).map((s) => ({ ...s, companyId: s.companyId || s.ticker }))
  );
  const groups = { ACT: [], WATCH: [], NOTED: [] };
  for (const s of deduped) {
    const t = String(s.tier || 'NOTED').toUpperCase();
    (groups[t] || groups.NOTED).push(s);
  }

  const sections = ['ACT', 'WATCH', 'NOTED']
    .filter((t) => groups[t].length)
    .map((t) => {
      const meta = TIER_META[t];
      const sorted = sortByDeliveryValue(groups[t]);
      // ACT gets full cards, WATCH gets compact cards, NOTED gets one line —
      // the same detail-scales-with-tier asymmetry gainers-signal has always
      // had, now enforced by the renderer instead of by the model remembering.
      const body =
        t === 'NOTED'
          ? `<div style="background:#fff;border:1px solid #eaecf0;border-radius:8px;padding:12px 14px;">${notedLineHtml(sorted)}</div>`
          : sorted.map((it) => scanSignalCardHtml(it, { compact: t === 'WATCH' })).join('');
      return `
      <div style="margin-bottom:28px;">
        <div style="border-bottom:2px solid ${meta.border};padding-bottom:6px;margin-bottom:12px;">
          <span style="font-size:15px;font-weight:700;color:${meta.color};text-transform:uppercase;">${meta.icon} ${esc(meta.label)}</span>
          <span style="font-size:12px;font-weight:600;color:${meta.color};background:${meta.bg};border:1px solid ${meta.border};border-radius:999px;padding:2px 10px;margin-left:8px;">${groups[t].length}</span>
        </div>
        ${body}
      </div>`;
    })
    .join('');

  const leadHtml = lead
    ? `<div style="background:#fff;border:1px solid #eaecf0;border-left:4px solid #3a85c9;border-radius:0 8px 8px 0;padding:13px 16px;margin-bottom:24px;font-size:13.5px;line-height:1.6;color:#344054;">${highlightFacts(esc(lead))}</div>`
    : '';

  const caveatHtml =
    Array.isArray(caveats) && caveats.length
      ? `<p style="font-size:12px;color:#b54708;background:#fffaeb;border:1px solid #fec84b;border-radius:8px;padding:8px 12px;margin:12px 0 0;">${caveats.map((c) => esc(c)).join('<br/>')}</p>`
      : '';

  return `<!DOCTYPE html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;background:#f9fafb;padding:24px;color:#101828;">
    <h2 style="margin:0 0 4px;">${esc(title)}</h2>
    <p style="color:#667085;font-size:13px;margin:0 0 20px;">${esc(marketDate)} &nbsp;&middot;&nbsp; ${deduped.length} name${deduped.length === 1 ? '' : 's'} &nbsp;&middot;&nbsp; sorted by delivery value</p>
    ${leadHtml}
    ${sections || '<p style="color:#667085;">No signals in this scan today.</p>'}
    ${sectorClusterHtml(clusters)}
    ${streakBoardHtml(streaks)}
    ${buildStatsFooterHtml(stats)}
    ${caveatHtml}
  </body></html>`;
}

// Pictorial run-summary tiles for the scan-signal footer. Same tile component
// as STATS_TILES above — buildStatsFooterHtml concatenates both lists and draws
// whichever keys the caller actually passed, so a scan footer and a digest
// footer are the same code with different stages — different funnel — a scan's funnel is universe -> quality
// filter -> tiers -> researched, not announcements -> insights -> routine.
const SCAN_STATS_TILES = [
  { key: 'universe', icon: '📋', label: 'Universe scanned', color: '#344054' },
  { key: 'qualified', icon: '✅', label: 'Passed filters', color: '#1b5e20' },
  { key: 'act', icon: '🔴', label: 'Act', color: '#b42318' },
  { key: 'watch', icon: '🟡', label: 'Watch', color: '#b54708' },
  { key: 'noted', icon: '⚪', label: 'Noted', color: '#98a2b3' },
  { key: 'researched', icon: '🔬', label: 'Triggers researched', color: '#0c447c' },
  { key: 'epsBriefs', icon: '📈', label: 'EPS theses', color: '#27500a' },
  { key: 'briefCacheHits', icon: '♻️', label: 'Brief cache hits', color: '#667085' },
  { key: 'dedupedFromGainers', icon: '🔁', label: 'Skipped as dupes', color: '#98a2b3' },
];

module.exports = {
  // Primitives — shared by both card modes.
  esc,
  toTitleCase,
  highlightFacts,
  tagPillsHtml,
  epsImpactHtml,
  thesisChainHtml,
  infoClassificationHtml,
  marketDataHtml,
  computeSignalScore,
  signalTierFor,
  signalScoreChipHtml,
  SIGNAL_TIERS,
  buildStatsFooterHtml,
  computeRankScore,
  insightDedupeKey,
  dedupeInsights,
  groupInsightsByCompany,
  // Announcement-digest mode (post-close-scan-insights).
  buildDigestHtml,
  SIG_META,
  SIG_TONE,
  STATS_TILES,
  // Scan-signal mode (gainers-signal, volume-rocketing).
  buildScanSignalEmail,
  scanSignalCardHtml,
  scanMetricsHtml,
  whyHtml,
  epsThesisHtml,
  deliveryValuePctOfMcap,
  sortByDeliveryValue,
  sectorClusterHtml,
  streakBoardHtml,
  TIER_META,
  TIER_TONE,
  LINKAGE_TONE,
  SCAN_STATS_TILES,
  // Gmail cid: icon — every caller rendering a card with a pdfUrl must attach
  // this PNG under this cid (see the constant's own note above).
  EXPAND_ICON_CID,
  EXPAND_ICON_PNG_BASE64,
  TAG_CHIP,
};
