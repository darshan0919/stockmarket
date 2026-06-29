#!/usr/bin/env python3
"""
run_scan.py — resolve a Stockscans saved-scan URL into its current company universe.

This is the entry point for the pre-pead-scanner skill. It does two things the
scan UI does behind the scenes:

  1. GET  /api/user/saved-scans/{scanId}   → fetch the *live* scan definition
     (filters, tags, sector). Fetched fresh every time so the skill always
     reflects the user's latest edits to the saved scan — never hardcode filters.

  2. POST /api/company/scans/run           → run that definition and return the
     matching companies as a table.

It then flattens the table into a clean JSON list of companies, each carrying the
`companyId` (the key every downstream Stockscans API needs), plus the columns the
skill cares about most: Name, Last Result Date, Next Result Date, Close Price,
Market Capitalization, and whatever else the scan surfaced.

Auth resolves in the same order as stock-documents-fetcher:
  --authtoken-file → STOCKSCANS_AUTHTOKEN → /mnt/project/Stockscans_authtoken → fallbacks.

Usage
-----
  python run_scan.py "https://www.stockscans.in/scans/saved/c29a98ebbb568f073162ba24"
  python run_scan.py c29a98ebbb568f073162ba24 --json-out /tmp/universe.json
  python run_scan.py <url> --list-only        # human-readable table, no file
"""
import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error

BASE = "https://www.stockscans.in"
DEF_URL = BASE + "/api/user/saved-scans/{scan_id}"
RUN_URL = BASE + "/api/company/scans/run"

TOKEN_FALLBACKS = [
    "/mnt/project/Stockscans_authtoken",
    "/mnt/project/stockscans_authtoken",
    "/mnt/user-data/uploads/Stockscans_authtoken",
    os.path.expanduser("~/.stockscans_authtoken"),
]

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36")


# ----------------------------------------------------------------------------- auth
def resolve_token(cli_path):
    if cli_path:
        with open(cli_path) as f:
            return f.read().strip().rstrip(";")
    env = os.environ.get("STOCKSCANS_AUTHTOKEN")
    if env:
        return env.strip().rstrip(";")
    for p in TOKEN_FALLBACKS:
        if os.path.exists(p):
            with open(p) as f:
                return f.read().strip().rstrip(";")
    sys.exit("ERROR: no authtoken found. Pass --authtoken-file, set "
             "STOCKSCANS_AUTHTOKEN, or place it at /mnt/project/Stockscans_authtoken.")


def check_token_expiry(token):
    """Decode the JWT exp claim (no verification) and warn / hard-error."""
    try:
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        exp = payload.get("exp")
        if exp is None:
            return
        now = time.time()
        if exp < now:
            sys.exit("ERROR: authtoken has EXPIRED. Refresh it from the browser "
                     "(DevTools → Cookies → authtoken) and update the project file.")
        days = (exp - now) / 86400
        if days < 7:
            sys.stderr.write(f"WARNING: authtoken expires in {days:.1f} day(s). "
                             "Refresh it soon.\n")
    except Exception:
        pass  # decode is best-effort; the server enforces the real check


# --------------------------------------------------------------------------- helpers
def parse_scan_id(arg):
    """Accept a full saved-scan URL or a bare 24-char scanId."""
    m = re.search(r"/scans/saved/([a-f0-9]{24})", arg)
    if m:
        return m.group(1)
    if re.fullmatch(r"[a-f0-9]{24}", arg.strip()):
        return arg.strip()
    sys.exit(f"ERROR: could not parse a scanId from '{arg}'. Expected a URL like "
             "https://www.stockscans.in/scans/saved/<24-hex> or the bare id.")


def http_get(url, token):
    req = urllib.request.Request(url, headers={
        "accept": "application/json",
        "content-type": "application/json",
        "cookie": f"authtoken={token}",
        "user-agent": UA,
        "referer": BASE + "/scans/saved/",
    })
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            sys.exit(f"ERROR: {e.code} from {url}. authtoken likely expired — refresh it.")
        sys.exit(f"ERROR: HTTP {e.code} from {url}: {e.read()[:300]}")


