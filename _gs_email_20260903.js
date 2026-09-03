// Scratch script — builds and sends the gainers-signal email for 2026-09-03. Session debris, deleted after use.
const fs = require('fs');
require('./packages/jobs-runtime/lib/env').loadEnv();
const { stockscansLink } = require('@stock/cloud-utils');
const {
  sendHtmlEmail,
} = require('/sessions/ecstatic-focused-noether/mnt/stockmarket/cloud-utils/src/emailService.js');

const MARKET_DATE = '2026-09-03';
const d = JSON.parse(fs.readFileSync('data/runs/gainers_insights_20260903.json', 'utf8'));
const research = JSON.parse(
  fs.readFileSync(
    '/sessions/ecstatic-focused-noether/mnt/stockmarket/_gs_research_lookup.json',
    'utf8'
  )
);

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function symbolOf(ticker) {
  const [exch, sym] = String(ticker).split(':');
  return { exch, sym };
}

const signals = d.signals;
const watch = signals.filter((s) => s.tier === 'WATCH').sort((a, b) => b.return_1d - a.return_1d);
const noted = signals.filter((s) => s.tier === 'NOTED').sort((a, b) => b.return_1d - a.return_1d);
const act = signals.filter((s) => s.tier === 'ACT');

const streaks = d.streaks || [];
const sectorCatalysts = d.sector_catalysts || {};

const styles = `
  body{background:#0f1117;color:#e6e6e6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:0;}
  .wrap{max-width:680px;margin:0 auto;padding:20px;}
  h1{font-size:20px;color:#fff;margin:0 0 4px;}
  .sub{color:#9aa0ab;font-size:13px;margin-bottom:20px;}
  .lead{background:#171a22;border-left:3px solid #4c8bf5;padding:14px 16px;border-radius:6px;font-size:14px;line-height:1.5;margin-bottom:22px;}
  h2{font-size:15px;color:#fff;border-bottom:1px solid #262a35;padding-bottom:6px;margin:26px 0 12px;}
  table{width:100%;border-collapse:collapse;font-size:12.5px;}
  th{text-align:left;color:#9aa0ab;font-weight:600;padding:6px 8px;border-bottom:1px solid #262a35;}
  td{padding:7px 8px;border-bottom:1px solid #1b1e27;vertical-align:top;}
  a{color:#4c8bf5;text-decoration:none;}
  .tag{display:inline-block;font-size:10.5px;padding:1px 6px;border-radius:10px;margin-left:4px;}
  .tag-unexpl{background:#3a2c14;color:#e2a83a;}
  .tag-expl{background:#123a20;color:#3ae27a;}
  .tag-mismatch{background:#3a1414;color:#e24c4c;}
  .noted-line{font-size:13px;line-height:1.8;color:#c7cad1;}
  .noted-line a{margin-right:2px;}
  .cluster{background:#171a22;border-radius:6px;padding:12px 14px;margin-bottom:10px;font-size:13px;}
  .footer{color:#6b7180;font-size:11.5px;margin-top:28px;border-top:1px solid #262a35;padding-top:12px;}
  .badge{font-size:10.5px;padding:1px 6px;border-radius:10px;background:#20242f;color:#9aa0ab;margin-left:6px;}
`;

function watchRow(s) {
  const { sym, exch } = symbolOf(s.companyId);
  const r = research[s.companyId] || {};
  const linkageTag =
    r.linkage === 'explained'
      ? '<span class="tag tag-expl">explained</span>'
      : r.linkage === 'mismatched'
        ? '<span class="tag tag-mismatch">mismatched</span>'
        : '<span class="tag tag-unexpl">unexplained</span>';
  const why =
    r.summary_short ||
    'Delivery-backed move, no STRONG filing surfaced this run (announcements API 429).';
  const vr = s.volumeRocketing ? ' ⚡' : '';
  return `<tr>
    <td>${stockscansLink(s.name, s.companyId)}${vr}</td>
    <td>+${s.return_1d.toFixed(2)}%</td>
    <td>${s.streak > 1 ? s.streak : '—'}</td>
    <td>${s.delivery_pct != null ? s.delivery_pct.toFixed(1) + '%' : 'n/a'}</td>
    <td>${s.delivery_value_cr != null ? '₹' + s.delivery_value_cr.toFixed(1) + ' Cr' : 'n/a'}</td>
    <td>${esc(s.industry || '')}</td>
    <td>${esc(why)}${linkageTag}</td>
  </tr>`;
}

const watchRows = watch.map(watchRow).join('\n');

