'use strict';

const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../lib/env');
const { sendHtmlEmail, stockscansLink } = require('../lib/emailService');

loadEnv('/Users/darshan.patel/code/personal/stockmarket/.env');
if (process.env.GOOGLE_APP_PASSWORD) {
  process.env.GOOGLE_APP_PASSWORD = process.env.GOOGLE_APP_PASSWORD.split('#')[0].replace(/\s+/g, '');
}

const dataDir = process.env.GAINERS_OUTPUT_DIR || path.join(__dirname, '../data/daily_gainers');
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('_insights.json')).sort();
if (files.length === 0) {
  console.error('No insights JSON found in ' + dataDir);
  process.exit(1);
}
const latestFile = path.join(dataDir, files[files.length - 1]);
console.log('Reading insights from:', latestFile);

const insights = JSON.parse(fs.readFileSync(latestFile, 'utf8'));

const marketDate = insights.market_date;
const totalAnalyzed = insights.total_analyzed;
const inEmail = insights.in_email;
const noiseExcluded = insights.noise_excluded;
const annApiAvail = insights.ann_api_available;
const priceApiAvail = insights.price_api_available;

const signals = insights.signals.filter(s => s.in_email);

const fundamental = signals.filter(s => s.primary_driver === 'FUNDAMENTAL');
const priceAction = signals.filter(s => s.primary_driver === 'PRICE_ACTION');
const sectorCatalysts = insights.sector_catalysts || {};

const highPa = priceAction.filter(s => s.conviction === 'HIGH');
const mediumPa = priceAction.filter(s => s.conviction === 'MEDIUM');

