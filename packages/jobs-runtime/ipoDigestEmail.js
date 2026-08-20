#!/usr/bin/env node
'use strict';

/**
 * ipoDigestEmail.js — renders + sends the daily IPO Subscription digest email.
 * (task: daily-ipo-subscription-analysis-stockmarket, step 2 of 2.)
 *
 * Pure render step (skills/_shared/conventions.md §5, §17): this file makes NO
 * judgment calls. It is a deterministic function of two JSON inputs:
 *
 *   --dto        The DTO printed by ipoSubscriptionScanner.js's `scan()` (ranked
 *                IPOs + subscription figures + scores — see that file's header).
 *                Note: this is the flat scan shape (`totalSubscriptionX`, `qibX`,
 *                ... directly on each record), NOT the nested `{subscription:{...}}`
 *                shape `toRecords()` produces for the `ipos` collection — those two
 *                shapes diverge on purpose (collection records are a stored,
 *                slightly reshaped projection) and this renderer only ever reads
 *                the former.
 *   --narrative  Optional. LLM-authored commentary the ipo-subscription-ranker
 *                skill writes AFTER reading the DTO — never re-derives numbers,
 *                only adds judgment/prose. REQUIRED shape (this is the only
 *                shape this file reads — see `normalizeNarrative()` below,
 *                which is the single, strict parsing chokepoint):
 *                {
 *                  "modelUsed": "claude-sonnet-5",
 *                  "rankingSummary": "1-3 sentence read on today's batch",
 *                  "byIpoId": {
 *                    "<ipoId>": {
 *                      "rationale": "why this IPO ranks where it does",
 *                      "subscriptionView": "STRONG|MODERATE|WEAK|POOR (or a
 *                        BUY/ACCUMULATE/HOLD/REDUCE/AVOID once drhp-ipo-analysis
 *                        has run for a top-3 name)",
 *                      "drhpReportUrl": "the LOCAL repo-relative path to the
 *                        rendered drhp-ipo-analysis PDF (e.g.
 *                        'data/drhp-ipo-analysis/<Company>_Output.pdf'), if
 *                        the skill ran it (top 3 only). Write the local path
 *                        here, NOT a Drive URL — this file resolves it to the
 *                        Drive-shareable link itself via
 *                        `db.resolveDriveUrl()`, which reads the driveId that
 *                        `node scripts/data.js push` recorded in
 *                        `_meta/sync-state.json` for that exact path. This
 *                        means Phase 5 (data:push) MUST run BEFORE Phase 4
 *                        (this script) for the email to contain a working
 *                        link — see ipo-subscription-ranker/SKILL.md's phase
 *                        order. If the path hasn't been pushed yet,
 *                        resolveDriveUrl() returns null and the email shows a
 *                        'pending Drive sync' note instead of a dead link."
 *                    }
 *                  }
 *                }
 *                Missing/absent narrative is fine — the email still ships with
 *                just the data table (never block sending on the LLM step).
 *
 *                COMMON MISTAKE (bug fixed 2026-08-11, see git history): a
 *                caller writes `narrative.top3` as a flat array of
 *                `{ipoId, rationale, drhpReportUrl, ...}` objects instead of
 *                the keyed `byIpoId` object above — this file used to read
 *                `n.byIpoId[rec.ipoId]` directly and silently got `undefined`
 *                for every IPO when that happened, so the rationale AND the
 *                DRHP PDF link both went missing from the email with zero
 *                error or warning. `normalizeNarrative()` now defends against
 *                exactly this: if `byIpoId` is absent but `top3`/`ranked` is a
 *                flat array carrying `ipoId`, it re-keys that array into
 *                `byIpoId` automatically AND prints a stderr warning so the
 *                shape mismatch is visible in the run log even though the
 *                email itself still renders correctly either way.
 *
 * Usage:
 *   node ipoDigestEmail.js --dto <path> [--narrative <path>] [--to email]
 *                           [--dry-run] [--out <html-path>]
 */

const fs = require('fs');
const path = require('path');
const { sendHtmlEmail, GMAIL_USER } = require('@stock/cloud-utils');
const { loadEnv } = require('./lib/env');
const { resolveDriveUrl } = require('./lib/db');

