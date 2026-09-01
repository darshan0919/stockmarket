const path = require('path');
const db = require('./packages/jobs-runtime/lib/db.js');
const fs = require('fs');

const seed = JSON.parse(fs.readFileSync('./data/runs/volume_rocketing_research_seed_20260901.json', 'utf8'));
const marketDate = seed.market_date;

function sentimentCredit(concall) {
  if (!concall) return null;
  if (concall.recentWithinDays > 60) return 'stale (>60d) — not corroborating';
  return `${concall.sentiment} (quality ${concall.resultQualityScore}/100), filed ${concall.recentWithinDays}d ago`;
}

let saved = [];
for (const c of seed.companies) {
  const concallNote = c.concall ? sentimentCredit(c.concall) : null;
  const highlightsLine = c.concall && c.concall.highlights ? c.concall.highlights.join(' | ') : null;

  const summary = `${c.name} (${c.ticker}) +${c.return_1d}% on ${marketDate} with no STRONG filings found (announcements API rate-limited that day, 0 pages returned) — unexplained delivery-backed move. Delivery ${c.delivery_pct}% / Rs.${c.delivery_value_cr} Cr of Rs.${c.traded_value_cr} Cr traded, streak ${c.streak}.` +
    (concallNote ? ` Concall corroboration: ${concallNote}${highlightsLine ? ' — ' + highlightsLine : ''}.` : ' No recent concall data available.');

  const dto = {
    creator: 'volume-rocketing',
    type: 'volume-rocketing-trigger-research',
    date: marketDate,
    companyId: c.companyId,
    modelUsed: 'claude-sonnet-5',
    summary,
    research_axis: c.research_axis,
    tier: c.tier,
    trigger: 'No discoverable trigger (announcements unavailable — API 429 that run)',
    trigger_quantified: null,
    linkage: 'unexplained',
    contextUsed: [],
    concallCorroboration: c.concall ? {
      sentiment: c.concall.sentiment,
      resultQualityScore: c.concall.resultQualityScore,
      guidanceHighlights: c.concall.highlights || [],
    } : null,
    conviction: c.conviction,
    conviction_reasons: c.conviction_reasons,
    delivery_pct: c.delivery_pct,
    delivery_value_cr: c.delivery_value_cr,
    traded_value_cr: c.traded_value_cr,
    return_1d: c.return_1d,
    streak: c.streak,
  };
  const id = db.saveReport(dto);
  saved.push({ ticker: c.ticker, id, tier: c.tier });
}
console.log(JSON.stringify(saved, null, 2));
