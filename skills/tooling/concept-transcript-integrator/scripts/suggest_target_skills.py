#!/usr/bin/env python3
"""
suggest_target_skills.py — Extraction pass, candidate target-skill lookup.

Deterministic keyword overlap between a concept's search terms and every
skill's aliases/description in skills/registry.json. Produces a RANKED
CANDIDATE LIST only — this script never decides which skills actually get
edited. Per this skill's SKILL.md, the candidate list is always shown to the
user for confirmation before any target skill file is touched (human-in-the-
loop selection, mirroring how the sector-valuation-KPI and J-Curve
integrations were actually done in this project: the user named or confirmed
the target skill each time).

Pure string matching — no reasoning — per conventions.md rule 17.

Usage:
    python3 suggest_target_skills.py --keywords "valuation,DCF,P/E" \
      --registry /path/to/stockmarket/skills/registry.json

Output: JSON array, sorted by score descending:
  [{skill, score, matchedOn: [...terms], skill_md, description}]
score = count of distinct keyword terms that appear (substring, case-
insensitive) in the skill's aliases[] or the registry `_note`/description
fields available for that skill in registry.json.
"""
import argparse
import json


def normalize(s):
    return (s or "").strip().lower()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", required=True, help="path to skills/registry.json")
    ap.add_argument("--keywords", required=True, help="comma-separated concept keywords")
    args = ap.parse_args()

    with open(args.registry, "r", encoding="utf-8") as f:
        reg = json.load(f)

    terms = [normalize(k) for k in args.keywords.split(",") if k.strip()]
    skills = reg.get("skills", {})

    results = []
    for name, entry in skills.items():
        haystack_parts = [name.replace("-", " ")]
        haystack_parts.extend(entry.get("aliases", []) or [])
        # registry.json entries don't carry a description field directly in
        # every version seen so far; include whatever text fields exist.
        for k in ("description", "_note"):
            if entry.get(k):
                haystack_parts.append(entry[k])
        haystack = normalize(" ".join(haystack_parts))

        matched = [t for t in terms if t in haystack]
        if not matched:
            continue

        results.append(
            {
                "skill": name,
                "score": len(matched),
                "matchedOn": matched,
                "skill_md": entry.get("skill_md"),
            }
        )

    results.sort(key=lambda r: (-r["score"], r["skill"]))
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
