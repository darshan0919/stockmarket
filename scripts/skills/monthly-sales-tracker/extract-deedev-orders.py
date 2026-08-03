#!/usr/bin/env python3
"""
monthly-sales-tracker / extract-deedev-orders.py

Extracts monthly order book data from DEE Development Engineers Ltd (NSE:DEEDEV)
annexure PDFs. Each PDF reports:
  - opening_order_book  : Opening order book as on 1st of month (₹ Cr)
  - order_inflow        : New orders received during the month (₹ Cr)
  - execution           : Revenue executed/invoiced during the month (₹ Cr) ← direct revenue proxy
  - closing_order_book  : Closing order book at month-end (₹ Cr)
  - cum_inflow_fy       : Cumulative order inflow for the fiscal year
  - cum_executed_fy     : Cumulative execution for the fiscal year

The Jan+Feb-25 PDF covers two months; it is split into approximate monthly halves.
All values from the "Total" row across all entities.

Output: data/runs/monthly-sales-tracker/NSE_DEEDEV/sales_data.json
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

def parse_cr(raw) -> Optional[float]:
    """Parse an Indian-format crore number like '1,261.64' or '127' or '-5.68'."""
    if raw is None:
        return None
    s = str(raw).replace(",", "").strip()
    if not s or s in ("-", "—", "NA", "None", ""):
        return None
    neg = s.startswith("-")
    s = s.lstrip("-").strip()
    try:
        v = float(s)
        return -v if neg else v
    except ValueError:
        return None

def de_space(text: str) -> str:
    """
    Remove OCR-introduced spaces between single characters (scanned PDFs).
    e.g. "T o ta l  2 ,4 3 3 .9 0" -> "Total 2,433.90"
    Only collapses single-char tokens (not multi-char words).
    """
    lines = []
    for line in text.split("\n"):
        tokens = line.split(" ")
        # If >60% of tokens are single characters, collapse them
        if len(tokens) > 4 and sum(len(t) == 1 for t in tokens) / len(tokens) > 0.5:
            # Merge runs of single chars, split on 2+ spaces
            collapsed = re.sub(r"(?<=\S) (?=\S)", "", line)
            # Re-space at natural word boundaries (before capitals or digits after letters)
            lines.append(collapsed)
        else:
            lines.append(line)
    return "\n".join(lines)

# ── Period detection ──────────────────────────────────────────────────────────
MONTH_RE = re.compile(
    r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\b",
    re.IGNORECASE,
)
YEAR_RE = re.compile(r"\b(202[3-9]|2030)\b")

def detect_period(text: str, fname: str) -> tuple[int, int, Optional[int], Optional[int]]:
    """
    Returns (primary_month, primary_year, secondary_month, secondary_year).
    secondary_* filled only for dual-month PDFs like Jan+Feb-25.
    Also handles OCR-spaced text.
    """

    # Special: "for the period ranging from January, 2025 to February, 2025"
    dual = re.search(
        r"for the (?:month of|period ranging from)\s+"
        r"(January|February|March|April|May|June|July|August|September|October|November|December)[,\s]+(\d{4})"
        r"(?:\s+to\s+"
        r"(January|February|March|April|May|June|July|August|September|October|November|December)[,\s]+(\d{4}))?",
        text, re.IGNORECASE
    )
    if dual:
        m1 = month_from_name(dual.group(1))
        y1 = int(dual.group(2))
        m2 = month_from_name(dual.group(3)) if dual.group(3) else None
        y2 = int(dual.group(4)) if dual.group(4) else None
        return m1, y1, m2, y2

    # "for the month of December 2025"
    single = re.search(
        r"for the month of\s+"
        r"(January|February|March|April|May|June|July|August|September|October|November|December)[,\s]+(\d{4})",
        text, re.IGNORECASE
    )
    if single:
        return month_from_name(single.group(1)), int(single.group(2)), None, None

    # "Opening As on 1st June, 2025" / "As on 1st December, 2025"
    header = re.search(
        r"As on 1st\s+"
        r"(January|February|March|April|May|June|July|August|September|October|November|December)[,\s]+(\d{4})",
        text, re.IGNORECASE
    )
    if header:
        return month_from_name(header.group(1)), int(header.group(2)), None, None

    # Filename fallback: 2026-07-09_... → July 2026
    m = re.match(r"(\d{4})-(\d{2})-\d{2}", fname)
    if m:
        yr, mo = int(m.group(1)), int(m.group(2))
        # The file date is ~7-9 days after the month end, so the month is file_month-1
        mo_prev = mo - 1 if mo > 1 else 12
        yr_prev = yr if mo > 1 else yr - 1
        return mo_prev, yr_prev, None, None

    return 0, 0, None, None

# ── Total row extraction ──────────────────────────────────────────────────────
def find_total_row_values(tables: list) -> Optional[list]:
    """
    Find the "Total" row across all tables and return its numeric values.
    Returns list of floats in column order: [opening, inflow, executed, closing, cum_inflow, cum_executed]
    or None if not found.
    """
    for tbl in tables:
        for i, row in enumerate(tbl):
            # Find cell containing "Total"
            has_total = any(
                re.search(r"^\s*Total\s*$", str(c or ""), re.IGNORECASE)
                for c in row
            )
            if not has_total:
                continue

            # Collect all numeric values from this row AND the next (split across rows sometimes)
            nums = []
            for r in tbl[i:i+3]:  # check current + 2 rows below
                for cell in r:
                    v = parse_cr(cell)
                    if v is not None and abs(v) >= 0.01:
                        nums.append(v)
                if len(nums) >= 4:
                    break

            if len(nums) >= 4:
                return nums

    return None

def extract_total_from_text(text: str) -> Optional[list]:
    """Text-based fallback: find 'Total' line and parse numbers. Handles OCR-spaced PDFs."""
    lines = text.split("\n")
    for i, line in enumerate(lines):
        # Match both normal "Total" and OCR-spaced "T o ta l" / "T o t a l"
        if re.search(r"T\s*o\s*t\s*a\s*l", line, re.IGNORECASE):
            # Collapse internal spaces within number patterns (OCR artifact)
            # e.g. "2 ,4 3 3 .9 0" → "2,433.90"
            cleaned = re.sub(
                r"(\d)\s+([,.])\s*(\d)",    # "2 , 4 3 3"
                lambda m: m.group(1) + m.group(2) + m.group(3),
                line,
            )
            # Also collapse single-spaced digit sequences
            cleaned = re.sub(r"(\d) (\d)", r"\1\2", cleaned)
            cleaned = re.sub(r"(\d) (\d)", r"\1\2", cleaned)  # second pass

            # Combine with next few lines
            next_lines = lines[i+1:i+4]
            candidate = cleaned + " " + " ".join(next_lines)
            nums = re.findall(r"-?\d{1,4}(?:,\d{2,3})*(?:\.\d{1,2})?", candidate)
            parsed = [parse_cr(n) for n in nums]
            parsed = [v for v in parsed if v is not None and abs(v) >= 0.01]
            parsed = [v for v in parsed if not (2020 <= abs(v) <= 2030)]
            if len(parsed) >= 4:
                return parsed
    return None


# ── Make record ───────────────────────────────────────────────────────────────
def make_record(month: int, year: int, nums: list, source: str, raw_file: str,
                note: str = "") -> dict:
    # Column order from the table:
    # [opening, inflow, executed, closing, cum_inflow, cum_executed]
    # Some earlier PDFs have only 4 columns (no cumulative)
    opening   = nums[0] if len(nums) > 0 else None
    inflow    = nums[1] if len(nums) > 1 else None
    executed  = nums[2] if len(nums) > 2 else None
    closing   = nums[3] if len(nums) > 3 else None
    cum_inflow   = nums[4] if len(nums) > 4 else None
    cum_executed = nums[5] if len(nums) > 5 else None

    month_name = MONTH_NAMES.get(month, "Unknown")
    quarter    = fiscal_quarter(month, year)

    return {
        "month":      month,
        "year":       year,
        "month_name": month_name,
        "quarter":    quarter,
        "date_label": f"{month_name[:3]}-{str(year)[-2:]}",
        "source":     source,
        # Core metrics (₹ Cr)
        "execution":          executed,      # monthly revenue proxy
        "order_inflow":       inflow,        # new orders added
        "opening_order_book": opening,       # order book at start
        "closing_order_book": closing,       # order book at end
        "cum_inflow_fy":      cum_inflow,    # YTD inflow
        "cum_executed_fy":    cum_executed,  # YTD execution
        # Aliases for chart renderer compatibility
        "revenue":    executed,
        "raw_file":   raw_file,
        "note":       note,
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
    m1, y1, m2, y2 = detect_period(full_text, fname)

    if not m1 or not y1:
        print(f"     ✗ Could not detect period")
        return []

    n1 = MONTH_NAMES.get(m1, "?")
    dual = m2 is not None
    if dual:
        n2 = MONTH_NAMES.get(m2, "?")
        print(f"     Period : {n1} {y1} + {n2} {y2}  [{fiscal_quarter(m1, y1)}]  (DUAL)")
    else:
        print(f"     Period : {n1} {y1}  [{fiscal_quarter(m1, y1)}]")

    # Extract total row
    nums = find_total_row_values(all_tables)
    if nums is None:
        # Try both original and de-spaced text
        nums = extract_total_from_text(full_text)
    if nums is None:
        # Try de-spaced text for OCR-scanned PDFs
        despace_text = de_space(full_text)
        nums = find_total_row_values(all_tables)  # tables already extracted
        if nums is None:
            nums = extract_total_from_text(despace_text)

    if nums is None:
        print(f"     ✗ Could not find Total row")
        return []

    def fmt(v):
        return f"₹{v:,.2f}" if v is not None else "N/A"

    print(f"     Opening OB   : {fmt(nums[0] if nums else None)}")
    print(f"     Order Inflow : {fmt(nums[1] if len(nums)>1 else None)}")
    print(f"     Execution    : {fmt(nums[2] if len(nums)>2 else None)}")
    print(f"     Closing OB   : {fmt(nums[3] if len(nums)>3 else None)}")
    if len(nums) > 5:
        print(f"     Cum YTD Exec : {fmt(nums[5])}")

    if dual:
        # Single PDF covers 2 months; we can't split execution perfectly.
        # Estimate: each month = total/2, but order book snapshots still valid.
        # Mark both with note. Use full execution for each month (user can interpret as
        # "total for the period").
        note = f"Dual-month PDF ({n1}+{n2} {y1}); execution shown is 2-month total"
        r1 = make_record(m1, y1, nums, "direct", fname, note=f"{note}; this PDF reports Jan–Feb combined")
        r2 = make_record(m2, y2, nums, "direct", fname, note=f"{note}; this PDF reports Jan–Feb combined")
        # Override individual months with half of total execution and midpoint order book
        if r1 and r2:
            for r in [r1, r2]:
                if r["execution"] is not None:
                    r["execution"]    = round(r["execution"] / 2, 2)
                    r["revenue"]      = r["execution"]
                    r["order_inflow"] = round((r["order_inflow"] or 0) / 2, 2) if r["order_inflow"] else None
            # r1 (Jan) closing_ob = halfway between opening and final closing
            if r1["opening_order_book"] is not None and r1["closing_order_book"] is not None:
                mid = round((r1["opening_order_book"] + r1["closing_order_book"]) / 2, 2)
                r1["closing_order_book"] = mid
                r2["opening_order_book"] = mid
        return [r for r in [r1, r2] if r]
    else:
        r = make_record(m1, y1, nums, "direct", fname)
        return [r] if r else []

# ── Deduplication ─────────────────────────────────────────────────────────────
def deduplicate(records: list) -> list:
    best = {}
    for r in records:
        key = (r["month"], r["year"])
        src = r.get("source", "")
        if key not in best:
            best[key] = r
        else:
            existing = best[key]
            # Prefer records with more columns (no note = cleaner source)
            if not r.get("note") and existing.get("note"):
                best[key] = r
            elif r["raw_file"] > existing["raw_file"]:
                best[key] = r
    return sorted(best.values(), key=lambda r: (r["year"], r["month"]))

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ticker",   default="NSE:DEEDEV")
    ap.add_argument("--pdfs-dir")
    args = ap.parse_args()

    ticker      = args.ticker
    safe_ticker = re.sub(r"[^A-Za-z0-9]+", "_", ticker)
    pdfs_dir    = Path(args.pdfs_dir) if args.pdfs_dir else (
        REPO_ROOT / "data" / "runs" / "monthly-sales-tracker" / safe_ticker / "pdfs"
    )
    out_file = pdfs_dir.parent / "sales_data.json"

    print(f"\n📊 DEEDEV Order Book Extractor  —  {ticker}")
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
    ok = sum(1 for r in records if r.get("execution") is not None)

    print(f"\n── Summary ──────────────────────────────────────────────────────")
    print(f"   Records        : {len(records)}")
    print(f"   With execution : {ok}")
    if records:
        print(f"   Date range     : {records[0]['date_label']} → {records[-1]['date_label']}")

    result = {
        "ticker":        ticker,
        "creator":       "monthly-sales-tracker/extract-deedev-orders",
        "createdAt":     datetime.utcnow().isoformat() + "Z",
        "total_records": len(records),
        "parsed_ok":     ok,
        "company_type":  "order_book_tracker",
        "unit":          "INR_Cr",
        "series":        ["execution", "order_inflow", "closing_order_book"],
        "records":       records,
    }

    pdfs_dir.parent.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(result, indent=2))
    print(f"\n✅  Saved → {out_file}")

if __name__ == "__main__":
    main()
