#!/usr/bin/env python3
"""
kb_cite.py -- resolve short knowledge-unit citations (`kb:<8-hex suffix>`) to the unit's statement,
author/source, date and source URL, so a skill's reference file can cite the expert KB compactly and a
report can still print a verifiable citation. Zero-LLM, read-only.

  python3 skills/_shared/kb_cite.py fdb27c81 a1b1fc44          # or: yarn kb:cite fdb27c81 a1b1fc44
  python3 skills/_shared/kb_cite.py --file skills/_shared/earnings-forecast-method.md   # every kb:xxxx in a file
  python3 skills/_shared/kb_cite.py --search "transformer margin" [--topic pead] [--top 12]
                                                                # keyword lookup, adopted+active units, newest first
  ... --json                                                    # machine-readable

A suffix can match several ids (the learn-and-automate pipeline files one unit under several topic
prefixes); the first active, adopted match wins and the others are listed as `alsoIds`. Superseded
units are reported with their status so a caller never cites a stale view as current (conventions §28).
"""
import argparse
import json
import os
import re

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
KB_FILE = os.path.join(REPO, "data", "knowledge-units.json")
SUFFIX_RE = re.compile(r"kb:([0-9a-f]{8})")


def load_units(path=KB_FILE):
    with open(path, encoding="utf-8") as f:
        d = json.load(f)
    recs = d.values() if isinstance(d, dict) else d
    return [r for r in recs if isinstance(r, dict) and r.get("type") == "kb-unit"]


def _rank(u):
    # prefer active > adopted > has citation url
    return (
        u.get("status", "active") != "active",
        u.get("userStance") != "adopt",
        not (u.get("citations") or [{}])[0].get("url"),
    )


def resolve(suffixes, units):
    out = []
    for s in suffixes:
        hits = sorted([u for u in units if u["id"].endswith(s)], key=_rank)
        if not hits:
            out.append({"suffix": s, "found": False})
            continue
        u = hits[0]
        c = (u.get("citations") or [{}])[0]
        out.append(
            {
                "suffix": s,
                "found": True,
                "id": u["id"],
                "alsoIds": [h["id"] for h in hits[1:]],
                "source": u.get("sourceKey"),
                "statement": u.get("statement"),
                "verbatim": c.get("verbatim") or u.get("verbatim"),
                "date": c.get("date") or u.get("lastSeen") or None,
                "url": c.get("url"),
                "status": u.get("status", "active"),
                "userStance": u.get("userStance"),
            }
        )
    return out


def search(terms, units, topic=None, top=12):
    """All-terms keyword match over statement+conditions of active, adopted (or unreviewed) units;
    newest first (conventions §28: newest view wins). Returns resolve()-shaped rows."""
    words = [w.lower() for w in re.findall(r"[A-Za-z0-9&+-]{3,}", terms)]
    hits = []
    for u in units:
        if u.get("status", "active") != "active" or u.get("userStance") == "reject":
            continue
        if topic and not str(u.get("topic") or "").startswith(topic):
            continue
        text = f"{u.get('statement') or ''} {u.get('conditions') or ''}".lower()
        if all(w in text for w in words):
            hits.append(u)
    seen, rows = set(), []
    for u in sorted(hits, key=lambda x: str((x.get("citations") or [{}])[0].get("date") or x.get("lastSeen") or ""), reverse=True):
        suf = u["id"][-8:]
        if suf in seen:
            continue
        seen.add(suf)
        rows.append(suf)
    return resolve(rows[:top], units)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("suffixes", nargs="*")
    ap.add_argument("--search", help="keyword lookup (all words must match)")
    ap.add_argument("--topic", help="restrict --search to a topic prefix (pead, filings, macro, valuation, sector, jcurve...)")
    ap.add_argument("--top", type=int, default=12)
    ap.add_argument("--file", help="extract every kb:<suffix> from this file")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    sufs = list(a.suffixes)
    if a.file:
        with open(a.file, encoding="utf-8") as f:
            sufs += SUFFIX_RE.findall(f.read())
    sufs = list(dict.fromkeys(s.lower() for s in sufs))
    units = load_units()
    res = search(a.search, units, a.topic, a.top) if a.search else resolve(sufs, units)
    if a.json:
        print(json.dumps(res, indent=1, ensure_ascii=False))
        return
    for r in res:
        if not r["found"]:
            print(f"kb:{r['suffix']}  NOT FOUND")
            continue
        flag = "" if r["status"] == "active" else f"  [{r['status']}]"
        print(f"kb:{r['suffix']}  {r['source']}  {r['date'] or 'undated'}{flag}\n  {r['statement']}\n  {r['url'] or ''}")


if __name__ == "__main__":
    main()
