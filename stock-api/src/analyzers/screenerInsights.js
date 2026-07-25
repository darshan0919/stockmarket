'use strict';

/**
 * screenerInsights — parse a Screener.in company page into the handful of signals
 * that sharpen a pre-PEAD surprise call, plus a robust auth-expiry check.
 *
 * What we pull and why it matters for an *earnings-surprise* decision:
 *   - Pros / Cons  — Screener's auto-generated insights. The ones that move a
 *                    surprise call: "expected to give good/poor quarter",
 *                    "delivering good/poor profit growth", "reduced/increased debt"
 *                    (corroborates the deleverage lever), "improving/low ROCE/ROE",
 *                    "working capital days", "promoter holding change/pledge".
 *   - Top ratios   — Stock P/E (cross-checks the 50D-avg-P/E valuation read),
 *                    ROCE / ROE (quality), Debt / D-E (deleverage lever),
 *                    OPM, sales/profit growth, promoter holding & pledge.
 *
 * These are a SECOND, independent read on the same company. When they agree with
 * your concall-driven thesis, conviction rises; when they contradict it (e.g. you
 * project a beat but Screener flags "poor profit growth" and rising debt), that
 * disagreement is exactly the kind of thing to resolve before ranking the name.
 *
 * HTML parsing is regex-based and therefore brittle to Screener markup changes —
 * every extractor fails soft (returns null/empty, records a warning) rather than
 * throwing, so a markup drift degrades the cross-check instead of breaking the run.
 */

function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Decide whether the Screener response reflects a logged-in session.
 * Screener still serves the public company page when logged out, but hides the
 * warehouse extras and shows a login affordance — so we key off logged-in
 * markers (a /logout/ link / account menu) rather than page presence.
 *
 * @returns {{ authenticated:boolean, reason:string }}
 */
function detectAuthState({ status, html } = {}) {
  if (status === 401 || status === 403) {
    return { authenticated: false, reason: `HTTP ${status} — session rejected` };
  }
  if (status === 302 || status === 301) {
    return { authenticated: false, reason: `HTTP ${status} redirect (likely to /login)` };
  }
  const h = String(html || '');
  if (!h || h.length < 500) {
    return { authenticated: false, reason: 'empty/short response — not a company page' };
  }
  if (/\/login\/\?next=/.test(h) || /Please\s+login/i.test(h)) {
    return { authenticated: false, reason: 'login redirect/prompt in body' };
  }
  const loggedIn = /\/logout\//.test(h) || /href="\/user\//.test(h) || /id="?desktop-user/i.test(h);
  if (!loggedIn) {
    // Public page rendered but no session — the authed insights may be missing.
    return { authenticated: false, reason: 'no logged-in marker (session likely expired)' };
  }
  return { authenticated: true, reason: 'logged-in markers present' };
}

/**
 * Extract the Pros and Cons bullet lists (the "insights").
 * Screener markup: <div class="pros"><h... >Pros</h><ul><li>…</li></ul></div>
 * and the sibling <div class="cons">…</div>.
 */
function parseProsCons(html) {
  // Returns { pros, cons, prosFound, consFound } — `*Found` distinguishes a
  // legitimately-EMPTY Screener list (container present, no bullets — Screener has
  // no machine-generated insight for this name/view) from a MISSING container
  // (markup drift). Only the latter warrants a "markup changed" warning.
  const grab = (cls) => {
    const block = new RegExp(
      `<div[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)</div>`,
      'i'
    ).exec(html);
    if (!block) return { items: [], found: false };
    const items = [];
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = liRe.exec(block[1])) !== null) {
      const t = stripTags(m[1]);
      if (t) items.push(t);
    }
    return { items, found: true };
  };
  const p = grab('pros');
  const c = grab('cons');
  return { pros: p.items, cons: c.items, prosFound: p.found, consFound: c.found };
}

/**
 * Extract the top-ratios strip into a { label: valueString } map.
 * Screener markup: <ul id="top-ratios"><li><span class="name">Stock P/E</span>
 *   <span class="value"><span class="number">28.4</span></span></li>…</ul>
 * Falls back to a looser name/number pairing if the ids/classes drift.
 */
function parseTopRatios(html) {
  const out = {};
  const ul = /<ul[^>]*id="top-ratios"[^>]*>([\s\S]*?)<\/ul>/i.exec(html);
  const scope = ul ? ul[1] : html;
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(scope)) !== null) {
    const li = m[1];
    const nameM = /class="name"[^>]*>([\s\S]*?)<\/span>/i.exec(li);
    if (!nameM) continue;
    const name = stripTags(nameM[1]);
    // value is the concatenated numbers inside the value span
    const valM =
      /class="value"[^>]*>([\s\S]*?)<\/span>\s*<\/li>/i.exec(li + '</li>') ||
      /class="value"[^>]*>([\s\S]*?)$/i.exec(li);
    const value = valM ? stripTags(valM[1]) : stripTags(li.replace(nameM[0], ''));
    if (name) out[name] = value;
  }
  return out;
}

