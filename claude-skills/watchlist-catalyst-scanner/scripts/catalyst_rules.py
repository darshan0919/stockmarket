#!/usr/bin/env python3
"""
catalyst_rules.py — significance rules engine for watchlist catalyst scanning.

Philosophy: the keyword is SIGNIFICANT. We only surface "structural" news that
can shift business perception for multiple weeks. Everything routine is
suppressed. Every alert carries: category, severity (HIGH/MEDIUM/RISK),
a one-line why-it-matters, and the evidence (matched text, extracted numbers).

Severity semantics
------------------
HIGH   -> notify immediately; potential re-rating event
MEDIUM -> include in digest; worth a look, not a drop-everything event
RISK   -> negative structural flag (pledge creation, auditor exit, raids...)
None   -> suppressed (routine compliance noise)

All thresholds centralised in THRESHOLDS for easy tuning.
"""
from __future__ import annotations

import re

# ---------------------------------------------------------------------------
# Tunable thresholds
# ---------------------------------------------------------------------------
THRESHOLDS = {
    # Single-order value as a fraction of TTM revenue
    "order_btb_high": 0.30,      # user-specified: book-to-bill > 0.3 => HIGH
    "order_btb_medium": 0.10,    # 10-30% of TTM revenue => MEDIUM
    # Earnings jump (only when % growth is parseable from the filing text)
    "earnings_jump_pct": 50.0,
    # Price/volume (computed from scan columns, not announcements)
    "ret_1d_high": 7.0,
    "ret_1w_high": 12.0,
}

# ---------------------------------------------------------------------------
# Marquee counterparties — an order/tie-up with these is significant even if
# the value is small or undisclosed (perception catalyst).
# ---------------------------------------------------------------------------
MARQUEE_GLOBAL = [
    # MAG7 + hyperscalers / AI leaders
    "microsoft", "apple", "google", "alphabet", "amazon", "aws", "meta",
    "nvidia", "tesla", "openai", "anthropic", "oracle", "azure", "coreweave",
    # Semis / electronics
    "tsmc", "intel", "amd", "qualcomm", "broadcom", "micron", "samsung",
    "foxconn", "asml", "applied materials", "texas instruments",
    # Industrial / engineering majors
    "siemens", "general electric", "ge vernova", "abb", "schneider",
    "honeywell", "emerson", "caterpillar", "hitachi", "mitsubishi",
    "toshiba", "alstom", "wabtec", "cummins", "atlas copco", "sandvik",
    # Aerospace & defence primes
    "boeing", "airbus", "lockheed", "raytheon", "rtx", "northrop",
    "bae systems", "thales", "rolls-royce", "rolls royce", "safran",
    "dassault", "rafael", "israel aerospace", "elbit", "saab", "leonardo",
    "general dynamics", "garrett",
    # Energy / O&G majors
    "shell", "bp ", "totalenergies", "exxon", "chevron", "aramco", "adnoc",
    "qatarenergy", "equinor", "baker hughes", "slb", "schlumberger",
    "halliburton", "technip", "saipem", "petrobras", "linde", "air liquide",
    # Telecom / networking
    "ericsson", "nokia", "cisco", "ciena", "corning", "verizon", "at&t",
    "vodafone", "deutsche telekom", "orange", "telefonica",
    # Autos / EV
    "toyota", "volkswagen", "stellantis", "mercedes", "daimler", "bmw",
    "ford", "general motors", "rivian", "byd", "hyundai", "scania", "volvo",
    "bosch", "zf friedrichshafen", "magna", "denso", "schaeffler", "borgwarner",
    # Pharma / medtech majors
    "pfizer", "merck", "novartis", "roche", "sanofi", "gsk", "astrazeneca",
    "abbott", "johnson & johnson", "medtronic", "teva", "viatris", "novo nordisk",
    "eli lilly", "bayer", "fresenius",
    # Consumer / retail giants
    "walmart", "costco", "unilever", "procter & gamble", "nestle", "ikea",
    "decathlon", "nike", "adidas", "h&m", "zara", "inditex", "target corp",
    # Rail / infra
    "deutsche bahn", "sncf", "network rail",
]

