#!/usr/bin/env node
/**
 * Gainers classifier — deterministic, no external API calls.
 * Reads:  data/runs/gainers_raw_{YYYYMMDD}.json  (written by gainersScanner)
 * Writes: classified signals → events collection via lib/db.js (type: "gainer"),
 *         plus data/runs/gainers_insights_{YYYYMMDD}.json (full DTO for the email
 *         render — regenerable from raw + this classifier).
 */
const fs = require('fs');
const path = require('path');
const db = require('./db');

const RUNS_DIR = path.join(db.dataRoot(), 'runs');

function latestRaw(runsDir = RUNS_DIR) {
  if (!fs.existsSync(runsDir)) {
    throw new Error(`No such directory: ${runsDir}`);
  }
  const files = fs.readdirSync(runsDir)
    .filter(f => /^gainers_raw_\d{8}\.json$/.test(f))
    .sort(); // lexical sort works for YYYYMMDD
  if (files.length === 0) {
    throw new Error(`No gainers_raw_*.json in ${runsDir}`);
  }
  return path.join(runsDir, files[files.length - 1]);
}

function buildEvidence(g, sectorCatalystIndustries) {
  const ev = [];
  
  // Announcements
  const anns = g.announcements || [];
  for (const ann of anns) {
    const subj = ann.subject || '';
    const cat = (ann.category || '').toLowerCase();
    const materialSet = new Set(['board meeting', 'result', 'dividend', 'acquisition', 'merger', 'ipo', 'rights issue', 'buyback']);
    const mat = ann.material || materialSet.has(cat);
    const icon = mat ? '📋' : '📄';
    if (subj) {
      ev.push(`${icon} ${subj.substring(0, 120)}`);
    } else {
      ev.push(`${icon} ${ann.category}`);
    }
  }

  // Delivery
  const deliv = g.delivery || {};
  if (deliv.available) {
    const src = deliv.source || '';
    const tag = src.toLowerCase().includes('nse') ? '[NSE]' : '[BSE]';
    const pct = deliv.deliv_per;
    if (pct !== undefined && pct !== null) {
      ev.push(`Delivery ${pct.toFixed(1)}% ${tag}`);
    }
    if (deliv.high_delivery) {
      ev.push("⚡ High-delivery flag");
    }
  } else {
    ev.push("⚠️ Delivery data unavailable — confirm on bseindia.com");
  }

  // Price signals
  const ps = g.price_signals || {};
  if (ps.error === undefined) {
    if (ps.vol_spike) {
      if (typeof ps.vol_ratio === 'number') {
        ev.push(`🔊 Volume spike (${ps.vol_ratio.toFixed(1)}x avg)`);
      } else {
        ev.push("🔊 Volume spike");
      }
    }
    if (ps.breakout_52w) {
      ev.push("🚀 52-week high breakout");
    }
    if (ps.above_200dma) {
      ev.push("📈 Above 200-DMA");
    }
    if (typeof ps.rsi === 'number' && ps.rsi > 70) {
      ev.push(`RSI ${Math.round(ps.rsi)} (overbought)`);
    }
  } else {
    ev.push("⚠️ Price-history signals unavailable");
  }

  // Sector
  if (sectorCatalystIndustries.has(g.industry)) {
    ev.push(`🏭 Sector broad move: ${g.industry}`);
  }

  return ev;
}

function classify(g, sectorCatalystIndustries) {
  const deliv = g.delivery || {};
  const delivPct = deliv.available ? (deliv.deliv_per || 0) : 0;
  const highDel = !!deliv.high_delivery;
  const hasMat = !!g.has_material_ann;
  const anns = g.announcements || [];
  
  const ps = g.price_signals || {};
  const psOk = ps.error === undefined;
  const volSpike = psOk && !!ps.vol_spike;
  const breakout = psOk && !!ps.breakout_52w;
  const above200 = psOk && !!ps.above_200dma;
  
  const inSector = sectorCatalystIndustries.has(g.industry);

  // FUNDAMENTAL
  if (hasMat && anns.length > 0) {
    const conviction = (highDel || delivPct >= 30) ? "HIGH" : "MEDIUM";
    return { primary_driver: "FUNDAMENTAL", conviction };
  }

  // SECTOR_CATALYST
  if (inSector) {
    const conviction = (highDel || delivPct >= 30) ? "HIGH" : "MEDIUM";
    return { primary_driver: "SECTOR_CATALYST", conviction };
  }

  // PRICE_ACTION
  const paSignals = (highDel ? 1 : 0) + (volSpike ? 1 : 0) + (breakout ? 1 : 0) + (above200 ? 1 : 0) + (delivPct >= 40 ? 1 : 0);
  if (paSignals >= 2) {
    return { primary_driver: "PRICE_ACTION", conviction: "HIGH" };
  }
  if (paSignals === 1 || delivPct >= 25) {
    return { primary_driver: "PRICE_ACTION", conviction: "MEDIUM" };
  }

  // VOLATILITY
  return { primary_driver: "VOLATILITY", conviction: "LOW" };
}