def http_post(url, token, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={
        "accept": "application/json",
        "content-type": "application/json",
        "cookie": f"authtoken={token}",
        "origin": BASE,
        "user-agent": UA,
        "referer": BASE + "/scans/saved/",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            sys.exit(f"ERROR: {e.code} from run endpoint. authtoken likely expired.")
        sys.exit(f"ERROR: HTTP {e.code} from run endpoint: {e.read()[:300]}")


def build_run_payload(definition):
    """Wrap the saved-scan definition into the /scans/run request body."""
    return {
        "ratiosType": "Default",
        "timePeriod": "Latest",
        "scan": definition,
        "watchlistIds": definition.get("watchlistIds", []),
        "order": "desc",
        "orderBy": "Market Capitalization",
        "offset": 0,
    }


def flatten_table(run_resp):
    """The run endpoint returns {'table': [header_row, *data_rows], 'total': N}.
    Convert to a list of dicts keyed by the header names."""
    table = run_resp.get("table")
    if not table or len(table) < 1:
        return [], run_resp.get("total", 0)
    header = table[0]
    rows = []
    for raw in table[1:]:
        rows.append({header[i]: raw[i] for i in range(min(len(header), len(raw)))})
    return rows, run_resp.get("total", len(rows))


# ------------------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser(description="Resolve a Stockscans saved-scan into its company universe.")
    ap.add_argument("scan", help="Saved-scan URL or bare 24-hex scanId")
    ap.add_argument("--authtoken-file", help="Path to a file containing the authtoken")
    ap.add_argument("--json-out", help="Write the flattened universe JSON to this path")
    ap.add_argument("--list-only", action="store_true", help="Print a human-readable table, skip JSON file")
    args = ap.parse_args()

    token = resolve_token(args.authtoken_file)
    check_token_expiry(token)
    scan_id = parse_scan_id(args.scan)

    # 1. fetch the LIVE definition (reflects any edits the user made to the saved scan)
    definition = http_get(DEF_URL.format(scan_id=scan_id), token)
    scan_name = definition.get("scanName", scan_id)
    sys.stderr.write(f"Scan: {scan_name}  ({scan_id})\n")
    sys.stderr.write("Filters: " + "; ".join(
        f"{f['left']} {f['sign']} {f['right']}" for f in definition.get("filters", [])
    ) + "\n")

    # 2. run it
    run_resp = http_post(RUN_URL, token, build_run_payload(definition))
    rows, total = flatten_table(run_resp)

    universe = {
        "scanId": scan_id,
        "scanName": scan_name,
        "filters": definition.get("filters", []),
        "total": total,
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "companies": rows,
    }

    # locate the columns we care about (names vary slightly across scans)
    def col(row, *names):
        for n in names:
            if n in row:
                return row[n]
        return None

    if args.list_only or not args.json_out:
        sys.stderr.write(f"\nMatched {total} companies:\n")
        print(f"{'companyId':16} {'Name':34} {'LastResult':12} {'NextResult':12} {'MCap':>9} {'CMP':>9}")
        for r in rows:
            cid = col(r, "companyId", "Company Id") or ""
            nm = (col(r, "Name", "Company Name") or "")[:34]
            lr = str(col(r, "Last Result Date", "lastResultDate") or "")[:12]
            nr = str(col(r, "Next Result Date", "nextResultDate") or "")[:12]
            mc = col(r, "Market Capitalization", "Market Cap") or ""
            cp = col(r, "Close Price", "CMP", "Price") or ""
            print(f"{cid:16} {nm:34} {lr:12} {nr:12} {str(mc):>9} {str(cp):>9}")

    if args.json_out:
        with open(args.json_out, "w") as f:
            json.dump(universe, f, indent=2, default=str)
        sys.stderr.write(f"\nWrote universe → {args.json_out}\n")


if __name__ == "__main__":
    main()