function renderStockCard(s) {
  const retStr = s.return_1d ? `+${s.return_1d.toFixed(2)}%` : '';
  const convBadgeColor = s.conviction === 'HIGH' 
    ? 'background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3);' 
    : 'background: rgba(234, 179, 8, 0.15); color: #fde047; border: 1px solid rgba(234, 179, 8, 0.3);';

  const evItems = (s.evidence || []).map(ev => {
    let style = 'color: #cbd5e1;';
    if (ev.includes('📋')) {
      style = 'color: #38bdf8; font-weight: 600;';
    } else if (ev.includes('⚡')) {
      style = 'color: #4ade80; font-weight: 500;';
    } else if (ev.includes('⚠️')) {
      style = 'color: #fbbf24; font-size: 13px;';
    }
    return `<li style="margin-bottom: 4px; ${style}">${ev}</li>`;
  }).join('');

  return `
    <div style="background-color: #1e2230; border: 1px solid #2e3447; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
        <div>
          <span style="font-size: 16px; font-weight: 700; color: #f8fafc;">${stockscansLink(s.name, s.ticker, 'NSE', '#f8fafc')}</span>
          <span style="font-size: 13px; color: #94a3b8; margin-left: 6px;">(${s.ticker})</span>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${s.industry || 'General'} · Mcap: ₹${s.market_cap_cr ? s.market_cap_cr.toLocaleString('en-IN') : 'N/A'} Cr</div>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 16px; font-weight: 700; color: #22c55e;">${retStr}</span>
          <div style="margin-top: 4px;">
            <span style="display: inline-block; padding: 2px 8px; font-size: 11px; font-weight: 600; border-radius: 4px; ${convBadgeColor}">${s.conviction}</span>
          </div>
        </div>
      </div>
      <ul style="margin: 8px 0 0 0; padding-left: 20px; font-size: 13px; line-height: 1.5;">
        ${evItems}
      </ul>
    </div>
  `;
}

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily Gainers Signal — ${marketDate}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f1117; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <div style="max-width: 680px; margin: 0 auto; padding: 24px 16px;">
    
    <!-- HEADER -->
    <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border: 1px solid #334155; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
      <div style="font-size: 12px; font-weight: 700; letter-spacing: 1px; color: #38bdf8; text-transform: uppercase; margin-bottom: 6px;">
        Market Intelligence Briefing
      </div>
      <h1 style="margin: 0 0 12px 0; font-size: 24px; font-weight: 800; color: #f8fafc;">
        Daily Gainers Signal — ${marketDate}
      </h1>
      <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
        Analyzed <strong style="color: #f8fafc;">${totalAnalyzed}</strong> top gainers meeting quality filters. A total of <strong style="color: #38bdf8;">${inEmail} high/medium conviction signals</strong> qualified for today's briefing, while <strong style="color: #64748b;">${noiseExcluded} noise/low-conviction</strong> items were excluded.
      </p>
      <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #94a3b8;">
        <strong>Market Overview:</strong> No material fundamental announcement catalysts triggered today — primary drivers are price-action breakouts backed by strong delivery volume (led by BSE small-to-mid caps and select NSE movers). Corporate filings were active and scanned (${annApiAvail ? 'Announcements API available' : 'Announcements API unavailable'}), while price-history candles were ${priceApiAvail ? 'available' : 'temporarily unavailable'}.
      </p>
    </div>

    <!-- FUNDAMENTAL MOVERS -->
    ${fundamental.length > 0 ? `
    <div style="margin-bottom: 28px;">
      <h2 style="font-size: 16px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #2e3447; padding-bottom: 8px; margin-bottom: 16px;">
        📋 Fundamental Movers (${fundamental.length})
      </h2>
      ${fundamental.map(renderStockCard).join('')}
    </div>
    ` : ''}

    <!-- SECTOR CATALYSTS -->
    ${Object.keys(sectorCatalysts).length > 0 ? `
    <div style="margin-bottom: 28px;">
      <h2 style="font-size: 16px; font-weight: 700; color: #a855f7; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #2e3447; padding-bottom: 8px; margin-bottom: 16px;">
        🏭 Sector Catalysts
      </h2>
      ${Object.entries(sectorCatalysts).map(([ind, data]) => `
        <div style="background-color: #1e2230; border: 1px solid #2e3447; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
          <div style="font-size: 15px; font-weight: 700; color: #f8fafc; margin-bottom: 4px;">${ind}</div>
          <div style="font-size: 13px; color: #94a3b8;">Avg Return: <strong style="color: #22c55e;">+${data.avg_return}%</strong> · Tickers: ${data.tickers.join(', ')}</div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- PRICE ACTION BREAKOUTS (HIGH CONVICTION) -->
    ${highPa.length > 0 ? `
    <div style="margin-bottom: 28px;">
      <h2 style="font-size: 16px; font-weight: 700; color: #4ade80; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #2e3447; padding-bottom: 8px; margin-bottom: 16px;">
        🚀 Price Action Breakouts — High Conviction (${highPa.length})
      </h2>
      ${highPa.map(renderStockCard).join('')}
    </div>
    ` : ''}

    <!-- PRICE ACTION BREAKOUTS (MEDIUM CONVICTION) -->
    ${mediumPa.length > 0 ? `
    <div style="margin-bottom: 28px;">
      <h2 style="font-size: 16px; font-weight: 700; color: #fde047; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #2e3447; padding-bottom: 8px; margin-bottom: 16px;">
        📈 Price Action Breakouts — Medium Conviction (${mediumPa.length})
      </h2>
      ${mediumPa.map(renderStockCard).join('')}
    </div>
    ` : ''}

    <!-- FOOTER -->
    <div style="border-top: 1px solid #2e3447; padding-top: 16px; text-align: center; font-size: 12px; color: #64748b;">
      ${totalAnalyzed} analyzed · ${inEmail} signals · ${noiseExcluded} noise
      <div style="margin-top: 4px;">Automated Cowork-Jobs · Daily Gainers Signal Engine</div>
    </div>

  </div>
</body>
</html>
`;

const htmlPath = '/tmp/gainers_email.html';
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Wrote email HTML to:', htmlPath);

const subject = `Daily Gainers Signal — ${marketDate}`;
console.log('Sending email with subject:', subject);

sendHtmlEmail({ subject, htmlBody: html })
  .then(res => {
    console.log('Send result:', JSON.stringify(res));
  })
  .catch(err => {
    console.error('Send error:', err);
  });