MARQUEE_INDIA = [
    "reliance", "jio", "tata", "adani", "larsen", "l&t", "bharti", "airtel",
    "bsnl", "indian railways", "rvnl", "ircon", "rail vikas", "ntpc",
    "power grid", "powergrid", "nhpc", "sjvn", "ongc", "iocl", "indian oil",
    "bpcl", "hpcl", "gail", "coal india", "nmdc", "sail", "bhel", "hal",
    "hindustan aeronautics", "bel", "bharat electronics", "drdo", "isro",
    "ministry of defence", "ministry of defense", "mod ", "indian army",
    "indian navy", "indian air force", "bharatnet", "nhai", "mahindra",
    "maruti", "bajaj", "hero motocorp", "ashok leyland", "ultratech",
    "jsw", "vedanta", "hindalco", "wipro", "infosys", "tcs", "hcl",
]

# Trending technology / theme keywords — order in these themes re-rates
TRENDING_TECH = [
    "artificial intelligence", " ai ", "data centre", "data center", "gpu",
    "semiconductor", "osat", "chip fab", "wafer", "nuclear", "small modular reactor",
    "smr", "green hydrogen", "electrolyser", "electrolyzer", "energy storage",
    "bess", "battery storage", "solar cell", "topcon", "ingot", "drone", "uav",
    "anti-drone", "counter-drone", "kavach", "vande bharat", "bullet train",
    "missile", "radar", "satellite", "space", "5g", "6g", "optical fibre",
    "optical fiber", "hvdc", "transformer", "transmission", "ev charging",
    "electric vehicle", "robotics", "defence export", "defense export",
]

# Known smart-money names (insider/SAST disclosures, preferential allottees)
MARQUEE_INVESTORS = [
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
]

# ---------------------------------------------------------------------------
# Category definitions: (category, severity_default, patterns)
# Patterns matched case-insensitively against title + description.
# ---------------------------------------------------------------------------
ORDER_PAT = re.compile(
    r"award_of_order|receipt_of_order|award of order|receipt of order|"
    r"bagging of order|bags?\s+(an?\s+)?order|work order|purchase order|"
    r"letter of intent|letter of award|loa\b|\bloi\b|secures?\s+(an?\s+)?"
    r"(order|contract)|wins?\s+(an?\s+)?(order|contract)|order book|"
    r"contract from|order from|repeat order|export order", re.I)

RESULT_PAT = re.compile(
    r"financial results?|board meeting outcome.*result|results? for the "
    r"(quarter|year)|unaudited|audited results", re.I)

# Capital raise
CAPRAISE_PAT = re.compile(
    r"preferential issue|preferential allotment|qualified institutions? "
    r"placement|\bqip\b|warrants?|fund rais|rights issue", re.I)

SAST_PAT = re.compile(r"sast|substantial acquisition|reg(ulation)?\.?\s*29|"
                      r"reg(ulation)?\.?\s*31\b|takeover", re.I)
PIT_PAT = re.compile(r"insider trading|\bpit\b|reg(ulation)?\.?\s*7\s*\(2\)", re.I)

RATING_PAT = re.compile(r"credit rating|rating action|rating update|"
                        r"care ratings|icra|crisil|india ratings|brickwork|acuite", re.I)
DEBT_PAT = re.compile(r"prepayment|pre-payment|debt[- ]free|repayment of "
                      r"(term loan|debt|ncd)|redemption of (ncd|debenture)|"
                      r"reduc\w+ (of )?debt|deleverag", re.I)

CAPACITY_PAT = re.compile(
    r"commercial production|commissioning|commenc\w+ (of )?(commercial )?"
    r"production|capacity expansion|new (manufacturing )?(plant|facility|unit)|"
    r"greenfield|brownfield|capex|expansion of capacity|land (acquisition|"
    r"allotment|purchase).{0,40}(plant|facility|project|expansion)|"
    r"foundation stone|groundbreaking", re.I)

APPROVAL_PAT = re.compile(
    r"usfda|us fda|form 483|\beir\b|establishment inspection|eu gmp|who[- ]gmp|"
    r"anda approval|\bcep\b|dcgi|nmpa|anvisa|pmda|tga approval|marketing "
    r"authori[sz]ation|patent (grant|granted)|pli scheme|production linked|"
    r"bis certification|peso|dgca|cdsco", re.I)

