#!/usr/bin/env node
'use strict';

/**
 * pead-predictor — Step 5 (deterministic, no LLM): persist + render.
 *
 * Joins the three run files into ONE `pead-prediction` report DTO (DATA_RULES §2: reports.json +
 * body, via db.saveReport) and renders the PDF as a pure template of that DTO (conventions §5/§18):
 *
 *   inputs      gather_inputs.js output     (facts: actuals, filings, priceAction, guidance, macro, context ids)
 *   projection  project_pl.py output        (numbers: scenarios, deltas, attribution, flags)
 *   narrative   agent-written JSON          (judgment: credibility, dot-connect, macro read, pead scorecard)
 *
 * Deterministic id = rpt_pead-predictor_<companyId>_<asOf>_<hash(targetQuarter)> → a same-day re-run
 * upserts instead of duplicating. PDF: Puppeteer (pdfRenderer.renderPdf) → WeasyPrint fallback
 * (skills/_shared/pdf-artifact-step.md). Prints {id, pdf, touched}.
 *
 * Usage:
 *   node save_prediction.js --inputs <inputs.json> --projection <projection.json> \
 *     --narrative <narrative.json> --model <model that wrote assumptions+narrative> [--no-pdf]
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const req = (p) => require(path.join(REPO, p));

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
const fmt = (v, d = 1) =>
  v == null || Number.isNaN(v)
    ? '–'
    : Number(v).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (v) =>
  v == null ? '–' : `<span class="${v >= 0 ? 'up' : 'dn'}">${v >= 0 ? '+' : ''}${fmt(v)}%</span>`;
const BASIS_CHIP = {
  guided: 'chip-g',
  actual: 'chip-g',
  filing: 'chip-b',
  derived: 'chip-b',
  macro: 'chip-y',
  heuristic: 'chip-y',
  assumption: 'chip-r',
};
const chip = (b) => `<span class="chip ${BASIS_CHIP[b] || ''}">${esc(b || 'assumption')}</span>`;

/** Pure: DTO -> body HTML (pdf-design-guide vocabulary). Exported for tests. */
function buildBody(dto) {
  const p = dto.projection;
  const n = dto.narrative || {};
  const base = p.scenarios.base;
  const t = base.target;
  const yoy = (base.deltas.yoy || {}).reported || {};
  const fyD = (base.deltas.fyofy || {}).reported || {};
  const fyCore = (base.deltas.fyofy || {}).core;
  const pa = dto.priceAction || (dto.inputs && dto.inputs.priceAction) || null;
  const h = [];

  h.push(
    `<div class="hl hl-b"><b>${esc(n.headline || '')}</b><br/><span class="label">Framing (SureshKBN): "do the maths, set no expectations" — scenarios, not a trade signal. Evaluates pre-earnings accumulation vs priced-in expectations to predict PEAD drift.</span></div>`
  );

  // Pre-Earnings Price Action & Volume-Delivery Footprint (Onward Tech Pattern, Suresh Gate 3)
  if (pa) {
    h.push(
      `<div class="sec"><div class="sec-hd">PRE-EARNINGS PRICE ACTION &amp; DELIVERY FOOTPRINT (SURESH GATE 3)</div><div class="grid4">`
    );
    h.push(
      `<div class="kpi kpi-b"><div class="label">Accumulation Pattern</div><div class="bignum" style="font-size:13px;line-height:1.2;">${esc((pa.pattern || '').replace(/_/g, ' '))}</div><div class="subnum">Hurdle: <b>${esc(pa.expectationHurdle)}</b> · Sell-Risk: <b>${esc(pa.sellTheNewsRisk)}</b></div></div>`
    );
    h.push(
      `<div class="kpi kpi-b"><div class="label">Pre-Result Price Δ</div><div class="bignum">${pct(pa.return10dPct)}</div><div class="subnum">5D ${pct(pa.return5dPct)} · 20D ${pct(pa.return20dPct)}</div></div>`
    );
    h.push(
      `<div class="kpi kpi-b"><div class="label">Volume Explosion</div><div class="bignum">${fmt(pa.volumeMultiplier5d)}x</div><div class="subnum">vs 20D median (peak ${fmt(pa.maxSingleDayVolMult)}x)</div></div>`
    );
    h.push(
      `<div class="kpi kpi-b"><div class="label">Delivery Accumulation</div><div class="bignum">${fmt(pa.avgDeliveryPct5d)}%</div><div class="subnum">5D turnover: ₹${fmt(pa.totalDeliveryVal5dCr)} cr (${fmt(pa.deliveryMultiplier5d)}x qty)</div></div>`
    );
    h.push('</div>');
    h.push(
      `<div class="hl ${pa.sellTheNewsRisk === 'HIGH' ? 'hl-y' : 'hl-b'}" style="margin-top:6px;"><b>Expectation Bar &amp; Hurdle (Suresh Gate 3):</b> ${esc(pa.hurdleVerdict)}<br/><span class="label">Required Result for Post-Earnings Drift: <b>${esc(pa.requiredForPead)}</b></span></div></div>`
    );
  }

  // KPI strip
  h.push('<div class="grid4">');
  for (const [label, m, d] of [
    ['Revenue (₹ cr)', 'revenue', yoy.revenue],
    ['EBITDA (₹ cr)', 'ebitda', yoy.ebitda],
    ['PAT (₹ cr)', 'pat', yoy.pat],
    ['EPS (₹)', 'eps', yoy.eps],
  ]) {
    h.push(
      `<div class="kpi kpi-b"><div class="label">${esc(dto.targetQuarter)} base · ${label}</div><div class="bignum">${fmt(t[m])}</div><div class="subnum">YoY ${pct(d)} · bear ${fmt(p.scenarios.bear.target[m])} / bull ${fmt(p.scenarios.bull.target[m])}</div></div>`
    );
  }
  h.push('</div>');

  // growth matrix
  const row = (label, hz, basis) => {
    const r = (base.deltas[hz] || {})[basis] || null;
    if (!r) return '';
    return `<tr><td>${esc(label)} <span class="label">vs ${esc(base.deltas[hz].vs)} (${basis})</span></td><td>${pct(r.revenue)}</td><td>${pct(r.ebitda)}</td><td>${pct(r.pat)}</td><td>${pct(r.eps)}</td><td>${r.ebitda_margin_bps == null ? '–' : `${r.ebitda_margin_bps > 0 ? '+' : ''}${r.ebitda_margin_bps} bp`}</td></tr>`;
  };
  h.push(
    '<div class="sec"><div class="sec-hd">GROWTH — BASE CASE</div><table class="vmatrix"><tr><th></th><th>Revenue</th><th>EBITDA</th><th>PAT</th><th>EPS</th><th>Margin Δ</th></tr>'
  );
  h.push(
    row('QoQ', 'qoq', 'reported') +
      row('QoQ', 'qoq', 'core') +
      row('YoY', 'yoy', 'reported') +
      row('YoY', 'yoy', 'core') +
      row(`FYoFY ${p.fiscalYear}`, 'fyofy', 'reported') +
      row(`FYoFY ${p.fiscalYear}`, 'fyofy', 'core')
  );
  h.push('</table></div>');

  // scenario table
  h.push(
    '<div class="sec"><div class="sec-hd">SCENARIOS — ₹ CR</div><table class="vmatrix"><tr><th></th><th>Bear</th><th>Base</th><th>Bull</th></tr>'
  );
  for (const [lab, where, m, d] of [
    [`${dto.targetQuarter} Revenue`, 'target', 'revenue', 1],
    [`${dto.targetQuarter} EBITDA margin %`, 'target', 'ebitda_margin_pct', 1],
    [`${dto.targetQuarter} PAT`, 'target', 'pat', 1],
    [`${dto.targetQuarter} EPS (₹)`, 'target', 'eps', 2],
    [`${p.fiscalYear} Revenue`, 'fy', 'revenue', 0],
    [`${p.fiscalYear} PAT (reported basis)`, 'fy', 'pat', 0],
    [`${p.fiscalYear} EPS (₹)`, 'fy', 'eps', 1],
  ]) {
    h.push(
      `<tr><td>${esc(lab)}</td>${['bear', 'base', 'bull'].map((s) => `<td>${fmt(p.scenarios[s][where][m], d)}</td>`).join('')}</tr>`
    );
  }
  if (base.fy_core)
    h.push(
      `<tr><td>${esc(p.fiscalYear)} PAT (core, one-offs out)</td>${['bear', 'base', 'bull'].map((s) => `<td>${fmt((p.scenarios[s].fy_core || {}).pat, 0)}</td>`).join('')}</tr>`
    );
  h.push('</table>');
  if (n.scenarioLogic) h.push(`<p>${esc(n.scenarioLogic)}</p>`);
  h.push('</div>');

  // P&L bridge (base, target)
  h.push(
    `<div class="sec"><div class="sec-hd">BRIDGE — BASE ${esc(dto.targetQuarter)}</div><p>Revenue ${fmt(t.revenue)} × EBITDA margin ${fmt(t.ebitda_margin_pct)}% = EBITDA ${fmt(t.ebitda)} + other income ${fmt(t.other_income)} − depreciation ${fmt(t.depreciation)} − interest ${fmt(t.interest)}${t.exceptional ? ` + exceptional ${fmt(t.exceptional)}` : ''} = PBT ${fmt(t.pbt)} → tax ${fmt(t.tax_rate_pct)}%${p.patRatio !== 1 ? ` × minority ratio ${p.patRatio}` : ''} = PAT ${fmt(t.pat)} ÷ ${fmt(base.shares_cr, 3)} cr shares = EPS ₹${fmt(t.eps, 2)}</p></div>`
  );

  // leverage profile + guidance ladder (engine outputs)
  const lev = p.leverage || {};
  const gl = p.guidanceLadder;
  const levTxt = ['yoy', 'fyofy']
    .filter((k) => lev[k])
    .map(
      (k) =>
        `${k.toUpperCase()} (${lev[k].basis}): operating ${fmt(lev[k].operating, 2)}x · financial ${fmt(lev[k].financial, 2)}x · combined ${fmt(lev[k].combined, 2)}x${lev[k].ordering ? ' · PAT>EBITDA>Revenue' : ''}`
    )
    .join('<br/>');
  if (levTxt || gl) {
    h.push(
      `<div class="sec"><div class="sec-hd">LEVERAGE & GUIDANCE LADDER — BASE</div><p>${levTxt}</p>${gl ? `<p>Rest of ${esc(p.fiscalYear)} (${esc(gl.remainingQuarters.join(', '))}) must deliver revenue ₹${fmt(gl.requiredRevenueCr, 0)} cr = ${pct(gl.requiredRevenueYoYPct)} YoY (YTD ${pct(gl.ytdRevenueYoYPct)}) at ${fmt(gl.requiredMarginPct)}% margin (YTD ${fmt(gl.ytdMarginPct)}%).</p>` : ''}</div>`
    );
  }

  // inputs ledger
  h.push(
    '<div class="sec"><div class="sec-hd">EVERY INPUT, TAGGED</div><table class="vmatrix"><tr><th>Input</th><th>Basis</th><th>Value(s)</th><th>Source / reasoning</th></tr>'
  );
  for (const r of base.inputs) {
    h.push(
      `<tr><td>${esc(r.input)}</td><td>${chip(r.basis)}</td><td>${esc(
        Object.entries(r.values || {})
          .map(
            ([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`
          )
          .join('; ')
      )}</td><td>${esc(r.source || '')}${r.kb && r.kb.length ? ` <span class="label">[${r.kb.map((k) => `kb:${esc(k)}`).join(', ')}]</span>` : ''}</td></tr>`
    );
  }
  h.push('</table>');
  const share = p.assumptionShare || {};
  h.push(
    `<p class="label">Core-path basis: ${esc(
      Object.entries(share.corePathBasis || {})
        .map(([k, v]) => `${k}=${v}`)
        .join(' · ')
    )}. Heuristic/assumption levers explain ${fmt(share.softLeverPatShareOfTargetPct)}% of base ${esc(dto.targetQuarter)} PAT.</p></div>`
  );

  // lever attribution
  if ((p.attribution || []).length) {
    h.push(
      '<div class="sec"><div class="sec-hd">LEVERS (LEAVE-ONE-OUT, BASE PAT ₹ CR)</div><table class="vmatrix"><tr><th>Lever</th><th>Basis</th><th>Target qtr</th><th>FY</th></tr>'
    );
    for (const a of p.attribution)
      h.push(
        `<tr><td>${esc(a.lever)}${a.embedded ? ' <span class="label">(embedded — shown, not added)</span>' : ''}</td><td>${chip(a.basis)}</td><td>${fmt(a.target_pat_cr)}</td><td>${fmt(a.fy_pat_cr)}</td></tr>`
      );
    h.push('</table></div>');
  }

  const list = (title, items, render) => {
    if (!items || !items.length) return;
    h.push(
      `<div class="sec"><div class="sec-hd">${title}</div><ul>${items.map((x) => `<li>${render(x)}</li>`).join('')}</ul></div>`
    );
  };
  if (n.credibility) {
    h.push(
      `<div class="sec"><div class="sec-hd">GUIDANCE & CREDIBILITY</div><p><span class="chip ${n.credibility.verdict === 'high' ? 'chip-g' : n.credibility.verdict === 'low' ? 'chip-r' : 'chip-y'}">${esc(n.credibility.verdict)}</span> ${esc(n.credibility.summary || '')}</p></div>`
    );
  }
  list(
    'GUIDANCE READ',
    n.guidanceRead,
    (g) =>
      `<b>${esc(g.item)}</b> — "${esc(g.quote)}" (${esc(g.period || '')}) · ${esc(g.type || '')} → used as <b>${esc(g.usedAs || '')}</b>: ${esc(g.why || '')}`
  );
  list(
    'CONNECTING THE DOTS — FILINGS SINCE THE LAST RESULT',
    n.dotConnect,
    (d) =>
      `<span class="chip ${d.status === 'NEW' ? 'chip-b' : ''}">${esc(d.status)}</span> ${esc(d.date)} · <b>${esc(d.filing)}</b> → ${esc(d.pnlEffect)} <span class="label">(${esc(d.inModelAs || '')})</span>`
  );
  list(
    'MACRO OVERLAY',
    n.macro,
    (m) =>
      `<b>${esc(m.input)}</b> ${esc(m.move)} → ${esc(m.channel)}: ${esc(m.impact)} <span class="label">(${esc(m.inModelAs || '')})</span>`
  );
  list(
    'BASE QUALITY (ONE-OFFS CLEANED)',
    n.baseQuality,
    (b) => `${esc(b.quarter)}: ${esc(b.item)} → ${esc(b.treatment)}`
  );
  list(
    'ASSUMPTIONS TAKEN FOR LACK OF GUIDANCE / DATA',
    n.assumptions,
    (a) =>
      `${chip(a.basis)} ${esc(a.assumption)} — <i>${esc(a.why)}</i>${a.sensitivity ? ` <span class="label">sensitivity: ${esc(a.sensitivity)}</span>` : ''}`
  );
  list('ENGINE FLAGS', p.flags, (f) => `<span class="red-flag">${esc(f)}</span>`);
  list('WHAT COULD BE WRONG', n.whatCouldBeWrong, esc);
  list('WATCH ON RESULT DAY', n.watch, esc);
  if (n.pead) {
    if (typeof n.pead === 'object' && n.pead !== null) {
      h.push(
        `<div class="sec"><div class="sec-hd">SURESHKBN 5-GATE PEAD PRE-FLIGHT SCORECARD</div>`
      );
      h.push(
        '<table class="vmatrix"><tr><th>Gate</th><th>Dimension</th><th>Evaluation &amp; Drift Hurdle</th></tr>'
      );
      if (n.pead.gate1Surprise)
        h.push(
          `<tr><td><b>Gate 1</b></td><td>Surprise / Shock vs Expectations</td><td>${esc(n.pead.gate1Surprise)}</td></tr>`
        );
      if (n.pead.gate2Quality)
        h.push(
          `<tr><td><b>Gate 2</b></td><td>Result Quality &amp; Repeatability</td><td>${esc(n.pead.gate2Quality)}</td></tr>`
        );
      if (n.pead.gate3PricedIn)
        h.push(
          `<tr><td><b>Gate 3</b></td><td>Priced-In &amp; Valuation Headroom</td><td>${esc(n.pead.gate3PricedIn)}</td></tr>`
        );
      if (n.pead.gate4Guidance)
        h.push(
          `<tr><td><b>Gate 4</b></td><td>Concall Guidance &amp; Credibility</td><td>${esc(n.pead.gate4Guidance)}</td></tr>`
        );
      if (n.pead.gate5PostResultTriggers)
        h.push(
          `<tr><td><b>Gate 5</b></td><td>Pipeline of Post-Result Catalysts</td><td>${esc(n.pead.gate5PostResultTriggers)}</td></tr>`
        );
      h.push('</table>');
      if (n.pead.summary) h.push(`<p><b>PEAD Drift Outlook:</b> ${esc(n.pead.summary)}</p>`);
      h.push('</div>');
    } else {
      h.push(
        `<div class="sec"><div class="sec-hd">PEAD READ-THROUGH</div><p>${esc(n.pead)}</p></div>`
      );
    }
  }
  list('SOURCES', dto.sources, (s) =>
    s.url ? `<a href="${esc(s.url)}">${esc(s.label)}</a>` : esc(s.label)
  );
  list('EXPERT GROUNDING', n.expertCitations, esc);
  h.push(
    `<p class="disclaimer">Generated by pead-predictor (${esc(dto.modelUsed)}) on ${esc(dto.date)} from Stockscans actuals, filings and concall material. Estimates are analytical scenarios, not investment advice.</p>`
  );
  return h.join('\n');
}

function sourcesFrom(inputs, narrative) {
  const out = [];
  const tr = inputs.transcript;
  if (tr && tr.url) out.push({ label: `Concall transcript ${tr.date}`, url: tr.url });
  const usedDates = new Set(((narrative && narrative.dotConnect) || []).map((d) => d.date));
  for (const f of (inputs.filings && inputs.filings.items) || []) {
    if (!f.routine && f.url && (usedDates.has(f.date) || f.textHead))
      out.push({ label: `${f.date} · ${f.title.slice(0, 90)}`, url: f.url });
  }
  for (const s of (narrative && narrative.webSources) || []) out.push(s);
  out.push({
    label: 'Stockscans company page (actuals)',
    url: `https://www.stockscans.in/company/${inputs.companyId}`,
  });
  return out;
}

