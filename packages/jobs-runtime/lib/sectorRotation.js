'use strict';
/**
 * sectorRotation — pure evaluators for S2 (sector relative strength vs Nifty) and S3 (focus-name concentration by
 * industry), plus the X4 context signal (industry RS rollover). No I/O. ALL thresholds are ASSUMPTIONS (uncalibrated).
 * Sources: Suresh 1997104611094941718 (sector RS rolls over while others improve), SOIC teaching (rank sectors by relative
 * strength weekly over 1 week / 1 month; ratio chart turning up), thechartist26 1952699636017234121 (3-4 of 10-12 focus
 * names in one group => that group goes to the top).
 *   S2 rising:  industry median 1M return minus market median 1M (rs1) > 0 AND rs1 is rising (> last week's rs1, or without
 *               history rs1 > rs3/3, i.e. recent outperformance above its 3-month monthly average); confirmed if also
 *               rs3 > 0 and >= 60% of members beat the market 1M median.
 *   X4 rollover: rs3 > 0 and rs1 < 0 -> detected; confirmed if rs1 <= -3pp and < 40% of members beat the market 1M median.
 *   S3:         focus set size >= 8; industry holds >= 3 focus names and >= 25% of the set -> detected; >= 4 names or >= 40% -> confirmed.
 * Market = the scan universe's own median (default Nifty 500), not the index return.
 */
const TH = Object.freeze({ minN: 5, shareConfirm: 0.6, rolloverGapPp: 3, rolloverShare: 0.4, focusMin: 8, focusNames: 3, focusShare: 0.25, focusNamesConfirm: 4, focusShareConfirm: 0.4 });
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const r2 = (x) => Math.round(x * 100) / 100;
const median = (a) => {
  const s = a.filter(num).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** @param {{industry:string,r1m:number,r3m:number}[]} rows universe members with an industry */
function industryRs(rows, minN = TH.minN) {
  const mkt1m = median(rows.map((r) => r.r1m));
  const mkt3m = median(rows.map((r) => r.r3m));
  const g = new Map();
  for (const r of rows) {
    if (!r.industry || !num(r.r1m) || !num(r.r3m)) continue;
    (g.get(r.industry) || g.set(r.industry, []).get(r.industry)).push(r);
  }
  const industries = [];
  for (const [industry, m] of g) {
    if (m.length < minN) continue;
    const med1m = median(m.map((x) => x.r1m));
    const med3m = median(m.map((x) => x.r3m));
    industries.push({
      industry,
      n: m.length,
      med1m: r2(med1m),
      med3m: r2(med3m),
      rs1: r2(med1m - mkt1m),
      rs3: r2(med3m - mkt3m),
      share1m: r2(m.filter((x) => x.r1m > mkt1m).length / m.length),
    });
  }
  return { mkt1m: r2(mkt1m), mkt3m: r2(mkt3m), industries: industries.sort((a, b) => b.rs1 - a.rs1) };
}

/** @param {object} table industryRs() output  @param {object|null} prev last week's industries (array) */
function rsObservations(table, prev = null) {
  const pm = new Map((prev || []).map((i) => [i.industry, i]));
  const obs = [];
  for (const i of table.industries) {
    const p = pm.get(i.industry);
    const rising = p ? i.rs1 > p.rs1 : i.rs1 > i.rs3 / 3;
    let s2 = null;
    if (i.rs1 > 0 && rising) s2 = i.rs3 > 0 && i.share1m >= TH.shareConfirm ? 'confirmed' : 'detected';
    let x4 = null;
    if (i.rs3 > 0 && i.rs1 < 0) x4 = i.rs1 <= -TH.rolloverGapPp && i.share1m < TH.rolloverShare ? 'confirmed' : 'detected';
    const ev = { ...i, mkt1m: table.mkt1m, mkt3m: table.mkt3m, prevRs1: p ? p.rs1 : null, calibrated: false };
    obs.push({ signalId: 'S2-sector-rs-rising', entityType: 'sector', entityId: i.industry, state: s2, minMisses: 2, evidence: ev });
    obs.push({ signalId: 'X4-sector-rs-rollover', entityType: 'sector', entityId: i.industry, state: x4, minMisses: 2, evidence: ev });
  }
  return obs;
}

/** @param {{id:string,industry:string|null}[]} focus  names currently in an entry-side state */
function focusConcentration(focus, th = TH) {
  const names = focus.filter((f) => f.industry);
  if (names.length < th.focusMin) return { insufficient: true, size: names.length, observations: [] };
  const g = new Map();
  for (const f of names) (g.get(f.industry) || g.set(f.industry, []).get(f.industry)).push(f.id);
  const observations = [];
  for (const [industry, ids] of g) {
    const share = ids.length / names.length;
    let state = null;
    if (ids.length >= th.focusNames && share >= th.focusShare)
      state = ids.length >= th.focusNamesConfirm || share >= th.focusShareConfirm ? 'confirmed' : 'detected';
    observations.push({
      signalId: 'S3-focus-concentration',
      entityType: 'sector',
      entityId: industry,
      state,
      minMisses: 2,
      evidence: { names: ids, count: ids.length, focusSize: names.length, sharePct: r2(share * 100), calibrated: false },
    });
  }
  return { insufficient: false, size: names.length, observations };
}

module.exports = { TH, median, industryRs, rsObservations, focusConcentration };
