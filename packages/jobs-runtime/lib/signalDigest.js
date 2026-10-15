'use strict';

/**
 * Pure formatting for the signal-ledger digest. Zero LLM, zero I/O.
 *
 * Tiers (most to least important):
 *   REGIME  market-level signals + the day's numbers        (always first)
 *   ACT     company/sector signals that reached entry-ready / confirmed
 *   RISK    exit-watch signals (failed breakout, distribution, fundamental exit)
 *   WATCH   early / structural signals worth a look (E1, sector clusters, policy, ...)
 *   NOISE   E0 candidates, near-miss MTF, invalidations, flip-flops -> counts only
 *
 * Silence rule: returns null unless there is at least one REGIME/ACT/RISK/WATCH item.
 * All thresholds behind these signals are uncalibrated single-author claims.
 */

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );

const num = (x, d = 1) => (typeof x === 'number' && Number.isFinite(x) ? x.toFixed(d) : null);
const plain = (id) => String(id || '').replace(/^NSE:|^BSE:/, '');
const HEADWINDS = new Set([
  'M3-weak-macro',
  'M4-deep-correction',
  'M4-fii-outflow-5d',
  'M1-scan-count-falling',
  'L1-fii-20d-outflow',
]);
const TAILWINDS = new Set(['M4-bottom-marker', 'M2-relief-zone', 'M4-shallow-correction']);

/**
 * Plain-language registry. `line(ev, lv)` = one readable evidence sentence; `means` = why it matters.
 * Unknown signal ids fall back to a compact key=value rendering.
 */