function renderPdfFile(html, pdfPath, title, footer, htmlPath) {
  const { renderPdf } = req('stock-api/src/utils/pdfRenderer.js');
  return renderPdf(html, pdfPath, title, footer)
    .then(() => 'puppeteer')
    .catch(() => {
      // WeasyPrint fallback (pdf-artifact-step.md). The HTML goes to runs/ (re-derivable), never to
      // assets/ — the PDF is the only rendered deliverable (conventions §18).
      fs.writeFileSync(htmlPath, html);
      execFileSync(
        'python3',
        [
          '-c',
          'import sys;from weasyprint import HTML;HTML(filename=sys.argv[1]).write_pdf(sys.argv[2])',
          htmlPath,
          pdfPath,
        ],
        { stdio: 'pipe', timeout: 120000 }
      );
      return 'weasyprint';
    });
}

async function main() {
  const { argValue, hasFlag, loadEnv } = req('packages/jobs-runtime/lib/env.js');
  loadEnv(argValue('--env-file'));
  const db = req('packages/jobs-runtime/lib/db.js');
  const { wrapHtml } = req('stock-api/src/utils/pdfRenderer.js');
  const inputs = JSON.parse(fs.readFileSync(argValue('--inputs'), 'utf8'));
  const projection = JSON.parse(fs.readFileSync(argValue('--projection'), 'utf8'));
  const narrative = JSON.parse(fs.readFileSync(argValue('--narrative'), 'utf8'));
  const model = argValue('--model');
  if (!model)
    throw new Error(
      '--model is required (the model that wrote assumptions + narrative; output-dto-standard modelUsed)'
    );
  if (projection.status !== 'ok')
    throw new Error(`projection status ${projection.status}: fix assumptions first`);

  const companyId = inputs.companyId;
  const b = projection.scenarios.base;
  const summary = `${companyId} ${projection.targetQuarter} base: Rev ₹${b.target.revenue} cr (YoY ${((b.deltas.yoy || {}).reported || {}).revenue}%), PAT ₹${b.target.pat} cr (YoY ${((b.deltas.yoy || {}).reported || {}).pat}%), EPS ₹${b.target.eps}; ${projection.fiscalYear} PAT ₹${b.fy.pat} cr (FYoFY ${((b.deltas.fyofy || {}).reported || {}).pat}%). Bands PAT ${projection.bands.pat.bear}/${projection.bands.pat.base}/${projection.bands.pat.bull}.`;
  const dto = {
    id: db.makeId('rpt', 'pead-predictor', companyId, inputs.asOf, projection.targetQuarter),
    type: 'pead-prediction',
    creator: 'pead-predictor',
    companyId,
    date: inputs.asOf,
    modelUsed: model,
    summary,
    targetQuarter: projection.targetQuarter,
    fiscalYear: projection.fiscalYear,
    companyName: (inputs.identity || {}).name,
    status: 'open', // -> 'scored' by score_prediction.js once the target quarter's result is filed
    projection,
    narrative,
    priceAction: inputs.priceAction || null,
    basis: {
      latestReported: (inputs.period || {}).latestReported,
      actualsFetchedAt: (inputs.actuals || {}).fetchedAt,
      filingsWindowStart: (inputs.filings || {}).windowStart,
      knownCutoff: (inputs.filings || {}).knownCutoff,
    },
    macroSnapshot: ((inputs.macro || {}).instruments || []).map((m) => ({
      key: m.key,
      ticker: m.ticker,
      price: m.price,
      perf3M: m.perf3M,
      spotVsSma50Pct: m.spotVsSma50Pct,
    })),
    sources: sourcesFrom(inputs, narrative),
    contextUsed: [
      ...new Set([
        ...(narrative.contextUsed || []),
        ...((inputs.context || {}).availableIds || []),
      ]),
    ],
  };

  let pdfPath = null;
  let renderer = null;
  if (!hasFlag('--no-pdf')) {
    const safe = companyId.replace(/[^A-Za-z0-9]+/g, '_');
    pdfPath = db.assetPath(
      path.join('pead-predictor', `${safe}_${projection.targetQuarter}_pead_prediction.pdf`)
    );
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    const title = `${dto.companyName || companyId} — ${projection.targetQuarter} & ${projection.fiscalYear} PEAD prediction`;
    const html = wrapHtml(
      title,
      `As of ${inputs.asOf} · latest reported ${dto.basis.latestReported} · bear / base / bull`,
      buildBody(dto)
    );
    renderer = await renderPdfFile(
      html,
      pdfPath,
      title,
      `pead-predictor · ${inputs.asOf}`,
      db.runPath('pead-predictor', `${safe}-${inputs.asOf}`, 'render.html')
    );
    dto.pdfPath = path.relative(db.dataRoot(), pdfPath);
    db.trackTouched(pdfPath);
  }
  for (const f of ['--inputs', '--projection', '--narrative'])
    db.trackTouched(path.resolve(argValue(f)));
  const id = db.saveReport(dto);
  console.log(
    JSON.stringify({
      id,
      pdf: pdfPath,
      renderer,
      touched: db.touchedFiles ? db.touchedFiles() : undefined,
    })
  );
}

module.exports = { buildBody, sourcesFrom };

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
