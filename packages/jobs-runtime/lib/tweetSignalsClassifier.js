#!/usr/bin/env node
/**
 * Tweet signals classifier — deterministic, no external API / no LLM calls.
 * Reads:  data/runs/{date}_tweets_raw.json  (produced by the
 *         browser-capture step of the tweet-signals skill)
 * Writes: classified signals → events collection via lib/db.js (type: "tweet")
 *          + data/runs/{date}_tweets_insights.json (full DTO for the briefing)
 *
 * Conviction is CONTENT-ONLY: category materiality + quantified figures +
 * figure magnitude. Source/author verification is intentionally NOT a
 * factor (removed per feedback — bot/verified-status doesn't tell you
 * anything about whether the underlying announcement is material).
 *
 * Company resolution uses the shared company-master DB (lib/companyMaster.js)
 * instead of a bare #TICKER regex, so prose-only announcements (no hashtag)
 * still resolve to a real companyId when the master DB has a matching
 * keyword/name. Run companyMasterSync.js + companyKeywordEnricher.js first
 * for best resolution coverage.
 *
 * Mirrors the pattern in packages/jobs-runtime/lib/gainersClassifier.js:
 * script does 100% of the deterministic classification; the skill's job is
 * only to compose the briefing from this file's output.
 */
const fs = require('fs');
const path = require('path');
const { findInText } = require('./companyMaster');

const db = require('./db');
const TWEETS_DIR = path.join(db.dataRoot(), 'runs');

function latestRaw(dir) {
  if (!fs.existsSync(dir)) throw new Error(`No such directory: ${dir}`);
  const files = fs.readdirSync(dir).filter(f => f.endsWith('_tweets_raw.json')).sort();
  if (files.length === 0) throw new Error(`No *_tweets_raw.json in ${dir}`);
  return path.join(dir, files[files.length - 1]);
}

// --- category keyword rules (checked in priority order) -------------------
const CATEGORY_RULES = [
  { category: 'ORDER_WIN', weight: 3, re: /\b(order win|wins? (an? )?order|secures? .*(order|contract)|epc (sub-)?contract|awarded)\b/i },
  { category: 'CORPORATE_ACTION', weight: 3, re: /\b(board meeting|acquisition|merger|amalgamation|stake (sale|cut|hike)|buyback|rights issue|qip|ipo|open offer|shareholding)\b/i },
  { category: 'EARNINGS_RESULTS', weight: 3, re: /\b(q[1-4] ?fy ?\d{2}|results?|revenue (grew|rose|up)|profit|pat\b|ebitda|sssg)\b/i },
  { category: 'RATING_CREDIT', weight: 2, re: /\b(credit rating|moody'?s|crisil|icra|care ratings|upgrad(ed|e)|esg rating)\b/i },
  { category: 'REGULATORY_POLICY', weight: 2, re: /\b(rbi|sebi|govt\.?|government|ministry|mandate|regulation|policy|customs?|duty)\b/i },
  { category: 'GEOPOLITICAL_MACRO', weight: 1, re: /\b(pm modi|geopolitic|hormuz|iran|tanker|explosion|ukmto|trade deficit|fii|dii)\b/i },
  { category: 'BULK_BLOCK_DEAL', weight: 2, re: /\b(bulk deal|block deal|bought \d|sold \d)\b/i },
  { category: 'OPINION_COMMENTARY', weight: 0, re: /\b(i (had|think)|my view|bold call|portfolio churn)\b/i },
];

const MATERIAL_CATEGORIES = new Set(['ORDER_WIN', 'CORPORATE_ACTION', 'EARNINGS_RESULTS', 'RATING_CREDIT']);

const CRORE_RE = /(?:₹|rs\.?|inr)\s?([\d,]+(?:\.\d+)?)\s?(cr|crore)/i;
const PCT_RE = /(\d{1,3}(?:\.\d+)?)\s?%/;
const LARGE_CRORE_THRESHOLD = 100; // ₹100cr+ treated as a materially-sized figure
const LARGE_PCT_THRESHOLD = 10; // 10%+ treated as a materially-sized figure

function classifyOne(tweet) {
  const text = tweet.text || '';
  let best = { category: 'UNCATEGORIZED', weight: -1 };
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(text) && rule.weight > best.weight) {
      best = rule;
    }
  }

  const croreMatch = text.match(CRORE_RE);
  const pctMatch = text.match(PCT_RE);
  const croreValue = croreMatch ? parseFloat(croreMatch[1].replace(/,/g, '')) : null;
  const pctValue = pctMatch ? parseFloat(pctMatch[1]) : null;
  const hasQuantifiedFigure = croreValue !== null || pctValue !== null;
  const isLargeFigure = (croreValue !== null && croreValue >= LARGE_CRORE_THRESHOLD) ||
    (pctValue !== null && pctValue >= LARGE_PCT_THRESHOLD);

  const isMaterial = MATERIAL_CATEGORIES.has(best.category);

  // Conviction — content-only: category materiality + quantified figure + magnitude.
  let conviction = 'LOW';
  if (isMaterial && hasQuantifiedFigure && isLargeFigure) {
    conviction = 'HIGH';
  } else if (isMaterial && hasQuantifiedFigure) {
    conviction = 'MEDIUM';
  } else if (isMaterial) {
    // Material category but no quantified figure to back it — still LOW,
    // not MEDIUM: an unquantified "board approves X" is weaker evidence
    // than one with a number attached.
    conviction = 'LOW';
  } else if (best.category === 'OPINION_COMMENTARY' || best.category === 'UNCATEGORIZED') {
    conviction = 'NOISE';
  }

  const company = findInText(text);
  const companyId = company ? company.companyId : `UNKNOWN:${(tweet.author || 'unknown')}`;

  const evidence = [];
  if (croreMatch) evidence.push(`💰 ₹${croreMatch[1]} crore mentioned${isLargeFigure ? ' (large)' : ''}`);
  if (pctMatch) evidence.push(`📊 ${pctMatch[1]}% figure mentioned${isLargeFigure ? ' (large)' : ''}`);
  evidence.push(company ? `🏷️ Resolved to ${company.companyId} (${company.companyName})` : '⚠️ Company not resolved — not in master DB or no matching keyword');

  const now = new Date().toISOString();
  return {
    companyId,
    creationTime: now,
    modifiedTime: now,
    creator: 'tweet-signals',
    tweetId: tweet.id,
    author: tweet.author,
    relativeTime: tweet.relativeTime,
    text: text,
    category: best.category,
    conviction,
    nseTicker: company ? company.nseTicker : null,
    bseTicker: company ? company.bseTicker : null,
    evidence,
    inDigest: conviction === 'HIGH' || conviction === 'MEDIUM',
  };
}

