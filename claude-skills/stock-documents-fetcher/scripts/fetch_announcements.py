#!/usr/bin/env python3
"""
fetch_announcements.py — Search & download corporate announcements from
Stockscans for any topic that doesn't fit the four standard documentTypes
(Annual Report / PPT / Result / Transcript).

Examples of where this script is the right tool:
    "any merger announcements?"  "filings about ESOP"  "AGM notice"
    "credit rating update"  "buyback related disclosures"
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

# Reuse plumbing from the documents script
sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_documents import (  # noqa: E402
    S3_BASE,
    build_filename,
    check_token_expiry,
    download_one,
    load_authtoken,
    safe_ticker,
)

ANNOUNCEMENTS_API = "https://www.stockscans.in/api/company/announcements"

# Page size returned by the API. Don't rely on the response field; treat
# this as informational and cap our own pagination loop using --max-pages.
API_PAGE_SIZE = 30


# ---------------------------------------------------------------------------
# API call
# ---------------------------------------------------------------------------
def fetch_announcements_page(
    ticker: str, offset: int, token: str, timeout: int = 30
) -> list[dict]:
    """POST one page of announcements. Returns the raw list (may be empty)."""
    body = json.dumps({"companyIds": [ticker], "offset": offset}).encode("utf-8")
    req = urllib.request.Request(
        ANNOUNCEMENTS_API,
        data=body,
        method="POST",
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "cookie": f"authtoken={token}",
            "origin": "https://www.stockscans.in",
            "referer": (
                "https://www.stockscans.in/company/"
                + urllib_quote(ticker)
            ),
            "user-agent": (
                "Mozilla/5.0 (compatible; StockDocumentsFetcher/1.0)"
            ),
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data.get("companyAnnouncements", [])


def urllib_quote(s: str) -> str:
    import urllib.parse
    return urllib.parse.quote(s, safe="")


def iter_announcements(
    ticker: str,
    token: str,
    max_pages: int = 5,
    stop_before: str | None = None,
) -> Iterable[dict]:
    """Yield announcements newest-first across paginated calls.

    Stops when:
      - max_pages reached, OR
      - a page returns < API_PAGE_SIZE rows (we've hit the tail), OR
      - any announcement has date < stop_before (YYYY-MM-DD).
    """
    for page in range(max_pages):
        offset = page * API_PAGE_SIZE
        try:
            rows = fetch_announcements_page(ticker, offset, token)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise RuntimeError(
                    f"authtoken rejected (HTTP {e.code}); refresh it"
                ) from e
            raise
        if not rows:
            return
        for r in rows:
            if stop_before and r.get("date", "") < stop_before:
                return
            yield r
        if len(rows) < API_PAGE_SIZE:
            return
        time.sleep(0.2)  # be polite between paginated calls


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------
def matches_query(ann: dict, patterns: list[re.Pattern]) -> bool:
    """True if every regex pattern (AND logic) matches the title or description.

    Multiple --search terms are combined as AND so users can narrow further.
    For OR logic, a single regex with `|` works.
    """
    haystack = " ".join([
        str(ann.get("title", "")),
        str(ann.get("description", "")),
    ])
    return all(p.search(haystack) for p in patterns)


def in_date_range(ann: dict, start: str | None, end: str | None) -> bool:
    """Inclusive YYYY-MM-DD bounds against ann['date']."""
    d = ann.get("date", "")
    if start and d < start:
        return False
    if end and d > end:
        return False
    return True


# ---------------------------------------------------------------------------
# Filename
# ---------------------------------------------------------------------------
def announcement_filename(ticker: str, ann: dict) -> str:
    """e.g. NSE_BSE_announcement_2026-04-23_Amalgamation.pdf"""
    date = ann.get("date", "unknown")
    title = re.sub(r"[^A-Za-z0-9]+", "_", str(ann.get("title", "")))[:40].strip("_")
    return f"{safe_ticker(ticker)}_announcement_{date}_{title}.pdf"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> int:
    p = argparse.ArgumentParser(
        description="Search corporate announcements on Stockscans.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""\
Examples:
  # Anything mentioning 'merger' in the last ~3 pages of announcements
  fetch_announcements.py NSE:BSE --search merger -o ./bse_ann

  # AND search: 'rating' AND 'CRISIL' (multiple --search terms = AND)
  fetch_announcements.py NSE:BSE --search rating --search CRISIL

  # OR search via single regex
  fetch_announcements.py NSE:BSE --search 'buyback|dividend'

  # Time-bound search
  fetch_announcements.py NSE:BSE --search AGM \\
       --start 2025-01-01 --end 2025-12-31 --max-pages 20

  # Just list, don't download
  fetch_announcements.py NSE:BSE --search ESOP --list-only
""",
    )
    p.add_argument("ticker", help="Ticker like NSE:BSE")
    p.add_argument(
        "--search", action="append", default=[],
        help="Regex (case-insensitive) to match in title/description. "
             "Repeat for AND. Omit to fetch everything in the date window.",
    )
    p.add_argument("--start", help="YYYY-MM-DD inclusive lower bound")
    p.add_argument("--end", help="YYYY-MM-DD inclusive upper bound")
    p.add_argument(
        "--max-pages", type=int, default=5,
        help=f"Max API pages to walk ({API_PAGE_SIZE} per page). Default 5.",
    )
    p.add_argument(
        "--max-results", type=int, default=50,
        help="Stop after this many matches are downloaded. Default 50.",
    )
    p.add_argument(
        "-o", "--output-dir", default="./stock_announcements",
        help="Where to save PDFs and manifest.json",
    )
    p.add_argument("--authtoken-file", help="Path to authtoken file")
    p.add_argument("--list-only", action="store_true", help="Don't download")
    args = p.parse_args()

    # auth
    try:
        token = load_authtoken(args.authtoken_file)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    expiry, days = check_token_expiry(token)
    if expiry and days is not None and days < 0:
        print(
            f"ERROR: authtoken expired on {expiry.isoformat()}",
            file=sys.stderr,
        )
        return 2
    if days is not None and 0 <= days <= 7:
        print(
            f"WARNING: authtoken expires in {days} day(s)",
            file=sys.stderr,
        )

    # compile regex patterns
    try:
        patterns = [re.compile(s, re.IGNORECASE) for s in args.search]
    except re.error as e:
        print(f"ERROR: invalid --search regex: {e}", file=sys.stderr)
        return 2

    # walk pages
    matched: list[dict] = []
    seen = 0
    try:
        for ann in iter_announcements(
            args.ticker,
            token,
            max_pages=args.max_pages,
            stop_before=args.start,
        ):
            seen += 1
            if not in_date_range(ann, args.start, args.end):
                continue
            if patterns and not matches_query(ann, patterns):
                continue
            matched.append(ann)
            if len(matched) >= args.max_results:
                break
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2

    print(
        f"Scanned {seen} announcements, matched {len(matched)}",
        file=sys.stderr,
    )

    if args.list_only:
        for a in matched:
            print(f"  {a['date']}  {a['title']!r:<45}  {S3_BASE + a['ssUrl'] if a.get('ssUrl') else '(no PDF)'}")
        return 0

    # download
    out_dir = Path(args.output_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    fetched: list[dict] = []
    skipped: list[dict] = []

    for ann in matched:
        ss = ann.get("ssUrl")
        if not ss:
            skipped.append({**ann, "reason": "no PDF attached"})
            continue
        fname = announcement_filename(args.ticker, ann)
        dest = out_dir / fname
        if dest.exists() and dest.stat().st_size > 0:
            fetched.append({
                **ann, "filename": fname, "path": str(dest),
                "size_bytes": dest.stat().st_size, "cached": True,
            })
            continue
        try:
            n = download_one(ss, dest)
            fetched.append({
                **ann, "filename": fname, "path": str(dest),
                "size_bytes": n, "cached": False,
            })
            print(f"OK  {fname}", file=sys.stderr)
        except Exception as e:
            skipped.append({**ann, "reason": str(e)})

    # manifest
    manifest = {
        "ticker": args.ticker,
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "search": args.search,
        "start": args.start,
        "end": args.end,
        "announcements": fetched,
        "skipped": skipped,
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    print(
        f"Done. {len(fetched)} fetched, {len(skipped)} skipped. "
        f"Manifest: {out_dir/'manifest.json'}",
        file=sys.stderr,
    )
    return 0 if not skipped else 1


if __name__ == "__main__":
    sys.exit(main())
