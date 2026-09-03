// Scratch script for gainers-signal Step 4 trigger research (2026-09-03 run)
// Per CLAUDE.md, this is session debris — will be deleted after use.
const fs = require('fs');
const path = require('path');
const db = require('./packages/jobs-runtime/lib/db');
const { buildCompanyContext } = require('./packages/jobs-runtime/lib/companyContext');

const MARKET_DATE = '2026-09-03';
const raw = JSON.parse(fs.readFileSync(`data/runs/gainers_raw_20260903.json`, 'utf8'));
const seed = JSON.parse(fs.readFileSync(`data/runs/gainers_research_seed_20260903.json`, 'utf8'));
const gm = {};
for (const g of raw.gainers) gm[g.ticker] = g;

const results = [];

for (const c of seed.companies) {
  const g = gm[c.companyId] || {};
  const deliv = g.delivery || {};
  const concall = g.concall || null;
  const needsTranscript = !!c.needs_transcript_research;

  let ctx;
  try {
    ctx = buildCompanyContext(c.companyId) || {};
  } catch (e) {
    ctx = { availableIds: [], error: String(e.message || e) };
  }
  const contextUsed = ctx.availableIds || [];

  const strongCount = (g.strong_announcements || []).length;
  const annReadCount = (c.announcements_to_read || []).length;

  let linkage,
    trigger,
    trigger_quantified,
    summary,
    concallCorroboration = null;

  const deliveryLine = `${deliv.deliv_per != null ? deliv.deliv_per + '%' : 'n/a'} delivery (₹${deliv.deliv_value_cr != null ? deliv.deliv_value_cr.toFixed(2) : 'n/a'} Cr of ₹${deliv.trd_value_cr != null ? deliv.trd_value_cr.toFixed(2) : 'n/a'} Cr traded)`;

  if (annReadCount === 0 && strongCount === 0) {
    linkage = 'unexplained';
    trigger =
      'No STRONG announcement filed in the scan window (the announcements API returned 0 pages this run after a 429 — see run notes) to explain the move; this is delivery-backed price action without a discoverable public trigger.';
    trigger_quantified = `+${g.return_1d}% on ${deliveryLine}, industry ${g.industry || 'n/a'}.`;

    if (needsTranscript && concall) {
      const sentiment = concall.sentiment;
      const rqs = concall.resultQualityScore;
      const days = concall.recentWithinDays;
      const highlights = concall.highlights || [];
      concallCorroboration = {
        sentiment,
        resultQualityScore: rqs,
        guidanceHighlights: highlights.slice(0, 2),
      };
      summary = `${c.companyId} moved +${g.return_1d}% with ${deliveryLine}. No STRONG filing was available to read this run (announcements API returned 0 pages), but a ${sentiment} concall (quality ${rqs}/100) was filed ${days}d ago, flagging: ${highlights.slice(0, 2).join('; ')}. This is corroborating, not sole, evidence — treated as unexplained-by-filing but partially supported by recent management tone.`;
      linkage = 'unexplained';
    } else {
      summary = `${c.companyId} moved +${g.return_1d}% with ${deliveryLine} and no STRONG announcement was available to read this run (announcements API returned 0 pages after a 429). Genuinely unexplained delivery-backed move — worth a D+2 follow-up per insight-validation to see if it holds or reverses.`;
    }
  } else {
    // Not expected in this run (all companies have 0 announcements_to_read), but handle defensively.
    linkage = 'mismatched';
    trigger = 'Announcement present but not read in this pass (should not occur — verify).';
    trigger_quantified = `+${g.return_1d}% on ${deliveryLine}.`;
    summary = trigger;
  }

  const dto = {
    creator: 'gainers-signal',
    type: 'gainers-trigger-research',
    date: MARKET_DATE,
    companyId: c.companyId,
    modelUsed: 'claude-sonnet-5',
    summary,
    research_axis: c.research_axis,
    tier: c.tier,
    trigger,
    trigger_quantified,
    linkage,
    contextUsed,
    concallCorroboration,
    narrative: {
      return_1d: g.return_1d,
      delivery_pct: deliv.deliv_per,
      delivery_value_cr: deliv.deliv_value_cr,
      traded_value_cr: deliv.trd_value_cr,
      industry: g.industry,
      volumeRocketing: g.volumeRocketing || false,
      streak: null,
      announcements_available_this_run: false,
      announcements_meta_note:
        'scanAnnouncements 429 this run; 0 pages returned, so no STRONG filings were fetchable for any of the top-20 research targets.',
    },
  };

  const id = db.saveReport(dto);
  results.push({ companyId: c.companyId, id, linkage, needsTranscript, hadConcall: !!concall });
}

console.log(JSON.stringify(results, null, 2));
console.log('TOTAL SAVED:', results.length);
