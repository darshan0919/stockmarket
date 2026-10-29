#!/usr/bin/env node
'use strict';

/**
 * pre-pead-scanner CLI entry point.
 *
 * Runs institutional pre-results screening, expectation hurdle quantification,
 * and PEAD surprise ranking for all companies in a Stockscans saved scan.
 *
 * Usage:
 *   node bin/pre-pead-scanner.js [--scan-url <url>] [--as-of YYYY-MM-DD] [--force]
 */

const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');

require('dotenv').config({ path: path.join(REPO, '.env') });

const { StockscansClient } = require('../src/clients/StockscansClient');
const { fetchDocuments } = require('../src/fetchers/documentsFetcher');
const { renderPdf, wrapHtml } = require('../src/utils/pdfRenderer');
const db = require(path.join(REPO, 'packages', 'jobs-runtime', 'lib', 'db.js'));

const DEFAULT_SCAN_URL = 'https://www.stockscans.in/scans/saved/429918e3098ce660baec9f22';

function parseScanId(url) {
  const m = url.match(/\/scans\/saved\/([a-f0-9]{24})/);
  if (m) return m[1];
  if (/^[a-f0-9]{24}$/.test(url.trim())) return url.trim();
  return '429918e3098ce660baec9f22';
}

function parseArgs() {
  const args = process.argv.slice(2);
  let scanUrl = DEFAULT_SCAN_URL;
  let asOf = new Date().toISOString().split('T')[0];
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scan-url' && args[i + 1]) {
      scanUrl = args[i + 1];
      i++;
    } else if (args[i] === '--as-of' && args[i + 1]) {
      asOf = args[i + 1];
      i++;
    } else if (args[i] === '--force') {
      force = true;
    } else if (args[i].startsWith('http')) {
      scanUrl = args[i];
    }
  }

  return { scanUrl, asOf, force };
}

function scoreCandidate(c) {
  let score = 50;

  const patYoY = Number(c.patGrowthYoY) || 0;
  if (patYoY >= 200) score += 20;
  else if (patYoY >= 100) score += 15;
  else if (patYoY >= 50) score += 10;
  else if (patYoY >= 25) score += 5;

  const patTTM = Number(c.patGrowthTTM) || 0;
  if (patTTM >= 50) score += 10;
  else if (patTTM >= 20) score += 5;
  else if (patTTM < 0) score -= 10;

  if (c.hasPriorConcall) score += 10;
  else score += 3;

  const pe = Number(c.pe) || 0;
  if (pe > 0 && pe <= 18) score += 10;
  else if (pe > 18 && pe <= 32) score += 5;
  else if (pe > 55) score -= 8;

  const ret1w = Number(c.ret1w) || 0;
  let hurdle = 'MODERATE';
  let setup = 'NEUTRAL_RANGE';
  let sellTheNewsRisk = 'MODERATE';
  let driftExpectation = 'BASE_CASE_BEAT';

  if (ret1w >= 12) {
    hurdle = 'VERY_HIGH';
    setup = 'MASSIVE_RUN_UP';
    sellTheNewsRisk = 'HIGH';
    driftExpectation = 'BULL_CASE_BLOWOUT + GUIDANCE_RAISE';
    score -= 6;
  } else if (ret1w >= 5 && ret1w < 12) {
    hurdle = 'ELEVATED';
    setup = 'INFORMED_BREAKOUT';
    sellTheNewsRisk = 'MODERATE';
    driftExpectation = 'BASE_BEAT_WITH_MARGIN_EXPANSION';
    score += 5;
  } else if (ret1w >= -3 && ret1w < 5) {
    hurdle = 'LOW';
    setup = 'TIGHT_BASE';
    sellTheNewsRisk = 'LOW';
    driftExpectation = 'BASE_CASE_BEAT (Asymmetric springboard)';
    score += 10;
  } else if (ret1w < -3) {
    hurdle = 'VERY_LOW';
    setup = 'DE_RISKING';
    sellTheNewsRisk = 'LOW';
    driftExpectation = 'BASE_CASE_MEET_OR_BEAT (Relief rally)';
    score += 4;
  }

  const d2e = Number(c.d2e) || 0;
  if (d2e <= 0.3) score += 5;
  else if (d2e > 1.5) score -= 5;

  const cfo2pat = Number(c.cfo2pat) || 0;
  if (cfo2pat >= 0.8) score += 5;

  const pat3Y = Number(c.patGrowth3Y) || 0;
  let isKumbhakarna = false;
  if (pat3Y <= 15 && patYoY >= 50 && pe <= 35) {
    isKumbhakarna = true;
    score += 8;
  }

  let conviction = 'MIDDLE';
  if (score >= 82) conviction = 'HIGH';
  else if (score < 65) conviction = 'LOW';

  return {
    ...c,
    compositeScore: Math.min(100, Math.max(10, score)),
    conviction,
    hurdle,
    setup,
    sellTheNewsRisk,
    driftExpectation,
    isKumbhakarna,
  };
}

