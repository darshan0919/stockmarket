#!/usr/bin/env python3
"""
find_concept_lessons.py — Extraction pass for concept-transcript-integrator.

Zero-LLM keyword/substring search over data/learnyst-lessons.json (the slim
index maintained by packages/jobs-runtime/learnystTranscriptRefresh.js).
Matches courseTitle and lessonTitle, case-insensitively, against one or more
keywords/lesson-title fragments.

This is pure lookup/filter logic — no reasoning, no LLM call — per
skills/_shared/conventions.md rule 17 ("Extraction First, Analysis Second").
The digestion of matched transcripts' CONTENT is a separate, later step done
by an Agent subagent (that step is judgment/synthesis and belongs there, not
here).

Usage:
    python3 find_concept_lessons.py --keywords "valuation,DCF" \
        --data-root /path/to/stockmarket/data
    python3 find_concept_lessons.py --lesson-titles "Find J-Curve Exploding Stocks,Fastest Growing Companies" \
        --data-root /path/to/stockmarket/data

Exactly one of --keywords / --lesson-titles must be given.
  --keywords        substring-matches against BOTH courseTitle and lessonTitle
                     (OR across keywords) — use for a broad concept sweep
                     (e.g. "valuation" pulled in every Level 3 lesson plus any
                     lesson elsewhere in the catalog with "Valuation" in its title).
  --lesson-titles   exact (case-insensitive, whitespace-trimmed) OR substring
                     match against lessonTitle only — use when the user already
                     named specific lessons (as in the J-Curve growth-catalyst
                     integration, where 8 exact lesson titles were given).
  --course-title    optional extra filter: only lessons whose courseTitle
                     contains this substring (e.g. "Level 3 How to Value a
                     Company & Portfolio Creation").

Output: JSON array to stdout, one object per matched lesson:
  {id, courseId, courseTitle, sectionId, lessonId, lessonTitle, lessonType,
   durationSeconds, fetchedAt, body}
(the exact slim-index shape already in learnyst-lessons.json — this script
adds nothing, just filters). lessonType != 1 (non-video: quiz=5, article=9)
entries are INCLUDED in the output but flagged with "hasTranscript": false
so the caller can decide whether to skip them (mirrors the job's own
VIDEO_LESSON_TYPE convention — see docs/learnyst-api-schemas.md).

Exit code 0 with an empty JSON array `[]` is a valid "no matches" result —
the caller (SKILL.md Phase 1) is responsible for deciding what to do next
(offer to trigger learnyst-transcript-refresh, or ask the user for more
specific lesson titles), never this script.
"""
import argparse
import json
import os
import sys


def load_index(data_root):
    path = os.path.join(data_root, "learnyst-lessons.json")
    if not os.path.exists(path):
        print(
            json.dumps(
                {
                    "error": f"learnyst-lessons.json not found at {path}. "
                    "Run `yarn learnyst-transcript-refresh` first, or check --data-root."
                }
            ),
            file=sys.stderr,
        )
        sys.exit(1)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def normalize(s):
    return (s or "").strip().lower()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-root", required=True, help="path to <repo>/data")
    ap.add_argument("--keywords", default=None, help="comma-separated substrings, matched against courseTitle OR lessonTitle")
    ap.add_argument("--lesson-titles", default=None, help="comma-separated lesson title substrings, matched against lessonTitle only")
    ap.add_argument("--course-title", default=None, help="optional extra courseTitle substring filter")
    args = ap.parse_args()

    if not args.keywords and not args.lesson_titles:
        print(json.dumps({"error": "must pass --keywords or --lesson-titles"}), file=sys.stderr)
        sys.exit(1)

    index = load_index(args.data_root)

    keyword_terms = [normalize(k) for k in args.keywords.split(",")] if args.keywords else []
    title_terms = [normalize(t) for t in args.lesson_titles.split(",")] if args.lesson_titles else []
    course_filter = normalize(args.course_title) if args.course_title else None

    results = []
    for _id, rec in index.items():
        course_title = normalize(rec.get("courseTitle"))
        lesson_title = normalize(rec.get("lessonTitle"))

        if course_filter and course_filter not in course_title:
            continue

        matched = False
        if keyword_terms:
            matched = any(k in course_title or k in lesson_title for k in keyword_terms)
        if not matched and title_terms:
            matched = any(t in lesson_title for t in title_terms)

        if not matched:
            continue

        out = dict(rec)
        out["hasTranscript"] = rec.get("lessonType") == 1
        results.append(out)

    # Stable order: by courseId then sectionId then lessonId, matching catalog order.
    results.sort(key=lambda r: (str(r.get("courseId")), r.get("sectionId") or 0, r.get("lessonId") or 0))

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