const notedLine = noted
  .map((s) => `${stockscansLink(s.name, s.companyId)} +${s.return_1d.toFixed(1)}%`)
  .join(' &nbsp;·&nbsp; ');

const clusterBlocks = Object.entries(sectorCatalysts)
  .map(([industry, c]) => {
    const tickerLinks = c.tickers
      .map((t) => {
        const sig = signals.find((s) => s.companyId === t);
        return sig ? `${stockscansLink(sig.name, sig.companyId)} +${sig.return_1d.toFixed(1)}%` : t;
      })
      .join(', ');
    return `<div class="cluster"><b>${esc(industry)}</b> — ${c.tickers.length} names, avg return +${c.avg_return.toFixed(1)}% (below the STRONG/SUPER_STRONG delivery-confirmed threshold, so this is a same-day price-action co-move, not a delivery-confirmed cluster). Members: ${tickerLinks}. Read: sector-wide sympathy move, not conviction accumulation — no cluster met the ≥3-names-with-delivery bar.</div>`;
  })
  .join('\n');

const streakRows = streaks
  .map((s) => {
    const sig = signals.find((x) => x.companyId === s.ticker);
    return `<tr><td>${sig ? stockscansLink(sig.name, sig.companyId) : esc(s.ticker)}</td><td>${s.streak}</td><td>${s.tier}</td><td>${s.delivery_pct != null ? s.delivery_pct.toFixed(1) + '%' : 'n/a'}</td><td>${s.delivery_value_cr != null ? '₹' + s.delivery_value_cr.toFixed(1) + ' Cr' : 'n/a'}</td></tr>`;
  })
  .join('\n');

const leadText = `No ACT-tier names today — the announcements API returned 0 pages after a 429 mid-run, so no STRONG filings were available to confirm a cause for any of the 30 quality-filtered gainers. The strongest reads are ${stockscansLink('Hikal', 'NSE:HIKAL')} (+19.8%, HIGH conviction on delivery + a 52.8x volume spike) and ${stockscansLink('Jindal Worldwide', 'NSE:JINDWORLD')} (+19.8%, HIGH conviction, 52-week breakout) — both unexplained by any filing this run and worth a D+2 follow-up. A three-name Oil Drilling & Exploration co-move (avg +8.3%) surfaced but doesn't clear the delivery-confirmed cluster bar.`;

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${styles}</style></head>
<body><div class="wrap">
<h1>Daily Gainers Signal</h1>
<div class="sub">${MARKET_DATE} · ${d.total_analyzed} analysed</div>
<div class="lead">${leadText}</div>

<h2>🔴 ACT</h2>
<div class="noted-line">No ACT-tier names today. ${act.length} qualified for the raw score gate but none combined a known cause with confirmed delivery — see WATCH below for the closest candidates.</div>

<h2>🟡 WATCH (${watch.length})</h2>
<table>
<tr><th>Company</th><th>+%</th><th>Streak</th><th>Deliv%</th><th>Deliv ₹Cr</th><th>Industry</th><th>Why</th></tr>
${watchRows}
</table>

<h2>⚪ NOTED (${noted.length})</h2>
<div class="noted-line">${notedLine}</div>

<h2>🏭 Sector clusters</h2>
${clusterBlocks || '<div class="noted-line">No cluster cleared the STRONG (≥3) delivery-confirmed threshold today.</div>'}

<h2>🔥 Streak board</h2>
<table>
<tr><th>Company</th><th>Streak</th><th>Tier</th><th>Deliv%</th><th>Deliv ₹Cr</th></tr>
${streakRows || '<tr><td colspan="5">No multi-day streaks today.</td></tr>'}
</table>

<div class="footer">
${d.total_analyzed} analysed · ACT ${act.length} · WATCH ${watch.length} · NOTED ${noted.length}<br/>
Data-availability note: the announcements API returned a 429 and 0 pages this run — every "unexplained" tag above reflects that gap (no filings were fetchable), not a confirmed absence of news. Delivery, price, and concall-sentiment data were fully available.
</div>
</div></body></html>`;

fs.writeFileSync(
  '/sessions/ecstatic-focused-noether/mnt/stockmarket/_gs_email_20260903.html',
  html
);
console.log('HTML written, length:', html.length);

sendHtmlEmail({ subject: `Daily Gainers Signal — ${MARKET_DATE}`, htmlBody: html })
  .then((r) => {
    console.log('SEND_RESULT', JSON.stringify(r));
  })
  .catch((e) => {
    console.error('SEND_ERROR', e);
    process.exitCode = 1;
  });
