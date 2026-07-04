'use strict';

/**
 * catalystRules.js — significance rules engine for watchlist catalyst scanning.
 */

const THRESHOLDS = {
  order_btb_high: 0.30,
  order_btb_medium: 0.10,
  earnings_jump_pct: 50.0,
  ret_1d_high: 7.0,
  ret_1w_high: 12.0,
};

const MARQUEE_GLOBAL = [
  "microsoft", "apple", "google", "alphabet", "amazon", "aws", "meta",
  "nvidia", "tesla", "openai", "anthropic", "oracle", "azure", "coreweave",
  "tsmc", "intel", "amd", "qualcomm", "broadcom", "micron", "samsung",
  "foxconn", "asml", "applied materials", "texas instruments",
  "siemens", "general electric", "ge vernova", "abb", "schneider",
  "honeywell", "emerson", "caterpillar", "hitachi", "mitsubishi",
  "toshiba", "alstom", "wabtec", "cummins", "atlas copco", "sandvik",
  "boeing", "airbus", "lockheed", "raytheon", "rtx", "northrop",
  "bae systems", "thales", "rolls-royce", "rolls royce", "safran",
  "dassault", "rafael", "israel aerospace", "elbit", "saab", "leonardo",
  "general dynamics", "garrett",
  "shell", "bp ", "totalenergies", "exxon", "chevron", "aramco", "adnoc",
  "qatarenergy", "equinor", "baker hughes", "slb", "schlumberger",
  "halliburton", "technip", "saipem", "petrobras", "linde", "air liquide",
  "ericsson", "nokia", "cisco", "ciena", "corning", "verizon", "at&t",
  "vodafone", "deutsche telekom", "orange", "telefonica",
  "toyota", "volkswagen", "stellantis", "mercedes", "daimler", "bmw",
  "ford", "general motors", "rivian", "byd", "hyundai", "scania", "volvo",
  "bosch", "zf friedrichshafen", "magna", "denso", "schaeffler", "borgwarner",
  "pfizer", "merck", "novartis", "roche", "sanofi", "gsk", "astrazeneca",
  "abbott", "johnson & johnson", "medtronic", "teva", "viatris", "novo nordisk",
  "eli lilly", "bayer", "fresenius",
  "walmart", "costco", "unilever", "procter & gamble", "nestle", "ikea",
  "decathlon", "nike", "adidas", "h&m", "zara", "inditex", "target corp",
  "deutsche bahn", "sncf", "network rail",
];

const MARQUEE_INDIA = [
  "reliance", "jio", "tata", "adani", "larsen", "l&t", "bharti", "airtel",
  "bsnl", "indian railways", "rvnl", "ircon", "rail vikas", "ntpc",
  "power grid", "powergrid", "nhpc", "sjvn", "ongc", "iocl", "indian oil",
  "bpcl", "hpcl", "gail", "coal india", "nmdc", "sail", "bhel", "hal",
  "hindustan aeronautics", "bel", "bharat electronics", "drdo", "isro",
  "ministry of defence", "ministry of defense", "mod ", "indian army",
  "indian navy", "indian air force", "bharatnet", "nhai", "mahindra",
  "maruti", "bajaj", "hero motocorp", "ashok leyland", "ultratech",
  "jsw", "vedanta", "hindalco", "wipro", "infosys", "tcs", "hcl",
];

const TRENDING_TECH = [
  "artificial intelligence", " ai ", "data centre", "data center", "gpu",
  "semiconductor", "osat", "chip fab", "wafer", "nuclear", "small modular reactor",
  "smr", "green hydrogen", "electrolyser", "electrolyzer", "energy storage",
  "bess", "battery storage", "solar cell", "topcon", "ingot", "drone", "uav",
  "anti-drone", "counter-drone", "kavach", "vande bharat", "bullet train",
  "missile", "radar", "satellite", "space", "5g", "6g", "optical fibre",
  "optical fiber", "hvdc", "transformer", "transmission", "ev charging",
  "electric vehicle", "robotics", "defence export", "defense export",
];

const MARQUEE_INVESTORS = [
  "ashish kacholia", "mukul agrawal", "vijay kedia", "madhusudan kela",
  "ashish dhawan", "akash bhanshali", "sunil singhania", "abakkus",
  "rekha jhunjhunwala", "jhunjhunwala", "dolly khanna", "anil goel",
  "porinju", "ricky kirpalani", "nemish shah", "enam", "whiteoak",
  "quant mutual", "sbi mutual", "hdfc mutual", "icici prudential",
  "nippon", "axis mutual", "kotak mahindra mutual", "mirae",
  "goldman sachs", "morgan stanley", "nomura", "societe generale",
  "bofa", "merrill", "jp morgan", "blackrock", "vanguard", "fidelity",
  "t rowe", "smallcap world fund", "capital group", "norges",
  "government pension fund", "abu dhabi investment", "adia", "gic ",
  "temasek", "qia", "florida retirement",
];

