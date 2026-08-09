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
 *                only adds judgment/prose. Shape:
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
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function fmtX(v) {
  return v == null ? '—' : `${v.toFixed(2)}x`;
}

const TIER_COLOR = {
  STRONG: '#1b5e20',
  MODERATE: '#e65100',
  WEAK: '#b71c1c',
  POOR: '#616161',
};

function tierChip(tier) {
  const color = TIER_COLOR[tier] || '#616161';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;font-weight:bold;color:#fff;background:${color}">${esc(
    tier || '—'
  )}</span>`;
}

function top3Card(rec, narrative) {
  const n = narrative || {};
  // n.drhpReportUrl is written by the skill as a local repo-relative path
  // (e.g. "data/drhp-ipo-analysis/<Company>_Output.pdf"). That path is only
  // meaningful on the machine that ran the skill, so resolve it to the
  // Drive-shareable URL that `node scripts/data.js push` recorded — never
  // email a bare local path, the recipient can't open it.
  const drhpDriveUrl = n.drhpReportUrl ? resolveDriveUrl(n.drhpReportUrl) : null;
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;border:1px solid #c5cae9;border-radius:4px;overflow:hidden">
    <tr><td style="background:#e8eaf6;padding:10px 14px">
      <span style="font-family:Arial,sans-serif;font-size:15px;font-weight:bold;color:#1a237e">#${rec.rank} — <a href="${esc(
        rec.reviewUrl || rec.detailUrl
      )}" style="color:#1a237e;text-decoration:none">${esc(rec.companyName)}</a></span>
      &nbsp; ${tierChip(rec.listingTier || rec.subscriptionQualityTier)}
      &nbsp; <span style="font-family:Arial,sans-serif;font-size:12px;color:#3949ab">${esc(
        rec.ipoType
      )} · ${esc(rec.exchange)} · lists ${esc(rec.listingDate)}</span>
    </td></tr>
    <tr><td style="padding:10px 14px;font-family:Arial,sans-serif;font-size:13px;color:#212121">
      <b>Listing score:</b> ${rec.listingScore ?? rec.subscriptionQualityScore ?? '—'} &nbsp;|&nbsp;
      <b>CAGR score:</b> ${rec.cagrScore ?? '—'} ${tierChip(rec.cagrTier)}${
        rec.cagrConfidence === 'LOW'
          ? ' <span style="color:#b71c1c;font-size:11px">(low confidence — small/SME issue)</span>'
          : ''
      } &nbsp;|&nbsp;
      <b>Total:</b> ${fmtX(rec.totalSubscriptionX)} &nbsp;
      <b>QIB:</b> ${fmtX(rec.qibX)} &nbsp;
      <b>sHNI:</b> ${fmtX(rec.sHniX)} &nbsp;
      <b>bHNI:</b> ${fmtX(rec.bHniX)} &nbsp;
      <b>NII:</b> ${fmtX(rec.niiX)} &nbsp;
      <b>RII:</b> ${fmtX(rec.riiX)} &nbsp;
      <b>Anchor:</b> ${rec.anchorParticipated ? 'Yes' : 'No'}
      ${
        n.rationale
          ? `<div style="margin-top:8px">${esc(n.rationale)}</div>`
          : '<div style="margin-top:8px;color:#757575">Ranking narrative pending.</div>'
      }
      <div style="margin-top:8px">
        ${n.subscriptionView ? `<b>View:</b> ${esc(n.subscriptionView)} &nbsp;` : ''}
        <a href="${esc(rec.reviewUrl || rec.detailUrl)}" style="color:#3949ab">IPOPlatform review</a>
        ${rec.drhpLink ? ` &nbsp;·&nbsp; <a href="${esc(rec.drhpLink)}" style="color:#3949ab">RHP/Prospectus</a>` : ''}
        ${
          drhpDriveUrl
            ? ` &nbsp;·&nbsp; <a href="${esc(drhpDriveUrl)}" style="color:#3949ab;font-weight:bold">Full DRHP/RHP analysis (PDF)</a>`
            : n.drhpReportUrl
              ? ` &nbsp;·&nbsp; <span style="color:#b71c1c;font-size:11px">DRHP/RHP analysis PDF pending Drive sync</span>`
              : ''
        }
      </div>
    </td></tr>
  </table>`;
}

function fullTableRow(rec) {
  return `<tr>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px">${rec.rank}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px"><a href="${esc(
      rec.reviewUrl || rec.detailUrl
    )}" style="color:#1a237e">${esc(rec.companyName)}</a></td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px">${esc(rec.ipoType)}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px">${esc(rec.exchange)}</td>
    <td style="border-bottom:1px solid #e0e0e0;padding:4px 6px">${esc(rec.listingDate)}</td>
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

function renderHtml(dto, narrative) {
  const n = narrative || {};
  const byId = n.byIpoId || {};
  const top3 = dto.top3 || [];
  const headCols = [
    'Rank', 'Company', 'Type', 'Exchange', 'Listing', 'Total', 'QIB', 'sHNI', 'bHNI', 'NII', 'RII',
    'Listing Score', 'Listing Tier', 'CAGR Score', 'CAGR Tier', 'Combined (0.7L+0.3C)',
  ];

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
    top3.length
      ? `<h3 style="color:#1a237e;margin:18px 0 8px">Top ${top3.length} by subscription quality</h3>` +
        top3.map((rec) => top3Card(rec, byId[rec.ipoId])).join('')
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
                  ['Total', 'QIB', 'sHNI', 'bHNI', 'NII', 'RII', 'Listing Score', 'CAGR Score', 'Combined (0.7L+0.3C)'].includes(h)
                    ? ';text-align:right'
                    : ''
                }">${h}</th>`
            )
            .join('')}</tr>
          ${dto.ranked.map(fullTableRow).join('')}
        </table>`
      : ''
  }
  <div style="margin-top:20px;font-size:11px;color:#9e9e9e">
    Source: ipoplatform.com (closed IPOs + live subscription status) — cross-verified
    against Chittorgarh.com's published methodology (same data pipeline; both correctly
    exclude Anchor and Market Maker allocations from NII/HNI/Total denominators). NSE's
    own per-IPO data is used only as a secondary/fallback source, never for this daily
    ranking. See references/ipo_data_sources.md if these numbers ever look inconsistent
    with another IPO-tracking site. Two scores per IPO: Listing Score (predicts
    listing-day gain) and CAGR Score (predicts longer-run daily-CAGR performance) — both
    empirically weighted on a merged IPOPlatform+NSE+BSE historical sample (837 IPOs, see
    ipoWeightFinder.js). Top-3 chosen on Combined Score = Listing Score × 0.7 + CAGR Score
    × 0.3 (listing gain is the stronger, better-validated signal, so it dominates the
    blend). Scoring formula:
    skills/equity-research/ipo-subscription-ranker/references/ipo_ranking_framework.md
    and references/ipo_data_sources.md.
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
    console.error('Usage: ipoDigestEmail.js --dto <path> [--narrative <path>] [--to email] [--dry-run] [--out <html-path>]');
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
    const universeLabel = dto.top3 && dto.top3.length ? ` — top pick: ${dto.top3[0].companyName}` : '';
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
