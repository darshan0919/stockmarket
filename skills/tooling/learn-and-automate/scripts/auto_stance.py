#!/usr/bin/env python3
"""Provisional auto-stances for kb-units the user cannot review one by one (zero LLM).
Policy (Darshan, 2026-10-10): decide by author rank and recency/confidence.
  rank: SOIC teaching (learnyst:/youtube:) 0 > sureshkbn 1 > ishmohit1 2 > shashank1171 3 > thechartist26 4  (teaching rank 0 is an assumption)
  adopt  = explicit, own-words (not repost), dated within --recent-days (teaching is undated -> treated as recent)
  unsure = inferred / repost-tier / older than --recent-days / on the lower-ranked side of a listed conflict
  'pick' (case) units are left unreviewed. Existing non-null stances are never touched.
Every patch carries userNote 'auto:<reason>' and stanceBy 'auto-author-rank' so it is visibly provisional.
Usage: auto_stance.py [--recent-days 730] [--conflicts file.json] [--out patch.jsonl] -> then persist.js --patch --file patch.jsonl"""
import argparse, json, datetime, pathlib
ap = argparse.ArgumentParser()
ap.add_argument("--recent-days", type=int, default=730)
ap.add_argument("--conflicts", default=None, help='json {"<8hex unit id suffix>": "reason"} lower-ranked conflict sides -> unsure')
ap.add_argument("--out", required=True)
a = ap.parse_args()
RANK = {"sureshkbn": 1, "ishmohit1": 2, "shashank1171": 3, "thechartist26": 4}
conf = json.load(open(a.conflicts)) if a.conflicts else {}
today = datetime.date(2026, 10, 10)
d = json.load(open("data/knowledge-units.json"))
recs = d if isinstance(d, list) else d.get("records") or d.get("items") or list(d.values())
n = {"adopt": 0, "unsure": 0, "skipped": 0}
with open(a.out, "w") as o:
    for r in recs:
        if not isinstance(r, dict) or r.get("type") != "kb-unit" or r.get("userStance") or r.get("kind") == "pick":
            n["skipped"] += 1; continue
        sk = r.get("sourceKey", "")
        if sk.startswith("x:"):
            h = sk[2:]; rank = RANK.get(h, 5)
        else:
            h, rank = sk.split(":")[0], 0
        dates = [c.get("date") for c in r.get("citations", []) if c.get("date")]
        newest = max(dates) if dates else None
        why = f"rank{rank}:{h}"
        stance = "adopt"
        if r.get("explicitness") == "inferred" or r.get("sourceTier") == 3:
            stance, why = "unsure", why + ",inferred/repost"
        elif newest and (today - datetime.date.fromisoformat(newest[:10])).days > a.recent_days:
            stance, why = "unsure", why + f",older-than-{a.recent_days}d({newest[:7]})"
        else:
            why += f",recent({newest[:7] if newest else 'undated-teaching'})"
        if r["id"][-8:] in conf:
            stance, why = "unsure", why + ",conflict:" + conf[r["id"][-8:]]
        n[stance] += 1
        o.write(json.dumps({"id": r["id"], "type": "kb-unit", "sourceKey": sk, "userStance": stance, "userNote": "auto:" + why, "stanceBy": "auto-author-rank"}) + "\n")
print(json.dumps(n))
