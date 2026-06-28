#!/usr/bin/env python3
"""
scan_catalysts.py — one-command watchlist catalyst scan.

Pipeline
--------
 1. Resolve the Stockscans watchlist scan -> 51-company universe (companyId,
    TTM Revenue, Mcap, Returns 1D/1W, CRS) via pre-pead-scanner's run_scan logic.
 2. Batch-fetch corporate announcements (5 tickers/call, paginated) back to
    --days ago (default 7) using the stock-documents-fetcher API pattern
    (cookie auth + referer; curl-equivalent headers via urllib works for the
    announcements endpoint — only the scan-definition GET needs curl).
 3. Classify every announcement through catalyst_rules.classify(); add
    price/volume alerts from scan columns.
 4. Emit alerts JSON + a self-contained dark/light HTML briefing to
    /mnt/user-data/outputs/.

Usage
-----
  python scan_catalysts.py                          # default scan, 7 days
  python scan_catalysts.py --days 3
  python scan_catalysts.py --scan-id <24hex> --days 14
  python scan_catalysts.py --authtoken-file /tmp/catalyst/authtoken.txt
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from catalyst_rules import classify, price_volume_alerts  # noqa: E402

BASE = "https://www.stockscans.in"
ANN_API = BASE + "/api/company/announcements"
S3_DOC = "https://stockscans-documents.s3.ap-south-1.amazonaws.com/"
DEFAULT_SCAN = "a2c1ff012cf2f0690754f9e2"   # Darshan's "Watchlist Announcements"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")

TOKEN_FALLBACKS = [
    "/mnt/project/Stockscans_authtoken",
    "/mnt/project/stockscans_authtoken",
    "/tmp/catalyst/authtoken.txt",
    "/tmp/pead/authtoken.txt",
    os.path.expanduser("~/.stockscans_authtoken"),
]


def resolve_token(cli_path: str | None) -> str:
    paths = ([cli_path] if cli_path else []) + TOKEN_FALLBACKS
    env = os.environ.get("STOCKSCANS_AUTHTOKEN")
    if env:
        return env.strip()
    for p in paths:
        if p and os.path.exists(p):
            return open(p).read().strip().rstrip(";")
    sys.exit("ERROR: no authtoken found. Pass --authtoken-file or set "
             "STOCKSCANS_AUTHTOKEN.")


def check_expiry(token: str):
    import base64
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        exp = json.loads(base64.urlsafe_b64decode(payload))["exp"]
        days = (exp - time.time()) / 86400
        if days < 0:
            sys.exit("ERROR: authtoken EXPIRED. Refresh it on stockscans.in.")
        if days < 7:
            print(f"WARNING: authtoken expires in {days:.1f} day(s).", file=sys.stderr)
    except Exception:
        pass


# ------------------------------------------------------------------- universe
def resolve_universe(scan_id: str, token: str) -> list[dict]:
    """Scan-definition GET requires curl (WAF blocks urllib); run POST is fine
    via urllib but we use curl for both for consistency."""
    defn_raw = subprocess.run(
        ["curl", "-s", f"{BASE}/api/user/saved-scans/{scan_id}",
         "-H", f"cookie: authtoken={token}",
         "-H", f"referer: {BASE}/scans/saved/",
         "-H", f"user-agent: {UA}"],
        capture_output=True, timeout=60).stdout
    defn = json.loads(defn_raw)
    companies, offset, total = [], 0, None
    while total is None or offset < total:
        body = json.dumps({"ratiosType": "Default", "timePeriod": "Latest",
                           "scan": defn,
                           "watchlistIds": defn.get("watchlistIds", []),
                           "order": "desc", "orderBy": "Market Capitalization",
                           "offset": offset})
        resp_raw = subprocess.run(
            ["curl", "-s", f"{BASE}/api/company/scans/run", "-X", "POST",
             "-H", f"cookie: authtoken={token}",
             "-H", "content-type: application/json",
             "-H", f"origin: {BASE}", "-H", f"referer: {BASE}/scans/saved/",
             "-H", f"user-agent: {UA}", "-d", body],
            capture_output=True, timeout=120).stdout
        resp = json.loads(resp_raw)
        table = resp.get("table") or []
        total = resp.get("total", 0)
        if len(table) < 2:
            break
        hdr = table[0]
        rows = [{hdr[i]: r[i] for i in range(min(len(hdr), len(r)))}
                for r in table[1:]]
        companies.extend(rows)
        offset += len(rows)
        if len(rows) == 0:
            break
    return companies


# -------------------------------------------------------------- announcements
def fetch_announcements_batch(tickers: list[str], token: str,
                              stop_before: str, max_pages: int = 10) -> list[dict]:
    out = []
    for page in range(max_pages):
        body = json.dumps({"companyIds": tickers, "offset": page * 30}).encode()
        req = urllib.request.Request(ANN_API, data=body, method="POST", headers={
            "accept": "application/json", "content-type": "application/json",
            "cookie": f"authtoken={token}", "origin": BASE,
            "referer": BASE + "/company/", "user-agent": UA})
        with urllib.request.urlopen(req, timeout=45) as r:
            rows = json.loads(r.read()).get("companyAnnouncements", [])
        if not rows:
            break
        stale = False
        for row in rows:
            d = (row.get("date") or "")[:10]
            if d and d < stop_before:
                stale = True
                continue
            out.append(row)
        if stale or len(rows) < 30:
            break
        time.sleep(0.3)
    return out


# ----------------------------------------------------------------------- html
SEV_ORDER = {"HIGH": 0, "RISK": 1, "MEDIUM": 2}
SEV_COLOR = {"HIGH": "#16a34a", "RISK": "#dc2626", "MEDIUM": "#d97706"}


def esc(s):
    return (str(s or "").replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;"))


def render_html(alerts: list[dict], meta: dict) -> str:
    cards = []
    for a in alerts:
        sev = a["severity"]
        chips = "".join(
            f'<span class="chip">{esc(x)}</span>'
            for x in (a.get("marquee") or [])[:3] + (a.get("themes") or [])[:3]
            + (a.get("investors") or [])[:3])
        val = (f'<span class="val">Rs {a["value_cr"]:,.0f} cr'
               + (f' · {a["btb"]:.0%} of TTM rev' if a.get("btb") else "")
               + "</span>") if a.get("value_cr") else ""
        pdf = (f'<a class="pdf" href="{S3_DOC}{esc(a["pdf"])}" target="_blank">filing PDF ↗</a>'
               if a.get("pdf") else "")
        cards.append(f"""
        <div class="card sev-{sev}" data-sev="{sev}">
          <div class="row1">
            <span class="badge" style="background:{SEV_COLOR[sev]}">{sev}</span>
            <span class="cat">{esc(a["category"])}</span>
            <span class="tick">{esc(a["companyId"])}</span>
            <span class="date">{esc(a["date"])}</span>
          </div>
          <div class="name">{esc(a["name"])}</div>
          <div class="title">{esc(a["title"])}</div>
          <div class="why">{esc(a["why"])} {val}</div>
          <div class="desc">{esc(a["description"])}</div>
          <div class="row2">{chips}{pdf}</div>
        </div>""")
    counts = {s: sum(1 for a in alerts if a["severity"] == s)
              for s in ("HIGH", "MEDIUM", "RISK")}
    return f"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Catalyst Alerts — {meta['window']}</title><style>
:root{{--bg:#0b0f17;--card:#121826;--tx:#e5e7eb;--mut:#94a3b8;--bd:#1f2937}}
@media (prefers-color-scheme: light){{:root{{--bg:#f8fafc;--card:#fff;--tx:#0f172a;--mut:#64748b;--bd:#e2e8f0}}}}
body{{margin:0;background:var(--bg);color:var(--tx);font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:24px}}
h1{{font-size:20px;margin:0 0 4px}} .sub{{color:var(--mut);margin-bottom:16px}}
.filters button{{background:var(--card);border:1px solid var(--bd);color:var(--tx);
padding:6px 14px;border-radius:20px;margin-right:8px;cursor:pointer;font-size:13px}}
.filters button.on{{border-color:#3b82f6;color:#3b82f6}}
.card{{background:var(--card);border:1px solid var(--bd);border-radius:12px;
padding:14px 16px;margin:12px 0;border-left-width:4px}}
.card.sev-HIGH{{border-left-color:#16a34a}}.card.sev-RISK{{border-left-color:#dc2626}}
.card.sev-MEDIUM{{border-left-color:#d97706}}
.row1{{display:flex;gap:10px;align-items:center;flex-wrap:wrap}}
.badge{{color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px}}
.cat{{font-weight:700;font-size:12px;letter-spacing:.04em}}
.tick{{color:var(--mut);font-size:12px}} .date{{margin-left:auto;color:var(--mut);font-size:12px}}
.name{{font-weight:700;margin-top:6px}} .title{{color:var(--mut);font-size:13px}}
.why{{margin-top:6px}} .val{{color:#3b82f6;font-weight:600}}
.desc{{color:var(--mut);font-size:12.5px;margin-top:6px}}
.row2{{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center}}
.chip{{background:rgba(59,130,246,.12);color:#3b82f6;font-size:11px;padding:2px 8px;border-radius:10px}}
.pdf{{margin-left:auto;font-size:12px;color:#3b82f6;text-decoration:none}}
</style></head><body>
<h1>Watchlist Catalyst Alerts</h1>
<div class="sub">{meta['window']} · {meta['n_companies']} companies scanned ·
{meta['n_raw']} announcements processed → <b>{counts['HIGH']} HIGH</b> ·
{counts['MEDIUM']} MEDIUM · {counts['RISK']} RISK · generated {meta['generated']}</div>
<div class="filters">
<button class="on" onclick="flt('ALL',this)">All</button>
<button onclick="flt('HIGH',this)">HIGH</button>
<button onclick="flt('MEDIUM',this)">MEDIUM</button>
<button onclick="flt('RISK',this)">RISK</button></div>
{''.join(cards) if cards else '<p>No significant catalysts in this window — the filter is doing its job.</p>'}
<script>function flt(s,b){{document.querySelectorAll('.filters button').forEach(x=>x.classList.remove('on'));
b.classList.add('on');document.querySelectorAll('.card').forEach(c=>{{
c.style.display=(s==='ALL'||c.dataset.sev===s)?'':'none'}})}}</script>
</body></html>"""