function argValue(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  return i === -1 ? fallback : argv[i + 1];
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function fmtX(v) {
  return v == null ? '—' : `${v.toFixed(2)}x`;
}

function fmtScore(v) {
  return v == null ? '—' : v.toFixed(3);
}

// Palette per skills/_shared/pdf-design-guide.md — flat institutional tones,
// reused here (as inline styles, since email clients don't reliably support
// <style> blocks) rather than the ad-hoc indigo scheme this card used before.
const PDF_TONE = {
  g: { bg: '#eaf3de', fg: '#27500a', border: '#a9cf8a' }, // green — confirmed/positive
  r: { bg: '#fcebeb', fg: '#791f1f', border: '#ecaaa9' }, // red — highest materiality
  y: { bg: '#faeeda', fg: '#633806', border: '#eec27e' }, // amber — caveat/watchlist
  b: { bg: '#e6f1fb', fg: '#0c447c', border: '#a7cdec' }, // blue — informational
};

// STRONG is the ceiling tier — no better label exists above it — so map it to
// green; MODERATE/WEAK/POOR step down through amber to red per the guide's
// signal-tone table (never invent a 5th ad-hoc color for a 4-tier scale).
const TIER_TONE = { STRONG: 'g', MODERATE: 'y', WEAK: 'y', POOR: 'r' };

function chip(text, tone) {
  const t = PDF_TONE[tone] || PDF_TONE.b;
  return `<span style="display:inline-block;font-family:monospace;font-size:9px;font-weight:600;letter-spacing:0.02em;padding:2.5px 7px;border-radius:3px;background:${t.bg};color:${t.fg}">${esc(
    text
  )}</span>`;
}

function tierChip(tier) {
  return chip(tier || '—', TIER_TONE[tier] || 'b');
}

// Small field/value stat cell — mono uppercase label over the value, matching
// the `.kpi`/`.label`/`.bignum` pattern in pdf-design-guide.md so the card
// reads as a compact stat grid instead of a run-on line of bolded labels.
function statCell(label, value, opts = {}) {
  const valueStyle = opts.mono !== false ? 'font-family:monospace' : '';
  return `<td style="padding:6px 10px;background:#f5f4f0;vertical-align:top">
    <div style="font-family:monospace;font-size:8px;text-transform:uppercase;letter-spacing:0.05em;color:#888;margin-bottom:2px">${esc(
      label
    )}</div>
    <div style="font-size:13px;font-weight:600;color:#1a1a1a;${valueStyle}">${value}</div>
  </td>`;
}

function top3Card(rec, narrative) {
  const n = narrative || {};
  // n.drhpReportUrl is written by the skill as a local repo-relative path
  // (e.g. "data/drhp-ipo-analysis/<Company>_Output.pdf"). That path is only
  // meaningful on the machine that ran the skill, so resolve it to the
  // Drive-shareable URL that `node scripts/data.js push` recorded — never
  // email a bare local path, the recipient can't open it.
  const drhpDriveUrl = n.drhpReportUrl ? resolveDriveUrl(n.drhpReportUrl) : null;
  const listingTier = rec.listingTier || rec.subscriptionQualityTier;

  const subChips = [
    ['TOTAL', rec.totalSubscriptionX],
    ['QIB', rec.qibX],
    ['sHNI', rec.sHniX],
    ['bHNI', rec.bHniX],
    ['NII', rec.niiX],
    ['RII', rec.riiX],
  ]
    .map(
      ([label, v]) =>
        `<span style="display:inline-block;margin:2px 6px 2px 0;font-size:11px"><span style="font-family:monospace;font-size:8.5px;text-transform:uppercase;color:#888">${label}</span> <span style="font-family:monospace;font-weight:600">${fmtX(
          v
        )}</span></span>`
    )
    .join('');

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;border:0.5px solid #ccc;border-radius:4px;overflow:hidden;border-collapse:separate">
    <tr><td style="border-bottom:2.5px solid #111;padding:9px 12px">
      <span style="font-family:monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.06em;color:#888">RANK #${
        rec.rank
      } · ${esc(rec.ipoType)} · ${esc(rec.exchange)} · LISTS ${esc(rec.listingDate)}</span><br/>
      <a href="${esc(
        rec.reviewUrl || rec.detailUrl
      )}" style="font-family:Arial,sans-serif;font-size:15px;font-weight:600;color:#111;text-decoration:none">${esc(
        rec.companyName
      )}</a>
      &nbsp; ${tierChip(listingTier)}
      ${n.subscriptionView ? `&nbsp; ${chip(n.subscriptionView, 'b')}` : ''}
    </td></tr>
    <tr><td style="padding:0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <tr>
          ${statCell(
            'Listing score',
            `${fmtScore(rec.listingScore ?? rec.subscriptionQualityScore)} <span style="font-family:Arial,sans-serif;font-weight:400;font-size:10px;color:#666">(≥0.9=STRONG*)</span>`
          )}
          ${statCell('CAGR score', `${fmtScore(rec.cagrScore)} ${tierChip(rec.cagrTier)}`)}
          ${statCell('Anchor participated', rec.anchorParticipated ? chip('YES', 'g') : chip('NO', 'y'), { mono: false })}
        </tr>
      </table>
    </td></tr>
    <tr><td style="padding:9px 12px 4px">${subChips}</td></tr>
    ${
      n.rationale
        ? `<tr><td style="padding:0 12px 9px"><div style="background:#e6f1fb;border-left:3px solid #3a85c9;border-radius:3px;padding:7px 10px;font-family:Arial,sans-serif;font-size:11.5px;line-height:1.5;color:#0a2752">${esc(
            n.rationale
          )}</div></td></tr>`
        : `<tr><td style="padding:0 12px 9px;font-family:Arial,sans-serif;font-size:11px;color:#999">Ranking narrative pending.</td></tr>`
    }
    <tr><td style="padding:0 12px 11px;font-family:Arial,sans-serif;font-size:11px">
      <a href="${esc(rec.reviewUrl || rec.detailUrl)}" style="color:#0c447c">IPOPlatform review</a>
      ${rec.drhpLink ? ` &nbsp;·&nbsp; <a href="${esc(rec.drhpLink)}" style="color:#0c447c">RHP/Prospectus</a>` : ''}
      ${
        drhpDriveUrl
          ? ` &nbsp;·&nbsp; <a href="${esc(drhpDriveUrl)}" style="color:#0c447c;font-weight:700">&#128196; Full DRHP/RHP analysis (PDF)</a>`
          : n.drhpReportUrl
            ? ` &nbsp;·&nbsp; ${chip('DRHP PDF pending Drive sync', 'y')}`
            : ''
      }
    </td></tr>
  </table>`;
}

function fmtCr(v) {
  return v == null ? '—' : `₹${v.toFixed(1)}cr`;
}

function fullTableRow(rec) {
  const retailNote = rec.retailFloatFiltered
    ? ` ${chip('< ₹50cr', 'y')}`
    : rec.retailFloatUnknown
      ? ' <span style="color:#999;font-size:9px">(unk.)</span>'
      : '';
  return `<tr${rec.retailFloatFiltered ? ' style="opacity:0.6"' : ''}>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px">${rec.rank}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px"><a href="${esc(
      rec.reviewUrl || rec.detailUrl
    )}" style="color:#1a237e">${esc(rec.companyName)}</a></td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px">${esc(rec.ipoType)}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px">${esc(rec.exchange)}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px">${esc(rec.listingDate)}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px;text-align:right">${fmtCr(
      rec.retailFloatCr
    )}${retailNote}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px;text-align:right">${fmtX(
      rec.totalSubscriptionX
    )}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px;text-align:right">${fmtX(
      rec.qibX
    )}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px;text-align:right">${fmtX(
      rec.sHniX
    )}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px;text-align:right">${fmtX(
      rec.bHniX
    )}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px;text-align:right">${fmtX(
      rec.niiX
    )}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px;text-align:right">${fmtX(
      rec.riiX
    )}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px;text-align:right">${
      rec.listingScore ?? rec.subscriptionQualityScore ?? '—'
    }</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px">${tierChip(
      rec.listingTier || rec.subscriptionQualityTier
    )}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px;text-align:right">${
      rec.cagrScore ?? '—'
    }${rec.cagrConfidence === 'LOW' ? ' <span style="color:#b71c1c">*</span>' : ''}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px">${tierChip(rec.cagrTier)}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px;text-align:right;font-weight:bold">${
      rec.combinedScore ?? '—'
    }</td>
  </tr>`;
}

/**
 * Strict, single chokepoint for parsing the narrative file — see the module
 * header's "COMMON MISTAKE" note. Callers (this skill's own Phase 3, or a
 * hand-run) are supposed to write `narrative.byIpoId` keyed by ipoId, but a
 * flat `top3`/`ranked` array carrying `ipoId` per entry is an easy mistake to
 * make (it mirrors the scanner DTO's own shape) and previously failed
 * silently — the email shipped with no rationale and no DRHP PDF link and
 * nothing in the logs said why. This function is the only place in the file
 * allowed to read `narrative.byIpoId`/`narrative.top3`/`narrative.ranked`
 * directly; every other function receives the already-normalized per-IPO
 * entry via `byId[ipoId]`.
 */
function normalizeNarrative(narrative) {
  const n = narrative || {};
  if (n.byIpoId && Object.keys(n.byIpoId).length) return n;

  const flatArrays = [n.top3, n.ranked].filter(Array.isArray);
  const byIpoId = {};
  let recovered = 0;
  for (const arr of flatArrays) {
    for (const entry of arr) {
      if (entry && entry.ipoId != null && !byIpoId[entry.ipoId]) {
        byIpoId[entry.ipoId] = entry;
        recovered++;
      }
    }
  }
  if (recovered > 0) {
    console.warn(
      `[ipoDigestEmail] narrative.byIpoId was missing/empty — recovered ${recovered} ` +
        `entr${recovered === 1 ? 'y' : 'ies'} from a flat top3/ranked array instead. This ` +
        `narrative file was written in the wrong shape (see this script's header "COMMON ` +
        `MISTAKE" note) — fix the writer (ipo-subscription-ranker Phase 3) so this warning ` +
        `stops appearing; the recovery here is a safety net, not the intended path.`
    );
    return { ...n, byIpoId };
  }
  if (flatArrays.some((a) => a.length)) {
    console.warn(
      '[ipoDigestEmail] narrative.top3/ranked present but no entries carried a matching ' +
        '`ipoId` field — narrative could not be recovered, email will ship with no ' +
        'per-IPO rationale/DRHP link.'
    );
  }
  return n;
}

