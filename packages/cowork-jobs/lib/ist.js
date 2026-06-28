'use strict';

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Date shifted into IST wall-clock (as a UTC-field Date for formatting). */
function istDate(date = new Date()) {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

/** ISO-8601 with +05:30 offset, e.g. "2026-06-27T20:01:52+05:30". */
function nowIstIso(date = new Date()) {
  return `${istDate(date).toISOString().slice(0, 19)}+05:30`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "27 Jun 2026 08:01 PM IST" (Python: "%d %b %Y %I:%M %p IST"). */
function nowIstHuman(date = new Date()) {
  const d = istDate(date);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const mon = MONTHS[d.getUTCMonth()];
  const yr = d.getUTCFullYear();
  let h = d.getUTCHours();
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${day} ${mon} ${yr} ${String(h).padStart(2, '0')}:${min} ${ampm} IST`;
}

/** "27 Jun 2026" (Python: "%d %b %Y"). */
function nowIstDate(date = new Date()) {
  const d = istDate(date);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** File-name timestamp "dd-mm-yy_hh-mm-ss_AM/PM" IST. */
function notesTimestamp(date = new Date()) {
  const d = istDate(date);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  let h = d.getUTCHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const hh = String(h).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${dd}-${mm}-${yy}_${hh}-${min}-${ss}_${ampm}`;
}

/** YYYYMMDD in IST (validation log naming). */
function istYmd(date = new Date()) {
  const d = istDate(date);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Quarter-end YYYYMM for Indian financial quarters (Apr–Jun→06, Jul–Sep→09,
 * Oct–Dec→12, Jan–Mar→03), based on IST month.
 */
function quarterDate(date = new Date()) {
  const d = istDate(date);
  const m = d.getUTCMonth() + 1;
  const y = d.getUTCFullYear();
  const qend = m >= 4 && m <= 6 ? 6 : m >= 7 && m <= 9 ? 9 : m >= 10 ? 12 : 3;
  return `${y}${String(qend).padStart(2, '0')}`;
}

/**
 * Parse a createdAt string → epoch ms. Naive (tz-less) values are treated as IST.
 * Returns null on failure.
 */
function parseCreatedAtMs(value) {
  if (!value) return null;
  let s = String(value).replace('Z', '+00:00');
  const hasTz = /[+-]\d{2}:\d{2}$/.test(s);
  if (!hasTz) s += '+05:30';
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

module.exports = {
  IST_OFFSET_MS,
  istDate,
  nowIstIso,
  nowIstHuman,
  nowIstDate,
  notesTimestamp,
  istYmd,
  quarterDate,
  parseCreatedAtMs,
};
