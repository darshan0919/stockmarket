'use strict';

/**
 * Shared Gmail email utility (port of email_service.py).
 *
 * nodemailer is an optional dependency and lazy-loaded, so this module imports
 * cleanly even when it isn't installed (jobs that don't email, and tests, still
 * work). If the app password or nodemailer is missing, sending is skipped with a
 * reason rather than throwing — matching the Python contract.
 */

const GMAIL_USER = 'djplearner@gmail.com';

const apiUsageCounter = require('./apiUsageCounter');
const deliveryUsageCounter = require('./deliveryUsageCounter');

/**
 * @typedef {Object} EmailAttachment
 * @property {string} [filename] - Attachment filename (cosmetic for cid-referenced inline images).
 * @property {Buffer|string} content - Raw content (Buffer for binary, e.g. image bytes).
 * @property {string} [contentType] - MIME type, e.g. 'image/png'.
 * @property {string} [cid] - Content-ID: reference it in htmlBody as `<img src="cid:THIS_VALUE">`.
 *   Gmail's inbound HTML sanitizer strips `data:` URIs from `<img src>` entirely (confirmed
 *   2026-08-27 — a base64 PNG/SVG data-URI icon silently lost its `src` attribute in the
 *   actual rendered inbox even though it worked in every local HTML render). A `cid:`
 *   reference to a real MIME attachment is the only reliable way to inline a small icon
 *   without hosting it externally. See https://nodemailer.com/message/attachments/ (cid).
 */

/**
 * Escape text for safe inclusion inside an HTML attribute/body (footer table
 * cells). Minimal — only what a job name / API label / number ever needs.
 */
function _escFooter(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

/**
 * Append a compact "API calls this run" table to an email's HTML body, sourced
 * from the current process's apiUsageCounter (see ./apiUsageCounter.js and
 * packages/jobs-runtime/lib/apiUsageTracker.js). Wired into sendHtmlEmail via
 * its `jobName` option — the one choke point all 18+ digest emails already go
 * through, so a script only needs to pass its own resolved job name on the
 * `sendHtmlEmail({ ..., jobName })` call it already makes, no per-email-HTML-
 * builder change needed. Attribution is JOB-level (a jobs/Scheduled/<name>
 * directory), not skill-level — see apiUsageCounter.js's header for why.
 *
 * `jobName` is an EXPLICIT argument, not read from any shared/global state —
 * see apiUsageCounter.js's header for why an ambient "active job" was
 * removed. No-ops (returns htmlBody unchanged) if `jobName` is falsy, or if
 * that job made zero calls this process.
 *
 * @param {string} htmlBody
 * @param {string} [jobName]
 */
function appendApiUsageFooter(htmlBody, jobName) {
  if (!jobName) return htmlBody;
  const summary = apiUsageCounter.getSummary(jobName);
  if (summary.total === 0) return htmlBody;

  const rows = Object.entries(summary.byApi)
    .sort((a, b) => b[1].count - a[1].count)
    .map(
      ([api, s]) =>
        `<tr><td style="padding:2px 10px 2px 0;">${_escFooter(api)}</td>` +
        `<td style="padding:2px 10px;text-align:right;">${_escFooter(s.count)}</td>` +
        `<td style="padding:2px 0;text-align:right;color:${s.failed ? '#b91c1c' : '#6b7280'};">${
          s.failed ? `${_escFooter(s.failed)} failed` : ''
        }</td></tr>`
    )
    .join('');

  const footer =
    `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;` +
    `font-family:monospace,ui-monospace;font-size:11px;color:#6b7280;">` +
    `<div style="margin-bottom:4px;">API usage — ${_escFooter(summary.job)} ` +
    `(${_escFooter(summary.total)} call${summary.total === 1 ? '' : 's'})</div>` +
    `<table style="border-collapse:collapse;">${rows}</table></div>`;

  if (typeof htmlBody === 'string' && /<\/body>/i.test(htmlBody)) {
    return htmlBody.replace(/<\/body>/i, `${footer}</body>`);
  }
  return `${htmlBody || ''}${footer}`;
}

/**
 * @param {Object} opts
 * @param {string} opts.subject
 * @param {string} opts.htmlBody
 * @param {string} [opts.to=GMAIL_USER]
 * @param {string} [opts.sender=GMAIL_USER]
 * @param {string} [opts.appPassword] - Defaults to process.env.GOOGLE_APP_PASSWORD.
 * @param {EmailAttachment[]} [opts.attachments] - Passed through to nodemailer as-is;
 *   use `cid` entries for images referenced inline in htmlBody (see EmailAttachment).
 * @param {string} [opts.jobName] - The scheduled job (jobs/Scheduled/<name>) sending this
 *   email, if any — passed straight through to appendApiUsageFooter so the footer shows
 *   THIS job's own API-usage summary (an explicit argument, never ambient/global state —
 *   see apiUsageCounter.js's header). Omit for an email with nothing to audit.
 * @returns {Promise<{status:'sent',to:string}|{status:'skipped',reason:string}|{status:'error',error:string}>}
 */
async function sendHtmlEmail({
  subject,
  htmlBody,
  to = GMAIL_USER,
  sender = GMAIL_USER,
  appPassword,
  attachments,
  jobName,
} = {}) {
  const pwd = appPassword || process.env.GOOGLE_APP_PASSWORD || '';
  if (!pwd) {
    deliveryUsageCounter.record(jobName, { status: 'skipped', reason: 'GOOGLE_APP_PASSWORD not set' });
    return { status: 'skipped', reason: 'GOOGLE_APP_PASSWORD not set' };
  }

  let nodemailer;
  try {
    // eslint-disable-next-line global-require
    nodemailer = require('nodemailer');
  } catch {
    deliveryUsageCounter.record(jobName, { status: 'skipped', reason: 'nodemailer not installed' });
    return { status: 'skipped', reason: 'nodemailer not installed' };
  }

  const bodyWithFooter = appendApiUsageFooter(htmlBody, jobName);

  try {
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: sender, pass: pwd },
    });
    const mail = { from: sender, to, subject, html: bodyWithFooter };
    if (Array.isArray(attachments) && attachments.length) mail.attachments = attachments;
    await transport.sendMail(mail);
    deliveryUsageCounter.record(jobName, { status: 'sent' });
    return { status: 'sent', to };
  } catch (exc) {
    const errorMessage = String(exc && exc.message ? exc.message : exc);
    deliveryUsageCounter.record(jobName, { status: 'error', reason: errorMessage });
    return { status: 'error', error: errorMessage };
  }
}

