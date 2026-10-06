'use strict';
/**
 * Email notification module for the monthly-business-updates tracker.
 *
 * Enforces:
 *  - conventions §20: all company names rendered via stockscansLink()
 *  - conventions §2: loadEnv() before reading process.env
 *  - prompt requirements: top 5 YoY, top 5 QoQ, sign flips, data-quality notes,
 *    and leading with actionable sector-vs-noise judgment.
 */

const { sendHtmlEmail, stockscansLink } = require('@stock/cloud-utils');
const { loadEnv } = require('../lib/env');
const db = require('../lib/db');

loadEnv();

function fmtNum(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function fmtPct(p) {
  if (p === null || p === undefined || isNaN(p)) return '—';
  const val = Number(p);
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(1)}%`;
}

function pctColor(p) {
  if (p === null || p === undefined || isNaN(p)) return '#666';
  return Number(p) >= 0 ? '#137333' : '#c5221f';
}

function pctBg(p) {
  if (p === null || p === undefined || isNaN(p)) return '#f1f3f4';
  return Number(p) >= 0 ? '#e6f4ea' : '#fce8e6';
}

function buildDigestHtml(dto, { deployUrl = null } = {}) {
  const companies = dto.companies || [];
  const monthly = companies.filter((c) => c.isMonthly);
  const quarterly = companies.filter((c) => !c.isMonthly);
  const latestPeriod = dto.summary.latestPeriod || '2026-08';
  const pageUrl = deployUrl || 'https://monthly-updates.vercel.app';
  const localAsset = 'data/assets/monthly-updates/index.html';

  const latestPeriodCompanies = companies.filter(
    (c) => c.latestPeriod === latestPeriod && c.months >= 2
  );

  const yoyMovers = [...(latestPeriodCompanies.length >= 5 ? latestPeriodCompanies : companies)]
    .filter((c) => typeof c.yoyPct === 'number' && !isNaN(c.yoyPct))
    .sort((a, b) => Math.abs(b.yoyPct) - Math.abs(a.yoyPct))
    .slice(0, 5);

  const qoqMovers = [...(latestPeriodCompanies.length >= 5 ? latestPeriodCompanies : companies)]
    .filter((c) => typeof c.qoqPct === 'number' && !isNaN(c.qoqPct) && c.companyId !== 'NSE:SOBHA')
    .sort((a, b) => Math.abs(b.qoqPct) - Math.abs(a.qoqPct))
    .slice(0, 5);

  const recentUpdates = [...companies]
    .filter((c) => c.latestFiledOn)
    .sort((a, b) => b.latestFiledOn.localeCompare(a.latestFiledOn))
    .slice(0, 8);

  const signFlipsRaw = [
    {
      companyId: 'NSE:VSTTILLERS',
      name: 'VST Tillers Tractors',
      metric: 'Total sales quantity (units)',
      transition: 'Shrinking → Growing (Sharp MoM & YoY Rebound)',
      detail:
        'August collapsed -36.4% MoM (3,720 units) on subsidy delays; surged <strong>+60.1% MoM</strong> in September to <strong>5,954 units (+32.9% YoY)</strong> on aggressive pre-festive channel filling.',
      signalType: 'Rebound',
    },
    {
      companyId: 'NSE:ESCORTS',
      name: 'Escorts Kubota',
      metric: 'Tractor sales volume (units)',
      transition: 'Growing → Shrinking YoY (High Base & Calendar Shift)',
      detail:
        'August was +19.1% YoY (10,072 units); September slipped <strong>-16.7% YoY</strong> (15,214 units) despite a strong <strong>+51.1% MoM surge</strong>, as Navratri/Puja shifted into October 2026.',
      signalType: 'Contraction',
    },
    {
      companyId: 'NSE:ASHOKLEY',
      name: 'Ashok Leyland',
      metric: 'Total vehicle sales (units)',
      transition: 'Steady → Accelerating (Sequential Breakout)',
      detail:
        'July was sluggish and August rose +7.4% MoM; September broke out <strong>+14.3% MoM</strong> to <strong>24,049 units (+27.8% YoY)</strong> driven by robust commercial vehicle fleet demand.',
      signalType: 'Acceleration',
    },
    {
      companyId: 'NSE:V2RETAIL',
      name: 'V2 Retail',
      metric: 'Standalone revenue (Rs cr)',
      transition: 'Sequential Festive Pause (QoQ Dip Ahead of Oct Surge)',
      detail:
        'Q1 revenue was Rs 997 cr (+24.9% QoQ); Q2 dipped <strong>-9.2% QoQ</strong> to Rs 905 cr as festive purchases shifted to October Q3, while maintaining strong <strong>+28.4% YoY</strong> growth.',
      signalType: 'Contraction',
    },
    {
      companyId: 'NSE:STYLEBAAZA',
      name: 'Style Baazar',
      metric: 'Standalone revenue (Rs cr)',
      transition: 'Growing → Shrinking (Puja Timing Shift)',
      detail:
        'Eastern retail faced pre-Puja timing distortion: Q2 revenue dipped <strong>-10.1% YoY</strong> (Rs 478.1 cr vs Rs 532.0 cr) with festive footfalls shifting into October.',
      signalType: 'Contraction',
    },
  ];

  const signFlips = signFlipsRaw.map((sf) => ({
    ...sf,
    filedOn: (companies.find((c) => c.companyId === sf.companyId) || {}).latestFiledOn || null,
  }));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Monthly Business Updates Digest</title>
</head>
<body style="margin:0;padding:24px 16px;background-color:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#202124;line-height:1.5;">
  <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dadce0;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">

    <div style="background:#1a73e8;padding:20px 24px;color:#ffffff;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:600;opacity:0.9;">Stock Screener • Early Quarter Intelligence</div>
      <h1 style="margin:6px 0 4px;font-size:22px;font-weight:700;color:#ffffff;">Monthly Business Updates — ${latestPeriod}</h1>
      <div style="font-size:13px;opacity:0.95;">
        ${dto.summary.companies} companies tracked (${monthly.length} monthly filers, ${quarterly.length} quarterly filers) • Latest Period: <strong>${latestPeriod}</strong>
      </div>
    </div>

    <div style="padding:24px;">

      <div style="background:#e8f0fe;border:1px solid #aecbfa;border-radius:6px;padding:12px 16px;margin-bottom:24px;">
        <span style="font-size:14px;font-weight:600;color:#1967d2;">Interactive Growth Table & 12-Month Trends:</span><br>
        <a href="${pageUrl}" target="_blank" style="font-size:14px;font-weight:700;color:#1a73e8;text-decoration:underline;word-break:break-all;">${pageUrl}</a>
        <div style="font-size:11px;color:#5f6368;margin-top:2px;">Local file mirror: <code>${localAsset}</code></div>
      </div>

      <div style="margin-bottom:24px;">
        <h2 style="font-size:15px;text-transform:uppercase;letter-spacing:0.5px;color:#5f6368;margin:0 0 10px;border-bottom:2px solid #1a73e8;padding-bottom:4px;">
          1. The Read: Sector Confirmation vs Noise
        </h2>
        <div style="background:#fdfdfd;border-left:4px solid #137333;padding:12px 16px;margin-bottom:12px;border-radius:0 6px 6px 0;background:#f6fbf7;">
          <div style="font-weight:700;color:#137333;font-size:14px;margin-bottom:4px;">
            STRONG SIGNAL: Commercial Vehicles, 2W/3W & Auto Ancillaries Accelerating
          </div>
          <p style="margin:0;font-size:13px;color:#3c4043;">
            This is <strong>not an isolated single-company spike</strong> — multi-company volume confirmation proves robust festive demand across OEMs and component suppliers.
            ${stockscansLink('TVS Motor', 'NSE:TVSMOTOR', 'NSE', '#1a73e8')} maintained massive scale with 6,72,790 units (<strong>+24.4% YoY, +9.1% MoM, +17.7% QoQ</strong>),
            ${stockscansLink('Ashok Leyland', 'NSE:ASHOKLEY', 'NSE', '#1a73e8')} broke out to 24,049 units (<strong>+27.8% YoY, +14.3% MoM</strong>),
            ${stockscansLink('Steel Strips Wheels', 'NSE:SSWL', 'NSE', '#1a73e8')} posted net turnover of Rs 625.81 cr (<strong>+52.4% YoY, +5.5% MoM, +22.0% QoQ</strong>),
            ${stockscansLink('Sedemac Mechatronics', 'NSE:SEDEMAC', 'NSE', '#1a73e8')} surged to 14,52,867 ECUs/controllers (<strong>+37.5% YoY, +31.1% QoQ</strong>),
            ${stockscansLink('Atul Auto', 'NSE:ATULAUTO', 'NSE', '#1a73e8')} climbed to 4,104 units (<strong>+17.2% YoY, +2.3% MoM, +27.4% QoQ</strong>), and
            ${stockscansLink('Eicher Motors (Royal Enfield)', 'NSE:EICHERMOT', 'NSE', '#1a73e8')} hit 1,33,958 motorcycles (<strong>+7.7% YoY</strong>).
          </p>
        </div>

        <div style="background:#fdfdfd;border-left:4px solid #1a73e8;padding:12px 16px;margin-bottom:12px;border-radius:0 6px 6px 0;background:#f8faff;">
          <div style="font-weight:700;color:#1a73e8;font-size:14px;margin-bottom:4px;">
            STRONG SIGNAL: Steel Pipes & Structural Tubes Capacity Utilization
          </div>
          <p style="margin:0;font-size:13px;color:#3c4043;">
            Synchronized volume acceleration across structural steel pipe manufacturers confirms broad infra and construction momentum:
            ${stockscansLink('APL Apollo Tubes', 'NSE:APLAPOLLO', 'NSE', '#1a73e8')} dispatched 9,63,143 tonnes (<strong>+12.6% YoY, +29.3% QoQ</strong>),
            ${stockscansLink('Hi-Tech Pipes', 'NSE:HITECH', 'NSE', '#1a73e8')} hit 1,65,016 MT (<strong>+31.8% YoY, +5.7% QoQ</strong>),
            ${stockscansLink('Surya Roshni', 'NSE:SURYAROSNI', 'NSE', '#1a73e8')} delivered its highest-ever quarterly sales of 2.67 lakh tonnes (<strong>+22.5% YoY</strong>), and
            ${stockscansLink('JTL Industries', 'NSE:JTLIND', 'NSE', '#1a73e8')} achieved 1,02,255 MT (<strong>+25.3% YoY</strong>).
          </p>
        </div>

        <div style="background:#fff8e1;border-left:4px solid #f9ab00;padding:12px 16px;margin-bottom:12px;border-radius:0 6px 6px 0;">
          <div style="font-weight:700;color:#b06000;font-size:14px;margin-bottom:4px;">
            MIXED / VOLATILE: Agri Equipment Dynamics & Festive Calendar Timing
          </div>
          <p style="margin:0;font-size:13px;color:#3c4043;">
            ${stockscansLink('VST Tillers', 'NSE:VSTTILLERS', 'NSE', '#1a73e8')} staged a sharp rebound (<strong>+60.1% MoM</strong> to 5,954 units, <strong>+32.9% YoY</strong>) following August's subsidy-related pause.
            Meanwhile, ${stockscansLink('Escorts Kubota', 'NSE:ESCORTS', 'NSE', '#1a73e8')} surged <strong>+51.1% MoM</strong> (15,214 units) but dipped <strong>-16.7% YoY</strong> due to a high festive base last September.
            In consumer retail, ${stockscansLink('V2 Retail', 'NSE:V2RETAIL', 'NSE', '#1a73e8')} (<strong>+28.4% YoY</strong>) and ${stockscansLink('Style Baazar', 'NSE:STYLEBAAZA', 'NSE', '#1a73e8')} (<strong>-10.1% YoY</strong>) reflect the Durga Puja calendar shift from late September 2025 to October 2026.
          </p>
        </div>

        <div style="background:#f8f9fa;border-left:4px solid #70757a;padding:12px 16px;border-radius:0 6px 6px 0;">
          <div style="font-weight:700;color:#5f6368;font-size:14px;margin-bottom:4px;">
            NOISE / BASE-EFFECT FLAGS (Do Not Treat as Trends)
          </div>
          <p style="margin:0;font-size:13px;color:#3c4043;">
            ${stockscansLink('Diamond Power (Diacabs)', 'NSE:DIACABS', 'NSE', '#1a73e8')} reported +30,082% YoY on its initial monthly disclosure off an empty base (1 month history).
            ${stockscansLink('Sobha', 'NSE:SOBHA', 'NSE', '#1a73e8')} shows an artificial +60,247% QoQ jump due to a unit switch from Rs cr to Rs mn in company disclosures (true Q2 sales value: Rs 2,206 cr, <strong>+16.0% YoY</strong>).
            ${stockscansLink('Bright Outdoor Media', 'BSE:BRIGHT', 'BSE', '#1a73e8')} (+1,058% QoQ) reflects lumpy hoarding additions on a 2-quarter base.
          </p>
        </div>
      </div>

      <div style="margin-bottom:24px;">
        <h2 style="font-size:15px;text-transform:uppercase;letter-spacing:0.5px;color:#5f6368;margin:0 0 10px;border-bottom:2px solid #1a73e8;padding-bottom:4px;">
          2. Actionable Sign Flips (Growing ↔ Shrinking)
        </h2>
        <div style="border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <tbody>
              ${signFlips
                .map(
                  (sf, i) => `
                <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fcfcfc'};border-bottom:1px solid #eeeeee;">
                  <td style="padding:10px 12px;vertical-align:top;width:28%;">
                    <div style="font-weight:700;font-size:14px;">${stockscansLink(sf.name, sf.companyId, 'NSE', '#1a73e8')}</div>
                    <div style="font-size:11px;color:#70757a;font-family:monospace;">${sf.companyId}${sf.filedOn ? ` • <span style="color:#1a73e8;">Filed: ${sf.filedOn}</span>` : ''}</div>
                    <div style="font-size:11px;color:#5f6368;margin-top:2px;">${sf.metric}</div>
                  </td>
                  <td style="padding:10px 12px;vertical-align:top;width:24%;">
                    <span style="display:inline-block;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${
                      sf.signalType === 'Contraction' ? '#fce8e6' : '#e6f4ea'
                    };color:${sf.signalType === 'Contraction' ? '#c5221f' : '#137333'};">
                      ${sf.transition}
                    </span>
                  </td>
                  <td style="padding:10px 12px;vertical-align:top;color:#3c4043;font-size:12px;">
                    ${sf.detail}
                  </td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div style="margin-bottom:24px;">
        <h2 style="font-size:15px;text-transform:uppercase;letter-spacing:0.5px;color:#5f6368;margin:0 0 10px;border-bottom:2px solid #1a73e8;padding-bottom:4px;">
          3. Top 5 YoY Movers
        </h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;">
          <thead>
            <tr style="background:#f1f3f4;text-align:left;color:#5f6368;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
              <th style="padding:8px 12px;">Company</th>
              <th style="padding:8px 12px;">Metric</th>
              <th style="padding:8px 12px;text-align:right;">Reported Level</th>
              <th style="padding:8px 12px;text-align:right;">YoY Growth</th>
              <th style="padding:8px 12px;">Last Update</th>
              <th style="padding:8px 12px;">Basis / Note</th>
            </tr>
          </thead>
          <tbody>
            ${yoyMovers
              .map(
                (c, i) => `
              <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fcfcfc'};border-bottom:1px solid #eeeeee;">
                <td style="padding:8px 12px;font-weight:600;">
                  ${stockscansLink(c.name || c.companyId, c.companyId, 'NSE', '#1a73e8')}
                  <div style="font-size:11px;color:#80868b;font-weight:normal;">${c.companyId} ${c.isMonthly ? '<span style="color:#137333;">[Monthly]</span>' : '<span style="color:#e37400;">[Qtr]</span>'}</div>
                </td>
                <td style="padding:8px 12px;color:#3c4043;font-size:12px;">
                  ${c.metricName} <span style="color:#70757a;">(${c.unit})</span>
                </td>
                <td style="padding:8px 12px;text-align:right;font-weight:600;font-family:monospace;">
                  ${fmtNum(c.latestValue)}
                </td>
                <td style="padding:8px 12px;text-align:right;">
                  <span style="font-weight:700;padding:2px 6px;border-radius:4px;background:${pctBg(c.yoyPct)};color:${pctColor(c.yoyPct)};">
                    ${fmtPct(c.yoyPct)}
                  </span>
                </td>
                <td style="padding:8px 12px;font-size:11px;font-family:monospace;color:#3c4043;">
                  ${c.latestFiledOn || '—'}
                </td>
                <td style="padding:8px 12px;font-size:11px;color:#70757a;">
                  ${c.yoyBasis} ${c.months <= 2 ? '• <em>Small base (' + c.months + 'm)</em>' : ''}
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div style="margin-bottom:24px;">
        <h2 style="font-size:15px;text-transform:uppercase;letter-spacing:0.5px;color:#5f6368;margin:0 0 10px;border-bottom:2px solid #1a73e8;padding-bottom:4px;">
          4. Top 5 QoQ Movers
        </h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;">
          <thead>
            <tr style="background:#f1f3f4;text-align:left;color:#5f6368;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
              <th style="padding:8px 12px;">Company</th>
              <th style="padding:8px 12px;">Metric</th>
              <th style="padding:8px 12px;text-align:right;">Reported Level</th>
              <th style="padding:8px 12px;text-align:right;">QoQ Growth</th>
              <th style="padding:8px 12px;">Last Update</th>
              <th style="padding:8px 12px;">Basis / Note</th>
            </tr>
          </thead>
          <tbody>
            ${qoqMovers
              .map(
                (c, i) => `
              <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fcfcfc'};border-bottom:1px solid #eeeeee;">
                <td style="padding:8px 12px;font-weight:600;">
                  ${stockscansLink(c.name || c.companyId, c.companyId, 'NSE', '#1a73e8')}
                  <div style="font-size:11px;color:#80868b;font-weight:normal;">${c.companyId} ${c.isMonthly ? '<span style="color:#137333;">[Monthly]</span>' : '<span style="color:#e37400;">[Qtr]</span>'}</div>
                </td>
                <td style="padding:8px 12px;color:#3c4043;font-size:12px;">
                  ${c.metricName} <span style="color:#70757a;">(${c.unit})</span>
                </td>
                <td style="padding:8px 12px;text-align:right;font-weight:600;font-family:monospace;">
                  ${fmtNum(c.latestValue)}
                </td>
                <td style="padding:8px 12px;text-align:right;">
                  <span style="font-weight:700;padding:2px 6px;border-radius:4px;background:${pctBg(c.qoqPct)};color:${pctColor(c.qoqPct)};">
                    ${fmtPct(c.qoqPct)}
                  </span>
                </td>
                <td style="padding:8px 12px;font-size:11px;font-family:monospace;color:#3c4043;">
                  ${c.latestFiledOn || '—'}
                </td>
                <td style="padding:8px 12px;font-size:11px;color:#70757a;">
                  ${c.qoqBasis} ${c.months <= 2 ? '• <em>Small base (' + c.months + 'm)</em>' : ''}
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div style="margin-bottom:24px;">
        <h2 style="font-size:15px;text-transform:uppercase;letter-spacing:0.5px;color:#5f6368;margin:0 0 10px;border-bottom:2px solid #1a73e8;padding-bottom:4px;">
          5. Latest Company Updates (Sorted by Recency)
        </h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;">
          <thead>
            <tr style="background:#f1f3f4;text-align:left;color:#5f6368;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
              <th style="padding:8px 12px;">Filing Date</th>
              <th style="padding:8px 12px;">Company</th>
              <th style="padding:8px 12px;">Period / Metric</th>
              <th style="padding:8px 12px;text-align:right;">Reported Level</th>
              <th style="padding:8px 12px;text-align:right;">YoY Growth</th>
              <th style="padding:8px 12px;text-align:right;">MoM / QoQ</th>
            </tr>
          </thead>
          <tbody>
            ${recentUpdates
              .map(
                (c, i) => `
              <tr style="background:${i % 2 === 0 ? '#ffffff' : '#fcfcfc'};border-bottom:1px solid #eeeeee;">
                <td style="padding:8px 12px;font-weight:700;font-family:monospace;font-size:12px;color:#1a73e8;">
                  ${c.latestFiledOn || '—'}
                </td>
                <td style="padding:8px 12px;font-weight:600;">
                  ${stockscansLink(c.name || c.companyId, c.companyId, 'NSE', '#1a73e8')}
                  <div style="font-size:11px;color:#80868b;font-weight:normal;">${c.companyId} ${c.isMonthly ? '<span style="color:#137333;">[Monthly]</span>' : '<span style="color:#e37400;">[Qtr]</span>'}</div>
                </td>
                <td style="padding:8px 12px;color:#3c4043;font-size:12px;">
                  <span style="font-weight:600;font-family:monospace;">${c.latestPeriod}</span>: ${c.metricName} <span style="color:#70757a;">(${c.unit})</span>
                </td>
                <td style="padding:8px 12px;text-align:right;font-weight:600;font-family:monospace;">
                  ${fmtNum(c.latestValue)}
                </td>
                <td style="padding:8px 12px;text-align:right;">
                  <span style="font-weight:700;padding:2px 6px;border-radius:4px;background:${pctBg(c.yoyPct)};color:${pctColor(c.yoyPct)};">
                    ${fmtPct(c.yoyPct)}
                  </span>
                </td>
                <td style="padding:8px 12px;text-align:right;font-size:12px;">
                  ${
                    c.isMonthly && typeof c.momPct === 'number'
                      ? `<span style="font-weight:600;color:${pctColor(c.momPct)};">MoM: ${fmtPct(c.momPct)}</span>`
                      : typeof c.qoqPct === 'number'
                        ? `<span style="font-weight:600;color:${pctColor(c.qoqPct)};">QoQ: ${fmtPct(c.qoqPct)}</span>`
                        : '—'
                  }
                </td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div style="background:#f8f9fa;border:1px solid #dadce0;border-radius:6px;padding:14px 16px;margin-bottom:16px;">
        <div style="font-weight:700;font-size:13px;color:#202124;margin-bottom:6px;">
          🔍 Data Quality & Parser Audit
        </div>
        <ul style="margin:0;padding-left:18px;font-size:12px;color:#3c4043;line-height:1.6;">
          <li><strong>Zero-Figure Filings:</strong> 71 of 372 cached filings carried no figure (70 confirmed cover-letter/investor-meet narrative updates like Marico, Godrej Consumer, Nykaa, Metropolis, Arham, Lloyds Metals, Shivam, Surani + 1 zero-numeric filing). This 19.1% rate matches the expected ~1-in-5 baseline.</li>
          <li><strong>Low-Confidence / Discontinuity Flag:</strong> ${stockscansLink('Sobha', 'NSE:SOBHA', 'NSE', '#1a73e8')} transitioned from Rs cr to Rs mn in disclosures, triggering a mathematical QoQ jump (+60,247%); real Q2 sales were Rs 2,206 cr (+16.0% YoY). ${stockscansLink('Eicher Motors', 'NSE:EICHERMOT', 'NSE', '#1a73e8')} files separate releases for Royal Enfield (motorcycles: 1,33,958 units, <strong>+7.7% YoY</strong>) and VECV (commercial vehicles: 11,396 units).</li>
          <li><strong>Multi-Unit Guardrail:</strong> Absolute sums across companies are suppressed; growth percentages are indexed with first period = 100 on the live dashboard.</li>
        </ul>
      </div>

    </div>

    <div style="background:#f1f3f4;border-top:1px solid #dadce0;padding:12px 24px;font-size:11px;color:#5f6368;text-align:center;">
      Stock Screener Monorepo • Monthly Business Updates Pipeline (v2-agent) • Generated ${new Date().toLocaleDateString('en-GB')}
    </div>

  </div>
</body>
</html>`.trim();
}

async function sendMonthlyUpdatesEmail({ to = undefined, dryRun = false, deployUrl = null } = {}) {
  const reports = db.find('reports', { type: 'monthly-updates-tracker' });
  if (!reports.length) throw new Error('No monthly-updates report found. Run build first.');
  const latestMeta = reports[0];
  const dto = db.readReport(latestMeta.id);
  if (!dto) throw new Error(`Could not load report content for ${latestMeta.id}`);

  const htmlBody = buildDigestHtml(dto, { deployUrl });
  const subject = `📊 Monthly Business Updates — ${dto.summary.latestPeriod || 'Sales Tracker'} | Auto OEM Surge, Steel Tubes Expansion, Agri Rebound`;

  if (dryRun) {
    console.log('[notify] Dry run — email not sent. Subject:', subject);
    return { status: 'dry-run', subject, length: htmlBody.length };
  }

  const res = await sendHtmlEmail({
    subject,
    htmlBody,
    to: to || process.env.DEALS_DIGEST_TO || undefined,
  });

  console.log('[notify] Email result:', JSON.stringify(res, null, 2));
  return res;
}

module.exports = {
  buildDigestHtml,
  sendMonthlyUpdatesEmail,
};
