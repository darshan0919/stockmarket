'use strict';

const fs = require('fs');
const path = require('path');
const { stockscans } = require('../index');
const { classify, priceVolumeAlerts } = require('./catalystRules');
const { resolveUniverse } = require('./runScan');

const SEV_ORDER = { HIGH: 0, RISK: 1, MEDIUM: 2 };
const SEV_COLOR = { HIGH: "#16a34a", RISK: "#dc2626", MEDIUM: "#d97706" };

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderHtml(alerts, meta) {
  const cards = alerts.map(a => {
    const sev = a.severity;
    const chips = [...(a.marquee || []).slice(0,3), ...(a.themes || []).slice(0,3), ...(a.investors || []).slice(0,3)]
      .map(x => `<span class="chip">${escapeHtml(x)}</span>`)
      .join("");
    
    let val = "";
    if (a.value_cr) {
      val = `<span class="val">Rs ${a.value_cr.toLocaleString('en-IN', {maximumFractionDigits:0})} cr`;
      if (a.btb) val += ` · ${(a.btb*100).toFixed(0)}% of TTM rev`;
      val += `</span>`;
    }
    
    const pdf = a.pdf ? `<a class="pdf" href="${escapeHtml(stockscans.s3PdfUrl(a.pdf))}" target="_blank">filing PDF ↗</a>` : "";
    
    return `
        <div class="card sev-${sev}" data-sev="${sev}">
          <div class="row1">
            <span class="badge" style="background:${SEV_COLOR[sev]}">${sev}</span>
            <span class="cat">${escapeHtml(a.category)}</span>
            <span class="tick">${escapeHtml(a.companyId)}</span>
            <span class="date">${escapeHtml(a.date)}</span>
          </div>
          <div class="name">${escapeHtml(a.name)}</div>
          <div class="title">${escapeHtml(a.title)}</div>
          <div class="why">${escapeHtml(a.why)} ${val}</div>
          <div class="desc">${escapeHtml(a.description)}</div>
          <div class="row2">${chips}${pdf}</div>
        </div>`;
  });

  const counts = {
    HIGH: alerts.filter(a => a.severity === 'HIGH').length,
    MEDIUM: alerts.filter(a => a.severity === 'MEDIUM').length,
    RISK: alerts.filter(a => a.severity === 'RISK').length,
  };

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Catalyst Alerts — ${escapeHtml(meta.window)}</title><style>
:root{--bg:#0b0f17;--card:#121826;--tx:#e5e7eb;--mut:#94a3b8;--bd:#1f2937}
@media (prefers-color-scheme: light){:root{--bg:#f8fafc;--card:#fff;--tx:#0f172a;--mut:#64748b;--bd:#e2e8f0}}
body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:24px}
h1{font-size:20px;margin:0 0 4px} .sub{color:var(--mut);margin-bottom:16px}
.filters button{background:var(--card);border:1px solid var(--bd);color:var(--tx);
padding:6px 14px;border-radius:20px;margin-right:8px;cursor:pointer;font-size:13px}
.filters button.on{border-color:#3b82f6;color:#3b82f6}
.card{background:var(--card);border:1px solid var(--bd);border-radius:12px;
padding:14px 16px;margin:12px 0;border-left-width:4px}
.card.sev-HIGH{border-left-color:#16a34a}.card.sev-RISK{border-left-color:#dc2626}
.card.sev-MEDIUM{border-left-color:#d97706}
.row1{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.badge{color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px}
.cat{font-weight:700;font-size:12px;letter-spacing:.04em}
.tick{color:var(--mut);font-size:12px} .date{margin-left:auto;color:var(--mut);font-size:12px}
.name{font-weight:700;margin-top:6px} .title{color:var(--mut);font-size:13px}
.why{margin-top:6px} .val{color:#3b82f6;font-weight:600}
.desc{color:var(--mut);font-size:12.5px;margin-top:6px}
.row2{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.chip{background:rgba(59,130,246,.12);color:#3b82f6;font-size:11px;padding:2px 8px;border-radius:10px}
.pdf{margin-left:auto;font-size:12px;color:#3b82f6;text-decoration:none}
</style></head><body>
<h1>Watchlist Catalyst Alerts</h1>
<div class="sub">${escapeHtml(meta.window)} · ${meta.n_companies} companies scanned ·
${meta.n_raw} announcements processed → <b>${counts.HIGH} HIGH</b> ·
${counts.MEDIUM} MEDIUM · ${counts.RISK} RISK · generated ${escapeHtml(meta.generated)}</div>
<div class="filters">
<button class="on" onclick="flt('ALL',this)">All</button>
<button onclick="flt('HIGH',this)">HIGH</button>
<button onclick="flt('MEDIUM',this)">MEDIUM</button>
<button onclick="flt('RISK',this)">RISK</button></div>
${cards.length ? cards.join('') : '<p>No significant catalysts in this window — the filter is doing its job.</p>'}
<script>function flt(s,b){document.querySelectorAll('.filters button').forEach(x=>x.classList.remove('on'));
b.classList.add('on');document.querySelectorAll('.card').forEach(c=>{
c.style.display=(s==='ALL'||c.dataset.sev===s)?'':'none'})}</script>
</body></html>`;
}

async function fetchAnnouncementsBatch(tickers, stopBefore, maxPages = 10) {
  const out = [];
  for (let page = 0; page < maxPages; page++) {
    const data = await stockscans.companyAnnouncements(
      { companyIds: tickers, offset: page * 30 },
      { referer: 'https://www.stockscans.in/company/' }
    );
    const rows = data.companyAnnouncements || [];
    if (rows.length === 0) break;

    let stale = false;
    for (const row of rows) {
      const d = (row.date || "").substring(0, 10);
      if (d && d < stopBefore) {
        stale = true;
        continue;
      }
      out.push(row);
    }
    if (stale || rows.length < 30) break;
    await new Promise(res => setTimeout(res, 300));
  }
  return out;
}

/**
 * Perform watchlist catalyst scan.
 */
async function scanCatalysts(scanId, options = {}) {
  const { days = 7, outDir = './outputs', batch = 5 } = options;

  const today = new Date();
  const stopDate = new Date(today);
  stopDate.setDate(today.getDate() - days);
  const stopBefore = stopDate.toISOString().substring(0, 10);

  const universe = await resolveUniverse(scanId);
  const companies = universe.companies;
  const byId = {};
  for (const c of companies) if (c.companyId) byId[c.companyId] = c;

  const raw = [];
  const ids = Object.keys(byId);
  for (let i = 0; i < ids.length; i += batch) {
    const chunk = ids.slice(i, i + batch);
    try {
      const fetched = await fetchAnnouncementsBatch(chunk, stopBefore);
      raw.push(...fetched);
    } catch (e) {
      console.warn(`WARN batch ${chunk.join(',')}: ${e.message}`);
    }
  }

  const seen = new Set();
  const rawAlerts = [];
  for (const ann of raw) {
    const key = `${ann.companyId}|${(ann.date||"").substring(0,10)}|${(ann.title||"").substring(0,80)}|${(ann.description||"").substring(0,120)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const a = classify(ann, byId[ann.companyId] || {});
    if (a) rawAlerts.push(a);
  }

  const byk = {};
  const grouped = [];
  for (const a of rawAlerts) {
    const k = `${a.companyId}|${a.category}|${a.title.substring(0, 45)}`;
    if (byk[k]) {
      byk[k]._dups = (byk[k]._dups || 0) + 1;
    } else {
      byk[k] = a;
      grouped.push(a);
    }
  }
  for (const a of grouped) {
    if (a._dups) {
      a.why += ` (+${a._dups} similar update(s) in window — grouped.)`;
    }
  }

  const alerts = grouped;
  const META_CATEGORIES = new Set(["PRICE/VOLUME", "INSTITUTIONAL INTEREST", "RESULTS"]);
  const structural = {};
  for (const a of alerts) {
    if (!META_CATEGORIES.has(a.category) && a.severity !== "RISK") {
      structural[a.companyId] = (structural[a.companyId] || 0) + 1;
    }
  }

  for (const a of alerts) {
    const n = structural[a.companyId] || 0;
    if (n >= 3 && !META_CATEGORIES.has(a.category) && a.severity === "MEDIUM") {
      a.severity = "HIGH";
      a.why = `CONFLUENCE: ${n} structural filings by this company in window — coordinated strategic event. ` + a.why;
    }
  }

  alerts.push(...priceVolumeAlerts(companies));
  
  alerts.sort((a, b) => {
    const sevA = SEV_ORDER[a.severity] ?? 9;
    const sevB = SEV_ORDER[b.severity] ?? 9;
    if (sevA !== sevB) return sevA - sevB;
    return b.date.localeCompare(a.date);
  });

  const tag = today.toISOString().replace(/[-T:.Z]/g, '').substring(0, 8);
  const meta = {
    window: `${stopBefore} → ${today.toISOString().substring(0,10)} UTC`,
    n_companies: companies.length,
    n_raw: raw.length,
    generated: today.toISOString()
  };

  const outputDir = path.resolve(outDir);
  fs.mkdirSync(outputDir, { recursive: true });
  
  const jpath = path.join(outputDir, `catalyst_alerts_${tag}.json`);
  const hpath = path.join(outputDir, `catalyst_alerts_${tag}.html`);
  
  fs.writeFileSync(jpath, JSON.stringify({ meta, alerts }, null, 1), 'utf-8');
  fs.writeFileSync(hpath, renderHtml(alerts, meta), 'utf-8');

  return { meta, alerts, jpath, hpath };
}

module.exports = {
  scanCatalysts,
  renderHtml,
  fetchAnnouncementsBatch
};
