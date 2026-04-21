#!/usr/bin/env python3
"""
equity-research-master orchestrator.

Deterministic driver for the master skill. Claude handles the AI-heavy phases
(extraction, narrative, render); this script automates acquisition, schema
computation, caching, and publish.

Subcommands:
  acquire          — Phase 1: parallel download via local backend
  compute-schemas  — Phase 3: parse MasterData.xlsx + .txt extracts into cached JSON
  publish          — Phase 7: POST rendered HTML to backend
"""
import argparse
import concurrent.futures as cf
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlencode

import requests

BACKEND_DEFAULT = os.environ.get("STOCKMARKET_BACKEND", "http://localhost:5000")
RESEARCH_ROOT = Path(os.environ.get("RESEARCH_ROOT", Path.home() / "Research"))

FOLDERS = [
    "Annual_Reports",
    "Concalls",
    "Investor_Presentations",
    "Credit_Rating_Reports",
    "Events_Announcements",
]


def workspace(ticker: str) -> Path:
    p = RESEARCH_ROOT / ticker.upper()
    for f in FOLDERS:
        (p / f).mkdir(parents=True, exist_ok=True)
    (p / "_cache").mkdir(parents=True, exist_ok=True)
    return p


def acquire(ticker: str, backend: str) -> None:
    """Parallel acquisition from local backend. Fails soft per-source."""
    ws = workspace(ticker)
    sym = ticker.upper()

    def fetch_announcements():
        r = requests.post(f"{backend}/api/announcements/{sym}/download", timeout=300)
        r.raise_for_status()
        return ("announcements", r.json() if r.headers.get("content-type", "").startswith("application/json") else {"ok": True})

    def fetch_stock_meta():
        r = requests.get(f"{backend}/api/stocks/{sym}", timeout=30)
        r.raise_for_status()
        (ws / "_cache" / "stock_meta.json").write_text(r.text)
        return ("stock_meta", r.json())

    def fetch_financials():
        r = requests.get(f"{backend}/api/stocks/{sym}/financials", timeout=60)
        r.raise_for_status()
        (ws / "_cache" / "financials.json").write_text(r.text)
        return ("financials", True)

    def fetch_quarterly():
        r = requests.get(f"{backend}/api/stocks/{sym}/quarterly", timeout=60)
        r.raise_for_status()
        (ws / "_cache" / "quarterly.json").write_text(r.text)
        return ("quarterly", True)

    results = {}
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        futures = {
            pool.submit(fetch_announcements): "announcements",
            pool.submit(fetch_stock_meta): "stock_meta",
            pool.submit(fetch_financials): "financials",
            pool.submit(fetch_quarterly): "quarterly",
        }
        for fut in cf.as_completed(futures):
            name = futures[fut]
            try:
                results[name] = fut.result()
            except Exception as e:
                results[name] = ("error", str(e))
                print(f"[warn] {name}: {e}", file=sys.stderr)

    print(json.dumps({"workspace": str(ws), "results": {k: v[0] for k, v in results.items()}}, indent=2))


def compute_schemas(ticker: str) -> None:
    """Parse raw inputs into a single schemas.json cache consumed by every tab.

    Reads:
      [TICKER]_MasterData.xlsx, [TICKER]_AR_Extracts.txt, [TICKER]_Concall.txt,
      [TICKER]_InvestorPres.txt, [TICKER]_RatingReports.txt, [TICKER]_Events.txt
    Writes:
      _cache/schemas.json with keys: kpi_table, valuation_ladder, triggers,
      qoq_deltas, forensic_flags, meta.

    Heavy analytical inference (triggers, forensic flags) is left to Claude;
    this script extracts only what is deterministically parseable so the model
    doesn't redo file I/O on every phase.
    """
    ws = workspace(ticker)
    sym = ticker.upper()

    cache = {
        "meta": {"ticker": sym, "workspace": str(ws)},
        "kpi_table": None,
        "valuation_ladder": None,
        "triggers": None,
        "qoq_deltas": None,
        "forensic_flags": None,
        "sources": {},
    }

    xlsx = ws / f"{sym}_MasterData.xlsx"
    if xlsx.exists():
        try:
            import openpyxl
            wb = openpyxl.load_workbook(xlsx, data_only=True, read_only=True)
            cache["sources"]["masterdata_sheets"] = wb.sheetnames
            wb.close()
        except ImportError:
            cache["sources"]["masterdata_sheets"] = "openpyxl not installed"

    for label, fname in [
        ("ar", f"{sym}_AR_Extracts.txt"),
        ("concall", f"{sym}_Concall.txt"),
        ("investor_pres", f"{sym}_InvestorPres.txt"),
        ("ratings", f"{sym}_RatingReports.txt"),
        ("events", f"{sym}_Events.txt"),
    ]:
        p = ws / fname
        cache["sources"][label] = {"path": str(p), "present": p.exists(), "bytes": p.stat().st_size if p.exists() else 0}

    decks = list((ws / "Investor_Presentations").glob("*.pdf"))
    cache["meta"]["investor_deck_count"] = len(decks)
    cache["meta"]["tab15_enabled"] = len(decks) >= 2

    out = ws / "_cache" / "schemas.json"
    out.write_text(json.dumps(cache, indent=2))
    print(json.dumps({"cache": str(out), "tab15_enabled": cache["meta"]["tab15_enabled"]}, indent=2))


def publish(ticker: str, html_path: str, backend: str) -> None:
    sym = ticker.upper()
    p = Path(html_path).expanduser().resolve()
    if not p.exists():
        raise SystemExit(f"dashboard not found: {p}")
    with p.open("rb") as f:
        r = requests.post(
            f"{backend}/api/stocks/{sym}/research-dashboard",
            files={"file": (p.name, f, "text/html")},
            timeout=120,
        )
    r.raise_for_status()
    print(json.dumps({"published": True, "symbol": sym, "response": r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text}, indent=2))


def main() -> None:
    ap = argparse.ArgumentParser(prog="orchestrate")
    ap.add_argument("--backend", default=BACKEND_DEFAULT)
    sub = ap.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("acquire")
    a.add_argument("--ticker", required=True)

    s = sub.add_parser("compute-schemas")
    s.add_argument("--ticker", required=True)

    pub = sub.add_parser("publish")
    pub.add_argument("--ticker", required=True)
    pub.add_argument("--html", required=True)

    args = ap.parse_args()
    if args.cmd == "acquire":
        acquire(args.ticker, args.backend)
    elif args.cmd == "compute-schemas":
        compute_schemas(args.ticker)
    elif args.cmd == "publish":
        publish(args.ticker, args.html, args.backend)


if __name__ == "__main__":
    main()
