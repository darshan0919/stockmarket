'use strict';

/**
 * packages/jobs-runtime/lib/noiseKeywordFilter.js
 *
 * Shared "drop + audit-log" wrapper around `announcement-noise-keywords`
 * (`stock-api/src/utils/announcementNoiseFilter.js`'s `matchedNoiseKeyword`)
 * for every jobs-runtime script that fetches a window of announcements and
 * needs to apply Darshan's curated pre-filter BEFORE anything downstream
 * (categorisation, a PDF read, an LLM judgment call) ever sees the item.
 *
 * Extracted 2026-09-17 out of `watchlistInsights.js` (whose `cmdFetchAnnouncements`
 * used to own this inline) once `postCloseScanInsights.js`'s `cmdFilterNoise`
 * needed the identical policy — two scripts independently deciding "does this
 * item survive the noise-keyword gate, and if not, where does the drop get
 * logged" is exactly the duplication `skills/_shared/conventions.md` §17
 * forbids, and `watchlistInsights.js` in particular already backs several
 * unrelated skills (`watchlist-insights`, `announcement-insights`,
 * `gainers-signal`, `volume-rocketing`, `post-close-scan-insights`), so a
 * noise-filtering policy change buried in its 1400+ lines is easy to miss
 * when reasoning about a DIFFERENT script that also needs it.
 *
 * ## The policy this module enforces (see conventions.md history, 2026-09-17)
 *
 * `announcement-noise-keywords` is a curated, app-editable PRE-FILTER — a
 * list Darshan maintains of announcement types that are never worth reading
 * at all (AGM/EGM notices, postal ballots, analyst/investor-meet
 * intimations, dividend/record-date mechanics, ESOP allotments, credit-rating
 * routine updates, trading-window closures). A match here is DROPPED before
 * any PDF is read or any category/strength judgment is made — this is a
 * different, more trustworthy signal than the taxonomy's automatic,
 * title-only category-to-strength guess (`lib/announcementTaxonomy.js`),
 * which correctly still requires a real read before its strength is trusted
 * (see `skills/equity-research/_shared/scan-signal-pipeline.md` "Strength is
 * never judged from a title"). Conflating the two — disabling this pre-filter
 * because the taxonomy's title-only guess is unreliable — was a scope error
 * live from 2026-09-05 to 2026-09-17: NSE:MIDHANI's "Change in Directorate"
 * and NSE:LOKESHMACH's "Change in Management" both correctly matched an
 * existing keyword, got flagged, and were still fully read/digested anyway
 * under the interim tag-and-keep behavior — the exact outcome this pre-filter
 * exists to prevent. Do not re-introduce a "tag but don't drop" path here;
 * if a genuinely material announcement is ever found hiding behind a matched
 * keyword, the fix is to narrow that keyword in the app-editable list, not to
 * stop dropping matches.
 *
 * Every drop is still logged unconditionally to
 * `cache/ignored-announcements_<YYYYMMDD>.json` — dropping and auditing are
 * not mutually exclusive; the log is the false-positive review trail
 * (insight-validation reads it) that lets an over-broad keyword be caught and
 * narrowed before it costs something material.
 */

const { StorageService } = require('@stock/cloud-utils');
const {
  matchedNoiseKeyword: sharedMatchedNoiseKeyword,
} = require('../../../stock-api/src/utils/announcementNoiseFilter');
const ist = require('./ist');
const { resolveCompanyId } = require('./companyMaster');

/**
 * @param {{title?: string, description?: string}} announcement
 * @returns {{keyword: string, field: 'title'|'description'}|null}
 */
function matchNoiseKeyword(announcement) {
  return sharedMatchedNoiseKeyword(announcement);
}

/**
 * Append one entry to today's ignored-announcements audit log. Safe to call
 * unconditionally on every match, independent of whether the caller also
 * drops the item — this log's only job is visibility for later keyword-list
 * tuning, never enforcement.
 *
 * @param {{companyId?: string, ticker?: string, companyName?: string, name?: string, title?: string, subject?: string, headline?: string, description?: string, createdAt?: string}} ann
 * @param {string} matchedKeyword - the keyword string that matched (not the {keyword, field} shape — kept as a bare string for back-compat with existing log readers)
 */
async function logIgnoredAnnouncement(ann, matchedKeyword) {
  StorageService.init();
  const dateStr = ist.istYmd(); // YYYYMMDD
  const logPath = `cache/ignored-announcements_${dateStr}.json`;

  const existing = StorageService.readJson(logPath) || [];
  const title = ann.title || ann.subject || ann.headline || '';
  const name = ann.name || ann.companyName || '';
  const companyId =
    resolveCompanyId(
      { symbol: ann.companyId || ann.ticker, companyName: name },
      { fallback: false }
    ) ||
    ann.companyId ||
    '';
  existing.push({
    companyId,
    name,
    title,
    description: String(ann.description || '').slice(0, 300),
    matchedKeyword,
    createdAt: ann.createdAt || '',
  });
  await StorageService.saveJson(logPath, existing, false);
}

/**
 * The single entry point every caller should use: check an announcement
 * against the noise-keyword list, log a match unconditionally, and report
 * whether the caller should drop it. This is deliberately the ONLY function
 * most callers need — it inlines the "check, log, decide" sequence so a
 * future caller can't accidentally log without dropping (or vice versa)
 * the way the pre-2026-09-17 duplication allowed.
 *
 * @param {{title?: string, description?: string, [key: string]: unknown}} announcement - anything with at least title/description; extra fields (companyId, name, createdAt, etc.) are used for the audit-log entry if present
 * @returns {Promise<{drop: boolean, keyword: string|null, field: 'title'|'description'|null}>}
 */
async function checkAndLogNoise(announcement) {
  const match = matchNoiseKeyword(announcement);
  if (!match) return { drop: false, keyword: null, field: null };
  await logIgnoredAnnouncement(announcement, match.keyword);
  return { drop: true, keyword: match.keyword, field: match.field };
}

module.exports = {
  matchNoiseKeyword,
  logIgnoredAnnouncement,
  checkAndLogNoise,
};