function renderHtml(dto, narrative) {
  const n = normalizeNarrative(narrative);
  const byId = n.byIpoId || {};
  const top3 = dto.top3 || [];
  const headCols = [
    'Rank',
    'Company',
    'Type',
    'Exchange',
    'Listing',
    'Retail Float',
    'Total',
    'QIB',
    'sHNI',
    'bHNI',
    'NII',
    'RII',
    'Listing Score',
    'Listing Tier',
    'CAGR Score',
    'CAGR Tier',
    'Combined (0.7L+0.3C)',
  ];
  const retailFloatFilterCr = dto.retailFloatFilterCr ?? 50;

  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f5f5f5">
<div style="max-width:820px;margin:0 auto;padding:16px;font-family:Arial,sans-serif">
  <h2 style="color:#1a237e;margin:0 0 4px">IPO Subscription Digest — ${esc(dto.date)}</h2>
  <div style="color:#616161;font-size:13px;margin-bottom:14px">
    Listing ${esc(dto.listingDateFilter)} · ${dto.universeSize} IPO(s) scanned,
    ${dto.matchedWithSubscription} with subscription data.
  </div>
  ${
    n.rankingSummary
      ? `<div style="background:#fffde7;border-left:3px solid #fbc02d;padding:8px 12px;margin-bottom:16px;font-size:13px">${esc(
          n.rankingSummary
        )}</div>`
      : ''
  }
  ${
    dto.retailFloatExcludedCount > 0
      ? `<div style="background:#faeeda;border-left:3px solid #ef9f27;padding:7px 10px;margin-bottom:14px;font-size:12px;color:#633806">
          ${dto.retailFloatExcludedCount} IPO${dto.retailFloatExcludedCount === 1 ? '' : 's'} excluded from
          Top 3 / DRHP analysis — retail float below the ₹${retailFloatFilterCr}cr threshold (see
          "Retail Float" column in the full list below, marked ${chip('< ₹50cr', 'y')}).
        </div>`
      : ''
  }
  ${
    top3.length
      ? `<h3 style="color:#1a237e;margin:18px 0 8px">Top ${top3.length} by subscription quality</h3>` +
        top3.map((rec) => top3Card(rec, byId[rec.ipoId])).join('')
      : dto.universeSize > 0 && dto.retailFloatExcludedCount >= dto.universeSize
        ? `<div style="color:#757575">All ${dto.universeSize} IPO(s) in today's universe were excluded from Top 3 — retail float below the ₹${retailFloatFilterCr}cr threshold. See the full list below for the scores/multiples anyway.</div>`
        : '<div style="color:#757575">No IPOs listing on the target date matched this run\'s universe.</div>'
  }
  ${
    dto.ranked.length
      ? `<h3 style="color:#1a237e;margin:20px 0 8px">Full list (${dto.ranked.length})</h3>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px">
          <tr style="background:#e8eaf6;text-align:left">${headCols
            .map(
              (h) =>
                `<th style="border-bottom:2px solid #9fa8da;padding:5px 6px${
                  [
                    'Retail Float',
                    'Total',
                    'QIB',
                    'sHNI',
                    'bHNI',
                    'NII',
                    'RII',
                    'Listing Score',
                    'CAGR Score',
                    'Combined (0.7L+0.3C)',
                  ].includes(h)
                    ? ';text-align:right'
                    : ''
                }">${h}</th>`
            )
            .join('')}</tr>
          ${dto.ranked.map(fullTableRow).join('')}
        </table>
        <div style="font-size:10px;color:#999;margin-top:4px">Rows dimmed + tagged ${chip(
          '< ₹50cr',
          'y'
        )} were excluded from Top 3/DRHP analysis on retail-float grounds; "(unk.)" means the retail-share figure could not be scraped for that IPO this run (not excluded, since an unknown float is not assumed to be a small one).</div>`
      : ''
  }
  <div style="margin-top:20px;padding:10px 12px;background:#f5f4f0;border-radius:4px;font-size:11px;color:#444;line-height:1.6">
    <div style="font-family:monospace;font-size:9px;text-transform:uppercase;letter-spacing:0.06em;color:#888;margin-bottom:5px">How to read the scores</div>
    Each IPO gets two scores, both on the <b>same unbounded scale</b> — not a 0-1 or
    0-10 bounded score, but a weighted blend of <code>log10(1+subscription multiple)</code>
    across QIB/sHNI/bHNI/NII/RII/Total (so a 100x QIB print doesn't swamp the score the
    way a raw multiple would), plus a +0.05 bonus if Anchor Investors participated.
    <b>Listing Score</b> predicts listing-day gain; <b>CAGR Score</b> predicts longer-run
    daily-CAGR performance and is the noisier, less discriminating of the two (r 0.12-0.21
    vs 0.21-0.38 for listing gain across an 837-IPO backtest) — treat it as directional,
    not precise. Both are empirically weighted on that same merged
    IPOPlatform+NSE+BSE historical sample (see <code>ipoWeightFinder.js</code>).
    Each score maps to one of 4 tiers — <b>STRONG is the top/best tier, there is no
    tier above it</b>:
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0;border-collapse:collapse;font-size:10.5px">
      <tr>
        <td style="padding:3px 10px 3px 0">${chip('STRONG', 'g')}</td>
        <td style="padding:3px 10px 3px 0">score &ge; 0.90</td>
        <td style="padding:3px 0;color:#666">roughly a well-subscribed blended read, &ge;~7x-equivalent</td>
      </tr>
      <tr>
        <td style="padding:3px 10px 3px 0">${chip('MODERATE', 'y')}</td>
        <td style="padding:3px 10px 3px 0">0.55 &ndash; 0.90</td>
        <td style="padding:3px 0;color:#666">decent but not standout, &asymp;2.5x&ndash;7x-equivalent</td>
      </tr>
      <tr>
        <td style="padding:3px 10px 3px 0">${chip('WEAK', 'y')}</td>
        <td style="padding:3px 10px 3px 0">0.30 &ndash; 0.55</td>
        <td style="padding:3px 0;color:#666">thin coverage, &asymp;1x&ndash;2.5x-equivalent</td>
      </tr>
      <tr>
        <td style="padding:3px 10px 3px 0">${chip('POOR', 'r')}</td>
        <td style="padding:3px 10px 3px 0">&lt; 0.30</td>
        <td style="padding:3px 0;color:#666">under-subscribed on a blended basis</td>
      </tr>
    </table>
    *The "~Nx-equivalent" figures above are a rough single-category sanity-check
    (solving <code>log10(1+x)</code> for the threshold score), not a literal
    subscription multiple — the real score blends 5 weighted categories plus the
    anchor bonus, so an actual IPO's tier depends on its full category mix, not one
    number alone. Full formula + weights + tier thresholds:
    <code>skills/equity-research/ipo-subscription-ranker/references/ipo_ranking_framework.md</code>
    (tier cutoffs live in <code>packages/jobs-runtime/lib/ipoScoring.js</code>'s
    <code>tierFor()</code>). Top-3 selection uses Combined Score = Listing Score &times;
    0.7 + CAGR Score &times; 0.3 (listing gain is the stronger, better-validated signal,
    so it dominates the blend).
  </div>
  <div style="margin-top:10px;font-size:11px;color:#9e9e9e">
    Source: ipoplatform.com (closed IPOs + live subscription status) — cross-verified
    against Chittorgarh.com's published methodology (same data pipeline; both correctly
    exclude Anchor and Market Maker allocations from NII/HNI/Total denominators). NSE's
    own per-IPO data is used only as a secondary/fallback source, never for this daily
    ranking. See references/ipo_data_sources.md if these numbers ever look inconsistent
    with another IPO-tracking site.
    ${n.modelUsed ? `Narrative by ${esc(n.modelUsed)}.` : ''}
  </div>
</div>
</body></html>`;
}

