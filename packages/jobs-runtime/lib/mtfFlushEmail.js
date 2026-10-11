'use strict';

/** Pure HTML for the mtf-flush-daily email (scored + categorised). `stockscansLink` is injected so this stays I/O-free. */

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
const pct = (x, d = 1) => (typeof x === 'number' ? `${(x * 100).toFixed(d)}%` : '–');

function tierBlock(label, blurb, rows, color, stockscansLink) {
  if (!rows.length) return '';
  const body = rows
    .map((r) => {
      const f = r.features;
      return (
        `<tr><td>${stockscansLink(r.name || r.symbol, `NSE:${r.symbol}`, 'NSE', '#1a73e8')}${r.isNew ? '' : ' <i>(cont.)</i>'}</td>` +
        `<td align="right"><b>${r.score ?? '–'}</b></td>` +
        `<td align="right">${pct(f.q10)}</td><td align="right">${pct(f.qpk, 0)}</td>` +
        `<td align="right">${Math.round(f.bookCr)}</td>` +
        `<td align="right">${pct(f.lowWick, 0)}</td><td align="right">${pct(f.dist20)}</td>` +
        `<td align="right">${f.rank == null ? '–' : f.rank.toFixed(2)}</td><td align="right">${pct(f.hi250, 0)}</td>` +
        `<td align="right">${f.close.toFixed(1)}</td>` +
        `<td align="right">${f.ema20 ? f.ema20.toFixed(1) : '–'} / ${f.ema50 ? f.ema50.toFixed(1) : '–'}</td>` +
        `<td>${r.failed.length ? 'missed: ' + esc(r.failed.join(', ')) : ''}</td></tr>`
      );
    })
    .join('');
  return (
    `<h3 style="color:${color};margin:16px 0 2px">${label} (${rows.length})</h3><div style="color:#666">${blurb}</div>` +
    `<table cellpadding="5" border="1" style="border-collapse:collapse;font:12px Arial"><tr style="background:#f3f3f3">` +
    `<th>Stock</th><th>Score</th><th>MTF 10d Δ</th><th>vs 60d peak</th><th>Book ₹Cr</th><th>Low wick</th><th>vs EMA20</th><th>120d rank</th><th>vs 250d hi</th><th>Close</th><th>EMA20 / 50EMA</th><th>Note</th></tr>${body}</table>`
  );
}

function formatEmail(
  { signalDate, rows, stage1, flushMedian, rankSize, newCount, fetchErrors = [], market = null },
  stockscansLink
) {
  const A = rows.filter((r) => r.tier === 'A');
  const B = rows.filter((r) => r.tier === 'B');
  const C = rows.filter((r) => r.tier === 'C');
  const html =
    `<div style="font:13px Arial;max-width:980px"><h2 style="margin:0">MTF flush-out entries — MTF session ${esc(signalDate)}</h2>` +
    `<p style="color:#444">Stage-1 flushes today: <b>${stage1}</b> (20-session median ${flushMedian ?? '–'}, Δ ${flushMedian != null ? stage1 - flushMedian : '–'}). ` +
    `Scored &amp; categorised: <b>${newCount} new</b> of ${rows.length} active. Rank universe: ${rankSize || 'unavailable'} stocks.</p>` +
    (fetchErrors.length
      ? `<p style="color:#a00"><b>Data gaps:</b> could not evaluate ${esc(fetchErrors.join(', '))} (fetch failed after retries) — re-run to include them.</p>`
      : '') +
    (market
      ? `<p style="color:#444">Market MTF book (NSE+BSE): ${pct(market.d1, 2)} on the day, ${pct(market.d5, 2)} over 5 sessions; ${pct(market.breadth, 0)} of liquid names cut shares financed &gt;3% today. ` +
        `<i>Context only: back-test found no reliable edge from market-wide unwind days (signs flip across measures), so it is not scored.</i></p>`
      : '') +
    tierBlock(
      'Tier A — Prime',
      'All gates pass AND score ≥ 70 (deep flush, strong rejection wick, strong leader).',
      A,
      '#0a7a2f',
      stockscansLink
    ) +
    tierBlock(
      'Tier B — Core',
      'All gates pass (the back-tested rule), score &lt; 70.',
      B,
      '#1a56a8',
      stockscansLink
    ) +
    tierBlock(
      'Tier C — Watch (near-miss)',
      'Flush + leader + above 50-DMA, but exactly one soft gate (wick or location) missed. Not back-tested; do not treat as entry.',
      C,
      '#8a6d00',
      stockscansLink
    ) +
    `<p style="color:#555"><b>How to read:</b> signal day = the disclosed MTF session (file lags one session), the candle is that same day. ` +
    `Back-test entered at the NEXT close; entering one session later kept most of the edge. Typical 10-day drawdown after entry ≈ −4%; the signal-day low is the natural invalidation reference.</p>` +
    `<p style="color:#a00"><b>What could be wrong:</b> edge is small (median 20d excess ≈ +1% vs the median stock, hit-rate ≈ 56–58%, ~26 variants tested, no costs). ` +
    `Score weights are uncalibrated (a ranking aid, not a return forecast); tiers A vs B showed no proven difference. Shashank's own flush definition and earnings-catalyst filter are not encoded. ` +
    `Third-party aggregator data (may lag or change).</p>` +
    `<p style="color:#888;font-size:11px">Data: IndiaMTF.com, from NSE/BSE disclosures; prices: NSE bhavcopy. Rule: docs/mtf-flush-signal/SPEC.md.</p></div>`;
  const subject = `📉➡️📈 MTF flush entries ${signalDate}: ${A.length} A · ${B.length} B · ${C.length} C watch (${newCount} new)`;
  return { subject, html };
}

module.exports = { formatEmail };
