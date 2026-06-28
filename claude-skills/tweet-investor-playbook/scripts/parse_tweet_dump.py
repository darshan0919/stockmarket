#!/usr/bin/env python3
"""
Format-agnostic tweet dump parser.

Reads a tweet dump (file or directory) in one of several formats and writes a
normalised JSON to stdout (or to --out).

Supported formats (auto-detected by sniffing):
  - Twitter API v2 JSON: {"data": [{id, text, created_at, ...}], "includes": {...}}
  - NDJSON: one tweet object per line
  - CSV: header row with at least a `text` (or `tweet`) column; dates in any reasonable col
  - Raw text: blank-line-separated blocks; each block is one tweet
  - Folder: concatenate all files in the folder

Output schema (one object per tweet):
{
  "id":                 str  | None,
  "date":               str  | None,    # ISO 8601 if parseable
  "author":             str  | None,
  "text":               str,
  "is_reply":           bool,
  "in_reply_to_id":     str  | None,
  "in_reply_to_user":   str  | None,
  "in_reply_to_text":   str  | None,    # resolved if parent is in the dump
  "is_retweet":         bool,
  "quoted_text":        str  | None,
  "like_count":         int  | None,
  "retweet_count":      int  | None,
  "reply_count":        int  | None,
  "source_format":      str            # which parser branch produced this
}

Usage:
    python parse_tweet_dump.py <path> [--out /home/claude/_tweets_normalised.json]
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

DATE_KEYS = ("created_at", "date", "datetime", "timestamp", "created", "time")
TEXT_KEYS = ("text", "full_text", "tweet", "content", "body")
ID_KEYS = ("id", "id_str", "tweet_id", "status_id")
AUTHOR_KEYS = ("author", "user", "username", "screen_name", "handle")
REPLY_ID_KEYS = ("in_reply_to_status_id", "in_reply_to_status_id_str", "in_reply_to_id", "reply_to_id")
REPLY_USER_KEYS = ("in_reply_to_screen_name", "in_reply_to_user", "reply_to_user")
LIKE_KEYS = ("like_count", "favorite_count", "favourite_count", "likes")
RT_KEYS = ("retweet_count", "rt_count", "retweets")
REPLY_COUNT_KEYS = ("reply_count", "replies")


def first(obj: dict, keys: Iterable[str], default=None):
    for k in keys:
        if k in obj and obj[k] not in (None, ""):
            return obj[k]
    return default


def parse_date(s: Any) -> str | None:
    if s is None or s == "":
        return None
    if isinstance(s, (int, float)):
        # epoch
        try:
            return datetime.utcfromtimestamp(s if s < 1e12 else s / 1000).isoformat()
        except Exception:
            return None
    s = str(s).strip()
    # try ISO first
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).isoformat()
    except Exception:
        pass
    # Twitter classic: "Wed Oct 10 20:19:24 +0000 2018"
    for fmt in (
        "%a %b %d %H:%M:%S %z %Y",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y",
        "%m/%d/%Y %H:%M:%S",
        "%m/%d/%Y",
        "%d-%m-%Y",
    ):
        try:
            return datetime.strptime(s, fmt).isoformat()
        except ValueError:
            continue
    return None  # give up; caller keeps raw if needed


def normalise_tweet(raw: dict, source_format: str) -> dict:
    text = first(raw, TEXT_KEYS, "")
    if not text:
        # nothing to work with
        return None
    is_retweet = bool(re.match(r"^RT\s+@", text)) or bool(raw.get("retweeted_status"))
    in_reply_to_id = first(raw, REPLY_ID_KEYS)
    return {
        "id": str(first(raw, ID_KEYS)) if first(raw, ID_KEYS) is not None else None,
        "date": parse_date(first(raw, DATE_KEYS)),
        "author": str(first(raw, AUTHOR_KEYS)) if first(raw, AUTHOR_KEYS) else None,
        "text": str(text),
        "is_reply": in_reply_to_id is not None,
        "in_reply_to_id": str(in_reply_to_id) if in_reply_to_id is not None else None,
        "in_reply_to_user": first(raw, REPLY_USER_KEYS),
        "in_reply_to_text": None,  # resolved later
        "is_retweet": is_retweet,
        "quoted_text": raw.get("quoted_status", {}).get("text") if isinstance(raw.get("quoted_status"), dict) else None,
        "like_count": _int(first(raw, LIKE_KEYS)),
        "retweet_count": _int(first(raw, RT_KEYS)),
        "reply_count": _int(first(raw, REPLY_COUNT_KEYS)),
        "source_format": source_format,
    }


def _int(v):
    if v is None or v == "":
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        try:
            return int(float(v))
        except Exception:
            return None


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------

def parse_api_v2(text: str) -> list[dict]:
    """Twitter API v2 shape: {data: [...], includes: {...}}"""
    obj = json.loads(text)
    if not isinstance(obj, dict) or "data" not in obj:
        return []
    data = obj["data"]
    if not isinstance(data, list):
        data = [data]
    # API v2 uses 'public_metrics' nested
    for t in data:
        if isinstance(t.get("public_metrics"), dict):
            t.setdefault("like_count", t["public_metrics"].get("like_count"))
            t.setdefault("retweet_count", t["public_metrics"].get("retweet_count"))
            t.setdefault("reply_count", t["public_metrics"].get("reply_count"))
        # referenced_tweets: replies have type=replied_to
        refs = t.get("referenced_tweets") or []
        for r in refs:
            if r.get("type") == "replied_to":
                t.setdefault("in_reply_to_status_id", r.get("id"))
    return [n for n in (normalise_tweet(t, "api_v2") for t in data) if n]


def parse_ndjson(text: str) -> list[dict]:
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        n = normalise_tweet(obj, "ndjson")
        if n:
            out.append(n)
    return out


def parse_json_array(text: str) -> list[dict]:
    obj = json.loads(text)
    if isinstance(obj, list):
        return [n for n in (normalise_tweet(t, "json_array") for t in obj if isinstance(t, dict)) if n]
    return []


def parse_csv(text: str) -> list[dict]:
    reader = csv.DictReader(text.splitlines())
    out = []
    for row in reader:
        n = normalise_tweet(row, "csv")
        if n:
            out.append(n)
    return out


def parse_raw_text(text: str) -> list[dict]:
    """Blank-line separated blocks. Each block = one tweet. No metadata."""
    blocks = re.split(r"\n\s*\n", text.strip())
    out = []
    for i, block in enumerate(blocks):
        block = block.strip()
        if not block:
            continue
        # Try to extract a leading date from the block
        date_match = re.match(r"^\s*(\d{4}-\d{2}-\d{2}[T\s\d:.+-]*)", block)
        date = parse_date(date_match.group(1)) if date_match else None
        out.append({
            "id": f"raw_{i}",
            "date": date,
            "author": None,
            "text": block,
            "is_reply": False,
            "in_reply_to_id": None,
            "in_reply_to_user": None,
            "in_reply_to_text": None,
            "is_retweet": False,
            "quoted_text": None,
            "like_count": None,
            "retweet_count": None,
            "reply_count": None,
            "source_format": "raw_text",
        })
    return out


# ---------------------------------------------------------------------------
# Detection + dispatch
# ---------------------------------------------------------------------------

def sniff_and_parse(text: str) -> list[dict]:
    head = text.lstrip()[:512]

    # JSON object
    if head.startswith("{"):
        try:
            obj = json.loads(text)
        except json.JSONDecodeError:
            obj = None
        if isinstance(obj, dict) and "data" in obj:
            return parse_api_v2(text)

    # JSON array
    if head.startswith("["):
        return parse_json_array(text)

    # NDJSON: each non-empty line starts with `{`
    sample_lines = [ln for ln in text.splitlines()[:10] if ln.strip()]
    if sample_lines and all(ln.lstrip().startswith("{") for ln in sample_lines):
        return parse_ndjson(text)

    # CSV: first non-empty line has commas and a header-like word
    if sample_lines:
        first_line = sample_lines[0]
        if "," in first_line and any(k in first_line.lower() for k in TEXT_KEYS + ID_KEYS + DATE_KEYS):
            return parse_csv(text)

    # Fallback
    return parse_raw_text(text)


def parse_path(path: Path) -> list[dict]:
    if path.is_dir():
        all_tweets = []
        for f in sorted(path.iterdir()):
            if f.is_file() and not f.name.startswith("."):
                try:
                    all_tweets.extend(parse_path(f))
                except Exception as e:
                    print(f"[warn] failed to parse {f}: {e}", file=sys.stderr)
        return all_tweets
    text = path.read_text(encoding="utf-8", errors="replace")
    return sniff_and_parse(text)


def resolve_reply_context(tweets: list[dict]) -> list[dict]:
    """Fill in `in_reply_to_text` when the parent is in the dump."""
    by_id = {t["id"]: t for t in tweets if t.get("id")}
    for t in tweets:
        if t["in_reply_to_id"] and t["in_reply_to_id"] in by_id:
            t["in_reply_to_text"] = by_id[t["in_reply_to_id"]]["text"]
    return tweets


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="Normalise a tweet dump.")
    ap.add_argument("path", help="File or directory containing tweet dump")
    ap.add_argument("--out", default="/home/claude/_tweets_normalised.json",
                    help="Output JSON path")
    args = ap.parse_args()

    src = Path(args.path).expanduser().resolve()
    if not src.exists():
        print(f"ERROR: path does not exist: {src}", file=sys.stderr)
        sys.exit(2)

    tweets = parse_path(src)
    if not tweets:
        print("ERROR: no tweets parsed. The format may be unsupported. "
              "Re-export as Twitter API v2 JSON, NDJSON, CSV, or blank-line-separated text.",
              file=sys.stderr)
        sys.exit(3)

    tweets = resolve_reply_context(tweets)

    # Best-effort: sort by date if any dates present
    if any(t.get("date") for t in tweets):
        tweets.sort(key=lambda t: t.get("date") or "")

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(tweets, indent=2, ensure_ascii=False), encoding="utf-8")

    # Quick summary on stderr
    dates = [t["date"] for t in tweets if t.get("date")]
    replies = sum(1 for t in tweets if t["is_reply"])
    retweets = sum(1 for t in tweets if t["is_retweet"])
    summary = {
        "total_tweets": len(tweets),
        "date_range": [min(dates), max(dates)] if dates else None,
        "replies": replies,
        "retweets": retweets,
        "originals": len(tweets) - replies - retweets,
        "author_set": sorted({t["author"] for t in tweets if t.get("author")})[:5],
        "out_path": str(out_path),
    }
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
