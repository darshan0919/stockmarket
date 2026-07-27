#!/usr/bin/env python3
"""
Step 1 helper (deterministic, no LLM) for forward-guidance-extractor.

Consumes the JSON array printed by:
    node stock-api/bin/get-latest-concall-transcript.js --bulk '[{"ticker":...,"quarter":...}, ...]'

and buckets each company into:
  - available:  transcript is in our DB right now (status db-hit/saved) -> safe to
                extract guidance from without any further fetch.
  - fetchable:  transcript is NOT in DB yet but Stockscans has the official filing
                (status official-transcript-exists) -> the skill should download +
                save it (see SKILL.md Phase 1) before extraction, still counts as
                "available" for the run once that happens.
  - missing:    nothing usable exists yet (results-not-out / needs-recording-pipeline)
                -> goes straight to the "Missing Transcripts" list, no extraction.

Usage:
    node stock-api/bin/get-latest-concall-transcript.js --bulk '[...]' \
        | python3 classify_transcript_status.py

    # or from a saved file:
    python3 classify_transcript_status.py --file bulk_result.json
"""
import argparse
import json
import sys


def classify(records):
    available, fetchable, missing = [], [], []
    for r in records:
        status = r.get("status")
        entry = {"ticker": r.get("ticker"), "quarter": r.get("quarter")}
        if status in ("db-hit", "saved"):
            entry["id"] = r.get("id")
            available.append(entry)
        elif status == "official-transcript-exists":
            entry["document"] = r.get("document")
            fetchable.append(entry)
        elif status == "results-not-out":
            entry["reason"] = "results not out yet for this quarter"
            missing.append(entry)
        elif status == "needs-recording-pipeline":
            entry["reason"] = "no official transcript filed; only an unprocessed recording exists"
            entry["recording"] = r.get("recording")
            missing.append(entry)
        else:
            entry["reason"] = f"unrecognized status: {status}"
            missing.append(entry)
    return {"available": available, "fetchable": fetchable, "missing": missing}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="path to bulk JSON output; defaults to stdin")
    args = ap.parse_args()
    raw = open(args.file).read() if args.file else sys.stdin.read()
    records = json.loads(raw)
    if isinstance(records, dict):
        records = [records]
    print(json.dumps(classify(records), indent=2))


if __name__ == "__main__":
    main()