# ----------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scan-id", default=DEFAULT_SCAN)
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--authtoken-file", default=None)
    ap.add_argument("--out-dir", default="/mnt/user-data/outputs")
    ap.add_argument("--batch", type=int, default=5)
    args = ap.parse_args()

    token = resolve_token(args.authtoken_file)
    check_expiry(token)
    stop_before = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
                   - timedelta(days=args.days)).strftime("%Y-%m-%d")

    print(f"Resolving universe from scan {args.scan_id} ...", file=sys.stderr)
    companies = resolve_universe(args.scan_id, token)
    by_id = {c["companyId"]: c for c in companies if c.get("companyId")}
    print(f"  {len(companies)} companies. Fetching announcements since "
          f"{stop_before} ...", file=sys.stderr)

    raw = []
    ids = list(by_id)
    for i in range(0, len(ids), args.batch):
        batch = ids[i:i + args.batch]
        try:
            raw.extend(fetch_announcements_batch(batch, token, stop_before))
        except Exception as e:
            print(f"  WARN batch {batch}: {e}", file=sys.stderr)
        time.sleep(0.3)
    print(f"  {len(raw)} announcements in window.", file=sys.stderr)

    # de-dup (same title+date+company appears twice for NSE+BSE filings)
    seen, alerts = set(), []
    for ann in raw:
        key = (ann.get("companyId"), (ann.get("date") or "")[:10],
               (ann.get("title") or "")[:80], (ann.get("description") or "")[:120])
        if key in seen:
            continue
        seen.add(key)
        a = classify(ann, by_id.get(ann.get("companyId"), {}))
        if a:
            alerts.append(a)
    # Group repetitive updates: same company+category+near-identical title prefix
    grouped, byk = [], {}
    for a in alerts:
        k = (a["companyId"], a["category"], a["title"][:45])
        if k in byk:
            byk[k]["_dups"] = byk[k].get("_dups", 0) + 1
        else:
            byk[k] = a
            grouped.append(a)
    for a in grouped:
        if a.get("_dups"):
            a["why"] += f" (+{a['_dups']} similar update(s) in window — grouped.)"
    alerts = grouped
    # Confluence escalation: >=3 distinct STRUCTURAL filings by one company in
    # window = orchestrated strategic event (e.g. restructuring announced via
    # multiple simultaneous Reg-30 filings). Escalate that company's structural
    # alerts to HIGH with an explicit confluence note.
    META = {"PRICE/VOLUME", "INSTITUTIONAL INTEREST", "RESULTS"}
    from collections import Counter
    structural = Counter(a["companyId"] for a in alerts
                         if a["category"] not in META and a["severity"] != "RISK")
    for a in alerts:
        n = structural.get(a["companyId"], 0)
        if n >= 3 and a["category"] not in META and a["severity"] == "MEDIUM":
            a["severity"] = "HIGH"
            a["why"] = (f"CONFLUENCE: {n} structural filings by this company in "
                        f"window — coordinated strategic event. " + a["why"])
    alerts.extend(price_volume_alerts(companies))
    alerts.sort(key=lambda a: (SEV_ORDER.get(a["severity"], 9), a["date"]),
                reverse=False)
    alerts.sort(key=lambda a: a["date"], reverse=True)
    alerts.sort(key=lambda a: SEV_ORDER.get(a["severity"], 9))

    today = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    meta = {"window": f"{stop_before} → {today.strftime('%Y-%m-%d')} IST",
            "n_companies": len(companies), "n_raw": len(raw),
            "generated": today.strftime("%Y-%m-%d %H:%M IST")}

    os.makedirs(args.out_dir, exist_ok=True)
    tag = today.strftime("%Y%m%d")
    jpath = os.path.join(args.out_dir, f"catalyst_alerts_{tag}.json")
    hpath = os.path.join(args.out_dir, f"catalyst_alerts_{tag}.html")
    json.dump({"meta": meta, "alerts": alerts}, open(jpath, "w"), indent=1)
    open(hpath, "w").write(render_html(alerts, meta))
    print(f"\nAlerts: {sum(1 for a in alerts if a['severity']=='HIGH')} HIGH, "
          f"{sum(1 for a in alerts if a['severity']=='MEDIUM')} MEDIUM, "
          f"{sum(1 for a in alerts if a['severity']=='RISK')} RISK")
    print(f"JSON  -> {jpath}\nHTML  -> {hpath}")


if __name__ == "__main__":
    main()