const SIGNALS = {
  'M4-shallow-correction': {
    label: 'Shallow correction',
    means: 'Dip inside an uptrend; the zone this framework treats as dip-buying territory.',
    line: (e) =>
      `${num(e.pctAbove20SMA)}% of Nifty 500 above 20-DMA (trigger below ${e.threshold}%)`,
  },
  'M4-deep-correction': {
    label: 'Deep correction',
    means: 'Broad weakness: most stocks below key averages. New entries face a headwind.',
    line: (e) =>
      `${num(e.pctAbove20SMA)}% above 20-DMA, ${num(e.pctAbove50SMA)}% above 50-DMA, ${num(e.pctAbove200SMA)}% above 200-DMA`,
  },
  'M4-bottom-marker': {
    label: 'Bottom marker',
    means: 'Breadth washout reading that this framework associates with a possible low.',
    line: (e) => `${num(e.pctAbove20SMA)}% above 20-DMA, ${num(e.pctAbove50SMA)}% above 50-DMA`,
  },
  'M2-relief-zone': {
    label: 'Relief zone',
    means: 'Stress easing; macro pressure and breadth improving together.',
    line: (e) =>
      Object.entries(e)
        .filter(([k]) => k !== 'calibrated')
        .map(([k, v]) => `${k} ${v}`)
        .join(', '),
  },
  'M3-weak-macro': {
    label: 'Weak macro',
    means: 'Oil, US yields or the rupee are past their stress limits.',
    line: (e) =>
      (e.breaches || [])
        .map((b) =>
          `${b} ${e[b] ?? e.limits?.[b] ?? ''} (limit ${e.limits?.[b] ?? '?'})`.replace(
            /\s+\(/,
            ' ('
          )
        )
        .join('; ') || 'macro limits breached',
  },
  'M4-fii-outflow-5d': {
    label: 'FII selling streak',
    means: 'Foreign investors net sellers for 5 straight sessions.',
    line: (e) => `FII net ${num(e.fiiNetSumCr, 0)} Cr over ${e.sessions} sessions`,
  },
  'M1-scan-count-falling': {
    label: 'Scan counts falling',
    means: 'Fewer stocks passing breakout scans: participation is thinning.',
    line: (e) =>
      Object.entries(e)
        .filter(([k]) => k !== 'calibrated')
        .map(([k, v]) => `${k} ${v}`)
        .join(', '),
  },
  'E0-candidate': {
    label: 'Candidate',
    means: 'Strong relative strength near highs; only a starting filter.',
    line: (e) =>
      `RS ${num(e.rs, 0)}, ${num(e.fromHighPct)}% off high, turnover ${num(e.turnoverCr, 0)} Cr`,
  },
  'E1-base-breakout': {
    label: 'Base breakout setup',
    means:
      'Tight base under resistance; a close above the breakout level with volume is the trigger.',
    line: (e, l) =>
      `RS ${num(e.rs, 0)}, base ${num(e.baseDepthPct)}% deep, volume ${num(e.volumeRatio20)}x 20d` +
      (l?.breakout ? `; breakout level ${l.breakout}` : ''),
  },
  'E2-pullback': {
    label: 'Pullback to support',
    means:
      'Prior breakout retesting its level/21-EMA; the lower-risk re-entry the framework looks for.',
    line: (e, l) =>
      `${Math.abs(e.pctFromLevel).toFixed(1)}% ${e.pctFromLevel < 0 ? 'below' : 'above'} breakout level, ${e.sessionsSinceBreakout} sessions since breakout` +
      (l?.support ? `; support ${l.support}` : '') +
      (l?.pivot ? `, pivot ${l.pivot}` : ''),
  },
  'MTF-flush': {
    label: 'MTF flush + rejection',
    means: 'Leveraged-trader flush with a price rejection; tier A/B are the actionable grades.',
    line: (e, l) =>
      `tier ${e.tier || '?'}${e.score != null ? `, score ${num(e.score, 0)}` : ''}` +
      (l?.signalDayLow ? `; signal-day low ${l.signalDayLow}, close ${l.signalDayClose}` : ''),
  },
  'S1-sector-cluster': {
    label: 'Sector cluster',
    means: 'Several names in one sector hitting highs together, ahead of the market base rate.',
    line: (e) =>
      `${e.near}/${e.universe} near highs (${num(e.sharePct)}%) vs market ${num(e.marketRatePct)}%, ${e.hitDays}/${e.window} days`,
  },
  'X2-failed-breakout': {
    label: 'Failed breakout',
    means: 'Breakout level lost; the setup is broken.',
    line: (e) => `lost ${e.level} on ${e.date}`,
  },
  'X5-distribution': {
    label: 'Distribution',
    means: 'Heavy volume with repeated failures or selling by large holders.',
    line: (e) =>
      `volume ${num(e.volRatio20d)}x 20d, ${e.failedBreakouts60} failed breakouts in 60d` +
      (e.flags?.length ? `; ${e.flags.join(', ')}` : ''),
  },
  'X6-fundamental-exit': {
    label: 'Fundamental warning',
    means: 'Earnings quality or valuation flags that undercut the thesis.',
    line: (e) =>
      [
        `PAT YoY ${num(e.patYoY)}%`,
        e.cfoToPat != null ? `CFO/PAT ${num(e.cfoToPat)}` : null,
        ...(e.flags || []),
      ]
        .filter(Boolean)
        .join(', '),
  },
  'P1-policy-absorption': {
    label: 'Policy event absorbed',
    means: 'Sector basket outperforming after a policy move.',
    line: (e) =>
      `${e.title} (${(e.sectors || []).join(', ')}); basket +${num(e.basketRetPct)}% vs bench +${num(e.benchRetPct)}%`,
  },
};

function describe(t) {
  const meta = SIGNALS[t.signalId] || {};
  const ev = t.evidence || {};
  let line = '';
  try {
    line = meta.line
      ? meta.line(ev, t.levels || {})
      : Object.entries(ev)
          .filter(([k, v]) => k !== 'calibrated' && k !== 'name' && typeof v !== 'object')
          .slice(0, 5)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ');
  } catch {
    line = '';
  }
  return { label: meta.label || t.signalId, means: meta.means || '', line };
}

function entityName(t) {
  const ev = t.evidence || {};
  if (t.entityType === 'company')
    return ev.name ? `${ev.name} (${plain(t.entityId)})` : plain(t.entityId);
  if (t.entityType === 'sector' && /^evt_/.test(t.entityId)) return ev.title || t.entityId;
  return plain(t.entityId);
}

/** Reduce raw events to one net transition per ledger key; count flip-flops. */
function collapse(transitions) {
  const byKey = new Map();
  for (const t of [...transitions].sort((a, b) =>
    (a.date + (a.creationTime || '')).localeCompare(b.date + (b.creationTime || ''))
  )) {
    const k = t.ledgerId || `${t.signalId}|${t.entityType}|${t.entityId}`;
    const cur = byKey.get(k);
    byKey.set(
      k,
      cur
        ? { ...t, from: cur.from, flips: cur.flips + 1, path: [...cur.path, t.to] }
        : { ...t, flips: 0, path: [t.to] }
    );
  }
  return [...byKey.values()];
}

function tierOf(t) {
  const id = t.signalId;
  if (t.entityType === 'market') return 'regime';
  const dead = t.to === 'invalidated' || t.to === 'spent';
  if (dead) return 'noise';
  if (id.startsWith('X')) return 'risk';
  if (t.to === 'entry-ready' || t.to === 'confirmed') return 'act';
  if (id === 'E0-candidate' || id === 'MTF-flush') return 'noise'; // detected-only grades
  if (t.from === 'entry-ready') return 'noise'; // cooled off
  return 'watch';
}

const byRs = (a, b) => (b.evidence?.rs ?? -1) - (a.evidence?.rs ?? -1);

function stanceOf(active) {
  const ids = new Set(active.filter((s) => s.entityType === 'market').map((s) => s.signalId));
  const head = [...ids].filter((i) => HEADWINDS.has(i));
  const tail = [...ids].filter((i) => TAILWINDS.has(i));
  let stance = 'Neutral';
  if (head.length >= 2) stance = 'Risk-off';
  else if (head.length === 1) stance = 'Cautious';
  if (tail.length && head.length < 2) stance = head.length ? 'Mixed' : 'Constructive';
  return {
    stance,
    head,
    tail,
    against: head.some((h) => h === 'M3-weak-macro' || h === 'M4-deep-correction'),
  };
}

const delta = (a, b, d = 1, suffix = '') => {
  if (typeof a !== 'number' || typeof b !== 'number') return '';
  const x = a - b;
  return ` <span style="color:#888">(${x >= 0 ? '+' : ''}${x.toFixed(d)}${suffix})</span>`;
};

function snapshotHtml(snap, prev) {
  if (!snap) return '';
  const b = snap.breadth || {};
  const pb = prev?.breadth || {};
  const m = snap.macro || {};
  const pm = prev?.macro || {};
  const f = snap.flows || {};
  const pc = (n) => (b.universe ? (100 * n) / b.universe : null);
  const cell = (k, v) =>
    `<td style="padding:3px 10px 3px 0;color:#666">${k}</td><td style="padding:3px 18px 3px 0"><b>${v}</b></td>`;
  const p20 = pc(b.above20),
    p50 = pc(b.above50),
    p200 = pc(b.above200);
  const q20 = pc(pb.above20),
    q50 = pc(pb.above50),
    q200 = pc(pb.above200);
  const rows = [
    [
      cell('Nifty', `${num(m.nifty, 0)}${delta(m.nifty, pm.nifty, 0)}`),
      cell('Above 20-DMA', p20 != null ? `${num(p20, 0)}%${delta(p20, q20, 0, 'pp')}` : 'n/a'),
      cell('Above 50-DMA', p50 != null ? `${num(p50, 0)}%${delta(p50, q50, 0, 'pp')}` : 'n/a'),
      cell('Above 200-DMA', p200 != null ? `${num(p200, 0)}%${delta(p200, q200, 0, 'pp')}` : 'n/a'),
    ],
    [
      cell('Brent', `${num(m.brent)}${delta(m.brent, pm.brent)}`),
      cell('US 10Y', `${num(m.us10y, 2)}${delta(m.us10y, pm.us10y, 2)}`),
      cell('USDINR', `${num(m.usdinr, 2)}${delta(m.usdinr, pm.usdinr, 2)}`),
      cell('India VIX', `${num(m.indiaVix)}${delta(m.indiaVix, pm.indiaVix)}`),
    ],
    [
      cell('FII today', f.fiiNet != null ? `${num(f.fiiNet, 0)} Cr` : 'n/a'),
      cell('DII today', f.diiNet != null ? `${num(f.diiNet, 0)} Cr` : 'n/a'),
      cell('Near highs', b.nearHighsCount != null ? `${b.nearHighsCount}/${b.universe}` : 'n/a'),
      cell('1M gainers >10%', b.gainers1mOver10 != null ? `${b.gainers1mOver10}` : 'n/a'),
    ],
  ];
  const gaps = [];
  if (snap.mood == null) gaps.push('mood');
  for (const k of ['brent', 'us10y', 'usdinr', 'indiaVix']) if (m[k] == null) gaps.push(k);
  if (f.fiiNet == null) gaps.push('FII/DII');
  return (
    `<table style="border-collapse:collapse;font-size:12px;margin-top:8px">${rows.map((r) => `<tr>${r.join('')}</tr>`).join('')}</table>` +
    (gaps.length
      ? `<div style="color:#b45309;font-size:12px;margin-top:4px">Data gaps today: ${esc(gaps.join(', '))} (skipped, not zero)</div>`
      : '')
  );
}

const TH =
  'text-align:left;padding:5px 8px;border-bottom:2px solid #ddd;font-size:11px;color:#666;text-transform:uppercase';
const TD = 'padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top';

function section(title, color, count, body, sub) {
  return (
    `<h3 style="margin:22px 0 4px;color:${color};font-size:15px">${esc(title)} <span style="color:#999;font-weight:normal">(${count})</span></h3>` +
    (sub ? `<div style="color:#666;font-size:12px;margin-bottom:6px">${esc(sub)}</div>` : '') +
    body
  );
}

function rowsTable(head, rows) {
  return (
    `<table cellpadding="0" style="border-collapse:collapse;width:100%;font-size:13px"><tr>${head.map((h) => `<th style="${TH}">${esc(h)}</th>`).join('')}</tr>` +
    rows.join('') +
    '</table>'
  );
}

/**
 * @param {Object[]} transitions `signal_transition` events
 * @param {Object[]} activeStates current signal-state records (active only)
 * @param {{label?:string, snapshots?:Object[], asOf?:string}} opts snapshots = market_snapshot events (any order)
 * @returns {{subject:string,html:string,stats:Object}|null}
 */
function formatDigest(transitions, activeStates, { label, snapshots = [] } = {}) {
  if (!transitions.length) return null;
  const net = collapse(transitions);
  const tiers = { regime: [], act: [], risk: [], watch: [], noise: [] };
  for (const t of net) tiers[tierOf(t)].push(t);
  if (!tiers.regime.length && !tiers.act.length && !tiers.risk.length && !tiers.watch.length)
    return null;

  const { stance, head, tail, against } = stanceOf(activeStates);
  const snaps = [...snapshots].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const snap = snaps.at(-1)?.snapshot;
  const prev = snaps.at(-2)?.snapshot;
  const stanceColor = {
    'Risk-off': '#b91c1c',
    Cautious: '#b45309',
    Mixed: '#b45309',
    Neutral: '#475569',
    Constructive: '#15803d',
  }[stance];

  // ---- Regime header
  const regimeChanges = tiers.regime
    .sort((a, b) => a.signalId.localeCompare(b.signalId))
    .map((t) => {
      const d = describe(t);
      return `<tr><td style="${TD}"><b>${esc(d.label)}</b><br><span style="color:#888;font-size:11px">${esc(t.from || 'none')} &rarr; <b>${esc(t.to)}</b></span></td><td style="${TD}">${esc(d.line)}<br><span style="color:#666;font-size:12px">${esc(d.means)}</span></td></tr>`;
    });
  const activeMarket = activeStates
    .filter((s) => s.entityType === 'market')
    .map((s) => SIGNALS[s.signalId]?.label || s.signalId);
  let html =
    `<div style="font:13px Arial,sans-serif;max-width:760px;color:#111">` +
    `<div style="border-left:5px solid ${stanceColor};padding:8px 12px;background:#f8fafc">` +
    `<div style="font-size:11px;color:#666;text-transform:uppercase">Market regime ${esc(label || '')}</div>` +
    `<div style="font-size:20px;font-weight:bold;color:${stanceColor}">${esc(stance)}</div>` +
    `<div style="color:#444">${activeMarket.length ? `Active: ${esc(activeMarket.join(' · '))}` : 'No active market-level signals'}</div>` +
    snapshotHtml(snap, prev) +
    `</div>`;
  if (regimeChanges.length)
    html += section(
      'Regime changes',
      '#0f172a',
      regimeChanges.length,
      rowsTable(['Signal', 'Reading'], regimeChanges)
    );

  const counter = against ? `<span style="color:#b45309;font-size:11px">counter-regime</span>` : '';
  const stockRows = (list, withLevels) => {
    const groups = new Map(); // one row per stock/sector, signals stacked
    for (const t of list.sort(byRs)) {
      const k = `${t.entityType}|${t.entityId}`;
      groups.set(k, [...(groups.get(k) || []), t]);
    }
    return [...groups.values()].map((g) => {
      const t0 = g[0];
      const sigs = g
        .map((t) => {
          const d = describe(t);
          const flip = t.flips
            ? ` <span style="color:#b45309;font-size:11px">(flipped ${t.flips + 1}x)</span>`
            : '';
          return `<div style="margin-bottom:5px"><b>${esc(d.label)}</b>${flip} <span style="color:#888;font-size:11px">${esc(t.from || 'none')} &rarr; ${esc(t.to)}</span><br>${esc(d.line)}<br><span style="color:#666;font-size:12px">${esc(d.means)}</span></div>`;
        })
        .join('');
      return (
        `<tr><td style="${TD};width:170px"><b>${esc(entityName(t0))}</b>${t0.evidence?.rs != null ? `<br><span style="color:#888;font-size:11px">RS ${num(t0.evidence.rs, 0)}</span>` : ''}${withLevels && counter ? `<br>${counter}` : ''}</td>` +
        `<td style="${TD}">${sigs}</td></tr>`
      );
    });
  };

  if (tiers.act.length)
    html += section(
      'Act now: setups that reached entry-ready',
      '#15803d',
      tiers.act.length,
      rowsTable(['Stock', 'Signals / levels'], stockRows(tiers.act, true)),
      against
        ? 'Regime is weak: treat these as counter-regime and size/confirm accordingly.'
        : 'Regime does not oppose these.'
    );
  if (tiers.risk.length)
    html += section(
      'Risk: exit-watch warnings',
      '#b91c1c',
      tiers.risk.length,
      rowsTable(['Stock', 'Signals'], stockRows(tiers.risk, false)),
      'Check any position you hold in these names.'
    );
  if (tiers.watch.length)
    html += section(
      'Watch: early or structural',
      '#1d4ed8',
      tiers.watch.length,
      rowsTable(['Name', 'Signals'], stockRows(tiers.watch, false))
    );

  // ---- Noise, collapsed
  const n = tiers.noise;
  const e0 = n.filter((t) => t.signalId === 'E0-candidate' && t.to === 'detected').sort(byRs);
  const mtfC = n.filter((t) => t.signalId === 'MTF-flush' && t.to === 'detected' && !t.from);
  const cooled = n.filter((t) => t.from === 'entry-ready' && t.to === 'detected');
  const dead = n.filter((t) => t.to === 'invalidated' || t.to === 'spent');
  const flipped = net.filter((t) => t.flips > 0 && tierOf(t) !== 'noise').length;
  const names = (l, k = 6) =>
    l
      .slice(0, k)
      .map((t) => esc(plain(t.entityId)))
      .join(', ') + (l.length > k ? `, +${l.length - k} more` : '');
  const lines = [];
  if (e0.length) lines.push(`${e0.length} new candidates (top by RS: ${names(e0, 5)})`);
  if (mtfC.length) lines.push(`${mtfC.length} new near-miss MTF flushes (tier C)`);
  if (cooled.length)
    lines.push(`${cooled.length} MTF setups cooled from entry-ready: ${names(cooled)}`);
  if (dead.length) lines.push(`${dead.length} signals invalidated: ${names(dead, 8)}`);
  if (flipped) lines.push(`${flipped} signals changed state more than once in this window`);
  if (lines.length)
    html += section(
      'Noise (collapsed)',
      '#64748b',
      n.length,
      `<ul style="margin:4px 0 0 18px;padding:0;color:#444">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`
    );

  html += `<p style="color:#888;font-size:11px;margin-top:22px">${activeStates.length} signals active in the ledger. Thresholds are single-author claims from tweets and are not calibrated. Research aid, not investment advice.</p></div>`;

  const parts = [];
  if (tiers.act.length) parts.push(`${tiers.act.length} act`);
  if (tiers.risk.length) parts.push(`${tiers.risk.length} risk`);
  if (tiers.watch.length) parts.push(`${tiers.watch.length} watch`);
  if (tiers.regime.length) parts.push(`${tiers.regime.length} regime`);
  return {
    subject: `Signals ${label || ''}: ${stance}, ${parts.join(' / ')}`.replace(/\s+:/, ':'),
    html,
    stats: Object.fromEntries(Object.entries(tiers).map(([k, v]) => [k, v.length])),
  };
}

module.exports = { formatDigest, collapse, tierOf, stanceOf, describe, SIGNALS };