const ORDER_PAT = /award_of_order|receipt_of_order|award of order|receipt of order|bagging of order|bags?\s+(an?\s+)?order|work order|purchase order|letter of intent|letter of award|loa\b|\bloi\b|secures?\s+(an?\s+)?(order|contract)|wins?\s+(an?\s+)?(order|contract)|order book|contract from|order from|repeat order|export order/i;
const RESULT_PAT = /financial results?|board meeting outcome.*result|results? for the (quarter|year)|unaudited|audited results/i;
const CAPRAISE_PAT = /preferential issue|preferential allotment|qualified institutions? placement|\bqip\b|warrants?|fund rais|rights issue/i;
const SAST_PAT = /sast|substantial acquisition|reg(ulation)?\.?\s*29|reg(ulation)?\.?\s*31\b|takeover/i;
const PIT_PAT = /insider trading|\bpit\b|reg(ulation)?\.?\s*7\s*\(2\)/i;
const RATING_PAT = /credit rating|rating action|rating update|care ratings|icra|crisil|india ratings|brickwork|acuite/i;
const DEBT_PAT = /prepayment|pre-payment|debt[- ]free|repayment of (term loan|debt|ncd)|redemption of (ncd|debenture)|reduc\w+ (of )?debt|deleverag/i;
const CAPACITY_PAT = /commercial production|commissioning|commenc\w+ (of )?(commercial )?production|capacity expansion|new (manufacturing )?(plant|facility|unit)|greenfield|brownfield|capex|expansion of capacity|land (acquisition|allotment|purchase).{0,40}(plant|facility|project|expansion)|foundation stone|groundbreaking/i;
const APPROVAL_PAT = /usfda|us fda|form 483|\beir\b|establishment inspection|eu gmp|who[- ]gmp|anda approval|\bcep\b|dcgi|nmpa|anvisa|pmda|tga approval|marketing authori[sz]ation|patent (grant|granted)|pli scheme|production linked|bis certification|peso|dgca|cdsco/i;
const MNA_PAT = /acquisition|amalgamation|merger|demerger|scheme of arrangement|slump sale|stake (purchase|acquisition)|open offer|delisting|joint venture|\bjv\b|strategic (partnership|alliance|investment)|technology (transfer|licens|tie[- ]up)|\bmou\b|memorandum of understanding|diversification/i;
const BUYBACK_PAT = /buy[- ]?back/i;
const VOLMOVE_PAT = /clarification regarding (price|volume) movement|unusual (price|volume)|spurt in (price|volume)/i;

const RISK_PAT = /pledge|encumbrance|resignation of (statutory )?auditor|auditor.{0,30}resign|resignation of (the )?(cfo|chief financial|managing director|company secretary)|search (and|&) seizure|income tax (raid|search)|gst.{0,20}(raid|search|notice)|\bed\b raid|enforcement directorate|sebi (order|show cause)|default|insolvency|nclt|winding up|fire (at|in|broke)|accident at|suspension of (trading|operations)|credit rating.{0,40}downgrad/i;
const NOISE_PAT = /book closure|record date|trading window|newspaper (publication|advertisement)|loss of share certificate|duplicate share|investor grievance|reg(ulation)?\.?\s*74\s*\(5\)|certificate under|compliance certificate|registrar|change in rta|postal ballot|scrutinizer|agm|annual general meeting|egm|extraordinary general|reg(ulation)?\.?\s*57|certificate of interest payment|timely payment of interest|insurance claim|claim amount of insurance|settlement claim of insurance|e-?voting|esop.{0,20}allot|allotment of (equity )?shares (under|pursuant to).{0,20}esop|notice of (board )?meeting|intimation of board meeting|change in (senior )?management.{0,10}$|cessation|closure of trading window|disclosure of related party|secretarial compliance|reconciliation of share capital/i;
const ANALYST_MEET_PAT = /analyst|investor meet|institutional investor|plant visit|earnings call|conference call|investor presentation/i;

const _VALUE_RE = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)\s*(crore|cr\b|lakh|lacs?|million|mn\b|billion|bn\b)?|usd\s*([\d,]+(?:\.\d+)?)\s*(million|mn\b|billion|bn\b)?|\$\s*([\d,]+(?:\.\d+)?)\s*(million|mn\b|billion|bn\b)?/gi;
const USD_INR = 86.0;
const BARE_CR_RE = /(?<![\w.])([\d,]+(?:\.\d+)?)\s*crores?\b/gi;

