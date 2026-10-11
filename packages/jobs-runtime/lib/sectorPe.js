'use strict';
/**
 * sectorPe — pure helpers for the weekly sector-PE snapshot (kba_..._valuation-playbook_sector-pe-phase).
 * Stockscans exposes only the CURRENT 'Industry PE Median'; history must be accumulated by snapshotting.
 */
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** rows: [{industry, sector, pe, industryPeMedian}] -> [{industry, sector, n, medianPe, platformMedianPe}] */
function aggregateByIndustry(rows, minN = 3) {
  const g = new Map();
  for (const r of rows) {
    if (!r.industry) continue;
    const e = g.get(r.industry) || {
      industry: r.industry,
      sector: r.sector || null,
      pes: [],
      plat: [],
    };
    if (num(r.pe) && r.pe > 0) e.pes.push(r.pe);
    if (num(r.industryPeMedian) && r.industryPeMedian > 0) e.plat.push(r.industryPeMedian);
    g.set(r.industry, e);
  }
  return [...g.values()]
    .filter((e) => e.pes.length >= minN)
    .map((e) => ({
      industry: e.industry,
      sector: e.sector,
      n: e.pes.length,
      medianPe: Math.round(median(e.pes) * 100) / 100,
      platformMedianPe: e.plat.length ? Math.round(median(e.plat) * 100) / 100 : null,
    }))
    .sort((a, b) => a.industry.localeCompare(b.industry));
}

/** ISO week key 'YYYY-Www' (UTC) so a weekly job writes once per week */
function weekKey(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const wk = 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

module.exports = { aggregateByIndustry, weekKey, median };
