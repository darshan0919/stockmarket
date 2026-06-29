#!/usr/bin/env python3
"""
fetch_and_extract.py — Announcement Keyword Explorer (heavy-lifting script)

Pipeline:
  1. Compute the last 4 quarter-end dates in YYYYMM format (03,06,09,12)
  2. POST to the Stockscans announcement-scan API for each quarter with the
     user-supplied keyword as searchFilters
  3. Collect all titles + descriptions from the responses
  4. Compute unigram + bigram frequency tables for both fields
  5. Emit a structured JSON payload to stdout for the prompt to reason about

Usage:
  python fetch_and_extract.py --keyword "Deduction Of Tax At Source On Dividend"
  python fetch_and_extract.py --keyword "buyback" --min-mcap 500
  python fetch_and_extract.py --keyword "merger" --quarters 6

Output (stdout): JSON with:
  {
    "keyword": <str>,
    "quarters_fetched": [<YYYYMM>, ...],
    "total_announcements": <int>,
    "per_quarter": { "YYYYMM": { "count": N, "sample_titles": [...] }, ... },
    "all_titles": [ ... ],
    "all_descriptions": [ ... ],
    "title_unigrams": { "word": freq, ... },    # top 60
    "title_bigrams":  { "w1 w2": freq, ... },   # top 40
    "desc_unigrams":  { "word": freq, ... },    # top 60
    "desc_bigrams":   { "w1 w2": freq, ... },   # top 40
    "title_candidate_phrases": [ ... ],          # multi-word phrases from titles
    "errors": [ ... ]
  }
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
from collections import Counter
from datetime import date, datetime
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
TOKEN_FALLBACKS = [
    "/mnt/project/Stockscans_authtoken",
    "/mnt/project/stockscans_authtoken",
    "/tmp/catalyst/authtoken.txt",
    "/tmp/pead/authtoken.txt",
    os.path.expanduser("~/.stockscans_authtoken"),
]

def resolve_token(cli_path: str | None) -> str:
    env = os.environ.get("STOCKSCANS_AUTHTOKEN")
    if env:
        return env.strip()
    paths = ([cli_path] if cli_path else []) + TOKEN_FALLBACKS
    for p in paths:
        if p and os.path.exists(p):
            return open(p).read().strip().rstrip(";")
    sys.exit(
        "ERROR: no authtoken found.\n"
        "  Option 1: export STOCKSCANS_AUTHTOKEN=<token>\n"
        "  Option 2: echo <token> > ~/.stockscans_authtoken\n"
        "  Option 3: pass --authtoken-file /path/to/token"
    )


def check_expiry(token: str) -> None:
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
        pass  # non-JWT token formats — ignore


# ---------------------------------------------------------------------------
# Quarter-date arithmetic
# ---------------------------------------------------------------------------
# Stockscans uses end-of-quarter months: 03 (Jan-Mar), 06 (Apr-Jun),
# 09 (Jul-Sep), 12 (Oct-Dec).  Example: "202603" = Q4 FY26 (Jan-Mar 2026).
QUARTER_END_MONTHS = [3, 6, 9, 12]


def last_n_quarter_dates(n: int = 4) -> list[str]:
    """Return last N quarter-end YYYYMM strings, most-recent first."""
    today = date.today()
    # find the most recent completed quarter-end
    # a quarter is "completed" if its end month < today's month
    # or if end month == today's month and day >= last day of month (approx)
    results: list[str] = []
    year = today.year
    # iterate backward through quarter-end months
    month_idx = 3  # start from December (index 3 = month 12)
    # find which quarter we're in / just past
    for qm in sorted(QUARTER_END_MONTHS, reverse=True):
        if qm <= today.month:
            month_idx = QUARTER_END_MONTHS.index(qm)
            break
    else:
        year -= 1
        month_idx = 3  # December of previous year

    while len(results) < n:
        qm = QUARTER_END_MONTHS[month_idx]
        results.append(f"{year:04d}{qm:02d}")
        month_idx -= 1
        if month_idx < 0:
            month_idx = 3
            year -= 1

    return results


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
SCAN_API = "https://www.stockscans.in/api/company/announcements/scan"
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36"
)

DEFAULT_SCAN_ID = "13d3403f48060387bd20fcbc"


def fetch_quarter(
    keyword: str,
    quarter_date: str,
    token: str,
    min_mcap: int = 300,
    max_offset: int = 5,  # 5 pages × ~20 items = up to 100 results per quarter
    timeout: int = 30,
) -> list[dict]:
    """Fetch all announcement-scan results for one quarter + keyword."""
    results: list[dict] = []
    for page in range(max_offset):
        offset = page * 20
        payload = {
            "scan": {
                "scanId": DEFAULT_SCAN_ID,
                "scanName": "Announcement Keyword Explorer",
                "filters": [
                    {"left": "Market Capitalization", "sign": ">=", "right": str(min_mcap)}
                ],
                "industry": [],
                "index": [],
                "watchlistIds": [],
                "searchFilters": [keyword],
                "announcementType": "All",
                "alerts": False,
                "searchMode": "quick",
                "companyIds": [],
                "companyFilters": [],
            },
            "offset": offset,
            "quarterDate": quarter_date,
        }
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            SCAN_API,
            data=body,
            method="POST",
            headers={
                "accept": "application/json",
                "content-type": "application/json",
                "cookie": f"authtoken={token}",
                "origin": "https://www.stockscans.in",
                "referer": "https://www.stockscans.in/announcement-scans",
                "user-agent": UA,
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise RuntimeError(f"authtoken rejected (HTTP {e.code}); refresh it.")
            raise
        except urllib.error.URLError as e:
            raise RuntimeError(f"Network error fetching quarter {quarter_date}: {e}")

        page_items = data if isinstance(data, list) else data.get("announcements", data.get("results", []))
        if not page_items:
            break
        results.extend(page_items)
        if len(page_items) < 20:
            break  # last page
        time.sleep(0.3)

    return results


# ---------------------------------------------------------------------------
# Text processing
# ---------------------------------------------------------------------------
# Stop words — common English + Indian corporate filing noise
STOP_WORDS = {
    "a", "an", "the", "and", "or", "of", "in", "to", "for", "on", "at",
    "by", "is", "are", "was", "were", "be", "been", "has", "have", "had",
    "with", "from", "as", "it", "its", "this", "that", "not", "no", "we",
    "our", "us", "you", "your", "he", "she", "they", "their", "i", "my",
    "company", "ltd", "limited", "pvt", "private", "inc", "pursuant",
    "section", "regulation", "regulations", "under", "sebi", "act",
    "trading", "equity", "shares", "stock", "nse", "bse", "exchange",
    "listing", "listed", "securities", "financial", "year", "quarter",
    "q1", "q2", "q3", "q4", "fy", "per", "s", "r", "re",
}


def tokenize(text: str) -> list[str]:
    """Lowercase alpha-only tokens, strip stop words and short tokens."""
    tokens = re.findall(r"[a-zA-Z]+", text.lower())
    return [t for t in tokens if t not in STOP_WORDS and len(t) > 2]


def extract_ngrams(texts: list[str], top_n: int = 60) -> tuple[dict, dict]:
    """Return (unigram_freq, bigram_freq) sorted by frequency desc."""
    uni: Counter = Counter()
    bi: Counter = Counter()
    for text in texts:
        tokens = tokenize(text)
        uni.update(tokens)
        bi.update(zip(tokens, tokens[1:]))
    unigrams = dict(uni.most_common(top_n))
    bigrams = {f"{a} {b}": c for (a, b), c in bi.most_common(top_n // 2)}
    return unigrams, bigrams


def extract_candidate_phrases(texts: list[str]) -> list[str]:
    """Extract meaningful multi-word phrases using regex on original cased text."""
    # Look for Title Case sequences (likely proper noun phrases in announcements)
    phrase_counter: Counter = Counter()
    title_case_pattern = re.compile(r"\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,5})\b")
    for text in texts:
        for match in title_case_pattern.finditer(text):
            phrase = match.group(1).strip()
            # filter out overly short or noisy phrases
            if len(phrase) > 6 and phrase.lower().split()[0] not in STOP_WORDS:
                phrase_counter[phrase] += 1
    # return phrases seen 2+ times, sorted by freq
    return [p for p, c in phrase_counter.most_common(60) if c >= 2]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fetch announcement-scan results and extract keyword candidates."
    )
    parser.add_argument("--keyword", required=True, help="Search keyword/phrase to scan for")
    parser.add_argument("--quarters", type=int, default=4, help="Number of past quarters to fetch (default 4)")
    parser.add_argument("--min-mcap", type=int, default=300, help="Minimum market cap filter in Cr (default 300)")
    parser.add_argument("--authtoken-file", help="Path to file containing the authtoken")
    parser.add_argument("--output", help="Write JSON to file instead of stdout")
    args = parser.parse_args()

    token = resolve_token(args.authtoken_file)
    check_expiry(token)

    quarter_dates = last_n_quarter_dates(args.quarters)
    print(f"Fetching {args.quarters} quarters: {quarter_dates}", file=sys.stderr)

    all_titles: list[str] = []
    all_descriptions: list[str] = []
    per_quarter: dict[str, Any] = {}
    errors: list[str] = []
    total = 0

    for qd in quarter_dates:
        print(f"  → Quarter {qd}...", file=sys.stderr)
        try:
            items = fetch_quarter(
                keyword=args.keyword,
                quarter_date=qd,
                token=token,
                min_mcap=args.min_mcap,
            )
        except RuntimeError as e:
            errors.append(f"Quarter {qd}: {e}")
            per_quarter[qd] = {"count": 0, "sample_titles": [], "error": str(e)}
            continue

        titles = [str(item.get("title", "")).strip() for item in items if item.get("title")]
        descs  = [str(item.get("description", "")).strip() for item in items if item.get("description")]
        all_titles.extend(titles)
        all_descriptions.extend(descs)
        per_quarter[qd] = {
            "count": len(items),
            "sample_titles": titles[:10],   # first 10 for reference
        }
        total += len(items)
        print(f"     {len(items)} announcements found", file=sys.stderr)
        time.sleep(0.5)

    # ---- N-gram extraction ------------------------------------------------
    title_unigrams, title_bigrams   = extract_ngrams(all_titles, top_n=60)
    desc_unigrams,  desc_bigrams    = extract_ngrams(all_descriptions, top_n=60)
    candidate_phrases               = extract_candidate_phrases(all_titles)

    output = {
        "keyword": args.keyword,
        "quarters_fetched": quarter_dates,
        "total_announcements": total,
        "per_quarter": per_quarter,
        "all_titles": sorted(set(all_titles)),               # deduplicated
        "all_descriptions": sorted(set(all_descriptions)),   # deduplicated
        "title_unigrams": title_unigrams,
        "title_bigrams": title_bigrams,
        "desc_unigrams": desc_unigrams,
        "desc_bigrams": desc_bigrams,
        "title_candidate_phrases": candidate_phrases,
        "errors": errors,
    }

    json_out = json.dumps(output, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(json_out, encoding="utf-8")
        print(f"Output written to {args.output}", file=sys.stderr)
    else:
        print(json_out)

    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