function extractValueCrore(text) {
  let best = null;
  let m;

  // Clone regexes for iteration if they have global flag, reset lastIndex
  const bareCrRe = new RegExp(BARE_CR_RE);
  while ((m = bareCrRe.exec(text)) !== null) {
    const tail = text.substring(m.index + m[0].length, m.index + m[0].length + 30).toLowerCase();
    if (tail.includes("share") || tail.includes("equity")) continue;
    const v = parseFloat(m[1].replace(/,/g, ""));
    if (best === null || v > best) best = v;
  }

  const valueRe = new RegExp(_VALUE_RE);
  while ((m = valueRe.exec(text)) !== null) {
    let val = null;
    if (m[1]) { // INR
      const num = parseFloat(m[1].replace(/,/g, ""));
      const unit = (m[2] || "").toLowerCase();
      if (unit.startsWith("crore") || unit.startsWith("cr")) val = num;
      else if (unit.startsWith("lakh") || unit.startsWith("lac")) val = num / 100.0;
      else if (unit.startsWith("million") || unit.startsWith("mn")) val = num / 10.0;
      else if (unit.startsWith("billion") || unit.startsWith("bn")) val = num * 100.0;
      else val = num > 1e6 ? num / 1e7 : null;
    } else { // USD
      const numS = m[3] || m[5];
      const unit = (m[4] || m[6] || "").toLowerCase();
      if (!numS) continue;
      const num = parseFloat(numS.replace(/,/g, ""));
      if (unit.startsWith("billion") || unit.startsWith("bn")) {
        val = num * 1e9 * USD_INR / 1e7;
      } else if (unit.startsWith("million") || unit.startsWith("mn")) {
        val = num * 1e6 * USD_INR / 1e7;
      } else {
        val = num > 1e6 ? num * USD_INR / 1e7 : null;
      }
    }
    if (val !== null && (best === null || val > best)) best = val;
  }
  return best;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findNames(text, names) {
  const t = text.toLowerCase();
  const out = new Set();
  for (const n of names) {
    const trimmed = n.trim();
    const regex = new RegExp(`\\b${escapeRegex(trimmed)}\\b`, 'i');
    if (regex.test(t)) {
      out.add(trimmed);
    }
  }
  return Array.from(out).sort();
}

function _alert(ann, company, category, severity, why, valueCr, marquee, themes, opts = {}) {
  const { btb = null, investors = [] } = opts;
  return {
    date: (ann.date || "").substring(0, 10),
    companyId: ann.companyId || company.companyId,
    name: ann.name || company.Name,
    category,
    severity,
    title: ann.title || "",
    description: (ann.description || "").substring(0, 600),
    why,
    value_cr: valueCr,
    btb,
    marquee,
    themes,
    investors,
    pdf: ann.ssUrl,
    mcap: company["Market Capitalization"],
    ttm_revenue: company["Revenue"],
  };
}

function classify(ann, company) {
  const title = ann.title || "";
  const desc = ann.description || "";
  const text = `${title}. ${desc}`;
  const tl = text.toLowerCase();

  const ttm_rev = company.Revenue || 0;
  const value_cr = extractValueCrore(text);
  const marquee = [...new Set([...findNames(tl, MARQUEE_GLOBAL), ...findNames(tl, MARQUEE_INDIA)])].sort();
  const themes = findNames(tl, TRENDING_TECH);
  const investors = findNames(tl, MARQUEE_INVESTORS);

  if (RISK_PAT.test(tl) && !NOISE_PAT.test(tl)) {
    if (/(release|revocation|revoke|invocation revoked)/.test(tl) && tl.includes("pledge")) {
      return _alert(ann, company, "DELEVERAGING", "HIGH",
        "Promoter pledge release — balance-sheet stress easing; classic precursor to re-rating.",
        value_cr, marquee, themes);
    }
    if (/downgrad/.test(tl)) {
      return _alert(ann, company, "RISK", "RISK",
        "Credit rating downgrade — structural negative.", value_cr, marquee, themes);
    }
    return _alert(ann, company, "RISK", "RISK",
      "Governance / stress flag (pledge, exit, raid, default-class event). Forensic review warranted.",
      value_cr, marquee, themes);
  }

  if (NOISE_PAT.test(tl) && !ORDER_PAT.test(tl) && !CAPRAISE_PAT.test(tl)) {
    return null;
  }

  if (ORDER_PAT.test(tl)) {
    const btb = (value_cr && ttm_rev) ? (value_cr / ttm_rev) : null;
    if (btb !== null && btb >= THRESHOLDS.order_btb_high) {
      return _alert(ann, company, "ORDER WIN", "HIGH",
        `Single order ≈ Rs ${value_cr.toFixed(0)} cr = ${(btb*100).toFixed(0)}% of TTM revenue (Rs ${ttm_rev.toFixed(0)} cr) — book-to-bill impact above the 0.30x bar.`,
        value_cr, marquee, themes, { btb });
    }
    if (marquee.length || themes.length) {
      const tag = [...marquee, ...themes].slice(0, 4).join(", ");
      const sev = marquee.length ? "HIGH" : "MEDIUM";
      return _alert(ann, company, "ORDER WIN", sev,
        `Order linked to marquee counterparty / trending theme (${tag}) — perception catalyst regardless of disclosed size.`,
        value_cr, marquee, themes, { btb });
    }
    if (btb !== null && btb >= THRESHOLDS.order_btb_medium) {
      return _alert(ann, company, "ORDER WIN", "MEDIUM",
        `Order ≈ Rs ${value_cr.toFixed(0)} cr = ${(btb*100).toFixed(0)}% of TTM revenue — meaningful but below the 0.30x conviction bar.`,
        value_cr, marquee, themes, { btb });
    }
    if (value_cr === null) {
      return _alert(ann, company, "ORDER WIN", "MEDIUM",
        "Order win with undisclosed value — pull the filing PDF to size it before acting.",
        value_cr, marquee, themes);
    }
    return null;
  }

  if (CAPRAISE_PAT.test(tl)) {
    const sev = (investors.length || tl.includes("promoter")) ? "HIGH" : "MEDIUM";
    let why = "Preferential/QIP/warrants event — dilution with information content. ";
    if (investors.length) {
      why += `Marquee allottee(s) detected: ${investors.slice(0, 3).join(', ')}.`;
    } else if (tl.includes("promoter")) {
      why += "Promoter participation — skin-in-the-game signal.";
    } else {
      why += "Check allottees and pricing vs CMP in the filing.";
    }
    return _alert(ann, company, "CAPITAL RAISE", sev, why, value_cr, marquee, themes, { investors });
  }

  if (SAST_PAT.test(tl) || PIT_PAT.test(tl)) {
    if (investors.length) {
      return _alert(ann, company, "SMART MONEY", "HIGH",
        `Stake disclosure involving ${investors.slice(0, 3).join(', ')} — known-investor footprint. Direction (buy/sell) not stated in summary; open the filing PDF.`,
        value_cr, marquee, themes, { investors });
    }
    let ent = null;
    const m = text.match(/regulations?,?\s*2011\s*(?:\([^)]*\))?\s*for\s+(.{3,60}?)(?:\.|$)/i);
    if (m) ent = m[1].trim();
    const instKw = /mutual fund|\bmf\b|asset management|\bamc\b|capital|investments?|insurance|pension|\bfpi\b|\bfii\b|fund\b|advisors|partners|ventures|\bllp\b/i;
    if (ent && instKw.test(ent)) {
      return _alert(ann, company, "SMART MONEY", "MEDIUM",
        `SAST stake-change disclosure by institutional holder: ${ent}. Direction not stated in summary — verify buy vs sell in the filing before reading it as accumulation.`,
        value_cr, marquee, themes, { investors: [ent] });
    }
    if (tl.includes("promoter")) {
      return _alert(ann, company, "SMART MONEY", "MEDIUM",
        "Promoter-linked SAST/insider disclosure — check for creeping acquisition (conviction signal) vs sale.",
        value_cr, marquee, themes);
    }
    return null;
  }

  if (RATING_PAT.test(tl)) {
    if (/upgrad/.test(tl)) {
      return _alert(ann, company, "RATING UPGRADE", "HIGH",
        "Credit rating upgrade — independent validation of balance-sheet repair; lowers cost of capital, widens lender/investor pool.",
        value_cr, marquee, themes);
    }
    if (/outlook.{0,20}(positive|revised)/.test(tl)) {
      return _alert(ann, company, "RATING UPGRADE", "MEDIUM",
        "Rating outlook revision — possible upgrade precursor.", value_cr, marquee, themes);
    }
    return null;
  }

  if (DEBT_PAT.test(tl)) {
    return _alert(ann, company, "DELEVERAGING", "HIGH",
      "Debt prepayment / redemption / debt-free declaration — direct D/E improvement; check magnitude vs gross debt.",
      value_cr, marquee, themes);
  }

  if (RESULT_PAT.test(tl)) {
    const m = tl.match(/(?:growth|up|increase[d]?|jump\w*|rose|higher)\D{0,15}(\d{2,4})\s*%/);
    const pct = m ? parseFloat(m[1]) : null;
    if (pct && pct >= THRESHOLDS.earnings_jump_pct) {
      return _alert(ann, company, "EARNINGS JUMP", "HIGH",
        `Result filing references ~${pct.toFixed(0)}% growth — run quarterly-result-analysis to verify clean vs reported.`,
        value_cr, marquee, themes);
    }
    return _alert(ann, company, "RESULTS", "MEDIUM",
      "Results filed within window — verify surprise vs expectations; strip one-offs before concluding.",
      value_cr, marquee, themes);
  }

  if (APPROVAL_PAT.test(tl)) {
    return _alert(ann, company, "REGULATORY APPROVAL", "HIGH",
      "Regulatory/quality approval (USFDA/EU GMP/PLI/patent class) — unlocks markets or incentives; typically multi-quarter relevance.",
      value_cr, marquee, themes);
  }

  if (CAPACITY_PAT.test(tl)) {
    const sev = ((value_cr && ttm_rev && (value_cr / ttm_rev > 0.15)) || themes.length) ? "HIGH" : "MEDIUM";
    return _alert(ann, company, "CAPACITY EXPANSION", sev,
      "Capacity commissioning/expansion — forward revenue visibility; verify funding mix and utilisation ramp assumptions.",
      value_cr, marquee, themes);
  }

  if (BUYBACK_PAT.test(tl)) {
    return _alert(ann, company, "BUYBACK", "HIGH",
      "Buyback event — capital-return signal; check size vs float and acceptance-ratio math.",
      value_cr, marquee, themes);
  }

  if (MNA_PAT.test(tl)) {
    if (/(wholly[- ]owned subsidiary|\bwos\b)/.test(tl) && !value_cr && !marquee.length) {
      return null;
    }
    const sev = (marquee.length || (value_cr && ttm_rev && (value_cr / ttm_rev > 0.15))) ? "HIGH" : "MEDIUM";
    const tag = marquee.length ? ` Counterparty: ${marquee.slice(0, 3).join(', ')}.` : "";
    return _alert(ann, company, "M&A / STRATEGIC", sev,
      "Acquisition/JV/tie-up/demerger-class event — structural change to business mix." + tag,
      value_cr, marquee, themes);
  }

  if (VOLMOVE_PAT.test(tl)) {
    return _alert(ann, company, "PRICE/VOLUME", "MEDIUM",
      "Exchange sought clarification on price/volume movement — the market is moving on something; cross-check pending announcements.",
      value_cr, marquee, themes);
  }

  if (ANALYST_MEET_PAT.test(tl)) {
    if (/(plant visit|site visit|facility visit)/.test(tl)) {
      return _alert(ann, company, "INSTITUTIONAL INTEREST", "MEDIUM",
        "Institutional plant visit — buy-side diligence footprint; often precedes position-building.",
        value_cr, marquee, themes);
    }
    return null;
  }

  return null;
}

