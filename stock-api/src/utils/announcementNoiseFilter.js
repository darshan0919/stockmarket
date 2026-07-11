/**
 * @fileoverview Shared "noise vs signal" keyword filter for corporate announcements.
 * Single, app-agnostic source of truth for both:
 *   - packages/jobs-runtime/watchlistInsights.js (daily watchlist insights job)
 *   - screener-api's announcement-scans page (stockscansAnnouncementScansPage.js)
 *
 * There is intentionally ONE keyword list, not a per-scan/per-caller one: it lives
 * in ../data/announcement-noise-keywords.json (non-gitignored) and is editable via
 * the app (see saveNoiseKeywords, wired to PUT /api/announcements/scans/ignored-keywords)
 * as well as directly by hand. Every read goes through loadNoiseKeywords(), which
 * re-reads the file fresh each call so edits made via the app take effect
 * immediately for both the API and the job — no process restart needed.
 *
 * Title and description are matched SEPARATELY (not against a combined blob), so a
 * word that's only noisy in a title (e.g. "Annual Report") doesn't accidentally
 * suppress an announcement where it shows up incidentally in the description. This
 * mirrors the more advanced of the two filtering implementations that existed
 * before this module (the announcement-scans page's), which watchlistInsights.js
 * was refactored to match.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const NOISE_KEYWORDS_PATH = path.resolve(__dirname, '../data/announcement-noise-keywords.json');

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * De-duplicate (case-insensitive), trim, and cap a list of keywords.
 * @param {unknown} value
 * @param {number} [limit=200]
 * @returns {string[]}
 */
function normalizeKeywordList(value, limit = 200) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((keyword, index, arr) => {
      const lower = keyword.toLowerCase();
      return arr.findIndex((item) => item.toLowerCase() === lower) === index;
    })
    .slice(0, limit);
}

/**
 * Read the shared keyword list fresh from disk. Falls back to an empty list (not
 * an error) if the file is missing/corrupt, so a bad edit can't take down the
 * announcement-scans page or the watchlist job.
 * @returns {{titleKeywordsToIgnore: string[], descriptionKeywordsToIgnore: string[], updatedAt: string|null, path: string}}
 */
function loadNoiseKeywords() {
  try {
    const raw = fs.readFileSync(NOISE_KEYWORDS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      titleKeywordsToIgnore: normalizeKeywordList(parsed.titleKeywordsToIgnore),
      descriptionKeywordsToIgnore: normalizeKeywordList(parsed.descriptionKeywordsToIgnore),
      updatedAt: parsed.updatedAt || null,
      path: NOISE_KEYWORDS_PATH,
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {
        titleKeywordsToIgnore: [],
        descriptionKeywordsToIgnore: [],
        updatedAt: null,
        path: NOISE_KEYWORDS_PATH,
      };
    }
    throw err;
  }
}

/**
 * Overwrite the shared keyword list. Used by the app's edit UI
 * (PUT /api/announcements/scans/ignored-keywords) — the job picks up the change on
 * its next run since loadNoiseKeywords() always re-reads from disk.
 * @param {{titleKeywordsToIgnore?: string[], descriptionKeywordsToIgnore?: string[]}} payload
 * @returns {{titleKeywordsToIgnore: string[], descriptionKeywordsToIgnore: string[], updatedAt: string, path: string}}
 */
function saveNoiseKeywords(payload = {}) {
  const record = {
    titleKeywordsToIgnore: normalizeKeywordList(payload.titleKeywordsToIgnore),
    descriptionKeywordsToIgnore: normalizeKeywordList(payload.descriptionKeywordsToIgnore),
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(NOISE_KEYWORDS_PATH), { recursive: true });
  fs.writeFileSync(NOISE_KEYWORDS_PATH, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return { ...record, path: NOISE_KEYWORDS_PATH };
}

/**
 * @param {string} title
 * @param {string[]} titleKeywordsToIgnore
 * @returns {string|null} the matched keyword, or null
 */
function matchedTitleKeyword(title, titleKeywordsToIgnore) {
  const haystack = normalizeText(title);
  return (titleKeywordsToIgnore || []).find((kw) => haystack.includes(kw.toLowerCase())) || null;
}

/**
 * @param {string} description
 * @param {string[]} descriptionKeywordsToIgnore
 * @returns {string|null} the matched keyword, or null
 */
function matchedDescriptionKeyword(description, descriptionKeywordsToIgnore) {
  const haystack = normalizeText(description);
  return (
    (descriptionKeywordsToIgnore || []).find((kw) => haystack.includes(kw.toLowerCase())) || null
  );
}

/**
 * Same check as shouldIgnoreAnnouncement, but returns the matched keyword (and
 * which field it matched in) instead of a boolean — useful for logging why an
 * announcement was dropped.
 * @param {{title?: string, description?: string}} announcement
 * @returns {{keyword: string, field: 'title'|'description'}|null}
 */
function matchedNoiseKeyword(announcement = {}) {
  const { titleKeywordsToIgnore, descriptionKeywordsToIgnore } = loadNoiseKeywords();
  const titleMatch = matchedTitleKeyword(announcement.title, titleKeywordsToIgnore);
  if (titleMatch) return { keyword: titleMatch, field: 'title' };
  const descriptionMatch = matchedDescriptionKeyword(
    announcement.description,
    descriptionKeywordsToIgnore
  );
  if (descriptionMatch) return { keyword: descriptionMatch, field: 'description' };
  return null;
}

/**
 * Decide whether an announcement should be treated as noise, checking title and
 * description keyword lists separately.
 * @param {{title?: string, description?: string}} announcement
 * @returns {boolean}
 */
function shouldIgnoreAnnouncement(announcement) {
  return Boolean(matchedNoiseKeyword(announcement));
}

module.exports = {
  NOISE_KEYWORDS_PATH,
  normalizeText,
  normalizeKeywordList,
  loadNoiseKeywords,
  saveNoiseKeywords,
  shouldIgnoreAnnouncement,
  matchedNoiseKeyword,
};
