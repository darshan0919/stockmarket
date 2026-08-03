#!/usr/bin/env python3
"""
monthly-sales-tracker / extract-mm-sales.py  (v2 — with prior-year extraction)

Extracts BOTH current month AND prior-year same-month data from each M&M PDF.
Each PDF contains: current month (F27/F26) + same month last year (F26/F25) in column 2.

Series per record:
  - suv_domestic   : Utility Vehicles Domestic
  - cv_domestic    : LCV<2T + LCV 2-3.5T + 3W (summed)
  - exports        : Total Automotive Exports
  - tractor_total  : Farm Equipment Total (Domestic + Exports)
  - auto_total     : suv_domestic + cv_domestic + exports

Output: data/runs/monthly-sales-tracker/NSE_M_M/sales_data.json
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
    print("Error: pip3 install pdfplumber", file=sys.stderr)
    sys.exit(1)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent

# ── Month helpers ─────────────────────────────────────────────────────────────
MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
MONTH_NAMES = {v: k.capitalize() for k, v in list(MONTH_MAP.items())[:12]}

def month_from_name(s: str) -> int:
    return MONTH_MAP.get(s.lower().strip(), 0)

def fiscal_quarter(month: int, year: int) -> str:
    if month in (4, 5, 6):     q, fy = 1, year + 1
    elif month in (7, 8, 9):   q, fy = 2, year + 1
    elif month in (10, 11, 12): q, fy = 3, year + 1
    else:                       q, fy = 4, year
    return f"Q{q}FY{fy % 100:02d}"

# ── Number helpers ────────────────────────────────────────────────────────────
def parse_units(raw) -> Optional[int]:
    if raw is None:
        return None
    s = str(raw).replace(",", "").strip()
    if not s or s in ("-", "—", "NA", "N/A", "None", ""):
        return None
    try:
        v = int(float(s))
        if 2020 <= v <= 2030:   # reject year-as-unit
            return None
        return v if v > 0 else None
    except (ValueError, TypeError):
        return None

def nth_valid_num(row: list, n: int = 1, skip: int = 1, min_val: int = 10) -> Optional[int]:
    """Return the n-th valid number (1-indexed) in row[skip:], skipping None/empty cells."""
    found = 0
    for cell in row[skip:]:
        v = parse_units(cell)
        if v is not None and v >= min_val:
            found += 1
            if found == n:
                return v
    return None

def first_valid_num(row, skip=1, min_val=10):
    return nth_valid_num(row, n=1, skip=skip, min_val=min_val)

def second_valid_num(row, skip=1, min_val=10):
    return nth_valid_num(row, n=2, skip=skip, min_val=min_val)

# ── Period detection ──────────────────────────────────────────────────────────
PERIOD_RE = re.compile(
    r"\b(January|February|March|April|May|June|July|August|September|October|November|December)"
    r"[\s']+(\d{2,4})\b", re.IGNORECASE,
)

def detect_period(text: str, fname: str) -> tuple[int, int]:
    for m in re.finditer(
        r"(?:month of|in|for)\s+"
        r"(January|February|March|April|May|June|July|August|September|October|November|December)"
        r"\s+(\d{4})",
        text, re.IGNORECASE,
    ):
        mo, yr = month_from_name(m.group(1)), int(m.group(2))
        if mo and yr >= 2020:
            return mo, yr
    for m in PERIOD_RE.finditer(text):
        yr_raw = m.group(2)
        yr = int(yr_raw) if len(yr_raw) == 4 else 2000 + int(yr_raw)
        mo = month_from_name(m.group(1))
        if mo and yr >= 2020:
            return mo, yr
    m2 = re.match(r"(\d{4})-(\d{2})", fname)
    if m2:
        yr, mo = int(m2.group(1)), int(m2.group(2))
        if 1 <= mo <= 12:
            return mo, yr
    return 0, 0

# ── Table helpers ─────────────────────────────────────────────────────────────
def label_of(row: list) -> str:
    for c in row:
        s = str(c or "").strip()
        if s:
            return s
    return ""

def find_table_with_header(tables, header_re):
    for tbl in tables:
        for row in tbl[:3]:
            lbl = " ".join(str(c or "") for c in row)
            if header_re.search(lbl):
                return tbl
    return None

def find_any_table_with_row(tables, row_re):
    for tbl in tables:
        for row in tbl:
            if row_re.search(label_of(row)):
                return tbl
    return None

def find_row(table, row_re):
    for row in table:
        if row_re.search(label_of(row)):
            return row
    return None

# ── Label patterns ────────────────────────────────────────────────────────────
AUTO_HDR    = re.compile(r"Passenger\s+Vehicles?\s+Sales\s+Summary", re.IGNORECASE)
CV_HDR      = re.compile(r"Commercial\s+Vehicles?\s+and\s+3\s+Wheelers?", re.IGNORECASE)
EXPORT_HDR  = re.compile(r"Exports?\s*[-–]", re.IGNORECASE)
FARM_HDR    = re.compile(r"Farm\s+Equipment\s+(?:Business\s+)?(?:Sector\s+)?Summary", re.IGNORECASE)

UV_ROW_RE   = re.compile(r"^Utility\s+Vehicles?\*?", re.IGNORECASE)
PV_ROW_RE   = re.compile(r"^Passenger\s+Vehicles?\s*$", re.IGNORECASE)
LCV1_ROW_RE = re.compile(r"LCV\s*<\s*2\s*T", re.IGNORECASE)
LCV2_ROW_RE = re.compile(r"LCV\s*2\s*T\s*[–-]", re.IGNORECASE)
W3_ROW_RE   = re.compile(r"3\s*(?:W|Wheeler)", re.IGNORECASE)
EXP_ROW_RE  = re.compile(r"Total\s+Exports?", re.IGNORECASE)
FARM_TOTAL  = re.compile(r"^Total\s*$", re.IGNORECASE)

# ── Extract both columns (current + prior year) from a table row ──────────────
def extract_auto_both(tables, text):
    """Returns (current, prior) dicts each with suv_domestic, cv_domestic, exports."""
    curr = {"suv_domestic": None, "cv_domestic": None, "exports": None}
    prev = {"suv_domestic": None, "cv_domestic": None, "exports": None}

    # SUV / PV domestic
    pv_table = find_table_with_header(tables, AUTO_HDR)
    if pv_table is None:
        pv_table = find_any_table_with_row(tables, UV_ROW_RE)
    if pv_table:
        row = find_row(pv_table, PV_ROW_RE) or find_row(pv_table, UV_ROW_RE)
        if row:
            curr["suv_domestic"] = first_valid_num(row, skip=1, min_val=1000)
            prev["suv_domestic"] = second_valid_num(row, skip=1, min_val=1000)

    # CV domestic — sum LCV<2T + LCV 2-3.5T + 3W
    cv_table = find_table_with_header(tables, CV_HDR)
    if cv_table is None:
        cv_table = find_any_table_with_row(tables, LCV1_ROW_RE) or find_any_table_with_row(tables, LCV2_ROW_RE)
    if cv_table:
        for row_re, key in [(LCV1_ROW_RE, "lcv1"), (LCV2_ROW_RE, "lcv2"), (W3_ROW_RE, "w3")]:
            row = find_row(cv_table, row_re)
            if row:
                c = first_valid_num(row, skip=1, min_val=100)
                p = second_valid_num(row, skip=1, min_val=100)
                if c:
                    curr["cv_domestic"] = (curr["cv_domestic"] or 0) + c
                if p:
                    prev["cv_domestic"] = (prev["cv_domestic"] or 0) + p

    # Exports
    exp_table = find_table_with_header(tables, EXPORT_HDR)
    if exp_table is None:
        exp_table = find_any_table_with_row(tables, EXP_ROW_RE)
    if exp_table:
        row = find_row(exp_table, EXP_ROW_RE)
        if row:
            curr["exports"] = first_valid_num(row, skip=1, min_val=100)
            prev["exports"] = second_valid_num(row, skip=1, min_val=100)

    # Text fallbacks for exports
    if curr["exports"] is None:
        for line in text.split("\n"):
            m = re.search(r"Total\s+Exports?\*?\*?\s+(\d[\d,]+)", line)
            if m:
                curr["exports"] = parse_units(m.group(1))
                break

    return curr, prev

def extract_farm_both(tables, text):
    """Returns (current, prior) dicts each with tractor_domestic, tractor_exports, tractor_total."""
    curr = {"tractor_domestic": None, "tractor_exports": None, "tractor_total": None}
    prev = {"tractor_domestic": None, "tractor_exports": None, "tractor_total": None}

    farm_table = find_table_with_header(tables, FARM_HDR)
    if farm_table is None:
        return curr, prev

    for row in farm_table:
        lbl = label_of(row)
        if re.match(r"^Domestic", lbl, re.IGNORECASE):
            if "\n" in lbl:
                # merged "Domestic\nExports" row — values also merged with \n
                for cell in row[1:]:
                    s = str(cell or "").strip()
                    if "\n" in s:
                        parts = [parse_units(x) for x in s.split("\n")]
                        parts = [p for p in parts if p is not None and p > 100]
                        if len(parts) >= 2:
                            # First pair = (curr_dom, curr_exp), but we need curr vs prev
                            # The merged cell structure: col(curr_dom\ncurr_exp), col(prev_dom\nprev_exp)
                            # Already first non-None cell = current, next = prior
                            # Actually they appear as separate merged cells per column
                            break
                # For merged rows, scan all cells for two separate "X\nY" blobs
                merged_vals = []
                for cell in row[1:]:
                    s = str(cell or "").strip()
                    if "\n" in s:
                        nums = [parse_units(x) for x in s.split("\n")]
                        nums = [n for n in nums if n is not None and n > 100]
                        if len(nums) >= 2:
                            merged_vals.append(nums)
                if len(merged_vals) >= 2:
                    curr["tractor_domestic"] = merged_vals[0][0]
                    curr["tractor_exports"]  = merged_vals[0][1]
                    prev["tractor_domestic"] = merged_vals[1][0]
                    prev["tractor_exports"]  = merged_vals[1][1]
                elif len(merged_vals) == 1:
                    curr["tractor_domestic"] = merged_vals[0][0]
                    curr["tractor_exports"]  = merged_vals[0][1]
            else:
                curr["tractor_domestic"] = first_valid_num(row, skip=1, min_val=100)
                prev["tractor_domestic"] = second_valid_num(row, skip=1, min_val=100)
        elif re.match(r"^Exports?\s*$", lbl, re.IGNORECASE):
            curr["tractor_exports"] = first_valid_num(row, skip=1, min_val=10)
            prev["tractor_exports"] = second_valid_num(row, skip=1, min_val=10)
        elif re.match(r"^Total\s*$", lbl, re.IGNORECASE):
            curr["tractor_total"] = first_valid_num(row, skip=1, min_val=100)
            prev["tractor_total"] = second_valid_num(row, skip=1, min_val=100)

    # Compute totals if missing
    for d in [curr, prev]:
        if d["tractor_total"] is None and d["tractor_domestic"] is not None:
            d["tractor_total"] = (d["tractor_domestic"] or 0) + (d["tractor_exports"] or 0)

    # Text fallback for current tractor total
    if curr["tractor_total"] is None:
        for line in text.split("\n"):
            m = re.search(r"Total\s+tractor\s+sales.*?(\d[\d,]+)\s+units", line, re.IGNORECASE)
            if m:
                curr["tractor_total"] = parse_units(m.group(1))
                break

    return curr, prev

# ── Build a record dict from extracted values ─────────────────────────────────
def make_record(month, year, auto_d, farm_d, source, raw_file):
    if not month or not year:
        return None
    suv_dom  = auto_d.get("suv_domestic")
    cv_dom   = auto_d.get("cv_domestic")
    exports  = auto_d.get("exports")
    trac_tot = farm_d.get("tractor_total")
    trac_dom = farm_d.get("tractor_domestic")
    trac_exp = farm_d.get("tractor_exports")

    auto_total = None
    if suv_dom is not None and cv_dom is not None:
        auto_total = (suv_dom or 0) + (cv_dom or 0) + (exports or 0)

    month_name = MONTH_NAMES.get(month, "Unknown")
    quarter    = fiscal_quarter(month, year)

    return {
        "month":      month,
        "year":       year,
        "month_name": month_name,
        "quarter":    quarter,
        "date_label": f"{month_name[:3]}-{str(year)[-2:]}",
        "source":     source,
        "suv_domestic":     suv_dom,
        "cv_domestic":      cv_dom,
        "exports":          exports,
        "tractor_total":    trac_tot,
        "tractor_domestic": trac_dom,
        "tractor_exports":  trac_exp,
        "auto_total":       auto_total,
        # Aliases for predict-financials.js
        "pv_domestic": suv_dom,
        "pv_ib":       exports,
        "pv_total":    auto_total,
        "total":       auto_total,
        "ev":          None,
        "raw_file":    raw_file,
        "notes":       [],
    }

# ── Per-PDF parser ────────────────────────────────────────────────────────────
def parse_pdf(pdf_path: Path) -> list[dict]:
    fname = pdf_path.name
    print(f"\n  📄 {fname}")

    all_text, all_tables = [], []
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            for page in pdf.pages:
                t = page.extract_text() or ""
                all_text.append(t)
                for tbl in page.extract_tables():
                    all_tables.append(tbl)
    except Exception as e:
        print(f"     ✗ Error: {e}", file=sys.stderr)
        return []

    full_text = "\n".join(all_text)

    # Skip EV product launch (not monthly sales)
    if "Born Electric" in full_text:
        print("     ⏭ Skipping (EV product launch, not monthly sales)")
        return []

    curr_month, curr_year = detect_period(full_text, fname)
    if not curr_month or not curr_year:
        print("     ✗ Could not detect period")
        return []

    prev_month, prev_year = curr_month, curr_year - 1  # same month, prior year

    month_name = MONTH_NAMES.get(curr_month, "?")
    print(f"     Current : {month_name} {curr_year}  [{fiscal_quarter(curr_month, curr_year)}]")
    print(f"     Prior   : {month_name} {prev_year}  [{fiscal_quarter(curr_month, prev_year)}]")

    auto_curr, auto_prev = extract_auto_both(all_tables, full_text)
    farm_curr, farm_prev = extract_farm_both(all_tables, full_text)

    def show(label, d):
        suv = d.get("suv_domestic")
        cv  = d.get("cv_domestic")
        exp = d.get("exports")
        tot = d.get("tractor_total")
        auto = (suv or 0) + (cv or 0) + (exp or 0) if suv is not None and cv is not None else None
        print(f"     {label}: SUV={suv:,}" if suv else f"     {label}: SUV=N/A", end="")
        print(f"  CV={cv:,}" if cv else "  CV=N/A", end="")
        print(f"  Exp={exp:,}" if exp else "  Exp=N/A", end="")
        print(f"  Auto={auto:,}" if auto else "  Auto=N/A", end="")
        print(f"  Trac={tot:,}" if tot else "  Trac=N/A")

    show(f"  {month_name} {curr_year} (curr)", auto_curr | farm_curr)
    show(f"  {month_name} {prev_year} (prev)", auto_prev | farm_prev)

    records = []
    r_curr = make_record(curr_month, curr_year, auto_curr, farm_curr, "direct", fname)
    if r_curr:
        records.append(r_curr)
    r_prev = make_record(prev_month, prev_year, auto_prev, farm_prev, "prior_year_comparison", fname)
    if r_prev and r_prev.get("suv_domestic") is not None:
        records.append(r_prev)

    return records

# ── Deduplication ─────────────────────────────────────────────────────────────
def deduplicate(records: list) -> list:
    """
    For each (month, year) pair, prefer 'direct' over 'prior_year_comparison'.
    If multiple direct records exist for same period, keep the latest file (sorted by raw_file desc).
    """
    best = {}
    for r in records:
        key = (r["month"], r["year"])
        src = r.get("source", "")
        if key not in best:
            best[key] = r
        else:
            existing_src = best[key].get("source", "")
            # direct always wins over prior_year_comparison
            if existing_src == "prior_year_comparison" and src == "direct":
                best[key] = r
            elif existing_src == src == "direct":
                # keep later file (sort by raw_file name desc)
                if r["raw_file"] > best[key]["raw_file"]:
                    best[key] = r
    result = sorted(best.values(), key=lambda r: (r["year"], r["month"]))
    return result

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ticker",   default="NSE:M&M")
    ap.add_argument("--pdfs-dir")
    args = ap.parse_args()

    ticker      = args.ticker
    safe_ticker = re.sub(r"[^A-Za-z0-9]+", "_", ticker)
    pdfs_dir    = Path(args.pdfs_dir) if args.pdfs_dir else (
        REPO_ROOT / "data" / "runs" / "monthly-sales-tracker" / safe_ticker / "pdfs"
    )
    out_file = pdfs_dir.parent / "sales_data.json"

    print(f"\n📊 M&M Sales Extractor v2  —  {ticker}")
    print(f"   PDFs : {pdfs_dir}")
    print(f"   Out  : {out_file}")

    if not pdfs_dir.exists():
        print(f"Error: {pdfs_dir} not found.", file=sys.stderr)
        sys.exit(1)

    all_records = []
    for p in sorted(pdfs_dir.glob("*.pdf")):
        try:
            all_records.extend(parse_pdf(p))
        except Exception as e:
            print(f"  ✗ {p.name}: {e}", file=sys.stderr)

    records = deduplicate(all_records)

    direct    = sum(1 for r in records if r.get("source") == "direct")
    from_prev = sum(1 for r in records if r.get("source") == "prior_year_comparison")
    ok        = sum(1 for r in records if r.get("suv_domestic") is not None)

    print(f"\n── Summary ────────────────────────────────────────────────────────")
    print(f"   Raw records (before dedup) : {len(all_records)}")
    print(f"   After dedup                : {len(records)}")
    print(f"     Direct PDFs              : {direct}")
    print(f"     From prior-year column   : {from_prev}")
    print(f"     With valid SUV data      : {ok}")
    print(f"   Date range                 : {records[0]['date_label']} → {records[-1]['date_label']}")

    result = {
        "ticker":        ticker,
        "creator":       "monthly-sales-tracker/extract-mm-sales.v2",
        "createdAt":     datetime.utcnow().isoformat() + "Z",
        "total_records": len(records),
        "direct":        direct,
        "from_prior_year_column": from_prev,
        "parsed_ok":     ok,
        "series":        ["suv_domestic", "cv_domestic", "exports", "tractor_total"],
        "records":       records,
    }

    pdfs_dir.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(result, indent=2))
    print(f"\n✅  Saved → {out_file}")

if __name__ == "__main__":
    main()
