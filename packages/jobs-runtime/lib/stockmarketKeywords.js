'use strict';

/**
 * Stockmarket classifier keyword set + scorer.
 *
 * Used by the conversation-capture pipeline (docs/CONVERSATION_CAPTURE_PLAN.md §4.2)
 * to decide whether a chat is stockmarket-related and should be stored.
 *
 * Two-stage design: this module is the cheap Stage-1 keyword gate. Borderline
 * results (score in [MIN_SCORE, STRONG_SCORE)) are meant to be escalated by the
 * caller to a Stage-2 check (ticker match against cache/company-master.json +
 * a one-shot LLM yes/no). Additions to SEED are approval-gated (Pass-2 harvest).
 */

// Seed keywords (case-insensitive). Kept auditable and extendable on purpose.
const SEED = [
  // markets / instruments
  'company',
  'business',
  'finance',
  'financial',
  'market',
  'sector',
  'industry',
  'stock',
  'share',
  'shares',
  'equity',
  'equities',
  'nse',
  'bse',
  'sebi',
  'nifty',
  'sensex',
  'ticker',
  'isin',
  'scrip',
  'listing',
  'exchange',
  // charts / technicals
  'chart',
  'technical',
  'candlestick',
  'breakout',
  'moving average',
  'rsi',
  // primary docs / filings
  'drhp',
  'rhp',
  'ipo',
  'prospectus',
  'annual report',
  'balance sheet',
  'cash flow',
  'p&l',
  'profit and loss',
  'concall',
  'con-call',
  'earnings call',
  'transcript',
  'investor presentation',
  'quarterly',
  'results',
  'filing',
  'filings',
  // valuation / fundamentals
  'valuation',
  'pe ratio',
  'p/e',
  'ev/ebitda',
  'ebitda',
  'revenue',
  'margin',
  'roce',
  'roe',
  'capex',
  'capacity',
  'order book',
  'guidance',
  'dividend',
  // research constructs
  'thesis',
  'conviction',
  'catalyst',
  'pead',
  'watchlist',
  'portfolio',
  'holdings',
  'forensic',
  'credibility',
  'management',
  'promoter',
  'pledge',
  'peer',
  'comparison',
  'market share',
  'value chain',
  'growth trigger',
  'fundamental',
  // events / flows
  'gainers',
  'losers',
  'deal',
  'bulk deal',
  'block deal',
  'sast',
  'insider',
  'delivery',
  'fii',
  'dii',
  'buyback',
  'rights issue',
  'qip',
  'merger',
  'acquisition',
  'demerger',
  'mutual fund',
  // tools / vendors in this project
  'stockscans',
  'screener',
  'kite',
  'zerodha',
  'perplexity',
];

// Proposed keywords harvested by Pass-2 body scan live here until Darshan approves
// them into SEED. Kept separate so scope never widens silently.
const PROPOSED = [];

// Multi-word phrases must be matched as substrings; single tokens as word-boundary.
const PHRASES = SEED.filter((k) => /\s|\/|&|-/.test(k));
const TOKENS = SEED.filter((k) => !/\s|\/|&|-/.test(k));
const TOKEN_RE = new RegExp(
  '\\b(' + TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\b',
  'gi'
);

const MIN_SCORE = 2; // fewer distinct hits than this ⇒ treat as non-stock (Stage-1)
const STRONG_SCORE = 4; // at/above this ⇒ confidently stock, no Stage-2 needed

/**
 * Score text by number of DISTINCT keyword hits (title text may be weighted by
 * the caller by passing it twice). Returns { score, matched: [keywords] }.
 */
function scoreText(text) {
  if (!text) return { score: 0, matched: [] };
  const lower = String(text).toLowerCase();
  const matched = new Set();
  for (const p of PHRASES) if (lower.includes(p)) matched.add(p);
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(lower)) !== null) matched.add(m[1].toLowerCase());
  return { score: matched.size, matched: [...matched].sort() };
}

/**
 * Stage-1 classification for a conversation.
 * @param {{title?:string, text?:string, extraKeywords?:string[]}} input
 * @returns {{ isStock:boolean, borderline:boolean, score:number, matched:string[] }}
 *   borderline=true means the caller SHOULD run the Stage-2 (ticker+LLM) check.
 */
function classify({ title = '', text = '', extraKeywords = [] } = {}) {
  // Title counts double (strong signal), then body.
  const combined = `${title} ${title} ${text}`;
  let { score, matched } = scoreText(combined);
  // Company tickers/names passed by the caller (from company-master) add signal.
  const lower = combined.toLowerCase();
  for (const kw of extraKeywords) {
    if (kw && lower.includes(String(kw).toLowerCase())) {
      matched.push(String(kw).toLowerCase());
      score += 1;
    }
  }
  matched = [...new Set(matched)].sort();
  const isStock = score >= MIN_SCORE;
  const borderline = score >= 1 && score < STRONG_SCORE;
  return { isStock, borderline, score, matched };
}

module.exports = { SEED, PROPOSED, MIN_SCORE, STRONG_SCORE, scoreText, classify };