function main() {
  const rawPath = latestRaw();
  console.error(`[classifier] reading ${path.basename(rawPath)}`);

  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
  const marketDate = raw.market_date;
  const gainers = raw.gainers || [];
  const indSummary = raw.industry_summary || {};

  const sectorCatalystIndustries = new Set();
  for (const [ind, info] of Object.entries(indSummary)) {
    if ((info.gainer_count || 0) >= 3) {
      sectorCatalystIndustries.add(ind);
    }
  }

  const signals = [];
  for (const g of gainers) {
    const cls = classify(g, sectorCatalystIndustries);
    const driver = cls.primary_driver;
    const conv = cls.conviction;
    const ev = buildEvidence(g, sectorCatalystIndustries);
    const inEm = (conv === "HIGH" || conv === "MEDIUM") && driver !== "VOLATILITY";
    const nowIso = new Date().toISOString();

    signals.push({
      // DTO envelope (skills/tooling/output-dto-standard/SKILL.md) — required on every
      // record: companyId reuses the existing ticker identifier, creator names this skill.
      companyId: g.ticker,
      creationTime: nowIso,
      modifiedTime: nowIso,
      creator: "gainers-signal",
      ticker: g.ticker,
      name: g.name,
      industry: g.industry || "",
      return_1d: g.return_1d,
      market_cap_cr: g.market_cap_cr,
      primary_driver: driver,
      conviction: conv,
      in_email: inEm,
      evidence: ev,
      delivery: g.delivery || {},
      ann_count: g.ann_count || 0,
      has_material_ann: g.has_material_ann || false,
    });
  }

  const sectorCatalysts = {};
  for (const ind of sectorCatalystIndustries) {
    const info = indSummary[ind] || {};
    const tickers = info.gainer_tickers || [];
    const returns = gainers.filter(g => tickers.includes(g.ticker)).map(g => g.return_1d).filter(r => r !== undefined && r !== null);
    
    let avgReturn = 0;
    if (returns.length > 0) {
      const sum = returns.reduce((a, b) => a + b, 0);
      avgReturn = Math.round((sum / returns.length) * 100) / 100;
    }

    sectorCatalysts[ind] = {
      tickers,
      avg_return: avgReturn,
    };
  }

  const totalAnalyzed = signals.length;
  const inEmailCount = signals.filter(s => s.in_email).length;
  const noiseExcluded = totalAnalyzed - inEmailCount;

  const insights = {
    schema_version: "1.0",
    market_date: marketDate,
    total_analyzed: totalAnalyzed,
    in_email: inEmailCount,
    noise_excluded: noiseExcluded,
    ann_api_available: gainers.some(g => (g.ann_count || 0) > 0),
    price_api_available: gainers.some(g => g.price_signals && g.price_signals.error === undefined),
    sector_catalysts: sectorCatalysts,
    signals,
  };

  // Canonical store: one event record per signal (deterministic ids — re-runs upsert).
  const eventRecords = signals
    .filter((s) => s.companyId || s.ticker)
    .map((s) => ({
      ...s,
      type: 'gainer',
      date: marketDate,
      companyId: s.companyId || `NSE:${String(s.ticker).toUpperCase()}`,
      creator: s.creator || 'gainers-signal',
      summary: `${s.ticker} +${s.return_1d}% — ${s.primary_driver} (${s.conviction})`,
    }));
  const stats = db.appendEvents(eventRecords);

  // Full DTO for the email render step (regenerable → runs/).
  const outPath = path.join(RUNS_DIR, `gainers_insights_${marketDate.replace(/-/g, '')}.json`);
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(insights, null, 2));

  console.error(`[classifier] events: +${stats.inserted}/${stats.updated}~; wrote ${path.basename(outPath)}  (${totalAnalyzed} analyzed, ${inEmailCount} in email)`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