async function main() {
  const argv = process.argv.slice(2);
  // Per skills/_shared/conventions.md §2 (Env Resolution) — secrets (GOOGLE_APP_PASSWORD
  // for sendHtmlEmail) must come from the repo-root .env via lib/env.js, never parsed
  // manually and never assumed to already be in process.env.
  loadEnv(argValue(argv, '--env-file', null));
  const dtoPath = argValue(argv, '--dto');
  const narrativePath = argValue(argv, '--narrative', null);
  const to = argValue(argv, '--to', GMAIL_USER);
  const outPath = argValue(argv, '--out', null);
  const dryRun = argv.includes('--dry-run');

  if (!dtoPath) {
    console.error(
      'Usage: ipoDigestEmail.js --dto <path> [--narrative <path>] [--to email] [--dry-run] [--out <html-path>]'
    );
    process.exit(1);
  }

  const dto = readJson(dtoPath);
  const narrative = narrativePath && fs.existsSync(narrativePath) ? readJson(narrativePath) : null;
  const html = renderHtml(dto, narrative);

  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html);
  }

  let sendResult = { status: 'skipped', reason: 'dry-run' };
  if (!dryRun) {
    const universeLabel =
      dto.top3 && dto.top3.length ? ` — top pick: ${dto.top3[0].companyName}` : '';
    sendResult = await sendHtmlEmail({
      subject: `IPO Subscription Digest ${dto.date} (listing ${dto.listingDateFilter})${universeLabel}`,
      htmlBody: html,
      to,
    });
  }

  console.log(JSON.stringify({ sendResult, htmlLength: html.length, outPath }, null, 2));
}

module.exports = { renderHtml };

if (require.main === module) {
  main().catch((e) => {
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
}
