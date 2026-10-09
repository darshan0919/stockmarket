'use strict';

/** Pure formatting for the signal-ledger digest (transitions only; silence when none). */

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );

/**
 * @param {Object[]} transitions `signal_transition` events
 * @param {Object[]} activeStates current signal-state records (active only)
 * @returns {{subject:string,html:string}|null} null when there is nothing to report
 */
function formatDigest(transitions, activeStates, { label } = {}) {
  if (!transitions.length) return null;
  const rows = [...transitions]
    .sort((a, b) => (a.date + a.signalId).localeCompare(b.date + b.signalId))
    .map(
      (t) =>
        `<tr><td>${esc(t.date)}</td><td>${esc(t.signalId)}</td><td>${esc(t.entityType)}:${esc(t.entityId)}</td>` +
        `<td>${esc(t.from || 'none')} &rarr; <b>${esc(t.to)}</b></td><td>${esc(JSON.stringify(t.evidence || {}).slice(0, 300))}</td></tr>`
    )
    .join('');
  const active = activeStates
    .map((s) => `${esc(s.signalId)} (${esc(s.entityId)}) since ${esc(s.since)}`)
    .join('; ');
  const html =
    `<div style="font:13px Arial"><h3>Signal changes ${esc(label || '')}</h3>` +
    `<table cellpadding="6" border="1" style="border-collapse:collapse"><tr><th>Date</th><th>Signal</th><th>Entity</th><th>Change</th><th>Evidence</th></tr>${rows}</table>` +
    `<p><b>Active now:</b> ${active || 'none'}</p>` +
    `<p style="color:#888">Thresholds are single-author claims from tweets, not calibrated.</p></div>`;
  return { subject: `Signal changes ${label || ''} (${transitions.length})`.trim(), html };
}

module.exports = { formatDigest };
