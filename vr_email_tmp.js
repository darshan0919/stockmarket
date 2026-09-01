const fs = require('fs');
const { stockscansLink } = require('./cloud-utils/src/emailService.js');

const d = JSON.parse(fs.readFileSync('./data/runs/volume_rocketing_insights_20260901.json', 'utf8'));
const marketDate = d.market_date;
const signals = d.signals;
const watch = signals.filter(s => s.tier === 'WATCH');
const noted = signals.filter(s => s.tier === 'NOTED');

// no gainers-signal overlap this run: dedupe against 31 gainers-signal tickers, 0 skipped
const skippedCount = 0;
const totalBeforeDedupe = 12 + skippedCount;

function fmtDeliv(s) {
  return `${s.delivery_pct}% · ₹${s.delivery_value_cr} Cr delivered of ₹${s.traded_value_cr} Cr traded`;
}

function watchRow(s) {
  const why = s.concall
    ? `Unexplained move; concall ${s.concall.sentiment.toLowerCase()} (${s.concall.recentWithinDays}d ago, quality ${s.concall.resultQualityScore}/100)`
    : 'Unexplained delivery-backed move — no filing found (announcements API rate-limited)';
  return `<tr style="border-bottom:1px solid #23262f;">
    <td style="padding:8px 10px;">${stockscansLink(s.name, s.ticker, s.ticker.split(':')[0], '#e8e8ec')} <span style="color:#8b8f9a;font-size:12px;">(${s.ticker})</span></td>
    <td style="padding:8px 10px;color:#3ecf8e;">+${s.return_1d}%</td>
    <td style="padding:8px 10px;">${s.streak > 1 ? s.streak + 'd' : '—'}</td>
    <td style="padding:8px 10px;">${s.delivery_pct}%</td>
    <td style="padding:8px 10px;">₹${s.delivery_value_cr} Cr</td>
    <td style="padding:8px 10px;">${s.primary_driver}</td>
    <td style="padding:8px 10px;font-size:12.5px;color:#c7cad1;">${why}</td>
  </tr>`;
}

function notedLine(s) {
  return `${stockscansLink(s.name, s.ticker, s.ticker.split(':')[0], '#c7cad1')} +${s.return_1d}%`;
}

const watchRows = watch.sort((a,b)=>b.conviction_score-a.conviction_score).map(watchRow).join('\n');
const notedLines = noted.sort((a,b)=>b.return_1d-a.return_1d).map(notedLine).join(' · ');

const html = `
<div style="background:#0f1117;color:#e8e8ec;font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;max-width:720px;margin:0 auto;">
  <h2 style="color:#e8e8ec;margin:0 0 4px;">Volume Rocketing Signal — ${marketDate}</h2>
  <p style="color:#c7cad1;font-size:14px;line-height:1.5;">
    ${totalBeforeDedupe} volume-surge names today; ${skippedCount} already covered by this morning's Gainers Signal
    (31 names), ${signals.length} fresh ones below. No ACT-tier names — every move here is PRICE_ACTION-driven with
    no discoverable filing, since the announcements API returned 0 pages today (rate-limited, HTTP 429) —
    treat "unexplained" below as a data-availability caveat, not a claim that nothing happened.
  </p>

  <h3 style="color:#f2c94c;margin:24px 0 8px;">🟡 WATCH (${watch.length})</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">
    <thead>
      <tr style="color:#8b8f9a;text-align:left;border-bottom:1px solid #34384a;">
        <th style="padding:6px 10px;">Company</th><th style="padding:6px 10px;">1D</th>
        <th style="padding:6px 10px;">Streak</th><th style="padding:6px 10px;">Deliv %</th>
        <th style="padding:6px 10px;">Deliv ₹Cr</th><th style="padding:6px 10px;">Driver</th>
        <th style="padding:6px 10px;">Why</th>
      </tr>
    </thead>
    <tbody>${watchRows}</tbody>
  </table>

  <h3 style="color:#8b8f9a;margin:24px 0 8px;">⚪ NOTED (${noted.length})</h3>
  <p style="font-size:13px;color:#c7cad1;">${notedLines}</p>

  <p style="color:#6b6f7a;font-size:12px;margin-top:28px;border-top:1px solid #23262f;padding-top:12px;">
    ${d.total_analyzed} analysed · ACT 0 · WATCH ${watch.length} · NOTED ${noted.length}<br/>
    Data caveat: announcements API returned 0 pages (429 rate limit) — every "unexplained" tag above reflects
    that gap, not a confirmed absence of news. Concall sentiment shown where available is corroborating context
    only, not a standalone trigger.
  </p>
</div>
`;

module.exports = { html };
if (require.main === module) {
  console.log('length', html.length);
}
