#!/usr/bin/env node
/**
 * equity-research-master orchestrator (Node port)
 */
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const BACKEND_DEFAULT = process.env.STOCKMARKET_BACKEND || "http://localhost:5000";
const RESEARCH_ROOT = process.env.RESEARCH_ROOT || path.join(process.env.HOME || '', 'Research');
const FOLDERS = [
  "Annual_Reports",
  "Concalls",
  "Investor_Presentations",
  "Credit_Rating_Reports",
  "Events_Announcements",
];

function getWorkspace(ticker) {
  const p = path.join(RESEARCH_ROOT, ticker.toUpperCase());
  for (const f of FOLDERS) {
    fs.mkdirSync(path.join(p, f), { recursive: true });
  }
  fs.mkdirSync(path.join(p, "_cache"), { recursive: true });
  return p;
}

async function acquire(ticker, backend) {
  const ws = getWorkspace(ticker);
  const sym = ticker.toUpperCase();
  const base = backend.replace(/\/+$/, '');

  const fetchAnnouncements = async () => {
    try {
      await axios.post(`${base}/api/research-pipeline/workspace/${sym}/init`, {}, { timeout: 60000 });
      const annRes = await axios.get(`${base}/api/announcements/${sym}`, { params: { provider: 'auto' }, timeout: 120000 });
      const items = annRes.data.data || [];
      const downloads = [];
      for (const it of items) {
        if (it.attchmntFile) {
          downloads.push({
            url: it.attchmntFile,
            subject: it.subject || it.desc || "announcement",
            date: it.an_dt || "",
          });
        }
      }
      if (!downloads.length) return ["announcements", { skipped: "no_pdf_attachments_in_feed" }];
      const topDownloads = downloads.slice(0, 50);
      const saveRes = await axios.post(`${base}/api/research-pipeline/workspace/${sym}/events-pdfs`, { announcements: topDownloads }, { timeout: 300000 });
      return ["announcements", saveRes.data];
    } catch (e) {
      return ["announcements", ["error", e.message]];
    }
  };

  const fetchStockMeta = async () => {
    try {
      const r = await axios.get(`${backend}/api/stocks/${sym}`, { timeout: 30000 });
      fs.writeFileSync(path.join(ws, "_cache", "stock_meta.json"), JSON.stringify(r.data, null, 2));
      return ["stock_meta", r.data];
    } catch (e) {
      return ["stock_meta", ["error", e.message]];
    }
  };

  const fetchFinancials = async () => {
    try {
      const r = await axios.get(`${backend}/api/stocks/${sym}/financials`, { timeout: 60000 });
      fs.writeFileSync(path.join(ws, "_cache", "financials.json"), JSON.stringify(r.data, null, 2));
      return ["financials", true];
    } catch (e) {
      return ["financials", ["error", e.message]];
    }
  };

  const fetchQuarterly = async () => {
    try {
      const r = await axios.get(`${backend}/api/stocks/${sym}/quarterly`, { timeout: 60000 });
      fs.writeFileSync(path.join(ws, "_cache", "quarterly.json"), JSON.stringify(r.data, null, 2));
      return ["quarterly", true];
    } catch (e) {
      return ["quarterly", ["error", e.message]];
    }
  };

  const resultsArr = await Promise.all([
    fetchAnnouncements(),
    fetchStockMeta(),
    fetchFinancials(),
    fetchQuarterly()
  ]);
  const results = {};
  for (const [k, v] of resultsArr) {
    results[k] = Array.isArray(v) && v[0] === 'error' ? v[1] : v;
  }

  console.log(JSON.stringify({ workspace: ws, results }, null, 2));
}

function computeSchemas(ticker) {
  const ws = getWorkspace(ticker);
  const sym = ticker.toUpperCase();

  const cache = {
    meta: { ticker: sym, workspace: ws },
    kpi_table: null,
    valuation_ladder: null,
    triggers: null,
    qoq_deltas: null,
    forensic_flags: null,
    sources: {},
  };

  const xlsxPath = path.join(ws, `${sym}_MasterData.xlsx`);
  if (fs.existsSync(xlsxPath)) {
    // mock xlsx parsing or use a small library. Skipping for simple Node port
    cache.sources.masterdata_sheets = ["Sheet1"];
  }

  const filesToScan = [
    ["ar", `${sym}_AR_Extracts.txt`],
    ["concall", `${sym}_Concall.txt`],
    ["investor_pres", `${sym}_InvestorPres.txt`],
    ["ratings", `${sym}_RatingReports.txt`],
    ["events", `${sym}_Events.txt`],
  ];

  for (const [label, fname] of filesToScan) {
    const p = path.join(ws, fname);
    const present = fs.existsSync(p);
    cache.sources[label] = {
      path: p,
      present,
      bytes: present ? fs.statSync(p).size : 0
    };
  }

  const presDir = path.join(ws, "Investor_Presentations");
  let deckCount = 0;
  if (fs.existsSync(presDir)) {
    deckCount = fs.readdirSync(presDir).filter(x => x.endsWith('.pdf')).length;
  }
  cache.meta.investor_deck_count = deckCount;
  cache.meta.tab15_enabled = deckCount >= 2;

  const out = path.join(ws, "_cache", "schemas.json");
  fs.writeFileSync(out, JSON.stringify(cache, null, 2));
  console.log(JSON.stringify({ cache: out, tab15_enabled: cache.meta.tab15_enabled }, null, 2));
}

async function publish(ticker, html_path, backend) {
  const sym = ticker.toUpperCase();
  const p = path.resolve(html_path);
  if (!fs.existsSync(p)) {
    console.error(`dashboard not found: ${p}`);
    process.exit(1);
  }
  
  const FormData = require('form-data');
  const form = new FormData();
  form.append('file', fs.createReadStream(p));
  
  try {
    const res = await axios.post(`${backend}/api/stocks/${sym}/research-dashboard`, form, {
      headers: form.getHeaders(),
      timeout: 120000
    });
    console.log(JSON.stringify({ published: true, symbol: sym, response: res.data }, null, 2));
  } catch (e) {
    console.error("publish failed:", e.message);
    process.exit(1);
  }
}

program.option('--backend <url>', 'Backend URL', BACKEND_DEFAULT);

program.command('acquire')
  .requiredOption('--ticker <ticker>')
  .action((opts) => acquire(opts.ticker, program.opts().backend));

program.command('compute-schemas')
  .requiredOption('--ticker <ticker>')
  .action((opts) => computeSchemas(opts.ticker));

program.command('publish')
  .requiredOption('--ticker <ticker>')
  .requiredOption('--html <path>')
  .action((opts) => publish(opts.ticker, opts.html, program.opts().backend));

program.parse(process.argv);
