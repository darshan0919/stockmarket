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

/**
 * @param {Object} opts
 * @param {string} opts.subject
 * @param {string} opts.htmlBody
 * @param {string} [opts.to=GMAIL_USER]
 * @param {string} [opts.sender=GMAIL_USER]
 * @param {string} [opts.appPassword] - Defaults to process.env.GOOGLE_APP_PASSWORD.
 * @returns {Promise<{status:'sent',to:string}|{status:'skipped',reason:string}|{status:'error',error:string}>}
 */
async function sendHtmlEmail({
  subject,
  htmlBody,
  to = GMAIL_USER,
  sender = GMAIL_USER,
  appPassword,
} = {}) {
  const pwd = appPassword || process.env.GOOGLE_APP_PASSWORD || '';
  if (!pwd) return { status: 'skipped', reason: 'GOOGLE_APP_PASSWORD not set' };

  let nodemailer;
  try {
    // eslint-disable-next-line global-require
    nodemailer = require('nodemailer');
  } catch {
    return { status: 'skipped', reason: 'nodemailer not installed' };
  }

  try {
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: sender, pass: pwd },
    });
    await transport.sendMail({ from: sender, to, subject, html: htmlBody });
    return { status: 'sent', to };
  } catch (exc) {
    return { status: 'error', error: String(exc && exc.message ? exc.message : exc) };
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
  return String(symbol || '').trim().replace(SERIES_SUFFIX_RE, '');
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

module.exports = { sendHtmlEmail, GMAIL_USER, stockscansUrl, stockscansLink, sanitizeSymbol };