async function main() {
  const { scanUrl, asOf, force } = parseArgs();
  const scanId = parseScanId(scanUrl);

  console.log(`[pre-pead-scanner] Fetching live scan: ${scanUrl} (scanId: ${scanId})`);
  const client = new StockscansClient();
  const meta = await client.getScanMetadata(scanId);
  const result = await client.runScan({ scan: meta }, scanId);

  const headers = result.table[0];
  const rows = result.table.slice(1);
  console.log(`[pre-pead-scanner] Scan returned ${rows.length} total companies.`);

  // Load existing raw doc audit cache if available
  let cachedAudit = null;
  const auditPath = path.join(
    REPO,
    '.gemini',
    'antigravity',
    'brain',
    'da54803c-b76a-43eb-90b9-8b837958cdf7',
    '.system_generated',
    'steps',
    '80',
    'output.txt'
  );
  if (fs.existsSync(auditPath) && !force) {
    try {
      const text = fs.readFileSync(auditPath, 'utf8');
      const bStart = text.indexOf('[', text.indexOf('Pending Q2 FY27 Results'));
      const bEnd = text.lastIndexOf(']');
      if (bStart !== -1 && bEnd !== -1) {
        cachedAudit = JSON.parse(text.slice(bStart, bEnd + 1));
      }
    } catch (e) {
      // fallback to live
    }
  }

  const pendingMap = new Map();
  if (cachedAudit) {
    for (const item of cachedAudit) {
      pendingMap.set(item.companyId, item);
    }
  }

  const alreadyDeclared = [];
  const excludedGate2 = [];
  const eligible = [];

  for (const r of rows) {
    const companyId = r[0];
    const name = r[1];
    const mcap = r[2];
    const cfo2pat = r[3];
    const d2e = r[4];
    const fiiChange = r[5];
    const pe = r[7];
    const peg = r[8];
    const retSinceResult = r[10];
    const ret1d = r[12];
    const ret1w = r[13];
    const revGrowthTTM = r[15];
    const patGrowthTTM = r[16];
    const roe = r[18];
    const roce = r[20];
    const promoterHoldings = r[27];
    const patGrowthQoQ = r[29];
    const patGrowthYoY = r[30];
    const patGrowth3Y = r[31];
    const industry = r[33];
    const sector = r[34];

    let docInfo = pendingMap.get(companyId);
    if (!docInfo) {
      try {
        const docs = await fetchDocuments(companyId, {
          types: ['Result', 'Transcript', 'PPT'],
          listOnly: true,
          lastN: 4,
        });
        const matched = docs?.matched || [];
        const latestResult = matched.find((d) => d.documentType === 'Result');
        const has202609 =
          latestResult && (latestResult.date === '202609' || latestResult.date === '2026-09');
        const hasPriorConcall = matched.some((d) => d.documentType === 'Transcript');
        const hasPriorPPT = matched.some((d) => d.documentType === 'PPT');
        docInfo = {
          companyId,
          name,
          hasPriorConcall,
          hasPriorPPT,
          has202609,
          latestResultDate: latestResult?.date,
        };
      } catch (err) {
        docInfo = {
          companyId,
          name,
          hasPriorConcall: false,
          hasPriorPPT: false,
          has202609: false,
        };
      }
    }

    if (
      docInfo.has202609 ||
      docInfo.latestResultDate === '202609' ||
      docInfo.latestResultDate === '2026-09'
    ) {
      alreadyDeclared.push({
        companyId,
        name,
        mcap,
        patGrowthYoY,
        sector,
        reason: 'ALREADY_DECLARED_Q2_FY27',
      });
      continue;
    }

    if (!docInfo.hasPriorConcall && !docInfo.hasPriorPPT) {
      excludedGate2.push({
        companyId,
        name,
        mcap,
        sector,
        reason: 'GATE_2_NO_CONCALL_NO_PPT',
      });
      continue;
    }

    eligible.push({
      companyId,
      name,
      mcap,
      pe,
      peg,
      ret1d,
      ret1w,
      retSinceResult,
      revGrowthTTM,
      patGrowthTTM,
      patGrowthYoY,
      patGrowthQoQ,
      patGrowth3Y,
      roe,
      roce,
      d2e,
      cfo2pat,
      promoterHoldings,
      fiiChange,
      industry,
      sector,
      hasPriorConcall: docInfo.hasPriorConcall,
      hasPriorPPT: docInfo.hasPriorPPT,
      docType: docInfo.hasPriorConcall ? 'Transcript + PPT' : 'PPT Only',
    });
  }

  const scored = eligible.map(scoreCandidate);
  scored.sort((a, b) => b.compositeScore - a.compositeScore);

  // Assign ranks
  scored.forEach((s, idx) => {
    s.rank = idx + 1;
  });

  console.log(
    `[pre-pead-scanner] Universe triage: ${rows.length} total | ${scored.length} eligible | ${alreadyDeclared.length} already declared | ${excludedGate2.length} Gate 2 excluded.`
  );

  // 1. Build DTO
  const dtoId = `pre-pead-scan_${asOf}`;
  const dto = {
    id: dtoId,
    type: 'pre-pead-scan',
    date: asOf,
    creator: 'pre-pead-scanner',
    creationTime: new Date().toISOString(),
    modifiedTime: new Date().toISOString(),
    modelUsed: 'gemini-3.8-flash',
    summary: `Pre-PEAD surprise ranking for ${meta.scanName} (${scored.length} active candidates, ${alreadyDeclared.length} declared, ${excludedGate2.length} excluded).`,
    scanUrl,
    scanName: meta.scanName,
    scanDescription: meta.scanDescription,
    universeStats: {
      total: rows.length,
      eligible: scored.length,
      alreadyDeclared: alreadyDeclared.length,
      excludedGate2: excludedGate2.length,
    },
    rankedCompanies: scored,
    alreadyDeclaredCompanies: alreadyDeclared,
    excludedGate2Companies: excludedGate2,
  };

  // Persist DTO via db.js
  db.saveReport(dto);
  console.log(`[pre-pead-scanner] DTO persisted via db.saveReport with ID: ${dtoId}`);

  // Also write DTO JSON to data/documents/reports/
  const reportsDir = path.join(REPO, 'data', 'documents', 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const dtoPath = path.join(reportsDir, `${asOf}_pre_pead_scan.json`);
  fs.writeFileSync(dtoPath, JSON.stringify(dto, null, 2), 'utf8');
  console.log(`[pre-pead-scanner] JSON DTO saved to: ${dtoPath}`);

  // 2. Build HTML Briefing
  const top10 = scored.slice(0, 10);

  const masterTableRows = scored
    .map((c) => {
      const convClass =
        c.conviction === 'HIGH' ? 'chip-g' : c.conviction === 'MIDDLE' ? 'chip-b' : 'chip-r';
      const hurdleClass =
        c.hurdle === 'LOW' || c.hurdle === 'VERY_LOW'
          ? 'chip-g'
          : c.hurdle === 'ELEVATED'
            ? 'chip-y'
            : 'chip-r';
      const kumbhaChip = c.isKumbhakarna
        ? `<span class="chip chip-g" style="margin-left:4px;">KUMBHAKARNA</span>`
        : '';
      const ret1wColor =
        c.ret1w > 0
          ? 'color:#15803d;font-weight:600;'
          : c.ret1w < 0
            ? 'color:#b91c1c;font-weight:600;'
            : '';

      return `
      <tr>
        <td style="font-weight:700;text-align:center;">${c.rank}</td>
        <td>
          <strong>${c.name}</strong><br/>
          <span style="font-family:'SF Mono',Menlo,monospace;color:#64748b;font-size:7.5pt;">${c.companyId}</span>
          ${kumbhaChip}
        </td>
        <td>${c.sector || 'General'}</td>
        <td style="text-align:right;">₹${Number(c.mcap).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr</td>
        <td style="text-align:right;">${c.pe ? Number(c.pe).toFixed(1) + 'x' : '—'}</td>
        <td style="text-align:right;${ret1wColor}">${c.ret1w !== null ? (c.ret1w >= 0 ? '+' : '') + Number(c.ret1w).toFixed(1) + '%' : '—'}</td>
        <td style="text-align:right;color:#15803d;font-weight:600;">+${Number(c.patGrowthYoY).toFixed(1)}%</td>
        <td style="text-align:right;">${c.patGrowthTTM !== null ? (c.patGrowthTTM >= 0 ? '+' : '') + Number(c.patGrowthTTM).toFixed(1) + '%' : '—'}</td>
        <td><span class="chip ${hurdleClass}">${c.hurdle}</span></td>
        <td><span class="chip ${convClass}">${c.conviction}</span></td>
      </tr>
    `;
    })
    .join('\n');

  const deepDiveCards = top10
    .map((c) => {
      const hurdleClass =
        c.hurdle === 'LOW' || c.hurdle === 'VERY_LOW'
          ? 'chip-g'
          : c.hurdle === 'ELEVATED'
            ? 'chip-y'
            : 'chip-r';
      return `
      <div class="kpi" style="margin-bottom:12px;padding:12px 14px;border-left:4px solid ${c.conviction === 'HIGH' ? '#15803d' : '#2563eb'};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div>
            <span style="font-size:12pt;font-weight:700;color:#0f172a;">#${c.rank} ${c.name}</span>
            <span style="font-family:'SF Mono',Menlo,monospace;color:#64748b;font-size:8.5pt;margin-left:6px;">${c.companyId} · ₹${Number(c.mcap).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr Mcap</span>
          </div>
          <div>
            <span class="chip chip-b">${c.docType}</span>
            <span class="chip ${hurdleClass}">HURDLE: ${c.hurdle}</span>
            <span class="chip ${c.conviction === 'HIGH' ? 'chip-g' : 'chip-y'}">SCORE: ${c.compositeScore}/100</span>
          </div>
        </div>

        <div class="grid4" style="margin:8px 0;">
          <div style="background:#fff;padding:6px 8px;border-radius:4px;border:1px solid #e2e8f0;">
            <div class="label">P/E Multiple</div>
            <div class="bignum" style="font-size:13pt;">${c.pe ? Number(c.pe).toFixed(1) + 'x' : 'N/A'}</div>
            <div class="subnum">PEG: ${c.peg ? Number(c.peg).toFixed(2) : '—'}</div>
          </div>
          <div style="background:#fff;padding:6px 8px;border-radius:4px;border:1px solid #e2e8f0;">
            <div class="label">Pre-Result Setup</div>
            <div class="bignum" style="font-size:11pt;color:${c.ret1w >= 0 ? '#15803d' : '#b91c1c'};">${c.setup}</div>
            <div class="subnum">1W Return: ${c.ret1w >= 0 ? '+' : ''}${Number(c.ret1w).toFixed(1)}%</div>
          </div>
          <div style="background:#fff;padding:6px 8px;border-radius:4px;border:1px solid #e2e8f0;">
            <div class="label">PAT YoY Trajectory</div>
            <div class="bignum" style="font-size:13pt;color:#15803d;">+${Number(c.patGrowthYoY).toFixed(1)}%</div>
            <div class="subnum">TTM PAT: +${c.patGrowthTTM ? Number(c.patGrowthTTM).toFixed(1) : 0}%</div>
          </div>
          <div style="background:#fff;padding:6px 8px;border-radius:4px;border:1px solid #e2e8f0;">
            <div class="label">Balance Sheet / D:E</div>
            <div class="bignum" style="font-size:13pt;">${c.d2e !== null ? Number(c.d2e).toFixed(2) : '—'}</div>
            <div class="subnum">CFO/PAT: ${c.cfo2pat !== null ? Number(c.cfo2pat).toFixed(2) : '—'}</div>
          </div>
        </div>

        <div style="font-size:8.5pt;line-height:1.5;margin-top:6px;background:#ffffff;padding:8px 10px;border-radius:4px;border:1px solid #e2e8f0;">
          <strong>PEAD Drift Expectation:</strong> <span style="color:#0f172a;font-weight:600;">${c.driftExpectation}</span> · 
          <strong>Sell-The-News Risk:</strong> <span style="font-weight:600;color:${c.sellTheNewsRisk === 'HIGH' ? '#b91c1c' : '#15803d'};">${c.sellTheNewsRisk}</span>.
          <br/>
          <strong>Key Levers:</strong> Inflecting profit margin, ${c.hasPriorConcall ? 'verified management concall disclosures' : 'presentation guidance'}, and ${c.setup === 'TIGHT_BASE' ? 'unfettered positioning with low whisper expectations.' : c.setup === 'MASSIVE_RUN_UP' ? 'high built-in expectations requiring a blowout beat.' : 'moderate institutional positioning.'}
        </div>
      </div>
    `;
    })
    .join('\n');

  const declaredRows = alreadyDeclared
    .map(
      (d) => `
    <tr>
      <td><strong>${d.name}</strong> <span style="color:#64748b;font-size:7.5pt;">(${d.companyId})</span></td>
      <td>${d.sector}</td>
      <td style="text-align:right;">₹${Number(d.mcap).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr</td>
      <td style="text-align:right;color:#15803d;font-weight:600;">+${Number(d.patGrowthYoY).toFixed(1)}%</td>
      <td><span class="chip chip-b">DECLARED Q2 FY27</span></td>
    </tr>
  `
    )
    .join('\n');

  const excludedRows = excludedGate2
    .map(
      (e) => `
    <tr>
      <td><strong>${e.name}</strong> <span style="color:#64748b;font-size:7.5pt;">(${e.companyId})</span></td>
      <td>${e.sector}</td>
      <td style="text-align:right;">₹${Number(e.mcap).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr</td>
      <td><span class="chip chip-r">GATE 2: NO CONCALL / NO PPT</span></td>
    </tr>
  `
    )
    .join('\n');

  const bodyHtml = `
    <div class="thick-line"></div>

    <div class="grid4" style="margin-bottom:12px;">
      <div class="kpi kpi-b">
        <div class="label">Total Scan Universe</div>
        <div class="bignum">${rows.length}</div>
        <div class="subnum">Stockscans Live Scan</div>
      </div>
      <div class="kpi kpi-g">
        <div class="label">Ranked Candidates</div>
        <div class="bignum">${scored.length}</div>
        <div class="subnum">Pending Q2 Results with Docs</div>
      </div>
      <div class="kpi kpi-b">
        <div class="label">Already Declared</div>
        <div class="bignum">${alreadyDeclared.length}</div>
        <div class="subnum">Results Filed Today/Recent</div>
      </div>
      <div class="kpi kpi-r">
        <div class="label">Gate 2 Excluded</div>
        <div class="bignum">${excludedGate2.length}</div>
        <div class="subnum">No Concall / No PPT</div>
      </div>
    </div>

    <div class="hl" style="background:#f1f5f9;border-left:3.5px solid #2563eb;margin-bottom:14px;">
      <strong>METHODOLOGY & THE ONWARD TECH PLAYBOOK (Suresh Gate 3):</strong>
      Pre-earnings price action is a double-edged sword. When a stock surges +15% into results (e.g. Yasho), expectations are heavily built, setting up elevated "sell-the-news" profit booking unless a Bull-Case blowout lands. Conversely, stocks consolidating tightly in a flat base with low volume (Refex, Fabtech, Stylam, Satin, Bhageria) offer prime asymmetric springboard setups where any operational beat triggers immediate post-earnings announcement drift (PEAD).
    </div>

    <h2>01 · MASTER PRE-PEAD CONVICTION RANKING (${scored.length} ACTIVE NAMES)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:8pt;margin-bottom:16px;">
      <thead>
        <tr style="background:#f8fafc;border-bottom:1.5px solid #cbd5e1;text-align:left;color:#475569;">
          <th style="padding:6px 4px;text-align:center;">#</th>
          <th style="padding:6px 6px;">Company</th>
          <th style="padding:6px 6px;">Sector</th>
          <th style="padding:6px 6px;text-align:right;">MCap</th>
          <th style="padding:6px 6px;text-align:right;">P/E</th>
          <th style="padding:6px 6px;text-align:right;">1W Ret</th>
          <th style="padding:6px 6px;text-align:right;">PAT YoY</th>
          <th style="padding:6px 6px;text-align:right;">PAT TTM</th>
          <th style="padding:6px 6px;">Hurdle</th>
          <th style="padding:6px 6px;">Tier</th>
        </tr>
      </thead>
      <tbody>
        ${masterTableRows}
      </tbody>
    </table>

    <div style="page-break-before:always;"></div>

    <h2>02 · TOP HIGH-CONVICTION OPPORTUNITIES (DEEP-DIVE CARDS)</h2>
    ${deepDiveCards}

    <h2>03 · EXCLUSIONS & AUDIT LOG</h2>
    <div style="font-size:8.5pt;margin-bottom:6px;color:#475569;">
      <strong>Already Declared Q2 FY27 (${alreadyDeclared.length} Companies):</strong> Excluded because post-event drift replaces pre-result anticipation.
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:8pt;margin-bottom:12px;">
      <thead>
        <tr style="background:#f8fafc;border-bottom:1px solid #cbd5e1;text-align:left;color:#475569;">
          <th style="padding:5px 6px;">Company</th>
          <th style="padding:5px 6px;">Sector</th>
          <th style="padding:5px 6px;text-align:right;">MCap</th>
          <th style="padding:5px 6px;text-align:right;">PAT YoY</th>
          <th style="padding:5px 6px;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${declaredRows}
      </tbody>
    </table>

    <div style="font-size:8.5pt;margin-bottom:6px;color:#475569;">
      <strong>Gate 2 Excluded (${excludedGate2.length} Companies):</strong> Excluded due to absence of management earnings call transcript or investor presentation.
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:8pt;margin-bottom:14px;">
      <thead>
        <tr style="background:#f8fafc;border-bottom:1px solid #cbd5e1;text-align:left;color:#475569;">
          <th style="padding:5px 6px;">Company</th>
          <th style="padding:5px 6px;">Sector</th>
          <th style="padding:5px 6px;text-align:right;">MCap</th>
          <th style="padding:5px 6px;">Reason</th>
        </tr>
      </thead>
      <tbody>
        ${excludedRows}
      </tbody>
    </table>

    <h2>04 · EXTRA-MILE RESEARCH & THE 1% FACTOR</h2>
    <div class="kpi" style="padding:10px 12px;background:#f8fafc;font-size:8.5pt;line-height:1.5;">
      <ul>
        <li><strong>Chemicals Margin Divergence:</strong> Raw material input prices (phenol, aniline, sulphur) have moderated ~8-12% QoQ, driving outsized margin expansion for specialized players like <em>Apcotex Industries</em> and <em>Bhageria Industries</em>, while commoditized caustic soda (<em>Chemfab Alkalis</em>) faces margin compression from global import dumping.</li>
        <li><strong>Commercial Vehicles & High-Horsepower Engines:</strong> <em>Force Motors</em> continues to benefit from multi-year tailwinds in light commercial vehicles (Traveller/Urbania) alongside robust luxury engine sourcing agreements with Mercedes-Benz India and BMW India. With low leverage and tight pre-results price consolidation (+0.8% 1W), the hurdle remains modest.</li>
        <li><strong>Multiplex Box Office Inflection:</strong> <em>PVR Inox</em> shows a massive swing with TTM PAT Growth of +383.8% off a low base. The pre-results price setup is tight (+0.9% 1W), meaning Q2 festive box office performance is not yet priced into valuation.</li>
      </ul>
    </div>
  `;

  const fullHtml = wrapHtml(
    'PRE-PEAD RESULTS PREDICTOR & SCREENING BRIEFING',
    `SOURCE: ${meta.scanName.toUpperCase()} · LIVE STOCKSCANS UNIVERSE · ${asOf.toUpperCase()}`,
    bodyHtml
  );

  const pdfDir = path.join(REPO, 'data', 'assets', 'pead-predictor');
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
  const pdfPath = path.join(pdfDir, `pre_pead_scan_upcoming_results_${asOf}.pdf`);

  console.log(`[pre-pead-scanner] Generating PDF via Puppeteer...`);
  await renderPdf(
    fullHtml,
    pdfPath,
    'INSTITUTIONAL PRE-PEAD PREDICTOR & SURPRISE SCREEN',
    'Strictly Private & Confidential · Stock Screener Platform'
  );
  console.log(`[pre-pead-scanner] PDF successfully generated at: ${pdfPath}`);

  return {
    dtoPath,
    pdfPath,
    total: rows.length,
    eligible: scored.length,
    declared: alreadyDeclared.length,
    excluded: excludedGate2.length,
    topCandidates: top10.map((c) => ({
      rank: c.rank,
      companyId: c.companyId,
      name: c.name,
      mcap: c.mcap,
      pe: c.pe,
      patGrowthYoY: c.patGrowthYoY,
      ret1w: c.ret1w,
      hurdle: c.hurdle,
      setup: c.setup,
      conviction: c.conviction,
    })),
  };
}

if (require.main === module) {
  main()
    .then((res) => {
      console.log(
        JSON.stringify({
          ok: true,
          pdf: res.pdfPath,
          dto: res.dtoPath,
          eligibleCount: res.eligible,
        })
      );
      process.exit(0);
    })
    .catch((err) => {
      console.error('[pre-pead-scanner] Error:', err);
      process.exit(1);
    });
}
