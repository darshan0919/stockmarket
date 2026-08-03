#!/usr/bin/env python3
"""
monthly-sales-tracker / extract-sales-data.py

Extracts 4 unit series per month from Tata Motors / TMPV monthly press-release PDFs:
  - pv_domestic   : PV Domestic (excl. IB/exports)
  - pv_ib         : PV International Business (exports)
  - ev            : EV IB + Domestic (combined)
  - pv_total      : PV Total (includes EV, domestic + IB)

Two layout eras are handled:
  ERA A — Pre-Oct 2025 (entity: Tata Motors Ltd):
    Table label: "Total PV Domestic (includes EV)"  → pv_domestic
                 "EV (IB + Domestic)"               → ev
                 "Total PV (includes EV)"            → pv_total
                 "PV IB"                             → pv_ib

  ERA B — Post-Oct 2025 (entity: Tata Motors Passenger Vehicles Ltd):
    Table label: "PV Domestic"                      → pv_domestic
                 "PV IB"                             → pv_ib
                 "PV Total (includes EV)"            → pv_total
                 "EV IB + Domestic"                  → ev

Usage:
    python3 extract-sales-data.py --ticker NSE:TMPV
    python3 extract-sales-data.py --ticker NSE:TMCV
    python3 extract-sales-data.py --ticker NSE:TMPV --pdfs-dir /path/to/pdfs

Input:
    data/runs/monthly-sales-tracker/<ticker>/pdfs/*.pdf

Output:
    data/runs/monthly-sales-tracker/<ticker>/sales_data.json

Dependencies:
    pip3 install pdfplumber
"""

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    import pdfplumber
except ImportError:
    print("Error: pdfplumber is required. Run: pip3 install pdfplumber", file=sys.stderr)
    sys.exit(1)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent

# ── Month helpers ─────────────────────────────────────────────────────────────
MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4,
    "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
MONTH_NAMES = {v: k.capitalize() for k, v in list(MONTH_MAP.items())[:12]}

def month_from_name(name: str) -> int:
    return MONTH_MAP.get(name.lower().strip(), 0)

def fiscal_quarter(month: int, year: int) -> str:
    if month in (4, 5, 6):   q, fy = 1, year + 1
    elif month in (7, 8, 9):  q, fy = 2, year + 1
    elif month in (10, 11, 12): q, fy = 3, year + 1
    else:                      q, fy = 4, year
    return f"Q{q}FY{fy % 100:02d}"

# ── Number parser ─────────────────────────────────────────────────────────────
def parse_units(raw: str) -> Optional[int]:
    if raw is None:
        return None
    cleaned = str(raw).replace(",", "").strip()
    if cleaned in ("-", "NA", "N/A", "", "—", "None"):
        return None
    try:
        v = int(float(cleaned))
        # Reject plausible year values (2020–2030) when used as units
        if 2020 <= v <= 2030:
            return None
        return v if v > 0 else None
    except (ValueError, TypeError):
        return None

# ── Month/year detection ──────────────────────────────────────────────────────
# Matches "July 2026", "August 2024", "Feb'26", etc.
PERIOD_RES = [
    re.compile(
        r"\b(January|February|March|April|May|June|July|August|September|October|November|December)"
        r"['\s]+(\d{4})\b", re.IGNORECASE,
    ),
    re.compile(
        r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)['\s]*(\d{2,4})\b", re.IGNORECASE,
    ),
    # "Monthly Sales - July 2026"
    re.compile(
        r"Monthly\s+Sales?\s*[-–]\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})",
        re.IGNORECASE,
    ),
]

def detect_period(text: str, fname: str) -> tuple[int, int]:
    for rx in PERIOD_RES:
        m = rx.search(text)
        if m:
            yr_raw = m.group(2)
            yr = int(yr_raw) if len(yr_raw) == 4 else 2000 + int(yr_raw)
            mo = month_from_name(m.group(1))
            if mo and yr >= 2020:
                return mo, yr
    # filename fallback: "2026-08-01_July_2026.pdf"
    m2 = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December)_(\d{4})", fname, re.IGNORECASE)
    if m2:
        return month_from_name(m2.group(1)), int(m2.group(2))
    m3 = re.match(r"(\d{4})-(\d{2})", fname)
    if m3:
        yr, mo = int(m3.group(1)), int(m3.group(2))
        if 1 <= mo <= 12:
            return mo, yr
    return 0, 0