/** Pick a ratio by any of several label spellings (Screener relabels over time). */
function pickRatio(ratios, aliases) {
  const norm = (s) => s.toLowerCase().replace(/[\s./-]+/g, '');
  const map = {};
  for (const k of Object.keys(ratios)) map[norm(k)] = ratios[k];
  for (const a of aliases) if (map[norm(a)] != null) return map[norm(a)];
  return null;
}

/**
 * Classify the Pros/Cons bullets into the ones that bear on an earnings surprise,
 * so the skill can weight them rather than dumping raw text. Returns tags like
 * 'good-quarter-expected', 'poor-quarter-expected', 'debt-reduced', 'debt-increased',
 * 'good-profit-growth', 'poor-profit-growth', 'promoter-pledge', 'promoter-selling'.
 */
function tagInsights({ pros = [], cons = [] }) {
  const tags = [];
  const test = (arr, re, tag) => {
    if (arr.some((s) => re.test(s))) tags.push(tag);
  };
  test(pros, /expected to give (a )?good quarter/i, 'good-quarter-expected');
  test(cons, /expected to give (a )?poor quarter/i, 'poor-quarter-expected');
  test(pros, /good profit growth|good.*profit.*of/i, 'good-profit-growth');
  test(cons, /poor.*(sales|profit) growth|de-?growth/i, 'poor-profit-growth');
  test(pros, /reduced its debt|reducing debt|debt free|almost debt/i, 'debt-reduced');
  test(cons, /increase in debt|increasing debt|high.*debt/i, 'debt-increased');
  test(pros, /improving (its )?(roe|roce)|healthy.*(roe|roce)/i, 'improving-returns');
  test(cons, /low (return on equity|roe|roce)|poor.*return/i, 'low-returns');
  test(
    cons,
    /working capital.*(increased|days).*deteriorat|increase in working capital/i,
    'working-capital-stretch'
  );
  test(cons, /promoter.*pledg/i, 'promoter-pledge');
  test(cons, /promoter.*(holding.*(decreas|reduc)|selling)/i, 'promoter-selling');
  test(cons, /high valuation|trading at .*times.*book value|expensive/i, 'rich-valuation-flag');
  return tags;
}

/**
 * Top-level parse. Never throws — on an expired session it returns
 * `{ authExpired: true }` so the caller can halt and prompt the user to refresh
 * the cookie, rather than silently returning a public-only (thin) read.
 *
 * @param {{status:number, html:string, url?:string}} resp
 * @returns {Object}
 */
function parseScreenerInsights(resp) {
  const auth = detectAuthState(resp);
  if (!auth.authenticated) {
    return {
      authExpired: true,
      authReason: auth.reason,
      url: resp && resp.url,
      pros: [],
      cons: [],
      insightTags: [],
      ratios: {},
      keyMetrics: {},
      warnings: [`Screener session not authenticated: ${auth.reason}`],
    };
  }

  const html = resp.html;
  const { pros, cons, prosFound, consFound } = parseProsCons(html);
  const ratios = parseTopRatios(html);
  const insightTags = tagInsights({ pros, cons });

  const keyMetrics = {
    stockPE: pickRatio(ratios, ['Stock P/E', 'P/E']),
    roce: pickRatio(ratios, ['ROCE']),
    roe: pickRatio(ratios, ['ROE']),
    debtToEquity: pickRatio(ratios, ['Debt to equity', 'Debt / Equity']),
    marketCap: pickRatio(ratios, ['Market Cap']),
    currentPrice: pickRatio(ratios, ['Current Price']),
    bookValue: pickRatio(ratios, ['Book Value']),
    dividendYield: pickRatio(ratios, ['Dividend Yield']),
    faceValue: pickRatio(ratios, ['Face Value']),
    highLow: pickRatio(ratios, ['High / Low']),
  };

  const warnings = [];
  // Only warn when the containers are ABSENT (markup drift). Present-but-empty is
  // a valid state — Screener simply has no machine-generated insight for this name.
  if (!prosFound && !consFound) {
    warnings.push('Pros/Cons section not found — Screener markup may have changed.');
  }
  const noInsights = prosFound && consFound && !pros.length && !cons.length;
  if (!Object.keys(ratios).length)
    warnings.push('No top-ratios parsed — Screener markup may have changed.');

  return {
    authExpired: false,
    url: resp && resp.url,
    pros,
    cons,
    prosFound,
    consFound,
    noInsights,
    insightTags,
    ratios,
    keyMetrics,
    warnings,
  };
}

module.exports = {
  parseScreenerInsights,
  detectAuthState,
  parseProsCons,
  parseTopRatios,
  pickRatio,
  tagInsights,
  stripTags,
};