MNA_PAT = re.compile(r"acquisition|amalgamation|merger|demerger|scheme of "
                     r"arrangement|slump sale|stake (purchase|acquisition)|"
                     r"open offer|delisting|joint venture|\bjv\b|strategic "
                     r"(partnership|alliance|investment)|technology (transfer|"
                     r"licens|tie[- ]up)|\bmou\b|memorandum of understanding|"
                     r"diversification", re.I)

BUYBACK_PAT = re.compile(r"buy[- ]?back", re.I)
VOLMOVE_PAT = re.compile(r"clarification regarding (price|volume) movement|"
                         r"unusual (price|volume)|spurt in (price|volume)", re.I)

# Negative / RISK channel (forensic lens — Darshan-style)
RISK_PAT = re.compile(
    r"pledge|encumbrance|resignation of (statutory )?auditor|auditor.{0,30}"
    r"resign|resignation of (the )?(cfo|chief financial|managing director|"
    r"company secretary)|search (and|&) seizure|income tax (raid|search)|"
    r"gst.{0,20}(raid|search|notice)|\bed\b raid|enforcement directorate|"
    r"sebi (order|show cause)|default|insolvency|nclt|winding up|"
    r"fire (at|in|broke)|accident at|suspension of (trading|operations)|"
    r"credit rating.{0,40}downgrad", re.I)

NOISE_PAT = re.compile(
    r"book closure|record date|trading window|newspaper (publication|"
    r"advertisement)|loss of share certificate|duplicate share|"
    r"investor grievance|reg(ulation)?\.?\s*74\s*\(5\)|certificate under|"
    r"compliance certificate|registrar|change in rta|postal ballot|"
    r"scrutinizer|agm|annual general meeting|egm|extraordinary general|"
    r"reg(ulation)?\.?\s*57|certificate of interest payment|timely payment of interest|"
    r"insurance claim|claim amount of insurance|settlement claim of insurance|"
    r"e-?voting|esop.{0,20}allot|allotment of (equity )?shares (under|"
    r"pursuant to).{0,20}esop|notice of (board )?meeting|intimation of "
    r"board meeting|change in (senior )?management.{0,10}$|cessation|"
    r"closure of trading window|disclosure of related party|secretarial "
    r"compliance|reconciliation of share capital", re.I)

ANALYST_MEET_PAT = re.compile(r"analyst|investor meet|institutional investor|"
                              r"plant visit|earnings call|conference call|"
                              r"investor presentation", re.I)

# ---------------------------------------------------------------------------
# Value extraction: pull rupee amounts (returns max value found, in Rs crore)
# ---------------------------------------------------------------------------
_VALUE_RE = re.compile(
    r"(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)\s*(crore|cr\b|lakh|lacs?|million|"
    r"mn\b|billion|bn\b)?|usd\s*([\d,]+(?:\.\d+)?)\s*(million|mn\b|billion|bn\b)?|"
    r"\$\s*([\d,]+(?:\.\d+)?)\s*(million|mn\b|billion|bn\b)?", re.I)

USD_INR = 86.0  # approximation for significance ranking only — not for valuation


BARE_CR_RE = re.compile(r"(?<![\w.])([\d,]+(?:\.\d+)?)\s*crores?\b", re.I)


def extract_value_crore(text: str) -> float | None:
    """Best-effort extraction of the largest monetary value, in Rs crore."""
    best = None
    # Fallback: bare "N crore" (Stockscans strips the rupee glyph to "?")
    for m in BARE_CR_RE.finditer(text):
        # skip share counts ("equity shares")
        tail = text[m.end():m.end()+30].lower()
        if "share" in tail or "equity" in tail:
            continue
        v = float(m.group(1).replace(",", ""))
        if best is None or v > best:
            best = v
    for m in _VALUE_RE.finditer(text):
        if m.group(1):  # INR
            num = float(m.group(1).replace(",", ""))
            unit = (m.group(2) or "").lower()
            if unit.startswith(("crore", "cr")):
                val = num
            elif unit.startswith(("lakh", "lac")):
                val = num / 100.0
            elif unit.startswith(("million", "mn")):
                val = num / 10.0          # Rs mn -> crore
            elif unit.startswith(("billion", "bn")):
                val = num * 100.0
            else:
                # bare rupee figure; assume absolute rupees if huge
                val = num / 1e7 if num > 1e6 else None
        else:           # USD ($ or 'USD')
            num_s = m.group(3) or m.group(5)
            unit = (m.group(4) or m.group(6) or "").lower()
            if not num_s:
                continue
            num = float(num_s.replace(",", ""))
            if unit.startswith(("billion", "bn")):
                val = num * USD_INR * 100 / 10  # $bn -> Rs crore: n*1e9*86/1e7
                val = num * 1e9 * USD_INR / 1e7
            elif unit.startswith(("million", "mn")):
                val = num * 1e6 * USD_INR / 1e7
            else:
                val = num * USD_INR / 1e7 if num > 1e6 else None
        if val and (best is None or val > best):
            best = val
    return best