function main() {
  const rawPath = process.argv[2] || latestRaw(TWEETS_DIR);
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  const tweets = raw.tweets || [];

  const signals = tweets.map(classifyOne);

  const byConviction = { HIGH: 0, MEDIUM: 0, LOW: 0, NOISE: 0 };
  for (const s of signals) byConviction[s.conviction] = (byConviction[s.conviction] || 0) + 1;
  const resolvedCount = signals.filter(s => !s.companyId.startsWith('UNKNOWN:')).length;

  const base = path.basename(rawPath);
  const dateMatch = base.match(/^\d{4}-\d{2}-\d{2}/);
  const datePrefix = dateMatch ? dateMatch[0] : base.replace(/\.json$/, '');
  const outName = `${datePrefix}_tweets_insights.json`;
  const outPath = path.join(TWEETS_DIR, outName);

  if (path.resolve(outPath) === path.resolve(rawPath)) {
    throw new Error(`Refusing to overwrite input file: computed outPath (${outPath}) equals rawPath. Rename the input file to avoid a collision.`);
  }

  const output = {
    listId: raw.listId,
    listName: raw.listName,
    sourceFile: path.basename(rawPath),
    generatedAt: new Date().toISOString(),
    totalTweets: tweets.length,
    resolvedCompanyCount: resolvedCount,
    byConviction,
    signals,
  };

  // Canonical store: one event record per resolved, non-noise signal.
  const eventRecords = signals
    .filter((s2) => s2.companyId && !String(s2.companyId).startsWith('UNKNOWN:') && s2.conviction !== 'NOISE')
    .map((s2) => ({
      ...s2,
      type: 'tweet',
      date: datePrefix.slice(0, 10),
      creator: s2.creator || 'tweet-signals',
      summary: String(s2.text || '').slice(0, 300),
    }));
  const stats = eventRecords.length ? db.appendEvents(eventRecords) : { inserted: 0 };

  fs.mkdirSync(TWEETS_DIR, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ status: 'ok', outPath, events: stats, totalTweets: tweets.length, resolvedCompanyCount: resolvedCount, byConviction }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { classifyOne, main };
