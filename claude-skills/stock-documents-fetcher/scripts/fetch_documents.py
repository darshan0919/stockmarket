#!/usr/bin/env python3
"""
fetch_documents.py — Fetch standardised company documents from Stockscans.

Document types: Annual Report, PPT (investor presentation), Result, Transcript.

Filters by date range and document type, downloads the matching PDFs from
the public S3 CDN, and writes a manifest.json describing what was fetched
so downstream skills can iterate without re-querying the API.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DOCUMENTS_API = "https://www.stockscans.in/api/company/documents/"
S3_BASE = "https://stockscans-assets.s3.ap-south-1.amazonaws.com/company-docs/"

# Canonical document types as they appear in the API response
CANONICAL_TYPES = {"Annual Report", "PPT", "Result", "Transcript"}

# Map user-friendly aliases → canonical type. All keys lower-cased.
TYPE_ALIASES = {
    # Annual Report
    "annual report": "Annual Report",
    "annualreport": "Annual Report",
    "ar": "Annual Report",
    "annual": "Annual Report",
    # Investor Presentation (PPT)
    "ppt": "PPT",
    "presentation": "PPT",
    "investor presentation": "PPT",
    "investor_presentation": "PPT",
    "deck": "PPT",
    "investor deck": "PPT",
    # Results
    "result": "Result",
    "results": "Result",
    "financial result": "Result",
    "financial results": "Result",
    "quarterly result": "Result",
    "quarterly results": "Result",
    "earnings": "Result",
    # Transcripts (concalls)
    "transcript": "Transcript",
    "transcripts": "Transcript",
    "concall": "Transcript",
    "concall transcript": "Transcript",
    "earnings call": "Transcript",
    "earnings call transcript": "Transcript",
    "call transcript": "Transcript",
}

# Default authtoken locations (priority order). First existing wins.
DEFAULT_AUTHTOKEN_PATHS = [
    Path("/mnt/project/Stockscans_authtoken"),
    Path("/mnt/project/stockscans_authtoken"),
    Path("/mnt/user-data/uploads/Stockscans_authtoken"),
    Path.home() / ".stockscans_authtoken",
]


# ---------------------------------------------------------------------------
# Authtoken handling
# ---------------------------------------------------------------------------
def load_authtoken(explicit_path: str | None = None) -> str:
    """Resolve the Stockscans authtoken from CLI arg → env → known files.

    Trims whitespace and any trailing semicolons (the sample file ends with one).
    """
    # 1. Explicit path
    if explicit_path:
        path = Path(explicit_path)
        if not path.exists():
            raise FileNotFoundError(f"Authtoken file not found: {explicit_path}")
        return _clean_token(path.read_text())

    # 2. Environment variable
    env = os.environ.get("STOCKSCANS_AUTHTOKEN")
    if env:
        return _clean_token(env)

    # 3. Default locations
    for path in DEFAULT_AUTHTOKEN_PATHS:
        if path.exists():
            return _clean_token(path.read_text())

    raise RuntimeError(
        "Could not find Stockscans authtoken. Provide --authtoken-file, "
        "set STOCKSCANS_AUTHTOKEN env var, or place the token at "
        f"{DEFAULT_AUTHTOKEN_PATHS[0]}"
    )


def _clean_token(raw: str) -> str:
    return raw.strip().rstrip(";").strip()


def check_token_expiry(token: str) -> tuple[datetime | None, int | None]:
    """Decode the JWT payload and return (expiry_datetime, days_remaining).

    Returns (None, None) if the token can't be decoded — we still try the
    request because the payload format isn't strictly part of the contract.
    """
    try:
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        exp = payload.get("exp")
        if not exp:
            return None, None
        expiry = datetime.fromtimestamp(exp, tz=timezone.utc)
        days = (expiry - datetime.now(timezone.utc)).days
        return expiry, days
    except Exception:
        return None, None


# ---------------------------------------------------------------------------
# API call
# ---------------------------------------------------------------------------
def fetch_documents_list(ticker: str, token: str, timeout: int = 30) -> list[dict]:
    """GET the documents list for a ticker like 'NSE:BSE'.

    Returns the raw 'documents' array, which contains dicts with keys:
        date, documentType, ssUrl, hasNotes
    """
    encoded = urllib.parse.quote(ticker, safe="")
    url = DOCUMENTS_API + encoded
    req = urllib.request.Request(
        url,
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "cookie": f"authtoken={token}",
            "referer": f"https://www.stockscans.in/company/{encoded}",
            "user-agent": (
                "Mozilla/5.0 (compatible; StockDocumentsFetcher/1.0)"
            ),
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
    data = json.loads(body)
    docs = data.get("documents", [])
    if not isinstance(docs, list):
        raise RuntimeError(f"Unexpected response shape: {body[:200]}")
    return docs


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------
def normalise_type(user_type: str) -> str:
    """Map a user-supplied type label to its canonical API value.

    Accepts canonical labels verbatim. Raises if it can't be resolved.
    """
    key = user_type.strip().lower()
    if user_type in CANONICAL_TYPES:
        return user_type
    if key in TYPE_ALIASES:
        return TYPE_ALIASES[key]
    # tolerant fallback: normalise whitespace
    key2 = re.sub(r"\s+", " ", key)
    if key2 in TYPE_ALIASES:
        return TYPE_ALIASES[key2]
    raise ValueError(
        f"Unknown document type: {user_type!r}. "
        f"Allowed: {sorted(CANONICAL_TYPES)} (and aliases — see SKILL.md)"
    )


def parse_date_filter(s: str | None) -> int | None:
    """Parse a date filter input into a YYYYMM int.

    Accepts: 'YYYY' (treated as YYYY01 for start, YYYY12 for end via callers),
    'YYYYMM', 'YYYY-MM', 'YYYY/MM'.
    Returns None for None input. Caller chooses month padding semantics.
    """
    if s is None:
        return None
    raw = s.strip()
    if re.fullmatch(r"\d{4}", raw):
        return int(raw + "00")  # placeholder; callers reinterpret
    m = re.fullmatch(r"(\d{4})[-/]?(\d{2})", raw)
    if not m:
        raise ValueError(
            f"Date filter must be YYYY or YYYYMM (got {s!r})"
        )
    return int(m.group(1) + m.group(2))


def doc_yyyymm(doc: dict) -> int:
    """Convert a document's date field to a comparable YYYYMM int.

    For Annual Reports, Stockscans returns just 'YYYY'. By the Indian
    convention used in equity research, AR "2025" represents FY25 — the
    fiscal year that ended on 31-Mar-2025. We therefore anchor it at
    YYYY03 (Mar-end) so date-range filters behave intuitively:

      --start-date 202404 --end-date 202503   ("FY25 in full")
        → AR "2025" anchored at 202503 → INCLUDED  ✓
        → AR "2024" anchored at 202403 → EXCLUDED ✓ (it's FY24)

    A handful of Indian listed entities (mostly banks/NBFCs) run on
    Dec FY-ends. For those, the same March anchor is slightly off but
    the practical impact is small — a quarter at most — and downstream
    code can always cross-check `documentType == "Annual Report"`
    against `date` directly via the manifest.

    Other types use 'YYYYMM' (quarter-end month) verbatim.
    """
    date_raw = str(doc.get("date", "")).strip()
    if re.fullmatch(r"\d{4}", date_raw):
        return int(date_raw + "03")  # Indian FY-end anchor
    if re.fullmatch(r"\d{6}", date_raw):
        return int(date_raw)
    # Anything weird → push to the end so it doesn't accidentally pass filters.
    return 999912


def filter_documents(
    docs: list[dict],
    types: list[str] | None = None,
    start: int | None = None,
    end: int | None = None,
    last_n: int | None = None,
) -> list[dict]:
    """Apply type and date filters; optionally keep only the N most recent.

    `start` and `end` are inclusive YYYYMM ints. For YYYY-only inputs the
    caller should expand them (e.g. start='2024' → 202401, end='2024' → 202412).
    """
    out = docs

    # Filter by type
    if types:
        canonical = {normalise_type(t) for t in types}
        out = [d for d in out if d.get("documentType") in canonical]

    # Filter by date range
    if start is not None or end is not None:
        s = start if start is not None else 0
        e = end if end is not None else 999912
        out = [d for d in out if s <= doc_yyyymm(d) <= e]

    # Sort newest first
    out = sorted(out, key=doc_yyyymm, reverse=True)

    # Keep only N most recent (per type if multiple types) so a request like
    # "last 4 transcripts" still works when other types are also matched.
    if last_n is not None and last_n > 0:
        if types and len(types) > 1:
            kept: list[dict] = []
            counts: dict[str, int] = {}
            for d in out:
                t = d["documentType"]
                if counts.get(t, 0) < last_n:
                    kept.append(d)
                    counts[t] = counts.get(t, 0) + 1
            out = kept
        else:
            out = out[:last_n]

    return out


# ---------------------------------------------------------------------------
# Download
# ---------------------------------------------------------------------------
def safe_ticker(ticker: str) -> str:
    """Turn 'NSE:BSE' into 'NSE_BSE' for use in filenames."""
    return re.sub(r"[^A-Za-z0-9]+", "_", ticker)


def build_filename(ticker: str, doc: dict) -> str:
    """Construct a human-readable filename for a downloaded document."""
    t = doc["documentType"].replace(" ", "")
    date_raw = str(doc.get("date", "unknown"))
    return f"{safe_ticker(ticker)}_{t}_{date_raw}.pdf"


def download_one(
    ss_url: str,
    dest: Path,
    timeout: int = 60,
    retries: int = 2,
) -> int:
    """Download a single PDF from S3. Returns bytes written."""
    url = S3_BASE + ss_url
    last_err: Exception | None = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "user-agent": (
                        "Mozilla/5.0 (compatible; StockDocumentsFetcher/1.0)"
                    ),
                },
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = resp.read()
            dest.write_bytes(data)
            return len(data)
        except Exception as exc:
            last_err = exc
            if attempt < retries:
                time.sleep(1 + attempt)  # tiny back-off
    raise RuntimeError(f"Failed to download {url}: {last_err}")


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------
def write_manifest(
    output_dir: Path,
    ticker: str,
    fetched: list[dict],
    skipped: list[dict],
) -> Path:
    """Write a manifest.json so downstream skills can iterate without
    re-querying the API.

    Schema:
        {
          "ticker": "NSE:BSE",
          "fetched_at": "2026-05-05T17:00:00+00:00",
          "documents": [
            {"documentType": "Transcript", "date": "202509",
             "filename": "NSE_BSE_Transcript_202509.pdf",
             "path": "/abs/path/to/file.pdf",
             "size_bytes": 412339,
             "ssUrl": "...", "hasNotes": false}
          ],
          "skipped": [...]
        }
    """
    manifest = {
        "ticker": ticker,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "documents": fetched,
        "skipped": skipped,
    }
    path = output_dir / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2))
    return path


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _expand_date_args(args: argparse.Namespace) -> tuple[int | None, int | None]:
    """Resolve --start-date / --end-date / --year into (start, end) YYYYMM.

    --year YYYY is shorthand for --start-date YYYY01 --end-date YYYY12.
    YYYY-only --start-date pads to YYYY01, YYYY-only --end-date pads to YYYY12.
    """
    start = end = None

    if args.year:
        if not re.fullmatch(r"\d{4}", args.year):
            raise ValueError("--year must be YYYY")
        return int(args.year + "01"), int(args.year + "12")

    if args.start_date:
        raw = args.start_date.strip()
        if re.fullmatch(r"\d{4}", raw):
            start = int(raw + "01")
        else:
            start = parse_date_filter(raw)

    if args.end_date:
        raw = args.end_date.strip()
        if re.fullmatch(r"\d{4}", raw):
            end = int(raw + "12")
        else:
            end = parse_date_filter(raw)

    return start, end


def main() -> int:
    p = argparse.ArgumentParser(
        description="Fetch standardised company documents from Stockscans.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
Examples:
  # Last 4 quarterly transcripts for BSE Ltd
  fetch_documents.py NSE:BSE -t Transcript --last-n 4 -o ./bse_docs

  # All annual reports for FY21–FY25
  fetch_documents.py NSE:BSE -t "Annual Report" --start-date 2021 --end-date 2025

  # Multiple types, FY26 to date
  fetch_documents.py NSE:BSE -t Transcript PPT Result --start-date 202504

  # List only (don't download) — useful for previewing what will be fetched
  fetch_documents.py NSE:BSE --list-only
""",
    )
    p.add_argument("ticker", help="Ticker in NSE:SYMBOL or BSE:SYMBOL form")
    p.add_argument(
        "-t", "--types", nargs="+",
        help="One or more document types (or aliases). "
             "Canonical: 'Annual Report', PPT, Result, Transcript",
    )
    p.add_argument(
        "--start-date",
        help="Inclusive lower bound. YYYY (Jan if start) or YYYYMM",
    )
    p.add_argument(
        "--end-date",
        help="Inclusive upper bound. YYYY (Dec if end) or YYYYMM",
    )
    p.add_argument(
        "--year",
        help="Shorthand: filter to a single calendar year (YYYY)",
    )
    p.add_argument(
        "--last-n", type=int,
        help="Keep only the N most recent matches (per type if multiple)",
    )
    p.add_argument(
        "-o", "--output-dir", default="./stock_documents",
        help="Where to save PDFs and manifest.json (default ./stock_documents)",
    )
    p.add_argument(
        "--authtoken-file",
        help="Path to a file containing the Stockscans authtoken",
    )
    p.add_argument(
        "--list-only", action="store_true",
        help="Print matched documents but do not download",
    )
    p.add_argument(
        "--manifest-only", action="store_true",
        help="Print manifest JSON to stdout instead of downloading",
    )
    args = p.parse_args()

    # ----- auth -----
    try:
        token = load_authtoken(args.authtoken_file)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    expiry, days = check_token_expiry(token)
    if expiry is not None:
        if days is not None and days < 0:
            print(
                f"ERROR: authtoken expired on {expiry.isoformat()}. "
                "Refresh it from stockscans.in (browser cookie) and update "
                "the project file.",
                file=sys.stderr,
            )
            return 2
        if days is not None and days <= 7:
            print(
                f"WARNING: authtoken expires in {days} day(s) "
                f"({expiry.isoformat()}). Refresh it soon.",
                file=sys.stderr,
            )

    # ----- date range -----
    try:
        start, end = _expand_date_args(args)
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    # ----- API call -----
    try:
        all_docs = fetch_documents_list(args.ticker, token)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            print(
                f"ERROR: API returned {e.code}. Authtoken is likely "
                "invalid/expired — refresh it.",
                file=sys.stderr,
            )
            return 2
        print(f"ERROR: HTTP {e.code} from documents API: {e.reason}", file=sys.stderr)
        return 2
    except Exception as e:
        print(f"ERROR: failed to call documents API: {e}", file=sys.stderr)
        return 2

    if not all_docs:
        print(
            f"NOTE: API returned no documents for {args.ticker}. "
            "Verify the ticker exists on Stockscans (e.g. NSE:BSE, BSE:500325).",
            file=sys.stderr,
        )

    # ----- filter -----
    try:
        matched = filter_documents(
            all_docs,
            types=args.types,
            start=start,
            end=end,
            last_n=args.last_n,
        )
    except ValueError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    # ----- list-only / manifest-only -----
    if args.list_only:
        print(f"Matched {len(matched)} of {len(all_docs)} documents:")
        for d in matched:
            print(
                f"  {d['date']:>8}  {d['documentType']:<14}  "
                f"{S3_BASE + d['ssUrl']}"
            )
        return 0

    # ----- download -----
    out_dir = Path(args.output_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    fetched: list[dict] = []
    skipped: list[dict] = []

    for d in matched:
        ss_url = d.get("ssUrl")
        if not ss_url:
            skipped.append({**d, "reason": "missing ssUrl"})
            continue
        fname = build_filename(args.ticker, d)
        dest = out_dir / fname
        if dest.exists() and dest.stat().st_size > 0:
            # idempotent re-runs: skip if already present
            fetched.append({
                **d,
                "filename": fname,
                "path": str(dest),
                "size_bytes": dest.stat().st_size,
                "cached": True,
            })
            print(f"SKIP (cached) {fname}", file=sys.stderr)
            continue
        try:
            n = download_one(ss_url, dest)
            fetched.append({
                **d,
                "filename": fname,
                "path": str(dest),
                "size_bytes": n,
                "cached": False,
            })
            print(f"OK  {fname}  ({n:,} bytes)", file=sys.stderr)
        except Exception as e:
            skipped.append({**d, "reason": str(e)})
            print(f"FAIL {fname}: {e}", file=sys.stderr)

    manifest_path = write_manifest(out_dir, args.ticker, fetched, skipped)

    if args.manifest_only:
        print(manifest_path.read_text())
    else:
        print(
            f"\nDone. {len(fetched)} fetched, {len(skipped)} skipped. "
            f"Manifest: {manifest_path}",
            file=sys.stderr,
        )

    return 0 if not skipped else 1


if __name__ == "__main__":
    sys.exit(main())
