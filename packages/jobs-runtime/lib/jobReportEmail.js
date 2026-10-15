'use strict';

/**
 * jobReportEmail (lib) — pure render of a scheduled job's run report into an
 * HTML email. No I/O, no LLM. Used by `jobReportEmail.js` (`yarn job-report-email`),
 * the generic "every job must email its output" delivery step for jobs that have
 * no purpose-built digest of their own.
 */

const STATUS = {
  ok: { icon: '✅', label: 'OK', color: '#1b7f3b' },
  partial: { icon: '⚠️', label: 'PARTIAL', color: '#b26a00' },
  failed: { icon: '❌', label: 'FAILED', color: '#b3261e' },
};

/** @param {unknown} s */
function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

/** Inline markdown on already-escaped text: **bold**, `code`, [label](url). */
function inline(escaped) {
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code style="background:#f2f2f2;padding:0 3px">$1</code>')
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" style="color:#0969da;text-decoration:none">$1</a>'
    );
}

const isRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isSep = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
const cells = (l) =>
  l
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

/**
 * Convert a small markdown subset (#/##/### headings, - bullets, | tables |,
 * ``` fences, **bold**, `code`, paragraphs) to email-safe HTML. Input is
 * HTML-escaped first, so agent/script output can never inject markup.
 * @param {string} md
 * @returns {string}
 */
function markdownToHtml(md) {
  const lines = String(md == null ? '' : md).split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(
        `<pre style="background:#f6f8fa;padding:8px;overflow:auto;font-size:12px">${esc(buf.join('\n'))}</pre>`
      );
    } else if (isRow(line)) {
      const rows = [];
      while (i < lines.length && isRow(lines[i])) rows.push(lines[i++]);
      const body = rows.filter((r) => !isSep(r));
      const hasHeader = rows.length > 1 && isSep(rows[1]);
      const tr = (r, tag) =>
        `<tr>${cells(r)
          .map(
            (c) =>
              `<${tag} style="border:1px solid #ddd;padding:4px 8px;text-align:left">${inline(esc(c))}</${tag}>`
          )
          .join('')}</tr>`;
      out.push(
        `<table style="border-collapse:collapse;font-size:13px;margin:8px 0">${body
          .map((r, k) => tr(r, hasHeader && k === 0 ? 'th' : 'td'))
          .join('')}</table>`
      );
    } else if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]))
        items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      out.push(`<ul>${items.map((t) => `<li>${inline(esc(t))}</li>`).join('')}</ul>`);
    } else if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      out.push(
        `<h${level + 1} style="margin:14px 0 6px">${inline(esc(line.replace(/^#+\s+/, '')))}</h${level + 1}>`
      );
      i++;
    } else if (line.trim() === '') {
      i++;
    } else {
      const buf = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !isRow(lines[i]) &&
        !/^\s*[-*]\s+|^#{1,3}\s+|^```/.test(lines[i])
      )
        buf.push(lines[i++]);
      out.push(`<p style="margin:6px 0">${inline(esc(buf.join('\n'))).replace(/\n/g, '<br>')}</p>`);
    }
  }
  return out.join('\n');
}

/**
 * Build the subject + HTML for a job run report.
 * @param {{job:string, status?:'ok'|'partial'|'failed', title?:string, body?:string, date?:string, attachmentNames?:string[]}} o
 * @returns {{subject:string, html:string}}
 */
function buildJobReport({ job, status = 'ok', title, body, date, attachmentNames = [] } = {}) {
  if (!job) throw new Error('buildJobReport: job is required');
  const st = STATUS[status];
  if (!st) throw new Error(`buildJobReport: invalid status "${status}" (ok|partial|failed)`);
  const day = date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const subject = `${st.icon} ${job}${title ? ` — ${title}` : ''} (${day})`;
  const content = String(body == null ? '' : body).trim();
  const att = attachmentNames.length
    ? `<p style="color:#555;font-size:12px">Attached: ${attachmentNames.map(esc).join(', ')}</p>`
    : '';
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;max-width:720px">` +
    `<h2 style="margin:0 0 4px">${esc(job)} <span style="color:${st.color};font-size:14px">${st.label}</span></h2>` +
    `<div style="color:#555;font-size:12px;margin-bottom:10px">${esc(title || '')} ${esc(day)}</div>` +
    (content ? markdownToHtml(content) : '<p><i>Job finished with no report text.</i></p>') +
    att +
    `</div>`;
  return { subject, html };
}

module.exports = { buildJobReport, markdownToHtml, esc, STATUS };
