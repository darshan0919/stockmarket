#!/usr/bin/env node
'use strict';

/**
 * packages/jobs-runtime/scanSignalEmail.js
 *
 * Renders and sends the daily scan-signal email for `gainers-signal` and
 * `volume-rocketing`. One script, both skills — the only thing that differs
 * between them is the title/subject string and which classifier DTO it reads.
 *
 * ── Why this script exists ──────────────────────────────────────────────────
 * Both skills used to have the model hand-write the entire email HTML on every
 * run: ~200 lines of inline-styled markup, from scratch, every morning, twice.
 * That is expensive (a large fraction of each run's output tokens spent
 * retyping markup), slow, and — worst — non-reproducible: two runs produced
 * subtly different emails, and neither matched `post-close-scan-insights`'
 * Thesis Card design that Darshan actually wanted. Rendering markup is pure
 * logic; per `skills/_shared/conventions.md` §17 it belongs in a script.
 *
 * So the split is now clean, and it is the whole point of this file:
 *   - The MODEL writes CONTENT — the lead paragraph, each card's headline,
 *     thesis chain, WHY, linkage call. Judgment, prose, interpretation.
 *   - This SCRIPT writes MARKUP — grouping, sorting, escaping, colouring,
 *     chips, tables, the stats footer, the send.
 *
 * The model hands its content in as `--content <file>`, a plain
 * `{lead, cards: {<companyId>: {...}}}` overlay that gets merged onto the
 * classifier's own DTO. Anything the model doesn't supply for a company simply
 * isn't rendered — a card with no WHY renders the explicit "no discoverable
 * trigger" line, never a silent blank (see whyHtml in lib/thesisCardEmail.js).
 *
 * Commands:
 *   render --insights <dto.json> --content <content.json> --title "..." \
 *          [--stats-file <stats.json>] [--out <path>]
 *   send   --insights <dto.json> --content <content.json> --title "..." \
 *          --subject "..." [--stats-file <stats.json>] [--out <path>]
 *
 * `render` writes the HTML and stops (this is the `email: off` path both
 * skills expose). `send` renders and mails it. Both print a JSON summary on
 * stdout so the calling skill can report counts without re-deriving them.
 */

const fs = require('fs');
const path = require('path');
const { sendHtmlEmail } = require('@stock/cloud-utils');
const { loadEnv, argValue } = require('./lib/env');
const {
  buildScanSignalEmail,
  dedupeInsights,
  sortByDeliveryValue,
  EXPAND_ICON_CID,
  EXPAND_ICON_PNG_BASE64,
} = require('./lib/thesisCardEmail');

/**
 * Merge the model's content overlay onto the classifier's signal records.
 *
 * The classifier owns every FACT (tier, returns, delivery, market cap, streak,
 * cluster membership, novelty, concall). The overlay owns every JUDGMENT
 * (headline, thesisChain, why, epsThesis, linkage, epsImpact,
 * infoClassification). Keeping the merge one-directional — overlay fields
 * layered on top, never replacing a computed fact — means the model cannot
 * accidentally contradict a number the script already resolved, which is the
 * failure mode that makes a signal report untrustworthy. If a run's overlay
 * claimed a different delivery figure than the scanner measured, the scanner
 * wins and nobody has to notice.
 */
function mergeContent(signals, content) {
  const cards = (content && content.cards) || {};
  return signals.map((s) => {
    const key = s.companyId || s.ticker;
    const overlay = cards[key] || cards[s.ticker] || {};
    // Explicit allow-list rather than a blind spread: it documents exactly
    // which fields are the model's to write, and stops a stray key in a
    // hand-edited overlay from silently overwriting a computed fact.
    const {
      headline,
      thesisChain,
      why,
      epsThesis,
      epsImpact,
      linkage,
      infoClassification,
      tags,
      pdfUrl,
      subLinks,
    } = overlay;
    return {
      ...s,
      companyId: key,
      ...(headline !== undefined && { headline }),
      ...(thesisChain !== undefined && { thesisChain }),
      ...(why !== undefined && { why }),
      ...(epsThesis !== undefined && { epsThesis }),
      ...(epsImpact !== undefined && { epsImpact }),
      ...(linkage !== undefined && { linkage }),
      ...(infoClassification !== undefined && { infoClassification }),
      ...(tags !== undefined && { tags }),
      ...(pdfUrl !== undefined && { pdfUrl }),
      ...(subLinks !== undefined && { subLinks }),
    };
  });
}