def find_names(text: str, names: list[str]) -> list[str]:
    t = text.lower()
    out = set()
    for n in names:
        n = n.strip()
        if re.search(r"\b" + re.escape(n) + r"\b", t):
            out.add(n)
    return sorted(out)


# ---------------------------------------------------------------------------
# Main classifier
# ---------------------------------------------------------------------------
def classify(ann: dict, company: dict) -> dict | None:
    """Classify one announcement. Returns alert dict or None (suppressed).

    ann: {date,title,description,ssUrl,companyId,name}
    company: scan row with 'Revenue' (TTM, Rs cr), 'Market Capitalization', etc.
    """
    title = ann.get("title") or ""
    desc = ann.get("description") or ""
    text = f"{title}. {desc}"
    tl = text.lower()

    ttm_rev = company.get("Revenue") or 0
    alerts_why = []
    category, severity = None, None
    value_cr = extract_value_crore(text)
    marquee = find_names(tl, MARQUEE_GLOBAL) + find_names(tl, MARQUEE_INDIA)
    themes = find_names(tl, TRENDING_TECH)
    investors = find_names(tl, MARQUEE_INVESTORS)

    # --- RISK channel first (forensic lens) -------------------------------
    if RISK_PAT.search(tl) and not NOISE_PAT.search(tl):
        # pledge RELEASE / revocation is positive
        if re.search(r"(release|revocation|revoke|invocation revoked)", tl) and "pledge" in tl:
            return _alert(ann, company, "DELEVERAGING", "HIGH",
                          "Promoter pledge release — balance-sheet stress easing; "
                          "classic precursor to re-rating.", value_cr, marquee, themes)
        if re.search(r"downgrad", tl):
            return _alert(ann, company, "RISK", "RISK",
                          "Credit rating downgrade — structural negative.", value_cr, marquee, themes)
        return _alert(ann, company, "RISK", "RISK",
                      "Governance / stress flag (pledge, exit, raid, default-class event). "
                      "Forensic review warranted.", value_cr, marquee, themes)

    # --- Noise suppression -------------------------------------------------
    if NOISE_PAT.search(tl) and not ORDER_PAT.search(tl) and not CAPRAISE_PAT.search(tl):
        return None

    # --- Order wins ---------------------------------------------------------
    if ORDER_PAT.search(tl):
        btb = (value_cr / ttm_rev) if (value_cr and ttm_rev) else None
        if btb is not None and btb >= THRESHOLDS["order_btb_high"]:
            return _alert(ann, company, "ORDER WIN", "HIGH",
                          f"Single order ≈ Rs {value_cr:,.0f} cr = {btb:.0%} of TTM revenue "
                          f"(Rs {ttm_rev:,.0f} cr) — book-to-bill impact above the 0.30x bar.",
                          value_cr, marquee, themes, btb=btb)
        if marquee or themes:
            tag = ", ".join((marquee + themes)[:4])
            sev = "HIGH" if marquee else "MEDIUM"
            return _alert(ann, company, "ORDER WIN", sev,
                          f"Order linked to marquee counterparty / trending theme ({tag}) — "
                          "perception catalyst regardless of disclosed size.",
                          value_cr, marquee, themes, btb=btb)
        if btb is not None and btb >= THRESHOLDS["order_btb_medium"]:
            return _alert(ann, company, "ORDER WIN", "MEDIUM",
                          f"Order ≈ Rs {value_cr:,.0f} cr = {btb:.0%} of TTM revenue — "
                          "meaningful but below the 0.30x conviction bar.",
                          value_cr, marquee, themes, btb=btb)
        if value_cr is None:
            return _alert(ann, company, "ORDER WIN", "MEDIUM",
                          "Order win with undisclosed value — pull the filing PDF to size it "
                          "before acting.", value_cr, marquee, themes)
        return None  # small disclosed order -> suppress

    # --- Capital raise / smart money ---------------------------------------
    if CAPRAISE_PAT.search(tl):
        sev = "HIGH" if (investors or "promoter" in tl) else "MEDIUM"
        why = "Preferential/QIP/warrants event — dilution with information content. "
        if investors:
            why += f"Marquee allottee(s) detected: {', '.join(investors[:3])}."
        elif "promoter" in tl:
            why += "Promoter participation — skin-in-the-game signal."
        else:
            why += "Check allottees and pricing vs CMP in the filing."
        return _alert(ann, company, "CAPITAL RAISE", sev, why, value_cr, marquee, themes,
                      investors=investors)

    if SAST_PAT.search(tl) or PIT_PAT.search(tl):
        if investors:
            return _alert(ann, company, "SMART MONEY", "HIGH",
                          f"Stake disclosure involving {', '.join(investors[:3])} — "
                          "known-investor footprint. Direction (buy/sell) not stated in "
                          "summary; open the filing PDF.", value_cr, marquee,
                          themes, investors=investors)
        # Reg 29(2)/29(1) summaries name the acquirer: "... Regulations 2011 for <X>"
        ent = None
        m = re.search(r"regulations,?\s*2011\s*(?:\([^)]*\))?\s*for\s+(.{3,60}?)(?:\.|$)", text, re.I)
        if m:
            ent = m.group(1).strip()
        inst_kw = re.compile(r"mutual fund|\bmf\b|asset management|\bamc\b|capital|"
                             r"investments?|insurance|pension|\bfpi\b|\bfii\b|fund\b|"
                             r"advisors|partners|ventures|\bllp\b", re.I)
        if ent and inst_kw.search(ent):
            return _alert(ann, company, "SMART MONEY", "MEDIUM",
                          f"SAST stake-change disclosure by institutional holder: {ent}. "
                          "Direction not stated in summary — verify buy vs sell in the "
                          "filing before reading it as accumulation.",
                          value_cr, marquee, themes, investors=[ent])
        if "promoter" in tl:
            return _alert(ann, company, "SMART MONEY", "MEDIUM",
                          "Promoter-linked SAST/insider disclosure — check for creeping "
                          "acquisition (conviction signal) vs sale.", value_cr, marquee, themes)
        return None  # individuals / routine confirmations

    # --- Ratings / debt -----------------------------------------------------
    if RATING_PAT.search(tl):
        if re.search(r"upgrad", tl):
            return _alert(ann, company, "RATING UPGRADE", "HIGH",
                          "Credit rating upgrade — independent validation of balance-sheet "
                          "repair; lowers cost of capital, widens lender/investor pool.",
                          value_cr, marquee, themes)
        if re.search(r"outlook.{0,20}(positive|revised)", tl):
            return _alert(ann, company, "RATING UPGRADE", "MEDIUM",
                          "Rating outlook revision — possible upgrade precursor.",
                          value_cr, marquee, themes)
        return None  # reaffirmations are noise
    if DEBT_PAT.search(tl):
        return _alert(ann, company, "DELEVERAGING", "HIGH",
                      "Debt prepayment / redemption / debt-free declaration — direct D/E "
                      "improvement; check magnitude vs gross debt.", value_cr, marquee, themes)

    # --- Results ------------------------------------------------------------
    if RESULT_PAT.search(tl):
        m = re.search(r"(?:growth|up|increase[d]?|jump\w*|rose|higher)\D{0,15}(\d{2,4})\s*%", tl)
        pct = float(m.group(1)) if m else None
        if pct and pct >= THRESHOLDS["earnings_jump_pct"]:
            return _alert(ann, company, "EARNINGS JUMP", "HIGH",
                          f"Result filing references ~{pct:.0f}% growth — run "
                          "quarterly-result-analysis to verify clean vs reported.",
                          value_cr, marquee, themes)
        return _alert(ann, company, "RESULTS", "MEDIUM",
                      "Results filed within window — verify surprise vs expectations; "
                      "strip one-offs before concluding.", value_cr, marquee, themes)

    # --- Capacity / approvals ----------------------------------------------
    if APPROVAL_PAT.search(tl):
        return _alert(ann, company, "REGULATORY APPROVAL", "HIGH",
                      "Regulatory/quality approval (USFDA/EU GMP/PLI/patent class) — "
                      "unlocks markets or incentives; typically multi-quarter relevance.",
                      value_cr, marquee, themes)
    if CAPACITY_PAT.search(tl):
        sev = "HIGH" if (value_cr and ttm_rev and value_cr / ttm_rev > 0.15) or themes else "MEDIUM"
        return _alert(ann, company, "CAPACITY EXPANSION", sev,
                      "Capacity commissioning/expansion — forward revenue visibility; "
                      "verify funding mix and utilisation ramp assumptions.",
                      value_cr, marquee, themes)

    # --- M&A / strategic ----------------------------------------------------
    if BUYBACK_PAT.search(tl):
        return _alert(ann, company, "BUYBACK", "HIGH",
                      "Buyback event — capital-return signal; check size vs float and "
                      "acceptance-ratio math.", value_cr, marquee, themes)
    if MNA_PAT.search(tl):
        if (re.search(r"wholly[- ]owned subsidiary|\bwos\b", tl)
                and not value_cr and not marquee):
            return None  # routine intra-group funding, no disclosed value
        sev = "HIGH" if (marquee or (value_cr and ttm_rev and value_cr / ttm_rev > 0.15)) else "MEDIUM"
        tag = f" Counterparty: {', '.join(marquee[:3])}." if marquee else ""
        return _alert(ann, company, "M&A / STRATEGIC", sev,
                      "Acquisition/JV/tie-up/demerger-class event — structural change to "
                      "business mix." + tag, value_cr, marquee, themes)

    # --- Meta-signals -------------------------------------------------------
    if VOLMOVE_PAT.search(tl):
        return _alert(ann, company, "PRICE/VOLUME", "MEDIUM",
                      "Exchange sought clarification on price/volume movement — the market "
                      "is moving on something; cross-check pending announcements.",
                      value_cr, marquee, themes)
    if ANALYST_MEET_PAT.search(tl):
        # Only first-time / plant-visit style meets are signals; routine calls are noise
        if re.search(r"plant visit|site visit|facility visit", tl):
            return _alert(ann, company, "INSTITUTIONAL INTEREST", "MEDIUM",
                          "Institutional plant visit — buy-side diligence footprint; "
                          "often precedes position-building.", value_cr, marquee, themes)
        return None

    return None  # default: suppress