# ── Table-based extraction ────────────────────────────────────────────────────
# For each row, col[0] is the label, col[3] (or first non-None after) is current month value.
# The table structure has many None cells due to PDF merging; we scan for the first valid number.

def nth_valid_number(row: list, n: int = 1, min_val: int = 100, skip_cols: int = 1) -> Optional[int]:
    """Return the n-th valid integer (1-indexed) >= min_val in row[skip_cols:]."""
    found = 0
    for cell in row[skip_cols:]:
        v = parse_units(str(cell or ""))
        if v is not None and v >= min_val:
            found += 1
            if found == n:
                return v
    return None

def first_valid_number(row, min_val=100, skip_cols=1):
    return nth_valid_number(row, n=1, min_val=min_val, skip_cols=skip_cols)

def second_valid_number(row, min_val=100, skip_cols=1):
    return nth_valid_number(row, n=2, min_val=min_val, skip_cols=skip_cols)


# Label matchers for ERA A and ERA B
# We test each row's label cell (col 0 or col 1) against these patterns.
ERA_A_LABELS = {
    "pv_domestic": re.compile(r"Total\s+PV\s+Domestic\s*\(includes\s+EV\)", re.IGNORECASE),
    "pv_ib":       re.compile(r"^PV\s+IB$", re.IGNORECASE),
    "ev":          re.compile(r"EV\s*\(IB\s*\+\s*Domestic\)", re.IGNORECASE),
    "pv_total":    re.compile(r"Total\s+PV\s*\(includes\s+EV\)", re.IGNORECASE),
}
ERA_B_LABELS = {
    "pv_domestic": re.compile(r"^PV\s+Domestic$", re.IGNORECASE),
    "pv_ib":       re.compile(r"^PV\s+IB$", re.IGNORECASE),
    "ev":          re.compile(r"EV\s*IB\s*\+\s*Domestic", re.IGNORECASE),
    "pv_total":    re.compile(r"^PV\s+Total\s*\(includes\s+EV\)$|PV\s+Total", re.IGNORECASE),
}

def _label_of(row: list) -> str:
    """Return the first non-empty cell of a row as a string."""
    for cell in row:
        s = str(cell or "").strip()
        if s:
            return s
    return ""

def extract_from_tables(tables: list, era: str, col: int = 1) -> dict:
    """col=1 → current month (first valid number), col=2 → prior year (second valid number)."""
    patterns = ERA_A_LABELS if era == "A" else ERA_B_LABELS
    result = {k: None for k in patterns}
    get_num = first_valid_number if col == 1 else second_valid_number

    for table in tables:
        for row in table:
            label = _label_of(row)
            for key, rx in patterns.items():
                if result[key] is None and rx.search(label):
                    result[key] = get_num(row, min_val=100, skip_cols=1)
    return result

# ── Text-based fallback ───────────────────────────────────────────────────────
NUM_RE = re.compile(r"\b(\d{1,3}(?:,\d{2,3})+|\d{4,6})\b")

def _first_num_on_line(line: str, min_val: int = 100) -> Optional[int]:
    for m in NUM_RE.finditer(line):
        v = parse_units(m.group())
        if v is not None and v >= min_val:
            return v
    return None

def extract_from_text_era_a(text: str) -> dict:
    result = {"pv_domestic": None, "pv_ib": None, "ev": None, "pv_total": None}
    for line in text.split("\n"):
        stripped = line.strip()
        if re.search(r"Total\s+PV\s+Domestic\s*\(includes\s+EV\)", stripped, re.IGNORECASE):
            result["pv_domestic"] = _first_num_on_line(stripped)
        elif re.search(r"^PV\s+IB\b", stripped, re.IGNORECASE):
            result["pv_ib"] = _first_num_on_line(stripped)
        elif re.search(r"EV\s*\(IB\s*\+\s*Domestic\)", stripped, re.IGNORECASE):
            result["ev"] = _first_num_on_line(stripped)
        elif re.search(r"Total\s+PV\s*\(includes\s+EV\)", stripped, re.IGNORECASE):
            result["pv_total"] = _first_num_on_line(stripped)
    return result