// NSE/BSE trading-series suffixes (Book Entry, SME platform, trade-for-trade
// groups, etc.) sometimes appended to a symbol with a dash by raw feed data
// — e.g. "SOMECO-BE". Stockscans company URLs (and every other lookup in
// this repo) key on the bare symbol, so an unstripped suffix produces a
// dead/wrong link. Canonical source: `stock-api/src/utils/companyId.js`
// (`sanitizeCompanyId`) — cloud-utils can't depend on @stock/api (stock-api
// depends on cloud-utils, so that would be circular), so this list is
// duplicated here on purpose. Keep both in sync if the suffix list changes.
const KNOWN_SERIES_SUFFIXES = ['BE', 'BZ', 'BL', 'SM', 'ST', 'IL', 'GC', 'BT'];
const SERIES_SUFFIX_RE = new RegExp(`-(?:${KNOWN_SERIES_SUFFIXES.join('|')})$`, 'i');

function sanitizeSymbol(symbol) {
  return String(symbol || '')
    .trim()
    .replace(SERIES_SUFFIX_RE, '');
}

function stockscansUrl(symbol, exchange = 'NSE') {
  if (!symbol) return '';
  const clean = sanitizeSymbol(symbol);
  if (clean.includes(':')) {
    return `https://www.stockscans.in/company/${clean}`;
  }
  return `https://www.stockscans.in/company/${exchange}:${clean}`;
}

function stockscansLink(name, symbol, exchange = 'NSE', color = 'inherit') {
  if (!symbol) return name;
  const safeName = String(name || symbol).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
  return `<a href="${stockscansUrl(symbol, exchange)}" style="text-decoration:none;color:${color}" target="_blank">${safeName}</a>`;
}

module.exports = {
  sendHtmlEmail,
  GMAIL_USER,
  stockscansUrl,
  stockscansLink,
  sanitizeSymbol,
  appendApiUsageFooter,
};
