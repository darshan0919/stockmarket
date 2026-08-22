#!/usr/bin/env python3
"""
concat_transcripts.py — Extraction pass, step 2.

Given the JSON array produced by find_concept_lessons.py (piped in via
--matches-file, or stdin), reads each matched lesson's full body file
(data/learnyst-lessons/<id>.json) and concatenates their transcriptPlain
text into ONE ordered .txt file with clear delimiters, ready to hand to a
subagent for digestion. This is the same "stage → concatenate → dispatch"
pattern used manually three times earlier in this project's work (sector
valuation KPIs, "Valuation"-keyword lessons, and the 8 J-Curve/growth
catalyst lessons) — codified here as a script instead of ad-hoc shell/python
each time.

Pure file I/O — no reasoning — per conventions.md rule 17.

Usage:
    python3 find_concept_lessons.py --keywords "valuation" --data-root ../../data \
      | python3 concat_transcripts.py --data-root ../../data --out /tmp/valuation_transcripts.txt

Skips (with a note printed to stderr, not a hard failure) any matched lesson
whose body file is missing on disk (not yet fetched) or whose lessonType != 1
(no transcript to concatenate — quiz/article). Prints a JSON summary to
stdout: {included: [...ids], skipped: [{id, reason}], outPath, totalChars}.
"""
import argparse
import json
import os
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", required=True, help="path to <repo>/data")
    ap.add_argument("--matches-file", default=None, help="path to a JSON file (output of find_concept_lessons.py); omit to read from stdin")
    ap.add_argument("--out", required=True, help="output .txt path")
    args = ap.parse_args()

    if args.matches_file:
        with open(args.matches_file, "r", encoding="utf-8") as f:
            matches = json.load(f)
    else:
        matches = json.load(sys.stdin)

    included = []
    skipped = []
    chunks = []

    for rec in matches:
        if not rec.get("hasTranscript", rec.get("lessonType") == 1):
            skipped.append({"id": rec["id"], "reason": "lessonType != 1 (no transcript, e.g. quiz/article)"})
            continue

        body_rel = rec.get("body")
        if not body_rel:
            skipped.append({"id": rec["id"], "reason": "no 'body' path on index record"})
            continue

        body_path = os.path.join(args.data_root, body_rel)
        if not os.path.exists(body_path):
            skipped.append({"id": rec["id"], "reason": f"body file not found at {body_path} (not yet fetched — consider a learnyst-transcript-refresh run)"})
            continue

        with open(body_path, "r", encoding="utf-8") as f:
            body = json.load(f)

        text = body.get("transcriptPlain")
        if not text:
            skipped.append({"id": rec["id"], "reason": "transcriptPlain empty/null on body file (possible upstream Learnyst transcript-shape issue — see docs/learnyst-api-schemas.md 'Unconfirmed' note)"})
            continue

        chunks.append(
            "====\n"
            f"COURSE: {rec.get('courseTitle')}\n"
            f"LESSON: {rec.get('lessonTitle')}\n"
            f"LESSON_ID: {rec.get('lessonId')}\n"
            f"DURATION_SECONDS: {rec.get('durationSeconds')}\n"
            "====\n\n"
            f"{text}\n"
        )
        included.append(rec["id"])

    full_text = "\n\n".join(chunks)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(full_text)

    summary = {
        "included": included,
        "skipped": skipped,
        "outPath": args.out,
        "totalChars": len(full_text),
    }
    print(json.dumps(summary, indent=2))
    if skipped:
        print(f"NOTE: {len(skipped)} matched lesson(s) skipped — see 'skipped' in the JSON above.", file=sys.stderr)


if __name__ == "__main__":
    main()