def extract_from_text_era_b(text: str) -> dict:
    result = {"pv_domestic": None, "pv_ib": None, "ev": None, "pv_total": None}
    for line in text.split("\n"):
        stripped = line.strip()
        if re.match(r"PV\s+Domestic\b", stripped, re.IGNORECASE) and not re.search(r"Total|includes", stripped, re.IGNORECASE):
            result["pv_domestic"] = _first_num_on_line(stripped)
        elif re.match(r"PV\s+IB\b", stripped, re.IGNORECASE):
            result["pv_ib"] = _first_num_on_line(stripped)
        elif re.search(r"EV\s*IB\s*\+\s*Domestic", stripped, re.IGNORECASE):
            result["ev"] = _first_num_on_line(stripped)
        elif re.search(r"PV\s+Total\s*\(includes\s+EV\)|PV\s+Total", stripped, re.IGNORECASE):
            result["pv_total"] = _first_num_on_line(stripped)
    return result

# ── Era detection ─────────────────────────────────────────────────────────────
# Era B begins after ~Oct 2025 when company was renamed to TMPV
def detect_era(text: str, month: int, year: int) -> str:
    if year > 2025:
        return "B"
    if year == 2025 and month >= 11:
        return "B"
    # Also check text for the rebrand marker
    if re.search(r"Passenger\s+Vehicles\s+Ltd\.", text, re.IGNORECASE) and \
       re.search(r"formerly\s+Tata\s+Motors\s+Limited", text, re.IGNORECASE):
        return "B"
    return "A"

# ── Record builder ────────────────────────────────────────────────────────────
def make_record(month, year, vals, source, raw_file):
    if not month or not year:
        return None
    pv_dom  = vals.get("pv_domestic")
    pv_ib   = vals.get("pv_ib")
    ev      = vals.get("ev")
    pv_tot  = vals.get("pv_total")
    month_name = MONTH_NAMES.get(month, "Unknown")
    quarter    = fiscal_quarter(month, year) if month else "unknown"
    return {
        "month":      month,
        "year":       year,
        "month_name": month_name,
        "quarter":    quarter,
        "date_label": f"{month_name[:3]}-{str(year)[-2:]}",
        "source":     source,
        "pv_domestic": pv_dom,
        "pv_ib":       pv_ib,
        "ev":          ev,
        "pv_total":    pv_tot,
        # Aliases
        "domestic":    pv_dom,
        "exports":     pv_ib,
        "total":       pv_tot,
        "raw_file":    raw_file,
        "notes":       [],
    }

# ── Deduplication ────────────────────────────────────────────────────────────
def deduplicate(records: list) -> list:
    best = {}
    for r in records:
        key = (r["month"], r["year"])
        src = r.get("source", "")
        if key not in best:
            best[key] = r
        else:
            existing_src = best[key].get("source", "")
            if existing_src == "prior_year_comparison" and src == "direct":
                best[key] = r
            elif existing_src == src == "direct":
                if r["raw_file"] > best[key]["raw_file"]:
                    best[key] = r
    return sorted(best.values(), key=lambda r: (r["year"] or 0, r["month"] or 0))