function loadJson(p, what) {
  if (!p) throw new Error(`${what} is required`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function buildHtml(argv) {
  const dto = loadJson(argValue('--insights', argv), '--insights');
  const contentPath = argValue('--content', argv);
  // The content overlay is OPTIONAL on purpose. A run that fails partway
  // through its research step should still be able to send a facts-only email
  // (tiers, delivery, market cap, streaks, clusters) rather than sending
  // nothing at all — a briefing with honest blanks beats silence at 8 AM.
  const content = contentPath ? loadJson(contentPath, '--content') : {};

  const statsFile = argValue('--stats-file', argv);
  const stats = statsFile ? loadJson(statsFile, '--stats-file') : null;

  // Only names the classifier marked in_email get cards; NOTED is already
  // collapsed to a one-line list by the renderer, and anything the classifier
  // excluded was excluded for a reason this script should not second-guess.
  const all = dedupeInsights(dto.signals || []);
  const merged = sortByDeliveryValue(mergeContent(all, content));

  const html = buildScanSignalEmail(merged, {
    title: argValue('--title', argv) || 'Scan Signal',
    marketDate: dto.market_date || '',
    lead: content.lead || '',
    clusters: dto.sector_clusters || null,
    streaks: dto.streaks || null,
    stats,
    caveats: content.caveats || dto.caveats || [],
  });

  return { html, dto, merged };
}

function writeOut(argv, html, dto) {
  const out =
    argValue('--out', argv) ||
    path.join(
      process.env.TMPDIR || '/tmp',
      `scan_signal_${String(dto.market_date || '').replace(/-/g, '')}.html`
    );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return out;
}

function summarise(merged, dto, extra = {}) {
  const counts = merged.reduce((acc, s) => {
    const t = String(s.tier || 'NOTED').toUpperCase();
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});
  const withWhy = merged.filter(
    (s) =>
      s.why &&
      (typeof s.why === 'string' ? s.why : s.why.text) &&
      (s.why.basis || 'filing') !== 'none'
  ).length;
  return {
    market_date: dto.market_date,
    names: merged.length,
    tiers: counts,
    // Reported every run so the WHY-coverage problem this refactor exists to
    // fix stays measurable rather than anecdotal: if this number drifts back
    // down toward zero, the resolution ladder has regressed and the run report
    // will say so before Darshan has to notice it in the inbox.
    with_why: withWhy,
    why_coverage_pct: merged.length ? Math.round((withWhy / merged.length) * 100) : 0,
    with_eps_thesis: merged.filter((s) => s.epsThesis).length,
    ...extra,
  };
}

function cmdRender(argv) {
  const { html, dto, merged } = buildHtml(argv);
  const out = writeOut(argv, html, dto);
  process.stdout.write(
    JSON.stringify({ status: 'rendered', html: out, ...summarise(merged, dto) }, null, 2) + '\n'
  );
}

async function cmdSend(argv) {
  // emailService.js reads GOOGLE_APP_PASSWORD from process.env but does NOT
  // load .env itself — without this call the send always reports
  // "skipped: GOOGLE_APP_PASSWORD not set" even though the key is present.
  // Same trap gainers-signal's SKILL.md has warned about since the first run.
  loadEnv(argValue('--env-file', argv));
  const { html, dto, merged } = buildHtml(argv);
  const out = writeOut(argv, html, dto);

  const subject =
    argValue('--subject', argv) ||
    `${argValue('--title', argv) || 'Scan Signal'} — ${dto.market_date || ''}`;

  // cid-attach the expand icon only when a card actually references it, so an
  // email with no filings doesn't carry a dangling unused attachment.
  const needsIcon = merged.some((s) => s.pdfUrl);
  const attachments = needsIcon
    ? [
        {
          filename: 'expand-icon.png',
          content: Buffer.from(EXPAND_ICON_PNG_BASE64, 'base64'),
          contentType: 'image/png',
          cid: EXPAND_ICON_CID,
        },
      ]
    : undefined;

  const result = await sendHtmlEmail({ subject, htmlBody: html, attachments });
  process.stdout.write(
    JSON.stringify(
      { status: result.status || 'sent', subject, html: out, ...summarise(merged, dto) },
      null,
      2
    ) + '\n'
  );
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const commands = { render: cmdRender, send: cmdSend };
  const fn = commands[cmd];
  if (!fn) {
    process.stderr.write(`Usage: scanSignalEmail.js <${Object.keys(commands).join('|')}> [args]\n`);
    process.exit(1);
  }
  await fn(rest);
}

module.exports = { mergeContent, buildHtml, summarise };

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
    process.exit(1);
  });
}
