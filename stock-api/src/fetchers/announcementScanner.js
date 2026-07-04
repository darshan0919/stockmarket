'use strict';

const fs = require('fs');
const path = require('path');
const { stockscans } = require('../index');

const QUARTER_END_MONTHS = [3, 6, 9, 12];
const DEFAULT_SCAN_ID = '13d3403f48060387bd20fcbc';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'to', 'for', 'on', 'at',
  'by', 'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had',
  'with', 'from', 'as', 'it', 'its', 'this', 'that', 'not', 'no', 'we',
  'our', 'us', 'you', 'your', 'he', 'she', 'they', 'their', 'i', 'my',
  'company', 'ltd', 'limited', 'pvt', 'private', 'inc', 'pursuant',
  'section', 'regulation', 'regulations', 'under', 'sebi', 'act',
  'trading', 'equity', 'shares', 'stock', 'nse', 'bse', 'exchange',
  'listing', 'listed', 'securities', 'financial', 'year', 'quarter',
  'q1', 'q2', 'q3', 'q4', 'fy', 'per', 's', 'r', 're'
]);

function lastNQuarterDates(n = 4) {
  const today = new Date();
  const results = [];
  let year = today.getFullYear();
  let monthIdx = 3; // start from Dec (index 3)

  for (let i = QUARTER_END_MONTHS.length - 1; i >= 0; i--) {
    if (QUARTER_END_MONTHS[i] <= today.getMonth() + 1) {
      monthIdx = i;
      break;
    }
    if (i === 0) {
      year -= 1;
      monthIdx = 3;
    }
  }

  while (results.length < n) {
    const qm = QUARTER_END_MONTHS[monthIdx];
    results.push(`${year}${String(qm).padStart(2, '0')}`);
    monthIdx -= 1;
    if (monthIdx < 0) {
      monthIdx = 3;
      year -= 1;
    }
  }
  return results;
}

async function fetchQuarter(keyword, quarterDate, minMcap = 300, maxOffset = 5) {
  const results = [];
  for (let page = 0; page < maxOffset; page++) {
    const offset = page * 20;
    const payload = {
      scan: {
        scanId: DEFAULT_SCAN_ID,
        scanName: 'Announcement Keyword Explorer',
        filters: [{ left: 'Market Capitalization', sign: '>=', right: String(minMcap) }],
        industry: [],
        index: [],
        watchlistIds: [],
        searchFilters: [keyword],
        announcementType: 'All',
        alerts: false,
        searchMode: 'quick',
        companyIds: [],
        companyFilters: []
      },
      offset,
      quarterDate
    };

    const data = await stockscans.scanAnnouncements(payload, { referer: 'https://www.stockscans.in/announcement-scans' });
    const pageItems = Array.isArray(data) ? data : (data.announcements || data.results || []);
    
    if (!pageItems || pageItems.length === 0) break;
    results.push(...pageItems);
    
    if (pageItems.length < 20) break;
    
    await new Promise(res => setTimeout(res, 300));
  }
  return results;
}

function tokenize(text) {
  const tokens = text.toLowerCase().match(/[a-z]+/g) || [];
  return tokens.filter(t => !STOP_WORDS.has(t) && t.length > 2);
}

function extractNgrams(texts, topN = 60) {
  const uni = {};
  const bi = {};

  for (const text of texts) {
    const tokens = tokenize(text);
    for (let i = 0; i < tokens.length; i++) {
      uni[tokens[i]] = (uni[tokens[i]] || 0) + 1;
      if (i < tokens.length - 1) {
        const bigram = `${tokens[i]} ${tokens[i+1]}`;
        bi[bigram] = (bi[bigram] || 0) + 1;
      }
    }
  }

  const sortMap = (map, limit) => Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {});

  return {
    unigrams: sortMap(uni, topN),
    bigrams: sortMap(bi, Math.floor(topN / 2))
  };
}

function extractCandidatePhrases(texts) {
  const phraseCounter = {};
  const titleCasePattern = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,5})\b/g;

  for (const text of texts) {
    let match;
    while ((match = titleCasePattern.exec(text)) !== null) {
      const phrase = match[1].trim();
      const firstWord = phrase.toLowerCase().split(/\s+/)[0];
      if (phrase.length > 6 && !STOP_WORDS.has(firstWord)) {
        phraseCounter[phrase] = (phraseCounter[phrase] || 0) + 1;
      }
    }
  }

  return Object.entries(phraseCounter)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([p]) => p);
}

/**
 * Fetch announcement-scan results and extract keyword candidates.
 */
async function fetchAndExtract(keyword, options = {}) {
  const {
    quarters = 4,
    minMcap = 300,
    output
  } = options;

  const quarterDates = lastNQuarterDates(quarters);
  const allTitles = [];
  const allDescriptions = [];
  const perQuarter = {};
  const errors = [];
  let total = 0;

  for (const qd of quarterDates) {
    try {
      const items = await fetchQuarter(keyword, qd, minMcap);
      const titles = items.map(item => String(item.title || '').trim()).filter(Boolean);
      const descs = items.map(item => String(item.description || '').trim()).filter(Boolean);
      
      allTitles.push(...titles);
      allDescriptions.push(...descs);
      
      perQuarter[qd] = {
        count: items.length,
        sample_titles: titles.slice(0, 10)
      };
      total += items.length;
    } catch (e) {
      errors.push(`Quarter ${qd}: ${e.message}`);
      perQuarter[qd] = { count: 0, sample_titles: [], error: e.message };
    }
  }

  const { unigrams: titleUnigrams, bigrams: titleBigrams } = extractNgrams(allTitles, 60);
  const { unigrams: descUnigrams, bigrams: descBigrams } = extractNgrams(allDescriptions, 60);
  const candidatePhrases = extractCandidatePhrases(allTitles);

  const result = {
    keyword,
    quarters_fetched: quarterDates,
    total_announcements: total,
    per_quarter: perQuarter,
    all_titles: [...new Set(allTitles)].sort(),
    all_descriptions: [...new Set(allDescriptions)].sort(),
    title_unigrams: titleUnigrams,
    title_bigrams: titleBigrams,
    desc_unigrams: descUnigrams,
    desc_bigrams: descBigrams,
    title_candidate_phrases: candidatePhrases,
    errors
  };

  if (output) {
    fs.writeFileSync(path.resolve(output), JSON.stringify(result, null, 2), 'utf-8');
  }

  return result;
}

module.exports = {
  fetchAndExtract,
  lastNQuarterDates,
  fetchQuarter,
  extractNgrams,
  extractCandidatePhrases,
  tokenize
};