# ── Full PDF parser ────────────────────────────────────────────────────────────
def parse_pdf(pdf_path: Path, ticker: str) -> list:
    fname = pdf_path.name
    print(f"\n  📄 {fname}")

    all_text = []
    all_tables = []
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            for page in pdf.pages:
                t = page.extract_text() or ""
                all_text.append(t)
                for tbl in page.extract_tables():
                    all_tables.append(tbl)
    except Exception as e:
        print(f"     ✗ pdfplumber error: {e}", file=sys.stderr)
        return []

    full_text = "\n".join(all_text)
    month, year = detect_period(full_text, fname)
    era = detect_era(full_text, month, year)

    quarter    = fiscal_quarter(month, year) if month else "unknown"
    month_name = MONTH_NAMES.get(month, "Unknown")
    print(f"     Current : {month_name} {year}  ({quarter})  [ERA {era}]")

    # Extract current month (col 1)
    curr_vals = extract_from_tables(all_tables, era, col=1)
    text_fn   = extract_from_text_era_b if era == "B" else extract_from_text_era_a
    text_vals = text_fn(full_text)
    for k in curr_vals:
        if curr_vals[k] is None and text_vals.get(k) is not None:
            curr_vals[k] = text_vals[k]

    # Extract prior year (col 2) — same month, year-1
    prev_vals  = extract_from_tables(all_tables, era, col=2)
    prev_month = month
    prev_year  = year - 1
    prev_quarter = fiscal_quarter(prev_month, prev_year) if prev_month else "unknown"
    print(f"     Prior   : {month_name} {prev_year}  ({prev_quarter})")

    def show(label, vals):
        dom = vals.get('pv_domestic'); ib = vals.get('pv_ib')
        ev_ = vals.get('ev');          tot = vals.get('pv_total')
        print(f"     {label}: Dom={dom:,}" if dom else f"     {label}: Dom=N/A", end="")
        print(f"  IB={ib:,}" if ib else "  IB=N/A", end="")
        print(f"  EV={ev_:,}" if ev_ else "  EV=N/A", end="")
        print(f"  Tot={tot:,}" if tot else "  Tot=N/A")

    show(f"  {month_name} {year} (curr)", curr_vals)
    show(f"  {month_name} {prev_year} (prev)", prev_vals)

    records = []
    r_curr = make_record(month, year, curr_vals, "direct", fname)
    if r_curr:
        records.append(r_curr)
    r_prev = make_record(prev_month, prev_year, prev_vals, "prior_year_comparison", fname)
    if r_prev and (r_prev.get("pv_domestic") is not None or r_prev.get("pv_total") is not None):
        records.append(r_prev)

    return records

# ── Batch parser ──────────────────────────────────────────────────────────────
def extract_all(pdfs_dir: Path, ticker: str) -> list:
    pdfs = sorted(pdfs_dir.glob("*.pdf"))
    if not pdfs:
        print(f"No PDF files found in {pdfs_dir}", file=sys.stderr)
        return []
    all_records = []
    for pdf_path in pdfs:
        try:
            all_records.extend(parse_pdf(pdf_path, ticker))
        except Exception as e:
            print(f"  ✗ Error parsing {pdf_path.name}: {e}", file=sys.stderr)
    return deduplicate(all_records)

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ticker",   required=True)
    ap.add_argument("--pdfs-dir", help="Override PDFs directory")
    args = ap.parse_args()

    ticker      = args.ticker
    safe_ticker = re.sub(r"[^A-Za-z0-9]+", "_", ticker)
    pdfs_dir    = Path(args.pdfs_dir) if args.pdfs_dir else (
        REPO_ROOT / "data" / "runs" / "monthly-sales-tracker" / safe_ticker / "pdfs"
    )
    out_file = pdfs_dir.parent / "sales_data.json"

    print(f"\n📊 Monthly Sales Extractor  —  {ticker}")
    print(f"   PDFs : {pdfs_dir}")
    print(f"   Out  : {out_file}")

    if not pdfs_dir.exists():
        print(f"Error: {pdfs_dir} not found. Run download-sales-pdfs.js first.", file=sys.stderr)
        sys.exit(1)

    records = extract_all(pdfs_dir, ticker)
    ok      = sum(1 for r in records if r["pv_total"] is not None or r["pv_domestic"] is not None)

    result = {
        "ticker":        ticker,
        "creator":       "monthly-sales-tracker/extract-sales-data",
        "createdAt":     datetime.utcnow().isoformat() + "Z",
        "total_records": len(records),
        "parsed_ok":     ok,
        "missing_data":  len(records) - ok,
        "series":        ["pv_domestic", "pv_ib", "ev", "pv_total"],
        "records":       records,
    }

    pdfs_dir.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(result, indent=2))

    print(f"\n✅  {ok}/{len(records)} records extracted  →  {out_file}")

    missing = [r for r in records if r["pv_total"] is None and r["pv_domestic"] is None]
    if missing:
        print(f"\n  ⚠ Missing data for:")
        for r in missing:
            print(f"    {r['date_label']}  {r['raw_file']}")

    print("\n── Token-optimization note ─────────────────────────────────────────")
    print("   Run once per new month PDF. The predict step re-reads this file.")

if __name__ == "__main__":
    main()