function priceVolumeAlerts(companies) {
  const out = [];
  for (const c of companies) {
    const r1d = c["Returns 1D"];
    const r1w = c["Returns 1W"];
    const crs = c["CRS Vs Nifty 500 25D"];

    if (r1d !== null && r1d !== undefined && r1d >= THRESHOLDS.ret_1d_high) {
      out.push(_alert({ date: "", title: `1D move ${r1d > 0 ? '+' : ''}${r1d.toFixed(1)}%` },
        c, "PRICE/VOLUME", "MEDIUM",
        `1-day move ${r1d > 0 ? '+' : ''}${r1d.toFixed(1)}% (CRS25D ${crs}) — confirm against news flow; unexplained spikes warrant the forensic lens.`,
        null, [], []));
    } else if (r1w !== null && r1w !== undefined && r1w >= THRESHOLDS.ret_1w_high) {
      out.push(_alert({ date: "", title: `1W move ${r1w > 0 ? '+' : ''}${r1w.toFixed(1)}%` },
        c, "PRICE/VOLUME", "MEDIUM",
        `1-week move ${r1w > 0 ? '+' : ''}${r1w.toFixed(1)}% (CRS25D ${crs}) — momentum building; check for pending catalysts.`,
        null, [], []));
    }
  }
  return out;
}

module.exports = {
  extractValueCrore,
  findNames,
  classify,
  priceVolumeAlerts,
  THRESHOLDS
};