def _alert(ann, company, category, severity, why, value_cr, marquee, themes,
           btb=None, investors=None):
    return {
        "date": (ann.get("date") or "")[:10],
        "companyId": ann.get("companyId") or company.get("companyId"),
        "name": ann.get("name") or company.get("Name"),
        "category": category,
        "severity": severity,
        "title": ann.get("title", ""),
        "description": (ann.get("description") or "")[:600],
        "why": why,
        "value_cr": value_cr,
        "btb": btb,
        "marquee": marquee,
        "themes": themes,
        "investors": investors or [],
        "pdf": ann.get("ssUrl"),
        "mcap": company.get("Market Capitalization"),
        "ttm_revenue": company.get("Revenue"),
    }


# ---------------------------------------------------------------------------
# Price/volume catalysts straight from scan columns (no announcement needed)
# ---------------------------------------------------------------------------
def price_volume_alerts(companies: list[dict]) -> list[dict]:
    out = []
    for c in companies:
        r1d, r1w = c.get("Returns 1D"), c.get("Returns 1W")
        crs = c.get("CRS Vs Nifty 500 25D")
        if r1d is not None and r1d >= THRESHOLDS["ret_1d_high"]:
            out.append(_alert({"date": "", "title": f"1D move {r1d:+.1f}%"},
                              c, "PRICE/VOLUME", "MEDIUM",
                              f"1-day move {r1d:+.1f}% (CRS25D {crs}) — confirm against "
                              "news flow; unexplained spikes warrant the forensic lens.",
                              None, [], []))
        elif r1w is not None and r1w >= THRESHOLDS["ret_1w_high"]:
            out.append(_alert({"date": "", "title": f"1W move {r1w:+.1f}%"},
                              c, "PRICE/VOLUME", "MEDIUM",
                              f"1-week move {r1w:+.1f}% (CRS25D {crs}) — momentum building; "
                              "check for pending catalysts.", None, [], []))
    return out
